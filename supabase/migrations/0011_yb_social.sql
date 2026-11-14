-- Yanabee 0011: the news feed, customization, a safe leader handover, and the admin's statistics.
-- (Owner's requests of 13 Nov 2026: "like news or social media", team identity, profile pictures,
-- personal settings, notification choices, "charts and analytics", changing a leader's role.)
--
-- FEED. Posts are written by the admin (published at once) and by team leaders (pending until the
-- admin publishes them; that is also where the admin checks the parents' consent for any photo,
-- competition.txt cd4). Up to 4 photos per post in the PRIVATE bucket 'yanabee-feed' under
-- <author_id>/<post_id>/<file>; signed-in people read the photos of published posts only. Every
-- signed-in person reads published posts and reacts (one reaction each: clap, heart, dua, strong).
-- Comments: leaders, parents, officers and the admin; members (children) only when the admin turns
-- it on (yb_settings 'members_comment', off by default: the owner has not decided student chat yet).
-- Comments refuse phone numbers and e-mail addresses (yb_has_contact, 0009), one per 3 seconds; any
-- signed-in person reports a comment; the admin hides comments, mutes people (the same mute as the
-- leaders room, yb_chat_mutes), pins, hides and deletes posts. A member's name shows as the first
-- name only. Nothing here is public: the feed is for signed-in people.
--
-- CUSTOMIZATION. yb_team_style: a team's color and badge (the leader or the admin; public, no
-- personal data). yb_profile_prefs: per person, the profile picture (adults only: leader, parent,
-- officer, admin; children get initials), theme, accent, text size, hidden dashboard sections and
-- the notification groups they turned off. yb_notify (0003) now skips a person who turned a group
-- off; essential notes (team status, consent, judging, results, moderation) always arrive.
-- Pictures: PRIVATE bucket 'yanabee-avatars' under <user_id>/<file>, read by signed-in people.
--
-- HANDOVER. set_user_role (0001) no longer moves a leader who still leads a team to another role
-- ('leads_team'): the admin first hands the team to someone else (yb_transfer_team), who becomes
-- its leader; the old leader stays in the team as a member or leaves it.
--
-- STATISTICS. yb_analytics(): the admin's numbers for the charts (counts only, no names of
-- children, no contact data).
-- ASCII only.

-- ---------------------------------------------------------------------------
-- 1. Customization tables
-- ---------------------------------------------------------------------------
create table if not exists public.yb_team_style (
  team_id    uuid primary key references public.teams (id) on delete cascade,
  color      text not null default 'teal',
  badge      text not null default 'star',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint yb_ts_color_chk check (color in ('teal', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'pink')),
  constraint yb_ts_badge_chk check (badge in ('star', 'moon', 'sun', 'leaf', 'book', 'ball', 'chess', 'bolt', 'heart', 'shield'))
);

create table if not exists public.yb_profile_prefs (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  avatar_path     text,
  theme           text not null default 'auto',
  accent          text not null default 'teal',
  text_size       text not null default 'm',
  hidden_sections text[] not null default '{}',
  notify_off      text[] not null default '{}',
  updated_at      timestamptz not null default now(),
  constraint yb_pp_theme_chk  check (theme in ('auto', 'light', 'dark')),
  constraint yb_pp_accent_chk check (accent in ('teal', 'blue', 'green', 'amber', 'orange', 'red', 'purple', 'pink')),
  constraint yb_pp_size_chk   check (text_size in ('m', 'l', 'xl')),
  constraint yb_pp_hidden_chk check (cardinality(hidden_sections) <= 12 and hidden_sections <@ array['matches', 'team', 'projects', 'room', 'review', 'results', 'dates', 'link', 'judge', 'feed']),
  constraint yb_pp_notify_chk check (notify_off <@ array['matches', 'projects', 'announcements', 'feed']),
  constraint yb_pp_avatar_len check (avatar_path is null or char_length(avatar_path) <= 200)
);

alter table public.yb_team_style enable row level security;
alter table public.yb_team_style force row level security;
alter table public.yb_profile_prefs enable row level security;
alter table public.yb_profile_prefs force row level security;

drop policy if exists yb_ts_read on public.yb_team_style;
create policy yb_ts_read on public.yb_team_style for select to anon, authenticated using (true);

-- the notification group of a kind; null = essential (always delivered)
create or replace function public.yb_note_group(kind text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case
           when kind in ('result_pending', 'result_approved') or kind like 'event_%' then 'matches'
           when kind in ('submission_new', 'submission_reviewed', 'submission_featured') then 'projects'
           when kind = 'announcement' then 'announcements'
           when kind in ('post_pending', 'comment_new') then 'feed'
         end
$$;

-- 0003's yb_notify, now respecting each person's choices (essential notes always go)
create or replace function public.yb_notify(uids uuid[], kind text, data jsonb)
returns void
language sql volatile security definer
set search_path = public, pg_temp
as $$
  insert into public.yb_notifications (user_id, kind, data)
  select distinct u, kind, coalesce(data, '{}'::jsonb)
    from unnest(uids) as u
   where u is not null and exists (select 1 from public.profiles p where p.id = u)
     and not exists (select 1 from public.yb_profile_prefs pp
                      where pp.user_id = u and public.yb_note_group(kind) = any (pp.notify_off))
$$;

-- grown-ups may show a picture; a member (child) never does
create or replace function public.yb_is_adult(u uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.role::text in ('leader', 'parent', 'officer', 'admin') from public.profiles p where p.id = u), false)
$$;

