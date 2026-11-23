-- Yanabee 0023: the closing of the competition (owner, 20 Nov 2026: "need more stuff", then chose certificates and
-- honours, the closing-ceremony show and the weekly parent summary).
--   1. Honours (competition.txt c-honors): the trip of the outstanding participants, the individual medals of
--      excellence in memorisation, understanding, practising the values, cooperation and initiative (members), and
--      the award of the outstanding leader (the team's leader). The admin gives each one with a reason, helped by the
--      numbers the site already holds (yb_honours_suggest). They stay private until the admin announces them
--      (yb_settings.honours_announced); then a team's own people read their team's honours, a member by first name.
--      These are the final honours; yb_awards (0017) stays the encouragement during the season.
--   2. Certificates of appreciation (c-prizes): yb_cert_list gives the names the caller may print: the admin every
--      member of the approved teams, a leader their team, a parent their linked children, a member themselves. Places
--      after the results are published, honours after they are announced (the admin always).
--   3. The ceremony (yb_ceremony): the admin's own screen in the hall: every team ranked, the honours, the season in
--      numbers. Nothing here is public.
--   4. The parent's week (yb_parent_week): one card per linked child. The team's one-page report for the partner
--      school or association (yb_team_report): counts only, no child's name.
-- Tables are closed; everything goes through functions. ASCII only.

create table if not exists public.yb_honours (
  id        bigint generated always as identity primary key,
  kind      text not null,
  axis      text,
  team_id   uuid not null references public.teams (id) on delete cascade,
  member_id uuid references public.team_members (id) on delete cascade,
  reason    text not null,
  given_by  uuid references public.profiles (id) on delete set null,
  given_at  timestamptz not null default now(),
  constraint yb_ho_kind check (kind in ('trip', 'medal', 'leader')),
  constraint yb_ho_axis check ((kind = 'medal') = (axis is not null) and (axis is null or axis in ('hifz', 'fahm', 'tatbiq', 'taawun', 'mubadara'))),
  constraint yb_ho_who check ((kind = 'leader') = (member_id is null)),
  constraint yb_ho_reason check (char_length(reason) between 3 and 200)
);
create unique index if not exists yb_honours_one on public.yb_honours (kind, coalesce(axis, ''), coalesce(member_id, team_id));
create index if not exists yb_honours_team_idx on public.yb_honours (team_id);
create index if not exists yb_honours_member_idx on public.yb_honours (member_id);
create index if not exists yb_honours_given_by_idx on public.yb_honours (given_by);
alter table public.yb_honours enable row level security;
alter table public.yb_honours force row level security;
revoke all on public.yb_honours from anon, authenticated;

-- the approved teams that take part (not the waiting list), as in yb_team_totals
create or replace function public.yb_in_play(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.teams x where x.id = t and x.status::text = 'approved' and coalesce(x.waitlist, false) = false) $$;

create or replace function public.yb_honours_announced()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select coalesce((select (s.value)::text = 'true' from public.yb_settings s where s.key = 'honours_announced'), false) $$;

-- the name an honour is given to: the member, or the team's leader
create or replace function public.yb_honour_name(h public.yb_honours)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when h.kind = 'leader'
              then (select p.full_name from public.teams t join public.profiles p on p.id = t.leader_id where t.id = h.team_id)
              else (select m.full_name from public.team_members m where m.id = h.member_id) end
$$;

-- ---------------------------------------------------------------- 1. honours (the admin)
create or replace function public.yb_honour_give(kind text, team_id uuid, member_id uuid default null, axis text default null, reason text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare k text := yb_honour_give.kind; t uuid := yb_honour_give.team_id; mid uuid := yb_honour_give.member_id; ax text := yb_honour_give.axis;
  r text := btrim(regexp_replace(coalesce(yb_honour_give.reason, ''), '\s+', ' ', 'g')); nm text; new_id bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not public.yb_in_play(t) then return jsonb_build_object('ok', false, 'error', 'team_not_found'); end if;
  select x.name into nm from public.teams x where x.id = t;
  if k is null or k not in ('trip', 'medal', 'leader') or char_length(r) not between 3 and 200
     or (k = 'medal' and (ax is null or ax not in ('hifz', 'fahm', 'tatbiq', 'taawun', 'mubadara'))) then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if k <> 'medal' then ax := null; end if;
  if public.yb_has_contact(r) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  if k = 'leader' then
    mid := null;
    if not exists (select 1 from public.teams x where x.id = t and x.leader_id is not null) then return jsonb_build_object('ok', false, 'error', 'no_leader'); end if;
  elsif mid is null or not exists (select 1 from public.team_members m where m.id = mid and m.team_id = t) then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;
  if exists (select 1 from public.yb_honours h where h.kind = k and coalesce(h.axis, '') = coalesce(ax, '') and coalesce(h.member_id, h.team_id) = coalesce(mid, t)) then
    return jsonb_build_object('ok', false, 'error', 'already_given');
  end if;
  insert into public.yb_honours (kind, axis, team_id, member_id, reason, given_by) values (k, ax, t, mid, r, auth.uid()) returning id into new_id;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'honour_give', jsonb_build_object('team_id', t, 'kind', k, 'axis', ax));
  if public.yb_honours_announced() then
    perform public.yb_notify(public.yb_team_people(array[t]), 'honour', jsonb_build_object('team_name', nm, 'kind', k, 'axis', ax));
  end if;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.yb_honour_remove(id bigint)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  delete from public.yb_honours h where h.id = yb_honour_remove.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'honour_remove', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.yb_honours_board()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('announced', public.yb_honours_announced(),
    'honours', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'kind', h.kind, 'axis', h.axis, 'team_id', h.team_id, 'team_name', t.name,
        'member_id', h.member_id, 'name', public.yb_honour_name(h), 'reason', h.reason, 'at', h.given_at)
        order by h.kind, coalesce(h.axis, ''), t.name, h.id)
      from public.yb_honours h join public.teams t on t.id = h.team_id), '[]'::jsonb));
