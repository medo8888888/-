"""quran.html — مبادرة «حفظ، فهم، تطبيق» (content/yanabee/quran.txt, sections intro, goals, a1…a11).

Every content word comes from QURAN / PLATFORM via t(); the only text written here is
UI chrome (nav title, button labels, aria labels). Numbers drawn as visuals (rings,
big digits, the ayah marker) are numbers that appear in the adjacent text.
"""
import math
import re

from core import (PLATFORM as P, QURAN as Q, SEC_ICON, btn, cta, ic, logo, page, paren, short,
                  split_kicker, strip_colon, svg, t, table_html)

PAGE = 'quran.html'

# ------------------------------------------------------------- page icons ---
# Lucide (ISC) paths for icons core.ICONS does not have.
LOCAL = {
    'headphones': '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    'venn': '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
    'medal': '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
    'scroll': '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
    'sprout': '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
    'presentation': '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
    'gift': '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    'mic-2': '<path d="m12 8-9.04 9.06a2.82 2.82 0 1 0 3.98 3.98L16 12"/><circle cx="17" cy="7" r="5"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
}


def icon(name, cls='i'):
    return svg(LOCAL[name], cls) if name in LOCAL else ic(name, cls)


# --------------------------------------------------------------- geometry ---
def star_path(cx, cy, R, ratio=0.7654, rot=0.0):
    """Outline of an eight-pointed star (two overlapping squares, «۞»)."""
    pts = []
    for k in range(16):
        a = math.radians(rot + k * 22.5 - 90)
        r = R if k % 2 == 0 else R * ratio
        pts.append(f'{cx + r * math.cos(a):.2f} {cy + r * math.sin(a):.2f}')
    return 'M' + 'L'.join(pts) + 'Z'


MED_STAR = star_path(24, 24, 22.8)


def med(inner, cls=''):
    """Ayah-marker style medallion (decorative; the number/icon is repeated by nearby text)."""
    return (f'<span class="q-med{" " + cls if cls else ""}" aria-hidden="true">'
            f'<svg viewBox="0 0 48 48"><path class="q-med-s" d="{MED_STAR}"/>'
            f'<circle class="q-med-c" cx="24" cy="24" r="15"/></svg><span class="q-med-v">{inner}</span></span>')


def pattern_svg(uid):
    """Low-opacity geometric star lattice for the hero / verse frame (decorative)."""
    S = 120
    g = []
    for cx, cy in [(60, 60), (0, 0), (S, 0), (0, S), (S, S)]:
        g.append(f'<path d="{star_path(cx, cy, 34)}"/>')
        g.append(f'<path d="{star_path(cx, cy, 20, 0.7654, 22.5)}"/>')
    for cx, cy in [(60, 0), (0, 60), (S, 60), (60, S)]:
        g.append(f'<path d="{star_path(cx, cy, 14, 0.62, 22.5)}"/>')
    # the lines that knit neighbouring stars together
    g.append('<path d="M26 60H46M74 60H94M60 26V46M60 74V94M0 34V46M120 34V46M0 74V86M120 74V86'
             'M34 0H46M74 0H86M34 120H46M74 120H86"/>')
    return (f'<svg class="q-pattern" aria-hidden="true" focusable="false"><defs><pattern id="qp-{uid}" width="{S}" height="{S}" '
            f'patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" stroke-width="1">{"".join(g)}</g></pattern></defs>'
            f'<rect width="100%" height="100%" fill="url(#qp-{uid})"/></svg>')


def rosette():
    """The large slowly turning ornament behind the hero title (decorative)."""
    c = 260
    rings = ''.join(f'<path d="{star_path(c, c, r, 0.7654, rot)}"/>' for r, rot in ((250, 0), (250, 22.5), (178, 0), (178, 22.5)))
    return (f'<svg class="q-rosette" viewBox="0 0 520 520" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor">'
            f'{rings}<circle cx="{c}" cy="{c}" r="232"/><circle cx="{c}" cy="{c}" r="138"/><circle cx="{c}" cy="{c}" r="128"/></g></svg>')


