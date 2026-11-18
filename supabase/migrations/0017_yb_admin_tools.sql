-- Yanabee 0017: tools for the admin (owner, Nov 2026: "the admin needs more to do, like adding things").
--   1. The value of the week (yb_week_themes): the admin writes a title and a few lines for a week; every signed-in
--      person reads the current one. The method names the values by phase; the admin picks the week's own.
--   2. Encouragement awards (yb_awards): the admin gives a team, or one member of it, an award from the kinds the
--      competition announces (memorisation, understanding, practice, cooperation, initiative, commitment, the
--      leader). They are encouragement during the season, not the final prizes. The team's own people see them
--      (a member by first name); the admin sees all and can take one back.
--   3. Tasks from the admin to the team leaders (yb_admin_tasks): the admin adds a task with an optional due date;
--      each leader ticks it for their team; the admin sees which teams are done.
-- Everything goes through functions; the tables are closed. This migration stands alone (it needs 0011, not 0015).

create table if not exists public.yb_week_themes (
  week       date primary key,
  title      text not null,
  body       text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint yb_wt_week check (extract(dow from week) = 6),
  constraint yb_wt_title check (char_length(title) between 3 and 60),
  constraint yb_wt_body check (body is null or char_length(body) <= 300)
);
create table if not exists public.yb_awards (
  id         bigint generated always as identity primary key,
  team_id    uuid not null references public.teams (id) on delete cascade,
  member_id  uuid references public.team_members (id) on delete cascade,
  kind       text not null,
  note       text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint yb_aw_kind check (kind in ('hifz', 'fahm', 'tatbiq', 'taawun', 'mubadara', 'iltizam', 'leader')),
  constraint yb_aw_note check (note is null or char_length(note) <= 120)
);
create index if not exists yb_awards_team_idx on public.yb_awards (team_id, created_at desc);
create table if not exists public.yb_admin_tasks (
  id         bigint generated always as identity primary key,
  title      text not null,
  due        date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint yb_at_title check (char_length(title) between 5 and 120)
);
create table if not exists public.yb_admin_task_done (
  task_id bigint not null references public.yb_admin_tasks (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (task_id, team_id)
);
do $$ declare t text; begin
  foreach t in array array['yb_week_themes', 'yb_awards', 'yb_admin_tasks', 'yb_admin_task_done'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- the week's value and the admin's tasks follow the person's choice for announcements; awards always arrive
create or replace function public.yb_note_group(kind text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
           when kind in ('result_pending', 'result_approved') or kind like 'event_%' then 'matches'
           when kind in ('submission_new', 'submission_reviewed', 'submission_featured') then 'projects'
           when kind in ('announcement', 'week_theme', 'admin_task') then 'announcements'
           when kind in ('post_pending', 'comment_new') then 'feed'
         end
$$;

create or replace function public.yb_approved_team_ids()
returns uuid[]
language sql stable security definer
set search_path = public, pg_temp
as $$ select coalesce(array_agg(t.id), '{}') from public.teams t where t.status::text = 'approved' $$;

-- ---------------------------------------------------------------- 1. the value of the week
create or replace function public.yb_theme_set(week date, title text, body text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare w date := yb_theme_set.week; ti text := btrim(regexp_replace(coalesce(yb_theme_set.title, ''), '\s+', ' ', 'g'));
  b text := nullif(btrim(regexp_replace(coalesce(yb_theme_set.body, ''), '\s+', ' ', 'g')), ''); fresh boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if w is null or extract(dow from w) <> 6 or w not between current_date - 7 and current_date + 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if ti = '' then
    delete from public.yb_week_themes x where x.week = w;
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  if char_length(ti) not between 3 and 60 or char_length(coalesce(b, '')) > 300 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if public.yb_has_contact(ti) or public.yb_has_contact(coalesce(b, '')) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  fresh := not exists (select 1 from public.yb_week_themes x where x.week = w);
  insert into public.yb_week_themes as x (week, title, body, updated_by) values (w, ti, b, auth.uid())
  on conflict on constraint yb_week_themes_pkey do update set title = excluded.title, body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
  if fresh and w <= current_date then   -- tell the teams once, when a running week gets its value
    perform public.yb_notify(public.yb_team_people(public.yb_approved_team_ids()), 'week_theme', jsonb_build_object('title', ti));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- every signed-in person: the value of that week, or null
create or replace function public.yb_theme_get(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return (select jsonb_build_object('week', to_char(x.week, 'YYYY-MM-DD'), 'title', x.title, 'body', x.body) from public.yb_week_themes x where x.week = yb_theme_get.week);
end $$;

create or replace function public.yb_theme_list()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('week', to_char(x.week, 'YYYY-MM-DD'), 'title', x.title, 'body', x.body) order by x.week desc)
    from (select * from public.yb_week_themes order by week desc limit 16) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- 2. awards
create or replace function public.yb_award_give(team_id uuid, kind text, member_id uuid default null, note text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_award_give.team_id; mid uuid := yb_award_give.member_id; k text := yb_award_give.kind;
  n text := nullif(btrim(regexp_replace(coalesce(yb_award_give.note, ''), '\s+', ' ', 'g')), ''); nm text; new_id bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select x.name into nm from public.teams x where x.id = t and x.status::text = 'approved';
  if nm is null then return jsonb_build_object('ok', false, 'error', 'team_not_found'); end if;
  if k not in ('hifz', 'fahm', 'tatbiq', 'taawun', 'mubadara', 'iltizam', 'leader') or char_length(coalesce(n, '')) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if n is not null and public.yb_has_contact(n) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  if mid is not null and not exists (select 1 from public.team_members m where m.id = mid and m.team_id = t) then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;
  if k = 'leader' then mid := null; end if;   -- the leader's award names the team's leader, not a member
  if exists (select 1 from public.yb_awards a where a.team_id = t and a.kind = k and a.member_id is not distinct from mid and a.created_at > now() - interval '6 days') then
    return jsonb_build_object('ok', false, 'error', 'already_given');
  end if;
  insert into public.yb_awards (team_id, member_id, kind, note, created_by) values (t, mid, k, n, auth.uid()) returning id into new_id;
  perform public.yb_notify(public.yb_team_people(array[t]), 'award', jsonb_build_object('team_name', nm, 'kind', k));
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'award_give', jsonb_build_object('team_id', t, 'kind', k));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.yb_award_remove(id bigint)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from public.yb_awards a where a.id = yb_award_remove.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'award_remove', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- the team's own people (leader, joined members, linked parents) and staff; a member is named by first name
create or replace function public.yb_team_awards(team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_team_awards.team_id; me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (exists (select 1 from public.profiles p where p.id = me and p.role::text in ('admin', 'officer'))
          or exists (select 1 from public.teams x where x.id = t and x.leader_id = me)
          or exists (select 1 from public.team_members m where m.team_id = t and m.user_id = me)
          or exists (select 1 from public.parent_links l join public.team_members m on m.id = l.member_id where l.parent_id = me and m.team_id = t)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'note', a.note, 'at', a.created_at,
      'member', (select public.yb_first_name(m.full_name) from public.team_members m where m.id = a.member_id),
      'mine', exists (select 1 from public.team_members m where m.id = a.member_id and m.user_id = me)) order by a.created_at desc)
    from public.yb_awards a where a.team_id = t), '[]'::jsonb);
end $$;

create or replace function public.yb_awards_all()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'team_id', a.team_id, 'team_name', t.name, 'kind', a.kind, 'note', a.note, 'at', a.created_at,
      'member', (select m.full_name from public.team_members m where m.id = a.member_id)) order by a.created_at desc)
    from (select * from public.yb_awards order by created_at desc limit 100) a join public.teams t on t.id = a.team_id), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- 3. tasks for the leaders
