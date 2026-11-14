-- Yanabee 0012: players looking for a team, and the leaders' recommendations (SPEC 4.12, owner request Nov 2026).
--
-- Who is listed
--   A member account opts in with "looking for a team": an age group (never the exact age), an optional area, and
--   the positions they like. A minor is listed only after a parent account approves with the 6-character code the
--   child is shown, or when the child already has the paper consent recorded on a team. A player already on a team
--   is listed only while the admin opens transfers ('transfers_open', off by default).
-- Who sees the pool
--   Only leaders whose team the admin has seen (submitted, returned for changes, or approved). Never the public.
--   They see the first name, the age group, the area, the positions, and achievement counts: goals and team-spirit
--   badges (yb_match_marks of approved matches) and wins (approved results of the player's team). Never the full
--   name, the e-mail, a phone, a guardian or the exact age.
-- Invites
--   A leader invites while the roster can still change (submitted or returned) and has room (7 at most, leader
--   included); 10 open invites per team at most. The player accepts, and for a minor approved by a parent, the parent
--   too; then the player joins the roster (paper consent still pending, as for anyone added by the leader).
--   Either may decline; the leader may withdraw. Everyone involved is told (yb_notify).
-- Everything goes through security-definer functions; both tables are closed to direct access.

create table if not exists public.yb_seekers (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  age_group     text not null,
  area          text,
  positions     text[] not null default '{}',
  guardian_by   uuid references public.profiles (id) on delete set null,
  guardian_at   timestamptz,
  guardian_code text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint yb_seek_age_chk  check (age_group in ('u10', 'u13', 'u16', 'u18', 'adult')),
  constraint yb_seek_area_chk check (area is null or char_length(area) between 2 and 60),
  constraint yb_seek_pos_chk  check (positions <@ array['goal', 'defense', 'midfield', 'attack', 'chess', 'reciter']::text[] and cardinality(positions) <= 6),
  constraint yb_seek_code_chk check (guardian_code is null or guardian_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$')
);
create unique index if not exists yb_seek_code_uq on public.yb_seekers (guardian_code) where guardian_code is not null;
alter table public.yb_seekers enable row level security;
alter table public.yb_seekers force row level security;
revoke all on public.yb_seekers from anon, authenticated;

create table if not exists public.yb_invites (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  seeker      uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending',
  player_ok   boolean not null default false,
  guardian_ok boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  constraint yb_inv_status_chk check (status in ('pending', 'accepted', 'declined', 'cancelled'))
);
create unique index if not exists yb_inv_open_uq on public.yb_invites (team_id, seeker) where status = 'pending';
create index if not exists yb_inv_seeker_idx on public.yb_invites (seeker, status);
alter table public.yb_invites enable row level security;
alter table public.yb_invites force row level security;
revoke all on public.yb_invites from anon, authenticated;

insert into public.yb_settings (key, value) values ('transfers_open', 'false'::jsonb) on conflict (key) do nothing;

-- the leader's new dashboard section ('players') may be hidden in the personal settings, like the others (0011)
alter table public.yb_profile_prefs drop constraint if exists yb_pp_hidden_chk;
alter table public.yb_profile_prefs add constraint yb_pp_hidden_chk check (cardinality(hidden_sections) <= 12 and hidden_sections <@
  array['matches', 'team', 'projects', 'room', 'review', 'results', 'dates', 'link', 'judge', 'feed', 'players']);

-- ---------------------------------------------------------------- helpers
create or replace function public.yb_transfers_open()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select s.value = 'true'::jsonb from public.yb_settings s where s.key = 'transfers_open'), false)
$$;

