-- Yanabee 0015: the journey on the account, and who sees what (owner request Nov 2026: "so it can actually work and
-- see what other people do"). Until now a member's weekly promise, memorised ayahs and deeds stayed on the device.
--
-- What is stored
--   yb_pledges     one promise a person a week (the week starts on Saturday): a field of practice, a short text, kept
--                  or not, and an optional note from a parent. The text refuses phone numbers and e-mails.
--   yb_hifz_marks  the ayahs of Surat as-Saff (1..14) a person ticked as memorised (their own tracker, not a mark).
--   yb_deed_days   the days a person ticked a deed (no text).
--   yb_team_pact   the team's pact: a value, how, who (a role, never a name) and when.
--   yb_lead_weeks  the leader's weekly duties ticked (keys only).
-- Who sees what (method.txt m-roles: the leader collects the tasks and follows the week; parents follow at home)
--   the person: their own rows. The team's leader: every member's promise, counts and the parent's note.
--   A linked parent: their own child's rows, and may add the note. Other members: counts only, never a name or a text.
--   Officers and the admin: counts per team (yb_activity_board). The admin: the audit log (yb_activity_log).
--   Visitors: nothing. Tables are closed; everything goes through the functions below.

create table if not exists public.yb_pledges (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  team_id     uuid not null references public.teams (id) on delete cascade,
  week        date not null,
  field       text not null,
  body        text not null,
  done        boolean not null default false,
  done_at     timestamptz,
  parent_note text,
  parent_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint yb_pl_one unique (user_id, week),
  constraint yb_pl_field check (field in ('home', 'hood', 'kin', 'school', 'friends')),
  constraint yb_pl_body check (char_length(body) between 5 and 140),
  constraint yb_pl_note check (parent_note is null or char_length(parent_note) <= 200),
  constraint yb_pl_week check (extract(dow from week) = 6)
);
create index if not exists yb_pl_team_idx on public.yb_pledges (team_id, week);
create table if not exists public.yb_hifz_marks (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  ayahs      int[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint yb_hm_chk check (ayahs <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14] and cardinality(ayahs) <= 14)
);
create table if not exists public.yb_deed_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
create table if not exists public.yb_team_pact (
  team_id    uuid primary key references public.teams (id) on delete cascade,
  value      text not null,
  how        text not null,
  who        text not null,
  when_text  text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint yb_tp_value check (value in ('sidq', 'amana', 'taawun', 'ihtiram', 'nazafa')),
  constraint yb_tp_who check (who in ('all', 'leader', 'assistant', 'coord')),
  constraint yb_tp_how check (char_length(how) between 5 and 160),
  constraint yb_tp_when check (when_text is null or char_length(when_text) <= 60)
);
create table if not exists public.yb_lead_weeks (
  team_id    uuid not null references public.teams (id) on delete cascade,
  week       date not null,
  tasks      text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (team_id, week),
  constraint yb_lw_chk check (tasks <@ array['meet', 'cards', 'follow', 'summary', 'leaders']::text[])
);
do $$ declare t text; begin
  foreach t in array array['yb_pledges', 'yb_hifz_marks', 'yb_deed_days', 'yb_team_pact', 'yb_lead_weeks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- helpers
-- the team a person belongs to as a joined member, or leads
create or replace function public.yb_my_team_id(u uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select m.team_id from public.team_members m where m.user_id = u order by m.created_at limit 1),
                  (select t.id from public.teams t where t.leader_id = u order by t.created_at limit 1))
$$;
-- a Saturday close to today (the browser's own date may differ from the server's by a day)
create or replace function public.yb_week_ok(w date)
returns boolean
language sql stable
set search_path = public, pg_temp
as $$ select w is not null and extract(dow from w) = 6 and w between current_date - 7 and current_date + 1 $$;
create or replace function public.yb_leads_team(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid()) $$;
create or replace function public.yb_is_staff()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in ('admin', 'officer')) $$;

