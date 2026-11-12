# Yanabee competition app — accounts, roles, tournament management

Owner's decisions (Nov 2026): backend = **Supabase** (static site + REST/GoTrue over `fetch`, no library, no build step;
the site is still uploaded as a zip to Cloudflare Pages). **Everyone has an account** (admin, team leader, member, parent),
**each role sees a different screen**. Public visitors (no account) see the public standings only.

Tournament format (content/yanabee/competition.txt, `c-format`, `fm-football`, `fm-chess`; lg6 = points + tie-breaks):
- Football: 12 teams -> 3 groups (أ، ب، ج) of 4; each team plays 3 group matches (round robin, 6 matches per group);
  the first of each group enters the final round; final round = 3 teams, each plays 2 matches (round robin, 3 matches);
  it decides first, second, third. Points 3/1/0. Tie-breaks (lg6): goal difference, goals scored, head-to-head,
  fewer red/yellow cards, then a draw (قرعة). Administrative results (lg2): absence/late/withdrawal = 0–3 loss; unregistered player = 3–0 loss.
- Chess: cup system, one player per team (12): round 1 = 6 matches (12 -> 6 winners); round 2 = 3 matches (6 -> 3 winners);
  round 3 = round robin of the 3 (each plays 2; 3 matches); the first and second of it play the final match;
  prizes go to the three: first/second = final winner/loser, third = third of the round robin.
  Chess draws/ties are NOT in the documents: only a winner is recorded; a tie in the round-robin is flagged for the committee (lg10).
- Prize amounts for football/chess are NOT in the documents: never show amounts there.

## LAWS (all agents)
1. Content law: words that state facts/rules/numbers come from `content/yanabee/*.txt` through `core.t()`; UI chrome (buttons, labels, hints, errors) may be written in short plain Arabic but must not invent facts, rules, numbers, dates or attributions. Never edit `content/yanabee/*.txt`.
2. Privacy (the documents protect minors): **never show a child's name publicly**. Public screens show team names only.
   Names of members are visible only to: the team's leader, the member's own team (roster names), the linked parent, admins.
   Collect the minimum: full name, age, guardian name/phone. No photos. The anon key is public by design; every table has RLS;
   the `service_role` key must never appear in the site or repo.