create or replace function public.yb_first_name(full_name text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select nullif(split_part(btrim(coalesce(full_name, '')), ' ', 1), '')
$$;

-- a minor may be listed once a parent approved with the code, or with the paper consent recorded on a team
create or replace function public.yb_seek_guardian_ok(u uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.yb_seekers s where s.user_id = u
                   and (s.age_group = 'adult' or s.guardian_by is not null
                        or exists (select 1 from public.team_members m where m.user_id = u and m.consent_status = 'received')))
$$;

create or replace function public.yb_seek_team(u uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select m.team_id from public.team_members m where m.user_id = u order by m.created_at limit 1
$$;

-- the code a child gives a parent (31 unambiguous symbols, 6 long, unique among open codes)
create or replace function public.yb_seek_new_code()
returns text
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea; code text; i int; tries int := 0;
begin
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    code := '';
    for i in 0..5 loop code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1); end loop;
    exit when not exists (select 1 from public.yb_seekers s where s.guardian_code = code);
    tries := tries + 1;
    if tries > 20 then raise exception 'code_space_exhausted'; end if;
  end loop;
  return code;
end $$;

-- the team a leader leads (the newest one)
create or replace function public.yb_led_team(u uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select t.id from public.teams t where t.leader_id = u order by t.created_at desc limit 1
$$;

-- achievements: goals and team-spirit badges of approved matches, wins of the player's team in approved results
create or replace function public.yb_player_counts(u uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'goals', (select count(*) from public.yb_match_marks k
                join public.team_members m on m.id = k.member_id
                join public.yb_match_live l on l.comp = k.comp and l.match_key = k.match_key
               where m.user_id = u and k.kind = 'goal' and l.status = 'approved'),
    'spirit', (select count(*) from public.yb_match_marks k
                join public.team_members m on m.id = k.member_id
                join public.yb_match_live l on l.comp = k.comp and l.match_key = k.match_key
               where m.user_id = u and k.kind = 'spirit' and l.status = 'approved'),
    'wins', (select count(*) from public.yb_match_live l
               join public.team_members m on m.user_id = u
              where l.comp = 'football' and l.status = 'approved'
                and ((l.a = m.team_id::text and l.sa > l.sb) or (l.b = m.team_id::text and l.sb > l.sa))))
$$;

-- ---------------------------------------------------------------- the player
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
        'guardian_code', case when public.yb_seek_guardian_ok(me) then null else s.guardian_code end,
        'listed', s.active and public.yb_seek_guardian_ok(me) and (public.yb_seek_team(me) is null or public.yb_transfers_open())) end,
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'team_name', t.name, 'team_area', t.area,
                          'leader', public.yb_first_name(lp.full_name), 'status', i.status, 'player_ok', i.player_ok,
                          'guardian_ok', i.guardian_ok, 'needs_guardian', s.age_group is distinct from 'adult' and s.guardian_by is not null,
                          'at', i.created_at) order by i.created_at desc)
                          from public.yb_invites i join public.teams t on t.id = i.team_id left join public.profiles lp on lp.id = t.leader_id
                         where i.seeker = me and i.created_at > now() - interval '60 days'), '[]'::jsonb));
end $$;

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
                                     active = true, updated_at = now();
  select * into s from public.yb_seekers x where x.user_id = me;
  if s.age_group <> 'adult' and s.guardian_by is null and s.guardian_code is null then
    update public.yb_seekers x set guardian_code = public.yb_seek_new_code() where x.user_id = me;
  end if;
  insert into public.audit_log (user_id, action, detail) values (me, 'seek_save', jsonb_build_object('age_group', g));
  return public.yb_seek_me();
end $$;

