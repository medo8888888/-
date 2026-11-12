# PROGRESS — Yanabee competition app

Blueprint: `SPEC.md`. Each `[ ]` item is one vertical slice, built in the order **Database → Backend API → Frontend
UI → Tests**. A slice is done only when the full suite is green and the site is rebuilt. Slices marked 🔒 need
something from the owner first.

## Built (foundation: do not rewrite)

1. [x] Content: 9 documents transcribed word for word into `content/yanabee/*.txt`, enforced by `check_content.py`. The owner's tournament format (`c-format`) was added.
2. [x] Static site generator (`tools/yanabee`) and 13 pages, RTL, mobile-first, with light and dark themes.
3. [x] 14 tools grounded in the documents (feature registry), the search index, and the «مساعد ينابيع» assistant through the Worker.
4. [x] Registration: the paper form, the consent text, and a local draft (`register.html`).
5. [x] Tournament engine `YTour`: groups of 4, the 3-team final round, the chess cup (6 → 3 → round-robin → final), tie-breaks from lg6, schedules, share links. Unit-tested.
6. [x] Tournament board `tournament.html`: public, manager, local and share modes, the match plan (date and time), tie decisions, my team, print.
7. [x] Database schema 0001: 6 tables, 3 views, 28 RLS policies, 10 RPCs, the auth triggers. 523 RLS assertions with PGlite.
8. [x] Client API `yb-api.js` (GoTrue and PostgREST over fetch, publishable or anon key), unit-tested.
9. [x] Accounts `account.html`: sign up, log in, recovery, and a different screen for the admin, leader, member and parent. Admin is granted only by the owner.
10. [x] Demo mode: leader, member and parent with fake in-browser data, no admin, and a "why sign up" panel when signed out.
11. [x] Nav account button and dot, the docs (`YANABEE.md`, `YANABEE_APP.md`, `supabase/README.md`), and the npm test scripts.

## Remaining vertical slices

Order changed after the owner's requirements table (SPEC 4.10). All the database work comes first and is tested
offline with PGlite, then goes live in one apply (slice 20).

12. [x] **Roles, registration workflow, inbox** (SPEC 4.10.1, 4.10.2, 4.10.9, 4.2).
    - DB: `0002_yb_officer_role.sql` adds the `officer` role (it needs its own migration). `0003_yb_workflow.sql` adds `yb_officers`, the `returned` status and a status guard, `yb_review_team`, `yb_review_list`, `yb_review_roster`, `yb_notifications` with the status trigger, the `app:'yanabee'` tag with `yb_ensure_profile`, `yb_join_attempts` (10 per 15 minutes; join and link answer `{ok:false, error}`), and `yb_my_team_roster_status`. Both files are ASCII only.
    - API: `yb-api` sends the app tag, creates a missing profile only on a real "no rows" answer, maps `{ok:false, error}` answers to failures, and has new error texts.
    - UI: the owner's status words, the leader's timeline, return-with-note and resubmit; the admin's اعتماد / إرجاع للتعديل / رفض; officer competitions in «الأشخاص»; the officer screen with its review queue; the notifications bell and inbox. In the demo, the app plays the reviewer.
    - Tests: `supabase/tests/workflow.test.mjs` 129/129 (shared `harness.mjs`), `rls.test.mjs` 523/523, `test-yb-api` 438/438, `test-account` 499/499.
13. [x] **Unified schedule, alerts and attendance** (SPEC 4.10.3, 4.11). **Live since 12 Nov 2026.**
    - DB: `0004_yb_schedule.sql` adds `yb_events` and `yb_attendance`, alerts on add, change and cancel, `yb_rsvp` and `yb_mark_attendance`. The public sees only dates for every team or dates between approved teams. Applied live; the live check passed (RLS forced, anon read-only).
    - UI: the «الجدول» tab on the tournament page (filters by team, competition and category, "my team only", changed and cancelled marks, `.ics` download, plus football fixtures planned on the board). A dates manager for the admin (tab «الجدول») and for officers of their competitions. Attendance check-in next to the lg2 rules, word for word. «المواعيد القادمة» with سنحضر / نعتذر for leaders, read-only for members and parents. Inbox texts for date alerts. Sample dates in the demo.
    - Tests: `schedule.test.mjs` 79, `tournament-ui` 245, `account` 517, all backend suites green.
