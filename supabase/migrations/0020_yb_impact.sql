-- Yanabee 0020: what the documents measure, that the site could not record yet.
--   1. Attendance (method.txt m-kpis: 80 % of the meetings and 85 % of the registered still taking part;
--      leaders.txt l-targets: 90 %; competition.txt: the leaders meet the people in charge every week, in person).
--      The team's leader ticks who came to the team's weekly meeting; the admin ticks which leaders came to the
--      leaders' meeting. A member reads their own count, a parent their child's.
--      (yb_attendance of 0004 is another thing: a team's presence at a scheduled event.)
--   2. The parents' survey at the end (m-kpis: 85 % satisfied; quran.txt KPI 3: more than 80 % answer). The admin
--      opens it; a parent with a linked child answers three questions from 1 to 5 and may add a line. The admin
--      reads the numbers and the lines, never who wrote them.
--   3. yb_attend_board and yb_survey_board give the numbers of the impact report (competition.txt, 25 - 30 January).
--   4. The judge's oath: before the first score a judge gives their word to judge with justice and honesty.
-- Tables are closed; everything goes through functions.

create table if not exists public.yb_meetings (
  team_id  uuid not null references public.teams (id) on delete cascade,
  week     date not null,
  expected int not null,
  present  int not null,
  saved_by uuid references public.profiles (id) on delete set null,
  saved_at timestamptz not null default now(),
  primary key (team_id, week),
  constraint yb_mt_week check (extract(dow from week) = 6),
  constraint yb_mt_counts check (expected between 1 and 30 and present between 1 and expected)
);
create table if not exists public.yb_meet_present (
  team_id   uuid not null,
  week      date not null,
  member_id uuid not null references public.team_members (id) on delete cascade,
  primary key (team_id, week, member_id),
  constraint yb_mp_meeting foreign key (team_id, week) references public.yb_meetings (team_id, week) on delete cascade
);
create table if not exists public.yb_lead_meets (
  week     date primary key,
  invited  uuid[] not null,
  teams    uuid[] not null,
  saved_by uuid references public.profiles (id) on delete set null,
  saved_at timestamptz not null default now(),
  constraint yb_lm_week check (extract(dow from week) = 6),
  constraint yb_lm_some check (cardinality(teams) >= 1 and cardinality(invited) >= cardinality(teams))
);
create table if not exists public.yb_parent_survey (
  parent_id   uuid primary key references public.profiles (id) on delete cascade,
  q1 int not null,
  q2 int not null,
  q3 int not null,
  note        text,
  answered_at timestamptz not null default now(),
  constraint yb_ps_scale check (q1 between 1 and 5 and q2 between 1 and 5 and q3 between 1 and 5),
  constraint yb_ps_note check (note is null or char_length(note) <= 300)
);
create table if not exists public.yb_judge_oaths (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  sworn_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['yb_meetings', 'yb_meet_present', 'yb_lead_meets', 'yb_parent_survey', 'yb_judge_oaths'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
insert into public.yb_settings (key, value) values ('parent_survey_open', 'false'::jsonb) on conflict (key) do nothing;

-- the survey's opening goes with the announcements
create or replace function public.yb_note_group(kind text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
           when kind in ('result_pending', 'result_approved') or kind like 'event_%' then 'matches'
           when kind in ('submission_new', 'submission_reviewed', 'submission_featured') then 'projects'
           when kind in ('announcement', 'week_theme', 'admin_task', 'survey_open') then 'announcements'
           when kind in ('post_pending', 'comment_new') then 'feed'
         end
$$;

-- this week's Saturday or one of the two before it (attendance is often written a few days late)
create or replace function public.yb_attend_week_ok(w date)
returns boolean
language sql stable
set search_path = public, pg_temp
as $$ select w is not null and extract(dow from w) = 6 and w between current_date - 14 and current_date + 1 $$;

-- ---------------------------------------------------------------- 1. the team's weekly meeting
create or replace function public.yb_attend_get(team_id uuid, week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_attend_get.team_id; w date := yb_attend_get.week;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_leads_team(t) or public.is_admin()) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('week', to_char(w, 'YYYY-MM-DD'),
    'saved', exists (select 1 from public.yb_meetings g where g.team_id = t and g.week = w),
    'members', coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.full_name,
        'present', exists (select 1 from public.yb_meet_present a where a.team_id = t and a.week = w and a.member_id = m.id),
        'came', (select count(*) from public.yb_meet_present a where a.team_id = t and a.member_id = m.id)) order by m.full_name)
      from public.team_members m where m.team_id = t), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('week', to_char(x.week, 'YYYY-MM-DD'), 'present', x.present, 'expected', x.expected) order by x.week desc)
      from (select g.week, g.present, g.expected from public.yb_meetings g where g.team_id = t order by g.week desc limit 16) x), '[]'::jsonb),
    'meetings', (select count(*) from public.yb_meetings g where g.team_id = t),
    'present', coalesce((select sum(g.present) from public.yb_meetings g where g.team_id = t), 0),
    'expected', coalesce((select sum(g.expected) from public.yb_meetings g where g.team_id = t), 0),
    'lead', jsonb_build_object('held', (select count(*) from public.yb_lead_meets l where t = any (l.invited)),
                               'came', (select count(*) from public.yb_lead_meets l where t = any (l.teams))));