create or replace function public.yb_seek_stop()
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update public.yb_invites i set status = 'cancelled', decided_at = now() where i.seeker = me and i.status = 'pending';
  delete from public.yb_seekers s where s.user_id = me;
  insert into public.audit_log (user_id, action, detail) values (me, 'seek_stop', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- the parent
create or replace function public.yb_seek_guardian(code text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); r text; c text; s public.yb_seekers; nm text;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select x.role::text into r from public.profiles x where x.id = me;
  if r is distinct from 'parent' then return jsonb_build_object('ok', false, 'error', 'parents_only'); end if;
  if public.yb_join_blocked(me) then return jsonb_build_object('ok', false, 'error', 'too_many_attempts'); end if;
  c := upper(regexp_replace(coalesce(yb_seek_guardian.code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into s from public.yb_seekers x where x.guardian_code = c and c <> '';
  if s.user_id is null then return public.yb_join_fail(me, 'code_not_found'); end if;
  update public.yb_seekers x set guardian_by = me, guardian_at = now(), guardian_code = null, updated_at = now() where x.user_id = s.user_id;
  select public.yb_first_name(p.full_name) into nm from public.profiles p where p.id = s.user_id;
  perform public.yb_notify(array[s.user_id], 'seek_approved', '{}'::jsonb);
  insert into public.audit_log (user_id, action, detail) values (me, 'seek_guardian', jsonb_build_object('seeker', s.user_id));
  return jsonb_build_object('ok', true, 'first_name', nm);
end $$;

-- the children a parent approved, with the invites that wait for the parent
create or replace function public.yb_guardian_seekers()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'seeker', s.user_id, 'first_name', public.yb_first_name(p.full_name), 'age_group', s.age_group, 'active', s.active,
      'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'team_name', t.name, 'team_area', t.area, 'status', i.status,
                            'player_ok', i.player_ok, 'guardian_ok', i.guardian_ok, 'at', i.created_at) order by i.created_at desc)
                            from public.yb_invites i join public.teams t on t.id = i.team_id
                           where i.seeker = s.user_id and i.created_at > now() - interval '60 days'), '[]'::jsonb)) order by p.full_name)
      from public.yb_seekers s join public.profiles p on p.id = s.user_id where s.guardian_by = me), '[]'::jsonb);
end $$;

-- a parent withdraws the approval: the child leaves the pool and open invites close
create or replace function public.yb_seek_guardian_revoke(seeker uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.yb_seekers s where s.user_id = yb_seek_guardian_revoke.seeker and s.guardian_by = me) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update public.yb_invites i set status = 'cancelled', decided_at = now() where i.seeker = yb_seek_guardian_revoke.seeker and i.status = 'pending';
  update public.yb_seekers s set guardian_by = null, guardian_at = null, active = false, updated_at = now() where s.user_id = yb_seek_guardian_revoke.seeker;
  insert into public.audit_log (user_id, action, detail) values (me, 'seek_guardian_revoke', jsonb_build_object('seeker', yb_seek_guardian_revoke.seeker));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- the leader
create or replace function public.yb_seek_pool()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); t public.teams; n int; open_tr boolean := public.yb_transfers_open();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into t from public.teams x where x.id = public.yb_led_team(me);
  if t.id is null or t.status not in ('submitted', 'returned', 'approved') then raise exception 'permission_denied' using errcode = '42501'; end if;
  select count(*) into n from public.team_members m where m.team_id = t.id;
  return jsonb_build_object('ok', true, 'team_status', t.status, 'room', greatest(0, 7 - n),
    'can_invite', t.status in ('submitted', 'returned') and n < 7, 'transfers_open', open_tr,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.user_id, 'first_name', public.yb_first_name(p.full_name), 'age_group', s.age_group, 'area', s.area,
        'positions', to_jsonb(s.positions), 'on_team', public.yb_seek_team(s.user_id) is not null,
        'invited', exists (select 1 from public.yb_invites i where i.team_id = t.id and i.seeker = s.user_id and i.status = 'pending'),
        'invite_id', (select i.id from public.yb_invites i where i.team_id = t.id and i.seeker = s.user_id and i.status = 'pending'))
        || public.yb_player_counts(s.user_id) order by s.updated_at desc)
        from public.yb_seekers s join public.profiles p on p.id = s.user_id
       where s.active and p.role = 'member' and public.yb_seek_guardian_ok(s.user_id)
         and (public.yb_seek_team(s.user_id) is null or (open_tr and public.yb_seek_team(s.user_id) <> t.id))), '[]'::jsonb));
end $$;