-- the name others see: a member's first name only
create or replace function public.yb_display_name(u uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when p.role::text = 'member' then split_part(btrim(p.full_name), ' ', 1) else btrim(p.full_name) end
    from public.profiles p where p.id = u
$$;

-- the caller's own settings (the defaults when none is saved yet)
create or replace function public.yb_my_prefs()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare r public.yb_profile_prefs%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into r from public.yb_profile_prefs p where p.user_id = auth.uid();
  return jsonb_build_object(
    'avatar_path', r.avatar_path, 'theme', coalesce(r.theme, 'auto'), 'accent', coalesce(r.accent, 'teal'),
    'text_size', coalesce(r.text_size, 'm'), 'hidden_sections', to_jsonb(coalesce(r.hidden_sections, '{}')),
    'notify_off', to_jsonb(coalesce(r.notify_off, '{}')), 'can_avatar', public.yb_is_adult(auth.uid()));
end $$;

-- p: any of {theme, accent, text_size, hidden_sections, notify_off, avatar (a path in the caller's own folder, or null)}
create or replace function public.yb_save_prefs(p jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  av text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_argument'; end if;
  if p ? 'avatar' then
    av := nullif(p ->> 'avatar', '');
    if av is not null then
      if not public.yb_is_adult(auth.uid()) then return jsonb_build_object('ok', false, 'error', 'avatar_adults_only'); end if;
      if split_part(av, '/', 1) <> auth.uid()::text or cardinality(string_to_array(av, '/')) <> 2
         or not exists (select 1 from storage.objects o where o.bucket_id = 'yanabee-avatars' and o.name = av) then
        return jsonb_build_object('ok', false, 'error', 'bad_photo');
      end if;
    end if;
  end if;
  begin
    insert into public.yb_profile_prefs as x (user_id) values (auth.uid()) on conflict (user_id) do nothing;
    update public.yb_profile_prefs x set
      theme = case when p ? 'theme' then p ->> 'theme' else x.theme end,
      accent = case when p ? 'accent' then p ->> 'accent' else x.accent end,
      text_size = case when p ? 'text_size' then p ->> 'text_size' else x.text_size end,
      hidden_sections = case when p ? 'hidden_sections' and jsonb_typeof(p -> 'hidden_sections') = 'array'
                             then array(select distinct jsonb_array_elements_text(p -> 'hidden_sections')) else x.hidden_sections end,
      notify_off = case when p ? 'notify_off' and jsonb_typeof(p -> 'notify_off') = 'array'
                        then array(select distinct jsonb_array_elements_text(p -> 'notify_off')) else x.notify_off end,
      avatar_path = case when p ? 'avatar' then av else x.avatar_path end,
      updated_at = now()
     where x.user_id = auth.uid();
  exception when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end;
  return jsonb_build_object('ok', true, 'prefs', public.yb_my_prefs());
end $$;

-- the leader of the team (or the admin) sets its color and badge
create or replace function public.yb_set_team_style(team_id uuid, color text, badge text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.is_admin() or exists (select 1 from public.teams t where t.id = yb_set_team_style.team_id and t.leader_id = auth.uid())) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  begin
    insert into public.yb_team_style as s (team_id, color, badge, updated_by)
    values (yb_set_team_style.team_id, yb_set_team_style.color, yb_set_team_style.badge, auth.uid())
    on conflict on constraint yb_team_style_pkey do update set color = excluded.color, badge = excluded.badge, updated_by = excluded.updated_by, updated_at = now();
  exception when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 2. The feed
-- ---------------------------------------------------------------------------
create table if not exists public.yb_posts (
  id           uuid primary key,
  author       uuid references public.profiles (id) on delete set null,
  author_role  text not null,
  team_id      uuid references public.teams (id) on delete set null,
  body         text not null,
  photos       text[] not null default '{}',
  status       text not null default 'pending',
  review_note  text,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  constraint yb_post_status_chk check (status in ('pending', 'published', 'rejected', 'hidden')),
  constraint yb_post_body_len   check (char_length(btrim(body)) between 1 and 1500),
  constraint yb_post_photos_chk check (cardinality(photos) <= 4),
  constraint yb_post_note_len   check (review_note is null or char_length(review_note) <= 300),
  constraint yb_post_pin_chk    check (not pinned or status = 'published')
);
create index if not exists yb_posts_feed_idx on public.yb_posts (status, published_at desc);
create index if not exists yb_posts_author_idx on public.yb_posts (author, created_at desc);

create table if not exists public.yb_post_reactions (
  post_id    uuid not null references public.yb_posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now(),
  constraint yb_post_reactions_pkey primary key (post_id, user_id),
  constraint yb_react_kind_chk check (kind in ('clap', 'heart', 'dua', 'strong'))
);

create table if not exists public.yb_post_comments (
  id         bigint generated always as identity primary key,
  post_id    uuid not null references public.yb_posts (id) on delete cascade,
  author     uuid references public.profiles (id) on delete set null,
  body       text not null,
  hidden     boolean not null default false,
  hidden_by  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint yb_cmt_body_len check (char_length(btrim(body)) between 1 and 500)
);
create index if not exists yb_post_comments_post_idx on public.yb_post_comments (post_id, id);
create index if not exists yb_post_comments_author_idx on public.yb_post_comments (author, created_at desc);

create table if not exists public.yb_comment_reports (
  comment_id bigint not null references public.yb_post_comments (id) on delete cascade,
  reporter   uuid not null references public.profiles (id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  resolved   boolean not null default false,
  constraint yb_comment_reports_pkey primary key (comment_id, reporter),
  constraint yb_creport_reason_len check (reason is null or char_length(reason) <= 200)
);

alter table public.yb_posts enable row level security;
alter table public.yb_posts force row level security;
alter table public.yb_post_reactions enable row level security;
alter table public.yb_post_reactions force row level security;
alter table public.yb_post_comments enable row level security;
alter table public.yb_post_comments force row level security;
alter table public.yb_comment_reports enable row level security;
alter table public.yb_comment_reports force row level security;

insert into public.yb_settings (key, value) values ('members_comment', 'false'::jsonb) on conflict (key) do nothing;

-- every signed-in person of the competition
create or replace function public.yb_feed_member()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid())
$$;

create or replace function public.yb_can_comment()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.yb_role() in ('leader', 'parent', 'officer', 'admin'), false)
      or (public.yb_role() = 'member'
          and coalesce((select (s.value)::text = 'true' from public.yb_settings s where s.key = 'members_comment'), false))
$$;

-- may the caller see this post? published, or their own, or the admin
create or replace function public.yb_post_visible(pid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.yb_posts x
                  where x.id = pid and (x.status = 'published' or x.author = auth.uid() or public.is_admin()))
     and public.yb_feed_member()
$$;

-- one post as the client shows it
create or replace function public.yb_post_json(x public.yb_posts)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', x.id, 'body', x.body, 'photos', to_jsonb(x.photos), 'status', x.status, 'pinned', x.pinned,
    'review_note', case when x.author = auth.uid() or public.is_admin() then x.review_note end,
    'created_at', x.created_at, 'published_at', x.published_at, 'updated_at', x.updated_at,
    'mine', coalesce(x.author = auth.uid(), false),
    'author_name', coalesce(public.yb_display_name(x.author), ''), 'author_role', x.author_role,
    'author_avatar', case when public.yb_is_adult(x.author) then (select pp.avatar_path from public.yb_profile_prefs pp where pp.user_id = x.author) end,
    'team_id', x.team_id, 'team_name', (select t.name from public.teams t where t.id = x.team_id),
    'team_color', (select s.color from public.yb_team_style s where s.team_id = x.team_id),
    'team_badge', (select s.badge from public.yb_team_style s where s.team_id = x.team_id),
    'reactions', coalesce((select jsonb_object_agg(r.kind, r.n) from (select q.kind, count(*)::int n from public.yb_post_reactions q where q.post_id = x.id group by q.kind) r), '{}'::jsonb),
    'my_reaction', (select q.kind from public.yb_post_reactions q where q.post_id = x.id and q.user_id = auth.uid()),
    'comments', (select count(*)::int from public.yb_post_comments c where c.post_id = x.id and (not c.hidden or public.is_admin())))
$$;

-- the feed: newest first, pinned on the first page. before = the 'at' of the last post already shown.
-- {posts, can_post, can_comment, admin, members_comment, queue (admin: waiting posts), reports (admin: open comment reports)}
create or replace function public.yb_feed(before timestamptz default null, lim int default 15)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  adm boolean := public.is_admin();
  n int := greatest(1, least(coalesce(lim, 15), 30));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_feed_member() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(public.yb_post_json(s.p) || jsonb_build_object('at', s.o2) order by s.o1 desc, s.o2 desc)
        from (select p, (p.pinned and yb_feed.before is null) as o1, coalesce(p.published_at, p.created_at) as o2
                from public.yb_posts p
               where (p.status = 'published' or p.author = auth.uid() or (adm and p.status = 'hidden'))
                 and (yb_feed.before is null or (coalesce(p.published_at, p.created_at) < yb_feed.before and not p.pinned))
               order by 2 desc, 3 desc
               limit n) s), '[]'::jsonb),
    'can_post', coalesce(public.yb_role() in ('leader', 'admin'), false)
                and (public.yb_role() = 'admin' or exists (select 1 from public.teams t where t.leader_id = auth.uid())),
    'can_comment', public.yb_can_comment(),
    'admin', adm,
    'members_comment', coalesce((select (s.value)::text = 'true' from public.yb_settings s where s.key = 'members_comment'), false),
    'queue', case when adm and yb_feed.before is null then coalesce((
      select jsonb_agg(public.yb_post_json(x) order by x.created_at) from public.yb_posts x where x.status = 'pending'), '[]'::jsonb) end,
    'reports', case when adm then (select count(distinct r.comment_id)::int from public.yb_comment_reports r where not r.resolved) end);
