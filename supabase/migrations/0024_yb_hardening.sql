-- =============================================================================
-- 0024_yb_hardening.sql -- the fixes from the security review of November 2026
--
--   1. Judge conflicts are kept for good. A parent who once had a child in a team (a parent link, or the
--      parent who approved a player through the player pool) may never judge that team, even after the
--      link is deleted. Scores already given by such a judge to that team are removed.
--   2. The judge's oath (0020) is required on the server before a score is saved, not only in the page.
--   3. Online registration: a signed-in account that is not a team leader cannot register a team (it would
--      have become the leader), at most 3 teams a day for one phone number, at most 150 a day in all.
--   4. A team's weekly follow-up (names, promises, memorisation) is for its own leader and the admin only,
--      not every competition officer. The match roster is for teams that are in the competition.
--   5. Team photos are public only when EVERY member answered yes (an age typed by the leader no longer
--      decides it). The same rule now holds for the photos of a team's news post.
--   6. Notifications that a person can repeat (a post saved again, a request sent again, an invitation sent
--      again, comments) are not repeated while the first one is still unread (30 minutes).
--   7. Phone alerts: turning them off writes the audit log only when something was removed; turning them
--      on writes it only when the phone is new to the account.
--   8. The rate limits trust only the Cloudflare address header that the gateway sets.
--   9. Visitors read the public schedule without the ids of the staff who typed it.
--  10. public_teams becomes an invoker view over an owner-run row function (same columns, same rows).
--  11. yb_norm() is no longer callable by visitors (nothing public needs it).
-- ASCII only. Idempotent: safe to run again.
-- =============================================================================

-- ---------------------------------------------------------------- 1. permanent judge conflicts
create table if not exists public.yb_judge_conflicts (
  judge_id   uuid not null references public.profiles (id) on delete cascade,
  team_id    uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (judge_id, team_id)
);
alter table public.yb_judge_conflicts enable row level security;
alter table public.yb_judge_conflicts force row level security;
revoke all on public.yb_judge_conflicts from public, anon, authenticated;

-- a new conflict removes that judge's scores for that team
create or replace function public.yb_jc_purge()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.yb_judge_scores s where s.judge_id = new.judge_id and s.team_id = new.team_id;
  return null;
end $$;

drop trigger if exists yb_jc_purge_ai on public.yb_judge_conflicts;
create trigger yb_jc_purge_ai after insert on public.yb_judge_conflicts
  for each row execute function public.yb_jc_purge();

-- a parent linked to a child: that child's team
create or replace function public.yb_jc_from_link()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.yb_judge_conflicts (judge_id, team_id)
  select new.parent_id, m.team_id from public.team_members m where m.id = new.member_id
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists yb_jc_link_ai on public.parent_links;
create trigger yb_jc_link_ai after insert on public.parent_links
  for each row execute function public.yb_jc_from_link();

-- a member joins or changes team: the parents linked to them, and the parent who approved them in the pool
create or replace function public.yb_jc_from_member()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.yb_judge_conflicts (judge_id, team_id)
  select l.parent_id, new.team_id from public.parent_links l where l.member_id = new.id
  union
  select s.guardian_by, new.team_id from public.yb_seekers s
   where new.user_id is not null and s.user_id = new.user_id and s.guardian_by is not null
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists yb_jc_member_aiu on public.team_members;
create trigger yb_jc_member_aiu after insert or update of team_id, user_id on public.team_members
  for each row execute function public.yb_jc_from_member();

-- a parent approves a player who is already in a team
create or replace function public.yb_jc_from_seeker()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.guardian_by is not null then
    insert into public.yb_judge_conflicts (judge_id, team_id)
    select new.guardian_by, m.team_id from public.team_members m where m.user_id = new.user_id
    on conflict do nothing;
  end if;
  return null;
end $$;

drop trigger if exists yb_jc_seeker_aiu on public.yb_seekers;
create trigger yb_jc_seeker_aiu after insert or update of guardian_by on public.yb_seekers
  for each row execute function public.yb_jc_from_seeker();

-- what is already there
insert into public.yb_judge_conflicts (judge_id, team_id)
select l.parent_id, m.team_id from public.parent_links l join public.team_members m on m.id = l.member_id
union
select s.guardian_by, m.team_id from public.yb_seekers s join public.team_members m on m.user_id = s.user_id
 where s.guardian_by is not null
on conflict do nothing;

