# SPEC — Yanabee competition app (مشروع ينابيع) · remaining build

Scope: the Yanabee site only (`content/yanabee`, `tools/yanabee`, `site/yanabee`, `supabase/`, Yanabee parts of `worker/`).
The Takamul site and `manara/` share this repo and are **out of scope**. Never touch them.

Read these first: `docs/YANABEE.md` (the rules of the static site), `docs/YANABEE_APP.md` (the accounts and tournament contract),
`supabase/README.md` (backend setup). This SPEC builds **on top of** those docs. If this SPEC and one of those docs disagree, the doc
wins, unless this SPEC says "changes". Progress checklist: `PROGRESS.md`.

---

## 1. Product vision (what "100%" means)

A phone-first Arabic (RTL) web app, installable as a PWA, that runs the first competition of مشروع ينابيع
(سورة الصف, 1 Nov 2026 – 31 Jan 2027) from start to finish:

1. **Public (no account):** the project and competition pages, the rules, the live tournament board (football groups,
   then the final round; the chess cup), announcements, and the final results once the admin publishes them.
   Public pages show team names only. **A child's name never appears in public.**
2. **Accounts, with a different screen for each role:**
   - **admin.** Only the owner grants it, with `set_admin` in Supabase. Never through sign-up, never in the demo.
     Approves teams, tracks consent, manages people, runs the tournament manager and publishes it, enters judging scores,
     posts announcements, issues certificates, exports data, and reads the audit log.
   - **leader.** Registers the team (5–7 people including the leader). Manages the roster and guardian data, the join code,
     submission and the consent switches. Sees fixtures and results, the team's own scores after publication, and a
     printable registration form.
   - **member.** Joins with the join code and their name. Sees the team, the roster names, their own consent status,
     fixtures, results and announcements.
   - **parent.** Links a child with the join code and the child's name. Sees the consent status, the team, fixtures,
     results and announcements.
3. **Demo mode (already built):** try the leader, member and parent screens with fake in-browser data. **There is no
   admin demo.**
4. **Installable phone app (PWA):** a home-screen icon, full-screen launch, an offline shell, offline reading of the
   last tournament and results seen, and an update prompt.

Not in v1:
- native app-store apps
- payments
- Web Push (optional slice 4.9). v1 notifications are an in-app inbox with a badge.
- private one-to-one chats, and chat for students (4.10.7)
- public photos. Project photos (4.10.6) live in a **private** bucket and are never shown publicly.

**Owner's requirements table (Nov 2026) → section 4.10.** It adds:
- a 5th role, **مسؤول المسابقة** (the competition officer)
- the registration statuses
- in-app notifications
- a unified schedule
- live and approved results
- project and initiative submissions
- a supervised chat
- Excel export

Where it differs from the text above, section 4.10 wins.

---

## 2. What already exists (the built foundation: do NOT rewrite it)

### 2.1 Stack
- **Generator:** Python 3 stdlib.
  - `tools/yanabee/build.py` runs the `page_*.py` modules. Each module's `build()` writes `site/yanabee/<page>.html`
    through `core.page()`.
  - It then runs `build_kb.py`, which writes the search index `data/kb.js` and the assistant knowledge
    `worker/knowledge-yanabee.js`.
  - Content comes word for word from `content/yanabee/*.txt` (parsed by `content.py`).
- **Client:**
  - Classic `defer` scripts wrapped in IIFEs. No framework, no bundler. The site must also work from `file://`
    (the local modes depend on it).
  - CSS is plain CSS. Its tokens live in `css/base.css`, and the dark theme is set through those tokens. RTL, mobile-first.
- **Backend:** Supabase (Postgres plus GoTrue), reached through `site/yanabee/js/yb-api.js` (`window.YB`, plain
  `fetch`, no SDK). The config lives in `site/yanabee/js/yb-config.js`, which is **empty today, so the site runs in
  "not connected" mode**.
- **Worker:** `worker/index.js` (shared with Takamul) serves `/api/chat` (Gemini) for «مساعد ينابيع».
  `site:"yanabee"` selects Yanabee.