end $$;

-- the leader ticks who came. Saving with nobody ticked removes the week's record (no meeting was held).
create or replace function public.yb_attend_save(team_id uuid, week date, present_ids uuid[])
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_attend_save.team_id; w date := yb_attend_save.week; n int; k int;
  ids uuid[] := array(select distinct i from unnest(coalesce(yb_attend_save.present_ids, '{}'::uuid[])) i where i is not null);
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_leads_team(t) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams x where x.id = t and x.status::text = 'approved') then return jsonb_build_object('ok', false, 'error', 'team_not_approved'); end if;
  if not public.yb_attend_week_ok(w) then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  select count(*) into n from public.team_members m where m.team_id = t;
  k := cardinality(ids);
  if n = 0 or exists (select 1 from unnest(ids) i where not exists (select 1 from public.team_members m where m.id = i and m.team_id = t)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if k = 0 then
    delete from public.yb_meetings g where g.team_id = t and g.week = w;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;
  insert into public.yb_meetings as g (team_id, week, expected, present, saved_by, saved_at) values (t, w, n, k, auth.uid(), now())
  on conflict on constraint yb_meetings_pkey do update set expected = excluded.expected, present = excluded.present, saved_by = excluded.saved_by, saved_at = now();
  delete from public.yb_meet_present a where a.team_id = t and a.week = w;
  insert into public.yb_meet_present (team_id, week, member_id) select t, w, i from unnest(ids) i;
  return jsonb_build_object('ok', true, 'present', k, 'expected', n);
end $$;

-- a member's own count, and a parent's children
create or replace function public.yb_attend_mine()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return jsonb_build_object(
    'me', (select jsonb_build_object('held', (select count(*) from public.yb_meetings g where g.team_id = m.team_id),
                                     'came', (select count(*) from public.yb_meet_present a where a.member_id = m.id))
             from public.team_members m where m.user_id = me order by m.created_at limit 1),
    'children', coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.full_name,
        'held', (select count(*) from public.yb_meetings g where g.team_id = m.team_id),
        'came', (select count(*) from public.yb_meet_present a where a.member_id = m.id)) order by m.full_name)
      from public.parent_links l join public.team_members m on m.id = l.member_id where l.parent_id = me), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- the leaders' weekly meeting (the admin)
create or replace function public.yb_lead_meet_get(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare w date := yb_lead_meet_get.week;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('week', to_char(w, 'YYYY-MM-DD'), 'saved', exists (select 1 from public.yb_lead_meets l where l.week = w),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name, 'leader', (select p.full_name from public.profiles p where p.id = t.leader_id),
        'present', exists (select 1 from public.yb_lead_meets l where l.week = w and t.id = any (l.teams)),
        'held', (select count(*) from public.yb_lead_meets l where t.id = any (l.invited)),
        'came', (select count(*) from public.yb_lead_meets l where t.id = any (l.teams))) order by t.name)
      from public.teams t where t.status::text = 'approved'), '[]'::jsonb));