-- the caller has (or once had) a child in this team, approved one of its players, or leads or plays in it
create or replace function public.yb_judge_conflict(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select t in (select public.yb_my_team_ids())
      or exists (select 1 from public.parent_links l join public.team_members m on m.id = l.member_id
                  where l.parent_id = auth.uid() and m.team_id = t)
      or exists (select 1 from public.yb_judge_conflicts c where c.judge_id = auth.uid() and c.team_id = t)
      or exists (select 1 from public.yb_seekers s join public.team_members m on m.user_id = s.user_id
                  where s.guardian_by = auth.uid() and m.team_id = t)
$$;

-- ---------------------------------------------------------------- 2. the oath before a score
-- points null = clear this score
create or replace function public.yb_judge_score(team_id uuid, criterion text, points numeric, reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  ax text := public.yb_crit_axis(yb_judge_score.criterion);
  rs text := btrim(coalesce(yb_judge_score.reason, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if ax is null then raise exception 'invalid_argument'; end if;
  if not public.yb_is_judge(ax) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.yb_judge_oaths o where o.user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'oath_required');
  end if;
  if public.yb_results_published() then return jsonb_build_object('ok', false, 'error', 'results_published'); end if;
  if not public.yb_judged_team(yb_judge_score.team_id) then return jsonb_build_object('ok', false, 'error', 'bad_team'); end if;
  if public.yb_judge_conflict(yb_judge_score.team_id) then return jsonb_build_object('ok', false, 'error', 'conflict_of_interest'); end if;
  if yb_judge_score.points is null then
    delete from public.yb_judge_scores s where s.team_id = yb_judge_score.team_id and s.judge_id = auth.uid() and s.criterion = yb_judge_score.criterion;
    return jsonb_build_object('ok', true);
  end if;
  if yb_judge_score.points < 0 or yb_judge_score.points > public.yb_crit_cap(yb_judge_score.criterion) then
    return jsonb_build_object('ok', false, 'error', 'bad_points');
  end if;
  if char_length(rs) < 3 or char_length(rs) > 500 then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
  insert into public.yb_judge_scores as s (team_id, judge_id, criterion, points, reason)
  values (yb_judge_score.team_id, auth.uid(), yb_judge_score.criterion, round(yb_judge_score.points, 2), rs)
  on conflict on constraint yb_judge_scores_pkey do update set points = excluded.points, reason = excluded.reason, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- 3. online registration
create or replace function public.yb_register_team(p jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  addr   text := public.yb_client_addr();
  v_team text; v_leader text; v_phone text; v_pkey text; v_email text; v_area text;
  v_r1 text; v_r2 text; v_ch text; v_coord text; v_idea text;
  ms jsonb; m jsonb; i int; n int;
  nm text; ag int; ct text;
  names text[] := '{}';
  dup public.teams%rowtype;
  tid uuid; code text; uid uuid := auth.uid();
begin
  -- a signed-in account becomes the team's leader (yb_teams_bi): only a leader account may do that
  if uid is not null and coalesce(public.yb_role(), '') <> 'leader' then
    return jsonb_build_object('ok', false, 'error', 'wrong_role');
  end if;
  if public.yb_rate_count('reg:' || addr, interval '1 hour') >= 5
     or public.yb_rate_count('reg:*', interval '1 hour') >= 60
     or public.yb_rate_count('reg:*', interval '1 day') >= 150 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  perform public.yb_rate_hit('reg:' || addr);
  perform public.yb_rate_hit('reg:*');

  if p is null or jsonb_typeof(p) <> 'object' then return jsonb_build_object('ok', false, 'error', 'invalid_argument'); end if;
  v_team   := btrim(coalesce(p ->> 'team', ''));
  v_leader := btrim(coalesce(p ->> 'leader', ''));
  v_phone  := btrim(coalesce(p ->> 'phone', ''));
  v_pkey   := public.yb_phone_key(v_phone);
  v_email  := nullif(btrim(coalesce(p ->> 'email', '')), '');
  v_area   := nullif(btrim(coalesce(p ->> 'area', '')), '');
  v_r1     := btrim(coalesce(p ->> 'reciter1', ''));
  v_r2     := btrim(coalesce(p ->> 'reciter2', ''));
  v_ch     := btrim(coalesce(p ->> 'chess', ''));
  v_coord  := nullif(btrim(coalesce(p ->> 'coordinator', '')), '');
  v_idea   := nullif(btrim(coalesce(p ->> 'idea', '')), '');

  if char_length(v_team) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'bad_team_name'); end if;
  if char_length(v_leader) not between 2 and 80 then return jsonb_build_object('ok', false, 'error', 'bad_leader'); end if;
  if char_length(public.yb_digits(v_phone)) < 7 or char_length(v_phone) > 30 then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;
  if v_area is not null and char_length(v_area) > 60 then return jsonb_build_object('ok', false, 'error', 'bad_area'); end if;
  if v_idea is not null and char_length(v_idea) > 600 then return jsonb_build_object('ok', false, 'error', 'bad_idea'); end if;
  if coalesce(p ->> 'pledges', '') <> 'true' then return jsonb_build_object('ok', false, 'error', 'pledges_required'); end if;

  ms := p -> 'members';
  if ms is null or jsonb_typeof(ms) <> 'array' then return jsonb_build_object('ok', false, 'error', 'members_count_invalid'); end if;
  n := jsonb_array_length(ms);
  if n < 5 or n > 7 then return jsonb_build_object('ok', false, 'error', 'members_count_invalid'); end if;
  for i in 0 .. n - 1 loop
    m := ms -> i;
    if jsonb_typeof(m) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_member'); end if;
    nm := case when i = 0 then v_leader else btrim(coalesce(m ->> 'name', '')) end;
    if char_length(nm) not between 2 and 80 then return jsonb_build_object('ok', false, 'error', 'bad_member'); end if;
    begin
      ag := (m ->> 'age')::int;
    exception when others then ag := null;
    end;
    if ag is null or ag not between 4 and 100 then return jsonb_build_object('ok', false, 'error', 'bad_age'); end if;
    ct := btrim(coalesce(m ->> 'contact', ''));
    if char_length(public.yb_digits(ct)) < 7 or char_length(ct) > 30 then
      return jsonb_build_object('ok', false, 'error', 'bad_contact');
    end if;
    if public.yb_norm(nm) = any (names) then return jsonb_build_object('ok', false, 'error', 'duplicate_member'); end if;
    names := names || public.yb_norm(nm);
  end loop;
  if not (public.yb_norm(v_r1) = any (names)) or not (public.yb_norm(v_r2) = any (names))
     or not (public.yb_norm(v_ch) = any (names)) then
    return jsonb_build_object('ok', false, 'error', 'bad_nominee');
  end if;
  if public.yb_norm(v_r1) = public.yb_norm(v_r2) then return jsonb_build_object('ok', false, 'error', 'same_reciters'); end if;
  if v_coord is not null and not (public.yb_norm(v_coord) = any (names)) then
    return jsonb_build_object('ok', false, 'error', 'bad_nominee');
  end if;

  -- the same form sent twice (double tap, retry after a lost answer): same request number
  select t.* into dup from public.teams t join public.yb_registrations r on r.team_id = t.id
   where public.yb_norm(t.name) = public.yb_norm(v_team) and r.phone_key = v_pkey
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'ref', dup.ref_code, 'team_id', dup.id, 'duplicate', true);
  end if;
  -- one phone number registers at most 3 teams a day
  if public.yb_rate_count('regp:' || v_pkey, interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  -- team names are unique for good (teams_name_norm_uq, rejected teams included)
  if exists (select 1 from public.teams t where public.yb_norm(t.name) = public.yb_norm(v_team)) then
    return jsonb_build_object('ok', false, 'error', 'team_name_taken');
  end if;
  if uid is not null and exists (select 1 from public.teams t where t.leader_id = uid) then   -- one team per leader account (teams_leader_uq)
    return jsonb_build_object('ok', false, 'error', 'already_leading');
  end if;

  code := public.yb_new_ref_code();
  begin
    insert into public.teams (name, area, join_code, status, leader_id)
    values (v_team, v_area, public.yb_new_join_code(), 'draft', null)
    returning id into tid;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'team_name_taken');   -- a parallel request won the name
  end;
  update public.teams t set ref_code = code where t.id = tid;
  -- yb_teams_bi makes a signed-in caller the leader (and yb_teams_ai adds their
  -- roster row): keep that row, with the name typed in the form
  if exists (select 1 from public.team_members x where x.team_id = tid and x.is_leader) then
    update public.team_members x
       set full_name = v_leader, age = (ms -> 0 ->> 'age')::int, guardian_phone = btrim(ms -> 0 ->> 'contact')
     where x.team_id = tid and x.is_leader;
  else
    insert into public.team_members (team_id, full_name, age, guardian_phone, is_leader)
    values (tid, v_leader, (ms -> 0 ->> 'age')::int, btrim(ms -> 0 ->> 'contact'), true);
  end if;
  for i in 1 .. n - 1 loop
    m := ms -> i;
    insert into public.team_members (team_id, full_name, age, guardian_phone)
    values (tid, btrim(m ->> 'name'), (m ->> 'age')::int, btrim(m ->> 'contact'));
  end loop;
  insert into public.yb_registrations (team_id, phone, phone_key, email, reciter1, reciter2, chess, coordinator, idea)
  values (tid, v_phone, v_pkey, v_email, v_r1, v_r2, v_ch, v_coord, v_idea);
  update public.teams t set status = 'submitted' where t.id = tid;
  perform public.yb_rate_hit('regp:' || v_pkey);
  return jsonb_build_object('ok', true, 'ref', code, 'team_id', tid);
end $$;

-- ---------------------------------------------------------------- 4. who reads a team's week and roster
create or replace function public.yb_team_journey(team_id uuid, week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_team_journey.team_id; w date := yb_team_journey.week;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_leads_team(t) or public.is_admin()) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'can_lead', public.yb_leads_team(t),
    'nudged_today', exists (select 1 from public.yb_lead_weeks l where l.team_id = t and l.nudged_on = current_date),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'member_id', m.id, 'name', m.full_name, 'is_leader', m.is_leader, 'joined', m.user_id is not null,
      'pledge', (select jsonb_build_object('field', p.field, 'body', p.body, 'done', p.done, 'parent_note', p.parent_note, 'cheered', p.cheered_at is not null)
                   from public.yb_pledges p where p.user_id = m.user_id and p.week = w),
      'kept', (select count(*) from public.yb_pledges p where p.user_id = m.user_id and p.done),
      'hifz', coalesce((select cardinality(h.ayahs) from public.yb_hifz_marks h where h.user_id = m.user_id), 0),
      'deed_days', (select count(*) from public.yb_deed_days d where d.user_id = m.user_id and d.day >= w)) order by m.is_leader desc, m.full_name)
    from public.team_members m where m.team_id = t), '[]'::jsonb));
