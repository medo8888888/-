-- =============================================================================
-- مشروع ينابيع — Yanabee competition app — backend schema (Supabase / PostgreSQL)
-- Contract: docs/YANABEE_APP.md   |   Idempotent: safe to run more than once.
--
-- Security model in one paragraph
--   * The anon key is PUBLIC. Everything is protected by Row Level Security (RLS,
--     enabled and FORCED on every table) + column grants + SECURITY DEFINER
--     functions that check auth.uid() themselves.
--   * Privacy law of the project: a child's name is never public. Public readers
--     (anon) can read ONLY: view public_teams (approved team names) and
--     tournament_state (team ids + names; chess player labels are stripped).
--   * Guardian data (guardian_name, guardian_phone) and the age of a child are
--     readable only by: the team leader, the child's own linked parent, the
--     child itself (own row), admins. Teammates see roster NAMES only, through
--     the view my_roster (never through the table).
--   * Roles cannot be escalated: profiles.role changes only through set_admin()
--     (postgres/service_role only) or set_user_role() (admin only).
--   * Recursion safety: policies never query a table whose policies query the
--     first one; cross-table checks go through SECURITY DEFINER helpers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role' and n.nspname = 'public'
  ) then
    create type public.user_role as enum ('admin', 'leader', 'member', 'parent');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Pure helpers (no table access)
-- ---------------------------------------------------------------------------

-- Name normalisation used for uniqueness and for matching join/link requests:
--   lower(trim(collapse-whitespace(name))) after removing Arabic diacritics
--   (tashkeel U+064B-065F, dagger alef U+0670), tatweel U+0640 and invisible
--   direction marks, and unifying alef forms (أ إ آ ٱ -> ا), alef maqsura
--   (ى -> ي) and ta marbuta (ة -> ه), so that typing variants of the same name
--   match, while different names stay different.
create or replace function public.yb_norm(txt text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select lower(btrim(regexp_replace(
    translate(
      regexp_replace(
        coalesce(txt, ''),
        '[ً-ٰٟـ​-‏‪-‮⁦-⁩﻿]',
        '', 'g'),
      U&'\0623\0625\0622\0671\0649\0629',
      U&'\0627\0627\0627\0627\064A\0647'),
    '[\s ]+', ' ', 'g'), ' '))
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        public.user_role not null default 'member',
  phone       text,
  created_at  timestamptz not null default now(),
  constraint profiles_full_name_len check (char_length(full_name) <= 80),
  constraint profiles_phone_len     check (phone is null or char_length(phone) <= 30)
);

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  area        text,
  leader_id   uuid references public.profiles (id) on delete set null,
  join_code   text not null,
  status      text not null default 'draft',
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint teams_name_len   check (char_length(btrim(name)) between 2 and 60),
  constraint teams_area_len   check (area is null or char_length(area) <= 60),
  constraint teams_note_len   check (admin_note is null or char_length(admin_note) <= 500),
  constraint teams_status_chk check (status in ('draft', 'submitted', 'approved', 'rejected')),
  -- 6 chars, no ambiguous characters 0 O 1 I L
  constraint teams_code_chk   check (join_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$')
);

create table if not exists public.team_members (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams (id) on delete cascade,
  full_name        text not null,
  age              int,
  guardian_name    text,
  guardian_phone   text,
  is_leader        boolean not null default false,
  user_id          uuid references public.profiles (id) on delete set null,
  consent_status   text not null default 'pending',
  consent_at       timestamptz,
  created_at       timestamptz not null default now(),
  constraint members_name_len    check (char_length(btrim(full_name)) between 2 and 80),
  constraint members_age_chk     check (age is null or age between 4 and 100),
  constraint members_gname_len   check (guardian_name is null or char_length(guardian_name) <= 80),
  constraint members_gphone_len  check (guardian_phone is null or char_length(guardian_phone) <= 30),
  constraint members_consent_chk check (consent_status in ('pending', 'received'))
);

create table if not exists public.parent_links (
  parent_id  uuid not null references public.profiles (id) on delete cascade,
  member_id  uuid not null references public.team_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, member_id)
);

create table if not exists public.tournament_state (
  id          int primary key,
  state       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint tournament_state_one_row check (id = 1),
  constraint tournament_state_object check (jsonb_typeof(state) = 'object')
);