end $$;

create or replace function public.yb_honours_announce(announce boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare was boolean := public.yb_honours_announced(); a boolean := coalesce(yb_honours_announce.announce, false);
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if a and not exists (select 1 from public.yb_honours) then return jsonb_build_object('ok', false, 'error', 'nothing_to_announce'); end if;
  insert into public.yb_settings as s (key, value, updated_by) values ('honours_announced', to_jsonb(a), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'honours_announce', jsonb_build_object('announced', a));
  if a and not was then
    perform public.yb_notify(array(select p.id from public.profiles p where p.id <> auth.uid()), 'honours_announced', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'announced', a);
end $$;

-- the numbers behind a choice: per member and per leader of the teams in play. Counts only; the admin decides.
create or replace function public.yb_honours_suggest()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'team_id', t.id, 'team_name', t.name, 'name', m.full_name,
        'is_leader', coalesce(m.is_leader, false), 'joined', m.user_id is not null,
        'held', (select count(*) from public.yb_meetings g where g.team_id = t.id),
        'came', (select count(*) from public.yb_meet_present a where a.member_id = m.id),
        'pledges', (select count(*) from public.yb_pledges p where m.user_id is not null and p.user_id = m.user_id),
        'kept', (select count(*) from public.yb_pledges p where m.user_id is not null and p.user_id = m.user_id and p.done),
        'hifz', coalesce((select cardinality(hm.ayahs) from public.yb_hifz_marks hm where m.user_id is not null and hm.user_id = m.user_id), 0),
        'deed_days', (select count(*) from public.yb_deed_days d where m.user_id is not null and d.user_id = m.user_id),
        'awards', coalesce((select jsonb_object_agg(x.kind, x.n) from (select a.kind, count(*) n from public.yb_awards a where a.member_id = m.id group by a.kind) x), '{}'::jsonb))
        order by t.name, m.full_name)
      from public.team_members m join public.teams t on t.id = m.team_id where public.yb_in_play(t.id)), '[]'::jsonb),
    'leaders', coalesce((select jsonb_agg(jsonb_build_object('team_id', t.id, 'team_name', t.name, 'name', p.full_name,
        'rank', (select x.rank from public.yb_team_totals() x where x.team_id = t.id),
        'total', (select x.total from public.yb_team_totals() x where x.team_id = t.id),
        'meetings', (select count(*) from public.yb_meetings g where g.team_id = t.id),
        'present', coalesce((select sum(g.present) from public.yb_meetings g where g.team_id = t.id), 0),
        'expected', coalesce((select sum(g.expected) from public.yb_meetings g where g.team_id = t.id), 0),
        'notes', (select count(*) from public.yb_lead_notes n where n.team_id = t.id and n.written_at is not null),
        'review', (select round(avg((coalesce(n.c1, 0) + coalesce(n.c2, 0) + coalesce(n.c3, 0) + coalesce(n.c4, 0)) / 4.0), 1)
                     from public.yb_lead_notes n where n.team_id = t.id and n.reviewed_at is not null),
        'lead_came', (select count(*) from public.yb_lead_meets l where t.id = any (l.teams)),
        'lead_held', (select count(*) from public.yb_lead_meets l where t.id = any (l.invited)),
        'projects', (select count(*) from public.yb_submissions s where s.team_id = t.id and s.status = 'accepted'),
        'leader_awards', (select count(*) from public.yb_awards a where a.team_id = t.id and a.kind = 'leader'))
        order by t.name)
      from public.teams t join public.profiles p on p.id = t.leader_id where public.yb_in_play(t.id)), '[]'::jsonb));
