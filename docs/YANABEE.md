# Yanabee («ينابيع») site — architecture & contracts

Arabic (RTL) mini-site for **مشروع «ينابيع»**, built from two source documents
(Word → PDF, author Ali Shaban, September 2026):

| Source PDF | Content file | Site |
|---|---|---|
| مشروع "ينابيع" — المنصة الوطنية الموحدة للعمل الجماعي وتنمية النشء والشباب (8 pages) | `content/yanabee/platform.txt` | `index.html`, `teams.html`, `operations.html` |
| مبادرة "حفظ، فهم، تطبيق" — فرق القرآن الكريم وبناء القيم والسلوك (6 pages) | `content/yanabee/quran.txt` | `quran.html` |

It is served at **`/yanabee/`** by the same Cloudflare Worker as the Takamul site
(`site/yanabee/` is inside the Worker's assets directory), and it is also fully
self-contained: the `site/yanabee/` folder can be uploaded alone to any static host.

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
site/yanabee/js/main.js        theme, nav, sheet, reveal, counters, rings, tabs, scroll-spy, print
site/yanabee/js/search.js      Ctrl+K search overlay over window.YANABEE_KB
site/yanabee/js/chat.js        «مساعد ينابيع»: Gemini via /api/chat (site: "yanabee"), offline answers from the KB
site/yanabee/js/<page>.js      page-only behaviour (springs.js = home hero canvas, …)
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
```
