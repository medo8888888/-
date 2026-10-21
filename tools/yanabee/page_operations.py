"""operations.html — «التشغيل والحوكمة» (content/yanabee/platform.txt, sections s4…s8).

Every content word comes from PLATFORM / QURAN via t(); the only text written here is
UI chrome (page label, aria labels, button labels). Numbers drawn as visuals (the 360
ring, the funding donut) are numbers printed in the adjacent text. Decorative figures
that repeat nearby words (principle tree, integration hub) are aria-hidden.
"""
import math
import re

import art
from core import (PAGE_LABEL, PLATFORM as P, QURAN as Q, SEC_ICON, btn, cta, ic, logo, page, paren, short,
                  split_kicker, strip_colon, svg, t, table_html)

PAGE = 'operations.html'
SECS = ['s4', 's5', 's6', 's7', 's8']
# One colour per section (tokens from base.css); text uses a darker/lighter mix in CSS.
COL = {'s4': '--sun', 's5': '--brand', 's6': '--leaf', 's7': '--sky', 's8': '--t6'}

# ------------------------------------------------------------- page icons ---
# Lucide (ISC) paths for icons core.ICONS does not have.
LOCAL = {
    'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    'ban': '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    'wallet': '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    'cloud-lightning': '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
    'git-fork': '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
    'refresh': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
}


def icon(name, cls='i'):
    return svg(LOCAL[name], cls) if name in LOCAL else ic(name, cls)


# ------------------------------------------------------------------ text ---
def hl(html, sub, cls):
    """Wrap an existing substring of rendered text in <mark> (the sentence stays intact)."""
    piece = t(sub)
    if piece not in html:
        raise ValueError(f'{PAGE}: {sub!r} not found in content')
    return html.replace(piece, f'<mark class="{cls}">{piece}</mark>', 1)


def halves():
    """The two halves of the operating principle, cut verbatim from the s5 paragraph."""
    para = P['s5'].paras[0]
    quoted = re.search(r'"([^"]+)"', para).group(1)
    plan, exe = quoted.split(' و', 1)
    assert plan in para and exe in para
    return plan, exe


def head(sid):
    """Section heading: kicker (ordinal) + h2; a trailing '(…)' of the title is set smaller."""
    kicker, main = split_kicker(P[sid].title)
    p = paren(main)
    h2 = f'{t(short(main))} <span class="op-paren">({t(p)})</span>' if p else t(main)
    return (f'<header class="sec-head rv"><div><span class="kicker">{icon(SEC_ICON[sid])}{t(kicker)}</span>'
            f'<h2>{h2}</h2></div></header>')


SPOT = {'s4': 'marketing', 's6': 'funding', 's7': 'legal', 's8': 'integration'}


def sec(sid, body, cls=''):
    spot = art.spot(SPOT[sid], 'o' + sid) if sid in SPOT else ''
    return f'''
<section class="sec op-sec {cls}" id="{sid}" style="--sc:var({COL[sid]})">
  <div class="wrap">
    {head(sid)}
    {spot}
    {body}
  </div>
</section>'''