end $$;

-- the admin writes (published at once) or a team leader writes (waits for the admin). Editing your own post
-- sends a leader's post back to the admin. photos: paths in <author>/<post>/ already uploaded, at most 4.
create or replace function public.yb_post_save(id uuid, body text, photos text[] default '{}')
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  pid  uuid := yb_post_save.id;
  rl   text := public.yb_role();
  cur  public.yb_posts%rowtype;
  had  boolean;
  tid  uuid;
  who  uuid;
  ph   text[] := coalesce(yb_post_save.photos, '{}');
  pfx  text;
  x    text;
  st   text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if pid is null then raise exception 'invalid_argument'; end if;
  if coalesce(rl, '') not in ('leader', 'admin') then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into cur from public.yb_posts p where p.id = pid for update;
  had := found;
  if had and cur.author is distinct from auth.uid() and rl <> 'admin' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if rl = 'leader' then
    select t.id into tid from public.teams t where t.leader_id = auth.uid();
    if tid is null then return jsonb_build_object('ok', false, 'error', 'no_team'); end if;
    if not had and (select count(*) from public.yb_posts p where p.author = auth.uid() and p.status = 'pending') >= 5 then
      return jsonb_build_object('ok', false, 'error', 'too_many');
    end if;
  end if;
  if not had and exists (select 1 from public.yb_posts p where p.author = auth.uid() and p.created_at > now() - interval '20 seconds') then
    return jsonb_build_object('ok', false, 'error', 'too_fast');
  end if;
  who := case when had then cur.author else auth.uid() end;
  pfx := coalesce(who::text, '-') || '/' || pid::text || '/';
  if cardinality(ph) > 4 then return jsonb_build_object('ok', false, 'error', 'too_many_photos'); end if;
  foreach x in array ph loop
    if left(x, char_length(pfx)) <> pfx or position('/' in substr(x, char_length(pfx) + 1)) > 0 or char_length(x) > 200
       or not exists (select 1 from storage.objects o where o.bucket_id = 'yanabee-feed' and o.name = x) then
      return jsonb_build_object('ok', false, 'error', 'bad_photo');
    end if;
  end loop;
  -- the admin publishes at once (an edit keeps the status); a leader's new or edited post waits for the admin
  st := case when rl = 'admin' then case when had then cur.status else 'published' end else 'pending' end;
  begin
    if had then
      update public.yb_posts p set body = btrim(coalesce(yb_post_save.body, '')), photos = ph, status = st,
             pinned = p.pinned and st = 'published', review_note = case when st = 'pending' then null else p.review_note end,
             updated_at = now()
       where p.id = pid;
    else
      insert into public.yb_posts (id, author, author_role, team_id, body, photos, status, published_at)
      values (pid, auth.uid(), rl, tid, btrim(coalesce(yb_post_save.body, '')), ph, st, case when st = 'published' then now() end);
    end if;
  exception when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end;
  if st = 'pending' and rl = 'leader' then
    perform public.yb_notify(array(select p.id from public.profiles p where p.role = 'admin'), 'post_pending',
      jsonb_build_object('post_id', pid, 'team_name', (select t.name from public.teams t where t.id = tid), 'snippet', left(btrim(yb_post_save.body), 60)));
  end if;
  return jsonb_build_object('ok', true, 'id', pid, 'status', st);
