-- Yanabee 0010: judging and final results (SPEC 4.3; competition.txt c-score, c-rubric).
--
-- c-score: hifz 10, fahm 15, tatbiq 45, football 20, chess 10 = 100.
-- c-rubric (tatbiq, 45): roles 10, execution 30, documentation 5.
--
-- Judges: the admin chooses them (yb_set_judge). A judge's account must be a
-- parent or an admin (the owner's rule), never a team leader, member or officer.
-- A judge scores the criteria of the axes given to them (hifz, fahm, tatbiq), one
-- score per team and criterion, and must write WHY (the reason, 3 to 500
-- letters). A judge never scores a team their own child is in, nor a team they
-- lead or play in (conflict_of_interest). When several judges score the same
-- criterion, the team gets their average. Football and chess points are entered
-- by the admin, also with a reason (the documents do not say how the league and
-- the cup turn into points).
--
-- Nothing is public until the admin publishes (yb_settings.results_published).
-- After that: the ranking is public (team names and points only), and a team's
-- people (leader, joined members, linked parents) read their own breakdown with
-- the reasons, without the judges' names. The admin always sees everything,
-- names included. While results are published, scores are locked.
--
-- Judges of tatbiq read the ACCEPTED projects of the teams (0008) and their photos.
-- ASCII only.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.yb_judges (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  axes        text[] not null,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint yb_judges_axes_chk check (cardinality(axes) between 1 and 3 and axes <@ array['hifz', 'fahm', 'tatbiq'])
);

create table if not exists public.yb_judge_scores (
  team_id    uuid not null references public.teams (id) on delete cascade,
  judge_id   uuid not null references public.profiles (id) on delete cascade,
  criterion  text not null,
  points     numeric(5, 2) not null,
  reason     text not null,
  updated_at timestamptz not null default now(),
  constraint yb_judge_scores_pkey primary key (team_id, judge_id, criterion),
  constraint yb_js_crit_chk check (criterion in ('hifz', 'fahm', 'roles', 'execution', 'documentation')),
  constraint yb_js_reason_len check (char_length(btrim(reason)) between 3 and 500),
  constraint yb_js_points_chk check (points >= 0)
);

create table if not exists public.yb_admin_scores (
  team_id    uuid not null references public.teams (id) on delete cascade,
  axis       text not null,
  points     numeric(5, 2) not null,
  reason     text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint yb_admin_scores_pkey primary key (team_id, axis),
  constraint yb_as_axis_chk check (axis in ('football', 'chess')),
  constraint yb_as_reason_len check (char_length(btrim(reason)) between 3 and 500),
  constraint yb_as_points_chk check (points >= 0)
);

create table if not exists public.yb_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.yb_settings (key, value) values ('results_published', 'false'::jsonb) on conflict (key) do nothing;

alter table public.yb_judges enable row level security;
alter table public.yb_judges force row level security;
alter table public.yb_judge_scores enable row level security;
alter table public.yb_judge_scores force row level security;
alter table public.yb_admin_scores enable row level security;
alter table public.yb_admin_scores force row level security;
alter table public.yb_settings enable row level security;
alter table public.yb_settings force row level security;

-- ---------------------------------------------------------------------------
-- 2. Rules
-- ---------------------------------------------------------------------------
-- the caps of c-score / c-rubric (a test reads competition.txt and checks these)
create or replace function public.yb_crit_cap(c text)
returns numeric
language sql immutable
set search_path = public, pg_temp
as $$
  select case c when 'hifz' then 10 when 'fahm' then 15 when 'roles' then 10 when 'execution' then 30
                when 'documentation' then 5 when 'tatbiq' then 45 when 'football' then 20 when 'chess' then 10 end::numeric
$$;

create or replace function public.yb_crit_axis(c text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case when c in ('roles', 'execution', 'documentation') then 'tatbiq' when c in ('hifz', 'fahm') then c end
$$;

create or replace function public.yb_results_published()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (s.value)::text = 'true' from public.yb_settings s where s.key = 'results_published'), false)
$$;

-- is the caller a judge of this axis (any axis when null)?
create or replace function public.yb_is_judge(axis text default null)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.yb_judges j
                  where j.user_id = auth.uid() and (yb_is_judge.axis is null or yb_is_judge.axis = any (j.axes)))
     and coalesce(public.yb_role() in ('parent', 'admin'), false)
$$;

