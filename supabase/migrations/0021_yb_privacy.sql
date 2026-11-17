-- Yanabee 0021: privacy and security.
--   1. Photo consent, separate from taking part (competition.txt c-consent k-photo; c-card: "no photos or data of
--      minor participants are published without the necessary consent"). Each member has photo_consent
--      (pending / yes / no). It is set by the linked parent, by an adult member for themselves, or by the admin
--      recording the paper form; never by the team's leader. A project's photos reach the public page only when
--      every minor of the team has a "yes" and no adult has said "no". The text of a featured project still shows.
--   2. The person's own data: yb_my_data() returns a copy of what the site keeps about the caller. Requests to
--      delete or correct data go to the admin, who answers in writing (yb_privacy_request / _mine / _admin / _close).
--      Deletion stays a decision of the admin: accounts are shared with another app on the same project.
--   3. my_roster, my_children and yb_match_counts were views that ran with their owner's rights (the database
--      advisor's error "security definer view"). They now run with the caller's rights over SECURITY DEFINER
--      functions that apply the same filter, with the same columns (plus photo_consent at the end).
--   4. The rate limiter keeps a one-way fingerprint of the visitor's address instead of the address itself.
-- Tables are closed; everything goes through functions.

-- ---------------------------------------------------------------- 1. photo consent
alter table public.team_members add column if not exists photo_consent text not null default 'pending';
alter table public.team_members add column if not exists photo_consent_at timestamptz;
alter table public.team_members add column if not exists photo_consent_by uuid references public.profiles (id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_photo_consent_chk') then
    alter table public.team_members add constraint members_photo_consent_chk check (photo_consent in ('pending', 'yes', 'no'));
  end if;
end $$;

-- may the team's project photos be shown to the public?
create or replace function public.yb_team_photo_ok(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from public.team_members m
                      where m.team_id = t
                        and ((coalesce(m.age, 0) < 18 and m.photo_consent <> 'yes') or m.photo_consent = 'no'))
$$;

create or replace function public.yb_photo_consent_set(member_id uuid, value text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); v text := yb_photo_consent_set.value; m public.team_members%rowtype; who text;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into m from public.team_members x where x.id = yb_photo_consent_set.member_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if exists (select 1 from public.parent_links l where l.parent_id = me and l.member_id = m.id) then who := 'parent';
  elsif m.user_id = me and coalesce(m.age, 0) >= 18 then who := 'self';
  elsif public.is_admin() then who := 'admin';
  else raise exception 'permission_denied' using errcode = '42501';
  end if;
  if v is null or v not in ('yes', 'no', 'pending') or (v = 'pending' and who <> 'admin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  update public.team_members x set photo_consent = v, photo_consent_at = case when v = 'pending' then null else now() end, photo_consent_by = me
   where x.id = m.id;
  insert into public.audit_log (user_id, action, detail)
  values (me, 'photo_consent', jsonb_build_object('member_id', m.id, 'team_id', m.team_id, 'from', m.photo_consent, 'to', v, 'by', who));
  return jsonb_build_object('ok', true, 'photo_consent', v, 'team_photos_public', public.yb_team_photo_ok(m.team_id));
end $$;

-- the admin: per team, how many members still lack a photo consent (counts only)
create or replace function public.yb_photo_consent_board()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name,
      'members', (select count(*) from public.team_members m where m.team_id = t.id),
      'yes', (select count(*) from public.team_members m where m.team_id = t.id and m.photo_consent = 'yes'),
      'no', (select count(*) from public.team_members m where m.team_id = t.id and m.photo_consent = 'no'),
      'missing', (select count(*) from public.team_members m where m.team_id = t.id and coalesce(m.age, 0) < 18 and m.photo_consent = 'pending'),
      'public_ok', public.yb_team_photo_ok(t.id),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.full_name, 'age', m.age, 'photo_consent', m.photo_consent) order by m.full_name)
                          from public.team_members m where m.team_id = t.id), '[]'::jsonb)) order by t.name)
    from public.teams t where t.status::text in ('submitted', 'approved')), '[]'::jsonb);
end $$;