3. No secrets in the repo. `site/yanabee/js/yb-config.js` ships as `window.YB_CONFIG = { url: '', anonKey: '' };` — empty = "backend not connected" mode (the page says so plainly; the tournament page still works as a local demo with localStorage).
4. Classic scripts only (IIFE, no modules, no libraries, no bundler), must still work from `file://` for the local mode. RTL, mobile-first (390px: no horizontal page overflow, 44px targets), dark theme via design tokens in css/base.css, calm UI, no photos, no network request except to YB_CONFIG.url when configured (never to third parties).
5. Every storage access in try/catch. Every async call shows loading and a plain Arabic error; never a blank screen.
6. Generated files (site/yanabee/*.html, data/kb.js, worker/knowledge-yanabee.js) are never committed from a feature branch (`git checkout -- site/yanabee/*.html site/yanabee/data/kb.js worker/knowledge-yanabee.js` before committing).
7. Security: never trust the client — every permission is enforced by RLS/SECURITY DEFINER functions and tested. Role `admin` can never be self-assigned.
8. Tests are part of the work (see each module).

## Roles and screens (account.html — «حسابي»; one page, views by role)
- **Signed out**: tabs دخول / حساب جديد / نسيت كلمة المرور. Sign-up fields: الاسم الكامل، البريد، كلمة المرور (8+), الدور (قائد فريق / عضو في فريق / ولي أمر — never admin), notice about guardian consent (the paper consent from c-consent still applies).
- **admin («الإدارة»)**: pending/approved teams (approve / reject / reopen), roster + consent status of each team, mark a member's paper consent «استُلمت», people list (counts by role), tournament control (link to tournament.html in manager mode), export teams CSV, print.
- **leader («قائد الفريق»)**: create the team (name, area) -> add/edit/remove members (name, age, guardian name + phone; 5–7 including the leader), the team's **join code** (give to members and parents), submit for approval, see status, schedule/results of the team, print the registration form prefilled (writes the `yanabee-reg-draft` object that js/register.js reads, then opens register.html).
- **member («عضو»)**: join a team with join code + own name (matched to the roster row added by the leader), then: my team, roster names, my consent status, my group/matches/results, my chess role if chosen.
- **parent («ولي أمر»)**: link a child with team join code + child's name, then: the child's team, consent status (pending/received), schedule/results.
- Public (no account): tournament.html standings/fixtures/bracket (team names only).
- **officer («مسؤول مسابقة»)** (migration 0002/0003; SPEC 4.10.2): the admin gives the role in «الأشخاص» and ticks the competitions it runs (`yb_officers`: registration, football, chess, projects, hifz, fahm, workshops). An officer of `registration` reviews teams in a queue (`yb_review_list`, `yb_review_roster`: names and consent ticks only — no ages, no guardian data) and decides with `yb_review_team` (approve / return with a required note / reject; only teams that are `submitted`). Other competitions show a placeholder until the schedule and live-results slices land.
- **Registration states** (owner's words): مسودة `draft` → قيد المراجعة `submitted` → مطلوب تعديل `returned` (the leader edits and resubmits) / معتمد `approved` / مرفوض `rejected`. The leader edits while draft, submitted or returned. The leader screen shows the timeline and the reviewer's note.
- **Notifications** (`yb_notifications`, kind + data, rendered in Arabic by account.js): the leader on every status change someone else made; admins and registration officers on every submission; linked members and parents on approval. A bell with the unread count on every role screen; opening it calls `yb_mark_read()`.

### Migrations after 0001
- `0002_yb_officer_role.sql` — `alter type user_role add value 'officer'` (alone: a new enum value cannot be used in the same transaction).
- `0003_yb_workflow.sql` — ASCII only. Officers, review RPCs, the `returned` status and its guard trigger (a non-admin client may only set draft/submitted), notifications, the sign-up app tag (`raw_user_meta_data.app = 'yanabee'`; the auth project is shared with another app) + `yb_ensure_profile()` for accounts without a profile, the join/link attempt limit (10 failures / 15 min; failures return `{ok:false, error}` so the attempt row survives; yb-api turns that into a failure), `yb_my_team_roster_status()`. Tests: `supabase/tests/workflow.test.mjs` (shared emulation in `harness.mjs`).

## Database (supabase/migrations/0001_yanabee.sql) — schema public
```
user_role enum: admin | leader | member | parent
profiles(id uuid pk -> auth.users on delete cascade, email text, full_name text, role user_role default 'member', phone text, created_at)
  trigger on auth.users insert -> profile; role taken from raw_user_meta_data.role ONLY if in (leader, member, parent), else 'member'.
teams(id uuid pk, name text not null (unique case-insensitive), area text, leader_id uuid -> profiles, join_code text unique (6 chars, no ambiguous chars), status text check in (draft, submitted, approved, rejected) default 'draft', admin_note text, created_at, updated_at)
team_members(id uuid pk, team_id -> teams on delete cascade, full_name text not null, age int, guardian_name text, guardian_phone text, is_leader bool default false, user_id uuid -> profiles null (set when the member joins), consent_status text check in (pending, received) default 'pending', consent_at timestamptz, unique(team_id, normalized full_name))
parent_links(parent_id -> profiles, member_id -> team_members on delete cascade, primary key(parent_id, member_id))
tournament_state(id int pk check (id = 1), state jsonb not null, updated_at timestamptz default now(), updated_by uuid)   -- ONE row; the engine's state JSON (team ids + names only, no child names)
audit_log(id bigserial, at, user_id, action text, detail jsonb)   -- admin read only; written by triggers/functions
view public_teams(id, name, area) = approved teams only (security definer view or equivalent), readable by anon
```
RLS (summary, tested): anon: select `public_teams`, select `tournament_state`. authenticated: own `profiles` row select/update (cannot change role/email); admin: everything on all tables (checked through `is_admin()` SECURITY DEFINER helper, no recursion).
leader: select/insert/update own team (cannot set status to approved/rejected; may move draft->submitted and submitted->draft), full CRUD on members of own team while team.status in (draft, submitted); cannot read other teams.
member: select own `team_members` row and the roster of the team where they are linked (full_name only is fine — expose via the table with a policy; columns guardian_* must stay hidden from members: use a view `my_roster` or column privileges), select own team.
parent: select linked children rows (+ team via `my_children` view) incl. consent_status.
tournament_state: insert/update only admin; update uses optimistic check (client sends previous `updated_at`; function `publish_state(state jsonb, prev timestamptz)` returns `{ok bool, updated_at, conflict bool}`).
Functions (SECURITY DEFINER, `set search_path = public`, execute granted only as needed):
`join_team(code text, member_name text)` (member, links auth.uid() to the roster row with the same normalized name; errors with clear Arabic-key codes: team_not_found, name_not_in_roster, already_linked),
`link_child(code text, child_name text)` (parent), `my_team()` (team id + status for the caller's role), `set_admin(email text)` (callable ONLY by postgres/service role: `revoke execute ... from public, anon, authenticated`; the owner runs it once in the Supabase SQL editor),
`approve_team(team_id uuid, ok boolean, note text)` (admin), `mark_consent(member_id uuid, received boolean)` (leader of the member's team or admin), `publish_state(...)`.
Tests: `supabase/tests/rls.test.mjs` runs the migration in PGlite (npm `@electric-sql/pglite`) with a minimal `auth` schema emulation (auth.uid(), auth.jwt(), roles anon/authenticated, `set local role`, `request.jwt.claims`) and proves every rule above, including negative cases (anon cannot read members; leader A cannot read team B; role cannot be escalated at sign-up or by profile update; join code of another team; parent cannot read other children; non-admin cannot publish state; members cannot see guardian columns).

## Client API (site/yanabee/js/yb-api.js -> `window.YB`)
Plain `fetch` to `YB_CONFIG.url` (`/auth/v1/*` GoTrue, `/rest/v1/*` PostgREST, `/rest/v1/rpc/*`) with headers `apikey: anonKey`, `Authorization: Bearer <access_token or anonKey>`. Session in localStorage `yanabee-session-v1` (access_token, refresh_token, expires_at, user), auto-refresh before expiry and on 401 once. No console secrets.
```
YB.configured -> boolean
YB.session()  -> {user:{id,email}, profile:{id,full_name,role,...}} | null   (profile cached after load)
YB.onAuth(cb) -> unsubscribe   (cb(sessionOrNull))
await YB.signUp({email, password, fullName, role}) -> {ok, needsConfirm, error}
await YB.signIn(email, password) -> {ok, error}
await YB.signOut(); await YB.resetPassword(email); await YB.updatePassword(newPassword)
await YB.loadProfile() -> profile
await YB.q(table, {select, filter:{col:'eq.value'}, order, limit, single}) -> rows|row     (PostgREST read)
await YB.insert(table, rowOrRows, {returning:true}); await YB.update(table, filter, patch); await YB.remove(table, filter)
await YB.rpc(name, args)
await YB.getState() -> {state, updated_at} | null          // tournament_state (anon allowed)
await YB.publishState(state, prevUpdatedAt) -> {ok, updated_at, conflict}
YB.poll(fn, ms) -> stop()    // visibility-aware polling (pauses when tab hidden; default 15000)
YB.errorText(err) -> short Arabic message for known codes (network, invalid_credentials, email_not_confirmed, user_already_exists, over_request_rate_limit, team_not_found, name_not_in_roster, already_linked, permission_denied, conflict...)
```
Unit tests with a mocked `fetch` (node) cover: configured/unconfigured, sign-up/sign-in/refresh/sign-out flows, 401 refresh-retry, headers, error mapping, poll pause, publishState conflict.

## Tournament engine (site/yanabee/js/tournament-engine.js -> `window.YTour`, also `module.exports` for node tests)
Pure functions, no DOM, immutable (every mutator returns a NEW state). `rng` is injectable (default Math.random).
State v1 (JSON, small enough for a share link): 
```
{ v:1, updated:'ISO'|'', 
  teams:[{id,name,chess?}],            // 12 expected; `chess` = player label, shown only on manager/leader screens, never public
  groups: null | [[id,id,id,id],[..],[..]],   // names أ ب ج are UI chrome
  fb:{ res:{ [pairKey]:{a,b,sa,sb,ca,cb,date,time,note} }, order:{ [scope]:[ids] } },   // scope 'g0','g1','g2','final'; order = committee/draw decision for unresolved ties
  chess:{ r1:[{a,b,w}], r2:[{a,b,w}], rr:{res:{[pairKey]:{a,b,w}}, order:null|[ids]}, final:{w:null|id} } }
pairKey(a,b) = [a,b].sort().join('|')
```
API: `emptyState()`, `normalize(s)`, `pairKey`, `setTeams(s,teams)`, `drawGroups(s,rng)`, `moveTeam(s,teamId,groupIndex)` (swap to keep 4/4/4), `groupsValid(s)`, `roundRobin(ids)` -> rounds (for 4: 3 rounds × 2 matches; for 3: 3 matches in 3 rounds), `table(ids,results,opts)` -> rows {id,p,w,d,l,gf,ga,gd,pts,cards,rank,flag:null|'committee'|'draw',notes[]} with lg6 tie-breaks, `football(s)` -> {groups:[{index,name,teams,rounds:[{round,matches:[{key,a,b,res|null}]}],table,complete,played,total}], qualifiers:[ids]|null, final:{teams,rounds,table,complete,played,total}|null, podium:[id,id,id]|null, played, total, pending:[{scope,reason}]}, `setResult(s,{a,b,sa,sb,ca,cb,date,time,note})` (finds scope by teams; validates ints >= 0), `clearResult(s,a,b)`, `adminResult(s,a,b,kind,sideAtFault)` (kind 'absent'|'late'|'withdraw' => 0–3 against the side; 'unregistered' => 3–0 against), `setOrder(s,scope,ids)`, `draw(s,scope,rng)` (random order for flagged-draw ties, stored), `chess(s)` -> {r1:{matches,complete},r2:{...},rr:{matches,table,complete,tied},final:{a,b,w}|null,podium:[1st,2nd,3rd]|null,played,total}, `drawPairs(ids,rng)`, `setChessPairs(s,'r1'|'r2',pairs)`, `setChessWinner(s,'r1'|'r2',index,id)`, `setChessRR(s,a,b,w)`, `setChessFinal(s,w)`, `setChessOrder(s,ids)`, `teamView(s,teamId)` -> {group,position,table row,matches:[{opponent,result,date,time,round,stage}],next,status:'متأهل'|..., chess:{stage,...}} (statuses as data keys, Arabic text is UI), `overview(s)` -> {phase keys with done flags, played/total, podiums}, `encode(s)` / `decode(str)` (base64url of JSON, versioned), `validate(s)` -> [problems].
Unit tests (node): `tools/yanabee/test-tournament-engine.mjs` — round-robin counts (4 -> 6 matches, each team 3; 3 -> 3 matches, each team 2), standings (3/1/0), every tie-break step incl. head-to-head among 3 tied, cards, flagged draw, forfeits 0–3 / 3–0, qualifiers only when a group is complete and unambiguous, final round, chess flow 12->6->3->rr->final, podium, encode/decode round-trip, immutability, bad input rejected, 10,000-iteration randomized self-consistency (points conservation, ranks are a permutation).

## UI modules (phase 2)
- `site/yanabee/account.html` (`tools/yanabee/page_account.py`, `js/account.js`, `css/account.css`) — screens above.
- `site/yanabee/tournament.html` (`tools/yanabee/page_tournament.py`, `js/tournament.js`, `css/tournament.css`) — public view for all; manager controls only when `YB.session().profile.role==='admin'` (or local demo mode when the backend is not configured); tabs نظرة عامة / كرة القدم / الشطرنج / فريقي / الإعداد(manager); share link (`#v=` read-only snapshot), JSON export/import, print.
Nav: an account icon button in the top bar (`href=account.html`, shows the user's initial when signed in) and «حسابي» in the sheet/footer; `tournament.html` = «لوحة البطولة».

## Setup guide for the owner (supabase/README.md, Arabic)
1) create a Supabase project, 2) SQL editor: paste `0001_yanabee.sql`, 3) Authentication > URL configuration: Site URL = the Pages URL; keep email confirmation ON, 4) copy Project URL + anon key into `site/yanabee/js/yb-config.js` (or send them to Claude), 5) sign up on the site, then in the SQL editor run `select set_admin('your@email');`, 6) rebuild the zip. Free tier notes: auth email rate limits -> configure custom SMTP before the public launch.