create or replace function public.yb_invite_send(seeker uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); t public.teams; s public.yb_seekers; n int; cur uuid;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into t from public.teams x where x.id = public.yb_led_team(me) for update;
  if t.id is null or t.status not in ('submitted', 'returned', 'approved') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if t.status = 'approved' then return jsonb_build_object('ok', false, 'error', 'roster_locked'); end if;
  select * into s from public.yb_seekers x where x.user_id = yb_invite_send.seeker;
  cur := public.yb_seek_team(yb_invite_send.seeker);
  if s.user_id is null or not s.active or not public.yb_seek_guardian_ok(s.user_id)
     or (cur is not null and (not public.yb_transfers_open() or cur = t.id)) then
    return jsonb_build_object('ok', false, 'error', 'not_listed');
  end if;
  select count(*) into n from public.team_members m where m.team_id = t.id;
  if n >= 7 then return jsonb_build_object('ok', false, 'error', 'team_full'); end if;
  if exists (select 1 from public.yb_invites i where i.team_id = t.id and i.seeker = s.user_id and i.status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'already_invited');
  end if;
  if (select count(*) from public.yb_invites i where i.team_id = t.id and i.status = 'pending') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_invites');
  end if;
  insert into public.yb_invites (team_id, seeker, created_by) values (t.id, s.user_id, me);
  perform public.yb_notify(array_remove(array[s.user_id, s.guardian_by], null), 'invite_new', jsonb_build_object('team_name', t.name));
  insert into public.audit_log (user_id, action, detail) values (me, 'invite_send', jsonb_build_object('team_id', t.id, 'seeker', s.user_id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_invite_cancel(id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); i public.yb_invites;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into i from public.yb_invites x where x.id = yb_invite_cancel.id;
  if i.id is null or i.team_id is distinct from public.yb_led_team(me) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if i.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'not_pending'); end if;
  update public.yb_invites x set status = 'cancelled', decided_at = now() where x.id = i.id;
  insert into public.audit_log (user_id, action, detail) values (me, 'invite_cancel', jsonb_build_object('invite', i.id));
  return jsonb_build_object('ok', true);
end $$;

-- the player (and, for a minor approved by a parent, the parent) answers; both yes = the player joins the roster
create or replace function public.yb_invite_answer(id uuid, accept boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); i public.yb_invites; s public.yb_seekers; t public.teams; need_g boolean; who text; n int; nm text; fname text;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into i from public.yb_invites x where x.id = yb_invite_answer.id for update;
  if i.id is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into s from public.yb_seekers x where x.user_id = i.seeker;
  who := case when me = i.seeker then 'player' when s.guardian_by is not null and me = s.guardian_by then 'guardian' end;
  if who is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  if i.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'not_pending'); end if;
  select * into t from public.teams x where x.id = i.team_id for update;
  select p.full_name into fname from public.profiles p where p.id = i.seeker;
  nm := public.yb_first_name(fname);
  if not coalesce(yb_invite_answer.accept, false) then
    update public.yb_invites x set status = 'declined', decided_at = now() where x.id = i.id;
    perform public.yb_notify(array_remove(array[t.leader_id], null), 'invite_answer', jsonb_build_object('accepted', false, 'first_name', nm, 'team_name', t.name));
    insert into public.audit_log (user_id, action, detail) values (me, 'invite_decline', jsonb_build_object('invite', i.id));
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
  need_g := s.age_group is distinct from 'adult' and s.guardian_by is not null;
  if who = 'player' then update public.yb_invites x set player_ok = true where x.id = i.id; i.player_ok := true;
  else update public.yb_invites x set guardian_ok = true where x.id = i.id; i.guardian_ok := true; end if;
  if not i.player_ok or (need_g and not i.guardian_ok) then
    -- one yes so far: tell the one still to answer
    perform public.yb_notify(array_remove(array[case when i.player_ok then s.guardian_by else i.seeker end], null), 'invite_waiting', jsonb_build_object('team_name', t.name));
    return jsonb_build_object('ok', true, 'status', 'pending', 'waiting', case when i.player_ok then 'guardian' else 'player' end);
  end if;
  -- both said yes: join, if the roster can still change and has room
  if t.status not in ('submitted', 'returned') then return jsonb_build_object('ok', false, 'error', 'roster_locked'); end if;
  if public.yb_seek_team(i.seeker) is not null then return jsonb_build_object('ok', false, 'error', 'in_other_team'); end if;
  select count(*) into n from public.team_members m where m.team_id = t.id;
  if n >= 7 then return jsonb_build_object('ok', false, 'error', 'team_full'); end if;
  insert into public.team_members (team_id, full_name, age, user_id, consent_status) values (t.id, btrim(fname), null, i.seeker, 'pending');
  update public.yb_invites x set status = 'accepted', decided_at = now() where x.id = i.id;
  update public.yb_invites x set status = 'cancelled', decided_at = now() where x.seeker = i.seeker and x.status = 'pending' and x.id <> i.id;
  update public.yb_seekers x set active = false, updated_at = now() where x.user_id = i.seeker;
  perform public.yb_notify(array_remove(array[t.leader_id], null), 'invite_answer', jsonb_build_object('accepted', true, 'first_name', nm, 'team_name', t.name));
  insert into public.audit_log (user_id, action, detail) values (me, 'invite_accept', jsonb_build_object('invite', i.id, 'team_id', t.id));
  return jsonb_build_object('ok', true, 'status', 'accepted', 'team_name', t.name);