create table if not exists public.audit_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  user_id  uuid,
  action   text not null,
  detail   jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create unique index if not exists teams_name_norm_uq      on public.teams (public.yb_norm(name));
create unique index if not exists teams_join_code_uq      on public.teams (join_code);
create unique index if not exists teams_leader_uq         on public.teams (leader_id);
create index        if not exists teams_status_idx        on public.teams (status);
create index        if not exists team_members_team_idx   on public.team_members (team_id);
create unique index if not exists team_members_name_uq    on public.team_members (team_id, public.yb_norm(full_name));
create unique index if not exists team_members_leader_uq  on public.team_members (team_id) where is_leader;
create unique index if not exists team_members_user_uq    on public.team_members (user_id) where user_id is not null;
create index        if not exists parent_links_member_idx on public.parent_links (member_id);
create index        if not exists audit_log_at_idx        on public.audit_log (at desc);
create index        if not exists audit_log_user_idx      on public.audit_log (user_id);

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER helpers used by policies and views (no recursion:
--    they read tables as the owner, bypassing RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

create or replace function public.yb_role()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.role::text from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.yb_is_team_leader(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid())
$$;

-- leader of the team AND the team is still editable (draft or submitted)
create or replace function public.yb_leader_can_edit(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teams x
    where x.id = t and x.leader_id = auth.uid() and x.status in ('draft', 'submitted')
  )
$$;

create or replace function public.yb_is_parent_of(m uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.parent_links l where l.parent_id = auth.uid() and l.member_id = m)
$$;

-- teams the caller leads or belongs to as a linked member (NOT parents)
create or replace function public.yb_my_team_ids()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.id from public.teams x where x.leader_id = auth.uid()
  union
  select m.team_id from public.team_members m where m.user_id = auth.uid()
$$;

-- true when the statement comes from a PostgREST client (role set by SET ROLE),
-- false in the SQL editor / service_role / migrations.
create or replace function public.yb_is_client()
returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(current_setting('role', true), '') in ('anon', 'authenticated')
$$;

-- 6-char join code without ambiguous characters (0 O 1 I L), unique among teams.
-- Entropy comes from gen_random_uuid() (CSPRNG). Internal use only (no grants).
create or replace function public.yb_new_join_code()
returns text
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 symbols
  bytes bytea;
  code  text;
  i     int;
  tries int := 0;
begin
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    code := '';
    for i in 0..5 loop        -- bytes 0..5 of a v4 uuid are fully random
      code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.teams t where t.join_code = code);
    tries := tries + 1;
    if tries > 50 then raise exception 'join_code_exhausted'; end if;
  end loop;
  return code;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

-- 5.1 sign-up: create the profile. Role comes from the sign-up metadata ONLY if
-- it is one of leader/member/parent; anything else (admin, junk) -> member.
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
  if jsonb_typeof(meta) is distinct from 'object' then meta := '{}'::jsonb; end if;
  r  := meta ->> 'role';
  nm := left(btrim(coalesce(meta ->> 'full_name', '')), 80);
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email, nm,
    case when r in ('leader', 'member', 'parent') then r::public.user_role else 'member'::public.user_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.yb_sync_email()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles p set email = new.email where p.id = new.id and p.email is distinct from new.email;
  return new;
end $$;

drop trigger if exists yb_on_auth_user_created on auth.users;
create trigger yb_on_auth_user_created
  after insert on auth.users
  for each row execute function public.yb_handle_new_user();

drop trigger if exists yb_on_auth_user_email on auth.users;
create trigger yb_on_auth_user_email
  after update of email on auth.users
  for each row execute function public.yb_sync_email();

-- backfill profiles for users who signed up before this migration
insert into public.profiles (id, email, full_name, role)
select u.id, u.email,
       left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 80),
       case when u.raw_user_meta_data ->> 'role' in ('leader', 'member', 'parent')
            then (u.raw_user_meta_data ->> 'role')::public.user_role
            else 'member'::public.user_role end
from auth.users u
on conflict (id) do nothing;

-- 5.2 updated_at (teams, tournament_state)
create or replace function public.yb_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := clock_timestamp();
  if tg_table_name = 'tournament_state' then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists yb_teams_touch on public.teams;
create trigger yb_teams_touch before update on public.teams
  for each row execute function public.yb_touch_updated_at();