end $$;

create or replace function public.yb_match_roster(comp text, team_id text)
returns table (member_id uuid, full_name text, roles text[])
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if yb_match_roster.comp is null or not public.yb_can_manage(yb_match_roster.comp) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select m.id, m.full_name, m.roles from public.team_members m
     where m.team_id::text = yb_match_roster.team_id and public.yb_in_play(m.team_id)
     order by m.is_leader desc, m.full_name;
end $$;

-- ---------------------------------------------------------------- 5. photos: everyone said yes
create or replace function public.yb_team_photo_ok(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.team_members m where m.team_id = t)
     and not exists (select 1 from public.team_members m where m.team_id = t and m.photo_consent is distinct from 'yes')
$$;

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
  -- a team's photos go out only when every member of the team said yes
  if act in ('publish', 'show') and cardinality(cur.photos) > 0 and cur.team_id is not null
     and not public.yb_team_photo_ok(cur.team_id) then
    return jsonb_build_object('ok', false, 'error', 'photo_consent');
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

-- a post published before a member withdrew: the others no longer see its photos
create or replace function public.yb_post_json(x public.yb_posts)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', x.id, 'body', x.body,
    'photos', case when x.team_id is null or x.author = auth.uid() or public.is_admin() or public.yb_team_photo_ok(x.team_id)
                   then to_jsonb(x.photos) else '[]'::jsonb end,
    'status', x.status, 'pinned', x.pinned,
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