end $$;

-- the author or the admin deletes a post (the client removes its photos first, through the Storage API)
create or replace function public.yb_post_delete(id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare cur public.yb_posts%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into cur from public.yb_posts p where p.id = yb_post_delete.id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if cur.author is distinct from auth.uid() and not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from public.yb_posts p where p.id = cur.id;
  if cur.author is distinct from auth.uid() then
    insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'post_delete', jsonb_build_object('post_id', cur.id, 'author', cur.author));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- the admin: 'publish' | 'reject' (with an optional note) a waiting post; 'pin' | 'unpin' | 'hide' | 'show' a published one
create or replace function public.yb_post_moderate(id uuid, action text, note text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  cur public.yb_posts%rowtype;
  nt  text := nullif(btrim(coalesce(yb_post_moderate.note, '')), '');
  act text := yb_post_moderate.action;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if act is null or act not in ('publish', 'reject', 'pin', 'unpin', 'hide', 'show') then raise exception 'invalid_argument'; end if;
  if nt is not null and char_length(nt) > 300 then raise exception 'invalid_argument'; end if;
  select * into cur from public.yb_posts p where p.id = yb_post_moderate.id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if (act = 'publish' and cur.status not in ('pending', 'rejected'))
     or (act = 'reject' and cur.status <> 'pending')
     or (act in ('pin', 'unpin', 'hide') and cur.status <> 'published')
     or (act = 'show' and cur.status <> 'hidden') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  update public.yb_posts p set
    status = case act when 'publish' then 'published' when 'reject' then 'rejected' when 'hide' then 'hidden' when 'show' then 'published' else p.status end,
    published_at = case when act = 'publish' then coalesce(p.published_at, now()) else p.published_at end,
    review_note = case when act = 'reject' then nt when act = 'publish' then null else p.review_note end,
    pinned = case act when 'pin' then true when 'unpin' then false when 'hide' then false else p.pinned end,
    reviewed_by = case when act in ('publish', 'reject', 'hide', 'show') then auth.uid() else p.reviewed_by end,
    updated_at = case when act in ('pin', 'unpin') then p.updated_at else now() end
   where p.id = cur.id;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'post_' || act, jsonb_build_object('post_id', cur.id, 'author', cur.author));
  if act in ('publish', 'reject', 'hide') and cur.author is distinct from auth.uid() then
    perform public.yb_notify(array[cur.author], 'post_reviewed',
      jsonb_build_object('post_id', cur.id, 'action', act, 'note', nt, 'snippet', left(cur.body, 60)));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- react (kind null = take the reaction back); one reaction per person and post
create or replace function public.yb_react(post_id uuid, kind text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_feed_member() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.yb_posts p where p.id = yb_react.post_id and p.status = 'published') then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if yb_react.kind is null then
    delete from public.yb_post_reactions r where r.post_id = yb_react.post_id and r.user_id = auth.uid();
  else
    if yb_react.kind not in ('clap', 'heart', 'dua', 'strong') then raise exception 'invalid_argument'; end if;
    insert into public.yb_post_reactions as r (post_id, user_id, kind) values (yb_react.post_id, auth.uid(), yb_react.kind)
    on conflict on constraint yb_post_reactions_pkey do update set kind = excluded.kind, created_at = now();
  end if;
  return jsonb_build_object('ok', true,
    'reactions', coalesce((select jsonb_object_agg(z.kind, z.n) from (select q.kind, count(*)::int n from public.yb_post_reactions q where q.post_id = yb_react.post_id group by q.kind) z), '{}'::jsonb),
    'mine', (select q.kind from public.yb_post_reactions q where q.post_id = yb_react.post_id and q.user_id = auth.uid()));
end $$;

