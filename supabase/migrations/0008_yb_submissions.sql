-- Yanabee 0008: project and initiative submissions, with private photos.
--
-- competition.txt f-apply: each team applies the values of surat as-Saff in the
-- family, the neighbourhood or the school / university, and documents it; c-card
-- cd2 / cd5: the target value, results and lessons learned; cd4: no photo or
-- data of a minor is published without the needed consents.
--
-- yb_submissions: one row per project or activity. The team's leader saves it
-- (yb_save_submission) while it is 'submitted' or 'returned'; the projects
-- officer or the admin decides (yb_review_submission): accepted / returned (with
-- a note) / rejected. The team's people (leader, joined members, linked parents)
-- and the projects staff read it; nobody else.
--
-- Photos live in the PRIVATE storage bucket 'yanabee-submissions' under
-- <team_id>/<submission_id>/<file>. Never public: they are read through short
-- signed links by the same people who may read the submission. Only the team's
-- leader uploads (approved team, at most 6 files per submission, images up to
-- 5 MB); the client re-encodes every photo (smaller, no camera location).
-- ASCII only.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.yb_submissions (
  id            uuid primary key,
  team_id       uuid not null references public.teams (id) on delete cascade,
  kind          text not null,
  title         text not null,
  value_text    text,
  place         text not null,
  done_on       date,
  summary       text not null,
  results       text,
  members_n     int,
  beneficiaries int,
  photos        text[] not null default '{}',
  status        text not null default 'submitted',
  review_note   text,
  submitted_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  constraint yb_sub_kind_chk    check (kind in ('project', 'activity')),
  constraint yb_sub_place_chk   check (place in ('family', 'neighborhood', 'school')),
  constraint yb_sub_status_chk  check (status in ('submitted', 'returned', 'accepted', 'rejected')),
  constraint yb_sub_title_len   check (char_length(btrim(title)) between 3 and 120),
  constraint yb_sub_value_len   check (value_text is null or char_length(value_text) <= 120),
  constraint yb_sub_summary_len check (char_length(btrim(summary)) between 10 and 2000),
  constraint yb_sub_results_len check (results is null or char_length(results) <= 2000),
  constraint yb_sub_note_len    check (review_note is null or char_length(review_note) <= 500),
  constraint yb_sub_counts_chk  check ((members_n is null or members_n between 0 and 7) and (beneficiaries is null or beneficiaries between 0 and 100000)),
  constraint yb_sub_photos_chk  check (cardinality(photos) <= 6)
);
create index if not exists yb_submissions_team_idx on public.yb_submissions (team_id, created_at desc);
alter table public.yb_submissions enable row level security;
alter table public.yb_submissions force row level security;