drop trigger if exists yb_state_touch on public.tournament_state;
create trigger yb_state_touch before insert or update on public.tournament_state
  for each row execute function public.yb_touch_updated_at();

-- 5.3 profiles: a client can never change role / email / id (defence in depth on
-- top of the column grants). current_user is the function owner inside
-- SECURITY DEFINER functions (set_admin, set_user_role), so they are allowed.
create or replace function public.yb_profiles_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.role is distinct from old.role
    or new.email is distinct from old.email
    or new.id is distinct from old.id
    or new.created_at is distinct from old.created_at) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists yb_profiles_guard on public.profiles;
create trigger yb_profiles_guard before update on public.profiles
  for each row execute function public.yb_profiles_guard();

-- 5.4 teams: clients cannot choose leader/status/code/note on insert
create or replace function public.yb_teams_bi()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.name := btrim(new.name);
  if public.yb_is_client() then
    new.leader_id  := auth.uid();
    new.status     := 'draft';
    new.admin_note := null;
    new.join_code  := public.yb_new_join_code();
  elsif new.join_code is null then
    new.join_code := public.yb_new_join_code();
  end if;
  return new;
end $$;

drop trigger if exists yb_teams_bi on public.teams;
create trigger yb_teams_bi before insert on public.teams
  for each row execute function public.yb_teams_bi();

-- the leader's own roster row is created with the team
create or replace function public.yb_teams_ai()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare nm text;
begin
  if new.leader_id is not null then
    select nullif(btrim(p.full_name), '') into nm from public.profiles p where p.id = new.leader_id;
    insert into public.team_members (team_id, full_name, is_leader, user_id)
    values (new.id, coalesce(nm, U&'\0642\0627\0626\062F \0627\0644\0641\0631\064A\0642'), true, new.leader_id);
  end if;
  return new;
end $$;

drop trigger if exists yb_teams_ai on public.teams;
create trigger yb_teams_ai after insert on public.teams
  for each row execute function public.yb_teams_ai();

-- submitting needs 5-7 members (including the leader), per the registration form
create or replace function public.yb_teams_bu()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  new.name := btrim(new.name);
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select count(*) into n from public.team_members m where m.team_id = new.id;
    if n < 5 or n > 7 then
      raise exception 'members_count_invalid' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists yb_teams_bu on public.teams;
create trigger yb_teams_bu before update on public.teams
  for each row execute function public.yb_teams_bu();

-- 5.5 team_members: at most 7 per team. AFTER INSERT on purpose: RLS WITH CHECK
-- has already run, so outsiders get a plain "permission denied" and learn nothing
-- about a team's size. The row lock on the team serialises concurrent inserts.
create or replace function public.yb_members_ai()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  perform 1 from public.teams t where t.id = new.team_id for update;
  select count(*) into n from public.team_members m where m.team_id = new.team_id;
  if n > 7 then
    raise exception 'team_full' using errcode = 'P0001';
  end if;
  return null;
end $$;

-- names are stored trimmed
create or replace function public.yb_members_bi()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.full_name := btrim(new.full_name);
  return new;
end $$;

drop trigger if exists yb_members_bi on public.team_members;
create trigger yb_members_bi before insert on public.team_members
  for each row execute function public.yb_members_bi();
drop trigger if exists yb_members_ai on public.team_members;
create trigger yb_members_ai after insert on public.team_members
  for each row execute function public.yb_members_ai();

