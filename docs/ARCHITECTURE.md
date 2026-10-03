# Takamul site — architecture & contracts

Arabic (RTL) site for «جمعية تكامل لبناء القيم والتنمية», generated from the
membership brochure. Default theme: dark (premium layer at the end of style.css). Static pages in `site/` + a Cloudflare Worker (`worker/`)
for the Gemini assistant. No frameworks, no build toolchain beyond Python.

```
content/brochure.txt     the brochure, one paragraph per line (source of ALL text)
tools/build.py           entry: python3 tools/build.py
tools/core.py            shell (head, nav, footer, tab bar, sheet, chat markup) + components + helpers
tools/pages.py           page compositions: index, about, initiatives, expansion, governance, join, faq, 404
tools/dashboard.py       dashboard.html (command center)
tools/build_kb.py        site/data/kb.js (search + offline-assistant knowledge base)
tools/build_world.mjs    site/data/world.js (countries for the globe)
tools/check_content.py   fails unless every brochure line is visible on the site
tools/test-worker.mjs    Worker tests            tools/test-kb.mjs   offline-answer tests
site/css/style.css       design system (tokens, base, components, shell, chat base)
site/css/pages.css       page layouts (bento compositions)
site/css/{chat-plus,palette,globe,dashboard}.css   feature styles
site/js/main.js          theme, nav, sheet, reveal, tilt, counters, FAQ filter
site/js/chat.js          assistant (Gemini via /api/chat, offline brochure answers)
site/js/palette.js       command palette / search overlay
site/js/globe.js         3D globe (canvas)       site/js/cursor.js   custom cursor
site/js/dashboard.js     command-center interactions
worker/index.js          serves site/ + /api/chat + /api/health (key = secret GEMINI_API_KEY)
```

## Laws

1. **Content:** every visible brochure text comes from `L(n)` (verbatim). Never invent facts,
   numbers, names, phone numbers, emails, fees or dates. UI chrome text (button labels, hints)
   is fine. `python3 tools/check_content.py` must pass after every build.
2. **Classic scripts only** (`<script defer>`, IIFE, no ES modules, no `fetch()` of local files):
   the site must also work when opened from `file://` or uploaded as plain static files.
   Data is shipped as scripts that set globals (`site/data/*.js`).
3. **No external JS/CSS frameworks or CDNs** (only Google Fonts). Hand-written CSS with tokens.
4. **RTL first:** logical properties (`inset-inline-*`, `margin-inline-*`, `padding-inline-*`).
   Never put `letter-spacing` on Arabic text (it breaks letter joining).
5. **Both themes** (`html[data-theme=dark|light]`), **phones first** (390px) up to 1440px+,
   `prefers-reduced-motion` respected, keyboard + screen-reader accessible.
6. **Generated files** (`site/*.html`, `site/data/kb.js`, `worker/knowledge.js`) are never edited by hand.

## Contracts between modules

**Design tokens** (style.css, both themes) — feature CSS may rely on these names:
`--bg --bg-2 --surface --surface-2 --surface-3 --ink --ink-2 --muted --line --line-2 --brand
--brand-2 --on-brand --head --gold --gold-2 --leaf --c-teal --c-navy --c-leaf --c-purple
--c-orange --c-maroon --c-gold --glass --glass-line --shadow-sm --shadow --shadow-lg --r --r-sm
--font --font-h --ease --nav-h --tab-h` (values may change; names stay; new tokens may be added).

**Python helpers** (core.py) used by pages.py / dashboard.py — keep names & signatures
(new optional params allowed): `L, LS, ic(name, cls), ICONS, PAGES, PAGE_LABEL, SECTIONS,
SEC_ICON, sec_link, toc_items, ul, card, numcard, subhead(text, sub='', id=None),
section(n, body, alt=False, lead=''), page_hero(fn, nums, visual=False), cta(),
page(fn, title, body, desc, globe=False, css=(), js=())`.

**Globals**
- `window.TAKAMUL_KB` — see schema in `tools/build_kb.py`.
- `window.TAKAMUL_WORLD` — globe data (schema documented in `tools/build_world.mjs`); may be null.
- `window.TakamulTheme = { get(), set('light'|'dark'), toggle() }` (main.js); fires `themechange` on window.
- `window.TakamulChat = { open(), close(), ask(text), isOpen(), mode() }` (chat.js).
- `window.TakamulBrain` — offline brochure search/answer engine (chat.js; also `search(q,{limit})` for others).
- `window.TakamulPalette = { open(query?), close() }` (palette.js).

**DOM hooks:** `[data-open-chat]`, `[data-open-palette]`, `[data-open-sheet]`, `[data-close-sheet]`,
`.theme-toggle`, `canvas[data-globe]` (globe.js may add overlay siblings in its positioned parent),
`[data-faq-search]`. Chat markup (core.py) keeps: `.chat .chat-panel .chat-head .chat-log .chat-suggest
.chat-form textarea .chat-send .chat-note .chat-clear .chat-close`.

**Anchors (deep links used by search & assistant):** sections `s1`…`s13`; subsections `s2-1 s3-1 s3-2
s3-3 s4-1 s4-2 s7-1 s7-2 s7-3 s8-1 s8-2 s13-1 s13-2`; pillars `p1`…`p10`; stages `st1`…`st7`;
FAQ `f1`…`f9` (founders) and `b1`…`b8` (board); `#welcome`, `#toc`.

## Commands

```bash
python3 tools/build.py && python3 tools/check_content.py
node tools/test-worker.mjs && node tools/test-kb.mjs
cd site && python3 -m http.server 8765      # then open http://localhost:8765/
```

Browser testing in the cloud sandbox: Playwright from the global modules
(`NODE_PATH=$(npm root -g) node script.js`), `chromium.launch({executablePath:'/opt/pw-browsers/chromium'})`,
block Google Fonts (`page.route('**fonts.g**', r => r.abort())`), mock `/api/health` and `/api/chat` with `page.route`.
