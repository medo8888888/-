"""teams.html — «الفرق السبع» (content/yanabee/platform.txt, sections s2 with t1…t7, and s3).

Every content word comes from PLATFORM / QURAN through t() (attributes through plain()).
The only text written here is UI chrome: the explorer heading and hint, tab-list and
navigation labels, button labels. Labels («طبيعة العمل», «الأثر على الفرد» …) are read
from the content, never hard-coded. The team numbers 01…07 are decorative (aria-hidden)
ordinals of the seven teams named in the s2 title.
"""
import math

from core import (ICONS, PLATFORM as P, QURAN as Q, TEAMS, btn, cta, ic, logo, page, page_hero, paren,
                  section, short, split_kicker, strip_colon, svg, t)

PAGE = 'teams.html'
IDS = list(TEAMS)                       # t1 … t7
TEAM = {tid: P['s2'][tid] for tid in IDS}

# The five items of every team, by position (labels come from the content).
BODIES, NATURE, IMP_IND, IMP_FAM, IMP_SOC = range(5)
IMPACTS = [(IMP_IND, 'user'), (IMP_FAM, 'home'), (IMP_SOC, 'users')]

LOCAL = {  # Lucide (ISC) paths that core.ICONS does not have
    'briefcase': '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
}


def icon(name, cls='i'):
    return svg(LOCAL[name], cls) if name in LOCAL else ic(name, cls)


def tc(tid):
    return f'--tc:var(--{tid})'


def labels():
    """The item labels as written in the content (taken from team 1)."""
    return [strip_colon(it.label) for it in TEAM['t1'].items]


def lbl_split(label):
    """'الأثر على الفرد' -> ('الأثر على', 'الفرد') so phones can show the last word only."""
    head, _, last = label.rpartition(' ')
    return head, last


def ripple(name, level, cls='tm-rip'):
    """Icon in a tinted disc with 1–3 rings: individual → family → society (decorative)."""
    return f'<span class="{cls}" data-lv="{level}" aria-hidden="true"><i></i><i></i><i></i>{icon(name)}</span>'


def title_html(title, cls='tm-paren'):
    """Main title + its parenthetical as a sub-title line (both verbatim)."""
    p = paren(title)
    main = t(short(title))
    return f'{main} <span class="{cls}">{t(p)}</span>' if p else main


# ------------------------------------------------------------------ hero ---
def hub():
    """Seven team springs around the Yanabee droplet (decorative)."""
    C, R, NR = 230, 168, 33
    streams, nodes = '', ''
    for k, tid in enumerate(IDS):
        a = math.radians(-90 - k * 360 / 7)  # t1 on top, then counter-clockwise (RTL reading order)
        x, y = C + R * math.cos(a), C + R * math.sin(a)
        # a gentle swirl: control point rotated off the straight line
        b = a + math.radians(24)
        cx, cy = C + R * 0.55 * math.cos(b), C + R * 0.55 * math.sin(b)
        d = f'M{C} {C}Q{cx:.1f} {cy:.1f} {x:.1f} {y:.1f}'
        streams += (f'<g class="tm-st" style="{tc(tid)};--k:{k}"><path class="tm-st-a" d="{d}"/>'
                    f'<path class="tm-st-b" d="{d}" pathLength="100"/></g>')
        s = 26
        nodes += (f'<g class="tm-node" style="{tc(tid)};--k:{k}"><circle class="tm-node-h" cx="{x:.1f}" cy="{y:.1f}" r="{NR + 9}"/>'
                  f'<circle class="tm-node-c" cx="{x:.1f}" cy="{y:.1f}" r="{NR}"/>'
                  f'<svg x="{x - s / 2:.1f}" y="{y - s / 2:.1f}" width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" '
                  f'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS[TEAMS[tid]]}</svg></g>')
    rings = ''.join(f'<circle class="tm-rg tm-rg{i}" cx="{C}" cy="{C}" r="{r}"/>' for i, r in enumerate((58, 92, 126)))
    return f'''
    <div class="tm-hub rv" aria-hidden="true">
      <svg class="tm-hub-svg" viewBox="0 0 460 460" focusable="false">
        <circle class="tm-orbit" cx="{C}" cy="{C}" r="{R}"/>
        {rings}{streams}{nodes}
      </svg>
      <span class="tm-hub-core">{logo(84, 'hub', 'tm-hub-logo')}</span>
    </div>'''


