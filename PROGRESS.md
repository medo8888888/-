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
13. [ ] **Unified schedule and alerts** (SPEC 4.10.3).
    - DB: migration 0004 with `yb_events`, `yb_public_events`, and a notify trigger.
    - API: event CRUD and reads.
    - UI: the «الجدول» tab with filters (team, competition, category), "my team", `.ics` export; event editing for officers and the admin; **attendance** (leader confirms, officer checks teams in; lg2 rows shown word for word; SPEC 4.11).
    - Tests: RLS (the public sees no team-private events), notifications fan out to the right users only, UI filters.
14. [ ] **Live and approved results, plus stage approval** (SPEC 4.10.4, 4.10.5).
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
20. [ ] 🔒 **Go-live of the backend** (SPEC 4.1). The owner approves the apply prompt.
    - Apply migrations 0001–0008 to `dhjmdiqausbcyhrguinl` in one go; post-check SQL; review the advisors; add the Storage bucket.
    - Put the URL and key in `yb-config.js`. The owner sets the redirect URL and runs `set_admin`.
    - `smoke-live.mjs` covers every role, including an officer.
21. [ ] **Certificates** (SPEC 4.5) and **admin quality-of-life** (SPEC 4.8: the audit log, backup and restore, user search, password reset).
22. [ ] 🔒 **Owner content decisions** (SPEC 4.7): the WhatsApp number, the lira amounts, the 4 contradictions in the documents, and whether students may join the chat.
23. [ ] **Release hardening**: fix the flaky wow and gallery tests, remove `.lab-stub`, run the integration check at 390 and 1280px, build the final zip (the owner uploads it; never auto-deploy).
24. [ ] *(Optional)* **Web Push** for the inbox, private chess labels, Arabic email templates, a custom domain (SPEC 4.9); 🔒 a live quiz with a buzzer for hifz and fahm, only if the owner wants it (SPEC 4.11).

Build order: 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 23. Item 22 happens whenever the owner answers.
