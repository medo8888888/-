-- =============================================================================
-- Yanabee 0003: registration workflow, competition officers, notifications,
-- sign-up app tag, join-attempt limit, leader roster status.
-- SPEC.md 4.10.1, 4.10.2, 4.10.9, 4.2.  Needs 0001 and 0002.  Idempotent.
-- ASCII only on purpose (Arabic wording lives in the client: notifications
-- carry a kind + data, never display text).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Team status gains 'returned' (needs edits); review time
-- ---------------------------------------------------------------------------
alter table public.teams drop constraint if exists teams_status_chk;
alter table public.teams add constraint teams_status_chk
  check (status in ('draft', 'submitted', 'returned', 'approved', 'rejected'));
alter table public.teams add column if not exists reviewed_at timestamptz;

-- leader of the team AND the team is still editable (draft, submitted, returned)
create or replace function public.yb_leader_can_edit(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teams x
    where x.id = t and x.leader_id = auth.uid() and x.status in ('draft', 'submitted', 'returned')
  )
$$;

drop policy if exists teams_update_leader on public.teams;
create policy teams_update_leader on public.teams for update to authenticated
  using (leader_id = (select auth.uid()) and status in ('draft', 'submitted', 'returned'))
  with check (leader_id = (select auth.uid()) and status in ('draft', 'submitted', 'returned'));

-- a client that is not admin may only move a team to draft or submitted
-- (never to returned/approved/rejected). Not SECURITY DEFINER on purpose:
-- inside the review RPCs current_user is the owner, so they pass.
create or replace function public.yb_teams_status_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.status is distinct from old.status
     and new.status not in ('draft', 'submitted')
     and not public.is_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists yb_teams_status_guard on public.teams;
create trigger yb_teams_status_guard before update on public.teams
  for each row execute function public.yb_teams_status_guard();