-- ---------------------------------------------------------------------------
-- 2. Who is who
-- ---------------------------------------------------------------------------
-- the people of a team: its leader, joined members, linked parents
create or replace function public.yb_is_team_person(t uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select t in (select public.yb_my_team_ids())
      or exists (select 1 from public.parent_links l join public.team_members m on m.id = l.member_id
                  where l.parent_id = auth.uid() and m.team_id = t)
$$;

-- a text that may hold a uuid (storage paths come from the client)
create or replace function public.yb_try_uuid(txt text)
returns uuid
language plpgsql immutable
set search_path = public, pg_temp
as $$
begin
  return txt::uuid;
exception when others then
  return null;
end $$;

drop policy if exists yb_sub_select on public.yb_submissions;
create policy yb_sub_select on public.yb_submissions for select to authenticated
  using ((select public.yb_can_manage('projects')) or (select public.yb_is_team_person(team_id)));

-- ---------------------------------------------------------------------------
-- 3. Saving and reviewing
-- ---------------------------------------------------------------------------
-- p = {kind, title, value_text?, place, done_on?, summary, results?, members_n?, beneficiaries?, photos: [path]}
-- id: chosen by the client (the photo folder needs it before the first save).
create or replace function public.yb_save_submission(id uuid, team_id uuid, p jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  sid  uuid := yb_save_submission.id;
  tid  uuid := yb_save_submission.team_id;
  cur  public.yb_submissions%rowtype;
  ph   text[];
  pfx  text;
  x    text;
  d    date;
  staff uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if sid is null or tid is null or p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_argument'; end if;
  if not exists (select 1 from public.teams t where t.id = tid and t.leader_id = auth.uid()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teams t where t.id = tid and t.status = 'approved') then
    return jsonb_build_object('ok', false, 'error', 'team_not_approved');
  end if;
  select * into cur from public.yb_submissions s where s.id = sid for update;
  if found and cur.team_id <> tid then raise exception 'permission_denied' using errcode = '42501'; end if;
  if found and cur.status not in ('submitted', 'returned') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  if not found and (select count(*) from public.yb_submissions s where s.team_id = tid) >= 12 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  -- photos: paths inside this submission's own folder, uploaded already, at most 6
  pfx := tid::text || '/' || sid::text || '/';
  ph := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p -> 'photos') = 'array' then p -> 'photos' else '[]'::jsonb end)), '{}');
  if cardinality(ph) > 6 then return jsonb_build_object('ok', false, 'error', 'too_many_photos'); end if;
  foreach x in array ph loop
    if left(x, char_length(pfx)) <> pfx or position('/' in substr(x, char_length(pfx) + 1)) > 0 or char_length(x) > 200 then
      return jsonb_build_object('ok', false, 'error', 'bad_photo');
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'yanabee-submissions' and o.name = x) then
      return jsonb_build_object('ok', false, 'error', 'bad_photo');
    end if;
  end loop;
  begin
    d := nullif(p ->> 'done_on', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'bad_date');
  end;
  if d is not null and (d < date '2026-11-01' or d > current_date + 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_date');
  end if;
  begin
    insert into public.yb_submissions as s (id, team_id, kind, title, value_text, place, done_on, summary, results, members_n,
                                            beneficiaries, photos, status, submitted_by, updated_at)
    values (sid, tid, p ->> 'kind', btrim(coalesce(p ->> 'title', '')), nullif(btrim(coalesce(p ->> 'value_text', '')), ''), p ->> 'place', d,
            btrim(coalesce(p ->> 'summary', '')), nullif(btrim(coalesce(p ->> 'results', '')), ''),
            (p ->> 'members_n')::int, (p ->> 'beneficiaries')::int, ph, 'submitted', auth.uid(), now())
    on conflict on constraint yb_submissions_pkey do update
       set kind = excluded.kind, title = excluded.title, value_text = excluded.value_text, place = excluded.place,
           done_on = excluded.done_on, summary = excluded.summary, results = excluded.results, members_n = excluded.members_n,
           beneficiaries = excluded.beneficiaries, photos = excluded.photos, status = 'submitted', submitted_by = auth.uid(),
           updated_at = now();
  exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end;
  -- files dropped from the list are removed by the client through the Storage API
  -- (Supabase refuses direct deletes from storage.objects)
  select coalesce(array_agg(distinct u), '{}') into staff from (
    select p2.id as u from public.profiles p2 where p2.role = 'admin'
    union select o.user_id from public.yb_officers o where o.competition = 'projects') z;
  perform public.yb_notify(staff, 'submission_new',
    jsonb_build_object('team_id', tid, 'team_name', (select t.name from public.teams t where t.id = tid), 'title', left(btrim(p ->> 'title'), 80)));
  return jsonb_build_object('ok', true, 'id', sid, 'status', 'submitted');
end $$;

-- the leader withdraws a submission that is not decided yet
create or replace function public.yb_delete_submission(id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare cur public.yb_submissions%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into cur from public.yb_submissions s where s.id = yb_delete_submission.id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not (public.is_admin() or exists (select 1 from public.teams t where t.id = cur.team_id and t.leader_id = auth.uid())) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if cur.status not in ('submitted', 'returned') and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;
  -- the client removes the photos first through the Storage API (delete policy below)
  delete from public.yb_submissions s where s.id = cur.id;
  return jsonb_build_object('ok', true);
end $$;

-- decision: 'accept' | 'return' (needs a note) | 'reject'
create or replace function public.yb_review_submission(id uuid, decision text, note text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  cur public.yb_submissions%rowtype;
  st  text;
  nt  text := nullif(btrim(coalesce(yb_review_submission.note, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_can_manage('projects') then raise exception 'permission_denied' using errcode = '42501'; end if;
  st := case yb_review_submission.decision when 'accept' then 'accepted' when 'return' then 'returned' when 'reject' then 'rejected' end;
  if st is null then raise exception 'invalid_argument'; end if;
  if st = 'returned' and nt is null then raise exception 'note_required'; end if;
  if nt is not null and char_length(nt) > 500 then raise exception 'invalid_argument'; end if;
  select * into cur from public.yb_submissions s where s.id = yb_review_submission.id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if cur.status <> 'submitted' and not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'invalid_status'); end if;
  update public.yb_submissions s set status = st, review_note = nt, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where s.id = cur.id;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'submission_review', jsonb_build_object('submission_id', cur.id, 'team_id', cur.team_id, 'to', st));
  perform public.yb_notify(public.yb_team_people(array[cur.team_id]), 'submission_reviewed',
    jsonb_build_object('team_id', cur.team_id, 'title', left(cur.title, 80), 'status', st, 'note', nt));
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- the projects staff: every submission with its team name, newest waiting first
create or replace function public.yb_submissions_queue()
returns table (id uuid, team_id uuid, team_name text, kind text, title text, value_text text, place text, done_on date,
               summary text, results text, members_n int, beneficiaries int, photos text[], status text, review_note text,
               created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.yb_can_manage('projects') then raise exception 'permission_denied' using errcode = '42501'; end if;
  return query
    select s.id, s.team_id, t.name, s.kind, s.title, s.value_text, s.place, s.done_on, s.summary, s.results, s.members_n,
           s.beneficiaries, s.photos, s.status, s.review_note, s.created_at, s.updated_at
      from public.yb_submissions s join public.teams t on t.id = s.team_id
     order by case s.status when 'submitted' then 0 when 'returned' then 1 else 2 end, s.updated_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The private bucket and its rules
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yanabee-submissions', 'yanabee-submissions', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- may the caller put (or remove) a file at this path? <team>/<submission>/<file>: leader of an approved
-- team, submission new or still open; at most 6 files in the folder (72 for the team) for a new file
create or replace function public.yb_sub_can_write(path text, adding boolean)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(coalesce(path, ''), '/');
  t uuid; s uuid; st text; tt uuid;
begin
  if cardinality(parts) <> 3 or parts[3] = '' or char_length(path) > 200 then return false; end if;
  t := public.yb_try_uuid(parts[1]); s := public.yb_try_uuid(parts[2]);
  if t is null or s is null then return false; end if;
  if not exists (select 1 from public.teams x where x.id = t and x.leader_id = auth.uid() and x.status = 'approved') then return false; end if;
  select y.status, y.team_id into st, tt from public.yb_submissions y where y.id = s;
  if found and (tt <> t or st not in ('submitted', 'returned')) then return false; end if;
  if adding and (select count(*) from storage.objects o
                  where o.bucket_id = 'yanabee-submissions' and left(o.name, char_length(parts[1] || '/' || parts[2] || '/')) = parts[1] || '/' || parts[2] || '/') >= 6 then
    return false;
  end if;
  -- and at most 72 files for the whole team (12 submissions x 6)
  if adding and (select count(*) from storage.objects o
                  where o.bucket_id = 'yanabee-submissions' and left(o.name, char_length(parts[1] || '/')) = parts[1] || '/') >= 72 then
    return false;
  end if;
  return true;
end $$;

-- may the caller read this file? the team's people and the projects staff
create or replace function public.yb_sub_can_read(path text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.yb_can_manage('projects')
      or coalesce(public.yb_is_team_person(public.yb_try_uuid(split_part(coalesce(path, ''), '/', 1))), false)
$$;

drop policy if exists yb_sub_obj_insert on storage.objects;
create policy yb_sub_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'yanabee-submissions' and (select public.yb_sub_can_write(name, true)));
drop policy if exists yb_sub_obj_select on storage.objects;
create policy yb_sub_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'yanabee-submissions' and (select public.yb_sub_can_read(name)));
drop policy if exists yb_sub_obj_delete on storage.objects;
create policy yb_sub_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'yanabee-submissions' and (select public.yb_sub_can_write(name, false)));

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
revoke all on public.yb_submissions from public, anon, authenticated;
revoke all on function
  public.yb_is_team_person(uuid), public.yb_try_uuid(text),
  public.yb_save_submission(uuid, uuid, jsonb), public.yb_delete_submission(uuid),
  public.yb_review_submission(uuid, text, text), public.yb_submissions_queue(),
  public.yb_sub_can_write(text, boolean), public.yb_sub_can_read(text)
  from public, anon, authenticated;

grant select on public.yb_submissions to authenticated;
-- used inside policies (run as the caller)
grant execute on function public.yb_is_team_person(uuid), public.yb_sub_can_write(text, boolean), public.yb_sub_can_read(text) to authenticated;
grant execute on function
  public.yb_save_submission(uuid, uuid, jsonb), public.yb_delete_submission(uuid),
  public.yb_review_submission(uuid, text, text), public.yb_submissions_queue()
  to authenticated;

comment on table public.yb_submissions is 'Projects and activities of the teams. The team and the projects staff only; photos in the private bucket yanabee-submissions.';