end $$;

-- ---------------------------------------------------------------- the admin
create or replace function public.yb_set_transfers(allow boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  insert into public.yb_settings as s (key, value, updated_by) values ('transfers_open', to_jsonb(coalesce(yb_set_transfers.allow, false)), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'transfers', jsonb_build_object('open', coalesce(yb_set_transfers.allow, false)));
  return jsonb_build_object('ok', true, 'open', coalesce(yb_set_transfers.allow, false));
end $$;

create or replace function public.yb_seek_stats()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('transfers_open', public.yb_transfers_open(),
    'seekers', (select count(*) from public.yb_seekers s where s.active),
    'listed', (select count(*) from public.yb_seekers s where s.active and public.yb_seek_guardian_ok(s.user_id)),
    'waiting_guardian', (select count(*) from public.yb_seekers s where s.active and not public.yb_seek_guardian_ok(s.user_id)),
    'invites_open', (select count(*) from public.yb_invites i where i.status = 'pending'),
    'joined', (select count(*) from public.yb_invites i where i.status = 'accepted'));
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.yb_transfers_open(), public.yb_first_name(text), public.yb_seek_guardian_ok(uuid), public.yb_seek_team(uuid),
  public.yb_seek_new_code(), public.yb_led_team(uuid), public.yb_player_counts(uuid), public.yb_seek_me(), public.yb_seek_save(jsonb),
  public.yb_seek_stop(), public.yb_seek_guardian(text), public.yb_guardian_seekers(), public.yb_seek_guardian_revoke(uuid), public.yb_seek_pool(),
  public.yb_invite_send(uuid), public.yb_invite_cancel(uuid), public.yb_invite_answer(uuid, boolean), public.yb_set_transfers(boolean),
  public.yb_seek_stats() from public, anon;
-- the helpers are for the functions above only (Supabase grants new functions to signed-in users by default)
revoke all on function public.yb_transfers_open(), public.yb_first_name(text), public.yb_seek_guardian_ok(uuid), public.yb_seek_team(uuid),
  public.yb_seek_new_code(), public.yb_led_team(uuid), public.yb_player_counts(uuid) from authenticated;
grant execute on function public.yb_seek_me(), public.yb_seek_save(jsonb), public.yb_seek_stop(), public.yb_seek_guardian(text),
  public.yb_guardian_seekers(), public.yb_seek_guardian_revoke(uuid), public.yb_seek_pool(), public.yb_invite_send(uuid),
  public.yb_invite_cancel(uuid), public.yb_invite_answer(uuid, boolean), public.yb_set_transfers(boolean), public.yb_seek_stats() to authenticated;
