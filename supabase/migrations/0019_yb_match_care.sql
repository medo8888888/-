-- Yanabee 0019: what the documents ask for around a match and around the leaders, that had no screen yet.
--   1. The match's people (competition.txt lg3, lg5, lg8): the committee names a referee for every match, and an adult
--      in charge of safety with a first-aid kit. yb_event_staff holds them for an event of the schedule.
--   2. The record of injuries and emergencies (lg5): the incident is documented, a player with a suspected head
--      injury does not return, and the committee decides whether the match continues or is replayed.
--      No child is named: the record says the team and what happened.
--   3. The leader's notebook and the weekly leadership review (leaders.txt l-notebook, l-review): each week the
--      team's leader writes the task, the role carried out, the skill learned, the difficulty and the next step;
--      the supervisor adds a short note and rates four criteria of 25 each. The notebook is about the leader's own
--      learning (l-shadow: a minor keeps no data about their peers).
-- Tables are closed; everything goes through functions.

create table if not exists public.yb_event_staff (
  event_id   uuid primary key references public.yb_events (id) on delete cascade,
  referee    text,
  safety     text,
  first_aid  boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint yb_es_ref check (referee is null or char_length(referee) between 2 and 60),
  constraint yb_es_safe check (safety is null or char_length(safety) between 2 and 60)
);
create table if not exists public.yb_incidents (
  id          bigint generated always as identity primary key,
  team_id     uuid references public.teams (id) on delete set null,
  match_label text not null,
  kind        text not null,
  happened_at timestamptz not null,
  summary     text not null,
  action      text,
  returned    boolean not null default false,
  decision    text not null default 'pending',
  decision_note text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_by  uuid references public.profiles (id) on delete set null,
  decided_at  timestamptz,
  constraint yb_in_kind check (kind in ('injury', 'head', 'emergency')),
  constraint yb_in_label check (char_length(match_label) between 3 and 120),
  constraint yb_in_summary check (char_length(summary) between 10 and 500),
  constraint yb_in_action check (action is null or char_length(action) <= 300),
  constraint yb_in_head check (not (kind = 'head' and returned)),
  constraint yb_in_decision check (decision in ('pending', 'none', 'continue', 'replay')),
  constraint yb_in_note check (decision_note is null or char_length(decision_note) <= 300)
);
create table if not exists public.yb_lead_notes (
  team_id    uuid not null references public.teams (id) on delete cascade,
  week       date not null,
  task       text not null default '',
  role_done  text not null default '',
  skill      text not null default '',
  challenge  text not null default '',
  next_step  text not null default '',
  sup_note   text,
  c1 int, c2 int, c3 int, c4 int,
  written_at  timestamptz,
  reviewed_at timestamptz,
  primary key (team_id, week),
  constraint yb_ln_week check (extract(dow from week) = 6),
  constraint yb_ln_len check (char_length(task) <= 200 and char_length(role_done) <= 200 and char_length(skill) <= 200 and char_length(challenge) <= 200 and char_length(next_step) <= 200),
  constraint yb_ln_note check (sup_note is null or char_length(sup_note) <= 300),
  constraint yb_ln_scores check (coalesce(c1, 0) between 0 and 25 and coalesce(c2, 0) between 0 and 25 and coalesce(c3, 0) between 0 and 25 and coalesce(c4, 0) between 0 and 25)
);
do $$ declare t text; begin
  foreach t in array array['yb_event_staff', 'yb_incidents', 'yb_lead_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace function public.yb_clean(t text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$ select btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')) $$;

