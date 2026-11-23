-- =============================================================================
-- 0025_yb_news.sql -- big changes reach people at once (owner, 22 Nov 2026: "if there is any change it pops up
-- like news or notification, like qualified or postponed or disqualified").
--
--   1. Disqualification: the admin removes a team that is in the competition, with a reason. It leaves at once
--      (status rejected, so it drops out of the tables, the judging and the public list, and the first reserve
--      team takes its place through the 0006 triggers); its coming dates are cancelled. Its people are told
--      why; every judge is told the team is out and their scores for it no longer count; the other teams'
--      leaders are told.
--   2. Postponed: a date can be postponed (no new time yet). Its teams are told.
--   3. Qualified: when the group stage ends the admin confirms the qualifying teams; each one's people are told,
--      and everyone else in the competition hears who qualified.
--   4. The judge's page lists the teams that left, so the judge knows they are no longer to be judged.
-- The pages show each of these as a pop-up the moment it arrives, and as a phone alert (yb-push).
-- ASCII only. Idempotent: safe to run again.
-- =============================================================================

-- ---------------------------------------------------------------- 1. disqualification
alter table public.teams add column if not exists disqualified_at timestamptz;
alter table public.teams add column if not exists disqualify_reason text;
alter table public.teams drop constraint if exists teams_dq_reason_len;
alter table public.teams add constraint teams_dq_reason_len check (disqualify_reason is null or char_length(disqualify_reason) <= 300);

create or replace function public.yb_team_disqualify(team_id uuid, reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  t public.teams;
  rs text := btrim(regexp_replace(coalesce(yb_team_disqualify.reason, ''), '\s+', ' ', 'g'));
  judges uuid[]; leaders uuid[]; n_ev int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into t from public.teams x where x.id = yb_team_disqualify.team_id for update;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.yb_in_play(t.id) then return jsonb_build_object('ok', false, 'error', 'not_in_play'); end if;
  if char_length(rs) < 5 or char_length(rs) > 300 then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
  if public.yb_has_contact(rs) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;

  update public.teams x set disqualified_at = now(), disqualify_reason = rs, admin_note = rs, status = 'rejected'
   where x.id = t.id;
  -- its coming dates are called off (the other team hears it through the schedule alerts)
  update public.yb_events e set status = 'cancelled'
   where t.id = any (e.team_ids) and e.starts_at > now() and e.status <> 'cancelled';
  get diagnostics n_ev = row_count;

  perform public.yb_notify(public.yb_team_people(array[t.id]), 'team_disqualified',
    jsonb_build_object('team_id', t.id, 'team_name', t.name, 'note', rs));
  select coalesce(array_agg(j.user_id), '{}') into judges from public.yb_judges j;
  perform public.yb_notify(judges, 'judge_team_out', jsonb_build_object('team_id', t.id, 'team_name', t.name));
  select coalesce(array_agg(x.leader_id), '{}') into leaders from public.teams x
   where x.id <> t.id and x.leader_id is not null and public.yb_in_play(x.id);
  perform public.yb_notify(leaders, 'team_out', jsonb_build_object('team_id', t.id, 'team_name', t.name));
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'team_disqualified', jsonb_build_object('team_id', t.id, 'events_cancelled', n_ev));
  return jsonb_build_object('ok', true, 'events_cancelled', n_ev);
end $$;

-- the ordinary status alert stays quiet for a disqualification (yb_team_disqualify says it with the reason)
create or replace function public.yb_teams_status_notify()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  d jsonb;
  reviewers uuid[];
  people uuid[];
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.disqualified_at is not null and old.disqualified_at is distinct from new.disqualified_at then return null; end if;
  d := jsonb_build_object('team_id', new.id, 'team_name', new.name, 'from', old.status, 'to', new.status,
                          'note', new.admin_note);
  -- the leader hears about every change someone else made
  if new.leader_id is distinct from auth.uid() then
    perform public.yb_notify(array[new.leader_id], 'team_status', d);
  end if;
  -- a (re)submitted team waits for the reviewers
  if new.status = 'submitted' then
    select coalesce(array_agg(distinct x.id), '{}') into reviewers from (
      select p.id from public.profiles p where p.role = 'admin'
      union
      select o.user_id from public.yb_officers o join public.profiles p on p.id = o.user_id
       where o.competition = 'registration' and p.role = 'officer'
    ) x;
    perform public.yb_notify(reviewers, 'team_submitted',
      jsonb_build_object('team_id', new.id, 'team_name', new.name));
  end if;
  -- approval reaches the linked members and parents too
  if new.status = 'approved' then
    select coalesce(array_agg(distinct x.u), '{}') into people from (
      select m.user_id as u from public.team_members m where m.team_id = new.id and not m.is_leader
      union
      select l.parent_id from public.parent_links l join public.team_members m on m.id = l.member_id
       where m.team_id = new.id
    ) x;
    perform public.yb_notify(people, 'team_approved', jsonb_build_object('team_id', new.id, 'team_name', new.name));
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- 2. postponed dates
alter table public.yb_events drop constraint if exists yb_events_status_chk;
alter table public.yb_events add constraint yb_events_status_chk check (status in ('scheduled', 'changed', 'cancelled', 'postponed'));

create or replace function public.yb_events_notify()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  k     text;
  tids  uuid[];
  d     jsonb;
begin
  if new.starts_at < now() - interval '1 day' then return null; end if;
  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then return null; end if;
    k := 'event_new';
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    k := 'event_cancelled';
  elsif new.status = 'postponed' and old.status is distinct from 'postponed' then
    k := 'event_postponed';
  elsif new.starts_at is distinct from old.starts_at or new.place is distinct from old.place
        or new.team_ids is distinct from old.team_ids
        or (old.status = 'cancelled' and new.status <> 'cancelled') then
    k := 'event_changed';
  else
    return null;
  end if;
  tids := new.team_ids;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(distinct u), '{}') into tids from unnest(new.team_ids || old.team_ids) as u;
  end if;
  if cardinality(tids) = 0 then
    select coalesce(array_agg(t.id), '{}') into tids from public.teams t where t.status = 'approved';
  end if;
  d := jsonb_build_object('event_id', new.id, 'title', new.title, 'starts_at', new.starts_at,
                          'place', new.place, 'competition', new.competition, 'kind', new.kind, 'note', new.note);
  perform public.yb_notify(public.yb_team_people(tids), k, d);
  return null;
