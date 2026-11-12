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

12. [ ] 🔒 **Go-live of the backend** (SPEC 4.1). The owner approves the apply prompt.
    - DB: apply 0001 to `dhjmdiqausbcyhrguinl`, run the post-check SQL, review the security advisors.
    - API: put the URL and publishable key in `yb-config.js`.
    - UI: switch the board and account pages to "connected"; owner steps for the redirect URL and `set_admin`.
    - Tests: `smoke-live.mjs` run by hand, plus the full offline suite still green.
13. [ ] **PWA: install as a phone app** (SPEC 4.6).
    - DB: none.
    - Build: `build_pwa.py` writes the manifest, the icons (192, 512, maskable), `sw.js` (hash-versioned precache) and `offline.html`; head tags in `core.page`; the `_headers` file; `make_zip.sh`.
    - UI: `js/pwa.js` handles registration, the update toast, the offline indicator, the Android install button and the iOS "add to home screen" sheet; `tournament.js` caches the last public state for offline reading.
    - Tests: `test-pwa.mjs` (manifest, icons, service worker, offline reload, Supabase and `/api` never cached, update flow, install logic), plus a WebKit pass.
14. [ ] **Migration 0002: app tag and hardening** (SPEC 4.2).
    - DB: profiles only for `app:'yanabee'`; `yb_join_attempts` with a limit of 10 per 15 minutes; `yb_my_team_roster_status()`.
    - API: send `app:'yanabee'` at sign-up; the `too_many_attempts` error key; the roster-status method.
    - UI: "joined" and "guardian linked" ticks on the leader screen; the demo fake mirrors them.
    - Tests: RLS for the new objects, `test-yb-api`, `test-account`.
15. [ ] **Judging and final results** (SPEC 4.3).
    - DB: migration 0003 with `yb_scores`, `yb_rubric`, `yb_settings`, `yb_axis_cap`, the set/publish RPCs, `yb_public_results`, `yb_my_scores`.
    - API: the score and rubric methods, publish, the results reads.
    - UI: the admin «التحكيم» grid (`judging.js` and `.css`), the public «النتائج» tab, and team score cards.
    - Tests: RLS (unpublished results invisible, no child data), caps equal `competition.txt`, UI tests.
16. [ ] **Announcements** (SPEC 4.4).
    - DB: migration 0004 with `yb_announcements` and its RLS by audience.
    - API: CRUD plus the public read.
    - UI: the admin «الإعلانات» tab, the public strip on the home and tournament pages, the role feeds, the offline cache.
    - Tests: RLS by audience, UI tests, a PWA offline read.
17. [ ] **Certificates** (SPEC 4.5).
    - DB: migration 0005 with `yb_awards` and its RLS.
    - API: award CRUD and the own-team reads.
    - UI: the admin «الشهادات» tab, the A4 print preview, batch print, reprint for leaders and parents (`certificates.js` and `.css`).
    - Tests: RLS (awards never public), print-mode layout, no amounts printed.
18. [ ] **Admin quality-of-life** (SPEC 4.8).
    - DB: none (reads `audit_log`).
    - API: paged audit reads; the GoTrue recover call.
    - UI: the «السجل» tab, tournament JSON backup and restore, user search, role change, password-reset email.
    - Tests: `test-account` admin tabs and the restore conflict check.
19. [ ] 🔒 **Owner content decisions** (SPEC 4.7).
    - Content: the WhatsApp number (`register.js` `WA` and the `competition.txt` placeholders), the lira amounts for the fee and prizes, and the 4 contradictions in the documents.
    - Tests: `check_content.py` at 100%, and the UI tests updated.
20. [ ] **Release hardening**.
    - Fix the flaky `wow` ViewTransition test and the `gallery` timing under load.
    - Remove the unused `.lab-stub`.
    - Run the full integration check (duplicate ids, overflow, errors) at 390px and 1280px.
    - Build the final zip, which the owner uploads. Never auto-deploy.
21. [ ] *(Optional)* **Web Push** for announcements and match reminders, with guardian consent; private chess player labels; Arabic email templates; a custom domain (SPEC 4.9).

Suggested build order: 12 → 13 → 14 → 15 → 16 → 17 → 18 → 20. Item 19 happens whenever the owner answers; item 13 doesn't depend on 12 and can go first.
