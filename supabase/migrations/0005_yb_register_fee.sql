-- Yanabee 0005: online registration without an account, the fee checklist.
--
-- 1. yb_register_team(p): anyone (anon or signed in) sends the registration
--    form (competition.txt c-form) and gets a request number (ref_code). The
--    team is created as 'submitted' and waits for the reviewers. A signed-in
--    caller becomes the team's leader at once; otherwise the team has no
--    leader account until someone claims it (yb_claim_team).
-- 2. yb_track_request(ref, phone): request number + the leader's phone show
--    the team's checklist (status, fee, consents, draw group, next date).
--    Counts and statuses only: never a child's name, age or phone.
-- 3. yb_claim_team(ref, phone): a signed-in leader account takes over a team
--    registered online, so the leader manages it from the account page.
-- 4. Fee: teams.fee_status (unpaid / paid / waived) set by the reviewers with
--    yb_set_fee; the team hears about it in the inbox.
-- 5. yb_registration_stats(): public counts for the home page (no names).
--
-- Privacy: the leader's phone, email and the nominee names live in
-- yb_registrations, readable only through yb_registration_detail (reviewers
-- and the team's own leader). Rate limits: per client address and per
-- request number (yb_rate). ASCII only.

-- ---------------------------------------------------------------------------
-- 1. Columns and tables
-- ---------------------------------------------------------------------------
alter table public.teams add column if not exists ref_code    text;
alter table public.teams add column if not exists fee_status  text not null default 'unpaid';
alter table public.teams add column if not exists fee_receipt text;
alter table public.teams add column if not exists fee_at      timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_fee_chk') then
    alter table public.teams add constraint teams_fee_chk check (fee_status in ('unpaid', 'paid', 'waived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_fee_receipt_len') then
    alter table public.teams add constraint teams_fee_receipt_len check (fee_receipt is null or char_length(fee_receipt) <= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_ref_chk') then
    alter table public.teams add constraint teams_ref_chk
      check (ref_code is null or ref_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$');
  end if;
end $$;
create unique index if not exists teams_ref_code_uq on public.teams (ref_code) where ref_code is not null;

-- private registration details (one row per team registered online)
create table if not exists public.yb_registrations (
  team_id     uuid primary key references public.teams (id) on delete cascade,
  phone       text not null,
  phone_key   text not null,
  email       text,
  reciter1    text,
  reciter2    text,
  chess       text,
  coordinator text,
  idea        text,
  created_at  timestamptz not null default now(),
  constraint yb_reg_phone_len check (char_length(phone) <= 30),
  constraint yb_reg_email_len check (email is null or char_length(email) <= 120),
  constraint yb_reg_names_len check (char_length(coalesce(reciter1, '') || coalesce(reciter2, '')
                                        || coalesce(chess, '') || coalesce(coordinator, '')) <= 400),
  constraint yb_reg_idea_len  check (idea is null or char_length(idea) <= 600)
);
alter table public.yb_registrations enable row level security;
alter table public.yb_registrations force row level security;

-- rate limit hits: key = 'reg:<addr>', 'track:<addr>', 'ref:<code>', 'claim:<uid>'
create table if not exists public.yb_rate (
  id  bigint generated always as identity primary key,
  key text not null,
  at  timestamptz not null default now()
);
create index if not exists yb_rate_key_idx on public.yb_rate (key, at desc);
alter table public.yb_rate enable row level security;
alter table public.yb_rate force row level security;

-- ---------------------------------------------------------------------------
-- 2. Helpers (internal: no grants)
-- ---------------------------------------------------------------------------

-- the client's address as the gateway reports it (Cloudflare first)
create or replace function public.yb_client_addr()
returns text
language plpgsql stable
set search_path = public, pg_temp
as $$
declare h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then h := null;
  end;
  return left(coalesce(nullif(h ->> 'cf-connecting-ip', ''),
                       nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''),
                       nullif(h ->> 'x-real-ip', ''),
                       'unknown'), 64);
end $$;

-- digits only (Arabic-Indic and Persian digits read as 0-9)
create or replace function public.yb_digits(txt text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
           translate(coalesce(txt, ''),
                     U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9',
                     '01234567890123456789'),
           '[^0-9]', '', 'g')
$$;

-- a phone compares by its last 9 digits (0530 ..., +90 530 ..., 90530 ... are the same number)
create or replace function public.yb_phone_key(txt text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select right(public.yb_digits(txt), 9)
$$;

-- request number typed by a person: 'yn-7k4m-q2wx', 'YN7K4MQ2WX', '7K4M Q2WX' -> '7K4MQ2WX'
create or replace function public.yb_ref_norm(txt text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case when char_length(x) = 10 and left(x, 2) = 'YN' then substr(x, 3) else x end
    from (select upper(regexp_replace(coalesce(txt, ''), '[^A-Za-z0-9]', '', 'g')) as x) s
$$;

create or replace function public.yb_new_ref_code()
returns text
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 symbols, 31^8 codes
  bytes bytea;
  code  text;
  i     int;
  tries int := 0;
begin
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    code := '';
    for i in 0..5 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    for i in 10..11 loop        -- bytes 10..15 of a v4 uuid are fully random too
      code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.teams t where t.ref_code = code);
    tries := tries + 1;
    if tries > 50 then raise exception 'ref_code_exhausted'; end if;
  end loop;
  return code;
end $$;

-- how many hits a key had in the window
create or replace function public.yb_rate_count(k text, win interval)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.yb_rate r where r.key = k and r.at > now() - win
$$;

create or replace function public.yb_rate_hit(k text)
returns void
language sql volatile security definer
set search_path = public, pg_temp
as $$
  insert into public.yb_rate (key) values (k);
  delete from public.yb_rate r where r.at < now() - interval '1 day';
$$;

-- the checklist of one team (no names, ages or phones). Internal: callers check access.
create or replace function public.yb_checklist_of(t uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  x      public.teams%rowtype;
  grp    int;
  nxt    jsonb;
  n      int;
  minors int;
  cons   int;
begin
  select * into x from public.teams where id = t;
  if not found then return null; end if;
  select count(*)::int,
         (count(*) filter (where m.age is null or m.age < 18))::int,
         (count(*) filter (where (m.age is null or m.age < 18) and m.consent_status = 'received'))::int
    into n, minors, cons
    from public.team_members m where m.team_id = t;
  select (g.ord - 1)::int into grp
    from public.tournament_state s,
         jsonb_array_elements(case when jsonb_typeof(s.state -> 'groups') = 'array' then s.state -> 'groups' else '[]'::jsonb end)
           with ordinality as g(ids, ord)
   where s.id = 1 and jsonb_typeof(g.ids) = 'array' and g.ids ? t::text
   limit 1;
  select jsonb_build_object('title', e.title, 'starts_at', e.starts_at, 'place', e.place, 'competition', e.competition)
    into nxt
    from public.yb_events e
   where e.status <> 'cancelled' and e.starts_at > now()
     and (t = any (e.team_ids) or (cardinality(e.team_ids) = 0 and x.status = 'approved'))
   order by e.starts_at limit 1;
  return jsonb_build_object(
    'team_id', x.id, 'name', x.name, 'area', x.area, 'status', x.status,
    'note', case when x.status in ('returned', 'rejected') then x.admin_note end,
    'ref', x.ref_code, 'fee', x.fee_status, 'fee_at', x.fee_at,
    'members', n, 'minors', minors, 'consents', cons,
    'claimed', x.leader_id is not null, 'group', grp, 'next', nxt,
    'created_at', x.created_at, 'reviewed_at', x.reviewed_at);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Online registration
-- ---------------------------------------------------------------------------
-- p = {team, leader, phone, email?, area, members: [{name, age, contact}] (first = the leader),
--      reciter1, reciter2, chess, coordinator?, idea?, pledges: true}
-- Returns {ok:true, ref, team_id, duplicate?} or {ok:false, error}. Bad input never raises,
-- so the rate-limit hit is kept.
create or replace function public.yb_register_team(p jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  addr   text := public.yb_client_addr();
  v_team text; v_leader text; v_phone text; v_pkey text; v_email text; v_area text;
  v_r1 text; v_r2 text; v_ch text; v_coord text; v_idea text;
  ms jsonb; m jsonb; i int; n int;
  nm text; ag int; ct text;
  names text[] := '{}';
  dup public.teams%rowtype;
  tid uuid; code text; uid uuid := auth.uid();
begin
  if public.yb_rate_count('reg:' || addr, interval '1 hour') >= 5
     or public.yb_rate_count('reg:*', interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  perform public.yb_rate_hit('reg:' || addr);
  perform public.yb_rate_hit('reg:*');

  if p is null or jsonb_typeof(p) <> 'object' then return jsonb_build_object('ok', false, 'error', 'invalid_argument'); end if;
  v_team   := btrim(coalesce(p ->> 'team', ''));
  v_leader := btrim(coalesce(p ->> 'leader', ''));
  v_phone  := btrim(coalesce(p ->> 'phone', ''));
  v_pkey   := public.yb_phone_key(v_phone);
  v_email  := nullif(btrim(coalesce(p ->> 'email', '')), '');
  v_area   := nullif(btrim(coalesce(p ->> 'area', '')), '');
  v_r1     := btrim(coalesce(p ->> 'reciter1', ''));
  v_r2     := btrim(coalesce(p ->> 'reciter2', ''));
  v_ch     := btrim(coalesce(p ->> 'chess', ''));
  v_coord  := nullif(btrim(coalesce(p ->> 'coordinator', '')), '');
  v_idea   := nullif(btrim(coalesce(p ->> 'idea', '')), '');

  if char_length(v_team) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'bad_team_name'); end if;
  if char_length(v_leader) not between 2 and 80 then return jsonb_build_object('ok', false, 'error', 'bad_leader'); end if;
  if char_length(public.yb_digits(v_phone)) < 7 or char_length(v_phone) > 30 then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;
  if v_area is not null and char_length(v_area) > 60 then return jsonb_build_object('ok', false, 'error', 'bad_area'); end if;
  if v_idea is not null and char_length(v_idea) > 600 then return jsonb_build_object('ok', false, 'error', 'bad_idea'); end if;
  if coalesce(p ->> 'pledges', '') <> 'true' then return jsonb_build_object('ok', false, 'error', 'pledges_required'); end if;

  ms := p -> 'members';
  if ms is null or jsonb_typeof(ms) <> 'array' then return jsonb_build_object('ok', false, 'error', 'members_count_invalid'); end if;
  n := jsonb_array_length(ms);
  if n < 5 or n > 7 then return jsonb_build_object('ok', false, 'error', 'members_count_invalid'); end if;
  for i in 0 .. n - 1 loop
    m := ms -> i;
    if jsonb_typeof(m) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_member'); end if;
    nm := case when i = 0 then v_leader else btrim(coalesce(m ->> 'name', '')) end;
    if char_length(nm) not between 2 and 80 then return jsonb_build_object('ok', false, 'error', 'bad_member'); end if;
    begin
      ag := (m ->> 'age')::int;
    exception when others then ag := null;
    end;
    if ag is null or ag not between 4 and 100 then return jsonb_build_object('ok', false, 'error', 'bad_age'); end if;
    ct := btrim(coalesce(m ->> 'contact', ''));
    if char_length(public.yb_digits(ct)) < 7 or char_length(ct) > 30 then
      return jsonb_build_object('ok', false, 'error', 'bad_contact');
    end if;
    if public.yb_norm(nm) = any (names) then return jsonb_build_object('ok', false, 'error', 'duplicate_member'); end if;
    names := names || public.yb_norm(nm);
  end loop;
  if not (public.yb_norm(v_r1) = any (names)) or not (public.yb_norm(v_r2) = any (names))
     or not (public.yb_norm(v_ch) = any (names)) then
    return jsonb_build_object('ok', false, 'error', 'bad_nominee');
  end if;
  if public.yb_norm(v_r1) = public.yb_norm(v_r2) then return jsonb_build_object('ok', false, 'error', 'same_reciters'); end if;
  if v_coord is not null and not (public.yb_norm(v_coord) = any (names)) then
    return jsonb_build_object('ok', false, 'error', 'bad_nominee');
  end if;

  -- the same form sent twice (double tap, retry after a lost answer): same request number
  select t.* into dup from public.teams t join public.yb_registrations r on r.team_id = t.id
   where public.yb_norm(t.name) = public.yb_norm(v_team) and r.phone_key = v_pkey
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'ref', dup.ref_code, 'team_id', dup.id, 'duplicate', true);
  end if;
  -- team names are unique for good (teams_name_norm_uq, rejected teams included)
  if exists (select 1 from public.teams t where public.yb_norm(t.name) = public.yb_norm(v_team)) then
    return jsonb_build_object('ok', false, 'error', 'team_name_taken');
  end if;
  if uid is not null and exists (select 1 from public.teams t where t.leader_id = uid) then   -- one team per leader account (teams_leader_uq)
    return jsonb_build_object('ok', false, 'error', 'already_leading');
  end if;

  code := public.yb_new_ref_code();
  begin
    insert into public.teams (name, area, join_code, status, leader_id)
    values (v_team, v_area, public.yb_new_join_code(), 'draft', null)
    returning id into tid;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'team_name_taken');   -- a parallel request won the name
  end;
  update public.teams t set ref_code = code where t.id = tid;
  -- yb_teams_bi makes a signed-in caller the leader (and yb_teams_ai adds their
  -- roster row): keep that row, with the name typed in the form
  if exists (select 1 from public.team_members x where x.team_id = tid and x.is_leader) then
    update public.team_members x
       set full_name = v_leader, age = (ms -> 0 ->> 'age')::int, guardian_phone = btrim(ms -> 0 ->> 'contact')
     where x.team_id = tid and x.is_leader;
  else
    insert into public.team_members (team_id, full_name, age, guardian_phone, is_leader)
    values (tid, v_leader, (ms -> 0 ->> 'age')::int, btrim(ms -> 0 ->> 'contact'), true);
  end if;
  for i in 1 .. n - 1 loop
    m := ms -> i;
    insert into public.team_members (team_id, full_name, age, guardian_phone)
    values (tid, btrim(m ->> 'name'), (m ->> 'age')::int, btrim(m ->> 'contact'));
  end loop;
  insert into public.yb_registrations (team_id, phone, phone_key, email, reciter1, reciter2, chess, coordinator, idea)
  values (tid, v_phone, v_pkey, v_email, v_r1, v_r2, v_ch, v_coord, v_idea);
  update public.teams t set status = 'submitted' where t.id = tid;
  return jsonb_build_object('ok', true, 'ref', code, 'team_id', tid);
end $$;

-- the team behind a request number + phone, with rate limits on failures
create or replace function public.yb_ref_team(ref text, phone text, who text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  code text := public.yb_ref_norm(yb_ref_team.ref);
  pk   text := public.yb_phone_key(yb_ref_team.phone);
  tid  uuid;
begin
  if public.yb_rate_count(yb_ref_team.who, interval '15 minutes') >= 10
     or (code <> '' and public.yb_rate_count('ref:' || left(code, 12), interval '15 minutes') >= 5) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select t.id into tid from public.teams t join public.yb_registrations r on r.team_id = t.id
   where t.ref_code = code and r.phone_key = pk and char_length(pk) >= 7;
  if tid is null then
    perform public.yb_rate_hit(yb_ref_team.who);
    if code <> '' then perform public.yb_rate_hit('ref:' || left(code, 12)); end if;
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'team_id', tid);
end $$;

create or replace function public.yb_track_request(ref text, phone text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  r := public.yb_ref_team(yb_track_request.ref, yb_track_request.phone, 'track:' || public.yb_client_addr());
  if not (r ->> 'ok')::boolean then return r; end if;
  return jsonb_build_object('ok', true, 'team', public.yb_checklist_of((r ->> 'team_id')::uuid));
end $$;

-- a signed-in leader account takes over a team registered online
create or replace function public.yb_claim_team(ref text, phone text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  r   jsonb;
  tid uuid;
  x   public.teams%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.role = 'leader') then
    return jsonb_build_object('ok', false, 'error', 'not_leader');
  end if;
  r := public.yb_ref_team(yb_claim_team.ref, yb_claim_team.phone, 'claim:' || uid::text);
  if not (r ->> 'ok')::boolean then return r; end if;
  tid := (r ->> 'team_id')::uuid;
  select * into x from public.teams t where t.id = tid for update;
  if x.leader_id = uid then return jsonb_build_object('ok', true, 'team_id', tid, 'team_name', x.name, 'already', true); end if;
  if x.leader_id is not null then return jsonb_build_object('ok', false, 'error', 'already_claimed'); end if;
  if x.status = 'rejected' then return jsonb_build_object('ok', false, 'error', 'invalid_status'); end if;
  if exists (select 1 from public.teams t where t.leader_id = uid) then   -- one team per leader account (teams_leader_uq)
    return jsonb_build_object('ok', false, 'error', 'already_leading');
  end if;
  update public.teams t set leader_id = uid where t.id = tid;
  update public.team_members m set user_id = uid where m.team_id = tid and m.is_leader and m.user_id is null;
  insert into public.audit_log (user_id, action, detail)
  values (uid, 'team_claim', jsonb_build_object('team_id', tid));
  return jsonb_build_object('ok', true, 'team_id', tid, 'team_name', x.name);
end $$;

-- the checklist for the people of a team (leader, joined members, linked parents) and the reviewers
create or replace function public.yb_team_checklist(team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_team_checklist.team_id;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (t in (select public.yb_my_team_ids())
          or exists (select 1 from public.parent_links l join public.team_members m on m.id = l.member_id
                      where l.parent_id = auth.uid() and m.team_id = t)
          or public.yb_can_review()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return public.yb_checklist_of(t);
end $$;

-- registration details: reviewers, and the team's own leader
create or replace function public.yb_registration_detail(team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare r public.yb_registrations%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_can_review() or public.yb_is_team_leader(yb_registration_detail.team_id)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select * into r from public.yb_registrations x where x.team_id = yb_registration_detail.team_id;
  if not found then return null; end if;
  return jsonb_build_object('phone', r.phone, 'email', r.email, 'reciter1', r.reciter1, 'reciter2', r.reciter2,
                            'chess', r.chess, 'coordinator', r.coordinator, 'idea', r.idea, 'created_at', r.created_at);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Fee
-- ---------------------------------------------------------------------------
create or replace function public.yb_set_fee(team_id uuid, status text, receipt text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  rc text := nullif(btrim(coalesce(yb_set_fee.receipt, '')), '');
  x  public.teams%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_can_review() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_set_fee.status is null or yb_set_fee.status not in ('unpaid', 'paid', 'waived') then raise exception 'invalid_argument'; end if;
  if rc is not null and char_length(rc) > 40 then raise exception 'invalid_argument'; end if;
  select * into x from public.teams t where t.id = yb_set_fee.team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if x.fee_status is not distinct from yb_set_fee.status
     and x.fee_receipt is not distinct from (case when yb_set_fee.status = 'unpaid' then null else rc end) then
    return jsonb_build_object('ok', true, 'fee', x.fee_status, 'changed', false);
  end if;
  update public.teams t
     set fee_status = yb_set_fee.status,
         fee_receipt = case when yb_set_fee.status = 'unpaid' then null else rc end,
         fee_at = case when yb_set_fee.status = 'unpaid' then null else now() end
   where t.id = x.id;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'team_fee', jsonb_build_object('team_id', x.id, 'from', x.fee_status, 'to', yb_set_fee.status));
  if yb_set_fee.status <> 'unpaid' and x.fee_status is distinct from yb_set_fee.status then
    perform public.yb_notify(public.yb_team_people(array[x.id]), 'team_fee',
      jsonb_build_object('team_id', x.id, 'team_name', x.name, 'fee', yb_set_fee.status));
  end if;
  return jsonb_build_object('ok', true, 'fee', yb_set_fee.status, 'changed', true);
end $$;

-- the review queue gains the fee, the request number and the online flag
drop function if exists public.yb_review_list();
create function public.yb_review_list()
returns table (team_id uuid, team_name text, area text, status text, admin_note text,
               members int, consents int, updated_at timestamptz, reviewed_at timestamptz,
               fee_status text, fee_receipt text, ref_code text, online boolean, claimed boolean)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.yb_can_review() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select t.id, t.name, t.area, t.status, t.admin_note,
           (select count(*)::int from public.team_members m where m.team_id = t.id),
           (select count(*)::int from public.team_members m where m.team_id = t.id and m.consent_status = 'received'),
           t.updated_at, t.reviewed_at, t.fee_status, t.fee_receipt, t.ref_code,
           exists (select 1 from public.yb_registrations r where r.team_id = t.id),
           t.leader_id is not null
      from public.teams t
     order by case t.status when 'submitted' then 0 when 'returned' then 1 when 'draft' then 2 else 3 end,
              t.updated_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Public counts for the home page
-- ---------------------------------------------------------------------------
create or replace function public.yb_registration_stats()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'target', 12,
    'registered', (select count(*) from public.teams t where t.status in ('submitted', 'returned', 'approved')),
    'approved', (select count(*) from public.teams t where t.status = 'approved'))
$$;

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on public.yb_registrations, public.yb_rate from public, anon, authenticated;
revoke all on function
  public.yb_client_addr(), public.yb_digits(text), public.yb_phone_key(text), public.yb_ref_norm(text),
  public.yb_new_ref_code(), public.yb_rate_count(text, interval), public.yb_rate_hit(text),
  public.yb_checklist_of(uuid), public.yb_register_team(jsonb), public.yb_ref_team(text, text, text),
  public.yb_track_request(text, text), public.yb_claim_team(text, text), public.yb_team_checklist(uuid),
  public.yb_registration_detail(uuid), public.yb_set_fee(uuid, text, text), public.yb_review_list(),
  public.yb_registration_stats()
  from public, anon, authenticated;

grant execute on function
  public.yb_register_team(jsonb), public.yb_track_request(text, text), public.yb_registration_stats()
  to anon, authenticated;
grant execute on function
  public.yb_claim_team(text, text), public.yb_team_checklist(uuid), public.yb_registration_detail(uuid),
  public.yb_set_fee(uuid, text, text), public.yb_review_list()
  to authenticated;

comment on table public.yb_registrations is 'Online registration details (leader phone, email, nominees). Reviewers and the team leader only, via yb_registration_detail.';
comment on table public.yb_rate is 'Rate-limit hits for the account-free RPCs. No client access.';
