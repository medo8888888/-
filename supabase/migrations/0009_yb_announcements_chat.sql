-- Yanabee 0009: announcements and the supervised leaders room (SPEC 4.4, 4.10.7).
--
-- yb_announcements: written by the admin only. A published 'all' announcement is
-- public (the home and tournament strip); 'leaders' / 'members' / 'parents' are
-- read by that role when signed in; officers and the admin read every published
-- one; the admin also sees drafts. The first publication notifies the audience.
--
-- The leaders room (yb_chat_*): leaders, officers and the admin read and post.
-- Members and parents have NO access (student chat stays off until the owner
-- decides). No private chats. The server refuses a message with a phone number
-- (7 or more digits, Arabic-Indic digits included, spaces and dashes ignored) or
-- an e-mail address ('contact_not_allowed'); one message per 3 seconds; anyone
-- in the room reports a message; the admin hides messages, mutes and unmutes
-- people, closes reports and purges rows older than 180 days. Every chat table
-- is reached through the functions below only.
-- ASCII only.

-- ---------------------------------------------------------------------------
-- 1. Announcements
-- ---------------------------------------------------------------------------
create table if not exists public.yb_announcements (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null,
  audience    text not null default 'all',
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  published_at timestamptz,
  notified_at timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  constraint yb_ann_title_len check (char_length(btrim(title)) between 2 and 80),
  constraint yb_ann_body_len  check (char_length(btrim(body)) between 2 and 600),
  constraint yb_ann_aud_chk   check (audience in ('all', 'leaders', 'members', 'parents'))
);
create index if not exists yb_announcements_pub_idx on public.yb_announcements (published, audience, created_at desc);
alter table public.yb_announcements enable row level security;
alter table public.yb_announcements force row level security;

-- the audience word of the caller's role ('leaders' for a leader, ...); null for the others
create or replace function public.yb_my_audience()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case public.yb_role() when 'leader' then 'leaders' when 'member' then 'members' when 'parent' then 'parents' end
$$;

drop policy if exists yb_ann_public on public.yb_announcements;
create policy yb_ann_public on public.yb_announcements for select to anon
  using (published and audience = 'all');
drop policy if exists yb_ann_read on public.yb_announcements;
create policy yb_ann_read on public.yb_announcements for select to authenticated
  using ((select public.is_admin())
      or (published and (audience = 'all' or audience = (select public.yb_my_audience()) or (select public.yb_role()) = 'officer')));