- **Deploy:** the owner uploads a zip of `site/yanabee/` to Cloudflare Pages. When the zip is built, `/yanabee/` in
  `404.html` becomes `/`.
- **Tests:**
  - standalone Node `.mjs` tests (Playwright from the global install; Chromium at `/opt/pw-browsers/chromium`)
  - `check_content.py`
  - the PGlite RLS suite
  - Scripts in `package.json`: `test:yanabee`, `test:engine`, `test:tournament`, `test:account`, `test:backend`, `check`.

### 2.2 Pages (13)
- The pages: index · teams · operations · quran · learn · lab · competition · register · leaders · method ·
  tournament · account · 404.
- The feature registry `tools/yanabee/features.py` lists 14 tools, each grounded in the documents: team-builder,
  calendar-ics, ad-maker, match-day, league-table, rule-finder, judge-sheet, activity-card, partner-kit, meeting-timer,
  publish-check, pledge-cards, student-week, halaqa-council.

### 2.3 Database (`supabase/migrations/0001_yanabee.sql`: written and tested, **NOT yet applied live**)
- `user_role` enum.
- Tables: `profiles`, `teams`, `team_members`, `parent_links`, `tournament_state` (one row), `audit_log`.
- Views: `public_teams`, `my_roster`, `my_children`.
- 28 RLS policies, with RLS forced.
- RPCs: `join_team`, `link_child`, `my_team`, `set_admin` (service_role only), `set_user_role`, `approve_team`,
  `mark_consent`, `unlink_member`, `regenerate_join_code`, `publish_state`.
- Two triggers on `auth.users` (`yb_on_auth_user_created`, `yb_on_auth_user_email`).
- Tested by `supabase/tests/rls.test.mjs` (523 assertions).

### 2.4 Client modules
- `tournament-engine.js` (`window.YTour`, pure functions). Covers groups, the final round, the chess cup, the
  `res`/`order`/`sched` maps, encode/decode, `teamView` and `overview`.
- `tournament.js`: the public, manager, local and share modes, the schedule, tie decisions, print.
- `account.js`: auth plus the four role screens.
- `yb-api.js`: the Supabase client.
- `yb-demo.js`: a fake in-page Supabase used by the demo.
- `acct-nav.js`: the account dot in the nav; cleans up stale demo tokens.
- `register.js`: the paper registration form, with a local draft.
- The page and feature scripts.

### 2.5 Live infrastructure state (Nov 2026)
- The Supabase org «بنك الساعه» is on the free plan, which allows 2 projects, and both are taken. The owner chose to
  host Yanabee **inside «medo8888888's Project» (`dhjmdiqausbcyhrguinl`, Singapore)**, next to the Hour Bank app.
- Name check: no clashes.
- The first apply attempt timed out while waiting for the owner's confirmation, so **nothing was applied**.
- A clean ASCII copy of 0001 is ready. It was built by stripping comments, escaping the `yb_norm` character class, and
  dropping the backfill `insert … from auth.users`. It passes all 523 RLS assertions.

---

## 3. Laws for the builder (the existing laws, plus new ones)

1. **Do not rewrite** existing modules; extend them. New behaviour means new functions or files, or additive edits.
   Every existing test must stay green after every slice.
2. **Content law:**
   - Facts, rules and numbers come from `content/yanabee/*.txt` through `core.t()`.
   - UI chrome may be plain Arabic, but it never invents facts, amounts or rules.
   - `python3 tools/yanabee/check_content.py` must stay at 100%.
   - New facts from the owner go into the `.txt` files first (as was done for `c-format`).
3. **Privacy:**
   - No child's name, age, guardian or phone number appears in any public view, URL, log, cache, share link or
     analytics.
   - Public data means team names, plus scores and results after publication.
   - RLS and column grants enforce this, and tests prove it.
4. **Security:**
   - Only the anon/publishable key goes in the site, never the service_role key.
   - Admin is granted only through `set_admin`.
   - Every new table has RLS enabled and forced, explicit grants, and negative tests in `rls.test.mjs`.
   - RPCs are `security definer` with `set search_path = public, pg_temp`. Each checks `auth.uid()` itself and returns
     stable error keys, which `YB.errorText` maps to messages.
