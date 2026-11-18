-- Yanabee 0006: the waiting list after 12 teams, and member roles.
--
-- 1. Places. competition.txt c-target: 12 teams. The first time a team is
--    sent for review (draft -> submitted, from the account page or the online
--    form) it takes a place while fewer than 12 teams hold one; otherwise it
--    joins the reserve list (teams.waitlist = true). A team keeps its place
--    while it is edited (back to draft). Rejected or deleted -> the place is
--    freed and the earliest reserve team moves up (inbox: team_seated).
--    waitlist: null = never sent, false = holds a place, true = reserve.
-- 2. Roles (c-form f-nom): team_members.roles holds 'reciter' (main reciter of
--    surat as-Saff), 'reserve', 'chess', 'coord'. One member per role and team.
--    The online form fills them from the nominee names; the leader (while the
--    team is editable), the admin and the registration officer set them with
--    yb_set_roles. Officers read their lists with yb_role_list (hifz / fahm:
--    reciters, chess: chess players, registration and admin: all). Never public.
-- ASCII only.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.teams add column if not exists waitlist boolean;
alter table public.teams add column if not exists waitlist_at timestamptz;   -- when it joined the reserve list (its place in line)
alter table public.team_members add column if not exists roles text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_roles_chk') then
    alter table public.team_members add constraint members_roles_chk
      check (roles <@ array['reciter', 'reserve', 'chess', 'coord']::text[]);
  end if;
end $$;

-- teams already sent hold a place (in creation order, up to 12; the rest wait)
update public.teams t set waitlist = (x.n > 12), waitlist_at = case when x.n > 12 then now() end
  from (select id, row_number() over (order by created_at) as n
          from public.teams where status in ('submitted', 'returned', 'approved')) x
 where x.id = t.id and t.waitlist is null;

create or replace function public.yb_team_target()
returns int
language sql immutable
set search_path = public, pg_temp
as $$ select 12 $$;

create or replace function public.yb_seats_taken(excl uuid default null)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.teams t
   where t.waitlist is false and t.status <> 'rejected' and t.id is distinct from excl
$$;

-- ---------------------------------------------------------------------------
-- 2. Taking a place, freeing it, moving the reserve list up
-- ---------------------------------------------------------------------------
create or replace function public.yb_teams_place_bu()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- a team that leaves 'rejected' (reopened by the admin) must take a place again
  if old.status = 'rejected' and new.status <> 'rejected' then
    new.waitlist := null;
  end if;
  if new.status in ('submitted', 'returned', 'approved') and new.waitlist is null then
    perform pg_advisory_xact_lock(hashtext('yb_team_places'));   -- one place decision at a time
    new.waitlist := public.yb_seats_taken(new.id) >= public.yb_team_target();
    new.waitlist_at := case when new.waitlist then clock_timestamp() end;
  end if;
  return new;
end $$;

drop trigger if exists yb_teams_place_bu on public.teams;
create trigger yb_teams_place_bu before update of status on public.teams
  for each row execute function public.yb_teams_place_bu();

-- the earliest reserve teams take the free places
create or replace function public.yb_promote_waitlist()
returns int
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  x public.teams%rowtype;
  n int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('yb_team_places'));
  loop
    exit when public.yb_seats_taken() >= public.yb_team_target();
    select * into x from public.teams t
     where t.waitlist is true and t.status <> 'rejected'
     order by t.waitlist_at nulls first, t.created_at limit 1 for update;
    exit when not found;
    update public.teams t set waitlist = false, waitlist_at = null where t.id = x.id;
    perform public.yb_notify(public.yb_team_people(array[x.id]), 'team_seated',
      jsonb_build_object('team_id', x.id, 'team_name', x.name));
    insert into public.audit_log (user_id, action, detail)
    values (auth.uid(), 'team_seated', jsonb_build_object('team_id', x.id));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.yb_teams_place_au()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.waitlist is false and old.status <> 'rejected' then perform public.yb_promote_waitlist(); end if;
    return null;
  end if;
  if new.status = 'rejected' and old.status <> 'rejected' and old.waitlist is false then
    perform public.yb_promote_waitlist();
  end if;
  return null;
end $$;

drop trigger if exists yb_teams_place_au on public.teams;
create trigger yb_teams_place_au after update of status on public.teams
  for each row execute function public.yb_teams_place_au();
