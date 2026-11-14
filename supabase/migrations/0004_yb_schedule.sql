-- =============================================================================
-- Yanabee 0004: unified schedule (matches, rounds, workshops, recitation dates),
-- alerts to the teams concerned, and attendance (leader RSVP, officer check-in).
-- SPEC.md 4.10.3 and 4.11.  Needs 0001-0003.  Idempotent.  ASCII only.
-- =============================================================================

create table if not exists public.yb_events (
  id          uuid primary key default gen_random_uuid(),
  competition text not null,
  kind        text not null default 'other',
  title       text not null,
  starts_at   timestamptz not null,
  place       text,
  team_ids    uuid[] not null default '{}',
  category    text,
  status      text not null default 'scheduled',
  note        text,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint yb_events_comp_chk   check (competition in ('registration', 'football', 'chess', 'projects', 'hifz', 'fahm', 'workshops')),
  constraint yb_events_kind_chk   check (kind in ('match', 'round', 'workshop', 'recitation', 'other')),
  constraint yb_events_title_chk  check (char_length(btrim(title)) between 2 and 80),
  constraint yb_events_place_chk  check (place is null or char_length(place) <= 80),
  constraint yb_events_cat_chk    check (category is null or char_length(category) <= 40),
  constraint yb_events_note_chk   check (note is null or char_length(note) <= 300),
  constraint yb_events_teams_chk  check (cardinality(team_ids) <= 12),
  constraint yb_events_status_chk check (status in ('scheduled', 'changed', 'cancelled'))
);
create index if not exists yb_events_starts_idx on public.yb_events (starts_at);
alter table public.yb_events enable row level security;
alter table public.yb_events force row level security;