def corners():
    s = star_path(12, 12, 11)
    one = f'<svg viewBox="0 0 24 24"><path d="{s}"/><circle cx="12" cy="12" r="3.2"/></svg>'
    return ''.join(f'<span class="q-corner q-c{i}" aria-hidden="true">{one}</span>' for i in range(4))


# ------------------------------------------------------------------ text ---
def emph(html, sub, tag='mark', cls=''):
    """Wrap an existing substring of rendered text (the sentence stays intact)."""
    piece = t(sub)
    if piece not in html:
        raise ValueError(f'quran.html: {sub!r} not found in content')
    c = f' class="{cls}"' if cls else ''
    return html.replace(piece, f'<{tag}{c}>{piece}</{tag}>', 1)


def title_parts(title):
    """'X (Y)' -> t('X') + small '(Y)' span; titles without a trailing parenthetical unchanged."""
    p = paren(title)
    if not p:
        return t(title)
    return f'{t(short(title))} <span class="q-paren">({t(p)})</span>'


def numbered(title):
    """'1. صناعة المحتوى الإعلامي:' -> ('1', 'صناعة المحتوى الإعلامي')."""
    m = re.match(r'^(\d+)\.\s*(.+)$', strip_colon(title))
    return (m.group(1), m.group(2)) if m else ('', strip_colon(title))


def head(sec, n=None):
    """Section header: medallion (axis number or icon) + kicker + h2."""
    kicker, main = split_kicker(sec.title)
    mark = med(str(n) if n else icon(SEC_ICON[sec.id]), 'q-med-lg')
    k = f'<span class="q-kick">{icon(SEC_ICON[sec.id])}{t(kicker)}</span>' if kicker else ''
    return f'<header class="q-head rv">{mark}<div class="q-head-t">{k}<h2>{title_parts(main)}</h2></div></header>'


def sec(node, body, n=None, cls=''):
    return f'''
<section class="q-sec {cls}" id="{node.id}">
  {head(node, n)}
  {body}
</section>'''


def card(it, ic_name, cls='q-card', h='h3'):
    return (f'<article class="{cls} rv"><span class="q-ic">{icon(ic_name)}</span>'
            f'<{h}>{title_parts(strip_colon(it.label))}</{h}><p>{t(it.body)}</p></article>')


# ------------------------------------------------------------------ hero ---
def hero():
    m = re.match(r'^(\S+)\s+"(.+)"$', Q.meta['title'])
    h1 = (f'<span class="q-h1-pre">{t(m.group(1))}</span> <span class="q-h1-main">{t(chr(34) + m.group(2) + chr(34))}</span>'
          if m else t(Q.meta['title']))
    words = m.group(2).split('، ') if m else []
    tiles = ''
    for i, (w, sid) in enumerate(zip(words, ('a1', 'a2', 'a4')), 1):
        kicker, main = split_kicker(Q[sid].title)
        tiles += (f'<li><a class="q-tile" href="#{sid}">{med(str(i))}<span class="q-word">{t(w)}</span>'
                  f'<span class="q-tile-k">{t(kicker)}</span><span class="q-tile-t">{t(main)}</span>'
                  f'<span class="q-tile-go" aria-hidden="true">{ic("arrow-left")}</span></a></li>')
    return f'''
<section class="hero q-hero">
  <div class="q-hero-bg" aria-hidden="true">{pattern_svg('hero')}<span class="q-glow g1"></span><span class="q-glow g2"></span>{rosette()}</div>
  <div class="wrap q-hero-in">
    <span class="eyebrow rv">{logo(22, 'eb-quran', 'eb-logo')}{t(Q.meta['project'])}</span>
    <h1 class="rv">{h1}</h1>
    <p class="q-sub rv">{t(Q.meta['subtitle'])}</p>
    <nav class="q-trio-nav rv" aria-label="ركائز المبادرة"><ol class="q-trio" data-stagger>{tiles}</ol></nav>
  </div>
</section>'''