-- 5.6 audit log (ids and status words only — never names, ages or phones)
create or replace function public.yb_audit_tg()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare act text; d jsonb;
begin
  if tg_table_name = 'teams' then
    if tg_op = 'INSERT' then
      act := 'team_create'; d := jsonb_build_object('team_id', new.id);
    elsif tg_op = 'DELETE' then
      act := 'team_delete'; d := jsonb_build_object('team_id', old.id);
    elsif new.status is distinct from old.status then
      act := 'team_status'; d := jsonb_build_object('team_id', new.id, 'from', old.status, 'to', new.status);
    end if;
  elsif tg_table_name = 'team_members' then
    if tg_op = 'INSERT' then
      act := 'member_add'; d := jsonb_build_object('member_id', new.id, 'team_id', new.team_id);
    elsif tg_op = 'DELETE' then
      act := 'member_remove'; d := jsonb_build_object('member_id', old.id, 'team_id', old.team_id);
    elsif new.consent_status is distinct from old.consent_status then
      act := 'consent'; d := jsonb_build_object('member_id', new.id, 'from', old.consent_status, 'to', new.consent_status);
    elsif new.user_id is distinct from old.user_id then
      act := case when new.user_id is null then 'member_unlink' else 'member_link' end;
      d := jsonb_build_object('member_id', new.id);
    end if;
  elsif tg_table_name = 'parent_links' then
    if tg_op = 'INSERT' then
      act := 'child_link'; d := jsonb_build_object('member_id', new.member_id);
    else
      act := 'child_unlink'; d := jsonb_build_object('member_id', old.member_id);
    end if;
  elsif tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
      act := 'role_change'; d := jsonb_build_object('profile_id', new.id, 'from', old.role, 'to', new.role);
    end if;
  elsif tg_table_name = 'tournament_state' then
    act := 'state_publish'; d := jsonb_build_object('updated_at', new.updated_at);
  end if;

  if act is not null then
    insert into public.audit_log (user_id, action, detail) values (auth.uid(), act, d);
  end if;
  return null;
end $$;

drop trigger if exists yb_audit_teams on public.teams;
create trigger yb_audit_teams after insert or update or delete on public.teams
  for each row execute function public.yb_audit_tg();
drop trigger if exists yb_audit_members on public.team_members;
create trigger yb_audit_members after insert or update or delete on public.team_members
  for each row execute function public.yb_audit_tg();
drop trigger if exists yb_audit_links on public.parent_links;
create trigger yb_audit_links after insert or delete on public.parent_links
  for each row execute function public.yb_audit_tg();
drop trigger if exists yb_audit_profiles on public.profiles;
create trigger yb_audit_profiles after update on public.profiles
  for each row execute function public.yb_audit_tg();
drop trigger if exists yb_audit_state on public.tournament_state;
create trigger yb_audit_state after insert or update on public.tournament_state
  for each row execute function public.yb_audit_tg();