drop trigger if exists yb_teams_place_ad on public.teams;
create trigger yb_teams_place_ad after delete on public.teams
  for each row execute function public.yb_teams_place_au();

-- admin: move a team between a place and the reserve list by hand
create or replace function public.yb_set_waitlist(team_id uuid, waiting boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare x public.teams%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_set_waitlist.waiting is null then raise exception 'invalid_argument'; end if;
  perform pg_advisory_xact_lock(hashtext('yb_team_places'));
  select * into x from public.teams t where t.id = yb_set_waitlist.team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if x.waitlist is null or x.status = 'rejected' then raise exception 'invalid_status'; end if;
  if x.waitlist = yb_set_waitlist.waiting then return jsonb_build_object('ok', true, 'changed', false); end if;
  update public.teams t set waitlist = yb_set_waitlist.waiting,
         waitlist_at = case when yb_set_waitlist.waiting then clock_timestamp() end
   where t.id = x.id;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'team_waitlist', jsonb_build_object('team_id', x.id, 'waitlist', yb_set_waitlist.waiting));
  if not yb_set_waitlist.waiting then
    perform public.yb_notify(public.yb_team_people(array[x.id]), 'team_seated',
      jsonb_build_object('team_id', x.id, 'team_name', x.name));
  else
    perform public.yb_promote_waitlist();
  end if;
  return jsonb_build_object('ok', true, 'changed', true);
end $$;

-- place on the reserve list (1 = next to move up); null when the team holds a place
create or replace function public.yb_wait_pos(t uuid)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.n::int from (
    select id, row_number() over (order by waitlist_at nulls first, created_at) as n
      from public.teams where waitlist is true and status <> 'rejected') x
   where x.id = t
$$;

-- ---------------------------------------------------------------------------
-- 3. Roles
-- ---------------------------------------------------------------------------
-- set the four roles of a team at once (null = nobody yet). Leader while the team
-- is editable; admin and registration officer always.
create or replace function public.yb_set_roles(team_id uuid, reciter uuid default null, reserve uuid default null,
                                               chess uuid default null, coord uuid default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  t   uuid := yb_set_roles.team_id;
  ids uuid[] := array[yb_set_roles.reciter, yb_set_roles.reserve, yb_set_roles.chess, yb_set_roles.coord];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_can_review() or public.yb_leader_can_edit(t)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(ids) u where u is not null
              and not exists (select 1 from public.team_members m where m.id = u and m.team_id = t)) then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;
  if yb_set_roles.reciter is not null and yb_set_roles.reciter = yb_set_roles.reserve then
    return jsonb_build_object('ok', false, 'error', 'same_reciters');
  end if;
  update public.team_members m
     set roles = case when m.id = yb_set_roles.reciter then array['reciter'] else '{}'::text[] end
                 || case when m.id = yb_set_roles.reserve then array['reserve'] else '{}'::text[] end
                 || case when m.id = yb_set_roles.chess   then array['chess']   else '{}'::text[] end
                 || case when m.id = yb_set_roles.coord   then array['coord']   else '{}'::text[] end
   where m.team_id = t;
  return jsonb_build_object('ok', true);
end $$;

