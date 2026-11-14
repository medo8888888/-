-- Yanabee 0013: phone notifications (Web Push) for the rows of yb_notifications (SPEC 4.9, 4.10.9; owner request Nov 2026).
--
-- How it works
--   A phone that opted in (the installed app or the browser) gives its push subscription: the push service's address
--   (Google, Apple, Mozilla or Microsoft only) and two public keys. After every insert into yb_notifications (one call
--   per statement, so an announcement to everyone is one request), a trigger posts the new rows with the matching
--   subscriptions to the yb-push edge function through pg_net. The function encrypts each message for its phone and
--   sends it; a subscription the push service says is gone is pruned.
-- What is never done
--   No push without the person turning it on, on that phone. A member account (a child) can turn it on only with a
--   parent's consent on record (the paper consent on the team, or a parent's approval in 0012). The choices of
--   0011 (notification groups) already decide which rows exist, so they decide the pushes too. The message words are
--   made by the function from the kind (no review notes, no times); nothing is sent when the config is incomplete,
--   and a failure to call the function never stops the notification itself.
-- Secrets
--   yb_push_config holds the shared secret (made here, random) and the VAPID key pair (made by the function on its
--   first GET). Only the service role reads it, through yb_push_cfg. The public VAPID key is public (yb_push_key).

create table if not exists public.yb_push_subs (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  constraint yb_push_ep_chk  check (char_length(endpoint) between 20 and 800 and endpoint ~ '^https://'),
  constraint yb_push_key_chk check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$' and auth ~ '^[A-Za-z0-9_-]{16,32}$')
);
create index if not exists yb_push_user_idx on public.yb_push_subs (user_id);
alter table public.yb_push_subs enable row level security;
alter table public.yb_push_subs force row level security;
revoke all on public.yb_push_subs from anon, authenticated;