-- read: the photos of published posts (signed-in people, the team's photos only with everyone's yes), your own folder, the admin
create or replace function public.yb_feed_can_read(path text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.yb_feed_member() and (
           public.is_admin()
        or split_part(coalesce(path, ''), '/', 1) = auth.uid()::text
        or exists (select 1 from public.yb_posts p where p.status = 'published' and coalesce(path, '') = any (p.photos)
                     and (p.team_id is null or public.yb_team_photo_ok(p.team_id))))
$$;

-- ---------------------------------------------------------------- 6. no repeated notifications
create or replace function public.yb_notify(uids uuid[], kind text, data jsonb)
returns void
language sql volatile security definer
set search_path = public, pg_temp
as $$
  insert into public.yb_notifications (user_id, kind, data)
  select distinct u, yb_notify.kind, coalesce(yb_notify.data, '{}'::jsonb)
    from unnest(yb_notify.uids) as u
   where u is not null and exists (select 1 from public.profiles p where p.id = u)
     and not exists (select 1 from public.yb_profile_prefs pp
                      where pp.user_id = u and public.yb_note_group(yb_notify.kind) = any (pp.notify_off))
     and not (yb_notify.kind in ('post_pending', 'team_submitted', 'invite_new', 'invite_waiting', 'comment_new',
                                 'submission_new', 'comment_report', 'chat_report')
              and exists (select 1 from public.yb_notifications n
                           where n.user_id = u and n.kind = yb_notify.kind and n.read_at is null
                             and n.created_at > now() - interval '30 minutes'
                             and coalesce(n.data ->> 'post_id', n.data ->> 'team_id', n.data ->> 'team_name', '')
                               = coalesce(yb_notify.data ->> 'post_id', yb_notify.data ->> 'team_id', yb_notify.data ->> 'team_name', '')))
$$;

-- ---------------------------------------------------------------- 7. phone alerts and the audit log
create or replace function public.yb_push_subscribe(sub jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); ep text; k1 text; k2 text; n int; was uuid;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_push_allowed(me) then return jsonb_build_object('ok', false, 'error', 'consent_needed'); end if;
  if jsonb_typeof(sub) is distinct from 'object' then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  ep := sub ->> 'endpoint'; k1 := sub -> 'keys' ->> 'p256dh'; k2 := sub -> 'keys' ->> 'auth';
  if ep is null or char_length(ep) not between 20 and 800 or not public.yb_push_host_ok(ep) then
    return jsonb_build_object('ok', false, 'error', 'push_service_not_allowed');
  end if;
  if k1 is null or k2 is null or k1 !~ '^[A-Za-z0-9_-]{80,100}$' or k2 !~ '^[A-Za-z0-9_-]{16,32}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  select s.user_id into was from public.yb_push_subs s where s.endpoint = ep;
  -- one phone, one owner: a phone handed to someone else follows its new owner
  insert into public.yb_push_subs as s (user_id, endpoint, p256dh, auth) values (me, ep, k1, k2)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- at most 5 phones a person: the oldest goes
  delete from public.yb_push_subs s where s.user_id = me and s.id not in (select x.id from public.yb_push_subs x where x.user_id = me order by x.created_at desc, x.id desc limit 5);
  select count(*) into n from public.yb_push_subs s where s.user_id = me;
  if was is distinct from me then
    insert into public.audit_log (user_id, action, detail) values (me, 'push_on', jsonb_build_object('phones', n));
  end if;
  return jsonb_build_object('ok', true, 'phones', n);
end $$;

create or replace function public.yb_push_unsubscribe(endpoint text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); gone int;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from public.yb_push_subs s where s.user_id = me and s.endpoint = yb_push_unsubscribe.endpoint;
  get diagnostics gone = row_count;
  if gone > 0 then
    insert into public.audit_log (user_id, action, detail) values (me, 'push_off', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- 8. the address used by the rate limits
-- Cloudflare sets cf-connecting-ip itself; x-forwarded-for and x-real-ip can be typed by the caller.
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
  return 'h' || md5('yanabee-rate:' || left(coalesce(nullif(h ->> 'cf-connecting-ip', ''), 'unknown'), 64));
end $$;

-- ---------------------------------------------------------------- 9. the public schedule without staff ids
revoke select on public.yb_events from anon;
grant select (id, competition, kind, title, starts_at, place, team_ids, category, status, note, created_at, updated_at)
  on public.yb_events to anon;

-- ---------------------------------------------------------------- 10. public_teams as an invoker view
create or replace function public.yb_public_teams_rows()
returns table (id uuid, name text, area text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select t.id, t.name, t.area from public.teams t where t.status = 'approved'
$$;

create or replace view public.public_teams with (security_barrier = true) as
  select r.id, r.name, r.area from public.yb_public_teams_rows() r;
alter view public.public_teams set (security_invoker = true);

-- ---------------------------------------------------------------- grants
revoke all on function public.yb_jc_purge(), public.yb_jc_from_link(), public.yb_jc_from_member(), public.yb_jc_from_seeker(),
  public.yb_public_teams_rows() from public, anon, authenticated;
grant execute on function public.yb_public_teams_rows() to anon, authenticated;
grant select on public.public_teams to anon, authenticated;

-- 11. nothing a visitor calls needs yb_norm (the owner-run functions use it as the owner)
revoke execute on function public.yb_norm(text) from anon;

comment on table public.yb_judge_conflicts is 'A judge may never score these teams (a child once linked, or a player they approved). Kept after the link goes.';