-- the caller: the members whose photo consent they may give (their linked children; themselves when adult),
-- and their own answer when it is someone else's to give
create or replace function public.yb_photo_consent_mine()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'name') from (
      select jsonb_build_object('member_id', m.id, 'name', m.full_name, 'team', t.name, 'photo_consent', m.photo_consent, 'can_set', true, 'who', 'child') x
        from public.parent_links l join public.team_members m on m.id = l.member_id join public.teams t on t.id = m.team_id where l.parent_id = me
      union all
      select jsonb_build_object('member_id', m.id, 'name', m.full_name, 'team', t.name, 'photo_consent', m.photo_consent, 'can_set', coalesce(m.age, 0) >= 18, 'who', 'self')
        from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = me) q), '[]'::jsonb);
end $$;

-- the public page: photos only when the team's photo consent allows it
create or replace function public.yb_public_projects()
returns table (id uuid, team_name text, kind text, title text, value_text text, place text, done_on date,
               summary text, results text, beneficiaries int, photos text[], featured_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.id, t.name, s.kind, s.title, s.value_text, s.place, s.done_on, s.summary, s.results, s.beneficiaries,
         case when public.yb_team_photo_ok(s.team_id) then s.photos else '{}'::text[] end, s.featured_at
    from public.yb_submissions s join public.teams t on t.id = s.team_id
   where s.featured and s.status = 'accepted'
   order by s.featured_at desc nulls last
   limit 24
$$;
create or replace function public.yb_sub_is_public(path text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.yb_submissions s
                  where s.featured and s.status = 'accepted' and coalesce(path, '') = any (s.photos)
                    and public.yb_team_photo_ok(s.team_id))
$$;

-- ---------------------------------------------------------------- 2. the person's own data
create table if not exists public.yb_privacy_requests (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  kind       text not null,
  note       text,
  status     text not null default 'open',
  reply      text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null,
  constraint yb_pr_kind check (kind in ('delete', 'correct', 'other')),
  constraint yb_pr_status check (status in ('open', 'done', 'declined')),
  constraint yb_pr_note check (note is null or char_length(note) <= 500),
  constraint yb_pr_reply check (reply is null or char_length(reply) <= 500)
);
alter table public.yb_privacy_requests enable row level security;
alter table public.yb_privacy_requests force row level security;
revoke all on public.yb_privacy_requests from anon, authenticated;

create or replace function public.yb_my_data()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return jsonb_build_object('generated_at', now(),
    'profile', (select jsonb_build_object('full_name', p.full_name, 'email', p.email, 'phone', p.phone, 'role', p.role, 'created_at', p.created_at) from public.profiles p where p.id = me),
    'teams_led', coalesce((select jsonb_agg(jsonb_build_object('team', t.name, 'area', t.area, 'status', t.status, 'created_at', t.created_at)) from public.teams t where t.leader_id = me), '[]'::jsonb),
    'membership', coalesce((select jsonb_agg(jsonb_build_object('team', t.name, 'full_name', m.full_name, 'age', m.age, 'guardian_phone', m.guardian_phone, 'roles', m.roles,
        'consent', m.consent_status, 'photo_consent', m.photo_consent, 'joined_at', m.created_at,
        'meetings_attended', (select count(*) from public.yb_meet_present a where a.member_id = m.id)))
      from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = me), '[]'::jsonb),
    'children', coalesce((select jsonb_agg(jsonb_build_object('full_name', m.full_name, 'team', t.name, 'age', m.age, 'consent', m.consent_status, 'photo_consent', m.photo_consent))
      from public.parent_links l join public.team_members m on m.id = l.member_id join public.teams t on t.id = m.team_id where l.parent_id = me), '[]'::jsonb),
    'promises', coalesce((select jsonb_agg(jsonb_build_object('week', p.week, 'field', p.field, 'text', p.body, 'kept', p.done, 'parent_note', p.parent_note) order by p.week)
      from public.yb_pledges p where p.user_id = me), '[]'::jsonb),
    'ayahs_marked', coalesce((select to_jsonb(h.ayahs) from public.yb_hifz_marks h where h.user_id = me), '[]'::jsonb),
    'practice_days', coalesce((select jsonb_agg(d.day order by d.day) from public.yb_deed_days d where d.user_id = me), '[]'::jsonb),
    'survey_answer', (select jsonb_build_object('q1', s.q1, 'q2', s.q2, 'q3', s.q3, 'note', s.note, 'at', s.answered_at) from public.yb_parent_survey s where s.parent_id = me),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('at', p.created_at, 'text', p.body, 'status', p.status, 'photos', cardinality(p.photos)) order by p.created_at)
      from public.yb_posts p where p.author = me), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('at', c.created_at, 'text', c.body) order by c.created_at) from public.yb_post_comments c where c.author = me), '[]'::jsonb),
    'phones_with_notifications', (select count(*) from public.yb_push_subs s where s.user_id = me),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('kind', r.kind, 'status', r.status, 'at', r.created_at, 'reply', r.reply) order by r.created_at)
      from public.yb_privacy_requests r where r.user_id = me), '[]'::jsonb));