# ------------------------------------------------------------ axis nav ---
def axis_nav():
    rows = ''
    for i, s in enumerate(Q.sections):
        kicker, main = split_kicker(s.title)
        n = i - 1  # intro, goals, then axes 1…11
        mark = f'<span class="q-nav-n" aria-hidden="true">{n if kicker else icon(SEC_ICON[s.id])}</span>'
        k = f'<small class="q-nav-k">{t(kicker)}</small>' if kicker else ''
        rows += f'<li><a href="#{s.id}">{mark}<span class="q-nav-x">{k}<span class="q-nav-t">{t(short(main))}</span></span></a></li>'
    return f'''
<aside class="q-aside">
  <nav class="q-nav" data-spy aria-label="محاور المبادرة">
    <p class="q-nav-title" aria-hidden="true">{icon('compass')}محاور المبادرة</p>
    <div class="q-nav-scroll"><ol class="q-nav-list"><span class="q-track" aria-hidden="true"><i></i></span>{rows}</ol></div>
  </nav>
</aside>'''


# -------------------------------------------------------------- sections ---
def s_intro():
    s = Q['intro']
    opening, verse_lead, hadith_lead, closing = s.paras
    verse, hadith = s.quotes
    ayah = re.search(r'(\d+)', verse_lead)
    marker = f' {med(ayah.group(1), "q-ayah")}' if ayah else ''
    hm = re.match(r'^(.*»)\s*(\(.+)$', hadith)
    h_main, h_src = (hm.group(1), hm.group(2)) if hm else (hadith, '')
    close_html = emph(t(closing), '"حفظ، فهم، تطبيق"', 'strong')
    body = f'''
  <p class="q-opening rv">{t(opening)}</p>
  <figure class="q-frame rv">
    {pattern_svg('frame')}{corners()}
    <figcaption class="q-frame-cap">{t(verse_lead)}</figcaption>
    <blockquote class="verse"><p>{t(verse)}{marker}</p></blockquote>
  </figure>
  <figure class="q-hadith rv">
    <figcaption class="q-hadith-cap"><span class="q-ic">{ic('quote')}</span><span>{t(hadith_lead)}</span></figcaption>
    <blockquote class="hadith"><p>{t(h_main)}</p></blockquote>
    {f'<p class="q-src">{t(h_src)}</p>' if h_src else ''}
  </figure>
  <p class="q-statement rv">{close_html}</p>'''
    return sec(s, body, cls='q-intro')


GOAL_ICONS = [None, None, None, 'smartphone', 'flag', 'megaphone', 'gauge']


def s_goals():
    s = Q['goals']
    lis = ''
    for i, it in enumerate(s.items):
        body = t(it.body)
        first = it.body.split(' ', 1)[0]
        core_goal = i < 3
        if core_goal:  # حفظ / فهم / تطبيق — the three words of the initiative
            body = body.replace(t(first), f'<strong class="q-key">{t(first)}</strong>', 1)
        mark = f'<span class="q-goal-i" aria-hidden="true">{icon(GOAL_ICONS[i])}</span>' if GOAL_ICONS[i] else ''
        lis += (f'<li class="q-goal{" core" if core_goal else ""}"><span class="q-goal-n" aria-hidden="true">{i + 1}</span>'
                f'{mark}<p>{body}</p></li>')
    return sec(s, f'<ol class="q-goals rv" data-stagger>{lis}</ol>', cls='q-goals-sec')