# ------------------------------------------------------------------ hero ---
def hero():
    plan, exe = halves()
    lead = hl(hl(t(strip_colon(P['s5'].paras[0])), plan, 'op-hl op-hl-a'), exe, 'op-hl op-hl-b')
    rows = ''
    for sid in SECS:
        k, main = split_kicker(P[sid].title)
        rows += (f'<li style="--i:{SECS.index(sid)}"><a class="op-idx" href="#{sid}" style="--sc:var({COL[sid]})">'
                 f'<span class="op-idx-ic" aria-hidden="true">{icon(SEC_ICON[sid])}</span>'
                 f'<span class="op-idx-t"><small>{t(k)}</small> <span>{t(main)}</span></span>'
                 f'{icon("arrow-down", "i op-idx-go")}</a></li>')
    return f'''
<section class="hero hero-page op-hero">
  <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
  <div class="op-photo" aria-hidden="true">{art.photo('hero-operations', eager=True)}</div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow rv">{logo(22, 'eb-operations', 'eb-logo')}{t(P.meta['title'])}</span>
      <h1 class="rv">{PAGE_LABEL[PAGE]}</h1>
      <p class="op-lead rv">{lead}</p>
    </div>
    <nav class="op-idx-box rv" aria-label="أقسام الصفحة">
      <p class="op-idx-cap" aria-hidden="true">{icon('layers')}<span>في هذه الصفحة</span></p>
      <ol class="op-idx-list op-stg" data-reveal>{rows}</ol>
    </nav>
  </div>
  <div class="wrap op-banner" aria-hidden="true">{art.ops_banner('opb')}</div>
</section>'''


# -------------------------------------------------------------------- s4 ---
# audience -> (icon, colour); the ring's quadrants sit next to the matching card on wide screens.
AUD = [('cap', '--sky'), ('home', '--t7'), ('handshake', '--leaf'), ('tv', '--t6')]


def ring360():
    """Decorative 360° ring: four arcs (one per audience) + orbit; '360 درجة' is in the section title."""
    c, r, sw = 130, 100, 16
    C = 2 * math.pi * r
    q = C / 4
    gap = 7
    # clockwise from the top: top-right (card 1), bottom-right (3), bottom-left (4), top-left (2)
    order = [0, 2, 3, 1]
    arcs = ''
    for slot, idx in enumerate(order):
        arcs += (f'<circle class="op-arc" cx="{c}" cy="{c}" r="{r}" style="--ac:var({AUD[idx][1]});'
                 f'--len:{q - gap:.2f};--C:{C:.2f};--off:{-(slot * q + gap / 2):.2f};--dl:{slot * .14:.2f}s"/>')
    dots = ''
    for ang, idx in ((-45, 0), (45, 2), (135, 3), (225, 1)):
        a = math.radians(ang)
        x, y = c + 124 * math.cos(a), c + 124 * math.sin(a)
        # wide screens: a horizontal link from the orbit dot to the edge of the matching card
        x2 = 275 if x > c else -15
        dots += (f'<path class="op-conn" d="M{x + (6 if x > c else -6):.1f} {y:.1f}H{x2}" style="--ac:var({AUD[idx][1]})"/>'
                 f'<circle class="op-orb-dot" cx="{x:.1f}" cy="{y:.1f}" r="5.5" style="--ac:var({AUD[idx][1]})"/>')
    return f'''
    <div class="op-ring" data-reveal aria-hidden="true">
      <svg viewBox="0 0 260 260" focusable="false">
        <circle class="op-orbit" cx="{c}" cy="{c}" r="124"/>
        {dots}
        <circle class="op-disc" cx="{c}" cy="{c}" r="{r - sw / 2 - 6}"/>
        <circle class="op-track" cx="{c}" cy="{c}" r="{r}" style="stroke-width:{sw}"/>
        <g transform="rotate(-90 {c} {c})" style="stroke-width:{sw}">{arcs}</g>
      </svg>
      <span class="op-ring-c"><span class="op-ring-ic">{icon('refresh')}</span><b>360</b><span>درجة</span></span>
    </div>'''


def s4():
    s = P['s4']
    cards = ''
    for i, (it, (ico, col)) in enumerate(zip(s.items, AUD)):
        body = t(it.body)
        if i == 0:
            body = hl(body, 'فريقك سر قوتك', 'op-hl op-hl-q')
        cards += (f'<li class="op-aud" style="--ac:var({col});--i:{i}">'
                  f'<div class="op-aud-h"><span class="op-aud-ic" aria-hidden="true">{ic(ico)}</span>'
                  f'<h3>{t(strip_colon(it.label))}</h3></div><p>{body}</p></li>')
    body = f'''
    <div class="op-360">
      {ring360()}
      <ul class="op-auds op-stg" data-reveal>{cards}</ul>
    </div>'''
    return sec('s4', body, 'op-s4')