end $$;

create or replace function public.yb_lead_meet_save(week date, team_ids uuid[])
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare w date := yb_lead_meet_save.week; ok_ids uuid[] := public.yb_approved_team_ids();
  ids uuid[] := array(select distinct i from unnest(coalesce(yb_lead_meet_save.team_ids, '{}'::uuid[])) i where i is not null);
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not public.yb_attend_week_ok(w) or not (ids <@ ok_ids) then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if cardinality(ids) = 0 then
    delete from public.yb_lead_meets l where l.week = w;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;
  insert into public.yb_lead_meets as l (week, invited, teams, saved_by, saved_at) values (w, ok_ids, ids, auth.uid(), now())
  on conflict on constraint yb_lead_meets_pkey do update set invited = excluded.invited, teams = excluded.teams, saved_by = excluded.saved_by, saved_at = now();
  return jsonb_build_object('ok', true, 'present', cardinality(ids), 'expected', cardinality(ok_ids));
end $$;

-- the admin: every approved team's attendance. "recent" is how many of the roster came to one of the last two
-- meetings; match_* is the team's presence at its scheduled events, as the officers marked it (0004).
create or replace function public.yb_attend_board()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('lead_meets', (select count(*) from public.yb_lead_meets),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name,
        'members', (select count(*) from public.team_members m where m.team_id = t.id),
        'meetings', (select count(*) from public.yb_meetings g where g.team_id = t.id),
        'present', coalesce((select sum(g.present) from public.yb_meetings g where g.team_id = t.id), 0),
        'expected', coalesce((select sum(g.expected) from public.yb_meetings g where g.team_id = t.id), 0),
        'last_week', (select to_char(max(g.week), 'YYYY-MM-DD') from public.yb_meetings g where g.team_id = t.id),
        'recent', (select count(distinct a.member_id) from public.yb_meet_present a
                    where a.team_id = t.id and a.week in (select g.week from public.yb_meetings g where g.team_id = t.id order by g.week desc limit 2)),
        'lead_held', (select count(*) from public.yb_lead_meets l where t.id = any (l.invited)),
        'lead_came', (select count(*) from public.yb_lead_meets l where t.id = any (l.teams)),
        'match_marked', (select count(*) from public.yb_attendance e where e.team_id = t.id and e.presence is not null),
        'match_present', (select count(*) from public.yb_attendance e where e.team_id = t.id and e.presence = 'present')) order by t.name)
      from public.teams t where t.status::text = 'approved'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 2. the parents' survey
create or replace function public.yb_survey_is_open()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select coalesce((select s.value = 'true'::jsonb from public.yb_settings s where s.key = 'parent_survey_open'), false) $$;

create or replace function public.yb_survey_mine()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return jsonb_build_object('eligible', exists (select 1 from public.parent_links l where l.parent_id = me), 'open', public.yb_survey_is_open(),
    'answer', (select jsonb_build_object('q1', s.q1, 'q2', s.q2, 'q3', s.q3, 'note', s.note) from public.yb_parent_survey s where s.parent_id = me));
end $$;

