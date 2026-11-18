-- Yanabee 0022: each account confirms it has read the privacy notice (privacy.html), once per version.
-- The version is the notice's date (YYYY-MM-DD); a new version asks again. The admin reads how many accounts
-- have confirmed the current version, not who. The table is closed; everything goes through functions.

create table if not exists public.yb_notice_acks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  version text not null,
  at      timestamptz not null default now(),
  primary key (user_id, version),
  constraint yb_na_version check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
alter table public.yb_notice_acks enable row level security;
alter table public.yb_notice_acks force row level security;
revoke all on public.yb_notice_acks from anon, authenticated;

create or replace function public.yb_notice_state(version text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return jsonb_build_object('version', yb_notice_state.version,
    'at', (select a.at from public.yb_notice_acks a where a.user_id = auth.uid() and a.version = yb_notice_state.version));
end $$;

create or replace function public.yb_notice_ack(version text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if yb_notice_ack.version is null or yb_notice_ack.version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or yb_notice_ack.version::date > current_date + 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_data');
  end if;
  insert into public.yb_notice_acks (user_id, version) values (auth.uid(), yb_notice_ack.version)
  on conflict on constraint yb_notice_acks_pkey do nothing;
  return jsonb_build_object('ok', true, 'at', (select a.at from public.yb_notice_acks a where a.user_id = auth.uid() and a.version = yb_notice_ack.version));
end $$;

-- the admin: how many accounts confirmed this version (counts only)
create or replace function public.yb_notice_board(version text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object('version', yb_notice_board.version,
    'accounts', (select count(*) from public.profiles),
    'acked', (select count(*) from public.yb_notice_acks a where a.version = yb_notice_board.version));
end $$;

revoke all on function public.yb_notice_state(text), public.yb_notice_ack(text), public.yb_notice_board(text) from public, anon, authenticated;
grant execute on function public.yb_notice_state(text), public.yb_notice_ack(text), public.yb_notice_board(text) to authenticated;