-- ---------------------------------------------------------------- 1. the match's people
create or replace function public.yb_event_staff_set(event_id uuid, referee text default null, safety text default null, first_aid boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare e public.yb_events; r text := nullif(public.yb_clean(yb_event_staff_set.referee), ''); s text := nullif(public.yb_clean(yb_event_staff_set.safety), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into e from public.yb_events x where x.id = yb_event_staff_set.event_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.yb_can_manage(e.competition) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if char_length(coalesce(r, 'xx')) not between 2 and 60 or char_length(coalesce(s, 'xx')) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if public.yb_has_contact(coalesce(r, '')) or public.yb_has_contact(coalesce(s, '')) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  insert into public.yb_event_staff as x (event_id, referee, safety, first_aid, updated_by) values (e.id, r, s, coalesce(yb_event_staff_set.first_aid, false), auth.uid())
  on conflict on constraint yb_event_staff_pkey do update set referee = excluded.referee, safety = excluded.safety, first_aid = excluded.first_aid, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- staff read all; a team's people (leader, joined members, linked parents) read those of their own team's events
create or replace function public.yb_event_staff_list()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); staff boolean; mine uuid[];
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  staff := exists (select 1 from public.profiles p where p.id = me and p.role::text in ('admin', 'officer'));
  select coalesce(array_agg(x), '{}') into mine from (
    select public.yb_my_team_ids() as x
    union select m.team_id from public.parent_links l join public.team_members m on m.id = l.member_id where l.parent_id = me) q;
  return coalesce((select jsonb_agg(jsonb_build_object('event_id', s.event_id, 'referee', s.referee, 'safety', s.safety, 'first_aid', s.first_aid))
    from public.yb_event_staff s join public.yb_events e on e.id = s.event_id where staff or e.team_ids && mine), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- 2. injuries and emergencies
create or replace function public.yb_incident_view(i public.yb_incidents)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', i.id, 'team_id', i.team_id, 'team_name', (select t.name from public.teams t where t.id = i.team_id), 'match', i.match_label, 'kind', i.kind,
    'happened_at', i.happened_at, 'summary', i.summary, 'action', i.action, 'returned', i.returned, 'decision', i.decision, 'decision_note', i.decision_note, 'created_at', i.created_at)
$$;

-- recorded by the admin or the football officer
create or replace function public.yb_incident_add(match_label text, kind text, happened_at timestamptz, summary text, team_id uuid default null, action text default null, returned boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare lb text := public.yb_clean(yb_incident_add.match_label); sm text := public.yb_clean(yb_incident_add.summary); ac text := nullif(public.yb_clean(yb_incident_add.action), ''); new_id bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_can_manage('football') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_incident_add.kind not in ('injury', 'head', 'emergency') or char_length(lb) not between 3 and 120 or char_length(sm) not between 10 and 500
     or char_length(coalesce(ac, '')) > 300 or yb_incident_add.happened_at is null or yb_incident_add.happened_at > now() + interval '5 minutes'
     or yb_incident_add.happened_at < now() - interval '14 days' then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if yb_incident_add.kind = 'head' and coalesce(yb_incident_add.returned, false) then return jsonb_build_object('ok', false, 'error', 'head_no_return'); end if;
  if yb_incident_add.team_id is not null and not exists (select 1 from public.teams t where t.id = yb_incident_add.team_id) then return jsonb_build_object('ok', false, 'error', 'team_not_found'); end if;
  if public.yb_has_contact(lb) or public.yb_has_contact(sm) or public.yb_has_contact(coalesce(ac, '')) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  insert into public.yb_incidents (team_id, match_label, kind, happened_at, summary, action, returned, created_by)
  values (yb_incident_add.team_id, lb, yb_incident_add.kind, yb_incident_add.happened_at, sm, ac, coalesce(yb_incident_add.returned, false), auth.uid()) returning id into new_id;
  perform public.yb_notify(array(select p.id from public.profiles p where p.role::text = 'admin' and p.id <> auth.uid()), 'incident_new', jsonb_build_object('kind', yb_incident_add.kind));
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'incident_add', jsonb_build_object('incident_id', new_id, 'kind', yb_incident_add.kind));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.yb_incidents_list()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_can_manage('football') then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('can_decide', public.is_admin(), 'rows', coalesce((select jsonb_agg(public.yb_incident_view(i) order by (i.decision = 'pending') desc, i.created_at desc)
    from (select * from public.yb_incidents order by created_at desc limit 100) i), '[]'::jsonb));
end $$;

-- the committee's decision (the admin): nothing more needed, the match continues later, or it is replayed
create or replace function public.yb_incident_decide(id bigint, decision text, note text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare n text := nullif(public.yb_clean(yb_incident_decide.note), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_incident_decide.decision not in ('none', 'continue', 'replay') or char_length(coalesce(n, '')) > 300 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if n is not null and public.yb_has_contact(n) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  update public.yb_incidents i set decision = yb_incident_decide.decision, decision_note = n, decided_by = auth.uid(), decided_at = now() where i.id = yb_incident_decide.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'incident_decide', jsonb_build_object('incident_id', yb_incident_decide.id, 'decision', yb_incident_decide.decision));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- 3. the leader's notebook and the weekly review
create or replace function public.yb_note_view(n public.yb_lead_notes)
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object('week', to_char(n.week, 'YYYY-MM-DD'), 'task', n.task, 'role_done', n.role_done, 'skill', n.skill, 'challenge', n.challenge, 'next_step', n.next_step,
    'sup_note', n.sup_note, 'scores', case when n.reviewed_at is null then null else jsonb_build_array(n.c1, n.c2, n.c3, n.c4) end,
    'total', case when n.reviewed_at is null then null else coalesce(n.c1, 0) + coalesce(n.c2, 0) + coalesce(n.c3, 0) + coalesce(n.c4, 0) end, 'written', n.written_at is not null)
$$;

create or replace function public.yb_notebook_save(team_id uuid, week date, task text, role_done text, skill text, challenge text, next_step text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_notebook_save.team_id; w date := yb_notebook_save.week;
  a text := public.yb_clean(yb_notebook_save.task); b text := public.yb_clean(yb_notebook_save.role_done); c text := public.yb_clean(yb_notebook_save.skill);
  d text := public.yb_clean(yb_notebook_save.challenge); e text := public.yb_clean(yb_notebook_save.next_step);
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid()) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if w is null or extract(dow from w) <> 6 or w not between current_date - 7 and current_date + 1 or char_length(a) < 3
     or greatest(char_length(a), char_length(b), char_length(c), char_length(d), char_length(e)) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if public.yb_has_contact(a || ' ' || b || ' ' || c || ' ' || d || ' ' || e) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  insert into public.yb_lead_notes as n (team_id, week, task, role_done, skill, challenge, next_step, written_at) values (t, w, a, b, c, d, e, now())
  on conflict on constraint yb_lead_notes_pkey do update set task = excluded.task, role_done = excluded.role_done, skill = excluded.skill, challenge = excluded.challenge,
    next_step = excluded.next_step, written_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_notebook_mine(team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_notebook_mine.team_id;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid()) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(public.yb_note_view(n) order by n.week desc) from (select * from public.yb_lead_notes x where x.team_id = t order by x.week desc limit 16) n), '[]'::jsonb);