# -------------------------------------------------------------------- s5 ---
def tree_svg():
    """One → few → many: centralised planning branching into decentralised execution (decorative)."""
    top = (160, 20)
    mids = [(58, 94), (160, 94), (262, 94)]
    leaves = [(mx + dx, 166) for mx, _ in mids for dx in (-36, 0, 36)]

    def curve(a, b):
        my = (a[1] + b[1]) / 2
        return f'M{a[0]} {a[1]}C{a[0]} {my} {b[0]} {my} {b[0]} {b[1]}'

    lines = ''.join(f'<path class="op-tl op-tl-1" pathLength="1" d="{curve(top, m)}"/>' for m in mids)
    lines += ''.join(f'<path class="op-tl op-tl-2" pathLength="1" d="{curve(mids[i // 3], lf)}"/>'
                     for i, lf in enumerate(leaves))
    nodes = f'<circle class="op-tn op-tn-0" cx="{top[0]}" cy="{top[1]}" r="13"/><circle class="op-tn-core" cx="{top[0]}" cy="{top[1]}" r="4.5"/>'
    nodes += ''.join(f'<circle class="op-tn op-tn-1" cx="{x}" cy="{y}" r="8.5"/>' for x, y in mids)
    nodes += ''.join(f'<circle class="op-tn op-tn-2" cx="{x}" cy="{y}" r="6" style="--d:{.5 + i * .04:.2f}s"/>'
                     for i, (x, y) in enumerate(leaves))
    return f'<svg viewBox="0 0 320 186" focusable="false"><g fill="none">{lines}</g>{nodes}</svg>'


FLOW_ICONS = ['landmark', 'smartphone', 'award']
BRANCH = [('users', 'القيادة بالأقران'), ('star', 'برنامج إعداد وتأهيل قادة الفرق الموهوبين')]


def s5():
    s = P['s5']
    plan, exe = halves()
    para = hl(hl(t(s.paras[0]), plan, 'op-hl op-hl-a'), exe, 'op-hl op-hl-b')
    principle = f'''
      <div class="op-principle rv">
        <span class="op-principle-ic" aria-hidden="true">{icon('git-fork')}</span>
        <p class="op-principle-t">{para}</p>
        <figure class="op-tree" data-reveal aria-hidden="true">
          <span class="op-tag op-tag-a">{ic('compass')}{t(plan)}</span>
          {tree_svg()}
          <span class="op-tag op-tag-b">{ic('network')}{t(exe)}</span>
        </figure>
      </div>'''
    nodes = ''
    for it, ico in zip(s.items, FLOW_ICONS):
        kids = ''
        if it.children:
            for c, (cico, key) in zip(it.children, BRANCH):
                kids += (f'<li class="op-br"><span class="op-br-ic" aria-hidden="true">{ic(cico)}</span>'
                         f'<p>{hl(t(c.text), key, "op-hl op-hl-k")}</p></li>')
            kids = f'<ul class="op-branches">{kids}</ul>'
        body = f'<p>{t(it.body)}</p>' if it.body else ''
        nodes += (f'<li class="op-node{" op-node-fork" if kids else ""}">'
                  f'<span class="op-node-ic" aria-hidden="true">{ic(ico)}</span>'
                  f'<div class="op-node-card"><h3>{t(strip_colon(it.label))}</h3>{body}</div>{kids}</li>')
    body = f'''
    <div class="op-gov">
      {principle}
      <ol class="op-flow rv" data-reveal>{nodes}</ol>
    </div>'''
    return sec('s5', body, 'alt op-s5')


# -------------------------------------------------------------------- s6 ---
FUND = ['--brand', '--sky', '--sun']  # one colour per funding source (60 / 30 / 10)