def hero():
    s2 = P['s2']
    kicker, main = split_kicker(s2.title)
    words = main.split(' ')
    a, b = ' '.join(words[:3]), ' '.join(words[3:])
    h1 = (f'<span class="tm-h1-k">{t(kicker)}</span> <span class="tm-h1-a">{t(a)}</span>'
          + (f' <span class="tm-h1-b">{t(b)}</span>' if b else ''))
    chips = [(f'#{tid}', f'<span class="tm-chip-ic" style="{tc(tid)}">{ic(TEAMS[tid])}</span><span>{t(short(TEAM[tid].title))}</span>')
             for tid in IDS]
    html = page_hero(PAGE, t(P.meta['title']), h1, t(s2.paras[0]), chips, hub(), 'has-visual tm-hero')
    return html.replace('<nav class="chips rv"', '<nav class="chips tm-chips-nav rv"', 1)


# --------------------------------------------------------- impact lens ---
def lens():
    labs = labels()
    tabs, panels = '', ''
    for n, (idx, ico) in enumerate(IMPACTS, 1):
        head, last = lbl_split(labs[idx])
        on = n == 1
        tabs += (f'<button type="button" role="tab" id="lens-tab-{n}" aria-controls="lens-p-{n}" '
                 f'aria-selected="{"true" if on else "false"}" tabindex="{0 if on else -1}" class="tm-seg-tab">'
                 f'{ripple(ico, n, "tm-rip tm-rip-sm")}<span class="tm-seg-l"><span class="tm-seg-pre">{t(head)} </span>{t(last)}</span></button>')
        rows = ''
        for i, tid in enumerate(IDS):
            it = TEAM[tid].items[idx]
            rows += (f'<li class="tm-lens-row" style="{tc(tid)};--i:{i}">'
                     f'<span class="tm-lens-ic" aria-hidden="true">{ic(TEAMS[tid])}</span>'
                     f'<a class="tm-lens-name" href="#{tid}">{t(short(TEAM[tid].title))}</a>'
                     f'<p class="tm-lens-body">{t(it.body)}</p></li>')
        panels += (f'<div class="tm-lens-panel" role="tabpanel" id="lens-p-{n}" aria-labelledby="lens-tab-{n}" tabindex="0"'
                   f'{"" if on else " hidden"}><ol class="tm-lens-list">{rows}</ol></div>')
    return f'''
<section class="sec tm-lens" aria-labelledby="lens-h">
  <div class="wrap">
    <div class="tm-lens-box" data-tabs>
      <header class="tm-lens-head rv">
        <div>
          <span class="kicker">{icon('waves')}</span>
          <h2 id="lens-h">أثر الفرق السبع</h2>
          <p class="tm-hint">اختر مستوى الأثر للمقارنة بين الفرق</p>
        </div>
        <div class="tm-seg" role="tablist" aria-label="مستوى الأثر"><span class="tm-seg-pill" aria-hidden="true"></span>{tabs}</div>
      </header>
      <div class="tm-lens-card rv">{panels}</div>
    </div>
  </div>
</section>'''


# ---------------------------------------------------------- team panels ---
def side_nav():
    rows = ''
    for i, tid in enumerate(IDS, 1):
        rows += (f'<li style="{tc(tid)}"><a href="#{tid}"><span class="tm-nav-ic" aria-hidden="true">{ic(TEAMS[tid])}</span>'
                 f'<span class="tm-nav-t">{t(short(TEAM[tid].title))}</span></a></li>')
    return f'''
  <aside class="tm-aside">
    <nav class="tm-nav" data-spy aria-label="الفرق السبع">
      <p class="tm-nav-title" aria-hidden="true">{ic('users')}الفرق السبع</p>
      <div class="tm-nav-scroll"><ol class="tm-nav-list">{rows}</ol></div>
    </nav>
  </aside>'''