5. **Shared database:**
   - Yanabee lives beside the Hour Bank app, so new objects need unique Yanabee names. From now on, new tables and
     functions use the `yb_` prefix; existing names stay as they are.
   - Never `drop` or `alter` anything Yanabee didn't create.
   - Migrations are additive and idempotent, numbered `supabase/migrations/000N_*.sql`.
   - Every live apply needs the owner's confirmation in the Supabase prompt.
6. **Generated files:** rebuild with `python3 tools/yanabee/build.py`. Commit sources and regenerated outputs together
   on the working branch (`claude/epic-davinci-tcpy41`).
7. **Offline and `file://` safety:**
   - The service worker and network features are guarded: `'serviceWorker' in navigator`, and `location.protocol`
     must be http(s).
   - The site must still open from `file://`.
8. **Accessibility and mobile:**
   - no horizontal overflow at 390px
   - 44px touch targets
   - labels, aria-live and keyboard support
   - both themes
9. **Never auto-deploy.** The owner uploads the zip.

---

## 4. Remaining architecture

### 4.1 Go-live of the existing backend (no new schema)
- **Apply** `0001` to project `dhjmdiqausbcyhrguinl`; the owner confirms the prompt.
- **Post-checks (SQL):**
  - 6 tables with RLS forced
  - 28 policies
  - 3 views
  - the 2 `yb_on_auth_user_*` triggers on `auth.users`
  - `set_admin` is not executable by `authenticated` or `anon`
  - `get_advisors(security)` reviewed. Expected notices: security-definer-view for the 3 views. They are intentional
    and documented.
- **Config:** `yb-config.js` gets the Project URL and the publishable key (`sb_publishable_…`, preferred) or the legacy
  anon JWT. `yb-api.js` already supports both.
- **Auth settings (the owner, in the dashboard):**
  - Redirect URLs: add the deployed `…/account.html`.
  - Email confirmation ON.
  - Minimum password length 8.
  - Recommend custom SMTP before the public launch, because the free tier rate-limits email.
  - **Shared-project caveat:** the Hour Bank already uses this Auth, and its Site URL must not change without the owner.
    Yanabee therefore relies on a `redirect_to` sent with each request (the current `account.html` URL) for sign-up and
    recovery.
- **Hour Bank users:** the Yanabee sign-up trigger fires for every new auth user of the shared project. A new Hour Bank
  sign-up therefore also gets a Yanabee `profiles` row with role `member`. That row is harmless (no team, no access),
  and migration 0002 fixes it.
- **Owner bootstrap:** sign up on the live site, then run `select public.set_admin('<email>');` in the SQL editor.
- **Live smoke test:** `tools/yanabee/smoke-live.mjs`, run by hand, with env `YB_URL` and `YB_KEY`. It checks this flow:
  1. anon reads the public views only
  2. a leader signs up, creates a team, adds 5 members, submits
  3. the admin approves
  4. the admin publishes the state
  5. a member joins
  6. a parent links a child
  7. cleanup

### 4.2 Migration 0002: app tag and hardening (small, additive)
- **App tag:** `yb_handle_new_user` creates the Yanabee profile only when `raw_user_meta_data ->> 'app' = 'yanabee'`.
  `yb-api.signUp` adds `app:'yanabee'` to the metadata. Profiles that already exist stay.
- **Attempt limiting for `join_team` and `link_child`:**
  - New table `yb_join_attempts(user_id, at)`; RLS keeps it invisible to clients.
  - The functions return `{ok:false,error:'team_not_found'|'name_not_in_roster'|'too_many_attempts'}` as JSON instead
    of raising an exception, so the attempt row is kept.
  - Limit: 10 failed attempts per user per 15 minutes.
  - The client maps the new `too_many_attempts` key, and the demo fake mirrors it.
- **`yb_my_team_roster_status()` (leader only):** returns `member_id, joined bool, parent_linked bool` for the leader's
  own team. The leader screen shows "joined / not yet" and "guardian linked" ticks.

### 4.3 Judging and results (migration 0003, admin UI, public results)
Source rules:
- `c-score`: الحفظ 10، الفهم 15، التطبيق 45، كرة القدم 20، الشطرنج 10 = 100.
- `c-rubric`: the criteria under التطبيق.