-- the caller has a child in this team, or leads or plays in it
create or replace function public.yb_judge_conflict(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select t in (select public.yb_my_team_ids())
      or exists (select 1 from public.parent_links l join public.team_members m on m.id = l.member_id
                  where l.parent_id = auth.uid() and m.team_id = t)
$$;

-- the teams in the competition: approved and holding a place
create or replace function public.yb_judged_team(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.teams x where x.id = t and x.status = 'approved' and coalesce(x.waitlist, false) = false)
$$;

-- ---------------------------------------------------------------------------
-- 3. The admin: judges, football and chess, publication
-- ---------------------------------------------------------------------------
-- axes empty or null = no longer a judge (their scores stay, for the record)
create or replace function public.yb_set_judge(target uuid, axes text[])
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare r text; ax text[] := coalesce(yb_set_judge.axes, '{}');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select p.role::text into r from public.profiles p where p.id = yb_set_judge.target;
  if r is null then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;
  if cardinality(ax) = 0 then
    delete from public.yb_judges j where j.user_id = yb_set_judge.target;
    insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'judge_removed', jsonb_build_object('target', yb_set_judge.target));
    return jsonb_build_object('ok', true, 'axes', '[]'::jsonb);
  end if;
  if r not in ('parent', 'admin') then return jsonb_build_object('ok', false, 'error', 'judge_role'); end if;
  if not (ax <@ array['hifz', 'fahm', 'tatbiq']) then raise exception 'invalid_argument'; end if;
  select coalesce(array_agg(distinct a order by a), '{}') into ax from unnest(ax) a;
  insert into public.yb_judges as j (user_id, axes, assigned_by) values (yb_set_judge.target, ax, auth.uid())
  on conflict (user_id) do update set axes = excluded.axes, assigned_by = excluded.assigned_by;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'judge_set', jsonb_build_object('target', yb_set_judge.target, 'axes', to_jsonb(ax)));
  perform public.yb_notify(array[yb_set_judge.target], 'judge_assigned', jsonb_build_object('axes', to_jsonb(ax)));
  return jsonb_build_object('ok', true, 'axes', to_jsonb(ax));
end $$;

create or replace function public.yb_judges_list()
returns table (user_id uuid, full_name text, role text, axes text[], scored int)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select j.user_id, p.full_name, p.role::text, j.axes,
           (select count(*)::int from public.yb_judge_scores s where s.judge_id = j.user_id)
      from public.yb_judges j join public.profiles p on p.id = j.user_id
     order by p.full_name;
end $$;