end $$;

-- ---------------------------------------------------------------- 3. qualified teams
create table if not exists public.yb_qualified (
  team_id      uuid primary key references public.teams (id) on delete cascade,
  announced_at timestamptz not null default now(),
  announced_by uuid references public.profiles (id) on delete set null
);
alter table public.yb_qualified enable row level security;
alter table public.yb_qualified force row level security;
revoke all on public.yb_qualified from public, anon, authenticated;

-- the admin confirms the qualifying teams (the board computes them); only the newly named ones are announced
create or replace function public.yb_announce_qualified(team_ids uuid[])
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  ids uuid[]; fresh uuid[]; names jsonb; others uuid[]; x record;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct u), '{}') into ids from unnest(coalesce(yb_announce_qualified.team_ids, '{}')) u where u is not null;
  if cardinality(ids) < 1 or cardinality(ids) > 12 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if exists (select 1 from unnest(ids) u where not public.yb_in_play(u)) then return jsonb_build_object('ok', false, 'error', 'not_in_play'); end if;
  select coalesce(array_agg(u), '{}') into fresh from unnest(ids) u where not exists (select 1 from public.yb_qualified q where q.team_id = u);
  if cardinality(fresh) = 0 then return jsonb_build_object('ok', true, 'announced', 0); end if;
  insert into public.yb_qualified (team_id, announced_by) select u, auth.uid() from unnest(fresh) u;
  for x in select t.id, t.name from public.teams t where t.id = any (fresh) loop
    perform public.yb_notify(public.yb_team_people(array[x.id]), 'team_qualified', jsonb_build_object('team_id', x.id, 'team_name', x.name));
  end loop;
  select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb) into names from public.teams t where t.id = any (fresh);
  select coalesce(array_agg(t.id), '{}') into others from public.teams t where public.yb_in_play(t.id) and not (t.id = any (fresh));
  perform public.yb_notify(
    array(select u from unnest(public.yb_team_people(others)) u except select u from unnest(public.yb_team_people(fresh)) u),
    'qualified_announced', jsonb_build_object('names', names));
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'qualified_announced', jsonb_build_object('teams', to_jsonb(fresh)));
  return jsonb_build_object('ok', true, 'announced', cardinality(fresh));
end $$;

-- who has qualified so far (team names are public anyway)
create or replace function public.yb_qualified_list()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name, 'announced_at', q.announced_at) order by t.name), '[]'::jsonb)
    from public.yb_qualified q join public.teams t on t.id = q.team_id
   where public.yb_in_play(t.id)
$$;

-- ---------------------------------------------------------------- 4. the judge's page: teams that left
-- {axes:[...], published, teams:[{team_id, name, conflict, scores}], removed:[{team_id, name, at, my_scores}]}
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
      from public.teams t where public.yb_judged_team(t.id)), '[]'::jsonb),
    'removed', coalesce((
    select jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name, 'at', t.disqualified_at,
             'my_scores', (select count(*) from public.yb_judge_scores s where s.team_id = t.id and s.judge_id = auth.uid()))
           order by t.disqualified_at desc)
      from public.teams t where t.disqualified_at is not null and t.status = 'rejected'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.yb_team_disqualify(uuid, text), public.yb_announce_qualified(uuid[]), public.yb_qualified_list()
  from public, anon, authenticated;
grant execute on function public.yb_team_disqualify(uuid, text), public.yb_announce_qualified(uuid[]), public.yb_qualified_list()
  to authenticated;

comment on table public.yb_qualified is 'Teams the admin confirmed as qualified for the final round (each announced once).';