13b. [x] **Online registration without an account, and the fee checklist** (owner request after comparing another build). **Live since 12 Nov 2026** (0005 applied; live check: anon can count, register and track only; fee, claim, details and helpers closed; RLS forced; Hour Bank untouched).
    - DB: `0005_yb_register_fee.sql`. `yb_register_team` (anon or signed in; rate limits per address and overall; duplicate sends return the same request number), `yb_track_request` (request number + the leader's phone → the checklist, counts and statuses only, lock after 5 wrong phones per number), `yb_claim_team` (a leader account takes over a team sent from the form), `yb_team_checklist`, `yb_registration_detail` (reviewers and the team's leader only), `teams.fee_status` with `yb_set_fee` and a `team_fee` alert, `yb_registration_stats` (public counts). Private details in `yb_registrations`; no child name or phone ever reaches the public answers.
    - UI: «أرسل التسجيل» on the register page with the request number (copy, WhatsApp to the official number, «أنشئ حساب قائد واربط الفريق»), «تابع طلبك» with the shared checklist (`js/yb-checklist.js`: sent, fee, consents, approval, draw group, next date, progress ring), the leader's checklist card and claim box on the account page, the fee desk and «تفاصيل الاستمارة» for the admin and the registration officer, the registered-teams count in the status strip while registration is open.
    - Tests: `register.test.mjs` 110, `test-register-online` 57, `test-account` 540.
13c. [x] **The reserve list after 12 teams, and member roles** (owner request).
    - DB: `0006_yb_waitlist_roles.sql`. The first 12 teams sent for review take places; later ones join the reserve list in the order they arrive; a team keeps its place while it edits; a rejected or deleted team frees its place and the first reserve team moves up by itself (inbox `team_seated`); the admin can move teams by hand (`yb_set_waitlist`). Roles on members (main reciter, reserve, chess player, coordinator): filled from the online form, set by the leader while the team is editable (`yb_set_roles`), lists for the hifz / fahm and chess officers (`yb_role_list`). Never public.
    - UI: role badges on the member cards, the leader's «المرشحون والأدوار» card, the officers' «المرشحون من الفرق», reserve chips and «امنحه مكانًا الآن» / «انقله إلى قائمة الاحتياط» for the admin, two new checklist steps (place, roles), the strip says when the 12 places are full.
    - Tests: `waitlist.test.mjs` 74, `test-register-online` 62, `test-account` 556.
14. [ ] **Live and approved results, plus stage approval** (also records **goal scorers** and the **«روح الفريق»** badge per match, which feed SPEC 4.12) (SPEC 4.10.4, 4.10.5).
    - DB: migration 0005 with `yb_results` and `yb_result_history`, and the approval rules.
    - API: result methods and polling.
    - UI: the officer's live score entry, the «جارية» and «نهائية» badges, the admin approve queue, the correction log, the "next opponent" card shown only after stage approval; the **big-screen display** `?screen=1` (SPEC 4.11).
    - Tests: engine overlay, history written on every post-approval edit, only approved results feed standings.
15. [ ] **Project and initiative submissions** (SPEC 4.10.6).
    - DB: migration 0006 with `yb_submissions`, the private Storage bucket, and Storage RLS.
    - API: upload (client resize), signed URLs.
    - UI: the leader's submit form with the photos warning and confirmation; the officer's review (return with a note, or accept with a grade).
    - Tests: RLS and Storage (never public, cross-team denied), size and type limits.
16. [ ] **Judging and final results** (SPEC 4.3; submission grades feed التطبيق).
    - DB: migration 0007 with `yb_scores`, `yb_rubric`, `yb_settings`, `yb_public_results`.
    - UI: the «التحكيم» grid, the public «النتائج» tab, the team score cards.
    - Tests: caps equal `competition.txt`; nothing is visible before publication.
17. [ ] **Announcements and the supervised chat** (SPEC 4.4, 4.10.7).
    - DB: migration 0008 with `yb_announcements` (by audience) and the `yb_chat_*` tables (leaders room, reports, mutes, the contact-data filter, the rate limit).
    - UI: the announcements channel and public strip; the leaders room; the admin moderation queue.
    - Tests: RLS (members and parents have no chat access), phone numbers and emails rejected, the rate limit.