end $$;

-- a team's people, once announced: their team's honours; a member named by first name
create or replace function public.yb_my_honours()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_honours_announced() then return jsonb_build_object('announced', false, 'honours', '[]'::jsonb); end if;
  return jsonb_build_object('announced', true, 'honours', coalesce((select jsonb_agg(jsonb_build_object('kind', h.kind, 'axis', h.axis, 'team_name', t.name,
      'name', public.yb_first_name(public.yb_honour_name(h)),
      'mine', (h.kind = 'leader' and t.leader_id = me)
              or exists (select 1 from public.team_members m where m.id = h.member_id and m.user_id = me)
              or exists (select 1 from public.parent_links l where l.member_id = h.member_id and l.parent_id = me))
      order by h.kind, coalesce(h.axis, ''), h.id)
    from public.yb_honours h join public.teams t on t.id = h.team_id where public.yb_is_team_person(h.team_id)), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 2. certificates: whom the caller may print for
create or replace function public.yb_cert_list()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); adm boolean := public.is_admin(); pub boolean; ann boolean;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  pub := adm or public.yb_results_published();
  ann := adm or public.yb_honours_announced();
  return (with people as (
      select m.id, m.team_id, m.full_name, coalesce(m.is_leader, false) is_leader
        from public.team_members m
       where public.yb_in_play(m.team_id)
         and (adm or m.user_id = me
              or exists (select 1 from public.teams t where t.id = m.team_id and t.leader_id = me)
              or exists (select 1 from public.parent_links l where l.member_id = m.id and l.parent_id = me))),
    tms as (select distinct p.team_id from people p
            union select t.id from public.teams t where t.leader_id = me and public.yb_in_play(t.id))
    select jsonb_build_object('published', public.yb_results_published(), 'announced', public.yb_honours_announced(),
      'people', coalesce((select jsonb_agg(jsonb_build_object('member_id', p.id, 'team_id', p.team_id, 'team_name', t.name, 'name', p.full_name, 'is_leader', p.is_leader)
                            order by t.name, p.is_leader desc, p.full_name)
                          from people p join public.teams t on t.id = p.team_id), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(jsonb_build_object('team_id', x.team_id, 'team_name', x.team_name, 'rank', x.rank, 'total', x.total,
                             'leader', (select pr.full_name from public.teams t join public.profiles pr on pr.id = t.leader_id where t.id = x.team_id),
                             'mine', exists (select 1 from public.teams t where t.id = x.team_id and t.leader_id = me)) order by x.rank, x.team_name)
                         from public.yb_team_totals() x where pub and x.team_id in (select team_id from tms)), '[]'::jsonb),
      'honours', coalesce((select jsonb_agg(jsonb_build_object('kind', h.kind, 'axis', h.axis, 'team_id', h.team_id, 'team_name', t.name,
                               'member_id', h.member_id, 'name', public.yb_honour_name(h)) order by h.kind, coalesce(h.axis, ''), h.id)
                           from public.yb_honours h join public.teams t on t.id = h.team_id
                          where ann and (adm or h.member_id in (select id from people) or (h.kind = 'leader' and t.leader_id = me))), '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- 3. the ceremony (the admin's screen)
create or replace function public.yb_ceremony()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('published', public.yb_results_published(), 'announced', public.yb_honours_announced(),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('team_id', x.team_id, 'team_name', x.team_name, 'hifz', x.hifz, 'fahm', x.fahm, 'tatbiq', x.tatbiq,
        'football', x.football, 'chess', x.chess, 'total', x.total, 'rank', x.rank) order by x.rank desc, x.team_name) from public.yb_team_totals() x), '[]'::jsonb),
    'honours', coalesce((select jsonb_agg(jsonb_build_object('kind', h.kind, 'axis', h.axis, 'team_name', t.name, 'name', public.yb_honour_name(h), 'reason', h.reason)
        order by h.kind, coalesce(h.axis, ''), t.name, h.id) from public.yb_honours h join public.teams t on t.id = h.team_id), '[]'::jsonb),
    'numbers', (with tm as (select x.id from public.teams x where public.yb_in_play(x.id)),
                     mm as (select m.* from public.team_members m where m.team_id in (select id from tm))
      select jsonb_build_object('teams', (select count(*) from tm), 'members', (select count(*) from mm),
        'meetings', (select count(*) from public.yb_meetings g where g.team_id in (select id from tm)),
        'present', coalesce((select sum(g.present) from public.yb_meetings g where g.team_id in (select id from tm)), 0),
        'expected', coalesce((select sum(g.expected) from public.yb_meetings g where g.team_id in (select id from tm)), 0),
        'pledges', (select count(*) from public.yb_pledges p where p.team_id in (select id from tm)),
        'kept', (select count(*) from public.yb_pledges p where p.team_id in (select id from tm) and p.done),
        'ayahs', coalesce((select sum(cardinality(h.ayahs)) from public.yb_hifz_marks h where h.user_id in (select user_id from mm where user_id is not null)), 0),
        'deed_days', (select count(*) from public.yb_deed_days d where d.user_id in (select user_id from mm where user_id is not null)),
        'projects', (select count(*) from public.yb_submissions s where s.team_id in (select id from tm) and s.status = 'accepted'),
        'beneficiaries', coalesce((select sum(s.beneficiaries) from public.yb_submissions s where s.team_id in (select id from tm) and s.status = 'accepted'), 0))));
