-- Yanabee 0018: appeals (competition.txt lg7 and lg8; owner, Nov 2026: "why wasn't this added, see what is in the folder").
--   lg7: the team's leader files a written appeal within 24 hours of the end of the match; it names the match, the
--        incident and the evidence at hand; it is decided within 48 hours by the refereeing committee and the
--        competition's management.
--   lg8: refereeing and the review of appeals are kept apart, so the decision is the admin's, not the officer's
--        who recorded the result.
-- An appeal is text only (no files). The team's leader files and reads their own; the admin reads all and decides
-- with a written reason. Nothing changes a result automatically: the admin corrects the score in the results if
-- the decision calls for it.

create table if not exists public.yb_appeals (
  id          bigint generated always as identity primary key,
  team_id     uuid not null references public.teams (id) on delete cascade,
  comp        text not null,
  match_label text not null,
  ended_at    timestamptz not null,
  incident    text not null,
  evidence    text,
  status      text not null default 'open',
  decision    text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_by  uuid references public.profiles (id) on delete set null,
  decided_at  timestamptz,
  constraint yb_ap_comp check (comp in ('football', 'chess', 'other')),
  constraint yb_ap_label check (char_length(match_label) between 3 and 120),
  constraint yb_ap_incident check (char_length(incident) between 10 and 600),
  constraint yb_ap_evidence check (evidence is null or char_length(evidence) <= 300),
  constraint yb_ap_status check (status in ('open', 'accepted', 'rejected')),
  constraint yb_ap_decision check (decision is null or char_length(decision) between 5 and 400)
);
create index if not exists yb_appeals_team_idx on public.yb_appeals (team_id, created_at desc);
alter table public.yb_appeals enable row level security;
alter table public.yb_appeals force row level security;
revoke all on public.yb_appeals from anon, authenticated;

create or replace function public.yb_appeal_view(a public.yb_appeals)
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', a.id, 'team_id', a.team_id, 'comp', a.comp, 'match', a.match_label, 'ended_at', a.ended_at,
    'incident', a.incident, 'evidence', a.evidence, 'status', a.status, 'decision', a.decision,
    'created_at', a.created_at, 'due_at', a.created_at + interval '48 hours', 'decided_at', a.decided_at)
$$;

-- the team's leader, within 24 hours of the end of the match
create or replace function public.yb_appeal_file(team_id uuid, comp text, match_label text, ended_at timestamptz, incident text, evidence text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_appeal_file.team_id; e timestamptz := yb_appeal_file.ended_at; nm text; new_id bigint;
  lb text := btrim(regexp_replace(coalesce(yb_appeal_file.match_label, ''), '\s+', ' ', 'g'));
  inc text := btrim(regexp_replace(coalesce(yb_appeal_file.incident, ''), '\s+', ' ', 'g'));
  ev text := nullif(btrim(regexp_replace(coalesce(yb_appeal_file.evidence, ''), '\s+', ' ', 'g')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select x.name into nm from public.teams x where x.id = t and x.leader_id = auth.uid();
  if nm is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  if yb_appeal_file.comp not in ('football', 'chess', 'other') or char_length(lb) not between 3 and 120
     or char_length(inc) not between 10 and 600 or char_length(coalesce(ev, '')) > 300 or e is null or e > now() + interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  if e < now() - interval '24 hours' then return jsonb_build_object('ok', false, 'error', 'too_late'); end if;
  if public.yb_has_contact(lb) or public.yb_has_contact(inc) or public.yb_has_contact(coalesce(ev, '')) then
    return jsonb_build_object('ok', false, 'error', 'contact_not_allowed');
  end if;
  if (select count(*) from public.yb_appeals a where a.team_id = t and a.status = 'open') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into public.yb_appeals (team_id, comp, match_label, ended_at, incident, evidence, created_by)
  values (t, yb_appeal_file.comp, lb, e, inc, ev, auth.uid()) returning id into new_id;
  perform public.yb_notify(array(select p.id from public.profiles p where p.role::text = 'admin'), 'appeal_new', jsonb_build_object('team_name', nm));
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'appeal_file', jsonb_build_object('team_id', t, 'appeal_id', new_id));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.yb_appeals_mine(team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare t uuid := yb_appeals_mine.team_id;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid()) then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(public.yb_appeal_view(a) order by a.created_at desc) from public.yb_appeals a where a.team_id = t), '[]'::jsonb);
end $$;

create or replace function public.yb_appeals_admin()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(public.yb_appeal_view(a) || jsonb_build_object('team_name', t.name) order by (a.status = 'open') desc, a.created_at desc)
    from (select * from public.yb_appeals order by created_at desc limit 100) a join public.teams t on t.id = a.team_id), '[]'::jsonb);
end $$;

-- the admin decides, with a written reason the leader reads
create or replace function public.yb_appeal_decide(id bigint, accept boolean, decision text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare a public.yb_appeals; d text := btrim(regexp_replace(coalesce(yb_appeal_decide.decision, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into a from public.yb_appeals x where x.id = yb_appeal_decide.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if a.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'already_decided'); end if;
  if yb_appeal_decide.accept is null or char_length(d) not between 5 and 400 then return jsonb_build_object('ok', false, 'error', 'invalid_data'); end if;
  if public.yb_has_contact(d) then return jsonb_build_object('ok', false, 'error', 'contact_not_allowed'); end if;
  update public.yb_appeals x set status = case when yb_appeal_decide.accept then 'accepted' else 'rejected' end, decision = d, decided_by = auth.uid(), decided_at = now()
   where x.id = a.id;
  perform public.yb_notify(array(select t.leader_id from public.teams t where t.id = a.team_id), 'appeal_decided',
    jsonb_build_object('team_name', (select t.name from public.teams t where t.id = a.team_id), 'accepted', yb_appeal_decide.accept));
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'appeal_decide', jsonb_build_object('appeal_id', a.id, 'accepted', yb_appeal_decide.accept));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.yb_appeal_view(public.yb_appeals), public.yb_appeal_file(uuid, text, text, timestamptz, text, text), public.yb_appeals_mine(uuid),
  public.yb_appeals_admin(), public.yb_appeal_decide(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.yb_appeal_file(uuid, text, text, timestamptz, text, text), public.yb_appeals_mine(uuid),
  public.yb_appeals_admin(), public.yb_appeal_decide(bigint, boolean, text) to authenticated;