create or replace function public.yb_task_add(title text, due date default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare ti text := btrim(regexp_replace(coalesce(yb_task_add.title, ''), '\s+', ' ', 'g')); new_id bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if char_length(ti) not between 5 and 120 or (yb_task_add.due is not null and yb_task_add.due not between current_date - 1 and current_date + 120) then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if public.yb_has_contact(ti) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  if (select count(*) from public.yb_admin_tasks) >= 30 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  insert into public.yb_admin_tasks (title, due, created_by) values (ti, yb_task_add.due, auth.uid()) returning id into new_id;
  perform public.yb_notify(array(select t.leader_id from public.teams t where t.status::text = 'approved'), 'admin_task', jsonb_build_object('title', ti));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.yb_task_remove(id bigint)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from public.yb_admin_tasks a where a.id = yb_task_remove.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- the admin: every task with the approved teams that finished it and those that did not
create or replace function public.yb_tasks_admin()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'due', to_char(a.due, 'YYYY-MM-DD'), 'at', a.created_at,
      'teams', (select count(*) from public.teams t where t.status::text = 'approved'),
      'done', coalesce((select jsonb_agg(t.name order by t.name) from public.teams t join public.yb_admin_task_done d on d.team_id = t.id and d.task_id = a.id where t.status::text = 'approved'), '[]'::jsonb),
      'waiting', coalesce((select jsonb_agg(t.name order by t.name) from public.teams t where t.status::text = 'approved'
                             and not exists (select 1 from public.yb_admin_task_done d where d.team_id = t.id and d.task_id = a.id)), '[]'::jsonb)) order by a.created_at desc)
    from public.yb_admin_tasks a), '[]'::jsonb);
end $$;

-- the team's leader: the tasks, and whether this team ticked each
create or replace function public.yb_tasks_mine(team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_tasks_mine.team_id;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid()) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'due', to_char(a.due, 'YYYY-MM-DD'),
      'done', exists (select 1 from public.yb_admin_task_done d where d.task_id = a.id and d.team_id = t)) order by a.due nulls last, a.created_at)
    from public.yb_admin_tasks a), '[]'::jsonb);
end $$;

create or replace function public.yb_task_tick(task_id bigint, team_id uuid, done boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_task_tick.team_id; k bigint := yb_task_tick.task_id;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid()) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.yb_admin_tasks a where a.id = k) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(yb_task_tick.done, false) then
    insert into public.yb_admin_task_done (task_id, team_id) values (k, t) on conflict do nothing;
  else
    delete from public.yb_admin_task_done d where d.task_id = k and d.team_id = t;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.yb_approved_team_ids(), public.yb_theme_set(date, text, text), public.yb_theme_get(date), public.yb_theme_list(),
  public.yb_award_give(uuid, text, uuid, text), public.yb_award_remove(bigint), public.yb_team_awards(uuid), public.yb_awards_all(),
  public.yb_task_add(text, date), public.yb_task_remove(bigint), public.yb_tasks_admin(), public.yb_tasks_mine(uuid), public.yb_task_tick(bigint, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.yb_theme_set(date, text, text), public.yb_theme_get(date), public.yb_theme_list(),
  public.yb_award_give(uuid, text, uuid, text), public.yb_award_remove(bigint), public.yb_team_awards(uuid), public.yb_awards_all(),
  public.yb_task_add(text, date), public.yb_task_remove(bigint), public.yb_tasks_admin(), public.yb_tasks_mine(uuid), public.yb_task_tick(bigint, uuid, boolean)
  to authenticated;
