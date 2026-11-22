-- =============================================================================
-- 0026_yb_confirm.sql -- two "who is who" checks (owner, 22 Nov 2026: "leader confirms parent", and the
-- improvements: the admin confirms adult players).
--
--   1. A parent link is a request until the team's leader (or the admin) confirms it. The team code and a
--      child's name are no longer enough to read a child's data. link_child keeps its name and arguments and
--      answers {ok, pending:true}; the leader answers with yb_link_answer. Links made before stay as they are.
--   2. A member who says "18 or older" in the player pool is listed only after the admin confirms it (before,
--      a child could tick "adult" and skip the parent's approval).
-- ASCII only. Idempotent: safe to run again.
-- =============================================================================

-- ---------------------------------------------------------------- 1. parent link requests
create table if not exists public.yb_link_requests (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid not null references public.profiles (id) on delete cascade,
  member_id  uuid not null references public.team_members (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, member_id)
);
alter table public.yb_link_requests enable row level security;
alter table public.yb_link_requests force row level security;
revoke all on public.yb_link_requests from public, anon, authenticated;

-- who answers a team's requests: its leader and assistant leaders; the admins when the team has no leader yet
create or replace function public.yb_link_answerers(t uuid)
returns uuid[]
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select x.leader_id as u from public.teams x where x.id = t and x.leader_id is not null
    union
    select m.user_id from public.team_members m where m.team_id = t and m.user_id is not null and 'assistant' = any (coalesce(m.roles, '{}'))
    union
    select p.id from public.profiles p where p.role = 'admin' and not exists (select 1 from public.teams x where x.id = t and x.leader_id is not null)
  ) q where u is not null
$$;

create or replace function public.yb_link_may_answer(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select public.is_admin() or auth.uid() = any (public.yb_link_answerers(t)) $$;

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
  if exists (select 1 from public.parent_links l where l.parent_id = uid and l.member_id = v_m.id) then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;
  if exists (select 1 from public.yb_link_requests r where r.parent_id = uid and r.member_id = v_m.id) then
    return jsonb_build_object('ok', true, 'pending', true, 'again', true, 'team_name', v_t.name);
  end if;
  if (select count(*) from public.yb_link_requests r where r.parent_id = uid) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_requests');
  end if;
  insert into public.yb_link_requests (parent_id, member_id, team_id) values (uid, v_m.id, v_t.id);
  perform public.yb_notify(public.yb_link_answerers(v_t.id), 'link_request',
    jsonb_build_object('team_id', v_t.id, 'team_name', v_t.name, 'parent_name', public.yb_display_name(uid), 'child_name', v_m.full_name));
  insert into public.audit_log (user_id, action, detail) values (uid, 'link_request', jsonb_build_object('team_id', v_t.id, 'member_id', v_m.id));
  return jsonb_build_object('ok', true, 'pending', true, 'team_name', v_t.name);
end $$;

-- the parent: my requests still waiting
create or replace function public.yb_link_requests_mine()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'team_name', t.name, 'child_name', m.full_name, 'at', r.created_at) order by r.created_at), '[]'::jsonb)
    from public.yb_link_requests r join public.teams t on t.id = r.team_id join public.team_members m on m.id = r.member_id
   where r.parent_id = auth.uid()
$$;

-- the leader (their team) or the admin (every team): the requests to answer
create or replace function public.yb_link_requests_team()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'team_id', t.id, 'team_name', t.name, 'child_name', m.full_name,
             'parent_name', coalesce(public.yb_display_name(r.parent_id), ''),
             'other_children', (select count(*) from public.parent_links l where l.parent_id = r.parent_id),
             'at', r.created_at) order by r.created_at)
      from public.yb_link_requests r join public.teams t on t.id = r.team_id join public.team_members m on m.id = r.member_id
     where public.yb_link_may_answer(r.team_id)), '[]'::jsonb);
end $$;

