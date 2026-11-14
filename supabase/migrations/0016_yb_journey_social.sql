-- Yanabee 0016: the journey between people (owner, Nov 2026: "continue creating"; follows 0015).
--   1. The leader encourages a member's promise (one tap, "cheered"), and reminds the members who wrote none
--      (at most once a day a team). leaders.txt: the leader follows the week and motivates the members.
--   2. Notifications: the child hears when a parent writes a word or the leader cheers; the linked parents hear
--      when their child keeps the promise; members hear the leader's reminder. No promise text travels in a
--      notification; names never do.
--   3. The member's own past promises (yb_my_pledges).
--   4. The week across teams (yb_week_race): for each approved team, how many joined, promised and kept, and the
--      ayahs ticked. Team names and counts only. It is not part of the competition's 100 points.
-- Functions of 0015 that gain "cheered" or a notification are replaced here; 0015 must be applied first.

alter table public.yb_pledges add column if not exists cheered_at timestamptz;
alter table public.yb_lead_weeks add column if not exists nudged_on date;

-- ---------------------------------------------------------------- the person (replaces 0015)
create or replace function public.yb_journey_me(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); t uuid;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  t := public.yb_my_team_id(me);
  return jsonb_build_object('team_id', t,
    'pledge', (select jsonb_build_object('field', p.field, 'body', p.body, 'done', p.done, 'parent_note', p.parent_note, 'cheered', p.cheered_at is not null)
                 from public.yb_pledges p where p.user_id = me and p.week = yb_journey_me.week),
    'kept', (select count(*) from public.yb_pledges p where p.user_id = me and p.done),
    'hifz', coalesce((select to_jsonb(h.ayahs) from public.yb_hifz_marks h where h.user_id = me), '[]'::jsonb),
    'deed_days', coalesce((select jsonb_agg(d.day order by d.day) from public.yb_deed_days d where d.user_id = me and d.day > current_date - 9), '[]'::jsonb));
end $$;

create or replace function public.yb_pledge_save(week date, field text, body text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); t uuid; b text := btrim(regexp_replace(coalesce(yb_pledge_save.body, ''), '\s+', ' ', 'g'));
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  t := public.yb_my_team_id(me);
  if t is null then return jsonb_build_object('ok', false, 'error', 'no_team'); end if;
  if not public.yb_week_ok(yb_pledge_save.week) or yb_pledge_save.field not in ('home', 'hood', 'kin', 'school', 'friends')
     or char_length(b) not between 5 and 140 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if public.yb_has_contact(b) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  insert into public.yb_pledges as p (user_id, team_id, week, field, body) values (me, t, yb_pledge_save.week, yb_pledge_save.field, b)
  on conflict on constraint yb_pl_one do update set field = excluded.field, body = excluded.body, team_id = excluded.team_id,
    done = case when p.body = excluded.body and p.field = excluded.field then p.done else false end,
    done_at = case when p.body = excluded.body and p.field = excluded.field then p.done_at end,
    cheered_at = case when p.body = excluded.body and p.field = excluded.field then p.cheered_at end,   -- a new text was not cheered yet
    updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_pledge_done(week date, done boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); was boolean; nm text;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select p.done into was from public.yb_pledges p where p.user_id = me and p.week = yb_pledge_done.week;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update public.yb_pledges p set done = coalesce(yb_pledge_done.done, false), done_at = case when yb_pledge_done.done then now() end, updated_at = now()
   where p.user_id = me and p.week = yb_pledge_done.week;
  if coalesce(yb_pledge_done.done, false) and not was then   -- the linked parents hear it once
    select public.yb_first_name(m.full_name) into nm from public.team_members m where m.user_id = me order by m.created_at limit 1;
    perform public.yb_notify(array(select l.parent_id from public.parent_links l join public.team_members m on m.id = l.member_id where m.user_id = me),
      'pledge_kept', jsonb_build_object('first_name', coalesce(nm, '')));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_my_pledges(lim int default 12)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('week', to_char(x.week, 'YYYY-MM-DD'), 'field', x.field, 'body', x.body, 'done', x.done,
      'parent_note', x.parent_note, 'cheered', x.cheered_at is not null) order by x.week desc)
    from (select * from public.yb_pledges p where p.user_id = auth.uid() order by p.week desc limit least(greatest(coalesce(lim, 12), 1), 30)) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- the leader (replaces 0015, adds two)
create or replace function public.yb_team_journey(team_id uuid, week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_team_journey.team_id; w date := yb_team_journey.week;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_leads_team(t) or public.yb_is_staff()) then raise exception 'permission_denied' using errcode = '42501'; end if;
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