def donut(values):
    """Decorative donut of the funding split; the legend next to it is the data."""
    c, r = 130, 84
    C = 2 * math.pi * r
    gap = 3.2
    segs, labels, start = '', '', 0
    for i, (v, col) in enumerate(zip(values, FUND)):
        segs += (f'<circle class="op-seg" cx="{c}" cy="{c}" r="{r}" style="--fc:var({col});'
                 f'--len:{v / 100 * C - gap:.2f};--C:{C:.2f};--off:{-(start / 100 * C + gap / 2):.2f};--dl:{.15 + i * .28:.2f}s"/>')
        a = math.radians(-90 + (start + v / 2) * 3.6)
        lr = r + 42
        labels += (f'<text class="op-seg-l" x="{c + lr * math.cos(a):.1f}" y="{c + lr * math.sin(a):.1f}" '
                   f'style="--fc:var({col});--dl:{.6 + i * .28:.2f}s">{v}%</text>')
        start += v
    assert start == 100, values
    return f'''
        <div class="op-donut" data-reveal aria-hidden="true">
          <svg viewBox="0 0 260 260" focusable="false">
            <circle class="op-seg-track" cx="{c}" cy="{c}" r="{r}"/>
            <g transform="rotate(-90 {c} {c})">{segs}</g>
            {labels}
          </svg>
          <span class="op-donut-c">{ic('coins')}</span>
        </div>'''


def s6():
    src, gov = P['s6'].items
    vals = [int(re.match(r'^(\d+)%$', c.label).group(1)) for c in src.children]
    legend = ''
    for i, (c, col) in enumerate(zip(src.children, FUND)):
        legend += (f'<li style="--fc:var({col});--i:{i + 2}"><b class="op-pct">{t(c.label)}</b>'
                   f'<p>{t(c.body)}</p></li>')
    gbody = hl(t(gov.body), 'العهدة الإلكترونية المسبقة الدفع', 'op-hl op-hl-f')
    body = f'''
    <div class="op-fin">
      <article class="op-chart rv" aria-labelledby="fund-h">
        <h3 id="fund-h"><span class="op-h-ic" aria-hidden="true">{ic('coins')}</span>{t(strip_colon(src.label))}</h3>
        <div class="op-chart-body">
          {donut(vals)}
          <ul class="op-legend op-stg" data-reveal>{legend}</ul>
        </div>
      </article>
      <article class="op-fgov rv" aria-labelledby="fgov-h">
        <div class="op-pcard" aria-hidden="true">
          <span class="op-pcard-chip"></span>{logo(30, 'pcard', 'op-pcard-logo')}
          <span class="op-pcard-wave"></span><span class="op-pcard-num"><i></i><i></i><i></i><i></i></span>
        </div>
        <h3 id="fgov-h"><span class="op-h-ic" aria-hidden="true">{icon('wallet')}</span>{t(strip_colon(gov.label))}</h3>
        <p>{gbody}</p>
      </article>
    </div>'''
    return sec('s6', body, 'op-s6')


# -------------------------------------------------------------------- s7 ---
LEGAL = [('shield', '--sky'), ('lock', '--t4'), ('lightbulb', '--sun')]
RISK = ['cloud-lightning', 'pin']