create or replace function public.yb_link_answer(id uuid, accept boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare r public.yb_link_requests; tn text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into r from public.yb_link_requests x where x.id = yb_link_answer.id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.yb_link_may_answer(r.team_id) then raise exception 'permission_denied' using errcode = '42501'; end if;
  select t.name into tn from public.teams t where t.id = r.team_id;
  delete from public.yb_link_requests x where x.id = r.id;
  if coalesce(yb_link_answer.accept, false) then
    insert into public.parent_links (parent_id, member_id) values (r.parent_id, r.member_id) on conflict (parent_id, member_id) do nothing;
    perform public.yb_notify(array[r.parent_id], 'link_confirmed', jsonb_build_object('team_id', r.team_id, 'team_name', tn));
  else
    perform public.yb_notify(array[r.parent_id], 'link_declined', jsonb_build_object('team_id', r.team_id, 'team_name', tn));
  end if;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), case when yb_link_answer.accept then 'link_confirmed' else 'link_declined' end,
          jsonb_build_object('team_id', r.team_id, 'member_id', r.member_id, 'parent', r.parent_id));
  return jsonb_build_object('ok', true, 'linked', coalesce(yb_link_answer.accept, false));
end $$;

-- ---------------------------------------------------------------- 2. adult players confirmed by the admin
alter table public.yb_seekers add column if not exists adult_ok_by uuid references public.profiles (id) on delete set null;
alter table public.yb_seekers add column if not exists adult_ok_at timestamptz;

-- a minor is listed once a parent approved with the code, or with the paper consent recorded on a team;
-- an adult once the admin confirmed the age
create or replace function public.yb_seek_guardian_ok(u uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.yb_seekers s where s.user_id = u
                   and ((s.age_group = 'adult' and s.adult_ok_by is not null) or s.guardian_by is not null
                        or exists (select 1 from public.team_members m where m.user_id = u and m.consent_status = 'received')))
$$;

create or replace function public.yb_seek_save(p jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); r text; g text; a text; pos text[]; s public.yb_seekers;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select x.role::text into r from public.profiles x where x.id = me;
  if r is distinct from 'member' then return jsonb_build_object('ok', false, 'error', 'members_only'); end if;
  if jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  g := p ->> 'age_group';
  a := nullif(btrim(coalesce(p ->> 'area', '')), '');
  if g is null or g not in ('u10', 'u13', 'u16', 'u18', 'adult') then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if a is not null and (char_length(a) not between 2 and 60) then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if a is not null and public.yb_has_contact(a) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  if p ? 'positions' and jsonb_typeof(p -> 'positions') is distinct from 'array' then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  pos := coalesce(array(select distinct jsonb_array_elements_text(coalesce(p -> 'positions', '[]'::jsonb))), '{}');
  if not (pos <@ array['goal', 'defense', 'midfield', 'attack', 'chess', 'reciter']::text[]) or cardinality(pos) > 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  insert into public.yb_seekers as x (user_id, age_group, area, positions) values (me, g, a, pos)
  on conflict on constraint yb_seekers_pkey do update set age_group = excluded.age_group, area = excluded.area, positions = excluded.positions,
                                     active = true, updated_at = now(),
                                     adult_ok_by = case when excluded.age_group = 'adult' then x.adult_ok_by end,
                                     adult_ok_at = case when excluded.age_group = 'adult' then x.adult_ok_at end;
  select * into s from public.yb_seekers x where x.user_id = me;
  if s.age_group <> 'adult' and s.guardian_by is null and s.guardian_code is null then
    update public.yb_seekers x set guardian_code = public.yb_seek_new_code() where x.user_id = me;
  end if;
  if s.age_group = 'adult' and s.adult_ok_by is null then
    perform public.yb_notify(array(select q.id from public.profiles q where q.role = 'admin'), 'seek_adult',
      jsonb_build_object('first_name', public.yb_first_name((select q.full_name from public.profiles q where q.id = me))));
  end if;
  insert into public.audit_log (user_id, action, detail) values (me, 'seek_save', jsonb_build_object('age_group', g));
  return public.yb_seek_me();