-- ---------------------------------------------------------------------------
-- 6. Views (explicit column lists; owner-run so they can read what the
--    caller's table privileges/policies would hide)
-- ---------------------------------------------------------------------------
drop view if exists public.public_teams;
drop view if exists public.my_roster;
drop view if exists public.my_children;

-- approved teams only; name + area; NO child data
create view public.public_teams with (security_barrier = true) as
  select t.id, t.name, t.area
  from public.teams t
  where t.status = 'approved';

-- roster NAMES of the team the caller leads or belongs to. No age, no guardian,
-- no consent of others (consent only on the caller's own row).
create view public.my_roster with (security_barrier = true) as
  select m.id        as member_id,
         m.team_id   as team_id,
         m.full_name as full_name,
         m.is_leader as is_leader,
         (m.user_id is not null) as joined,
         (m.user_id is not distinct from auth.uid()) as is_me,
         case when m.user_id is not distinct from auth.uid() then m.consent_status end as consent_status
  from public.team_members m
  where auth.uid() is not null
    and m.team_id in (select public.yb_my_team_ids());

-- the children linked to the calling parent, with their team and consent status
create view public.my_children with (security_barrier = true) as
  select m.id         as member_id,
         m.full_name  as full_name,
         m.age        as age,
         m.is_leader  as is_leader,
         m.consent_status as consent_status,
         m.consent_at as consent_at,
         t.id         as team_id,
         t.name       as team_name,
         t.area       as team_area,
         t.status     as team_status
  from public.parent_links l
  join public.team_members m on m.id = l.member_id
  join public.teams t on t.id = m.team_id
  where l.parent_id = auth.uid();

-- ---------------------------------------------------------------------------
-- 7. Row Level Security: enabled on every table; FORCED when the owner can
--    bypass RLS (Supabase `postgres` has BYPASSRLS, so our SECURITY DEFINER
--    functions keep working). Otherwise the migration keeps it enabled only
--    and says so, instead of breaking every function.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  owner_bypasses boolean;
begin
  select (r.rolsuper or r.rolbypassrls) into owner_bypasses from pg_roles r where r.rolname = current_user;
  foreach t in array array['profiles', 'teams', 'team_members', 'parent_links', 'tournament_state', 'audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    if coalesce(owner_bypasses, false) then
      execute format('alter table public.%I force row level security', t);
    else
      raise notice 'FORCE ROW LEVEL SECURITY skipped for %: the migration role cannot bypass RLS', t;
    end if;
  end loop;
end $$;

-- profiles --------------------------------------------------------------
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_own   on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_admin on public.profiles for select to authenticated
  using ((select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- no insert (trigger only), no delete (cascade from auth.users)

-- teams -----------------------------------------------------------------
drop policy if exists teams_select_admin  on public.teams;
drop policy if exists teams_select_leader on public.teams;
drop policy if exists teams_insert_leader on public.teams;
drop policy if exists teams_insert_admin  on public.teams;
drop policy if exists teams_update_leader on public.teams;
drop policy if exists teams_update_admin  on public.teams;
drop policy if exists teams_delete_admin  on public.teams;
create policy teams_select_admin on public.teams for select to authenticated
  using ((select public.is_admin()));
create policy teams_select_leader on public.teams for select to authenticated
  using (leader_id = (select auth.uid()));
-- members and parents do not read this table: they use my_team() / my_roster /
-- my_children, which hide join_code and admin_note from them.
create policy teams_insert_leader on public.teams for insert to authenticated
  with check (leader_id = (select auth.uid()) and (select public.yb_role()) = 'leader');
create policy teams_insert_admin on public.teams for insert to authenticated
  with check ((select public.is_admin()));
-- leader: edit only while draft/submitted, and may only leave it draft/submitted
create policy teams_update_leader on public.teams for update to authenticated
  using (leader_id = (select auth.uid()) and status in ('draft', 'submitted'))
  with check (leader_id = (select auth.uid()) and status in ('draft', 'submitted'));
create policy teams_update_admin on public.teams for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy teams_delete_admin on public.teams for delete to authenticated
  using ((select public.is_admin()));

-- team_members ----------------------------------------------------------
drop policy if exists members_select_admin  on public.team_members;
drop policy if exists members_select_leader on public.team_members;
drop policy if exists members_select_self   on public.team_members;
drop policy if exists members_select_parent on public.team_members;
drop policy if exists members_insert_leader on public.team_members;
drop policy if exists members_insert_admin  on public.team_members;
drop policy if exists members_update_leader on public.team_members;
drop policy if exists members_update_admin  on public.team_members;
drop policy if exists members_delete_leader on public.team_members;
drop policy if exists members_delete_admin  on public.team_members;
create policy members_select_admin on public.team_members for select to authenticated
  using ((select public.is_admin()));
create policy members_select_leader on public.team_members for select to authenticated
  using ((select public.yb_is_team_leader(team_id)));
-- a member sees ONLY their own row here; teammates come through my_roster
create policy members_select_self on public.team_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy members_select_parent on public.team_members for select to authenticated
  using ((select public.yb_is_parent_of(id)));
create policy members_insert_leader on public.team_members for insert to authenticated
  with check ((select public.yb_leader_can_edit(team_id)));
create policy members_insert_admin on public.team_members for insert to authenticated
  with check ((select public.is_admin()));
create policy members_update_leader on public.team_members for update to authenticated
  using ((select public.yb_leader_can_edit(team_id)))
  with check ((select public.yb_leader_can_edit(team_id)));
create policy members_update_admin on public.team_members for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy members_delete_leader on public.team_members for delete to authenticated
  using ((select public.yb_leader_can_edit(team_id)) and not is_leader);
create policy members_delete_admin on public.team_members for delete to authenticated
  using ((select public.is_admin()));

-- parent_links ----------------------------------------------------------
drop policy if exists links_select_own   on public.parent_links;
drop policy if exists links_select_admin on public.parent_links;
drop policy if exists links_delete_own   on public.parent_links;
drop policy if exists links_delete_admin on public.parent_links;
create policy links_select_own on public.parent_links for select to authenticated
  using (parent_id = (select auth.uid()));
create policy links_select_admin on public.parent_links for select to authenticated
  using ((select public.is_admin()));
create policy links_delete_own on public.parent_links for delete to authenticated
  using (parent_id = (select auth.uid()));
create policy links_delete_admin on public.parent_links for delete to authenticated
  using ((select public.is_admin()));
-- inserts only through link_child()

-- tournament_state ------------------------------------------------------
drop policy if exists state_select_all    on public.tournament_state;
drop policy if exists state_insert_admin  on public.tournament_state;
drop policy if exists state_update_admin  on public.tournament_state;
create policy state_select_all on public.tournament_state for select to anon, authenticated
  using (true);
create policy state_insert_admin on public.tournament_state for insert to authenticated
  with check ((select public.is_admin()));
create policy state_update_admin on public.tournament_state for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- audit_log -------------------------------------------------------------
drop policy if exists audit_select_admin on public.audit_log;
create policy audit_select_admin on public.audit_log for select to authenticated
  using ((select public.is_admin()));
-- nobody writes it from the API: only triggers/functions (owner)

-- ---------------------------------------------------------------------------
-- 8. RPC functions (SECURITY DEFINER; every one checks auth.uid() itself).
--    Failures are Postgres exceptions whose MESSAGE is a stable key; PostgREST
--    returns {"code","message","hint","details"}.
-- ---------------------------------------------------------------------------

-- member joins the team roster row that has the same (normalised) name
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
  c := upper(regexp_replace(coalesce(join_team.code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into v_t from public.teams t where t.join_code = c;
  if not found then raise exception 'team_not_found'; end if;
  if public.yb_norm(join_team.member_name) = '' then raise exception 'name_not_in_roster'; end if;
  select * into v_m from public.team_members m
   where m.team_id = v_t.id and public.yb_norm(m.full_name) = public.yb_norm(join_team.member_name)
   for update;
  if not found then raise exception 'name_not_in_roster'; end if;
  if v_m.user_id is not null then raise exception 'already_linked'; end if;
  if exists (select 1 from public.team_members m where m.user_id = uid) then
    raise exception 'already_linked';
  end if;
  update public.team_members m set user_id = uid where m.id = v_m.id;
  return jsonb_build_object('ok', true, 'team_id', v_t.id, 'member_id', v_m.id, 'team_name', v_t.name);
end $$;

-- parent links a child (same lookup as join_team, but the parent is NOT stored
-- on the roster row)
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
  c := upper(regexp_replace(coalesce(link_child.code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into v_t from public.teams t where t.join_code = c;
  if not found then raise exception 'team_not_found'; end if;
  if public.yb_norm(link_child.child_name) = '' then raise exception 'name_not_in_roster'; end if;
  select * into v_m from public.team_members m
   where m.team_id = v_t.id and public.yb_norm(m.full_name) = public.yb_norm(link_child.child_name);
  if not found then raise exception 'name_not_in_roster'; end if;
  insert into public.parent_links (parent_id, member_id) values (uid, v_m.id)
    on conflict (parent_id, member_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'already_linked'; end if;
  return jsonb_build_object('ok', true, 'team_id', v_t.id, 'member_id', v_m.id, 'team_name', v_t.name);
end $$;

-- the caller's team(s): leader -> own team (+ join_code, admin_note);
-- member -> the linked team; parent -> the team of each linked child; admin -> none
create or replace function public.my_team()
returns table (
  team_id uuid, team_name text, area text, status text,
  my_role text, member_id uuid, join_code text, admin_note text
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select t.id, t.name, t.area, t.status, 'leader'::text, lm.id, t.join_code, t.admin_note
    from public.teams t
    left join public.team_members lm on lm.team_id = t.id and lm.is_leader
   where t.leader_id = auth.uid()
  union all
  select t.id, t.name, t.area, t.status, 'member'::text, m.id, null::text, null::text
    from public.team_members m join public.teams t on t.id = m.team_id
   where m.user_id = auth.uid() and t.leader_id is distinct from auth.uid()
  union all
  select t.id, t.name, t.area, t.status, 'parent'::text, m.id, null::text, null::text
    from public.parent_links l
    join public.team_members m on m.id = l.member_id
    join public.teams t on t.id = m.team_id
   where l.parent_id = auth.uid()
$$;

-- owner-only bootstrap: promote an existing account to admin (SQL editor / service_role)
create or replace function public.set_admin(email text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare pid uuid;
begin
  update public.profiles p set role = 'admin'
   where lower(p.email) = lower(btrim(set_admin.email))
   returning p.id into pid;
  if pid is null then raise exception 'user_not_found'; end if;
  return 'admin_set';
end $$;

-- admin changes someone's role between leader/member/parent (never to or from admin)
create or replace function public.set_user_role(target uuid, new_role public.user_role)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare cur public.user_role;
begin
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if new_role = 'admin' then raise exception 'permission_denied' using errcode = '42501'; end if;
  select p.role into cur from public.profiles p where p.id = set_user_role.target;
  if not found then raise exception 'user_not_found'; end if;
  if cur = 'admin' then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.profiles p set role = set_user_role.new_role where p.id = set_user_role.target;
  return jsonb_build_object('ok', true, 'role', new_role);
end $$;

-- admin approves (ok=true) or rejects (ok=false) a team and leaves a note
create or replace function public.approve_team(team_id uuid, ok boolean, note text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare st text;
begin
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if approve_team.ok is null then raise exception 'invalid_argument'; end if;
  if approve_team.note is not null and char_length(approve_team.note) > 500 then
    raise exception 'invalid_argument';
  end if;
  st := case when approve_team.ok then 'approved' else 'rejected' end;
  update public.teams t
     set status = st, admin_note = nullif(btrim(coalesce(approve_team.note, '')), '')
   where t.id = approve_team.team_id;
  if not found then raise exception 'team_not_found'; end if;
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- paper consent received / not received. Leader of the member's team (only while
-- the team is draft/submitted) or admin.
create or replace function public.mark_consent(member_id uuid, received boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  v_t  public.teams%rowtype;
  v_m  public.team_members%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if mark_consent.received is null then raise exception 'invalid_argument'; end if;
  select * into v_m from public.team_members m where m.id = mark_consent.member_id;
  if not found then raise exception 'member_not_found'; end if;
  select * into v_t from public.teams t where t.id = v_m.team_id;
  if not (public.is_admin() or (v_t.leader_id = uid and v_t.status in ('draft', 'submitted'))) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update public.team_members m
     set consent_status = case when mark_consent.received then 'received' else 'pending' end,
         consent_at     = case when mark_consent.received then now() else null end
   where m.id = v_m.id;
  return jsonb_build_object('ok', true,
    'consent_status', case when mark_consent.received then 'received' else 'pending' end);
end $$;

-- a roster row was claimed by the wrong person: cut the member account and all
-- parent links of that row (leader while draft/submitted, or admin)
create or replace function public.unlink_member(member_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  v_t  public.teams%rowtype;
  v_m  public.team_members%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_m from public.team_members m where m.id = unlink_member.member_id;
  if not found then raise exception 'member_not_found'; end if;
  select * into v_t from public.teams t where t.id = v_m.team_id;
  if not (public.is_admin() or (v_t.leader_id = uid and v_t.status in ('draft', 'submitted'))) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if v_m.is_leader and not public.is_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update public.team_members m set user_id = null where m.id = v_m.id and not m.is_leader;
  delete from public.parent_links l where l.member_id = v_m.id;
  return jsonb_build_object('ok', true);
end $$;

-- a new join code (if the old one leaked). Leader of the team or admin.
create or replace function public.regenerate_join_code(team_id uuid)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_t public.teams%rowtype;
  c   text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_t from public.teams t where t.id = regenerate_join_code.team_id;
  if not found then raise exception 'team_not_found'; end if;
  if not (public.is_admin() or v_t.leader_id = uid) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  c := public.yb_new_join_code();
  update public.teams t set join_code = c where t.id = v_t.id;
  return c;
end $$;

-- admin publishes the tournament state with an optimistic-concurrency check.
--   prev = the updated_at the client last read (null when no row exists yet).
--   returns {ok, conflict, updated_at[, stripped]}; on conflict nothing is written.
-- Privacy: teams[*].chess (a player label = a child's name) is removed from the
-- public row; "stripped": true tells the client it happened.
create or replace function public.publish_state(state jsonb, prev timestamptz default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_state    jsonb := publish_state.state;
  v_cur      timestamptz;
  v_new      timestamptz;
  v_stripped boolean := false;
begin
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_state is null or jsonb_typeof(v_state) <> 'object' then raise exception 'invalid_state'; end if;
  if octet_length(v_state::text) > 262144 then raise exception 'state_too_large'; end if;

  if jsonb_typeof(v_state -> 'teams') = 'array' then
    if exists (select 1 from jsonb_array_elements(v_state -> 'teams') e
                where jsonb_typeof(e) = 'object' and e ? 'chess') then
      v_stripped := true;
      v_state := jsonb_set(v_state, '{teams}', coalesce((
        select jsonb_agg(case when jsonb_typeof(e.t) = 'object' then e.t - 'chess' else e.t end order by e.ord)
          from jsonb_array_elements(v_state -> 'teams') with ordinality as e(t, ord)
      ), '[]'::jsonb));
    end if;
  end if;

  select ts.updated_at into v_cur from public.tournament_state ts where ts.id = 1 for update;
  if not found then
    if publish_state.prev is not null then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', null);
    end if;
    insert into public.tournament_state as ts (id, state, updated_by)
    values (1, v_state, auth.uid())
    on conflict (id) do nothing
    returning ts.updated_at into v_new;
    if v_new is null then
      return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', null);
    end if;
  elsif v_cur is distinct from publish_state.prev then
    return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', v_cur);
  else
    update public.tournament_state ts set state = v_state, updated_by = auth.uid()
     where ts.id = 1
     returning ts.updated_at into v_new;
  end if;

  return jsonb_build_object('ok', true, 'conflict', false, 'updated_at', v_new)
         || case when v_stripped then jsonb_build_object('stripped', true) else '{}'::jsonb end;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Privileges. Supabase grants ALL on new public objects to anon and
--    authenticated by default -> revoke everything first, then grant exactly
--    what is needed.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.teams, public.team_members, public.parent_links,
              public.tournament_state, public.audit_log,
              public.public_teams, public.my_roster, public.my_children
  from public, anon, authenticated;
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated;

revoke all on function
  public.yb_norm(text), public.yb_new_join_code(), public.is_admin(), public.yb_role(),
  public.yb_is_team_leader(uuid), public.yb_leader_can_edit(uuid), public.yb_is_parent_of(uuid),
  public.yb_my_team_ids(), public.yb_is_client(),
  public.yb_handle_new_user(), public.yb_sync_email(), public.yb_touch_updated_at(),
  public.yb_profiles_guard(), public.yb_teams_bi(), public.yb_teams_ai(), public.yb_teams_bu(),
  public.yb_members_bi(), public.yb_members_ai(), public.yb_audit_tg(),
  public.join_team(text, text), public.link_child(text, text), public.my_team(),
  public.set_admin(text), public.set_user_role(uuid, public.user_role),
  public.approve_team(uuid, boolean, text), public.mark_consent(uuid, boolean),
  public.unlink_member(uuid), public.regenerate_join_code(uuid),
  public.publish_state(jsonb, timestamptz)
  from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- tables / views
grant select on public.public_teams to anon, authenticated;
grant select on public.my_roster, public.my_children to authenticated;
grant select on public.tournament_state to anon, authenticated;
grant insert, update on public.tournament_state to authenticated;       -- admin only by policy
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;     -- never role / email
grant select on public.teams to authenticated;
grant insert (name, area) on public.teams to authenticated;
grant update (name, area, status) on public.teams to authenticated;
grant delete on public.teams to authenticated;                           -- admin only by policy
grant select on public.team_members to authenticated;
grant insert (team_id, full_name, age, guardian_name, guardian_phone) on public.team_members to authenticated;
grant update (full_name, age, guardian_name, guardian_phone) on public.team_members to authenticated;
grant delete on public.team_members to authenticated;
grant select, delete on public.parent_links to authenticated;
grant select on public.audit_log to authenticated;                       -- admin only by policy

-- functions used by policies / views / index expressions (run as the caller)
grant execute on function public.yb_norm(text) to anon, authenticated;
grant execute on function public.is_admin(), public.yb_role(),
  public.yb_is_team_leader(uuid), public.yb_leader_can_edit(uuid), public.yb_is_parent_of(uuid),
  public.yb_my_team_ids() to authenticated;

-- RPC surface
grant execute on function
  public.join_team(text, text), public.link_child(text, text), public.my_team(),
  public.set_user_role(uuid, public.user_role),
  public.approve_team(uuid, boolean, text), public.mark_consent(uuid, boolean),
  public.unlink_member(uuid), public.regenerate_join_code(uuid),
  public.publish_state(jsonb, timestamptz)
  to authenticated;

-- set_admin: ONLY postgres (owner) and service_role. Never anon/authenticated.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.set_admin(text) to service_role;
  end if;
end $$;

comment on function public.set_admin(text) is
  'Owner bootstrap: select public.set_admin(''you@example.com''); - not executable by anon/authenticated.';
comment on view public.public_teams is 'Public: approved team names only. Never child data.';
comment on view public.my_roster is 'Roster names of the caller''s own team. No age/guardian.';