def s_a1():
    s = Q['a1']
    it1, it2 = s.items
    b1 = emph(t(it1.body), '1 إلى 3 آيات يومياً')
    b2 = emph(t(it2.body), '(6-10 طلاب)')
    big = lambda src, pat: (re.search(pat, src).group(0) if re.search(pat, src) else '')  # noqa: E731
    n1 = big(it1.body, r'\d+ إلى \d+')
    n1 = re.sub(r'\s*إلى\s*', '-', n1)
    n2 = big(it2.body, r'\d+-\d+')
    body = f'''
  <div class="q-a1">
    <article class="q-card q-num-card rv"><div class="q-num" aria-hidden="true"><b dir="ltr">{n1}</b>{icon('book')}</div>
      <h3>{t(it1.label)}</h3><p>{b1}</p></article>
    <article class="q-card q-num-card rv"><div class="q-num" aria-hidden="true"><b dir="ltr">{n2}</b>{icon('users')}</div>
      <h3>{t(it2.label)}</h3><p>{b2}</p></article>
  </div>'''
    return sec(s, body, 1)


def s_a2():
    s = Q['a2']
    icons = ['mic-2', 'book-open', 'lightbulb', 'venn']
    cards = ''.join(card(it, icons[i], 'q-card q-tone') for i, it in enumerate(s.items))
    return sec(s, f'<div class="q-grid2" data-stagger>{cards}</div>', 2)


def s_a3():
    s = Q['a3']
    team, buddy, league = s.items
    roles = ''
    for c, ico in zip(team.children, ('flag', 'shield', 'smartphone')):
        roles += (f'<li class="q-role rv"><span class="q-ic">{icon(ico)}</span>'
                  f'<h4>{t(c.label)}</h4><p>{t(c.body)}</p></li>')
    tl = strip_colon(team.label)
    team_h = f'{t(short(tl))} <span class="q-pill">({t(paren(tl))})</span>' if paren(tl) else t(tl)
    lm = re.match(r'^(.*?)\s*\((.+)\)\.?$', league.body)
    if lm:
        pts = lm.group(2).split(' + ')
        chips = '<li class="q-plus" aria-hidden="true">+</li>'.join(f'<li class="q-point">{t(p)}</li>' for p in pts)
        league_body = f'<p>{t(lm.group(1))}</p><ul class="q-points">{chips}</ul>'
    else:
        league_body = f'<p>{t(league.body)}</p>'
    body = f'''
  <p class="lead q-lead rv">{t(s.paras[0])}</p>
  <div class="q-team">
    <div class="q-team-root rv"><span class="q-ic">{icon('users')}</span><h3>{team_h}</h3></div>
    <ul class="q-roles">{roles}</ul>
  </div>
  <div class="q-grid2 q-a3-more">
    <article class="q-card q-buddy rv">
      <div class="q-pair" aria-hidden="true"><span>{icon('user')}</span><i>{icon('link')}</i><span>{icon('user')}</span></div>
      <h3>{title_parts(strip_colon(buddy.label))}</h3><p>{t(buddy.body)}</p></article>
    <article class="q-card q-league rv">
      <div class="q-pair q-cup" aria-hidden="true"><span>{icon('trophy')}</span></div>
      <h3>{t(league.label)}</h3>{league_body}</article>
  </div>'''
    return sec(s, body, 3)


def s_a4():
    s = Q['a4']
    icons = ['file-text', 'message', 'hand-heart', 'users']
    steps = ''
    for i, it in enumerate(s.items):
        b = t(it.body)
        if 'أول 10 دقائق' in it.body:
            b = emph(b, 'أول 10 دقائق', 'strong')
        steps += (f'<li class="q-step rv">{med(str(i + 1))}<div class="q-step-c">'
                  f'<h3><span class="q-ic">{icon(icons[i])}</span><span>{t(it.label)}</span></h3><p>{b}</p></div></li>')
    return sec(s, f'<ol class="q-steps">{steps}</ol>', 4)