create table if not exists public.yb_attendance (
  event_id     uuid not null references public.yb_events (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  rsvp         text,
  rsvp_at      timestamptz,
  presence     text,
  late_minutes int,
  marked_at    timestamptz,
  marked_by    uuid,
  primary key (event_id, team_id),
  constraint yb_att_rsvp_chk     check (rsvp is null or rsvp in ('yes', 'no')),
  constraint yb_att_presence_chk check (presence is null or presence in ('present', 'absent')),
  constraint yb_att_late_chk     check (late_minutes is null or late_minutes between 0 and 600)
);
create index if not exists yb_attendance_team_idx on public.yb_attendance (team_id);
alter table public.yb_attendance enable row level security;
alter table public.yb_attendance force row level security;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
-- admin, or an officer of that competition
create or replace function public.yb_can_manage(c text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or public.yb_is_officer_of(c)
$$;

create or replace function public.yb_event_comp(e uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.competition from public.yb_events x where x.id = e
$$;

-- does event e concern team t? (empty team list = every approved team)
create or replace function public.yb_event_has_team(e uuid, t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.yb_events x
     where x.id = e
       and (t = any (x.team_ids)
            or (cardinality(x.team_ids) = 0
                and exists (select 1 from public.teams y where y.id = t and y.status = 'approved')))
  )
$$;

-- everyone who must hear about the given teams: leaders, joined members, linked parents
create or replace function public.yb_team_people(tids uuid[])
returns uuid[]
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select t.leader_id as u from public.teams t where t.id = any (tids)
    union
    select m.user_id from public.team_members m where m.team_id = any (tids) and m.user_id is not null
    union
    select l.parent_id from public.parent_links l join public.team_members m on m.id = l.member_id
     where m.team_id = any (tids)
  ) x where u is not null
$$;

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------
create or replace function public.yb_events_biu()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  new.title    := btrim(new.title);
  new.place    := nullif(btrim(coalesce(new.place, '')), '');
  new.category := nullif(btrim(coalesce(new.category, '')), '');
  new.note     := nullif(btrim(coalesce(new.note, '')), '');
  select coalesce(array_agg(distinct u), '{}') into new.team_ids from unnest(new.team_ids) as u where u is not null;
  select count(*) into n from public.teams t where t.id = any (new.team_ids);
  if n <> cardinality(new.team_ids) then raise exception 'invalid_team' using errcode = 'P0001'; end if;
  new.updated_by := auth.uid();
  new.updated_at := clock_timestamp();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status is distinct from 'cancelled' then new.status := 'scheduled'; end if;
  elsif new.status = old.status and old.status <> 'cancelled'
        and (new.starts_at is distinct from old.starts_at or new.place is distinct from old.place) then
    new.status := 'changed';
  end if;
  return new;
end $$;

drop trigger if exists yb_events_biu on public.yb_events;
create trigger yb_events_biu before insert or update on public.yb_events
  for each row execute function public.yb_events_biu();

-- alerts: a new date, a changed time/place/teams, a cancellation (not for dates long past)
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
                          'place', new.place, 'competition', new.competition, 'kind', new.kind);
  perform public.yb_notify(public.yb_team_people(tids), k, d);
  return null;
end $$;

drop trigger if exists yb_events_notify on public.yb_events;
create trigger yb_events_notify after insert or update on public.yb_events
  for each row execute function public.yb_events_notify();

-- ---------------------------------------------------------------------------
-- RPCs: attendance
-- ---------------------------------------------------------------------------
-- the team leader confirms (yes) or declines (no), or clears (null), before the start
create or replace function public.yb_rsvp(event_id uuid, team_id uuid, answer text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_e public.yb_events%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if yb_rsvp.answer is not null and yb_rsvp.answer not in ('yes', 'no') then raise exception 'invalid_argument'; end if;
  if not exists (select 1 from public.teams t where t.id = yb_rsvp.team_id and t.leader_id = auth.uid()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select * into v_e from public.yb_events x where x.id = yb_rsvp.event_id;
  if not found then raise exception 'event_not_found'; end if;
  if not public.yb_event_has_team(v_e.id, yb_rsvp.team_id) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_e.status = 'cancelled' then raise exception 'event_cancelled'; end if;
  if v_e.starts_at <= now() then raise exception 'event_started'; end if;
  insert into public.yb_attendance as a (event_id, team_id, rsvp, rsvp_at)
  values (v_e.id, yb_rsvp.team_id, yb_rsvp.answer, case when yb_rsvp.answer is null then null else now() end)
  on conflict on constraint yb_attendance_pkey do update
    set rsvp = excluded.rsvp, rsvp_at = excluded.rsvp_at;
  return jsonb_build_object('ok', true, 'rsvp', yb_rsvp.answer);
end $$;

-- the officer (or admin) records who came: present (+ minutes late) or absent; null clears
create or replace function public.yb_mark_attendance(event_id uuid, team_id uuid, presence text default null, late_minutes int default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_e public.yb_events%rowtype;
  lm  int := yb_mark_attendance.late_minutes;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_e from public.yb_events x where x.id = yb_mark_attendance.event_id;
  if not found then raise exception 'event_not_found'; end if;
  if not public.yb_can_manage(v_e.competition) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_mark_attendance.presence is not null and yb_mark_attendance.presence not in ('present', 'absent') then
    raise exception 'invalid_argument';
  end if;
  if lm is not null and (lm < 0 or lm > 600) then raise exception 'invalid_argument'; end if;
  if yb_mark_attendance.presence is distinct from 'present' then lm := null; end if;
  if not public.yb_event_has_team(v_e.id, yb_mark_attendance.team_id) then raise exception 'invalid_team'; end if;
  insert into public.yb_attendance as a (event_id, team_id, presence, late_minutes, marked_at, marked_by)
  values (v_e.id, yb_mark_attendance.team_id, yb_mark_attendance.presence, lm,
          case when yb_mark_attendance.presence is null then null else now() end, auth.uid())
  on conflict on constraint yb_attendance_pkey do update
    set presence = excluded.presence, late_minutes = excluded.late_minutes,
        marked_at = excluded.marked_at, marked_by = excluded.marked_by;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'attendance', jsonb_build_object('event_id', v_e.id, 'team_id', yb_mark_attendance.team_id,
          'presence', yb_mark_attendance.presence, 'late_minutes', lm));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------
drop policy if exists yb_events_select_public on public.yb_events;
drop policy if exists yb_events_select_auth   on public.yb_events;
drop policy if exists yb_events_insert        on public.yb_events;
drop policy if exists yb_events_update        on public.yb_events;
drop policy if exists yb_events_delete_admin  on public.yb_events;
-- the public sees dates for everyone and dates between approved teams only (team names are public then)
create policy yb_events_select_public on public.yb_events for select to anon
  using (team_ids <@ (select coalesce(array_agg(p.id), '{}') from public.public_teams p));
create policy yb_events_select_auth on public.yb_events for select to authenticated
  using (true);
create policy yb_events_insert on public.yb_events for insert to authenticated
  with check ((select public.yb_can_manage(competition)));
create policy yb_events_update on public.yb_events for update to authenticated
  using ((select public.yb_can_manage(competition)))
  with check ((select public.yb_can_manage(competition)));
create policy yb_events_delete_admin on public.yb_events for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists yb_attendance_select on public.yb_attendance;
create policy yb_attendance_select on public.yb_attendance for select to authenticated
  using ((select public.yb_can_manage(public.yb_event_comp(event_id))) or (select public.yb_is_team_leader(team_id)));

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------
revoke all on public.yb_events, public.yb_attendance from public, anon, authenticated;
revoke all on function
  public.yb_can_manage(text), public.yb_event_comp(uuid), public.yb_event_has_team(uuid, uuid),
  public.yb_team_people(uuid[]), public.yb_events_biu(), public.yb_events_notify(),
  public.yb_rsvp(uuid, uuid, text), public.yb_mark_attendance(uuid, uuid, text, int)
  from public, anon, authenticated;

grant select on public.yb_events to anon, authenticated;
grant insert (competition, kind, title, starts_at, place, team_ids, category, note, status) on public.yb_events to authenticated;
grant update (competition, kind, title, starts_at, place, team_ids, category, note, status) on public.yb_events to authenticated;
grant delete on public.yb_events to authenticated;
grant select on public.yb_attendance to authenticated;

-- used inside policies (run as the caller)
grant execute on function public.yb_can_manage(text), public.yb_event_comp(uuid), public.yb_is_team_leader(uuid) to authenticated;
grant execute on function public.yb_rsvp(uuid, uuid, text), public.yb_mark_attendance(uuid, uuid, text, int) to authenticated;

comment on table public.yb_events is 'Unified schedule. Titles/places are typed by admins/officers: never a child''s name.';
comment on table public.yb_attendance is 'Leader RSVP + officer check-in per event and team.';