-- ---------------------------------------------------------------- the person
create or replace function public.yb_journey_me(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); t uuid;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  t := public.yb_my_team_id(me);
  return jsonb_build_object('team_id', t,
    'pledge', (select jsonb_build_object('field', p.field, 'body', p.body, 'done', p.done, 'parent_note', p.parent_note)
                 from public.yb_pledges p where p.user_id = me and p.week = yb_journey_me.week),
    'kept', (select count(*) from public.yb_pledges p where p.user_id = me and p.done),
    'hifz', coalesce((select to_jsonb(h.ayahs) from public.yb_hifz_marks h where h.user_id = me), '[]'::jsonb),
    'deed_days', coalesce((select jsonb_agg(d.day order by d.day) from public.yb_deed_days d where d.user_id = me and d.day > current_date - 9), '[]'::jsonb));
end $$;

create or replace function public.yb_pledge_save(week date, field text, body text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); t uuid; b text := btrim(regexp_replace(coalesce(yb_pledge_save.body, ''), '\s+', ' ', 'g'));
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  t := public.yb_my_team_id(me);
  if t is null then return jsonb_build_object('ok', false, 'error', 'no_team'); end if;
  if not public.yb_week_ok(yb_pledge_save.week) or yb_pledge_save.field not in ('home', 'hood', 'kin', 'school', 'friends')
     or char_length(b) not between 5 and 140 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if public.yb_has_contact(b) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  insert into public.yb_pledges as p (user_id, team_id, week, field, body) values (me, t, yb_pledge_save.week, yb_pledge_save.field, b)
  on conflict on constraint yb_pl_one do update set field = excluded.field, body = excluded.body, team_id = excluded.team_id,
    done = case when p.body = excluded.body and p.field = excluded.field then p.done else false end,
    done_at = case when p.body = excluded.body and p.field = excluded.field then p.done_at end, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_pledge_done(week date, done boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update public.yb_pledges p set done = coalesce(yb_pledge_done.done, false), done_at = case when yb_pledge_done.done then now() end, updated_at = now()
   where p.user_id = me and p.week = yb_pledge_done.week;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_hifz_set(ayahs int[])
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); a int[];
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into a from unnest(coalesce(yb_hifz_set.ayahs, '{}')) x;
  if not (a <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14]) then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  insert into public.yb_hifz_marks as h (user_id, ayahs) values (me, a)
  on conflict (user_id) do update set ayahs = excluded.ayahs, updated_at = now();
  return jsonb_build_object('ok', true, 'count', cardinality(a));
end $$;