end $$;

create or replace function public.yb_privacy_request(kind text, note text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); n text := nullif(btrim(regexp_replace(coalesce(yb_privacy_request.note, ''), '\s+', ' ', 'g')), ''); new_id bigint;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if yb_privacy_request.kind is null or yb_privacy_request.kind not in ('delete', 'correct', 'other')
     or char_length(coalesce(n, '')) > 500 or (yb_privacy_request.kind <> 'delete' and char_length(coalesce(n, '')) < 5) then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if (select count(*) from public.yb_privacy_requests r where r.user_id = me and r.status = 'open') >= 2 then
    return jsonb_build_object('ok', false, 'error', 'too_many_open');
  end if;
  insert into public.yb_privacy_requests (user_id, kind, note) values (me, yb_privacy_request.kind, n) returning id into new_id;
  perform public.yb_notify(array(select p.id from public.profiles p where p.role::text = 'admin' and p.id <> me), 'privacy_request', jsonb_build_object('kind', yb_privacy_request.kind));
  insert into public.audit_log (user_id, action, detail) values (me, 'privacy_request', jsonb_build_object('id', new_id, 'kind', yb_privacy_request.kind));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.yb_privacy_mine()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'note', r.note, 'status', r.status, 'reply', r.reply, 'created_at', r.created_at, 'handled_at', r.handled_at) order by r.created_at desc)
    from public.yb_privacy_requests r where r.user_id = auth.uid()), '[]'::jsonb);
end $$;

-- the admin: open requests first, with who asked (the admin may read emails)
create or replace function public.yb_privacy_admin()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'note', r.note, 'status', r.status, 'reply', r.reply, 'created_at', r.created_at,
      'handled_at', r.handled_at, 'full_name', p.full_name, 'email', p.email, 'role', p.role)
      order by (r.status = 'open') desc, r.created_at desc)
    from public.yb_privacy_requests r left join public.profiles p on p.id = r.user_id), '[]'::jsonb);
end $$;