create table if not exists public.yb_push_config (
  id            int primary key default 1,
  fn_url        text,
  secret        text not null,
  vapid_public  text,
  vapid_private jsonb,
  updated_at    timestamptz not null default now(),
  constraint yb_push_cfg_one check (id = 1),
  constraint yb_push_cfg_url check (fn_url is null or fn_url ~ '^https://[a-z0-9.-]+/functions/v1/yb-push$')
);
alter table public.yb_push_config enable row level security;
alter table public.yb_push_config force row level security;
revoke all on public.yb_push_config from anon, authenticated;
insert into public.yb_push_config (id, secret)
values (1, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- only the browsers' own push services (the edge function checks again)
create or replace function public.yb_push_host_ok(endpoint text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select coalesce(substring(endpoint from '^https://([^/:?#]+)(/|$)') ~
    '^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)$', false)
$$;

-- a child may receive phone notifications only with a parent's consent on record
create or replace function public.yb_push_allowed(u uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when (select p.role::text from public.profiles p where p.id = u) is distinct from 'member' then true
              else exists (select 1 from public.team_members m where m.user_id = u and m.consent_status = 'received')
                or exists (select 1 from public.yb_seekers s where s.user_id = u and s.guardian_by is not null) end
$$;

-- ---------------------------------------------------------------- the signed-in person
create or replace function public.yb_push_subscribe(sub jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid(); ep text; k1 text; k2 text; n int;
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
  -- one phone, one owner: a phone handed to someone else follows its new owner
  insert into public.yb_push_subs as s (user_id, endpoint, p256dh, auth) values (me, ep, k1, k2)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- at most 5 phones a person: the oldest goes
  delete from public.yb_push_subs s where s.user_id = me and s.id not in (select x.id from public.yb_push_subs x where x.user_id = me order by x.created_at desc, x.id desc limit 5);
  select count(*) into n from public.yb_push_subs s where s.user_id = me;
  insert into public.audit_log (user_id, action, detail) values (me, 'push_on', jsonb_build_object('phones', n));
  return jsonb_build_object('ok', true, 'phones', n);
end $$;

create or replace function public.yb_push_unsubscribe(endpoint text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from public.yb_push_subs s where s.user_id = me and s.endpoint = yb_push_unsubscribe.endpoint;
  insert into public.audit_log (user_id, action, detail) values (me, 'push_off', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- is this phone (endpoint) on, how many phones, may I turn it on
create or replace function public.yb_push_mine(endpoint text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return jsonb_build_object('allowed', public.yb_push_allowed(me),
    'phones', (select count(*) from public.yb_push_subs s where s.user_id = me),
    'this_phone', yb_push_mine.endpoint is not null and exists (select 1 from public.yb_push_subs s where s.user_id = me and s.endpoint = yb_push_mine.endpoint),
    'ready', exists (select 1 from public.yb_push_config c where c.id = 1 and c.vapid_public is not null and c.fn_url is not null));
end $$;

-- the public VAPID key (anyone: it is what the browser needs to subscribe)
create or replace function public.yb_push_key()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.vapid_public from public.yb_push_config c where c.id = 1 and c.fn_url is not null
$$;

-- ---------------------------------------------------------------- the edge function (service role only)
create or replace function public.yb_push_cfg()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('secret', c.secret, 'vapid_public', c.vapid_public, 'vapid_private', c.vapid_private)
    from public.yb_push_config c where c.id = 1
$$;

-- the key pair is made once by the function; it is never replaced from outside
create or replace function public.yb_push_set_vapid(pub text, priv jsonb)
returns boolean
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if pub !~ '^[A-Za-z0-9_-]{80,100}$' or jsonb_typeof(priv) is distinct from 'object' or not (priv ? 'd') then return false; end if;
  update public.yb_push_config c set vapid_public = pub, vapid_private = priv, updated_at = now() where c.id = 1 and c.vapid_public is null;
  return found;
end $$;

create or replace function public.yb_push_prune(endpoints text[])
returns int
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  delete from public.yb_push_subs s where s.endpoint = any (coalesce(yb_push_prune.endpoints, '{}'));
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- the trigger
create or replace function public.yb_push_dispatch()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare c public.yb_push_config; items jsonb;
begin
  select * into c from public.yb_push_config x where x.id = 1;
  if c.fn_url is null or c.vapid_public is null then return null; end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'kind', f.kind,
                                      'data', coalesce(f.data, '{}'::jsonb) - 'note'))
    into items
    from fresh f join public.yb_push_subs s on s.user_id = f.user_id;
  if items is null then return null; end if;
  begin
    perform net.http_post(url := c.fn_url, body := jsonb_build_object('items', items),
                          headers := jsonb_build_object('Content-Type', 'application/json', 'x-yb-push', c.secret),
                          timeout_milliseconds := 8000);
  exception when others then
    null;   -- a phone notification must never stop the notification itself
  end;
  return null;
end $$;

drop trigger if exists yb_push_after_notify on public.yb_notifications;
create trigger yb_push_after_notify after insert on public.yb_notifications
  referencing new table as fresh for each statement execute function public.yb_push_dispatch();

-- ---------------------------------------------------------------- privileges
revoke all on function public.yb_push_host_ok(text), public.yb_push_allowed(uuid), public.yb_push_subscribe(jsonb), public.yb_push_unsubscribe(text),
  public.yb_push_mine(text), public.yb_push_key(), public.yb_push_cfg(), public.yb_push_set_vapid(text, jsonb), public.yb_push_prune(text[]),
  public.yb_push_dispatch() from public, anon, authenticated;
grant execute on function public.yb_push_subscribe(jsonb), public.yb_push_unsubscribe(text), public.yb_push_mine(text) to authenticated;
grant execute on function public.yb_push_key() to anon, authenticated;
grant execute on function public.yb_push_cfg(), public.yb_push_set_vapid(text, jsonb), public.yb_push_prune(text[]) to service_role;