The documents don't say how league standing turns into the 20 football points, or how chess turns into the 10 chess
points. The admin enters those points by hand, and the UI shows the league and cup podium next to the input for
reference only.

- **Tables:**
  - `yb_scores(team_id → teams, axis text check in ('hifz','fahm','tatbiq','football','chess'), points numeric
    check 0..cap, note text, updated_by, updated_at, primary key(team_id, axis))`
  - `yb_rubric(team_id, criterion text (the c-rubric keys), points 0..cap)`. When rubric rows exist, a trigger keeps
    `tatbiq` equal to their sum. Otherwise `tatbiq` is entered freely, up to 45.
  - `yb_settings(key text pk, value jsonb)`, holding `results_published` (bool) and `published_at`.
- **Caps:** one SQL function, `yb_axis_cap(axis)`, returns the caps (10/15/45/20/10). A test parses `competition.txt`
  and asserts the two match.
- **RPCs:**
  - `yb_set_score(team_id, axis, points, note)`: admin
  - `yb_set_rubric(team_id, criterion, points)`: admin
  - `yb_publish_results(bool)`: admin
  - view `yb_public_results`: team name, points per axis, total, rank. Approved teams only, and **no rows unless
    results_published = true**.
  - `yb_my_scores()`: the leader, members and parents of a team see their own team's scores after publication; the
    admin can always see them.
- **Ties** in the total are shown as ties. No tie-break is invented, because the documents are silent; the admin can
  add a note.
- **UI:**
  - Admin tab «التحكيم» in `account.js`. New module `js/judging.js` plus `css/judging.css`, loaded only for the admin
    screen.
    - a grid of teams × axes with the caps shown
    - live totals and rank
    - a rubric drawer for التطبيق
    - a publish switch with a confirmation step
  - Public: a new tab «النتائج» on `tournament.html`, hidden until results are published.
  - Leader, member and parent: their team card shows the breakdown after publication.
  - The existing `feat_judge_sheet` stays as the offline paper tool.

### 4.4 Announcements (migration 0004)
- **Table:** `yb_announcements(id, title ≤80, body ≤600, audience text check in ('all','leaders','members','parents'),
  published bool, created_at, created_by)`.
- **RLS:**
  - anon reads rows that are `published` with `audience='all'`
  - authenticated users read published rows for `all` and for their own role
  - the admin has full CRUD
- **UI:**
  - Admin tab «الإعلانات»: create, edit, publish, unpublish. A warning reminds the admin not to name children.
  - A public strip on the home and tournament pages shows the latest 3 `all` announcements.
  - Each role dashboard shows its own feed.
  - The PWA caches the last list seen for offline reading.

### 4.5 Certificates (printed in the browser; migration 0005 records them)
- **Sources:** `c-prizes`, `c-honors`, and the football and chess podiums. Amounts are never printed.
- **Table:** `yb_awards(id, kind text check in ('team_place','honor'), title text (the document title, verbatim),
  team_id, member_id null, place int null, issued_at, issued_by)`.
- **RLS:**
  - admin: CRUD
  - leader: their own team's awards
  - member and parent: the awards of their team or child
  - never public
- **UI:**
  - Admin tab «الشهادات»: pick an award and a recipient (team or member), then see an A4 landscape print preview.
    New files `js/certificates.js` and `css/certificates.css`, with a print-only body class like the other print
    modes. Batch print is supported.
  - Leaders and parents can reprint their own certificates.
  - Names appear only on the printed sheet, inside the browser of a user who is allowed to see them.

### 4.6 PWA: install as a phone app (new; the owner's request)
- **Manifest:** `site/yanabee/manifest.webmanifest`, generated by a new `tools/yanabee/build_pwa.py`, which is added to
  `build.py` after the pages. Fields:
  - `name` «مشروع ينابيع», `short_name` «ينابيع», `lang:"ar"`, `dir:"rtl"`
  - `id:"./"`, `start_url:"./index.html?source=pwa"`, `scope:"./"`. These are relative, so the app works at `/` on
    Pages and at `/yanabee/` behind the Worker.
  - `display:"standalone"`
  - `background_color` and `theme_color` from the base.css tokens
  - `icons`: 192 and 512 PNG, plus a 512 maskable icon
  - `shortcuts`: لوحة البطولة، حسابي، سجّل فريقك