end $$;

create or replace function public.yb_seek_me()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); s public.yb_seekers; r text;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select p.role::text into r from public.profiles p where p.id = me;
  select * into s from public.yb_seekers x where x.user_id = me;
  return jsonb_build_object(
    'ok', true,
    'can_seek', r = 'member',
    'in_team', public.yb_seek_team(me) is not null,
    'transfers_open', public.yb_transfers_open(),
    'seeker', case when s.user_id is null then null else jsonb_build_object(
        'age_group', s.age_group, 'area', s.area, 'positions', to_jsonb(s.positions), 'active', s.active,
        'guardian_ok', public.yb_seek_guardian_ok(me),
        'adult_waiting', s.age_group = 'adult' and s.adult_ok_by is null and not public.yb_seek_guardian_ok(me),
        'guardian_code', case when public.yb_seek_guardian_ok(me) then null else s.guardian_code end,
        'listed', s.active and public.yb_seek_guardian_ok(me) and (public.yb_seek_team(me) is null or public.yb_transfers_open())) end,
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'team_name', t.name, 'team_area', t.area,
                          'leader', public.yb_first_name(lp.full_name), 'status', i.status, 'player_ok', i.player_ok,
                          'guardian_ok', i.guardian_ok, 'needs_guardian', s.age_group is distinct from 'adult' and s.guardian_by is not null,
                          'at', i.created_at) order by i.created_at desc)
                          from public.yb_invites i join public.teams t on t.id = i.team_id left join public.profiles lp on lp.id = t.leader_id
                         where i.seeker = me and i.created_at > now() - interval '60 days'), '[]'::jsonb));
end $$;

-- the admin: adults waiting, and the answer
create or replace function public.yb_seek_adults()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'full_name', p.full_name, 'area', s.area, 'at', s.updated_at) order by s.updated_at)
    from public.yb_seekers s join public.profiles p on p.id = s.user_id
   where s.active and s.age_group = 'adult' and s.adult_ok_by is null and not public.yb_seek_guardian_ok(s.user_id)), '[]'::jsonb);
end $$;

create or replace function public.yb_seek_adult_confirm(target uuid, ok boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare s public.yb_seekers;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into s from public.yb_seekers x where x.user_id = yb_seek_adult_confirm.target for update;
  if s.user_id is null or s.age_group <> 'adult' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(yb_seek_adult_confirm.ok, false) then
    update public.yb_seekers x set adult_ok_by = auth.uid(), adult_ok_at = now() where x.user_id = s.user_id;
    perform public.yb_notify(array[s.user_id], 'seek_adult_ok', '{}'::jsonb);
  else
    update public.yb_seekers x set active = false, adult_ok_by = null, adult_ok_at = null, updated_at = now() where x.user_id = s.user_id;
    perform public.yb_notify(array[s.user_id], 'seek_adult_no', '{}'::jsonb);
  end if;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), case when yb_seek_adult_confirm.ok then 'seek_adult_ok' else 'seek_adult_no' end, jsonb_build_object('target', s.user_id));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.yb_link_answerers(uuid), public.yb_link_may_answer(uuid), public.yb_link_requests_mine(),
  public.yb_link_requests_team(), public.yb_link_answer(uuid, boolean), public.yb_seek_adults(), public.yb_seek_adult_confirm(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.yb_link_requests_mine(), public.yb_link_requests_team(), public.yb_link_answer(uuid, boolean),
  public.yb_seek_adults(), public.yb_seek_adult_confirm(uuid, boolean) to authenticated;

comment on table public.yb_link_requests is 'A parent asking to be linked to a child; the team leader (or the admin) confirms before any child data is shared.';