-- the admin writes; id null = new. Returns {ok, id}
create or replace function public.yb_announce_save(id bigint, title text, body text, audience text, published boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  aid bigint := yb_announce_save.id;
  r   public.yb_announcements%rowtype;
  who uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  begin
    if aid is null then
      insert into public.yb_announcements as a (title, body, audience, published, created_by, published_at)
      values (btrim(coalesce(yb_announce_save.title, '')), btrim(coalesce(yb_announce_save.body, '')), coalesce(yb_announce_save.audience, 'all'),
              coalesce(yb_announce_save.published, false), auth.uid(), case when yb_announce_save.published then now() end)
      returning * into r;
    else
      update public.yb_announcements a
         set title = btrim(coalesce(yb_announce_save.title, '')), body = btrim(coalesce(yb_announce_save.body, '')),
             audience = coalesce(yb_announce_save.audience, 'all'), published = coalesce(yb_announce_save.published, false),
             published_at = case when yb_announce_save.published and a.published_at is null then now() else a.published_at end,
             updated_at = now()
       where a.id = aid
      returning * into r;
      if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    end if;
  exception when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end;
  -- the first publication tells the audience (their inbox)
  if r.published and r.notified_at is null then
    select coalesce(array_agg(p.id), '{}') into who from public.profiles p
     where p.id <> auth.uid()
       and (r.audience = 'all' or p.role::text = case r.audience when 'leaders' then 'leader' when 'members' then 'member' when 'parents' then 'parent' end
            or p.role::text in ('officer', 'admin'));
    perform public.yb_notify(who, 'announcement', jsonb_build_object('id', r.id, 'title', left(r.title, 80), 'audience', r.audience));
    update public.yb_announcements a set notified_at = now() where a.id = r.id;
  end if;
  return jsonb_build_object('ok', true, 'id', r.id);
end $$;

create or replace function public.yb_announce_delete(id bigint)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from public.yb_announcements a where a.id = yb_announce_delete.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 2. The leaders room
-- ---------------------------------------------------------------------------
create table if not exists public.yb_chat_messages (
  id          bigint generated always as identity primary key,
  room        text not null default 'leaders',
  author      uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  author_role text not null default '',
  body        text not null,
  created_at  timestamptz not null default now(),
  hidden      boolean not null default false,
  hidden_by   uuid references public.profiles (id) on delete set null,
  hidden_at   timestamptz,
  constraint yb_chat_room_chk check (room = 'leaders'),
  constraint yb_chat_body_len check (char_length(btrim(body)) between 1 and 500)
);
create index if not exists yb_chat_messages_room_idx on public.yb_chat_messages (room, id desc);
create index if not exists yb_chat_messages_author_idx on public.yb_chat_messages (author, created_at desc);

create table if not exists public.yb_chat_reports (
  message_id  bigint not null references public.yb_chat_messages (id) on delete cascade,
  reporter    uuid not null references public.profiles (id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  resolved    boolean not null default false,
  constraint yb_chat_reports_pkey primary key (message_id, reporter),
  constraint yb_chat_reason_len check (reason is null or char_length(reason) <= 200)
);

create table if not exists public.yb_chat_mutes (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  until       timestamptz,
  reason      text,
  muted_by    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint yb_chat_mute_reason_len check (reason is null or char_length(reason) <= 200)
);

create table if not exists public.yb_chat_reads (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  last_id     bigint not null default 0,
  seen_at     timestamptz not null default now()
);

alter table public.yb_chat_messages enable row level security;
alter table public.yb_chat_messages force row level security;
alter table public.yb_chat_reports enable row level security;
alter table public.yb_chat_reports force row level security;
alter table public.yb_chat_mutes enable row level security;
alter table public.yb_chat_mutes force row level security;
alter table public.yb_chat_reads enable row level security;
alter table public.yb_chat_reads force row level security;

-- leaders, officers and the admin
create or replace function public.yb_chat_member()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.yb_role() in ('leader', 'officer', 'admin'), false)
$$;

create or replace function public.yb_chat_muted(u uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.yb_chat_mutes m where m.user_id = u and (m.until is null or m.until > now()))
$$;

-- a phone number (7+ digits once spaces, dashes, brackets and plus signs are removed; Arabic-Indic and
-- Persian digits count) or an e-mail address. Dates written with slashes or dots stay allowed.
create or replace function public.yb_has_contact(t text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
           translate(coalesce(t, ''),
                     chr(1632) || chr(1633) || chr(1634) || chr(1635) || chr(1636) || chr(1637) || chr(1638) || chr(1639) || chr(1640) || chr(1641)
                     || chr(1776) || chr(1777) || chr(1778) || chr(1779) || chr(1780) || chr(1781) || chr(1782) || chr(1783) || chr(1784) || chr(1785),
                     '01234567890123456789'),
           '[[:space:]()+-]', '', 'g') ~ '[0-9]{7,}'
      or coalesce(t, '') ~* '[^[:space:]@]+@[^[:space:]@]+[.][a-z]{2,}'
$$;

-- the latest messages (oldest first). A hidden message keeps its place, without its text, for everybody but the admin.
create or replace function public.yb_chat_list(lim int default 80)
returns table (id bigint, author_name text, author_role text, mine boolean, body text, hidden boolean, created_at timestamptz,
               reported boolean, reports int, author_muted boolean)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare adm boolean := public.is_admin();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_chat_member() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select m.id, m.author_name, m.author_role, coalesce(m.author = auth.uid(), false),
           case when m.hidden and not adm then null else m.body end, m.hidden, m.created_at,
           exists (select 1 from public.yb_chat_reports r where r.message_id = m.id and r.reporter = auth.uid()),
           case when adm then (select count(*)::int from public.yb_chat_reports r where r.message_id = m.id and not r.resolved) else 0 end,
           case when adm then public.yb_chat_muted(m.author) else false end
      from (select * from public.yb_chat_messages x where x.room = 'leaders' order by x.id desc
             limit greatest(1, least(coalesce(lim, 80), 200))) m
     order by m.id;
end $$;

create or replace function public.yb_chat_post(body text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  b   text := btrim(coalesce(yb_chat_post.body, ''));
  me  public.profiles%rowtype;
  mid bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_chat_member() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if char_length(b) < 1 or char_length(b) > 500 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if public.yb_chat_muted(auth.uid()) then return jsonb_build_object('ok', false, 'error', 'chat_muted'); end if;
  if public.yb_has_contact(b) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  if exists (select 1 from public.yb_chat_messages m where m.author = auth.uid() and m.created_at > now() - interval '3 seconds') then
    return jsonb_build_object('ok', false, 'error', 'too_fast');
  end if;
  select * into me from public.profiles p where p.id = auth.uid();
  insert into public.yb_chat_messages (room, author, author_name, author_role, body)
  values ('leaders', auth.uid(), left(coalesce(nullif(btrim(me.full_name), ''), '-'), 80), me.role::text, b)
  returning yb_chat_messages.id into mid;
  insert into public.yb_chat_reads as r (user_id, last_id) values (auth.uid(), mid)
  on conflict (user_id) do update set last_id = greatest(r.last_id, excluded.last_id), seen_at = now();
  return jsonb_build_object('ok', true, 'id', mid);
end $$;

-- anyone in the room reports a message (not their own); the admin is told once per open report
create or replace function public.yb_chat_report(message_id bigint, reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare m public.yb_chat_messages%rowtype; first boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_chat_member() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into m from public.yb_chat_messages x where x.id = yb_chat_report.message_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.author = auth.uid() then return jsonb_build_object('ok', false, 'error', 'invalid_argument'); end if;
  first := not exists (select 1 from public.yb_chat_reports r where r.message_id = m.id and not r.resolved);
  insert into public.yb_chat_reports (message_id, reporter, reason)
  values (m.id, auth.uid(), nullif(left(btrim(coalesce(yb_chat_report.reason, '')), 200), ''))
  on conflict on constraint yb_chat_reports_pkey do update set reason = excluded.reason, resolved = false, created_at = now();
  if first then
    perform public.yb_notify(array(select p.id from public.profiles p where p.role = 'admin'), 'chat_report', jsonb_build_object('message_id', m.id));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- the admin: hide or show a message (either closes its reports)
create or replace function public.yb_chat_hide(message_id bigint, hide boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare hd boolean := coalesce(yb_chat_hide.hide, true);
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.yb_chat_messages m set hidden = hd,
         hidden_by = case when hd then auth.uid() end, hidden_at = case when hd then now() end
   where m.id = yb_chat_hide.message_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update public.yb_chat_reports r set resolved = true where r.message_id = yb_chat_hide.message_id;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), case when hd then 'chat_hide' else 'chat_show' end, jsonb_build_object('message_id', yb_chat_hide.message_id));
  return jsonb_build_object('ok', true);
end $$;

-- the admin closes the reports of a message without hiding it
create or replace function public.yb_chat_resolve(message_id bigint)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.yb_chat_reports r set resolved = true where r.message_id = yb_chat_resolve.message_id;
  return jsonb_build_object('ok', true);
end $$;

-- the admin mutes the author of a message: hours null = until unmuted (at most 90 days otherwise)
create or replace function public.yb_chat_mute(message_id bigint, hours int default null, reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare u uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_chat_mute.hours is not null and (yb_chat_mute.hours < 1 or yb_chat_mute.hours > 24 * 90) then raise exception 'invalid_argument'; end if;
  select m.author into u from public.yb_chat_messages m where m.id = yb_chat_mute.message_id;
  if u is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if u = auth.uid() or exists (select 1 from public.profiles p where p.id = u and p.role = 'admin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_argument');
  end if;
  insert into public.yb_chat_mutes as x (user_id, until, reason, muted_by)
  values (u, case when yb_chat_mute.hours is null then null else now() + make_interval(hours => yb_chat_mute.hours) end,
          nullif(left(btrim(coalesce(yb_chat_mute.reason, '')), 200), ''), auth.uid())
  on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, muted_by = excluded.muted_by, created_at = now();
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'chat_mute', jsonb_build_object('target', u, 'hours', yb_chat_mute.hours));
  perform public.yb_notify(array[u], 'chat_muted', jsonb_build_object('hours', yb_chat_mute.hours));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_chat_unmute(target uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from public.yb_chat_mutes m where m.user_id = yb_chat_unmute.target;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'chat_unmute', jsonb_build_object('target', yb_chat_unmute.target));
  return jsonb_build_object('ok', true);
end $$;

-- the admin: people muted now
create or replace function public.yb_chat_mutes_list()
returns table (user_id uuid, full_name text, role text, until timestamptz, reason text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select m.user_id, p.full_name, p.role::text, m.until, m.reason
      from public.yb_chat_mutes m join public.profiles p on p.id = m.user_id
     where m.until is null or m.until > now()
     order by m.created_at desc;
end $$;

-- the admin: deletes messages older than 180 days (and their reports); returns how many
create or replace function public.yb_chat_purge()
returns int
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from public.yb_chat_messages m where m.created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'chat_purge', jsonb_build_object('deleted', n));
  return n;
end $$;

-- unread: messages after the last one the caller saw, not their own, not hidden
create or replace function public.yb_chat_seen(last_id bigint)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_chat_member() then raise exception 'permission_denied' using errcode = '42501'; end if;
  insert into public.yb_chat_reads as r (user_id, last_id) values (auth.uid(), greatest(0, coalesce(yb_chat_seen.last_id, 0)))
  on conflict (user_id) do update set last_id = greatest(r.last_id, excluded.last_id), seen_at = now();
end $$;

create or replace function public.yb_chat_unread()
returns int
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_chat_member() then return 0; end if;
  return (select count(*)::int from public.yb_chat_messages m
           where m.id > coalesce((select r.last_id from public.yb_chat_reads r where r.user_id = auth.uid()), 0)
             and m.author is distinct from auth.uid() and not m.hidden);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Privileges
-- ---------------------------------------------------------------------------
revoke all on public.yb_announcements, public.yb_chat_messages, public.yb_chat_reports, public.yb_chat_mutes, public.yb_chat_reads
  from public, anon, authenticated;
grant select (id, title, body, audience, published, created_at, updated_at, published_at) on public.yb_announcements to anon, authenticated;

revoke all on function
  public.yb_my_audience(), public.yb_announce_save(bigint, text, text, text, boolean), public.yb_announce_delete(bigint),
  public.yb_chat_member(), public.yb_chat_muted(uuid), public.yb_has_contact(text), public.yb_chat_list(int), public.yb_chat_post(text),
  public.yb_chat_report(bigint, text), public.yb_chat_hide(bigint, boolean), public.yb_chat_resolve(bigint),
  public.yb_chat_mute(bigint, int, text), public.yb_chat_unmute(uuid), public.yb_chat_mutes_list(), public.yb_chat_purge(),
  public.yb_chat_seen(bigint), public.yb_chat_unread()
  from public, anon, authenticated;

-- used inside the read policy (run as the caller)
grant execute on function public.yb_my_audience() to authenticated;
grant execute on function
  public.yb_announce_save(bigint, text, text, text, boolean), public.yb_announce_delete(bigint),
  public.yb_chat_list(int), public.yb_chat_post(text), public.yb_chat_report(bigint, text), public.yb_chat_hide(bigint, boolean),
  public.yb_chat_resolve(bigint), public.yb_chat_mute(bigint, int, text), public.yb_chat_unmute(uuid), public.yb_chat_mutes_list(),
  public.yb_chat_purge(), public.yb_chat_seen(bigint), public.yb_chat_unread()
  to authenticated;

comment on table public.yb_announcements is 'Admin announcements. Published all-audience rows are public; the others go to their role.';
comment on table public.yb_chat_messages is 'The supervised leaders room: leaders, officers and the admin, through the yb_chat_* functions only.';