end $$;

-- the supervisor (the admin): every approved team's page for a week
create or replace function public.yb_notebook_admin(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name, 'leader', (select p.full_name from public.profiles p where p.id = t.leader_id),
      'page', (select public.yb_note_view(n) from public.yb_lead_notes n where n.team_id = t.id and n.week = yb_notebook_admin.week)) order by t.name)
    from public.teams t where t.status::text = 'approved'), '[]'::jsonb);
end $$;

create or replace function public.yb_notebook_review(team_id uuid, week date, note text, c1 int, c2 int, c3 int, c4 int)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_notebook_review.team_id; w date := yb_notebook_review.week; n text := nullif(public.yb_clean(yb_notebook_review.note), ''); ld uuid; fresh boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select x.leader_id into ld from public.teams x where x.id = t and x.status::text = 'approved';
  if not found then return jsonb_build_object('ok', false, 'error', 'team_not_found'); end if;
  if w is null or extract(dow from w) <> 6 or w not between current_date - 28 and current_date + 1 or char_length(coalesce(n, '')) > 300
     or yb_notebook_review.c1 is null or yb_notebook_review.c2 is null or yb_notebook_review.c3 is null or yb_notebook_review.c4 is null
     or least(yb_notebook_review.c1, yb_notebook_review.c2, yb_notebook_review.c3, yb_notebook_review.c4) < 0
     or greatest(yb_notebook_review.c1, yb_notebook_review.c2, yb_notebook_review.c3, yb_notebook_review.c4) > 25 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if n is not null and public.yb_has_contact(n) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  fresh := not exists (select 1 from public.yb_lead_notes x where x.team_id = t and x.week = w and x.reviewed_at is not null);
  insert into public.yb_lead_notes as x (team_id, week, sup_note, c1, c2, c3, c4, reviewed_at)
  values (t, w, n, yb_notebook_review.c1, yb_notebook_review.c2, yb_notebook_review.c3, yb_notebook_review.c4, now())
  on conflict on constraint yb_lead_notes_pkey do update set sup_note = excluded.sup_note, c1 = excluded.c1, c2 = excluded.c2, c3 = excluded.c3, c4 = excluded.c4, reviewed_at = now();
  if fresh then perform public.yb_notify(array[ld], 'lead_review', jsonb_build_object('total', yb_notebook_review.c1 + yb_notebook_review.c2 + yb_notebook_review.c3 + yb_notebook_review.c4)); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.yb_clean(text), public.yb_event_staff_set(uuid, text, text, boolean), public.yb_event_staff_list(), public.yb_incident_view(public.yb_incidents),
  public.yb_incident_add(text, text, timestamptz, text, uuid, text, boolean), public.yb_incidents_list(), public.yb_incident_decide(bigint, text, text),
  public.yb_note_view(public.yb_lead_notes), public.yb_notebook_save(uuid, date, text, text, text, text, text), public.yb_notebook_mine(uuid), public.yb_notebook_admin(date),
  public.yb_notebook_review(uuid, date, text, int, int, int, int) from public, anon, authenticated;
grant execute on function public.yb_event_staff_set(uuid, text, text, boolean), public.yb_event_staff_list(),
  public.yb_incident_add(text, text, timestamptz, text, uuid, text, boolean), public.yb_incidents_list(), public.yb_incident_decide(bigint, text, text),
  public.yb_notebook_save(uuid, date, text, text, text, text, text), public.yb_notebook_mine(uuid), public.yb_notebook_admin(date),
  public.yb_notebook_review(uuid, date, text, int, int, int, int) to authenticated;