-- mark_consent / unlink_member: the leader may act while the team is editable
create or replace function public.mark_consent(member_id uuid, received boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  v_m  public.team_members%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if mark_consent.received is null then raise exception 'invalid_argument'; end if;
  select * into v_m from public.team_members m where m.id = mark_consent.member_id;
  if not found then raise exception 'member_not_found'; end if;
  if not (public.is_admin() or public.yb_leader_can_edit(v_m.team_id)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update public.team_members m
     set consent_status = case when mark_consent.received then 'received' else 'pending' end,
         consent_at     = case when mark_consent.received then now() else null end
   where m.id = v_m.id;
  return jsonb_build_object('ok', true,
    'consent_status', case when mark_consent.received then 'received' else 'pending' end);
end $$;

create or replace function public.unlink_member(member_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  v_m  public.team_members%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_m from public.team_members m where m.id = unlink_member.member_id;
  if not found then raise exception 'member_not_found'; end if;
  if not (public.is_admin() or public.yb_leader_can_edit(v_m.team_id)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if v_m.is_leader and not public.is_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update public.team_members m set user_id = null where m.id = v_m.id and not m.is_leader;
  delete from public.parent_links l where l.member_id = v_m.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Competition officers
-- ---------------------------------------------------------------------------
create table if not exists public.yb_officers (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  competition text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, competition),
  constraint yb_officers_comp_chk check (competition in
    ('registration', 'football', 'chess', 'projects', 'hifz', 'fahm', 'workshops'))
);
alter table public.yb_officers enable row level security;
alter table public.yb_officers force row level security;

create or replace function public.yb_is_officer_of(c text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.yb_officers o join public.profiles p on p.id = o.user_id
     where o.user_id = auth.uid() and o.competition = c and p.role = 'officer'
  )
$$;

-- admin assigns (assign=true) or removes a competition for an officer account
create or replace function public.yb_set_officer(target uuid, competition text, assign boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare cur public.user_role;
begin
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_set_officer.assign is null or yb_set_officer.competition is null or yb_set_officer.competition not in
     ('registration', 'football', 'chess', 'projects', 'hifz', 'fahm', 'workshops') then
    raise exception 'invalid_argument';
  end if;
  select p.role into cur from public.profiles p where p.id = yb_set_officer.target;
  if not found then raise exception 'user_not_found'; end if;
  if yb_set_officer.assign then
    if cur is distinct from 'officer' then raise exception 'wrong_role' using errcode = '42501'; end if;
    insert into public.yb_officers (user_id, competition) values (yb_set_officer.target, yb_set_officer.competition)
      on conflict do nothing;
  else
    delete from public.yb_officers o where o.user_id = yb_set_officer.target and o.competition = yb_set_officer.competition;
  end if;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), case when yb_set_officer.assign then 'officer_assign' else 'officer_remove' end,
          jsonb_build_object('profile_id', yb_set_officer.target, 'competition', yb_set_officer.competition));
  return jsonb_build_object('ok', true);
end $$;

-- leaving the officer role drops the assignments
create or replace function public.yb_profiles_role_cleanup()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'officer' and new.role is distinct from 'officer' then
    delete from public.yb_officers o where o.user_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists yb_profiles_role_cleanup on public.profiles;
create trigger yb_profiles_role_cleanup after update of role on public.profiles
  for each row execute function public.yb_profiles_role_cleanup();

-- the caller's own competitions (officer screen)
create or replace function public.yb_my_competitions()
returns setof text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select o.competition from public.yb_officers o join public.profiles p on p.id = o.user_id
   where o.user_id = auth.uid() and p.role = 'officer' order by 1
$$;

-- ---------------------------------------------------------------------------
-- 3. Notifications (in-app inbox). Written only by definer code.
-- ---------------------------------------------------------------------------
create table if not exists public.yb_notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  constraint yb_notif_kind_chk check (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint yb_notif_data_chk check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000)
);
create index if not exists yb_notifications_user_idx on public.yb_notifications (user_id, created_at desc);
alter table public.yb_notifications enable row level security;
alter table public.yb_notifications force row level security;

-- internal: one row per distinct recipient (null ids skipped)
create or replace function public.yb_notify(uids uuid[], kind text, data jsonb)
returns void
language sql volatile security definer
set search_path = public, pg_temp
as $$
  insert into public.yb_notifications (user_id, kind, data)
  select distinct u, kind, coalesce(data, '{}'::jsonb)
    from unnest(uids) as u
   where u is not null and exists (select 1 from public.profiles p where p.id = u)
$$;

-- mark own notifications read (all unread when ids is null); returns how many
create or replace function public.yb_mark_read(ids bigint[] default null)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update public.yb_notifications x set read_at = now()
   where x.user_id = auth.uid() and x.read_at is null
     and (yb_mark_read.ids is null or x.id = any (yb_mark_read.ids));
  get diagnostics n = row_count;
  return n;
end $$;

-- team status changes -> who must know
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

drop trigger if exists yb_teams_status_notify on public.teams;
create trigger yb_teams_status_notify after update of status on public.teams
  for each row execute function public.yb_teams_status_notify();

-- ---------------------------------------------------------------------------
-- 4. Review (admin, or an officer of 'registration')
-- ---------------------------------------------------------------------------
create or replace function public.yb_can_review()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or public.yb_is_officer_of('registration')
$$;

-- decision: 'approve' | 'return' (needs a note) | 'reject'.
-- An officer acts only on submitted teams; the admin on any team.
create or replace function public.yb_review_team(team_id uuid, decision text, note text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  st  text;
  cur text;
  nt  text := nullif(btrim(coalesce(yb_review_team.note, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_can_review() then raise exception 'permission_denied' using errcode = '42501'; end if;
  st := case yb_review_team.decision when 'approve' then 'approved' when 'return' then 'returned'
                                     when 'reject' then 'rejected' end;
  if st is null then raise exception 'invalid_argument'; end if;
  if nt is not null and char_length(nt) > 500 then raise exception 'invalid_argument'; end if;
  if st = 'returned' and nt is null then raise exception 'note_required'; end if;
  select t.status into cur from public.teams t where t.id = yb_review_team.team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if not public.is_admin() and cur is distinct from 'submitted' then raise exception 'invalid_status'; end if;
  update public.teams t set status = st, admin_note = nt, reviewed_at = now()
   where t.id = yb_review_team.team_id;
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- the review queue: no ages, no guardian data
create or replace function public.yb_review_list()
returns table (team_id uuid, team_name text, area text, status text, admin_note text,
               members int, consents int, updated_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.yb_can_review() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select t.id, t.name, t.area, t.status, t.admin_note,
           (select count(*)::int from public.team_members m where m.team_id = t.id),
           (select count(*)::int from public.team_members m where m.team_id = t.id and m.consent_status = 'received'),
           t.updated_at, t.reviewed_at
      from public.teams t
     order by case t.status when 'submitted' then 0 when 'returned' then 1 when 'draft' then 2 else 3 end,
              t.updated_at desc;
end $$;

create or replace function public.yb_review_roster(team_id uuid)
returns table (member_id uuid, full_name text, is_leader boolean, consent_status text, joined boolean)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.yb_can_review() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select m.id, m.full_name, m.is_leader, m.consent_status, m.user_id is not null
      from public.team_members m where m.team_id = yb_review_roster.team_id
     order by m.is_leader desc, m.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Leader roster status: who has joined, how many guardians are linked
-- ---------------------------------------------------------------------------
create or replace function public.yb_my_team_roster_status()
returns table (member_id uuid, joined boolean, parents int)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select m.id, m.user_id is not null,
         (select count(*)::int from public.parent_links l where l.member_id = m.id)
    from public.team_members m join public.teams t on t.id = m.team_id
   where t.leader_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 6. Sign-up app tag. The auth project is shared with another app, so a
--    Yanabee profile is created only for sign-ups tagged app = 'yanabee'.
--    yb_ensure_profile() covers accounts that log in without one.
-- ---------------------------------------------------------------------------
create or replace function public.yb_handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r    text;
  nm   text;
begin
  if jsonb_typeof(meta) is distinct from 'object' then return new; end if;
  if meta ->> 'app' is distinct from 'yanabee' then return new; end if;
  r  := meta ->> 'role';
  nm := left(btrim(coalesce(meta ->> 'full_name', '')), 80);
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, nm,
    case when r in ('leader', 'member', 'parent') then r::public.user_role else 'member'::public.user_role end)
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.yb_ensure_profile(full_name text default null, role text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  em  text;
  cur public.user_role;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select p.role into cur from public.profiles p where p.id = uid;
  if found then return jsonb_build_object('ok', true, 'created', false, 'role', cur); end if;
  select u.email into em from auth.users u where u.id = uid;
  insert into public.profiles (id, email, full_name, role)
  values (uid, em, left(btrim(coalesce(yb_ensure_profile.full_name, '')), 80),
    case when yb_ensure_profile.role in ('leader', 'member', 'parent')
         then yb_ensure_profile.role::public.user_role else 'member'::public.user_role end)
  on conflict (id) do nothing;
  select p.role into cur from public.profiles p where p.id = uid;
  return jsonb_build_object('ok', true, 'created', true, 'role', cur);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Join / link attempt limit: 10 failed attempts per user per 15 minutes.
--    Failures return {ok:false, error} instead of raising, so the attempt row
--    is kept (an exception would roll it back).
-- ---------------------------------------------------------------------------
create table if not exists public.yb_join_attempts (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists yb_join_attempts_user_idx on public.yb_join_attempts (user_id, at desc);
alter table public.yb_join_attempts enable row level security;
alter table public.yb_join_attempts force row level security;

create or replace function public.yb_join_blocked(uid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*) >= 10 from public.yb_join_attempts a
   where a.user_id = uid and a.at > now() - interval '15 minutes'
$$;

create or replace function public.yb_join_fail(uid uuid, key text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.yb_join_attempts (user_id) values (uid);
  delete from public.yb_join_attempts a where a.at < now() - interval '1 day';
  return jsonb_build_object('ok', false, 'error', key);
end $$;

create or replace function public.join_team(code text, member_name text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  c    text;
  v_t  public.teams%rowtype;
  v_m  public.team_members%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if (select p.role::text from public.profiles p where p.id = uid) is distinct from 'member' then
    raise exception 'wrong_role' using errcode = '42501';
  end if;
  if public.yb_join_blocked(uid) then return jsonb_build_object('ok', false, 'error', 'too_many_attempts'); end if;
  c := upper(regexp_replace(coalesce(join_team.code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into v_t from public.teams t where t.join_code = c;
  if not found then return public.yb_join_fail(uid, 'team_not_found'); end if;
  if public.yb_norm(join_team.member_name) = '' then return public.yb_join_fail(uid, 'name_not_in_roster'); end if;
  select * into v_m from public.team_members m
   where m.team_id = v_t.id and public.yb_norm(m.full_name) = public.yb_norm(join_team.member_name)
   for update;
  if not found then return public.yb_join_fail(uid, 'name_not_in_roster'); end if;
  if v_m.user_id is not null then return jsonb_build_object('ok', false, 'error', 'already_linked'); end if;
  if exists (select 1 from public.team_members m where m.user_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;
  update public.team_members m set user_id = uid where m.id = v_m.id;
  return jsonb_build_object('ok', true, 'team_id', v_t.id, 'member_id', v_m.id, 'team_name', v_t.name);
end $$;

create or replace function public.link_child(code text, child_name text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  c    text;
  v_t  public.teams%rowtype;
  v_m  public.team_members%rowtype;
  n    int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if (select p.role::text from public.profiles p where p.id = uid) is distinct from 'parent' then
    raise exception 'wrong_role' using errcode = '42501';
  end if;
  if public.yb_join_blocked(uid) then return jsonb_build_object('ok', false, 'error', 'too_many_attempts'); end if;
  c := upper(regexp_replace(coalesce(link_child.code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into v_t from public.teams t where t.join_code = c;
  if not found then return public.yb_join_fail(uid, 'team_not_found'); end if;
  if public.yb_norm(link_child.child_name) = '' then return public.yb_join_fail(uid, 'name_not_in_roster'); end if;
  select * into v_m from public.team_members m
   where m.team_id = v_t.id and public.yb_norm(m.full_name) = public.yb_norm(link_child.child_name);
  if not found then return public.yb_join_fail(uid, 'name_not_in_roster'); end if;
  insert into public.parent_links (parent_id, member_id) values (uid, v_m.id)
    on conflict (parent_id, member_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'already_linked'); end if;
  return jsonb_build_object('ok', true, 'team_id', v_t.id, 'member_id', v_m.id, 'team_name', v_t.name);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Policies for the new tables
-- ---------------------------------------------------------------------------
drop policy if exists yb_officers_select_admin on public.yb_officers;
drop policy if exists yb_officers_select_own   on public.yb_officers;
create policy yb_officers_select_admin on public.yb_officers for select to authenticated
  using ((select public.is_admin()));
create policy yb_officers_select_own on public.yb_officers for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists yb_notifications_select_own on public.yb_notifications;
create policy yb_notifications_select_own on public.yb_notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- yb_join_attempts: no policy at all -> invisible to every client role

-- ---------------------------------------------------------------------------
-- 9. Privileges (Supabase opens new objects to the API roles by default)
-- ---------------------------------------------------------------------------
revoke all on public.yb_officers, public.yb_notifications, public.yb_join_attempts
  from public, anon, authenticated;

revoke all on function
  public.yb_teams_status_guard(), public.yb_is_officer_of(text), public.yb_set_officer(uuid, text, boolean),
  public.yb_profiles_role_cleanup(), public.yb_my_competitions(),
  public.yb_notify(uuid[], text, jsonb), public.yb_mark_read(bigint[]), public.yb_teams_status_notify(),
  public.yb_can_review(), public.yb_review_team(uuid, text, text), public.yb_review_list(),
  public.yb_review_roster(uuid), public.yb_my_team_roster_status(),
  public.yb_handle_new_user(), public.yb_ensure_profile(text, text),
  public.yb_join_blocked(uuid), public.yb_join_fail(uuid, text),
  public.join_team(text, text), public.link_child(text, text),
  public.mark_consent(uuid, boolean), public.unlink_member(uuid), public.yb_leader_can_edit(uuid)
  from public, anon, authenticated;

grant select on public.yb_officers, public.yb_notifications to authenticated;

-- used inside policies (run as the caller)
grant execute on function public.yb_leader_can_edit(uuid), public.is_admin() to authenticated;

grant execute on function
  public.yb_set_officer(uuid, text, boolean), public.yb_my_competitions(), public.yb_mark_read(bigint[]),
  public.yb_review_team(uuid, text, text), public.yb_review_list(), public.yb_review_roster(uuid),
  public.yb_my_team_roster_status(), public.yb_ensure_profile(text, text),
  public.join_team(text, text), public.link_child(text, text),
  public.mark_consent(uuid, boolean), public.unlink_member(uuid)
  to authenticated;

comment on table public.yb_notifications is 'In-app inbox. kind + data only; the client renders the Arabic text.';
comment on table public.yb_join_attempts is 'Failed join/link attempts (rate limit). No client access.';
