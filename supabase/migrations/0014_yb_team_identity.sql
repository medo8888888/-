-- Yanabee 0014: the team's identity (owner request Nov 2026: "where is the logo for team ... who is manager who is
-- assistant manager").
--
-- 1. The assistant leader. team_members.roles gains 'assistant' (one per team, never the leader's own row). It is a
--    title only: it gives no extra permission. The leader sets it at any time (it is not part of the registration
--    review), and so do the admin and the registration officer. yb_set_roles keeps it when the nominees change.
-- 2. yb_team_staff(team): who leads the team (leader, assistant, coordinator), for the team's own people (leader,
--    joined members, linked parents) and for officers and the admin. A parent who is not otherwise staff sees a
--    child's first name only. Never public.
-- 3. The team's logo. yb_team_style.logo_path: a picture in the PRIVATE bucket 'yanabee-logos' under <team_id>/<file>,
--    uploaded by the team's leader or the admin (at most 3 files a team), read by signed-in people through signed
--    links, never by visitors. The admin can remove any logo. The color and the badge stay public as before.

-- ---------------------------------------------------------------------------
-- 1. The assistant
-- ---------------------------------------------------------------------------
alter table public.team_members drop constraint if exists members_roles_chk;
alter table public.team_members add constraint members_roles_chk
  check (roles <@ array['reciter', 'reserve', 'chess', 'coord', 'assistant']::text[]);

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
                 || case when 'assistant' = any (m.roles)  then array['assistant'] else '{}'::text[] end
   where m.team_id = t;
  return jsonb_build_object('ok', true);
end $$;

-- the leader (any time), the admin or the registration officer names the assistant; null = nobody
create or replace function public.yb_set_assistant(team_id uuid, member_id uuid default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_set_assistant.team_id; mid uuid := yb_set_assistant.member_id;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_can_review() or exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid())) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if mid is not null and not exists (select 1 from public.team_members m where m.id = mid and m.team_id = t) then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;
  if mid is not null and exists (select 1 from public.team_members m where m.id = mid and m.is_leader) then
    return jsonb_build_object('ok', false, 'error', 'leader_is_leader');
  end if;
  update public.team_members m set roles = array_remove(m.roles, 'assistant')
   where m.team_id = t and 'assistant' = any (m.roles) and m.id is distinct from mid;
  if mid is not null then
    update public.team_members m set roles = m.roles || array['assistant']
     where m.id = mid and not ('assistant' = any (m.roles));
  end if;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'team_assistant', jsonb_build_object('team_id', t, 'set', mid is not null));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Who leads the team
-- ---------------------------------------------------------------------------
create or replace function public.yb_team_staff(team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  t uuid := yb_team_staff.team_id; me uuid := auth.uid(); r text;
  inside boolean; parent_only boolean; ldr text; ast text; crd text;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select p.role::text into r from public.profiles p where p.id = me;
  inside := coalesce(r in ('admin', 'officer'), false)
            or exists (select 1 from public.teams x where x.id = t and x.leader_id = me)
            or exists (select 1 from public.team_members m where m.team_id = t and m.user_id = me);
  parent_only := not inside and exists (select 1 from public.parent_links l join public.team_members m on m.id = l.member_id
                                         where l.parent_id = me and m.team_id = t);
  if not (inside or parent_only) then raise exception 'permission_denied' using errcode = '42501'; end if;
  select coalesce((select p.full_name from public.teams x join public.profiles p on p.id = x.leader_id where x.id = t),
                  (select m.full_name from public.team_members m where m.team_id = t and m.is_leader limit 1)) into ldr;
  select m.full_name into ast from public.team_members m where m.team_id = t and 'assistant' = any (m.roles) limit 1;
  select m.full_name into crd from public.team_members m where m.team_id = t and 'coord' = any (m.roles) limit 1;
  if parent_only then
    ast := split_part(btrim(coalesce(ast, '')), ' ', 1);
    crd := split_part(btrim(coalesce(crd, '')), ' ', 1);
  end if;
  return jsonb_build_object('leader', nullif(btrim(coalesce(ldr, '')), ''), 'assistant', nullif(ast, ''), 'coord', nullif(crd, ''),
    'members', (select count(*) from public.team_members m where m.team_id = t),
    'can_edit', coalesce(r = 'admin', false) or public.yb_can_review() or exists (select 1 from public.teams x where x.id = t and x.leader_id = me));
end $$;

-- ---------------------------------------------------------------------------
-- 3. The logo
-- ---------------------------------------------------------------------------
alter table public.yb_team_style add column if not exists logo_path text;
alter table public.yb_team_style drop constraint if exists yb_ts_logo_len;
alter table public.yb_team_style add constraint yb_ts_logo_len check (logo_path is null or char_length(logo_path) <= 200);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yanabee-logos', 'yanabee-logos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- logos: <team>/<file>; the team's leader or the admin, at most 3 files a team
create or replace function public.yb_logo_can_write(path text, adding boolean)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare parts text[] := string_to_array(coalesce(path, ''), '/');
begin
  if auth.uid() is null or cardinality(parts) <> 2 or parts[2] = '' or char_length(path) > 200 then return false; end if;
  if parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if not (public.is_admin() or exists (select 1 from public.teams t where t.id = parts[1]::uuid and t.leader_id = auth.uid())) then return false; end if;
  if adding and (select count(*) from storage.objects o where o.bucket_id = 'yanabee-logos'
                  and left(o.name, char_length(parts[1] || '/')) = parts[1] || '/') >= 3 then
    return false;
  end if;
  return true;
end $$;

drop policy if exists yb_logo_obj_insert on storage.objects;
create policy yb_logo_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'yanabee-logos' and (select public.yb_logo_can_write(name, true)));
drop policy if exists yb_logo_obj_select on storage.objects;
create policy yb_logo_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'yanabee-logos' and (select public.yb_feed_member()));
drop policy if exists yb_logo_obj_delete on storage.objects;
create policy yb_logo_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'yanabee-logos' and (select public.yb_logo_can_write(name, false)));

-- path: a file already uploaded into the team's folder, or null to remove the logo
create or replace function public.yb_set_team_logo(team_id uuid, path text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_set_team_logo.team_id; p text := nullif(yb_set_team_logo.path, '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.is_admin() or exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid())) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p is not null and (char_length(p) > 200 or left(p, 37) <> t::text || '/' or position('/' in substr(p, 38)) > 0
       or not exists (select 1 from storage.objects o where o.bucket_id = 'yanabee-logos' and o.name = p)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  insert into public.yb_team_style as s (team_id, logo_path, updated_by) values (t, p, auth.uid())
  on conflict on constraint yb_team_style_pkey do update set logo_path = excluded.logo_path, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), case when p is null then 'team_logo_removed' else 'team_logo_set' end, jsonb_build_object('team_id', t));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------
grant select (logo_path) on public.yb_team_style to authenticated;
revoke all on function public.yb_set_assistant(uuid, uuid), public.yb_team_staff(uuid), public.yb_logo_can_write(text, boolean),
  public.yb_set_team_logo(uuid, text) from public, anon, authenticated;
grant execute on function public.yb_set_assistant(uuid, uuid), public.yb_team_staff(uuid), public.yb_logo_can_write(text, boolean),
  public.yb_set_team_logo(uuid, text) to authenticated;
comment on column public.team_members.roles is 'reciter / reserve / chess / coord / assistant. Staff and the own team only; never public.';