-- the comments of a post (oldest first). A hidden comment keeps its place without its text, except for the admin.
create or replace function public.yb_comments(post_id uuid)
returns table (id bigint, body text, hidden boolean, author_name text, author_role text, author_avatar text, mine boolean,
               reported boolean, reports int, author_muted boolean, created_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare adm boolean := public.is_admin();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_post_visible(yb_comments.post_id) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select c.id, case when c.hidden and not adm then null else c.body end, c.hidden,
           coalesce(public.yb_display_name(c.author), ''), (select p.role::text from public.profiles p where p.id = c.author),
           case when public.yb_is_adult(c.author) then (select pp.avatar_path from public.yb_profile_prefs pp where pp.user_id = c.author) end,
           coalesce(c.author = auth.uid(), false),
           exists (select 1 from public.yb_comment_reports r where r.comment_id = c.id and r.reporter = auth.uid()),
           case when adm then (select count(*)::int from public.yb_comment_reports r where r.comment_id = c.id and not r.resolved) else 0 end,
           case when adm then public.yb_chat_muted(c.author) else false end,
           c.created_at
      from public.yb_post_comments c
     where c.post_id = yb_comments.post_id
     order by c.id
     limit 300;
end $$;

create or replace function public.yb_comment_post(post_id uuid, body text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  b   text := btrim(coalesce(yb_comment_post.body, ''));
  cur public.yb_posts%rowtype;
  cid bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_can_comment() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into cur from public.yb_posts p where p.id = yb_comment_post.post_id;
  if not found or cur.status <> 'published' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if char_length(b) < 1 or char_length(b) > 500 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if public.yb_chat_muted(auth.uid()) then return jsonb_build_object('ok', false, 'error', 'chat_muted'); end if;
  if public.yb_has_contact(b) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  if exists (select 1 from public.yb_post_comments c where c.author = auth.uid() and c.created_at > now() - interval '3 seconds') then
    return jsonb_build_object('ok', false, 'error', 'too_fast');
  end if;
  insert into public.yb_post_comments (post_id, author, body) values (cur.id, auth.uid(), b) returning yb_post_comments.id into cid;
  if cur.author is distinct from auth.uid() then
    perform public.yb_notify(array[cur.author], 'comment_new',
      jsonb_build_object('post_id', cur.id, 'by', public.yb_display_name(auth.uid()), 'snippet', left(cur.body, 60)));
  end if;
  return jsonb_build_object('ok', true, 'id', cid);
end $$;

-- the author of a comment or the admin deletes it
create or replace function public.yb_comment_delete(id bigint)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare au uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select c.author into au from public.yb_post_comments c where c.id = yb_comment_delete.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if au is distinct from auth.uid() and not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from public.yb_post_comments c where c.id = yb_comment_delete.id;
  return jsonb_build_object('ok', true);
end $$;

-- any signed-in person reports a comment (not their own); the admin is told once per open report
create or replace function public.yb_comment_report(id bigint, reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare c public.yb_post_comments%rowtype; first boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into c from public.yb_post_comments x where x.id = yb_comment_report.id;
  if not found or not public.yb_post_visible(c.post_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if c.author = auth.uid() then return jsonb_build_object('ok', false, 'error', 'invalid_argument'); end if;
  first := not exists (select 1 from public.yb_comment_reports r where r.comment_id = c.id and not r.resolved);
  insert into public.yb_comment_reports (comment_id, reporter, reason)
  values (c.id, auth.uid(), nullif(left(btrim(coalesce(yb_comment_report.reason, '')), 200), ''))
  on conflict on constraint yb_comment_reports_pkey do update set reason = excluded.reason, resolved = false, created_at = now();
  if first then
    perform public.yb_notify(array(select p.id from public.profiles p where p.role = 'admin'), 'comment_report', jsonb_build_object('comment_id', c.id, 'post_id', c.post_id));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- the admin: hide or show a comment (closes its reports), or close the reports and keep it
create or replace function public.yb_comment_moderate(id bigint, action text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_comment_moderate.action is null or yb_comment_moderate.action not in ('hide', 'show', 'keep') then raise exception 'invalid_argument'; end if;
  if not exists (select 1 from public.yb_post_comments c where c.id = yb_comment_moderate.id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if yb_comment_moderate.action in ('hide', 'show') then
    update public.yb_post_comments c set hidden = (yb_comment_moderate.action = 'hide'),
           hidden_by = case when yb_comment_moderate.action = 'hide' then auth.uid() end
     where c.id = yb_comment_moderate.id;
  end if;
  update public.yb_comment_reports r set resolved = true where r.comment_id = yb_comment_moderate.id;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'comment_' || yb_comment_moderate.action, jsonb_build_object('comment_id', yb_comment_moderate.id));
  return jsonb_build_object('ok', true);
end $$;

-- the admin mutes the author of a comment (the same mute as the leaders room): hours null = until unmuted
create or replace function public.yb_comment_mute(id bigint, hours int default null, reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare u uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_comment_mute.hours is not null and (yb_comment_mute.hours < 1 or yb_comment_mute.hours > 24 * 90) then raise exception 'invalid_argument'; end if;
  select c.author into u from public.yb_post_comments c where c.id = yb_comment_mute.id;
  if u is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if u = auth.uid() or exists (select 1 from public.profiles p where p.id = u and p.role = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_argument');
  end if;
  insert into public.yb_chat_mutes as x (user_id, until, reason, muted_by)
  values (u, case when yb_comment_mute.hours is null then null else now() + make_interval(hours => yb_comment_mute.hours) end,
          nullif(left(btrim(coalesce(yb_comment_mute.reason, '')), 200), ''), auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, muted_by = excluded.muted_by, created_at = now();
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'comment_mute', jsonb_build_object('target', u, 'hours', yb_comment_mute.hours));
  perform public.yb_notify(array[u], 'chat_muted', jsonb_build_object('hours', yb_comment_mute.hours, 'where', 'comments'));
  return jsonb_build_object('ok', true);
end $$;

-- the admin: open comment reports, newest first
create or replace function public.yb_feed_reports()
returns table (comment_id bigint, post_id uuid, body text, hidden boolean, author_name text, post_snippet text, reports int, reasons text[], last_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select c.id, c.post_id, c.body, c.hidden, coalesce(public.yb_display_name(c.author), ''), left(p.body, 80),
           count(*)::int, array_remove(array_agg(r.reason), null), max(r.created_at)
      from public.yb_comment_reports r
      join public.yb_post_comments c on c.id = r.comment_id
      join public.yb_posts p on p.id = c.post_id
     where not r.resolved
     group by c.id, c.post_id, c.body, c.hidden, c.author, p.body
     order by max(r.created_at) desc;
end $$;

-- the admin: may members (children) comment?
create or replace function public.yb_set_members_comment(allow boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  insert into public.yb_settings as s (key, value, updated_by) values ('members_comment', to_jsonb(coalesce(yb_set_members_comment.allow, false)), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'members_comment', jsonb_build_object('allow', coalesce(yb_set_members_comment.allow, false)));
  return jsonb_build_object('ok', true, 'allow', coalesce(yb_set_members_comment.allow, false));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Photo buckets (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yanabee-feed', 'yanabee-feed', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yanabee-avatars', 'yanabee-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- feed photos: <author>/<post>/<file>; the author (a leader with a team, or the admin) writes in their own folder,
-- at most 4 files per post and 200 in all; the admin may also remove any
create or replace function public.yb_feed_can_write(path text, adding boolean)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(coalesce(path, ''), '/');
  pid uuid; au uuid;
begin
  if auth.uid() is null or cardinality(parts) <> 3 or parts[3] = '' or char_length(path) > 200 then return false; end if;
  if not adding and public.is_admin() then return true; end if;
  if parts[1] <> auth.uid()::text then return false; end if;
  if not (public.is_admin() or (public.yb_role() = 'leader' and exists (select 1 from public.teams t where t.leader_id = auth.uid()))) then return false; end if;
  pid := public.yb_try_uuid(parts[2]);
  if pid is null then return false; end if;
  select p.author into au from public.yb_posts p where p.id = pid;
  if found and au is distinct from auth.uid() then return false; end if;
  if adding and (select count(*) from storage.objects o where o.bucket_id = 'yanabee-feed'
                  and left(o.name, char_length(parts[1] || '/' || parts[2] || '/')) = parts[1] || '/' || parts[2] || '/') >= 4 then
    return false;
  end if;
  if adding and (select count(*) from storage.objects o where o.bucket_id = 'yanabee-feed'
                  and left(o.name, char_length(parts[1] || '/')) = parts[1] || '/') >= 200 then
    return false;
  end if;
  return true;
end $$;

-- read: the photos of published posts (signed-in people), your own folder, the admin
create or replace function public.yb_feed_can_read(path text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.yb_feed_member() and (
           public.is_admin()
        or split_part(coalesce(path, ''), '/', 1) = auth.uid()::text
        or exists (select 1 from public.yb_posts p where p.status = 'published' and coalesce(path, '') = any (p.photos)))
$$;

-- avatars: <user>/<file>; grown-ups only, in their own folder, at most 3 files
create or replace function public.yb_avatar_can_write(path text, adding boolean)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare parts text[] := string_to_array(coalesce(path, ''), '/');
begin
  if auth.uid() is null or cardinality(parts) <> 2 or parts[2] = '' or char_length(path) > 200 then return false; end if;
  if parts[1] <> auth.uid()::text then return false; end if;
  if adding and not public.yb_is_adult(auth.uid()) then return false; end if;
  if adding and (select count(*) from storage.objects o where o.bucket_id = 'yanabee-avatars'
                  and left(o.name, char_length(parts[1] || '/')) = parts[1] || '/') >= 3 then
    return false;
  end if;
  return true;
end $$;

drop policy if exists yb_feed_obj_insert on storage.objects;
create policy yb_feed_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'yanabee-feed' and (select public.yb_feed_can_write(name, true)));
drop policy if exists yb_feed_obj_select on storage.objects;
create policy yb_feed_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'yanabee-feed' and (select public.yb_feed_can_read(name)));
drop policy if exists yb_feed_obj_delete on storage.objects;
create policy yb_feed_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'yanabee-feed' and (select public.yb_feed_can_write(name, false)));
drop policy if exists yb_av_obj_insert on storage.objects;
create policy yb_av_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'yanabee-avatars' and (select public.yb_avatar_can_write(name, true)));
drop policy if exists yb_av_obj_select on storage.objects;
create policy yb_av_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'yanabee-avatars' and (select public.yb_feed_member()));
drop policy if exists yb_av_obj_delete on storage.objects;
create policy yb_av_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'yanabee-avatars' and (select public.yb_avatar_can_write(name, false)));

-- ---------------------------------------------------------------------------
-- 4. Handing a team to a new leader
-- ---------------------------------------------------------------------------
-- 0001's set_user_role, but a leader who still leads a team keeps the role: hand the team over first
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
  if cur = 'leader' and new_role <> 'leader' and exists (select 1 from public.teams t where t.leader_id = set_user_role.target) then
    raise exception 'leads_team';
  end if;
  update public.profiles p set role = set_user_role.new_role where p.id = set_user_role.target;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'role_change', jsonb_build_object('target', set_user_role.target, 'from', cur, 'to', set_user_role.new_role));
  return jsonb_build_object('ok', true, 'role', new_role);
end $$;

-- the admin hands a team to another account. new_leader: a member, parent or a leader without a team, not in
-- another team; they become 'leader' and the team's leader row. old_stays: the old leader stays in the team as a
-- member (role 'member'); otherwise they leave it and take old_role ('parent' or 'member').
create or replace function public.yb_transfer_team(team_id uuid, new_leader uuid, old_stays boolean, old_role text default 'parent')
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  t     public.teams%rowtype;
  nrole text;
  nname text;
  oldm  public.team_members%rowtype;
  newm  public.team_members%rowtype;
  stays boolean := coalesce(yb_transfer_team.old_stays, false);
  orole text := coalesce(yb_transfer_team.old_role, 'parent');
  cnt   int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if orole not in ('parent', 'member') then raise exception 'invalid_argument'; end if;
  select * into t from public.teams x where x.id = yb_transfer_team.team_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if yb_transfer_team.new_leader is null or yb_transfer_team.new_leader is not distinct from t.leader_id then raise exception 'invalid_argument'; end if;
  select p.role::text, p.full_name into nrole, nname from public.profiles p where p.id = yb_transfer_team.new_leader;
  if nrole is null then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;
  if nrole in ('admin', 'officer') then return jsonb_build_object('ok', false, 'error', 'bad_new_leader'); end if;
  if exists (select 1 from public.teams x where x.leader_id = yb_transfer_team.new_leader) then
    return jsonb_build_object('ok', false, 'error', 'leads_other_team');
  end if;
  if exists (select 1 from public.team_members m where m.user_id = yb_transfer_team.new_leader and m.team_id <> t.id) then
    return jsonb_build_object('ok', false, 'error', 'in_other_team');
  end if;
  select * into oldm from public.team_members m where m.team_id = t.id and m.is_leader;
  select * into newm from public.team_members m where m.team_id = t.id and m.user_id = yb_transfer_team.new_leader;
  cnt := (select count(*) from public.team_members m where m.team_id = t.id);
  -- the new leader counts in the team (5 to 7 with the leader)
  if newm.id is null and (stays or oldm.id is null) and cnt >= 7 then
    return jsonb_build_object('ok', false, 'error', 'team_full');
  end if;
  if oldm.id is not null then
    if stays then
      update public.team_members m set is_leader = false where m.id = oldm.id;
    else
      delete from public.team_members m where m.id = oldm.id;
    end if;
  end if;
  if newm.id is not null then
    update public.team_members m set is_leader = true where m.id = newm.id;
  else
    insert into public.team_members (team_id, full_name, is_leader, user_id)
    values (t.id, left(coalesce(nullif(btrim(nname), ''), '-'), 80), true, yb_transfer_team.new_leader);
  end if;
  update public.teams x set leader_id = yb_transfer_team.new_leader, updated_at = now() where x.id = t.id;
  update public.profiles p set role = 'leader' where p.id = yb_transfer_team.new_leader;
  if t.leader_id is not null then
    update public.profiles p set role = (case when stays then 'member' else orole end)::public.user_role
     where p.id = t.leader_id and p.role = 'leader';
  end if;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'team_transfer', jsonb_build_object('team_id', t.id, 'from', t.leader_id, 'to', yb_transfer_team.new_leader, 'old_stays', stays));
  perform public.yb_notify(array[yb_transfer_team.new_leader], 'team_leader_new', jsonb_build_object('team_id', t.id, 'team_name', t.name));
  if t.leader_id is not null then
    perform public.yb_notify(array[t.leader_id], 'team_leader_left', jsonb_build_object('team_id', t.id, 'team_name', t.name, 'stays', stays));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 5. The admin's numbers
-- ---------------------------------------------------------------------------
create or replace function public.yb_analytics()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare since date := current_date - 59;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'accounts', jsonb_build_object(
      'by_role', coalesce((select jsonb_object_agg(z.role, z.n) from (select p.role::text as role, count(*)::int n from public.profiles p group by p.role) z), '{}'::jsonb),
      'per_day', coalesce((select jsonb_agg(jsonb_build_object('d', z.d, 'n', z.n) order by z.d) from (
          select p.created_at::date d, count(*)::int n from public.profiles p where p.created_at::date >= since group by 1) z), '[]'::jsonb)),
    'teams', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(z.status, z.n) from (select t.status, count(*)::int n from public.teams t group by t.status) z), '{}'::jsonb),
      'waitlist', (select count(*)::int from public.teams t where coalesce(t.waitlist, false)),
      'fee', coalesce((select jsonb_object_agg(z.fee_status, z.n) from (select t.fee_status, count(*)::int n from public.teams t where t.status in ('submitted', 'approved') group by t.fee_status) z), '{}'::jsonb),
      'per_day', coalesce((select jsonb_agg(jsonb_build_object('d', z.d, 'n', z.n) order by z.d) from (
          select t.created_at::date d, count(*)::int n from public.teams t where t.created_at::date >= since group by 1) z), '[]'::jsonb),
      'list', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'status', t.status, 'fee', t.fee_status,
                 'members', (select count(*)::int from public.team_members m where m.team_id = t.id),
                 'minors', (select count(*)::int from public.team_members m where m.team_id = t.id and m.age < 18),
                 'consents', (select count(*)::int from public.team_members m where m.team_id = t.id and m.age < 18 and m.consent_status = 'received'),
                 'joined', (select count(*)::int from public.team_members m where m.team_id = t.id and m.user_id is not null)) order by t.name)
               from public.teams t where t.status in ('submitted', 'approved')), '[]'::jsonb)),
    'members', jsonb_build_object(
      'total', (select count(*)::int from public.team_members),
      'minors', (select count(*)::int from public.team_members m where m.age < 18),
      'consents', (select count(*)::int from public.team_members m where m.age < 18 and m.consent_status = 'received'),
      'joined', (select count(*)::int from public.team_members m where m.user_id is not null),
      'ages', jsonb_build_object(
        'u10', (select count(*)::int from public.team_members m where m.age < 10),
        'a10', (select count(*)::int from public.team_members m where m.age between 10 and 12),
        'a13', (select count(*)::int from public.team_members m where m.age between 13 and 15),
        'a16', (select count(*)::int from public.team_members m where m.age between 16 and 17),
        'adult', (select count(*)::int from public.team_members m where m.age >= 18),
        'unknown', (select count(*)::int from public.team_members m where m.age is null))),
    'matches', coalesce((select jsonb_object_agg(z.comp, jsonb_build_object('approved', z.a, 'live', z.l, 'waiting', z.w)) from (
        select x.comp, count(*) filter (where x.status = 'approved')::int a, count(*) filter (where x.status = 'live')::int l,
               count(*) filter (where x.status in ('final', 'returned'))::int w
          from public.yb_match_live x group by x.comp) z), '{}'::jsonb),
    'goals', jsonb_build_object(
      'total', (select count(*)::int from public.yb_match_marks k where k.kind = 'goal'),
      'by_team', coalesce((select jsonb_agg(jsonb_build_object('name', z.name, 'n', z.n) order by z.n desc, z.name) from (
          select coalesce(t.name, k.team_id) as name, count(*)::int n
            from public.yb_match_marks k left join public.teams t on t.id::text = k.team_id
           where k.kind = 'goal' group by 1 order by 2 desc limit 8) z), '[]'::jsonb),
      'spirit', (select count(*)::int from public.yb_match_marks k where k.kind = 'spirit')),
    'projects', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(z.status, z.n) from (select s.status, count(*)::int n from public.yb_submissions s group by s.status) z), '{}'::jsonb),
      'by_place', coalesce((select jsonb_object_agg(z.place, z.n) from (select s.place, count(*)::int n from public.yb_submissions s where s.status = 'accepted' group by s.place) z), '{}'::jsonb),
      'featured', (select count(*)::int from public.yb_submissions s where s.featured),
      'beneficiaries', (select coalesce(sum(s.beneficiaries), 0)::int from public.yb_submissions s where s.status = 'accepted')),
    'feed', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(z.status, z.n) from (select p.status, count(*)::int n from public.yb_posts p group by p.status) z), '{}'::jsonb),
      'reactions', coalesce((select jsonb_object_agg(z.kind, z.n) from (select r.kind, count(*)::int n from public.yb_post_reactions r group by r.kind) z), '{}'::jsonb),
      'comments', (select count(*)::int from public.yb_post_comments),
      'reports_open', (select count(distinct r.comment_id)::int from public.yb_comment_reports r where not r.resolved),
      'per_day', coalesce((select jsonb_agg(jsonb_build_object('d', d.d, 'posts', d.p, 'comments', d.c, 'reactions', d.r) order by d.d) from (
          select g.d::date d,
                 (select count(*)::int from public.yb_posts p where p.created_at::date = g.d::date) p,
                 (select count(*)::int from public.yb_post_comments c where c.created_at::date = g.d::date) c,
                 (select count(*)::int from public.yb_post_reactions r where r.created_at::date = g.d::date) r
            from generate_series(current_date - 29, current_date, interval '1 day') g(d)) d), '[]'::jsonb)),
    'notes', jsonb_build_object(
      'total', (select count(*)::int from public.yb_notifications),
      'read', (select count(*)::int from public.yb_notifications n where n.read_at is not null)),
    'judging', jsonb_build_object(
      'judges', (select count(*)::int from public.yb_judges),
      'scores', (select count(*)::int from public.yb_judge_scores),
      'teams_scored', (select count(distinct s.team_id)::int from public.yb_judge_scores s),
      'published', public.yb_results_published()));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on public.yb_team_style, public.yb_profile_prefs, public.yb_posts, public.yb_post_reactions,
              public.yb_post_comments, public.yb_comment_reports from public, anon, authenticated;