- **Icons:** generated at build time from the site logo SVG by a Playwright render step. The output is committed, so
  the build doesn't depend on a browser.
  - `assets/icon-192.png`
  - `assets/icon-512.png`
  - `assets/icon-maskable-512.png`, with an 80% safe zone
  - keep `icon-180.png` for iOS
- **Head tags (`core.page`):**
  - `<link rel="manifest">`
  - `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, `apple-mobile-web-app-status-bar-style`
  - the existing `theme-color`, plus a dark-media variant
- **Service worker:** `site/yanabee/sw.js`, generated. Its version is a hash of all the precached files.
  - **Precache:** all pages, `css/*`, `js/*`, `data/*.js`, the logo, the icons and `offline.html`.
  - **HTML:** network-first, then the cache, then `offline.html`.
  - **Static assets:** cache-first, since they are versioned.
  - **Google Fonts:** stale-while-revalidate in a separate runtime cache, capped at 30 entries.
  - **Never cached:** any request to the Supabase host (auth, rest, rpc), `/api/*`, and any non-GET request.
  - `skipWaiting` runs only after the page posts `SKIP_WAITING`, which happens when the user taps «حدّث».
- **Registration (`js/pwa.js`, on every page):**
  - Registers `sw.js` only on http(s).
  - Shows an update toast, «يوجد إصدار جديد — حدّث».
  - Shows an offline/online indicator.
  - Android: catches `beforeinstallprompt` and shows a «ثبّت التطبيق» button in the footer, on the account page and
    as a home banner. The button can be dismissed, and the dismissal is remembered.
  - iOS Safari: a one-time sheet explaining «مشاركة ← إضافة إلى الشاشة الرئيسية».
  - When already installed (`display-mode: standalone`), the install UI is hidden.
- **Offline data (public data only):**
  - `tournament.js` keeps the last fetched public state in localStorage under `yanabee-public-state-v1`. When offline,
    it shows that state with «آخر تحديث … (دون اتصال)».
  - Account screens show «تحتاج اتصالًا» for actions that write.
  - Announcements and results are cached the same way.
- **`offline.html`:** a new generated page with relative paths, links to the cached pages, and a retry button.
- **Deploy:**
  - A `_headers` file in the zip: `/sw.js  Cache-Control: no-cache` and
    `/manifest.webmanifest  Content-Type: application/manifest+json`.
  - The Worker deployment serves both files from assets with the right types.
  - `404.html` keeps working.

### 4.7 Owner-blocked content decisions (no code until the owner answers)
- **WhatsApp registration number:** goes into `register.js` `WA` and the `competition.txt` placeholders.
- **Currency:** the owner chose "dollar to lira", so the lira amounts for the fee and the prizes are needed (a content
  edit in `competition.txt`).
- **Contradictions in the documents** (the site keeps showing both versions until the owner decides):
  - team size: 5–7, or 5/7, or 6–10
  - whether إنذار means a yellow card
  - how league standing turns into the 20 football points
  - how chess turns into the 10 chess points

### 4.8 Admin quality-of-life
- **Audit log viewer:** admin tab «السجل», paged, filterable by action. It reads the existing `audit_log`.
- **Tournament backup and restore:** export and import the published state as JSON (admin only), with a confirmation
  step and the existing optimistic `prev` check.
- **Users:** search, change role (existing RPC), and send a password-reset email (GoTrue recover).

### 4.9 Optional later (not required for a 100% v1)
- **Web Push for announcements and match reminders:** VAPID keys, a Supabase Edge Function and a
  `yb_push_subscriptions` table. Consent is per device, and minors never get push without guardian consent.
- **Chess player labels for admin and leader only:** a private `yb_chess_players` table, never in the public state.
- **Polish:** a custom domain, Arabic Supabase email templates, and cleanup of the unused `.lab-stub` in `lab.css`.

### 4.10 Owner's requirements table (المطلوب في التطبيق, Nov 2026)
This section supersedes the earlier sections where they overlap. Each item names its migration and slice in
`PROGRESS.md`.

**4.10.1 Registration tracking (متابعة التسجيل).**
- **Statuses:**

  | Status | Shown as |
  |---|---|
  | `draft` | مسودة |
  | `submitted` | قيد المراجعة |
  | `returned` | مطلوب تعديل (new) |
  | `approved` | معتمد |
  | `rejected` | مرفوض (kept for compatibility) |

- **Who edits when:**
  - The leader can edit and submit in `draft`, `submitted` and `returned`. A team that is `approved` or `rejected` is
    locked for the leader.
  - Policies and the RPCs `mark_consent` and `unlink_member` move from `('draft','submitted')` to the helper
    `yb_leader_can_edit()`, which covers all three editable statuses.
  - Only the leader's own submit action moves `returned` back to `submitted`.
- **Review:** new RPC `yb_review_team(team_id, decision 'approve'|'return'|'reject', note)`, open to the admin, or
  the officer of the registration competition. `approve_team` stays as it is for compatibility.
- **UI:**
  - The leader screen shows a status timeline (مسودة ← قيد المراجعة ← مطلوب تعديل/معتمد) and the reviewer's note.
  - The admin review list gets three buttons: اعتماد، إرجاع للتعديل، رفض.
- **Notification:** every status change sends one to the leader (4.10.9).

**4.10.2 Accounts and permissions (حسابات وصلاحيات).**
- **Roles:**
  - **admin** = المشرف العام. Manages permissions and gives final approval to results.
  - **officer** = مسؤول المسابقة. A new enum value: `alter type user_role add value 'officer'`.
  - leader, member and parent stay as they are.
  - **visitor** = the public pages, with no account.
- **Officer assignments:** the admin assigns an officer to one or more competitions through
  `yb_officers(user_id, competition)`.
- **Competitions:** a fixed list that comes from the documents: `football`, `chess`, `projects`, `hifz`, `fahm`,
  `registration`, plus `workshops`.
- **What an officer can do:** manage their competition's events, record live and final results, review submissions,
  and write notes. They cannot change roles, publish final rankings, or see guardian phone numbers.
- **Helper:** `yb_is_officer_of(competition)`.
- **Privacy:** member data and phone numbers stay private for every role except the admin. The leader can see their
  own team's guardian phone numbers.

**4.10.3 Unified schedule and alerts (جدول موحّد وتنبيهات).**
- **Table:** `yb_events(id, competition, kind 'match'|'round'|'workshop'|'recitation'|'other', title ≤80,
  starts_at timestamptz, place ≤80, team_ids uuid[] (empty means all teams), category text null,
  status 'scheduled'|'changed'|'cancelled', note, updated_by, updated_at)`.
- **RLS:**
  - The public can read events with no `team_ids` and approved team names only. The view `yb_public_events` holds no
    child data.
  - Authenticated users read all events.
  - The admin and the competition's officer write.
- **Notifications:** an insert, a change of time or place, or a cancellation notifies the leader, members and parents
  of every concerned team (all approved teams when `team_ids` is empty). A trigger writes the notifications.
- **UI:**
  - A new tab «الجدول» on `tournament.html` (public and signed in), filterable by team, competition and category, with
    a "my team" quick filter and an `.ics` export (reusing `feat_calendar_ics`).
  - Football fixtures that already have a planned time (`fb.sched`) appear in the same list.

**4.10.4 Draw and team ranking (القرعة وترتيب الفرق).**
- Already built: the engine's draw, groups, fixtures and tie-break rules.
- **Added:**
  - A per-stage approval flag, `state.approved.{groups,final,chess.r1,…}`. The admin approves a stage after the
    qualification is checked.
  - Approval is required before the leader's "my team" card shows **«خصمك القادم»**.
  - Until approval, the card says «بانتظار اعتماد التأهل».
- Ranking always follows the rules of each competition (football lg6; chess knockout).

**4.10.5 Live result and approved result (نتيجة مباشرة ونتيجة معتمدة).**
- **Table:** `yb_results(match_key text pk (an engine pairKey + scope), competition, home_score, away_score,
  extra jsonb (cards, a forfeit code, the chess winner), status 'live'|'final'|'approved', entered_by, entered_at,
  approved_by, approved_at)`.
- **History table:** `yb_result_history(id, match_key, before jsonb, after jsonb, by uuid, by_name text, at)`. A
  trigger writes it on every change made after `approved`, recording the editor's display name (an adult official)
  and the time.
- **Who does what:**
  - The officer sets `live` (scores update during the match), then `final`.
  - The admin sets `approved`. Only approved results feed the standings.
  - Any edit after approval needs the admin, and it is logged.
- **Board:**
  - `tournament.js` overlays `yb_results` on top of the published state. The engine stays pure, and results become
    `res` entries.
  - A live match shows a pulsing «جارية» badge. A final result shows «نهائية — بانتظار الاعتماد». An approved result
    is shown normally.
  - The public board polls every 20s while any match is live, and every 60s otherwise.

**4.10.6 Project and initiative submissions (تسليم المشاريع والمبادرات).**
- **Table:** `yb_submissions(id, team_id, kind 'project'|'initiative', title ≤80, description ≤2000, link url null,
  photo_paths text[] (max 6), status 'draft'|'submitted'|'returned'|'accepted', officer_note ≤500, grade numeric null
  (≤ the التطبيق cap; feeds `yb_scores`), updated_at)`.
- **Storage:** Supabase Storage bucket `yb-submissions`.
  - **Private**: no public URLs; read through signed URLs that last 1 hour.
  - File path: `team_id/submission_id/n.jpg`.
  - Allowed types: jpeg, png, webp. Each file is at most 3 MB, and the client downsizes it to 1600px first.
  - Storage RLS: the team leader writes; the team's leader and members, the admin, and the `projects` officer read.
- **Photos rule:** photos never appear publicly.
  - The upload screen warns the leader not to show children's faces without guardian consent.
  - The submit step asks the leader to confirm that.
- **Who does what:**
  - The leader writes, then submits.
  - The officer returns the submission with a note, or accepts it with a grade.
  - The admin approves the grade into the judging totals (4.3).

**4.10.7 Chat supervised by the admin (شات تحت إشراف الإدارة).** v1 has two parts.
- **(a) Announcements channel:** read-only for everyone signed in. This is 4.4's `yb_announcements`.
- **(b) Leaders room** `yb_chat_messages(id, room 'leaders', author uuid, body ≤500, created_at, hidden bool,
  hidden_by)`.
  - Who can read and post: leaders, officers and the admin.
  - Members and parents have **no** access in v1. Student chat stays off until the owner decides.
- **Moderation:**
  - Anyone in the room can report a message (`yb_chat_reports`).
  - The admin hides messages and can mute a user (`yb_chat_mutes`).
  - There are no private chats.
- **Contact data:** the server rejects any message that contains a phone number (regex for 7 or more digits,
  including Arabic-Indic digits) or an email address, and returns the error `contact_not_allowed`.
- **Delivery:** the room polls every 10s while open. Unread counts appear on the account tab.
- **Rate limit:** 1 message per 3s per user. Rows older than 180 days are purged by the admin.

**4.10.8 Data export (تصدير البيانات).**
- The admin downloads a real `.xlsx` workbook, built in the browser by a new pure `js/xlsx-lite.js`. It writes
  SpreadsheetML inside a stored zip with CRC32, has no dependencies, works offline, and puts RTL sheets in Arabic.
- **Sheets:**
  - الفرق
  - الأعضاء (admin only: includes guardian data)
  - الجدول
  - النتائج
  - الترتيب
  - الدرجات
  - التسليمات
- Officers can export their own competition's sheets. The export never includes chat.
- The existing CSV export stays.

**4.10.9 Notifications (the "يوصله إشعار" in items 1 and 3).**
- **Table:** `yb_notifications(id, user_id, kind, title ≤80, body ≤200, link text, read_at, created_at)`.
  - Written only by security-definer triggers and RPCs.
  - RLS: users read and mark only their own rows.
- **UI:**
  - A bell with an unread badge in the account nav button (`acct-nav.js`).
  - A «الإشعارات» list on every role screen, with polling.
- **Push:** when the PWA is installed and the user has opted in, the optional push slice (4.9) delivers the same rows
  as push messages.

---

## 5. API surface after completion (client → Supabase)

| Area | Endpoint / RPC | Who |
|---|---|---|
| Auth | GoTrue `signup` (meta `full_name`, `role`, `app:'yanabee'`*), `token`, `logout`, `recover`, `user` | anyone |
| Public | `public_teams`, `tournament_state`, `yb_public_results`*, `yb_announcements` (published, all)* | anon |
| Team | `teams`, `team_members` (RLS), `my_roster`, `my_children`, `my_team()`, `yb_my_team_roster_status()`* | leader / member / parent |
| Join | `join_team`, `link_child` (JSON errors, attempt-limited*) | member / parent |
| Admin | `approve_team`, `mark_consent`, `unlink_member`, `regenerate_join_code`, `set_user_role`, `publish_state`, `yb_set_score`*, `yb_set_rubric`*, `yb_publish_results`*, announcements CRUD*, `yb_awards` CRUD*, `audit_log` | admin |
| Results | `yb_my_scores()`* | team roles |
| Owner | `set_admin(email)` | SQL editor only |
| Review (4.10) | `yb_review_team`*, `yb_officers` CRUD* (admin) | admin / officer |
| Schedule | `yb_events` CRUD*, `yb_public_events`* | officer / admin write; everyone reads |
| Results | `yb_results` (live/final/approved)*, `yb_result_history`* | officer / admin write; everyone reads approved + live |
| Submissions | `yb_submissions`*, Storage `yb-submissions` (signed URLs)* | leader / officer / admin |
| Chat | `yb_chat_messages`*, `yb_chat_reports`*, `yb_chat_mutes`* | leaders + officers + admin |
| Inbox | `yb_notifications`*, `yb_mark_read()`* | own rows |

(* = new in this SPEC)

## 6. Frontend screens after completion
- **Public:** all 13 pages plus `offline.html`; the tournament tabs plus «النتائج» after publication; the announcement
  strip.
- **account.html:**
  - Signed-out hub: login, sign-up, demo, and why to sign up.
  - Admin tabs: الفرق، الأشخاص، لوحة البطولة، **التحكيم**، **الإعلانات**، **الشهادات**، **السجل**، تصدير.
  - Leader, member and parent screens, plus scores, awards and announcements.
- **PWA:** the install button or sheet, the update toast, the offline indicator.

## 7. Test plan (each slice adds its own tests; all must pass before a commit)
- **DB:** extend `supabase/tests/rls.test.mjs` for every new table and RPC: positive and negative cases, and a check that
  no child data leaks.
- **Client API:** extend `test-yb-api.mjs` with the new methods and error keys.
- **UI:**
  - extend `test-account.mjs`: admin tabs, role views, and a check that the demo stays admin-free
  - extend `test-tournament-ui.mjs`: the results tab and the offline cached state
  - new `test-pwa.mjs`, which serves `site/yanabee` over a local HTTP server and checks:
    - the manifest fields are valid
    - the icons exist at the right sizes
    - the service worker registers and the precache is complete
    - an offline reload shows the pages and `offline.html`
    - Supabase and `/api/*` are never cached
    - the update flow works
    - the install button logic, with a fake `beforeinstallprompt`
  - a WebKit run of the PWA test to approximate iOS.
- **Content:** `check_content.py` at 100%, plus a test that the SQL caps match the numbers in `competition.txt`.
- **Release:** the full suite plus `node tools/test-worker.mjs`; then the zip, built by a new
  `tools/yanabee/make_zip.sh`.

## 8. Build and release commands
```
python3 tools/yanabee/build.py            # all pages + kb (+ manifest/sw/icons after the PWA slice)
python3 tools/yanabee/check_content.py
npm run test:yanabee && npm run test:engine && npm run test:tournament && npm run test:account && npm run test:backend
bash tools/yanabee/make_zip.sh            # (PWA slice) -> zip for Cloudflare Pages; the owner uploads it
```