def s_a5():
    s = Q['a5']
    para = s.paras[0]
    app = re.search(r'"([^"]+)"', para)
    app_name = t('"' + app.group(1) + '"') if app else ''
    icons = ['headphones', 'bell', 'message', 'image']
    task = re.search(r'"([^"]+)"', s.items[1].body)
    tiles = ''.join(f'<span class="q-app-tile">{icon(icons[i])}<small>{t(short(it.label))}</small></span>'
                    for i, it in enumerate(s.items))
    phone = f'''
    <div class="q-phone-wrap rv" aria-hidden="true">
      <div class="q-phone">
        <span class="q-notch"></span>
        <div class="q-screen">
          <div class="q-app-head">{logo(26, 'app')}<b>{app_name}</b></div>
          <div class="q-app-hero"><span class="q-app-bars"><i></i><i></i><i></i></span><span class="q-app-ring"></span></div>
          <div class="q-app-grid">{tiles}</div>
          <div class="q-app-dock"><i></i><i></i><i></i><i></i></div>
        </div>
      </div>
      {f'<div class="q-toast">{icon("bell")}<span>{t(task.group(1))}</span></div>' if task else ''}
    </div>'''
    feats = ''.join(
        f'<li class="q-feat rv"><span class="q-ic">{icon(icons[i])}</span><div><h3>{title_parts(strip_colon(it.label))}</h3>'
        f'<p>{t(it.body)}</p></div></li>' for i, it in enumerate(s.items))
    body = f'''
  <p class="lead q-lead rv">{t(para)}</p>
  <div class="q-app">{phone}<ul class="q-feats">{feats}</ul></div>'''
    return sec(s, body, 5)


def s_a6():
    s = Q['a6']
    goal = s.paras[0]
    lab, _, rest = goal.partition(': ')
    lead = f'<p class="q-aim rv"><span class="q-aim-l">{icon("target")}{t(lab)}:</span> <span>{t(rest)}</span></p>' if rest else f'<p class="lead rv">{t(goal)}</p>'
    item_icons = {'media': ['video', 'file-text'], 'outreach': ['presentation', 'star'], 'support': ['landmark']}
    cols = ''
    for sub in s.subs:
        n, title = numbered(sub.title)
        rows = ''.join(
            f'<li><span class="q-ic">{icon(item_icons[sub.id][j])}</span><div><h4>{t(it.label)}</h4><p>{t(it.body)}</p></div></li>'
            for j, it in enumerate(sub.items))
        cols += (f'<li class="q-col rv" id="{sub.id}"><div class="q-col-h">{med(n)}<h3>{t(title)}</h3></div>'
                 f'<ul class="q-col-list">{rows}</ul></li>')
    return sec(s, f'{lead}<ol class="q-flow">{cols}</ol>', 6)


def s_a7():
    s = Q['a7']
    icons = ['sprout', 'book', 'cap']
    cards = ''.join(card(it, icons[i], 'q-card q-pillar') for i, it in enumerate(s.items))
    return sec(s, f'<div class="q-grid3" data-stagger>{cards}</div>', 7)


def s_a8():
    s = Q['a8']
    st, fu = s['structure'], s['followup']
    top, *councils = st.items
    council_html = ''.join(
        f'<li class="q-org-node rv"><span class="q-ic">{icon(ico)}</span><h4>{t(c.label)}</h4><p>{t(c.body)}</p></li>'
        for c, ico in zip(councils, ('users', 'home')))
    body = f'''
  <div class="q-org" id="structure">
    <h3 class="q-subh rv">{icon('network')}{t(strip_colon(st.title))}</h3>
    <div class="q-org-top rv"><span class="q-ic">{icon('star')}</span><h4>{t(top.label)}</h4><p>{t(top.body)}</p></div>
    <ul class="q-org-row">{council_html}</ul>
  </div>
  <div class="q-follow rv" id="followup">
    <span class="q-follow-ic" aria-hidden="true">{icon('repeat')}</span>
    <div><h3>{t(strip_colon(fu.title))}</h3><p>{t(fu.paras[0])}</p></div>
  </div>'''
    return sec(s, body, 8)


