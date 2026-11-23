-- Yanabee 0007: live results, approved results, goal scorers and the team-spirit badge.
--
-- The published board (tournament_state) holds APPROVED results only: they alone
-- feed the standings. Live and finished-but-not-approved results live in
-- yb_match_live, one row per match:
--   live      the officer is entering it during the match (clock from started_at)
--   final     the officer finished it; it waits for the admin
--   returned  the admin sent it back with a note
--   approved  the admin approved it: yb_result_approve publishes the new board
--             (publish_state) and marks the row in the same transaction
-- Keys: football 'a|b' (the engine's pair key, either order accepted), chess a
-- short key built by the client ('final', 'rr:a|b', 'w:<stage>:<index>').
-- Team ids are the board's ids (the database team uuids once imported).
--
-- yb_match_marks: goals and the team-spirit badge (one per team and match) per
-- player. Names never reach the public: the view yb_match_counts gives counts per
-- team; names go to the team's own people (yb_my_marks) and to staff
-- (yb_match_marks_of).
--
-- yb_result_history: every write (live, final, approved, returned, and every
-- change of a result made on the board, caught by a trigger on
-- tournament_state). Staff only.
-- ASCII only.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.yb_match_live (
  comp        text not null,
  match_key   text not null,
  a           text not null,
  b           text not null,
  sa          int not null default 0,
  sb          int not null default 0,
  ca          int not null default 0,
  cb          int not null default 0,
  ra          int not null default 0,
  rb          int not null default 0,
  status      text not null default 'live',
  started_at  timestamptz,
  note        text,
  return_note text,
  entered_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  primary key (comp, match_key),
  constraint yb_live_comp_chk   check (comp in ('football', 'chess')),
  constraint yb_live_key_chk    check (char_length(match_key) between 1 and 90 and match_key !~ '[[:space:]]'),
  constraint yb_live_ids_chk    check (char_length(a) between 1 and 40 and char_length(b) between 1 and 40 and a <> b
                                       and position('|' in a) = 0 and position('|' in b) = 0),
  constraint yb_live_score_chk  check (sa between 0 and 99 and sb between 0 and 99),
  constraint yb_live_cards_chk  check (ca between 0 and 30 and cb between 0 and 30 and ra between 0 and ca and rb between 0 and cb),
  constraint yb_live_status_chk check (status in ('live', 'final', 'returned', 'approved')),
  constraint yb_live_note_chk   check ((note is null or char_length(note) <= 200) and (return_note is null or char_length(return_note) <= 300))
);
alter table public.yb_match_live enable row level security;
alter table public.yb_match_live force row level security;

create table if not exists public.yb_match_marks (
  id         bigint generated always as identity primary key,
  comp       text not null,
  match_key  text not null,
  team_id    text not null,
  member_id  uuid references public.team_members (id) on delete set null,
  kind       text not null,
  minute     int,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint yb_marks_kind_chk check (kind in ('goal', 'spirit')),
  constraint yb_marks_min_chk  check (minute is null or minute between 0 and 200),
  foreign key (comp, match_key) references public.yb_match_live (comp, match_key) on delete cascade
);
create unique index if not exists yb_marks_spirit_uq on public.yb_match_marks (comp, match_key, team_id) where kind = 'spirit';
create index if not exists yb_marks_match_idx on public.yb_match_marks (comp, match_key);
alter table public.yb_match_marks enable row level security;
alter table public.yb_match_marks force row level security;

create table if not exists public.yb_result_history (
  id        bigint generated always as identity primary key,
  comp      text not null,
  match_key text not null,
  at        timestamptz not null default now(),
  by        uuid,
  action    text not null,
  before    jsonb,
  after     jsonb,
  reason    text,
  constraint yb_hist_action_chk check (action in ('live', 'final', 'approved', 'returned', 'board', 'cleared')),
  constraint yb_hist_reason_chk check (reason is null or char_length(reason) <= 300)
);
create index if not exists yb_hist_match_idx on public.yb_result_history (comp, match_key, at desc);
alter table public.yb_result_history enable row level security;
alter table public.yb_result_history force row level security;

-- ---------------------------------------------------------------------------
-- 2. Helpers and policies
-- ---------------------------------------------------------------------------
-- is this board id a team of the caller (leader, joined member, linked parent)?
create or replace function public.yb_is_my_board_team(tid text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.yb_my_team_ids() x where x::text = tid)
      or exists (select 1 from public.parent_links l join public.team_members m on m.id = l.member_id
                  where l.parent_id = auth.uid() and m.team_id::text = tid)
$$;

create or replace function public.yb_live_row(r public.yb_match_live)
returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object('a', r.a, 'b', r.b, 'sa', r.sa, 'sb', r.sb, 'ca', r.ca, 'cb', r.cb, 'ra', r.ra, 'rb', r.rb, 'status', r.status)
$$;

-- anyone reads the live board (columns are limited by the grants below: no notes, no user ids)
drop policy if exists yb_live_select on public.yb_match_live;
create policy yb_live_select on public.yb_match_live for select to anon, authenticated using (true);

-- marks: staff of the competition, and the people of the team
drop policy if exists yb_marks_select on public.yb_match_marks;
create policy yb_marks_select on public.yb_match_marks for select to authenticated
  using ((select public.yb_can_manage(comp)) or (select public.yb_is_my_board_team(team_id)));

drop policy if exists yb_hist_select on public.yb_result_history;
create policy yb_hist_select on public.yb_result_history for select to authenticated
  using ((select public.yb_can_manage(comp)));

-- public counts per team and match: goals and team-spirit badges, never who
create or replace view public.yb_match_counts with (security_barrier = true) as
  select m.comp, m.match_key, m.team_id,
         (count(*) filter (where m.kind = 'goal'))::int   as goals,
         (count(*) filter (where m.kind = 'spirit'))::int as spirit
    from public.yb_match_marks m
   group by m.comp, m.match_key, m.team_id;

-- ---------------------------------------------------------------------------
-- 3. Officers: enter and finish
-- ---------------------------------------------------------------------------
-- status: 'live' (during the match) or 'final' (finished, to the admin).
-- start = true sets the kick-off time (the public clock) if not set yet.
create or replace function public.yb_live_set(comp text, match_key text, a text, b text,
                                              sa int, sb int, ca int default 0, cb int default 0,
                                              ra int default 0, rb int default 0,
                                              status text default 'live', note text default null,
                                              start boolean default false,
                                              a_name text default null, b_name text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  c   text := yb_live_set.comp;
  k   text := yb_live_set.match_key;
  old public.yb_match_live%rowtype;
  cur public.yb_match_live%rowtype;
  had boolean;
  nt  text := nullif(btrim(coalesce(yb_live_set.note, '')), '');
  admins uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if c is null or c not in ('football', 'chess') then raise exception 'invalid_argument'; end if;
  if not public.yb_can_manage(c) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_live_set.status is null or yb_live_set.status not in ('live', 'final') then raise exception 'invalid_argument'; end if;
  if c = 'football' and k is distinct from (yb_live_set.a || '|' || yb_live_set.b)
                    and k is distinct from (yb_live_set.b || '|' || yb_live_set.a) then
    return jsonb_build_object('ok', false, 'error', 'bad_match');
  end if;
  select * into old from public.yb_match_live x where x.comp = c and x.match_key = k for update;
  had := found;
  if had and old.status = 'approved' then return jsonb_build_object('ok', false, 'error', 'already_approved'); end if;
  if had and (old.a <> yb_live_set.a or old.b <> yb_live_set.b) then return jsonb_build_object('ok', false, 'error', 'bad_match'); end if;
  begin
    insert into public.yb_match_live as x (comp, match_key, a, b, sa, sb, ca, cb, ra, rb, status, started_at, note, entered_by, updated_at)
    values (c, k, yb_live_set.a, yb_live_set.b, yb_live_set.sa, yb_live_set.sb, coalesce(yb_live_set.ca, 0), coalesce(yb_live_set.cb, 0),
            coalesce(yb_live_set.ra, 0), coalesce(yb_live_set.rb, 0), yb_live_set.status,
            case when yb_live_set.start then now() end, nt, auth.uid(), now())
    on conflict on constraint yb_match_live_pkey do update
       set sa = excluded.sa, sb = excluded.sb, ca = excluded.ca, cb = excluded.cb, ra = excluded.ra, rb = excluded.rb,
           status = excluded.status, note = excluded.note, entered_by = excluded.entered_by, updated_at = now(),
           started_at = coalesce(x.started_at, excluded.started_at), return_note = null
    returning * into cur;
  exception when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'bad_score');
  end;
  if not had or old.status is distinct from cur.status or old.sa is distinct from cur.sa or old.sb is distinct from cur.sb then
    insert into public.yb_result_history (comp, match_key, by, action, before, after)
    values (c, k, auth.uid(), cur.status, case when had then public.yb_live_row(old) end, public.yb_live_row(cur));
  end if;
  if cur.status = 'final' and (not had or old.status is distinct from 'final') then
    select coalesce(array_agg(p.id), '{}') into admins from public.profiles p where p.role = 'admin';
    perform public.yb_notify(admins, 'result_pending',
      jsonb_build_object('comp', c, 'match_key', k, 'sa', cur.sa, 'sb', cur.sb,
                         'a_name', left(coalesce(yb_live_set.a_name, ''), 60), 'b_name', left(coalesce(yb_live_set.b_name, ''), 60)));
  end if;
  return jsonb_build_object('ok', true, 'status', cur.status, 'started_at', cur.started_at);
end $$;

-- a goal (member optional: an unknown scorer still counts) or the team-spirit badge (one per team and match)
create or replace function public.yb_mark_add(comp text, match_key text, team_id text, kind text,
                                              member_id uuid default null, minute int default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  lv public.yb_match_live%rowtype;
  nid bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if yb_mark_add.comp is null or not public.yb_can_manage(yb_mark_add.comp) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_mark_add.kind is null or yb_mark_add.kind not in ('goal', 'spirit') then raise exception 'invalid_argument'; end if;
  if yb_mark_add.minute is not null and yb_mark_add.minute not between 0 and 200 then raise exception 'invalid_argument'; end if;
  select * into lv from public.yb_match_live x where x.comp = yb_mark_add.comp and x.match_key = yb_mark_add.match_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'match_not_started'); end if;
  if lv.status = 'approved' and not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'already_approved'); end if;
  if yb_mark_add.team_id is distinct from lv.a and yb_mark_add.team_id is distinct from lv.b then
    return jsonb_build_object('ok', false, 'error', 'bad_team');
  end if;
  if yb_mark_add.member_id is not null and not exists (
       select 1 from public.team_members m where m.id = yb_mark_add.member_id and m.team_id::text = yb_mark_add.team_id) then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;
  if yb_mark_add.kind = 'spirit' and yb_mark_add.member_id is null then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;
  if yb_mark_add.kind = 'spirit' then
    delete from public.yb_match_marks x
     where x.comp = yb_mark_add.comp and x.match_key = yb_mark_add.match_key and x.team_id = yb_mark_add.team_id and x.kind = 'spirit';
  end if;
  insert into public.yb_match_marks (comp, match_key, team_id, member_id, kind, minute, created_by)
  values (yb_mark_add.comp, yb_mark_add.match_key, yb_mark_add.team_id, yb_mark_add.member_id, yb_mark_add.kind, yb_mark_add.minute, auth.uid())
  returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function public.yb_mark_del(id bigint)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare mk public.yb_match_marks%rowtype; st text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into mk from public.yb_match_marks x where x.id = yb_mark_del.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.yb_can_manage(mk.comp) then raise exception 'permission_denied' using errcode = '42501'; end if;
  select x.status into st from public.yb_match_live x where x.comp = mk.comp and x.match_key = mk.match_key;
  if st = 'approved' and not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'already_approved'); end if;
  delete from public.yb_match_marks x where x.id = mk.id;
  return jsonb_build_object('ok', true);