-- the officers' lists: team, status, member name and the roles they may see
create or replace function public.yb_role_list()
returns table (team_id uuid, team_name text, team_status text, member_id uuid, full_name text, roles text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare allowed text[] := '{}';
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if public.yb_can_review() then
    allowed := array['reciter', 'reserve', 'chess', 'coord'];
  else
    if public.yb_is_officer_of('hifz') or public.yb_is_officer_of('fahm') then allowed := allowed || array['reciter', 'reserve']; end if;
    if public.yb_is_officer_of('chess') then allowed := allowed || array['chess']; end if;
  end if;
  if cardinality(allowed) = 0 then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select t.id, t.name, t.status, m.id, m.full_name,
           array(select r from unnest(m.roles) r where r = any (allowed))
      from public.teams t join public.team_members m on m.team_id = t.id
     where t.status <> 'rejected' and t.waitlist is false and m.roles && allowed
     order by case t.status when 'approved' then 0 else 1 end, t.name, m.full_name;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The online form fills the roles; the checklist, the counts and the review
--    queue learn about places and roles
-- ---------------------------------------------------------------------------
create or replace function public.yb_roles_from_form(t uuid)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare r public.yb_registrations%rowtype;
begin
  select * into r from public.yb_registrations x where x.team_id = t;
  if not found then return; end if;
  update public.team_members m
     set roles = array(select v from unnest(array[
                   case when public.yb_norm(m.full_name) = public.yb_norm(r.reciter1) then 'reciter' end,
                   case when public.yb_norm(m.full_name) = public.yb_norm(r.reciter2) then 'reserve' end,
                   case when public.yb_norm(m.full_name) = public.yb_norm(r.chess) then 'chess' end,
                   case when r.coordinator is not null and public.yb_norm(m.full_name) = public.yb_norm(r.coordinator) then 'coord' end]) v
                 where v is not null)
   where m.team_id = t;
end $$;

-- fill roles when the registration row arrives (yb_register_team inserts it after the members)
create or replace function public.yb_registrations_ai()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.yb_roles_from_form(new.team_id);
  return null;
end $$;
drop trigger if exists yb_registrations_ai on public.yb_registrations;
create trigger yb_registrations_ai after insert on public.yb_registrations
  for each row execute function public.yb_registrations_ai();

-- roles of teams sent online before this migration
do $$
declare r record;
begin
  for r in select x.team_id from public.yb_registrations x loop
    perform public.yb_roles_from_form(r.team_id);
  end loop;
end $$;

-- the checklist gains the place and which roles are filled (no names)
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
  rl     text[];
begin
  select * into x from public.teams where id = t;
  if not found then return null; end if;
  select count(*)::int,
         (count(*) filter (where m.age is null or m.age < 18))::int,
         (count(*) filter (where (m.age is null or m.age < 18) and m.consent_status = 'received'))::int
    into n, minors, cons
    from public.team_members m where m.team_id = t;
  select coalesce(array_agg(distinct r), '{}') into rl
    from public.team_members m, unnest(m.roles) r where m.team_id = t;
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
    'waitlist', x.waitlist, 'wait_pos', public.yb_wait_pos(x.id),
    'roles', jsonb_build_object('reciter', 'reciter' = any (rl), 'reserve', 'reserve' = any (rl),
                                'chess', 'chess' = any (rl), 'coord', 'coord' = any (rl)),
    'created_at', x.created_at, 'reviewed_at', x.reviewed_at);
end $$;

create or replace function public.yb_registration_stats()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'target', public.yb_team_target(),
    'registered', (select count(*) from public.teams t where t.waitlist is false and t.status <> 'rejected'),
    'approved', (select count(*) from public.teams t where t.status = 'approved' and t.waitlist is false),
    'waiting', (select count(*) from public.teams t where t.waitlist is true and t.status <> 'rejected'))
$$;

drop function if exists public.yb_review_list();
create function public.yb_review_list()
returns table (team_id uuid, team_name text, area text, status text, admin_note text,
               members int, consents int, updated_at timestamptz, reviewed_at timestamptz,
               fee_status text, fee_receipt text, ref_code text, online boolean, claimed boolean,
               waitlist boolean, wait_pos int)
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
           t.leader_id is not null, t.waitlist, public.yb_wait_pos(t.id)
      from public.teams t
     order by case t.status when 'submitted' then 0 when 'returned' then 1 when 'draft' then 2 else 3 end,
              coalesce(t.waitlist, false), t.updated_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  public.yb_team_target(), public.yb_seats_taken(uuid), public.yb_teams_place_bu(), public.yb_promote_waitlist(),
  public.yb_teams_place_au(), public.yb_set_waitlist(uuid, boolean), public.yb_wait_pos(uuid),
  public.yb_set_roles(uuid, uuid, uuid, uuid, uuid), public.yb_role_list(), public.yb_roles_from_form(uuid),
  public.yb_registrations_ai(), public.yb_checklist_of(uuid), public.yb_registration_stats(), public.yb_review_list()
  from public, anon, authenticated;

grant execute on function public.yb_registration_stats() to anon, authenticated;
grant execute on function
  public.yb_set_waitlist(uuid, boolean), public.yb_set_roles(uuid, uuid, uuid, uuid, uuid),
  public.yb_role_list(), public.yb_review_list()
  to authenticated;

comment on column public.teams.waitlist is 'null = never sent for review, false = holds one of the 12 places, true = reserve list.';
comment on column public.team_members.roles is 'reciter / reserve / chess / coord (c-form f-nom). Staff and the own team only; never public.';