-- the leader's one-tap encouragement on this week's promise of a member of their team
create or replace function public.yb_pledge_cheer(member_id uuid, week date)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare u uuid; t uuid; was timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select m.user_id, m.team_id into u, t from public.team_members m where m.id = yb_pledge_cheer.member_id;
  if t is null or not public.yb_leads_team(t) then raise exception 'permission_denied' using errcode = '42501'; end if;
  select p.cheered_at into was from public.yb_pledges p where p.user_id = u and p.week = yb_pledge_cheer.week;
  if not found or u is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if was is null then
    update public.yb_pledges p set cheered_at = now() where p.user_id = u and p.week = yb_pledge_cheer.week;
    perform public.yb_notify(array[u], 'pledge_cheer', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- remind the joined members who wrote no promise this week; at most once a day a team
create or replace function public.yb_pledge_nudge(team_id uuid, week date)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_pledge_nudge.team_id; w date := yb_pledge_nudge.week; ids uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_leads_team(t) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not public.yb_week_ok(w) then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if exists (select 1 from public.yb_lead_weeks l where l.team_id = t and l.nudged_on = current_date) then
    return jsonb_build_object('ok', false, 'error', 'too_soon');
  end if;
  select coalesce(array_agg(m.user_id), '{}') into ids from public.team_members m
   where m.team_id = t and m.user_id is not null and not m.is_leader
     and not exists (select 1 from public.yb_pledges p where p.user_id = m.user_id and p.week = w);
  if cardinality(ids) = 0 then return jsonb_build_object('ok', true, 'sent', 0); end if;
  insert into public.yb_lead_weeks as l (team_id, week, nudged_on) values (t, w, current_date)
  on conflict on constraint yb_lead_weeks_pkey do update set nudged_on = current_date;
  perform public.yb_notify(ids, 'pledge_nudge', jsonb_build_object('team_name', (select x.name from public.teams x where x.id = t)));
  return jsonb_build_object('ok', true, 'sent', cardinality(ids));
end $$;

-- ---------------------------------------------------------------- the parent (replaces 0015)
create or replace function public.yb_child_journey(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.full_name, 'joined', m.user_id is not null,
      'pledge', (select jsonb_build_object('field', p.field, 'body', p.body, 'done', p.done, 'parent_note', p.parent_note, 'cheered', p.cheered_at is not null)
                   from public.yb_pledges p where p.user_id = m.user_id and p.week = yb_child_journey.week),
      'kept', (select count(*) from public.yb_pledges p where p.user_id = m.user_id and p.done),
      'hifz', coalesce((select cardinality(h.ayahs) from public.yb_hifz_marks h where h.user_id = m.user_id), 0),
      'deed_days', (select count(*) from public.yb_deed_days d where d.user_id = m.user_id and d.day >= yb_child_journey.week)) order by m.full_name)
    from public.parent_links l join public.team_members m on m.id = l.member_id where l.parent_id = me), '[]'::jsonb);
end $$;

create or replace function public.yb_pledge_note(member_id uuid, week date, note text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); u uuid; was text; n text := nullif(btrim(regexp_replace(coalesce(yb_pledge_note.note, ''), '\s+', ' ', 'g')), '');
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.parent_links l where l.parent_id = me and l.member_id = yb_pledge_note.member_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if char_length(coalesce(n, '')) > 200 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if n is not null and public.yb_has_contact(n) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  select m.user_id into u from public.team_members m where m.id = yb_pledge_note.member_id;
  select p.parent_note into was from public.yb_pledges p where p.user_id = u and p.week = yb_pledge_note.week;
  if not found or u is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  update public.yb_pledges p set parent_note = n, parent_by = case when n is null then null else me end, updated_at = now()
   where p.user_id = u and p.week = yb_pledge_note.week;
  if n is not null and n is distinct from was then perform public.yb_notify(array[u], 'pledge_note', '{}'::jsonb); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- the week across teams
-- anyone inside the competition (a joined member, a leader, a linked parent, staff): team names and counts only
create or replace function public.yb_week_race(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); w date := yb_week_race.week;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (public.yb_is_staff() or public.yb_my_team_id(me) is not null
          or exists (select 1 from public.parent_links l where l.parent_id = me)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name,
      'joined', (select count(*) from public.team_members m where m.team_id = t.id and m.user_id is not null and not m.is_leader),
      'pledged', (select count(*) from public.yb_pledges p join public.team_members m on m.user_id = p.user_id and m.team_id = t.id and not m.is_leader where p.week = w),
      'kept', (select count(*) from public.yb_pledges p join public.team_members m on m.user_id = p.user_id and m.team_id = t.id and not m.is_leader where p.week = w and p.done),
      'hifz_sum', coalesce((select sum(cardinality(h.ayahs)) from public.yb_hifz_marks h join public.team_members m on m.user_id = h.user_id where m.team_id = t.id and not m.is_leader), 0)) order by t.name)
    from public.teams t where t.status::text = 'approved'), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.yb_my_pledges(int), public.yb_pledge_cheer(uuid, date), public.yb_pledge_nudge(uuid, date), public.yb_week_race(date)
  from public, anon, authenticated;
grant execute on function public.yb_my_pledges(int), public.yb_pledge_cheer(uuid, date), public.yb_pledge_nudge(uuid, date), public.yb_week_race(date)
  to authenticated;