end $$;

-- the players of a team, for the officer's scorer list (staff of the competition only)
create or replace function public.yb_match_roster(comp text, team_id text)
returns table (member_id uuid, full_name text, roles text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if yb_match_roster.comp is null or not public.yb_can_manage(yb_match_roster.comp) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select m.id, m.full_name, m.roles from public.team_members m
     where m.team_id::text = yb_match_roster.team_id
     order by m.is_leader desc, m.full_name;
end $$;

-- staff: the marks of a match with names
create or replace function public.yb_match_marks_of(comp text, match_key text)
returns table (id bigint, team_id text, member_id uuid, full_name text, kind text, minute int)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if yb_match_marks_of.comp is null or not public.yb_can_manage(yb_match_marks_of.comp) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select x.id, x.team_id, x.member_id, m.full_name, x.kind, x.minute
      from public.yb_match_marks x left join public.team_members m on m.id = x.member_id
     where x.comp = yb_match_marks_of.comp and x.match_key = yb_match_marks_of.match_key
     order by x.kind, x.minute nulls last, x.id;
end $$;

-- the team's own people: their scorers and team-spirit badges across matches
create or replace function public.yb_my_marks()
returns table (comp text, match_key text, team_id text, full_name text, kind text, minute int, status text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.comp, x.match_key, x.team_id, m.full_name, x.kind, x.minute, lv.status
    from public.yb_match_marks x
    join public.yb_match_live lv on lv.comp = x.comp and lv.match_key = x.match_key
    left join public.team_members m on m.id = x.member_id
   where auth.uid() is not null and public.yb_is_my_board_team(x.team_id)
   order by lv.updated_at desc, x.id
$$;

-- ---------------------------------------------------------------------------
-- 4. The admin: approve (publish in the same transaction) or return
-- ---------------------------------------------------------------------------
create or replace function public.yb_result_approve(comp text, match_key text, state jsonb, prev timestamptz default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  lv  public.yb_match_live%rowtype;
  pub jsonb;
  people uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into lv from public.yb_match_live x where x.comp = yb_result_approve.comp and x.match_key = yb_result_approve.match_key for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if lv.status = 'approved' then return jsonb_build_object('ok', false, 'error', 'already_approved'); end if;
  if lv.status <> 'final' then return jsonb_build_object('ok', false, 'error', 'not_final'); end if;
  perform set_config('yb.approving', lv.comp || '/' || lv.match_key, true);   -- the board trigger leaves this match to us
  pub := public.publish_state(yb_result_approve.state, yb_result_approve.prev);
  perform set_config('yb.approving', '', true);
  if not coalesce((pub ->> 'ok')::boolean, false) then return pub; end if;
  update public.yb_match_live x set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
   where x.comp = lv.comp and x.match_key = lv.match_key;
  insert into public.yb_result_history (comp, match_key, by, action, before, after)
  values (lv.comp, lv.match_key, auth.uid(), 'approved', public.yb_live_row(lv), public.yb_live_row(lv) || '{"status":"approved"}'::jsonb);
  select coalesce(array_agg(t.id), '{}') into people from public.teams t where t.id::text in (lv.a, lv.b);
  perform public.yb_notify(public.yb_team_people(people), 'result_approved',
    jsonb_build_object('comp', lv.comp, 'match_key', lv.match_key, 'a', lv.a, 'b', lv.b, 'sa', lv.sa, 'sb', lv.sb));
  return pub || jsonb_build_object('approved', true);
end $$;

create or replace function public.yb_result_return(comp text, match_key text, note text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  lv public.yb_match_live%rowtype;
  nt text := nullif(btrim(coalesce(yb_result_return.note, '')), '');
  offs uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if nt is null then raise exception 'note_required'; end if;
  if char_length(nt) > 300 then raise exception 'invalid_argument'; end if;
  select * into lv from public.yb_match_live x where x.comp = yb_result_return.comp and x.match_key = yb_result_return.match_key for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if lv.status <> 'final' then return jsonb_build_object('ok', false, 'error', 'not_final'); end if;
  update public.yb_match_live x set status = 'returned', return_note = nt, updated_at = now()
   where x.comp = lv.comp and x.match_key = lv.match_key;
  insert into public.yb_result_history (comp, match_key, by, action, before, after, reason)
  values (lv.comp, lv.match_key, auth.uid(), 'returned', public.yb_live_row(lv), public.yb_live_row(lv) || '{"status":"returned"}'::jsonb, nt);
  select coalesce(array_agg(o.user_id), '{}') into offs from public.yb_officers o where o.competition = lv.comp;
  perform public.yb_notify(offs || coalesce(array[lv.entered_by], '{}'), 'result_returned',
    jsonb_build_object('comp', lv.comp, 'match_key', lv.match_key, 'note', nt));
  return jsonb_build_object('ok', true);
end $$;

-- staff: the queue and the recent rows with notes
create or replace function public.yb_results_queue()
returns table (comp text, match_key text, a text, b text, sa int, sb int, ca int, cb int, ra int, rb int,
               status text, started_at timestamptz, note text, return_note text, updated_at timestamptz,
               approved_at timestamptz, goals int, spirit int)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_can_manage('football') or public.yb_can_manage('chess')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
    select x.comp, x.match_key, x.a, x.b, x.sa, x.sb, x.ca, x.cb, x.ra, x.rb, x.status, x.started_at, x.note, x.return_note,
           x.updated_at, x.approved_at,
           (select count(*)::int from public.yb_match_marks m where m.comp = x.comp and m.match_key = x.match_key and m.kind = 'goal'),
           (select count(*)::int from public.yb_match_marks m where m.comp = x.comp and m.match_key = x.match_key and m.kind = 'spirit')
      from public.yb_match_live x
     where public.yb_can_manage(x.comp)
     order by case x.status when 'final' then 0 when 'live' then 1 when 'returned' then 2 else 3 end, x.updated_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Every change of a football result on the board is written to the history;
--    an approved live row follows the board (or goes back to 'final' if cleared)
-- ---------------------------------------------------------------------------
create or replace function public.yb_board_history()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  o jsonb := case when tg_op = 'UPDATE' and jsonb_typeof(old.state -> 'fb' -> 'res') = 'object' then old.state -> 'fb' -> 'res' else '{}'::jsonb end;
  n jsonb := case when jsonb_typeof(new.state -> 'fb' -> 'res') = 'object' then new.state -> 'fb' -> 'res' else '{}'::jsonb end;
  k text;
  skip text := coalesce(current_setting('yb.approving', true), '');
begin
  for k in select x from (select jsonb_object_keys(o) as x union select jsonb_object_keys(n)) s loop
    continue when (o -> k) is not distinct from (n -> k);
    continue when skip = 'football/' || k;
    continue when char_length(k) > 90;
    insert into public.yb_result_history (comp, match_key, by, action, before, after)
    values ('football', k, auth.uid(), case when n ? k then 'board' else 'cleared' end, o -> k, n -> k);
    if n ? k then
      update public.yb_match_live x
         set sa = case when x.a = (n -> k ->> 'a') then coalesce((n -> k ->> 'sa')::int, x.sa) else coalesce((n -> k ->> 'sb')::int, x.sa) end,
             sb = case when x.a = (n -> k ->> 'a') then coalesce((n -> k ->> 'sb')::int, x.sb) else coalesce((n -> k ->> 'sa')::int, x.sb) end,
             updated_at = now()
       where x.comp = 'football' and x.match_key in (k, split_part(k, '|', 2) || '|' || split_part(k, '|', 1))
         and x.status = 'approved';
    else
      update public.yb_match_live x set status = 'final', approved_at = null, approved_by = null, updated_at = now()
       where x.comp = 'football' and x.match_key in (k, split_part(k, '|', 2) || '|' || split_part(k, '|', 1))
         and x.status = 'approved';
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists yb_board_history on public.tournament_state;
create trigger yb_board_history after insert or update of state on public.tournament_state
  for each row execute function public.yb_board_history();

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on public.yb_match_live, public.yb_match_marks, public.yb_result_history, public.yb_match_counts
  from public, anon, authenticated;
revoke all on function
  public.yb_is_my_board_team(text), public.yb_live_row(public.yb_match_live),
  public.yb_live_set(text, text, text, text, int, int, int, int, int, int, text, text, boolean, text, text),
  public.yb_mark_add(text, text, text, text, uuid, int), public.yb_mark_del(bigint),
  public.yb_match_roster(text, text), public.yb_match_marks_of(text, text), public.yb_my_marks(),
  public.yb_result_approve(text, text, jsonb, timestamptz), public.yb_result_return(text, text, text),
  public.yb_results_queue(), public.yb_board_history()
  from public, anon, authenticated;

-- the live board: no notes, no user ids
grant select (comp, match_key, a, b, sa, sb, ca, cb, ra, rb, status, started_at, updated_at, approved_at)
  on public.yb_match_live to anon, authenticated;
grant select on public.yb_match_counts to anon, authenticated;
grant select (id, comp, match_key, team_id, member_id, kind, minute, created_at) on public.yb_match_marks to authenticated;
grant select on public.yb_result_history to authenticated;

-- used inside policies (run as the caller)
grant execute on function public.yb_is_my_board_team(text) to authenticated;

grant execute on function
  public.yb_live_set(text, text, text, text, int, int, int, int, int, int, text, text, boolean, text, text),
  public.yb_mark_add(text, text, text, text, uuid, int), public.yb_mark_del(bigint),
  public.yb_match_roster(text, text), public.yb_match_marks_of(text, text), public.yb_my_marks(),
  public.yb_result_approve(text, text, jsonb, timestamptz), public.yb_result_return(text, text, text),
  public.yb_results_queue()
  to authenticated;

comment on table public.yb_match_live is 'Live and pending results. Only approved results reach tournament_state (the standings).';
comment on table public.yb_match_marks is 'Goals and the team-spirit badge per player. Public sees counts only (yb_match_counts).';
comment on table public.yb_result_history is 'Every result write, including board edits after approval. Staff only.';