end $$;

-- ---------------------------------------------------------------- 4. the parent's week, and the partner's report
create or replace function public.yb_parent_week(week date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); w date := yb_parent_week.week;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if w is null or extract(dow from w) <> 6 or w not between current_date - 63 and current_date + 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  return jsonb_build_object('ok', true, 'week', to_char(w, 'YYYY-MM-DD'),
    'theme', (select jsonb_build_object('title', x.title, 'body', x.body) from public.yb_week_themes x where x.week = w),
    'children', coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.full_name, 'team_name', t.name, 'joined', m.user_id is not null,
        'pledge', (select jsonb_build_object('field', p.field, 'body', p.body, 'done', p.done, 'parent_note', p.parent_note, 'cheered', p.cheered_at is not null)
                     from public.yb_pledges p where m.user_id is not null and p.user_id = m.user_id and p.week = w),
        'kept', (select count(*) from public.yb_pledges p where m.user_id is not null and p.user_id = m.user_id and p.done),
        'hifz', coalesce((select cardinality(h.ayahs) from public.yb_hifz_marks h where m.user_id is not null and h.user_id = m.user_id), 0),
        'deed_days', (select count(*) from public.yb_deed_days d where m.user_id is not null and d.user_id = m.user_id and d.day between w and w + 6),
        'meeting', case when exists (select 1 from public.yb_meetings g where g.team_id = m.team_id and g.week = w)
                        then exists (select 1 from public.yb_meet_present a where a.member_id = m.id and a.week = w) end,
        'held', (select count(*) from public.yb_meetings g where g.team_id = m.team_id),
        'came', (select count(*) from public.yb_meet_present a where a.member_id = m.id),
        'awards', coalesce((select jsonb_agg(a.kind order by a.created_at) from public.yb_awards a
                             where a.team_id = m.team_id and (a.member_id = m.id or a.member_id is null)
                               and a.created_at >= w::timestamptz and a.created_at < (w + 7)::timestamptz), '[]'::jsonb))
        order by m.full_name)
      from public.parent_links l join public.team_members m on m.id = l.member_id join public.teams t on t.id = m.team_id
     where l.parent_id = me), '[]'::jsonb));