18. [ ] **Excel export** (SPEC 4.10.8).
    - `js/xlsx-lite.js` (pure); sheets for teams, members, schedule, results, ranking, grades and submissions; per-role scope.
    - Tests: the file opens (the zip and XML validate), Arabic and RTL, members' data only in the admin export.
19. [ ] **PWA: install as a phone app** (SPEC 4.6). Independent of the backend, so it can be built at any point.
    - Build: `build_pwa.py` writes the manifest, the icons, `sw.js`, `offline.html` and `_headers`; plus `make_zip.sh`.
    - UI: `js/pwa.js` handles the install button and iOS sheet, the update toast, the offline indicator, and the offline cache of public data.
    - Tests: `test-pwa.mjs` plus a WebKit pass; Supabase, `/api` and Storage are never cached.
20. [~] 🔒 **Go-live of the backend** (SPEC 4.1). **Done on 12 Nov 2026 for 0001–0003**; later migrations go live with their own slices.
    - [x] Applied 0001 (ASCII copy without the auth.users backfill), 0002 and 0003 to `dhjmdiqausbcyhrguinl`. A name-clash check came first (no clashes). Verified after: 9 Yanabee tables, all with RLS forced; 0 Yanabee profiles for the Hour Bank users; `set_admin` closed to anon and authenticated; Hour Bank's 39 tables untouched.
    - [x] Security advisors: only the expected findings (3 definer views, `yb_join_attempts` with no policy on purpose, the RPC API callable by authenticated users) plus the project-wide leaked-password setting, which is Hour Bank's to decide.
    - [x] Live anon check: `public_teams` and `tournament_state` are readable (empty); `profiles`, `team_members` and `set_admin` are refused.
    - [x] `tools/yanabee/make_zip.sh` writes the live URL and publishable key into the zip only; the repo keeps the empty config that the tests rely on.
    - [ ] Owner: sign up on the live site, then in the SQL editor run `select public.set_admin('<your email>');`. Email confirmation is off in this project (Hour Bank's setting), so accounts sign in immediately.
    - [ ] Live sign-up smoke test (blocked from this session: creating accounts on the shared project needs the owner's permission). The owner's first sign-up is the test.
20b. [ ] **Player recommendations for leaders** (SPEC 4.12, owner request). Needs slices 14 and 17.
    - DB: opt-in «أبحث عن فريق» with guardian consent; `yb_player_stats` view for approved leaders (age group, wins, goals, «روح الفريق», Quran awards); `yb_invites` with accept and decline.
    - UI: a leader filter panel (age group, minimum goals, wins, team player, Quran winner) with a "best match" sort; an invite inbox for players and parents.
    - Tests: RLS (only opted-in players, first name and age group only, no email, phone or guardian data; approved leaders only).
21. [ ] **Certificates** (SPEC 4.5) and **admin quality-of-life** (SPEC 4.8: the audit log, backup and restore, user search, password reset).
22. [~] 🔒 **Owner content decisions** (SPEC 4.7). The revised terms (12 Nov 2026) settled the WhatsApp number (05305175431, now on the register page and the ad). Still open: the lira amounts, the remaining contradictions in the documents, and whether students may join the chat.
    - Revised terms applied: forfeits 0 – 2 (late, withdraw before) and 0 – 3 (absent, withdraw during) with «إنذار أول»; arrival 20 minutes early; verbal abuse = 5-minute send-off; rubric 10 / 30 / 5; appeals decided within 48 hours; new sections «نظام الدوري» and «نظام دوري الشطرنج». No database change was needed.
23. [ ] **Release hardening**: fix the flaky wow and gallery tests, remove `.lab-stub`, run the integration check at 390 and 1280px, build the final zip (the owner uploads it; never auto-deploy).
24. [ ] *(Optional)* **Web Push** for the inbox, private chess labels, Arabic email templates, a custom domain (SPEC 4.9); 🔒 a live quiz with a buzzer for hifz and fahm, only if the owner wants it (SPEC 4.11).

Build order: 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 23. Item 22 happens whenever the owner answers.