create or replace function public.yb_survey_save(q1 int, q2 int, q3 int, note text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); n text := nullif(public.yb_clean(yb_survey_save.note), '');
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.parent_links l where l.parent_id = me) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not public.yb_survey_is_open() then return jsonb_build_object('ok', false, 'error', 'survey_closed'); end if;
  if yb_survey_save.q1 is null or yb_survey_save.q2 is null or yb_survey_save.q3 is null
     or least(yb_survey_save.q1, yb_survey_save.q2, yb_survey_save.q3) < 1 or greatest(yb_survey_save.q1, yb_survey_save.q2, yb_survey_save.q3) > 5
     or char_length(coalesce(n, '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if n is not null and public.yb_has_contact(n) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  insert into public.yb_parent_survey as s (parent_id, q1, q2, q3, note, answered_at) values (me, yb_survey_save.q1, yb_survey_save.q2, yb_survey_save.q3, n, now())
  on conflict on constraint yb_parent_survey_pkey do update set q1 = excluded.q1, q2 = excluded.q2, q3 = excluded.q3, note = excluded.note, answered_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- the admin opens or closes it; opening tells every parent with a linked child, once per opening
create or replace function public.yb_survey_open(open boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare o boolean := coalesce(yb_survey_open.open, false); was boolean := public.yb_survey_is_open();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  insert into public.yb_settings as s (key, value, updated_by, updated_at) values ('parent_survey_open', to_jsonb(o), auth.uid(), now())
  on conflict on constraint yb_settings_pkey do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  if o and not was then
    perform public.yb_notify(array(select distinct l.parent_id from public.parent_links l where l.parent_id <> auth.uid()), 'survey_open', '{}'::jsonb);
  end if;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'survey_open', jsonb_build_object('open', o));
  return jsonb_build_object('ok', true, 'open', o);
end $$;

-- the admin: numbers and the written lines, without who wrote them
create or replace function public.yb_survey_board()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('open', public.yb_survey_is_open(),
    'parents', (select count(distinct l.parent_id) from public.parent_links l),
    'answers', (select count(*) from public.yb_parent_survey),
    'satisfied', (select count(*) from public.yb_parent_survey s where s.q3 >= 4),
    'avg', (select case when count(*) = 0 then null else jsonb_build_array(round(avg(s.q1), 1), round(avg(s.q2), 1), round(avg(s.q3), 1)) end from public.yb_parent_survey s),
    'notes', coalesce((select jsonb_agg(x.note order by x.note) from (select s.note from public.yb_parent_survey s where s.note is not null order by s.answered_at desc limit 60) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 4. the judge's oath
-- Before the first score a judge gives their word, once: to judge with justice and honesty. The site keeps who
-- gave it and when; the admin reads it beside each judge's name.
create or replace function public.yb_judge_oath_mine()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return jsonb_build_object('judge', exists (select 1 from public.yb_judges j where j.user_id = me),
    'sworn_at', (select o.sworn_at from public.yb_judge_oaths o where o.user_id = me));
end $$;

create or replace function public.yb_judge_oath_take()
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); fresh boolean;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.yb_judges j where j.user_id = me) then raise exception 'permission_denied' using errcode = '42501'; end if;
  fresh := not exists (select 1 from public.yb_judge_oaths o where o.user_id = me);
  if fresh then
    insert into public.yb_judge_oaths (user_id) values (me);
    insert into public.audit_log (user_id, action, detail) values (me, 'judge_oath', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'sworn_at', (select o.sworn_at from public.yb_judge_oaths o where o.user_id = me));
end $$;

create or replace function public.yb_judge_oaths()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', o.user_id, 'sworn_at', o.sworn_at) order by o.sworn_at) from public.yb_judge_oaths o), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.yb_attend_week_ok(date), public.yb_attend_get(uuid, date), public.yb_attend_save(uuid, date, uuid[]), public.yb_attend_mine(),
  public.yb_lead_meet_get(date), public.yb_lead_meet_save(date, uuid[]), public.yb_attend_board(), public.yb_survey_is_open(), public.yb_survey_mine(),
  public.yb_survey_save(int, int, int, text), public.yb_survey_open(boolean), public.yb_survey_board(),
  public.yb_judge_oath_mine(), public.yb_judge_oath_take(), public.yb_judge_oaths() from public, anon, authenticated;
grant execute on function public.yb_attend_get(uuid, date), public.yb_attend_save(uuid, date, uuid[]), public.yb_attend_mine(),
  public.yb_lead_meet_get(date), public.yb_lead_meet_save(date, uuid[]), public.yb_attend_board(), public.yb_survey_mine(),
  public.yb_survey_save(int, int, int, text), public.yb_survey_open(boolean), public.yb_survey_board(),
  public.yb_judge_oath_mine(), public.yb_judge_oath_take(), public.yb_judge_oaths() to authenticated;