end $$;

create or replace function public.yb_team_report(team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_team_report.team_id; adm boolean := public.is_admin();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (adm or public.yb_leads_team(t)) then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not public.yb_in_play(t) then return jsonb_build_object('ok', false, 'error', 'team_not_found'); end if;
  return (with mm as (select m.* from public.team_members m where m.team_id = t)
    select jsonb_build_object('ok', true, 'team_name', x.name, 'area', x.area,
      'members', (select count(*) from mm), 'joined', (select count(*) from mm where user_id is not null),
      'meetings', (select count(*) from public.yb_meetings g where g.team_id = t),
      'present', coalesce((select sum(g.present) from public.yb_meetings g where g.team_id = t), 0),
      'expected', coalesce((select sum(g.expected) from public.yb_meetings g where g.team_id = t), 0),
      'pledges', (select count(*) from public.yb_pledges p where p.team_id = t),
      'kept', (select count(*) from public.yb_pledges p where p.team_id = t and p.done),
      'ayahs', coalesce((select sum(cardinality(h.ayahs)) from public.yb_hifz_marks h where h.user_id in (select user_id from mm where user_id is not null)), 0),
      'deed_days', (select count(*) from public.yb_deed_days d where d.user_id in (select user_id from mm where user_id is not null)),
      'awards', (select count(*) from public.yb_awards a where a.team_id = t),
      'honours', case when adm or public.yb_honours_announced() then (select count(*) from public.yb_honours h where h.team_id = t) end,
      'notes', (select count(*) from public.yb_lead_notes n where n.team_id = t and n.written_at is not null),
      'pact', (select p.value from public.yb_team_pact p where p.team_id = t),
      'projects', coalesce((select jsonb_agg(jsonb_build_object('title', s.title, 'kind', s.kind, 'place', s.place, 'done_on', s.done_on,
                              'beneficiaries', s.beneficiaries, 'members_n', s.members_n) order by s.done_on nulls last, s.created_at)
                            from public.yb_submissions s where s.team_id = t and s.status = 'accepted'), '[]'::jsonb),
      'rank', case when adm or public.yb_results_published() then (select r.rank from public.yb_team_totals() r where r.team_id = t) end,
      'total', case when adm or public.yb_results_published() then (select r.total from public.yb_team_totals() r where r.team_id = t) end,
      'teams', (select count(*) from public.teams y where public.yb_in_play(y.id)))
    from public.teams x where x.id = t);
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function
  public.yb_in_play(uuid), public.yb_honours_announced(), public.yb_honour_name(public.yb_honours),
  public.yb_honour_give(text, uuid, uuid, text, text), public.yb_honour_remove(bigint), public.yb_honours_board(),
  public.yb_honours_announce(boolean), public.yb_honours_suggest(), public.yb_my_honours(), public.yb_cert_list(),
  public.yb_ceremony(), public.yb_parent_week(date), public.yb_team_report(uuid)
  from public, anon, authenticated;
grant execute on function
  public.yb_honour_give(text, uuid, uuid, text, text), public.yb_honour_remove(bigint), public.yb_honours_board(),
  public.yb_honours_announce(boolean), public.yb_honours_suggest(), public.yb_my_honours(), public.yb_cert_list(),
  public.yb_ceremony(), public.yb_parent_week(date), public.yb_team_report(uuid)
  to authenticated;