create or replace function public.yb_deed_mark(day date, done boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if yb_deed_mark.day is null or yb_deed_mark.day not between current_date - 1 and current_date + 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if coalesce(yb_deed_mark.done, false) then
    insert into public.yb_deed_days (user_id, day) values (me, yb_deed_mark.day) on conflict do nothing;
    delete from public.yb_deed_days d where d.user_id = me and d.day < current_date - 90;
  else
    delete from public.yb_deed_days d where d.user_id = me and d.day = yb_deed_mark.day;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- the team
-- the leader (or staff): every member with this week's promise and their counts
create or replace function public.yb_team_journey(team_id uuid, week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_team_journey.team_id; w date := yb_team_journey.week;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_leads_team(t) or public.yb_is_staff()) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('members', coalesce((select jsonb_agg(jsonb_build_object(
      'member_id', m.id, 'name', m.full_name, 'is_leader', m.is_leader, 'joined', m.user_id is not null,
      'pledge', (select jsonb_build_object('field', p.field, 'body', p.body, 'done', p.done, 'parent_note', p.parent_note)
                   from public.yb_pledges p where p.user_id = m.user_id and p.week = w),
      'kept', (select count(*) from public.yb_pledges p where p.user_id = m.user_id and p.done),
      'hifz', coalesce((select cardinality(h.ayahs) from public.yb_hifz_marks h where h.user_id = m.user_id), 0),
      'deed_days', (select count(*) from public.yb_deed_days d where d.user_id = m.user_id and d.day >= w)) order by m.is_leader desc, m.full_name)
    from public.team_members m where m.team_id = t), '[]'::jsonb));
end $$;

-- everyone on the team (and a linked parent, and staff): counts only, never a name or a text
create or replace function public.yb_team_board(team_id uuid, week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_team_board.team_id; w date := yb_team_board.week; me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_leads_team(t) or public.yb_is_staff()
          or exists (select 1 from public.team_members m where m.team_id = t and m.user_id = me)
          or exists (select 1 from public.parent_links l join public.team_members m on m.id = l.member_id where l.parent_id = me and m.team_id = t)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'members', (select count(*) from public.team_members m where m.team_id = t),
    'joined', (select count(*) from public.team_members m where m.team_id = t and m.user_id is not null),
    'pledged', (select count(*) from public.yb_pledges p where p.team_id = t and p.week = w),
    'kept', (select count(*) from public.yb_pledges p where p.team_id = t and p.week = w and p.done),
    'hifz_sum', coalesce((select sum(cardinality(h.ayahs)) from public.yb_hifz_marks h join public.team_members m on m.user_id = h.user_id where m.team_id = t), 0),
    'active', (select count(distinct d.user_id) from public.yb_deed_days d join public.team_members m on m.user_id = d.user_id where m.team_id = t and d.day >= w),
    'pact', (select jsonb_build_object('value', p.value, 'how', p.how, 'who', p.who, 'when', p.when_text) from public.yb_team_pact p where p.team_id = t),
    'lead_tasks', coalesce((select to_jsonb(l.tasks) from public.yb_lead_weeks l where l.team_id = t and l.week = w), '[]'::jsonb));
end $$;

create or replace function public.yb_pact_save(team_id uuid, value text, how text, who text, when_text text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_pact_save.team_id; h text := btrim(regexp_replace(coalesce(yb_pact_save.how, ''), '\s+', ' ', 'g'));
  wn text := nullif(btrim(regexp_replace(coalesce(yb_pact_save.when_text, ''), '\s+', ' ', 'g')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_leads_team(t) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_pact_save.value not in ('sidq', 'amana', 'taawun', 'ihtiram', 'nazafa') or yb_pact_save.who not in ('all', 'leader', 'assistant', 'coord')
     or char_length(h) not between 5 and 160 or char_length(coalesce(wn, '')) > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if public.yb_has_contact(h) or public.yb_has_contact(coalesce(wn, '')) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  insert into public.yb_team_pact as p (team_id, value, how, who, when_text, updated_by) values (t, yb_pact_save.value, h, yb_pact_save.who, wn, auth.uid())
  on conflict on constraint yb_team_pact_pkey do update set value = excluded.value, how = excluded.how, who = excluded.who, when_text = excluded.when_text, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_lead_week_set(team_id uuid, week date, tasks text[])
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_lead_week_set.team_id; a text[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_leads_team(t) then raise exception 'permission_denied' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into a from unnest(coalesce(yb_lead_week_set.tasks, '{}')) x;
  if not public.yb_week_ok(yb_lead_week_set.week) or not (a <@ array['meet', 'cards', 'follow', 'summary', 'leaders']::text[]) then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  insert into public.yb_lead_weeks as l (team_id, week, tasks) values (t, yb_lead_week_set.week, a)
  on conflict on constraint yb_lead_weeks_pkey do update set tasks = excluded.tasks, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- the parent
create or replace function public.yb_child_journey(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.full_name, 'joined', m.user_id is not null,
      'pledge', (select jsonb_build_object('field', p.field, 'body', p.body, 'done', p.done, 'parent_note', p.parent_note)
                   from public.yb_pledges p where p.user_id = m.user_id and p.week = yb_child_journey.week),
      'kept', (select count(*) from public.yb_pledges p where p.user_id = m.user_id and p.done),
      'hifz', coalesce((select cardinality(h.ayahs) from public.yb_hifz_marks h where h.user_id = m.user_id), 0),
      'deed_days', (select count(*) from public.yb_deed_days d where d.user_id = m.user_id and d.day >= yb_child_journey.week)) order by m.full_name)
    from public.parent_links l join public.team_members m on m.id = l.member_id where l.parent_id = me), '[]'::jsonb);
end $$;

create or replace function public.yb_pledge_note(member_id uuid, week date, note text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); u uuid; n text := nullif(btrim(regexp_replace(coalesce(yb_pledge_note.note, ''), '\s+', ' ', 'g')), '');
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.parent_links l where l.parent_id = me and l.member_id = yb_pledge_note.member_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if char_length(coalesce(n, '')) > 200 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if n is not null and public.yb_has_contact(n) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  select m.user_id into u from public.team_members m where m.id = yb_pledge_note.member_id;
  update public.yb_pledges p set parent_note = n, parent_by = case when n is null then null else me end, updated_at = now()
   where p.user_id = u and p.week = yb_pledge_note.week;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- officers and the admin
create or replace function public.yb_activity_board(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare w date := yb_activity_board.week;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_is_staff() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name, 'status', t.status,
      'members', (select count(*) from public.team_members m where m.team_id = t.id),
      'joined', (select count(*) from public.team_members m where m.team_id = t.id and m.user_id is not null),
      'pledged', (select count(*) from public.yb_pledges p where p.team_id = t.id and p.week = w),
      'kept', (select count(*) from public.yb_pledges p where p.team_id = t.id and p.week = w and p.done),
      'hifz_sum', coalesce((select sum(cardinality(h.ayahs)) from public.yb_hifz_marks h join public.team_members m on m.user_id = h.user_id where m.team_id = t.id), 0),
      'active', (select count(distinct d.user_id) from public.yb_deed_days d join public.team_members m on m.user_id = d.user_id where m.team_id = t.id and d.day >= w),
      'lead_tasks', coalesce((select cardinality(l.tasks) from public.yb_lead_weeks l where l.team_id = t.id and l.week = w), 0),
      'pact', exists (select 1 from public.yb_team_pact p where p.team_id = t.id)) order by t.name)
    from public.teams t where t.status::text = 'approved'), '[]'::jsonb);