def chips_of(text):
    """'أ / ب / ج.' -> verbatim fragments in order (final full stop dropped from the chip)."""
    parts = [p.strip() for p in text.split(' / ')]
    if parts and parts[-1].endswith('.'):
        parts[-1] = parts[-1][:-1]
    return parts


def quran_card():
    return f'''
      <a class="tm-quran" href="quran.html">
        <span class="tm-quran-ic" aria-hidden="true">{ic('book-open')}</span>
        <span class="tm-quran-t"><b>{t(Q.meta['title'])}</b><small>{t(Q.meta['subtitle'])}</small></span>
        <span class="tm-quran-go"><span>التفاصيل</span>{ic('arrow-left')}</span>
      </a>'''


def team(tid, n):
    node = TEAM[tid]
    it = node.items
    nat, bod = it[NATURE], it[BODIES]
    chips = ''.join(f'<li>{ic("landmark")}<span>{t(c)}</span></li>' for c in chips_of(bod.body))
    imps = ''
    for lv, (idx, ico) in enumerate(IMPACTS, 1):
        x = it[idx]
        imps += (f'<li class="tm-imp">{ripple(ico, lv)}<h3>{t(strip_colon(x.label))}</h3><p>{t(x.body)}</p></li>')
    extra = quran_card() if tid == 't1' else ''
    return f'''
    <article class="tm-team rv" id="{tid}" style="{tc(tid)}" aria-labelledby="{tid}-h">
      <span class="tm-num" aria-hidden="true">{n:02d}</span>
      <header class="tm-team-head">
        <span class="tm-team-ic" aria-hidden="true">{ic(TEAMS[tid])}</span>
        <h2 id="{tid}-h">{title_html(node.title)}</h2>
      </header>
      <div class="tm-nature">
        <h3 class="tm-k">{icon('briefcase')}{t(strip_colon(nat.label))}</h3>
        <p>{t(nat.body)}</p>
      </div>
      <div class="tm-bodies">
        <h3 class="tm-k">{ic('landmark')}{t(strip_colon(bod.label))}</h3>
        <ul class="tm-chips">{chips}</ul>
      </div>
      <ul class="tm-imps">{imps}</ul>{extra}
    </article>'''


def teams():
    panels = ''.join(team(tid, n) for n, tid in enumerate(IDS, 1))
    return f'''
<div class="wrap tm-layout">
  {side_nav()}
  <div class="tm-main">{panels}
  </div>
</div>'''


# ------------------------------------------------------------------- s3 ---
def s3():
    s = P['s3']
    looks = [('accessibility', '--sky'), ('map', '--sun'), ('heart', '--brand')]
    cards = ''
    for it, (ico, col) in zip(s.items, looks):
        cards += (f'<li class="tm-inc rv" style="--tc:var({col})">{ripple(ico, 3, "tm-rip tm-rip-lg")}'
                  f'<h3>{t(strip_colon(it.label))}</h3><p>{t(it.body)}</p></li>')
    return section('s3', s.title, f'<ul class="tm-incs" data-stagger>{cards}</ul>', icon='accessibility', cls='alt tm-s3')


# ------------------------------------------------------------------ page ---
def build():
    mission = P['s1']['mission']
    buttons = (btn('operations.html', 'التشغيل والحوكمة', 'shield')
               + btn('quran.html', t(Q.meta['title']), 'book-open', 'btn-ghost')
               + f'<button type="button" class="btn btn-ghost" data-open-chat>{ic("sparkles")}<span>اسأل عن الفرق</span></button>')
    body = f'''<div id="s2" class="tm-s2">{hero()}{lens()}{teams()}
</div>
{s3()}
{cta(t(mission.title), t(mission.paras[0]), buttons)}'''
    kicker, main = split_kicker(P['s2'].title)
    page(PAGE, main, body, P['s2'].paras[0] + ' ' + '، '.join(short(TEAM[x].title) for x in IDS),
         css=('css/teams.css',), js=('js/teams.js',))
    return PAGE