def s_a9():
    s = Q['a9']
    icons = ['coins', 'handshake', 'landmark', 'basket']
    cards = ''.join(card(it, icons[i], 'q-card q-fund') for i, it in enumerate(s.items))
    return sec(s, f'<div class="q-grid2" data-stagger>{cards}</div>', 9)


def s_a10():
    s = Q['a10']
    icons = {'periodic': ['shield', 'medal'], 'annual': ['tent', 'gift', 'scroll']}
    groups = ''
    for sub in s.subs:
        n, title = numbered(sub.title)
        rows = ''.join(
            f'<li class="q-award"><span class="q-badge" aria-hidden="true">{icon(icons[sub.id][j])}</span>'
            f'<div><h4>{t(it.label)}</h4><p>{t(it.body)}</p></div></li>' for j, it in enumerate(sub.items))
        groups += (f'<div class="q-award-grp q-{sub.id} rv" id="{sub.id}"><div class="q-col-h">{med(n)}'
                   f'<h3>{title_parts(title)}</h3></div><ul class="q-award-list">{rows}</ul></div>')
    return sec(s, f'<div class="q-awards">{groups}</div>', 10)


def s_a11():
    s = Q['a11']
    lv, kp = s['levels'], s['kpis']
    k1, m1 = split_kicker(lv.title)
    k2, m2 = split_kicker(kp.title)
    cards = ''
    for i, it in enumerate(kp.items, 1):
        m = re.match(r'^(KPI\s*\d+)\s*\((.+)\)$', it.label)
        tag, name = (m.group(1), m.group(2)) if m else ('', it.label)
        pct = re.search(r'(\d+)%', it.body)
        if pct:
            v = pct.group(1)
            viz = f'<div class="ring" data-ring style="--v:{v};--rc:var(--q-ring)"><span>{v}%</span></div>'
            body = emph(t(it.body), f'{v}%', 'strong')
        else:
            viz = f'<span class="q-kpi-ic" aria-hidden="true">{icon("hand-heart" if i == 4 else "building")}</span>'
            body = t(it.body)
        cards += (f'<li class="q-kpi rv" id="kpi{i}"><div class="q-kpi-top">{viz}<div class="q-kpi-h">'
                  f'<span class="q-kpi-tag">{t(tag)}</span><h4>{t(name)}</h4></div></div><p>{body}</p></li>')
    body = f'''
  <div class="q-subsec" id="levels">
    <h3 class="q-subh rv"><span class="q-k">{t(k1)}</span>{t(m1)}</h3>
    {table_html(lv.table, 'tbl q-tbl', m1)}
  </div>
  <div class="q-subsec" id="kpis">
    <h3 class="q-subh rv"><span class="q-k">{t(k2)}</span>{title_parts(m2)}</h3>
    <ul class="q-kpis">{cards}</ul>
  </div>'''
    return sec(s, body, 11)


# ------------------------------------------------------------------ page ---
def build():
    t1 = P['s2']['t1']
    buttons = (btn('teams.html#t1', 'تعرّف على الفرقة', 'users')
               + btn('index.html', 'الصفحة الرئيسية', 'home', 'btn-ghost')
               + f'<button type="button" class="btn btn-ghost" data-open-chat>{ic("sparkles")}<span>اسأل عن المبادرة</span></button>')
    sections = (s_intro() + s_goals() + s_a1() + s_a2() + s_a3() + s_a4() + s_a5() + s_a6()
                + s_a7() + s_a8() + s_a9() + s_a10() + s_a11())
    body = f'''{hero()}
<div class="wrap q-layout">
  {axis_nav()}
  <div class="q-main">{sections}
  </div>
</div>
{cta(t(t1.title), t(t1.items[1].body), buttons)}'''
    # page() runs title/description through plain() (quotes curled, escaped).
    page(PAGE, Q.meta['title'], body, Q['intro'].paras[-1], css=('css/quran.css',), js=('js/quran.js',))
    return PAGE