end $$;

-- the admin only: who did what (the audit log), newest first
create or replace function public.yb_activity_log(lim int default 40)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x.at desc) from (
      select a.at, a.action, p.full_name as actor, p.role::text as role
        from public.audit_log a left join public.profiles p on p.id = a.user_id
       order by a.at desc limit least(greatest(coalesce(lim, 40), 1), 100)) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.yb_my_team_id(uuid), public.yb_week_ok(date), public.yb_leads_team(uuid), public.yb_is_staff(),
  public.yb_journey_me(date), public.yb_pledge_save(date, text, text), public.yb_pledge_done(date, boolean), public.yb_hifz_set(int[]),
  public.yb_deed_mark(date, boolean), public.yb_team_journey(uuid, date), public.yb_team_board(uuid, date),
  public.yb_pact_save(uuid, text, text, text, text), public.yb_lead_week_set(uuid, date, text[]), public.yb_child_journey(date),
  public.yb_pledge_note(uuid, date, text), public.yb_activity_board(date), public.yb_activity_log(int) from public, anon, authenticated;
grant execute on function public.yb_journey_me(date), public.yb_pledge_save(date, text, text), public.yb_pledge_done(date, boolean), public.yb_hifz_set(int[]),
  public.yb_deed_mark(date, boolean), public.yb_team_journey(uuid, date), public.yb_team_board(uuid, date),
  public.yb_pact_save(uuid, text, text, text, text), public.yb_lead_week_set(uuid, date, text[]), public.yb_child_journey(date),
  public.yb_pledge_note(uuid, date, text), public.yb_activity_board(date), public.yb_activity_log(int) to authenticated;