create or replace function public.yb_admin_score(team_id uuid, axis text, points numeric, reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare rs text := btrim(coalesce(yb_admin_score.reason, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_admin_score.axis not in ('football', 'chess') then raise exception 'invalid_argument'; end if;
  if public.yb_results_published() then return jsonb_build_object('ok', false, 'error', 'results_published'); end if;
  if not public.yb_judged_team(yb_admin_score.team_id) then return jsonb_build_object('ok', false, 'error', 'bad_team'); end if;
  if yb_admin_score.points is null then
    delete from public.yb_admin_scores s where s.team_id = yb_admin_score.team_id and s.axis = yb_admin_score.axis;
    return jsonb_build_object('ok', true);
  end if;
  if yb_admin_score.points < 0 or yb_admin_score.points > public.yb_crit_cap(yb_admin_score.axis) then
    return jsonb_build_object('ok', false, 'error', 'bad_points');
  end if;
  if char_length(rs) < 3 or char_length(rs) > 500 then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
  insert into public.yb_admin_scores as s (team_id, axis, points, reason, updated_by)
  values (yb_admin_score.team_id, yb_admin_score.axis, round(yb_admin_score.points, 2), rs, auth.uid())
  on conflict on constraint yb_admin_scores_pkey do update
     set points = excluded.points, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 4. The judge
-- ---------------------------------------------------------------------------
-- {axes:[...], published, teams:[{team_id, name, conflict, scores:{criterion:{points, reason}}}]}
create or replace function public.yb_my_judging()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare ax text[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_is_judge(null) then return jsonb_build_object('axes', '[]'::jsonb); end if;
  select j.axes into ax from public.yb_judges j where j.user_id = auth.uid();
  return jsonb_build_object('axes', to_jsonb(ax), 'published', public.yb_results_published(), 'teams', coalesce((
    select jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name, 'conflict', public.yb_judge_conflict(t.id),
             'scores', coalesce((select jsonb_object_agg(s.criterion, jsonb_build_object('points', s.points, 'reason', s.reason))
                                   from public.yb_judge_scores s where s.team_id = t.id and s.judge_id = auth.uid()), '{}'::jsonb))
           order by t.name)
      from public.teams t where public.yb_judged_team(t.id)), '[]'::jsonb));
end $$;

-- points null = clear this score
create or replace function public.yb_judge_score(team_id uuid, criterion text, points numeric, reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  ax text := public.yb_crit_axis(yb_judge_score.criterion);
  rs text := btrim(coalesce(yb_judge_score.reason, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if ax is null then raise exception 'invalid_argument'; end if;
  if not public.yb_is_judge(ax) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if public.yb_results_published() then return jsonb_build_object('ok', false, 'error', 'results_published'); end if;
  if not public.yb_judged_team(yb_judge_score.team_id) then return jsonb_build_object('ok', false, 'error', 'bad_team'); end if;
  if public.yb_judge_conflict(yb_judge_score.team_id) then return jsonb_build_object('ok', false, 'error', 'conflict_of_interest'); end if;
  if yb_judge_score.points is null then
    delete from public.yb_judge_scores s where s.team_id = yb_judge_score.team_id and s.judge_id = auth.uid() and s.criterion = yb_judge_score.criterion;
    return jsonb_build_object('ok', true);
  end if;
  if yb_judge_score.points < 0 or yb_judge_score.points > public.yb_crit_cap(yb_judge_score.criterion) then
    return jsonb_build_object('ok', false, 'error', 'bad_points');
  end if;
  if char_length(rs) < 3 or char_length(rs) > 500 then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
  insert into public.yb_judge_scores as s (team_id, judge_id, criterion, points, reason)
  values (yb_judge_score.team_id, auth.uid(), yb_judge_score.criterion, round(yb_judge_score.points, 2), rs)
  on conflict on constraint yb_judge_scores_pkey do update set points = excluded.points, reason = excluded.reason, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Totals
-- ---------------------------------------------------------------------------
-- per team: the average of the judges per criterion, the axes, the total and the rank (ties share a rank)
create or replace function public.yb_team_totals()
returns table (team_id uuid, team_name text, hifz numeric, fahm numeric, roles numeric, execution numeric, documentation numeric,
               tatbiq numeric, football numeric, chess numeric, total numeric, rank int)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with t as (select x.id, x.name from public.teams x where x.status = 'approved' and coalesce(x.waitlist, false) = false),
  c as (select s.team_id, s.criterion, round(avg(s.points), 2) as pts from public.yb_judge_scores s group by s.team_id, s.criterion),
  a as (
    select t.id, t.name,
           (select c.pts from c where c.team_id = t.id and c.criterion = 'hifz') as hifz,
           (select c.pts from c where c.team_id = t.id and c.criterion = 'fahm') as fahm,
           (select c.pts from c where c.team_id = t.id and c.criterion = 'roles') as roles,
           (select c.pts from c where c.team_id = t.id and c.criterion = 'execution') as execution,
           (select c.pts from c where c.team_id = t.id and c.criterion = 'documentation') as documentation,
           (select s.points from public.yb_admin_scores s where s.team_id = t.id and s.axis = 'football') as football,
           (select s.points from public.yb_admin_scores s where s.team_id = t.id and s.axis = 'chess') as chess
      from t),
  b as (
    select a.*,
           case when a.roles is null and a.execution is null and a.documentation is null then null
                else coalesce(a.roles, 0) + coalesce(a.execution, 0) + coalesce(a.documentation, 0) end as tatbiq
      from a)
  select b.id, b.name, b.hifz, b.fahm, b.roles, b.execution, b.documentation, b.tatbiq, b.football, b.chess,
         coalesce(b.hifz, 0) + coalesce(b.fahm, 0) + coalesce(b.tatbiq, 0) + coalesce(b.football, 0) + coalesce(b.chess, 0),
         (rank() over (order by coalesce(b.hifz, 0) + coalesce(b.fahm, 0) + coalesce(b.tatbiq, 0) + coalesce(b.football, 0) + coalesce(b.chess, 0) desc))::int
    from b
$$;

-- the admin: every team's totals plus every score with its judge and reason
create or replace function public.yb_results_board()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('published', public.yb_results_published(),
    'teams', coalesce((select jsonb_agg(to_jsonb(x) order by x.rank, x.team_name) from public.yb_team_totals() x), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object('team_id', s.team_id, 'judge', p.full_name, 'criterion', s.criterion,
                          'points', s.points, 'reason', s.reason, 'at', s.updated_at) order by s.team_id, s.criterion, p.full_name)
                          from public.yb_judge_scores s join public.profiles p on p.id = s.judge_id), '[]'::jsonb),
    'admin', coalesce((select jsonb_agg(jsonb_build_object('team_id', s.team_id, 'axis', s.axis, 'points', s.points, 'reason', s.reason))
                         from public.yb_admin_scores s), '[]'::jsonb));
end $$;

create or replace function public.yb_publish_results(publish boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare was boolean := public.yb_results_published();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  insert into public.yb_settings as s (key, value, updated_by) values ('results_published', to_jsonb(coalesce(yb_publish_results.publish, false)), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'results_publish', jsonb_build_object('published', coalesce(yb_publish_results.publish, false)));
  if coalesce(yb_publish_results.publish, false) and not was then
    perform public.yb_notify(array(select p.id from public.profiles p where p.id <> auth.uid()), 'results_published', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'published', coalesce(yb_publish_results.publish, false));
end $$;

-- everybody, after publication: team names and points only
create or replace function public.yb_public_results()
returns table (team_name text, hifz numeric, fahm numeric, tatbiq numeric, football numeric, chess numeric, total numeric, rank int)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.team_name, x.hifz, x.fahm, x.tatbiq, x.football, x.chess, x.total, x.rank
    from public.yb_team_totals() x
   where public.yb_results_published()
   order by x.rank, x.team_name
$$;

-- a team's people, after publication: the breakdown and the reasons, no judge names
create or replace function public.yb_my_scores()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_results_published() then return jsonb_build_object('published', false, 'teams', '[]'::jsonb); end if;
  return jsonb_build_object('published', true, 'teams', coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object(
             'reasons', coalesce((select jsonb_agg(jsonb_build_object('criterion', s.criterion, 'points', s.points, 'reason', s.reason) order by s.criterion, s.updated_at)
                                   from public.yb_judge_scores s where s.team_id = x.team_id), '[]'::jsonb),
             'admin', coalesce((select jsonb_agg(jsonb_build_object('axis', s.axis, 'points', s.points, 'reason', s.reason))
                                 from public.yb_admin_scores s where s.team_id = x.team_id), '[]'::jsonb)))
      from public.yb_team_totals() x
     where public.yb_is_team_person(x.team_id)), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Judges of tatbiq read the accepted projects (0008)
-- ---------------------------------------------------------------------------
drop policy if exists yb_sub_select_judge on public.yb_submissions;
create policy yb_sub_select_judge on public.yb_submissions for select to authenticated
  using (status = 'accepted' and (select public.yb_is_judge('tatbiq')));

create or replace function public.yb_sub_judge_can_read(path text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.yb_is_judge('tatbiq')
     and exists (select 1 from public.yb_submissions s
                  where s.id = public.yb_try_uuid(split_part(coalesce(path, ''), '/', 2)) and s.status = 'accepted'
                    and s.team_id = public.yb_try_uuid(split_part(coalesce(path, ''), '/', 1)))
$$;

drop policy if exists yb_sub_obj_select_judge on storage.objects;
create policy yb_sub_obj_select_judge on storage.objects for select to authenticated
  using (bucket_id = 'yanabee-submissions' and (select public.yb_sub_judge_can_read(name)));

-- ---------------------------------------------------------------------------
-- 7. Privileges
-- ---------------------------------------------------------------------------
revoke all on public.yb_judges, public.yb_judge_scores, public.yb_admin_scores, public.yb_settings from public, anon, authenticated;

revoke all on function
  public.yb_crit_cap(text), public.yb_crit_axis(text), public.yb_results_published(), public.yb_is_judge(text),
  public.yb_judge_conflict(uuid), public.yb_judged_team(uuid), public.yb_set_judge(uuid, text[]), public.yb_judges_list(),
  public.yb_admin_score(uuid, text, numeric, text), public.yb_my_judging(), public.yb_judge_score(uuid, text, numeric, text),
  public.yb_team_totals(), public.yb_results_board(), public.yb_publish_results(boolean), public.yb_public_results(),
  public.yb_my_scores(), public.yb_sub_judge_can_read(text)
  from public, anon, authenticated;

-- used inside policies (run as the caller)
grant execute on function public.yb_is_judge(text), public.yb_sub_judge_can_read(text) to authenticated;
grant execute on function
  public.yb_set_judge(uuid, text[]), public.yb_judges_list(), public.yb_admin_score(uuid, text, numeric, text),
  public.yb_my_judging(), public.yb_judge_score(uuid, text, numeric, text), public.yb_results_board(),
  public.yb_publish_results(boolean), public.yb_my_scores()
  to authenticated;
grant execute on function public.yb_public_results(), public.yb_results_published() to anon, authenticated;

comment on table public.yb_judge_scores is 'One score per judge, team and criterion, always with the reason. Private until the admin publishes.';
