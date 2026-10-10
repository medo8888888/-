# Yanabee («ينابيع») site — architecture & contracts

Arabic (RTL) mini-site for **مشروع «ينابيع»**, built from two source documents
(Word → PDF, author Ali Shaban, September 2026):

| Source PDF | Content file | Site |
|---|---|---|
| مشروع "ينابيع" — المنصة الوطنية الموحدة للعمل الجماعي وتنمية النشء والشباب (8 pages) | `content/yanabee/platform.txt` | `index.html`, `teams.html`, `operations.html` |
| مبادرة "حفظ، فهم، تطبيق" — فرق القرآن الكريم وبناء القيم والسلوك (6 pages) | `content/yanabee/quran.txt` | `quran.html` |

It is served at **`/yanabee/`** by the same Cloudflare Worker as the Takamul site
(`site/yanabee/` is inside the Worker's assets directory), and it is also fully
self-contained: the `site/yanabee/` folder can be uploaded alone to any static host or opened
from `file://`. Only `404.html` assumes the `/yanabee/` mount: Cloudflare serves the nearest
`404.html` at any depth, so its asset and page URLs are absolute (`/yanabee/…`).

```
content/yanabee/*.txt          the two documents, verbatim (markup documented in platform.txt's header)
tools/yanabee/content.py       parser -> PLATFORM, QURAN (Doc -> sections -> subsections -> blocks/items)
tools/yanabee/core.py          typography t(), icons ic()/svg(), logo(), PAGES, TEAMS, components, page() shell
tools/yanabee/page_*.py        one module per page, each exposes build()
tools/yanabee/build_kb.py      site/yanabee/data/kb.js (search + offline assistant) and worker/knowledge-yanabee.js
tools/yanabee/build.py         entry: python3 tools/yanabee/build.py [page names…]
tools/yanabee/check_content.py fails unless every content line is visible on the site
tools/yanabee/shot.mjs         Playwright screenshots + console/overflow check (node tools/yanabee/shot.mjs teams.html)
site/yanabee/css/base.css      design system: tokens, base, components, shell (nav, footer, tab bar, sheet, search, chat)
site/yanabee/css/assist.css    extra styles for search + assistant
site/yanabee/css/<page>.css    page layouts (home.css, teams.css, operations.css, quran.css)
site/yanabee/js/main.js        theme (circular reveal), nav, sheet, reveal, counters, rings, tabs, scroll-spy, print
site/yanabee/js/fx.js          interactivity layer on every page: press ripples, card tilt + light, magnetic buttons, hero light,
                               section dots, select-text-to-ask, Quran verse word reveal, operations donut <-> legend, [data-goto]
site/yanabee/css/fx.css        styles for fx.js (loaded last, after the page stylesheet)
site/yanabee/js/home.js        home: funding donut hover, growth phases highlight
site/yanabee/js/search.js      Ctrl+K search overlay over window.YANABEE_KB
site/yanabee/js/chat.js        «مساعد ينابيع»: Gemini via /api/chat (site: "yanabee"), offline answers from the KB
site/yanabee/js/<page>.js      page-only behaviour (springs.js = home hero canvas, …)
site/yanabee/js/wow.js + css/wow.css       sitewide "wow" layer (cursor, page wipe, headline reveals, wave progress, parallax, sound)
site/yanabee/js/intro.js + css/intro.css   opening scene (home, first visit per session)
site/yanabee/js/water.js + css/water.css   home hero: live WebGL water surface (2D fallback)
tools/yanabee/wow_story.py + js/story.js + css/story.css       home: pinned scroll story «الرسالة» performed with particles
tools/yanabee/wow_gallery.py + js/gallery.js + css/gallery.css home: pinned horizontal gallery of the seven teams (+ inclusion)
```

## Laws

1. **Content is verbatim.** Every content word on the site comes from `content/yanabee/*.txt`
   through `content.py`. Never invent facts, numbers, names, ministries, dates, contacts or
   claims. UI chrome (button labels, hints, aria labels, "التفاصيل") is fine. A number shown
   as a visual (a ring, a counter, a bar) must be a number that is in the text, next to its
   text. `python3 tools/yanabee/check_content.py` must pass after every build.
   Text may be split across elements (label/body, table cells, chips) — the check ignores
   punctuation and tags, but words must stay in order.
2. **Render content with `t()`** (escapes, curls quotes to «…», isolates Latin runs like
   `CSR`/`Peer-to-Peer` in `<bdi>`). Attributes use `plain()`.
3. **Classic scripts only** (`<script defer>`, IIFE, no ES modules, no `fetch()` of local
   files) — the site must work from `file://`. Data ships as scripts that set globals.
4. **No frameworks or CDNs** (Google Fonts only). Hand-written CSS using the tokens below.
5. **RTL first:** logical properties (`inset-inline-*`, `margin-inline-*`, `padding-inline-*`,
   `text-align:start`). Never `letter-spacing` on Arabic text. In RTL, "forward" is ←.
6. **Both themes** (`html[data-theme=dark|light]`, every colour from tokens), **phones first**
   (360–390px) up to 1440px+, no horizontal page scroll, `prefers-reduced-motion` respected,
   keyboard + screen-reader accessible (real buttons/links, labels, focus states, ARIA tabs).
7. **Generated files** (`site/yanabee/*.html`, `site/yanabee/data/kb.js`,
   `worker/knowledge-yanabee.js`) are never edited by hand — edit the generator and rebuild.
8. **Ownership:** a page module owns its `page_<name>.py`, `css/<name>.css` and optional
   `js/<name>.js`. Shared files (`core.py`, `base.css`, `main.js`) change only through the
   integrator; page-specific icons use `svg(paths)` locally.

## Content model (`content.py`)

```python
from content import PLATFORM as P, QURAN as Q
P.meta['title'], P.meta['subtitle']        # 'مشروع "ينابيع"', '(المنصة الوطنية …)'
P['s2'].title, P['s2'].paras                # section title, its own paragraphs
P['s2']['t3'].items                         # [Item]; Item.text, .label, .body, .children
P['s8'].table                               # [[header…], [row…], …]
Q['intro'].quotes                           # [verse, hadith]
node.lines()                                # every source line, in order (for search/KB)
```

Section ids — platform: `s1`…`s9` (subsections `vision mission goal`, teams `t1`…`t7`,
`phases impact`); Quran: `intro goals a1`…`a11` (subsections `media outreach support
structure followup periodic annual levels kpis`). They are also the page anchors.

| Page | Sections | Extra anchors |
|---|---|---|
| `index.html` | `s1` (+ `vision mission goal`), `s9` (+ `phases impact`) | |
| `teams.html` | `s2` (+ `t1`…`t7`), `s3` | |
| `operations.html` | `s4` `s5` `s6` `s7` `s8` | |
| `quran.html` | `intro goals a1`…`a11` | `kpi1`…`kpi9` |

`core.link_for(id)` returns the deep link for any id.

## Design tokens (base.css, both themes — names are a contract)

`--bg --bg-2 --surface --surface-2 --surface-3 --ink --ink-2 --muted --line --line-2 --brand
--brand-2 --on-brand --head --accent --sky --sun --leaf --t1 … --t7 --grad --grad-soft --glass
--glass-line --hero-1 --hero-2 --hero-3 --shadow-sm --shadow --shadow-lg --r --r-sm --r-lg
--font --font-h --font-q --ease --nav-h --tab-h`. Sections set `--sc` (section colour).
Team colours: `t1` Quran (emerald), `t2` scouts (amber), `t3` sports (coral), `t4` tech (indigo),
`t5` health/environment (green), `t6` media (violet), `t7` solidarity (rose).

**Shared classes:** `.wrap .sec(.alt/.band) .sec-head .kicker .lead .grid(.g2/.g3/.g4) .card .ic
.list .lbl .body .sublist .tbl .chips .chip .tag .btn(.btn-primary/.btn-ghost/.btn-soft) .btns
.stat .ring .verse .hadith .hero .hero-page .eyebrow .cta .rv .sr-only`.

**JS hooks (main.js):** `.rv` reveal on scroll (`[data-stagger]` staggers children);
`[data-to="1000"]` counter (final text stays the HTML text); `.ring[data-ring] style="--v:85"`
animated percentage ring; `[data-tabs]` with `[role=tab][aria-controls]` (RTL arrow keys);
`[data-spy]` highlights in-page links (`.current`); `[data-print]`; `[data-open-chat]`,
`[data-open-search]`, `[data-open-sheet]`. Events: `themechange`, `yanabee:scroll`.
Globals: `window.YanabeeTheme`, `window.YanabeeChat = {open, close, ask}`,
`window.YanabeeSearch = {open(q), close}`, `window.YANABEE_KB`.

## Transcription notes

Both content files were checked word-for-word against the PDF page images (including every
diacritic of the Quran verse and the hadith). Deliberate, typography-only normalisations:
bullet stars → items; spacing around commas/colons; Latin terms placed next to their Arabic
term (`(Peer-to-Peer)`, `(Behavioral Tracker)`, `(Aggregator)`, `(Impact Index)`); the
duplicated heading «.6فرق الوعي والإعلام…» on platform page 4 dropped; the `|---|` table
separator rows dropped; «الامراض» → «الأمراض», «فى» → «في», «القران» → «القرآن» (initiative
subtitle), «المحورالثاني» → «المحور الثاني»; a final period where a list ended without one; the
semicolon after the verse's closing bracket dropped (block quote). Everything else — including
wording such as «ليكادوا يكونوا», «الأثرية», «والمحايد التربوي», «محتوى قيم» — is as printed.

## Commands

```bash
python3 tools/yanabee/build.py && python3 tools/yanabee/check_content.py
node tools/yanabee/shot.mjs teams.html --w 390,1440 --theme light,dark   # → scratch/shots/*.png
node tools/test-worker.mjs
node tools/yanabee/test-ui.mjs      # search + assistant
node tools/yanabee/test-fx.mjs      # interactivity layer
```

## Interactivity (enhancement only)

Pointer effects need a fine pointer and no `prefers-reduced-motion`; touch gets the ripples, the select-to-ask
button and the tappable hero springs. Without JavaScript every page is still complete (JS-only controls are hidden).
The hero canvas's seven streams are the seven teams (`data-teams` on the canvas, built from the content): hover shows
the team, a press opens `teams.html#tN`. Elements with `data-goto="id"` scroll to that id. The select-to-ask text is UI
chrome; the question sent to the assistant is the selected content text in «…».

## The "wow" pack (animation layer)

Everything here is progressive enhancement: each piece has a calm static fallback (no JS, `prefers-reduced-motion`, small
screens), pauses off-screen, and uses only content that is already in `content/yanabee/*.txt`.

| Piece | Where | What it does | Hooks |
|---|---|---|---|
| Opening scene | `index.html` | a drop falls, splashes in the seven team colours, the logo rises, a circular hole opens onto the hero. Once per browser session; `?intro` replays it (and is the only way to see it under automation); skipped on a keypress/press and when the page was reached through a water wipe | `html.intro-on`, `sessionStorage['yb-intro']`, events `yanabee:intro-reveal`, `yanabee:intro-end` |
| Water hero | `index.html` hero | WebGL1 analytic ripple surface with caustics, calmer behind the copy; reacts to pointer/touch; 2D fallback; software rasterisers get the 2D version (`window.YANABEE_WATER={gl:'force'}` overrides) | event `yanabee:drop` `{x,y,strength}` (client coords), `window.YanabeeWater` |
| Scroll story | `index.html` after the hero | the mission paragraph (verbatim, cut into 4 fragments) performed by ~1800 particles: loners → seven team clusters → racing streams → one arch → the word «ينابيع». Tall sticky track; static block without JS/reduced motion | `window.YanabeeStory`, tuning in `CFG` (story.js) |
| Teams gallery | `index.html` teams section | pinned horizontal panels (parallax numerals, arch photos, colour washes, impact tabs, rail); grid below 1000px and in reduced motion | `window.YanabeeGallery`, knobs `K` (gallery.js) |
| Water-drop cursor | all pages, fine pointer | droplet follower + trail, swells over interactive items, splash on press | `YanabeeWow.cursor.splash(x,y)` |
| Water wipe | all pages | same-site `.html` links expand a gradient circle from the click, the next page drains it (`sessionStorage['yb-wipe']`, `html.wipe-in` set by the inline head script); fail-safes: 1.15 s CSS auto-uncover, blocked navigation, Esc, bfcache | `YanabeeWow.go(href,x,y)` — use it instead of `location.href =` |
| Headlines | all pages | `main h1/h2` split per word (never per letter) and rise from a mask; wait for the wipe and the intro | |
| Wave progress, parallax | all pages | wavy scroll bar with a droplet head; `[data-par="0.2"]` + auto targets | |
| Water sound | all pages, **off by default** | WebAudio synth (drop/ripple/whoosh/good/bad), nav toggle «صوت الماء», `localStorage['yanabee-sound']` | event `yanabee:sound` `{type}` (the learn page sends `good`/`bad`) |

Tests: `test-intro`, `test-story`, `test-gallery`, `test-wow`, `test-water` (all `node tools/yanabee/<name>.mjs`; `npm run test:yanabee` runs everything).
Headless Chromium in the sandbox renders WebGL in software, so frame timings measured there are pessimistic; nothing was measured on real
GPUs or on Safari/Firefox.