create or replace function public.yb_privacy_close(id bigint, done boolean, reply text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare r public.yb_privacy_requests%rowtype; t text := nullif(btrim(regexp_replace(coalesce(yb_privacy_close.reply, ''), '\s+', ' ', 'g')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into r from public.yb_privacy_requests x where x.id = yb_privacy_close.id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'already_decided'); end if;
  if yb_privacy_close.done is null or char_length(coalesce(t, '')) < 5 or char_length(t) > 500 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  update public.yb_privacy_requests x set status = case when yb_privacy_close.done then 'done' else 'declined' end, reply = t, handled_at = now(), handled_by = auth.uid()
   where x.id = r.id;
  if r.user_id is not null then perform public.yb_notify(array[r.user_id], 'privacy_done', jsonb_build_object('kind', r.kind, 'done', yb_privacy_close.done)); end if;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'privacy_close', jsonb_build_object('id', r.id, 'done', yb_privacy_close.done));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- 3. the three views run with the caller's rights
create or replace function public.yb_my_roster_rows()
returns table (member_id public.team_members.id%type, team_id public.team_members.team_id%type, full_name public.team_members.full_name%type,
               is_leader public.team_members.is_leader%type, joined boolean, is_me boolean, consent_status public.team_members.consent_status%type,
               photo_consent public.team_members.photo_consent%type)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select m.id, m.team_id, m.full_name, m.is_leader, (m.user_id is not null), (m.user_id is not distinct from auth.uid()),
         case when m.user_id is not distinct from auth.uid() then m.consent_status end,
         case when m.user_id is not distinct from auth.uid() then m.photo_consent end
    from public.team_members m
   where auth.uid() is not null
     and m.team_id in (select public.yb_my_team_ids())
$$;
create or replace view public.my_roster with (security_barrier = true, security_invoker = true) as
  select r.member_id, r.team_id, r.full_name, r.is_leader, r.joined, r.is_me, r.consent_status, r.photo_consent from public.yb_my_roster_rows() r;

create or replace function public.yb_my_children_rows()
returns table (member_id public.team_members.id%type, full_name public.team_members.full_name%type, age public.team_members.age%type,
               is_leader public.team_members.is_leader%type, consent_status public.team_members.consent_status%type, consent_at public.team_members.consent_at%type,
               team_id public.teams.id%type, team_name public.teams.name%type, team_area public.teams.area%type, team_status public.teams.status%type,
               photo_consent public.team_members.photo_consent%type)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select m.id, m.full_name, m.age, m.is_leader, m.consent_status, m.consent_at, t.id, t.name, t.area, t.status, m.photo_consent
    from public.parent_links l
    join public.team_members m on m.id = l.member_id
    join public.teams t on t.id = m.team_id
   where l.parent_id = auth.uid()
$$;
create or replace view public.my_children with (security_barrier = true, security_invoker = true) as
  select c.member_id, c.full_name, c.age, c.is_leader, c.consent_status, c.consent_at, c.team_id, c.team_name, c.team_area, c.team_status, c.photo_consent
    from public.yb_my_children_rows() c;

create or replace function public.yb_match_counts_rows()
returns table (comp public.yb_match_marks.comp%type, match_key public.yb_match_marks.match_key%type, team_id public.yb_match_marks.team_id%type, goals int, spirit int)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select m.comp, m.match_key, m.team_id, (count(*) filter (where m.kind = 'goal'))::int, (count(*) filter (where m.kind = 'spirit'))::int
    from public.yb_match_marks m
   group by m.comp, m.match_key, m.team_id
$$;
create or replace view public.yb_match_counts with (security_barrier = true, security_invoker = true) as
  select c.comp, c.match_key, c.team_id, c.goals, c.spirit from public.yb_match_counts_rows() c;

-- ---------------------------------------------------------------- 4. the rate limiter keeps a fingerprint, not the address
create or replace function public.yb_client_addr()
returns text
language plpgsql stable
set search_path = public, pg_temp
as $$
declare h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then h := null;
  end;
  return 'h' || md5('yanabee-rate:' || left(coalesce(nullif(h ->> 'cf-connecting-ip', ''),
                       nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''),
                       nullif(h ->> 'x-real-ip', ''),
                       'unknown'), 64));
end $$;
-- addresses kept in clear before this change: remove them now (they would be gone within a day anyway)
delete from public.yb_rate r where (r.key like 'reg:%' or r.key like 'track:%') and r.key !~ '^(reg|track):(h[0-9a-f]{32}|\*)$';

-- ---------------------------------------------------------------- privileges
revoke all on function public.yb_team_photo_ok(uuid), public.yb_photo_consent_set(uuid, text), public.yb_photo_consent_board(), public.yb_photo_consent_mine(),
  public.yb_my_data(), public.yb_privacy_request(text, text), public.yb_privacy_mine(), public.yb_privacy_admin(), public.yb_privacy_close(bigint, boolean, text),
  public.yb_my_roster_rows(), public.yb_my_children_rows(), public.yb_match_counts_rows() from public, anon, authenticated;
grant execute on function public.yb_photo_consent_set(uuid, text), public.yb_photo_consent_board(), public.yb_photo_consent_mine(), public.yb_my_data(), public.yb_privacy_request(text, text),
  public.yb_privacy_mine(), public.yb_privacy_admin(), public.yb_privacy_close(bigint, boolean, text), public.yb_my_roster_rows(), public.yb_my_children_rows() to authenticated;
grant execute on function public.yb_match_counts_rows() to anon, authenticated;
grant select on public.my_roster, public.my_children to authenticated;
grant select on public.yb_match_counts to anon, authenticated;