grant select (team_id, color, badge) on public.yb_team_style to anon, authenticated;

revoke all on function
  public.yb_note_group(text), public.yb_is_adult(uuid), public.yb_display_name(uuid), public.yb_my_prefs(), public.yb_save_prefs(jsonb),
  public.yb_set_team_style(uuid, text, text), public.yb_feed_member(), public.yb_can_comment(), public.yb_post_visible(uuid),
  public.yb_post_json(public.yb_posts), public.yb_feed(timestamptz, int), public.yb_post_save(uuid, text, text[]), public.yb_post_delete(uuid),
  public.yb_post_moderate(uuid, text, text), public.yb_react(uuid, text), public.yb_comments(uuid), public.yb_comment_post(uuid, text),
  public.yb_comment_delete(bigint), public.yb_comment_report(bigint, text), public.yb_comment_moderate(bigint, text),
  public.yb_comment_mute(bigint, int, text), public.yb_feed_reports(), public.yb_set_members_comment(boolean),
  public.yb_feed_can_write(text, boolean), public.yb_feed_can_read(text), public.yb_avatar_can_write(text, boolean),
  public.yb_transfer_team(uuid, uuid, boolean, text), public.yb_analytics(), public.yb_notify(uuid[], text, jsonb)
  from public, anon, authenticated;