def s7():
    items = P['s7'].items
    cards = ''
    for i, (it, (ico, col)) in enumerate(zip(items[:3], LEGAL)):
        cards += (f'<li class="op-lg" style="--ac:var({col});--i:{i}"><span class="op-lg-ic" aria-hidden="true">{ic(ico)}</span>'
                  f'<h3>{t(strip_colon(it.label))}</h3><p>{t(it.body)}</p></li>')
    risk = items[3]
    scen = ''
    for c, ico in zip(risk.children, RISK):
        scen += (f'<li class="op-scen"><div class="op-scen-k"><span class="op-scen-ic" aria-hidden="true">{icon(ico)}</span>'
                 f'<h4>{t(strip_colon(c.label))}</h4></div>'
                 f'<span class="op-scen-arrow" aria-hidden="true">{ic("arrow-left")}</span><p>{t(c.body)}</p></li>')
    body = f'''
    <ul class="op-lgs op-stg" data-reveal>{cards}</ul>
    <div class="op-risk rv">
      <div class="op-risk-h">
        <span class="op-risk-ic" aria-hidden="true">{ic('alert')}</span>
        <h3>{t(strip_colon(risk.label))}</h3>
      </div>
      <ul class="op-scens">{scen}</ul>
    </div>'''
    return sec('s7', body, 'alt op-s7')


# -------------------------------------------------------------------- s8 ---
ENT_ICON = ['building', 'hand-heart', 'tent', 'ban']


def hub(names):
    """Decorative integration hub: the platform in the centre, the four entities around it
    (the fourth row is a total ban, drawn as a cut link). Labels = the table's first column."""
    pos = [(50, 13), (87, 50), (13, 50), (50, 87)]
    lines = ''
    for i, (x, y) in enumerate(pos):
        cls = 'op-hub-ln op-hub-cut' if i == 3 else 'op-hub-ln'
        lines += f'<path class="{cls}" d="M{x} {y}L50 50"/>'
    nodes = ''
    for i, ((x, y), name, ico) in enumerate(zip(pos, names, ENT_ICON)):
        cls = 'op-hub-n' + (' op-hub-ban' if i == 3 else '') + (' op-hub-top' if i == 0 else '')
        nodes += (f'<span class="{cls}" style="left:{x}%;top:{y}%;--d:{.2 + i * .12:.2f}s">'
                  f'<span class="op-hub-dot">{icon(ico)}</span><span class="op-hub-l">{t(name)}</span></span>')
    return f'''
      <figure class="op-hub" data-reveal aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">{lines}</svg>
        <span class="op-hub-x" style="left:50%;top:68.5%">{ic('x')}</span>
        <span class="op-hub-core"><span class="op-hub-pulse"></span>{logo(58, 'hub', 'op-hub-logo')}</span>
        {nodes}
      </figure>'''


def s8():
    s = P['s8']
    rows = s.table
    names = [r[0] for r in rows[1:]]
    lead = hl(t(s.paras[0]), 'منصة استيعابية وتكاملية', 'op-hl op-hl-v')
    tbl = table_html(rows, 'tbl op-tbl', caption=split_kicker(s.title)[1])
    for name, ico in zip(names, ENT_ICON):  # an icon before each entity name (row headers)
        cell = f'>{t(name)}</th>'
        assert cell in tbl, name
        tbl = tbl.replace(cell, f'><span class="op-ent">{icon(ico)}<span>{t(name)}</span></span></th>', 1)
    body = f'''
    <div class="op-int">
      <div class="op-int-copy rv">
        <p class="op-int-lead">{lead}</p>
      </div>
      {hub(names)}
    </div>
    {tbl}'''
    return sec('s8', body, 'op-s8')


# ------------------------------------------------------------------ page ---
def build():
    buttons = (btn('teams.html', PAGE_LABEL['teams.html'], 'users')
               + btn('quran.html', t(Q.meta['title']), 'book-open', 'btn-ghost')
               + f'<button type="button" class="btn btn-ghost" data-open-chat>{ic("sparkles")}<span>اسأل عن التشغيل والحوكمة</span></button>')
    body = (hero() + s4() + s5() + s6() + s7() + s8()
            + cta(t(P.meta['title']), t(P.meta['subtitle'].strip('()')), buttons))
    desc = P['s5'].paras[0] + ' ' + '، '.join(strip_colon(split_kicker(P[s].title)[1]) for s in SECS)
    page(PAGE, PAGE_LABEL[PAGE], body, desc, css=('css/operations.css',))
    return PAGE