revoke all on function public.set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;

-- used inside storage policies (run as the caller)
grant execute on function public.yb_feed_can_write(text, boolean), public.yb_feed_can_read(text), public.yb_avatar_can_write(text, boolean),
  public.yb_feed_member() to authenticated;
grant execute on function
  public.yb_my_prefs(), public.yb_save_prefs(jsonb), public.yb_set_team_style(uuid, text, text),
  public.yb_feed(timestamptz, int), public.yb_post_save(uuid, text, text[]), public.yb_post_delete(uuid), public.yb_post_moderate(uuid, text, text),
  public.yb_react(uuid, text), public.yb_comments(uuid), public.yb_comment_post(uuid, text), public.yb_comment_delete(bigint),
  public.yb_comment_report(bigint, text), public.yb_comment_moderate(bigint, text), public.yb_comment_mute(bigint, int, text),
  public.yb_feed_reports(), public.yb_set_members_comment(boolean), public.yb_transfer_team(uuid, uuid, boolean, text), public.yb_analytics()
  to authenticated;

comment on table public.yb_posts is 'The news feed: admin posts (published at once) and team leaders posts (after the admin). Signed-in people only.';
comment on table public.yb_profile_prefs is 'Per person: profile picture (adults), theme, accent, text size, hidden dashboard sections, notification groups turned off.';
