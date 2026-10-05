"""Original inline-SVG illustrations for the Yanabee site (decorative, aria-hidden, no text).

Every function returns an SVG string. Colours are never written here: shapes carry CSS
classes defined in site/yanabee/css/art.css (tokens for light + dark, team tint through
--tc), so both themes work. Animated parts live in groups WITHOUT a transform attribute
(art.css animates the individual `translate` / `rotate` / `scale` properties).
Each call takes a `uid` so gradient ids stay unique when a scene is used twice per page.

Class vocabulary (see art.css):  fills  sk1-4 skin · hr1-3 hair · tc team · tl team-light ·
tw team-wash · td team-dark · pa paper · p2 paper-shade · nk ink · n2 ink-soft · yl light-yellow ·
or amber · rd red · lf leaf · l2 leaf-dark · bl blue · b2 blue-dark · ro rose · wd wood · w2 wood-dark ·
st stone · hl1-3 hills · wn window · sh shadow;  strokes  ln lp lt ly lw lg (fill none).
"""
import math

VB = '0 0 480 320'


# ------------------------------------------------------------------ basics ---
def _svg(body, vb=VB, cls='', style='', par=''):
    st = f' style="{style}"' if style else ''
    pa = f' preserveAspectRatio="{par}"' if par else ''
    return (f'<svg class="art {cls}" viewBox="{vb}"{pa}{st} aria-hidden="true" focusable="false">{body}</svg>')


def at(x, y, inner, s=1, rot=0):
    sc = f' scale({s})' if s != 1 else ''
    r = f' rotate({rot})' if rot else ''
    return f'<g transform="translate({x} {y}){sc}{r}">{inner}</g>'


def anim(cls, inner, d=0, extra=''):
    st = f' style="--d:{d}s{extra}"' if (d or extra) else ''
    return f'<g class="{cls}"{st}>{inner}</g>'


def sky(uid, w=480, h=320, tint=22, id_='sk'):
    return (f'<defs><linearGradient id="{id_}-{uid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" style="stop-color:color-mix(in oklab,var(--tc) {tint}%,var(--a-sky1))"/>'
            f'<stop offset="1" style="stop-color:var(--a-sky2)"/></linearGradient></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#{id_}-{uid})"/>')


def glow_def(uid, name='gw', cls='yl'):
    return (f'<radialGradient id="{name}-{uid}"><stop offset="0" class="gs {cls}"/><stop offset="1" class="gs {cls}" '
            f'style="stop-opacity:0"/></radialGradient>')


def cloud(x, y, s=1, d=0):
    return at(x, y, anim('fl', '<path class="cl" d="M0 22a11 11 0 0 1 9-11 15 15 0 0 1 28 2 10 10 0 0 1 3 20H10A10 10 0 0 1 0 22z"/>', d), s)


def star8(r=9):
    a, b = r, r * .72
    pts = []
    for k in range(16):
        ang = math.radians(k * 22.5 - 90)
        rr = a if k % 2 == 0 else b * .78
        pts.append(f'{rr * math.cos(ang):.1f} {rr * math.sin(ang):.1f}')
    return 'M' + 'L'.join(pts) + 'Z'


def spark(x, y, s=1, d=0, cls='yl'):
    return at(x, y, anim('tk', f'<path class="{cls}" d="M0 -7C1 -2 2 -1 7 0 2 1 1 2 0 7-1 2-2 1-7 0-2-1-1-2 0 -7z"/>', d), s)


def gear(cx, cy, r, teeth, cls, hole=True, d=0, rev=False):
    pts = []
    n = teeth * 4
    for k in range(n):
        ang = math.radians(k * 360 / n)
        rr = r if (k % 4) in (0, 1) else r * .8
        pts.append(f'{cx + rr * math.cos(ang):.1f} {cy + rr * math.sin(ang):.1f}')
    p = 'M' + 'L'.join(pts) + 'Z'
    h = f'<circle cx="{cx}" cy="{cy}" r="{r * .3:.1f}" class="gh"/>' if hole else ''
    return anim('gr' + (' grr' if rev else ''), f'<path class="{cls}" d="{p}" stroke-linejoin="round"/>{h}', d)


# ------------------------------------------------------------------ people ---
def person(x, y, s=1, skin='sk1', top='tc', bot='nk', hair='hr1', kind='boy', arms=(8, 8), legs=(0, 0),
           sit=False, scarf=None, hat='', salute=False, tie='', hold_l='', hold_r=''):
    """Faceless friendly character, feet at (x, y). kind: boy | girl | hijab."""
    sh = '<ellipse cx="0" cy="1" rx="19" ry="4.2" class="sh"/>'
    up = 12 if sit else 0
    g = [sh]
    longdress = kind == 'hijab'
    if sit:
        lc = top if kind != 'boy' else bot
        g.append(f'<ellipse cx="0" cy="-9" rx="29" ry="10" class="{lc}"/>'
                 f'<ellipse cx="-17" cy="-4" rx="8" ry="4" class="nk"/><ellipse cx="17" cy="-4" rx="8" ry="4" class="nk"/>')
    else:
        if longdress:
            g.append('<ellipse cx="-6" cy="-1" rx="7" ry="3.2" class="nk"/><ellipse cx="6" cy="-1" rx="7" ry="3.2" class="nk"/>')
        else:
            for sx, a in ((-5, legs[0]), (5, legs[1])):
                g.append(f'<g transform="rotate({a} {sx} -30)"><rect x="{sx - 4.5}" y="-31" width="9" height="30" rx="4.5" class="{bot}"/>'
                         f'<ellipse cx="{sx + (1 if sx > 0 else -1)}" cy="-1.5" rx="7" ry="3.3" class="nk"/></g>')
    u = []
    # arms behind torso start at the shoulders
    def arm(sx, a, right):
        ang = -a if right else a
        hand = f'<circle cx="{sx}" cy="-30" r="4.8" class="{skin}"/>' if True else ''
        return (f'<g transform="rotate({ang} {sx} -58)"><rect x="{sx - 4.2}" y="-62" width="8.4" height="31" rx="4.2" class="{top}"/>'
                f'<circle cx="{sx}" cy="-29.5" r="4.8" class="{skin}"/></g>')
    if salute:
        u.append(arm(-15, arms[0], False))
    else:
        u += [arm(-15, arms[0], False), arm(15, arms[1], True)]
    if kind == 'boy':
        u.append(f'<rect x="-15" y="-66" width="30" height="40" rx="12" class="{top}"/>')
    elif kind == 'girl':
        u.append(f'<path d="M-14 -62Q-14 -68 -8 -68H8Q14 -68 14 -62L21 -22Q21 -18 17 -18H-17Q-21 -18 -21 -22Z" class="{top}"/>')
    else:
        u.append(f'<path d="M-14 -62Q-14 -68 -8 -68H8Q14 -68 14 -62L23 -8Q23 -3 18 -3H-18Q-23 -3 -23 -8Z" class="{top}"/>')
    if salute:  # right arm bent up to the brow
        u.append(f'<path d="M15 -58L33 -66L20 -86" fill="none" stroke-width="8.4" stroke-linecap="round" stroke-linejoin="round" class="ls-{top}"/>'
                 f'<circle cx="19" cy="-88" r="4.8" class="{skin}"/>')
    if tie:
        u.append(f'<path d="M-9 -66L9 -66L0 -54Z" class="{tie}"/>')
    u.append(f'<rect x="-4.5" y="-72" width="9" height="9" rx="3" class="{skin}"/>')
    # head + hair / scarf
    if kind == 'hijab':
        sc = scarf or 'tl'
        u.append(f'<path d="M0 -99C-13 -99 -20 -91 -20 -80C-20 -72 -22 -66 -27 -60L0 -54L27 -60C22 -66 20 -72 20 -80C20 -91 13 -99 0 -99Z" class="{sc}"/>'
                 f'<ellipse cx="0" cy="-80" rx="10.4" ry="12" class="{skin}"/>'
                 f'<path d="M-11 -84C-6 -92 6 -92 11 -84C6 -89 -6 -89 -11 -84Z" class="{sc}"/>')
    else:
        if kind == 'girl':
            u.append(f'<path d="M-15 -80C-17 -64 -14 -62 -9 -60L-9 -76ZM15 -80C17 -64 14 -62 9 -60L9 -76Z" class="{hair}"/>'
                     f'<ellipse cx="0" cy="-82" rx="15.5" ry="16" class="{hair}"/>')
        u.append(f'<circle cx="0" cy="-80" r="13" class="{skin}"/>')
        if kind == 'girl':
            u.append(f'<path d="M-13 -82C-10 -97 10 -97 13 -82C9 -90 3 -91 -2 -88C-7 -86 -11 -86 -13 -82Z" class="{hair}"/>')
        else:
            u.append(f'<path d="M-13.5 -82C-14 -97 14 -97 13.5 -82C9 -88 4 -89 0 -87C-5 -85 -10 -86 -13.5 -82Z" class="{hair}"/>')
    u.append(hat)
    if hold_l:
        u.append(hold_l)
    if hold_r:
        u.append(hold_r)
    g.append(f'<g transform="translate(0 {up})">{"".join(u)}</g>')
    return at(x, y, ''.join(g), s)


def scout_hat(c='wd'):
    return (f'<ellipse cx="0" cy="-90" rx="21" ry="5" class="{c}"/><path d="M-11 -90C-11 -104 11 -104 11 -90Z" class="{c}"/>'
            f'<rect x="-11" y="-93.5" width="22" height="4" class="or"/>')


# --------------------------------------------------------------- scenery ---
def hills(uid, y=200, tint=10):
    return (f'<path class="hl1" d="M0 {y}Q70 {y - 42} 150 {y - 8}T310 {y - 14}T480 {y - 28}V320H0z"/>'
            f'<path class="hl2" d="M0 {y + 28}Q100 {y - 6} 205 {y + 22}T410 {y + 14}T480 {y + 20}V320H0z"/>'
            f'<path class="hl3" d="M0 {y + 52}Q130 {y + 36} 250 {y + 50}T480 {y + 44}V320H0z"/>')


def pine(x, y, s=1, d=0, c1='lf', c2='l2'):
    return at(x, y, '<rect x="-4" y="-18" width="8" height="18" rx="2" class="wd"/>'
              + anim('sw', f'<path class="{c2}" d="M0 -92L24 -50H-24z"/><path class="{c1}" d="M0 -74L28 -30H-28z"/>'
                     f'<path class="{c2}" d="M0 -56L32 -14H-32z"/>', d), s)


def round_tree(x, y, s=1, d=0, c1='lf', c2='l2'):
    return at(x, y, '<path class="wd" d="M-6 0L-4 -50H4L6 0z"/>' + anim(
        'sw', f'<circle cx="0" cy="-70" r="30" class="{c2}"/><circle cx="-18" cy="-52" r="20" class="{c1}"/>'
              f'<circle cx="19" cy="-54" r="21" class="{c1}"/><circle cx="2" cy="-84" r="22" class="{c1}"/>', d), s)


def sun(x, y, r=24, d=0):
    return (f'<circle cx="{x}" cy="{y}" r="{r * 2.4}" fill="url(#gw-S)" class="pd"/>'
            + at(x, y, anim('gr slow', ''.join(f'<rect x="-2" y="-{r + 14}" width="4" height="9" rx="2" class="or" transform="rotate({k * 45})"/>'
                                               for k in range(8)))) + f'<circle cx="{x}" cy="{y}" r="{r}" class="yl"/>')


def flame(x, y, s=1):
    return at(x, y, anim('fk', '<path class="or" d="M0 0C-24 -4-26 -30-8 -54-8 -40 3 -40 6 -50 20 -34 26 -8 0 0z"/>'
                               '<path class="yl" d="M0 0C-13 -2-14 -18-4 -32-3 -22 4 -22 5 -28 12 -18 14 -4 0 0z"/>'
                               '<path class="pa" d="M0 0C-6 -1-6 -9 0 -16 6 -9 6 -1 0 0z"/>'), s)


def heart(x, y, s=1, cls='ro', d=0, pulse=True):
    p = f'<path class="{cls}" d="M0 10C-18 -2-14 -18 -6 -18 -2 -18 0 -15 0 -13 0 -15 2 -18 6 -18 14 -18 18 -2 0 10z"/>'
    return at(x, y, anim('pd2' if pulse else '', p, d), s)


# ============================================================ TEAM SCENES ===
def _t1(u):
    arches = ''
    for x0 in (50, 190, 330):
        arches += (f'<path class="tl" d="M{x0 - 6} 240V148a56 56 0 0 1 112 0V240z"/><path class="wn" d="M{x0} 240V148a50 50 0 0 1 100 0V240z"/>'
                   f'<path class="tw" d="M{x0 + 14} 240V150a36 36 0 0 1 72 0V240z" opacity=".55"/>')
    stars = ''.join(at(x, y, f'<path class="tl" d="{star8(9)}"/>') for x, y in ((170, 150), (310, 150), (30, 150), (450, 150)))
    tw = spark(100, 128, .8, 0) + spark(240, 120, 1, .7) + spark(380, 132, .7, 1.4) + spark(120, 170, .5, 1.1) + spark(360, 176, .6, .3)
    lantern = at(240, 0, anim('sw sw-t', '<path class="ln" d="M0 0V52" stroke-width="2"/>'
                              '<circle cx="0" cy="52" r="46" fill="url(#gw-%s)" class="pd"/>' % u
                              + '<path class="td" d="M-9 52L9 52L15 62L-15 62z"/><path class="or" d="M-15 62H15L21 90L11 104H-11L-21 90z"/>'
                                '<path class="yl" d="M-9 66H9L13 88L7 98H-7L-13 88z"/><path class="td" d="M-12 104H12L8 110H-8z"/>'
                                '<circle cx="0" cy="48" r="4" class="or"/>'))
    carpet = ('<ellipse cx="240" cy="272" rx="224" ry="40" class="td" opacity=".3"/><ellipse cx="240" cy="268" rx="214" ry="35" class="tl"/>'
              '<ellipse cx="240" cy="268" rx="190" ry="29" class="tw" opacity=".7"/>'
              '<ellipse cx="240" cy="268" rx="190" ry="29" fill="none" class="lp" stroke-width="2" stroke-dasharray="3 7"/>')
    rehal = ('<path class="ln" d="M214 296L266 254M266 296L214 254" stroke-width="7" style="stroke:var(--a-wd)"/>'
             '<path class="td" d="M240 258C228 249 212 249 202 254V272C212 267 228 267 240 275C252 267 268 267 278 272V254C268 249 252 249 240 258z"/>'
             '<path class="pa" d="M240 255C229 247 215 247 206 252V268C215 264 229 264 240 271C251 264 265 264 274 268V252C265 247 251 247 240 255z"/>'
             '<path class="lt" d="M212 256C222 253 230 255 236 259M212 262C222 259 230 261 236 265M268 256C258 253 250 255 244 259M268 262C258 259 250 261 244 265" stroke-width="1.6" opacity=".6"/>')
    rays = anim('pd', '<path d="M240 250L186 128H294z" fill="url(#gr-%s)"/>' % u)
    ppl = (person(206, 246, .8, 'sk2', 'pa', 'n2', 'hr1', 'boy', (10, 10), sit=True)
           + person(274, 246, .8, 'sk3', 'tc', 'tc', 'hr2', 'hijab', (8, 8), sit=True, scarf='td')
           + person(118, 280, 1, 'sk1', 'tl', 'n2', 'hr1', 'boy', (12, 28), sit=True)
           + person(172, 296, 1, 'sk4', 'tc', 'tc', 'hr1', 'hijab', (10, 24), sit=True, scarf='tl')
           + person(308, 296, 1, 'sk2', 'td', 'n2', 'hr3', 'boy', (28, 10), sit=True)
           + person(362, 280, 1, 'sk1', 'pa', 'pa', 'hr2', 'hijab', (24, 12), sit=True, scarf='tc'))
    defs = (f'<defs>{glow_def(u)}<linearGradient id="gr-{u}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="gs yl" style="stop-opacity:.55"/>'
            f'<stop offset="1" class="gs yl" style="stop-opacity:0"/></linearGradient></defs>')
    return (sky(u, tint=14) + defs + '<rect y="60" width="480" height="190" class="tw"/>' + arches + stars + tw
            + '<rect y="238" width="480" height="82" class="fr"/>' + carpet + lantern + rays + rehal + ppl)


def _t2(u):
    tent = at(140, 262, '<path class="tl" d="M-70 0L0 -78L70 0z"/><path class="tc" d="M0 -78L70 0H30z" opacity=".55"/>'
              '<path class="td" d="M-20 0L0 -46L20 0z"/><path class="ln" d="M0 -78V-92" stroke-width="3"/>'
              '<path class="lp" d="M-70 0L0 -78L70 0" stroke-width="3"/>'
              '<path class="ln" d="M-70 0L-96 8M70 0L96 8" stroke-width="1.5"/><circle cx="-96" cy="8" r="2.5" class="wd"/><circle cx="96" cy="8" r="2.5" class="wd"/>')
    flag = at(398, 270, '<rect x="-2.5" y="-150" width="5" height="150" rx="2.5" class="p2"/><circle cx="0" cy="-152" r="5" class="or"/>'
              + anim('fg', '<path class="tc" d="M2.5 -144C20 -152 34 -138 56 -146V-106C34 -98 20 -112 2.5 -104z"/>'
                           '<path class="pa" d="M2.5 -128C20 -136 34 -122 56 -130V-124C34 -116 20 -130 2.5 -122z" opacity=".55"/>'))
    fire = (at(240, 276, '<ellipse cx="0" cy="2" rx="46" ry="8" class="sh"/><circle cx="0" cy="-20" r="60" fill="url(#gw-%s)" class="pd"/>' % u
               + ''.join(f'<ellipse cx="{x}" cy="{y}" rx="7" ry="4.5" class="st"/>' for x, y in ((-34, 0), (-18, 6), (18, 6), (34, 0)))
               + '<rect x="-30" y="-8" width="60" height="9" rx="4.5" class="w2" transform="rotate(-10)"/><rect x="-30" y="-8" width="60" height="9" rx="4.5" class="wd" transform="rotate(10)"/>')
            + flame(240, 270, 1.1)
            + at(240, 220, anim('sp', '<circle cx="-8" cy="0" r="2" class="yl"/>', 0) + anim('sp', '<circle cx="9" cy="6" r="1.8" class="or"/>', .8)
                 + anim('sp', '<circle cx="2" cy="2" r="1.5" class="yl"/>', 1.5)))
    ppl = (person(330, 284, 1.02, 'sk2', 'tc', 'n2', 'hr1', 'boy', (6, 6), salute=True, hat=scout_hat('or'), tie='rd')
           + person(190, 300, .98, 'sk3', 'lf', 'n2', 'hr2', 'boy', (14, 24), sit=True, hat=scout_hat('wd'), tie='or')
           + person(290, 306, .98, 'sk1', 'l2', 'l2', 'hr1', 'hijab', (22, 12), sit=True, scarf='or'))
    return (sky(u, tint=9) + f'<defs>{glow_def(u)}</defs>' + sun(400, 66, 22)
            + cloud(60, 50, 1) + cloud(250, 36, .7, 1.5)
            + '<path class="ln" d="M170 90q6-6 12 0q6-6 12 0M210 70q5-5 10 0q5-5 10 0" stroke-width="2"/>'
            + hills(u, 196)
            + pine(34, 250, 1.35, 0) + pine(86, 238, 1.0, .6) + pine(448, 244, 1.25, .3) + pine(430, 226, .8, .9, 'lf', 'l2')
            + tent + flag + fire + ppl)


def _t3(u):
    stands = '<path class="hl1" d="M0 214L40 168H440L480 214z"/>'
    crowd = ''
    import random
    rnd = random.Random(3)
    for row, y in enumerate((178, 190, 202)):
        for k in range(26):
            x = 26 + k * 17 + (row % 2) * 8
            if 44 < x < 436:
                cls = rnd.choice(['tc', 'tl', 'yl', 'bl', 'pa', 'ro', 'tc'])
                crowd += f'<circle cx="{x}" cy="{y}" r="4.2" class="{cls}" opacity=".85"/>'
    field = ('<rect y="214" width="480" height="106" class="lf"/>'
             + ''.join(f'<rect y="{y}" width="480" height="{h}" class="l2" opacity=".5"/>' for y, h in ((214, 12), (246, 20), (292, 28)))
             + '<ellipse cx="200" cy="280" rx="96" ry="22" fill="none" class="lp" stroke-width="3" opacity=".8"/>'
               '<path class="lp" d="M0 252H480" stroke-width="3" opacity=".6"/><path class="lp" d="M200 258V302" stroke-width="3" opacity=".8"/>')
    goal = at(400, 252, ''.join(f'<path class="lp" d="M{x} -56V0" stroke-width="1.5" opacity=".7"/>' for x in range(-40, 44, 10))
              + ''.join(f'<path class="lp" d="M-48 {y}H48" stroke-width="1.5" opacity=".7"/>' for y in range(-48, 0, 10))
              + '<path class="lp" d="M-50 4V-60H50V4" stroke-width="6"/>')
    ball = at(168, 268, anim('bx', anim('by', anim('spin', '<circle r="10" class="pa"/><path class="nk" d="M0 -4L4 -1L2.5 4H-2.5L-4 -1z"/>'
                                                          '<path class="ln" d="M0 -4V-10M4 -1L10 -3M2.5 4L6 9M-2.5 4L-6 9M-4 -1L-10 -3" stroke-width="1.5"/>'))))
    ppl = (person(112, 286, 1.02, 'sk2', 'tc', 'pa', 'hr1', 'boy', (45, 30), (4, 38), tie='')
           + person(268, 272, .95, 'sk3', 'tc', 'pa', 'hr2', 'hijab', (30, 40), (0, 0), scarf='td')
           + person(400, 262, .85, 'sk1', 'or', 'n2', 'hr3', 'boy', (60, 60), (6, 6))
           + person(330, 296, 1.0, 'sk4', 'bl', 'n2', 'hr1', 'boy', (30, 50), (-24, 10)))
    return (sky(u, tint=7) + sun(70, 60, 20) + cloud(220, 40, .9) + cloud(360, 70, .6, 1)
            + stands + crowd + field + goal + ppl + ball)


def _t4(u):
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="1.6" class="tl" opacity=".8"/>' for x in range(20, 480, 40) for y in range(20, 230, 40))
    code = ''.join(f'<rect x="{x}" y="{y}" width="{w}" height="5" rx="2.5" class="{c}"/>' for x, y, w, c in (
        (176, 164, 40, 'yl'), (222, 164, 28, 'bl'), (176, 176, 20, 'bl'), (202, 176, 52, 'tl'), (176, 188, 64, 'lf'), (246, 188, 20, 'or'),
        (190, 200, 36, 'ro'), (232, 200, 44, 'tl'), (176, 212, 28, 'yl'), (210, 212, 56, 'bl')))
    laptop = ('<rect x="160" y="150" width="152" height="94" rx="9" class="nk"/><rect x="168" y="157" width="136" height="80" rx="4" class="n2"/>'
              + code + anim('bk', '<rect x="270" y="212" width="5" height="9" class="yl"/>')
              + '<path class="p2" d="M146 246H326L318 258H154z"/><rect x="224" y="246" width="28" height="4" rx="2" class="st"/>')
    desk = '<rect x="110" y="256" width="260" height="14" rx="6" class="wd"/><rect x="128" y="270" width="10" height="44" class="w2"/><rect x="342" y="270" width="10" height="44" class="w2"/>'
    bulb = at(240, 78, anim('pd', '<circle r="48" fill="url(#gw-%s)"/>' % u)
              + ''.join(f'<path class="ly" d="M0 -40V-50" stroke-width="3" transform="rotate({a})"/>' for a in (-60, -30, 0, 30, 60))
              + '<path class="yl" d="M0 -30C-20 -30-26 -6-14 8-9 14-9 18-9 22H9C9 18 9 14 14 8 26 -6 20 -30 0 -30z"/>'
                '<rect x="-9" y="22" width="18" height="5" rx="2" class="st"/><rect x="-7" y="28" width="14" height="5" rx="2.5" class="st"/>'
                '<path class="ly" d="M-5 14V-4L0 2L5 -4V14" stroke-width="2" style="stroke:var(--a-or)"/>')
    drone = at(350, 98, anim('fl', '<ellipse cx="0" cy="0" rx="16" ry="8" class="nk"/><circle cx="0" cy="-1" r="3.5" class="bl"/>'
                                   '<path class="ln" d="M-14 -3L-30 -12M14 -3L30 -12" stroke-width="3"/>'
                                   '<path class="ln" d="M-8 8L-12 14M8 8L12 14" stroke-width="2"/>'
                                   + anim('rot', '<ellipse cx="-30" cy="-14" rx="15" ry="2.6" class="st"/>') + anim('rot', '<ellipse cx="30" cy="-14" rx="15" ry="2.6" class="st"/>', .1)))
    robot = at(432, 258, anim('fl', '<ellipse cx="0" cy="4" rx="22" ry="5" class="sh"/>'
                                    '<rect x="-17" y="-52" width="34" height="42" rx="12" class="pa"/><rect x="-11" y="-44" width="22" height="16" rx="5" class="tl"/>'
                                    '<circle cx="0" cy="-36" r="3" class="tc"/><rect x="-5" y="-22" width="10" height="6" rx="3" class="tc"/>'
                                    '<rect x="-19" y="-82" width="38" height="30" rx="12" class="pa"/><rect x="-13" y="-76" width="26" height="16" rx="7" class="n2"/>'
                                    + '<circle cx="-6" cy="-68" r="3" class="yl"/><circle cx="6" cy="-68" r="3" class="yl"/>'
                                    '<path class="ln" d="M0 -82V-94" stroke-width="2.5"/>' + anim('fk', '<circle cx="0" cy="-97" r="4" class="rd"/>')
                                    + '<path class="p2" d="M-17 -44L-28 -26" stroke-width="7" stroke-linecap="round" fill="none" style="stroke:var(--a-p2)"/>'
                                    '<path d="M17 -44L28 -34" stroke-width="7" stroke-linecap="round" fill="none" style="stroke:var(--a-p2)"/>'))
    ppl = (person(70, 300, 1.02, 'sk2', 'tc', 'n2', 'hr1', 'boy', (12, 55), tie='')
           + person(395, 310, 1.0, 'sk3', 'td', 'td', 'hr2', 'hijab', (14, 40), scarf='tl'))
    return (sky(u, tint=22, id_='sk') + f'<defs>{glow_def(u)}</defs>' + dots + '<rect y="276" width="480" height="44" class="fr"/>'
            + gear(70, 108, 36, 10, 'tc', d=0) + gear(122, 150, 23, 8, 'tl', d=0, rev=True) + gear(40, 168, 16, 7, 'bl', rev=True)
            + bulb + drone + desk + laptop + robot + ppl)


def _t5(u):
    bin_ = at(332, 268, '<ellipse cx="0" cy="3" rx="30" ry="6" class="sh"/><path class="l2" d="M-24 -52H24L20 0H-20z"/><path class="lf" d="M-24 -52H24L22 -36H-22z" opacity=".6"/>'
              '<rect x="-28" y="-62" width="56" height="12" rx="5" class="lf"/><rect x="-6" y="-68" width="12" height="8" rx="3" class="lf"/>'
              + anim('gr slow', ''.join(f'<path class="pa" d="M0 -22L-9 -8H9z" transform="rotate({a} 0 -24) translate(0 -12)"/>' for a in (0, 120, 240))))
    solar = at(430, 268, '<rect x="-3" y="-44" width="6" height="44" class="st"/><path class="b2" d="M-34 -44L-18 -86H44L36 -44z"/>'
               + ''.join(f'<path class="pa" d="M{-26 + 8 * k + 0.0} -44L{-12 + 8 * k} -86" stroke-width="1" opacity=".5"/>' for k in range(1, 8))
               + '<path class="pa" d="M-26 -65H40" stroke-width="1" opacity=".5"/>'
               + '<path class="st" d="M-22 0H22" stroke-width="5" stroke-linecap="round"/>')
    drop = at(240, 70, anim('fl', '<path class="bl" d="M0 -22C10 -8 16 -2 16 8A16 16 0 0 1 -16 8C-16 -2 -10 -8 0 -22z"/><path class="pa" d="M-8 6C-8 2-6 -2-3 -5" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>'))
    sapling = at(240, 276, '<ellipse cx="0" cy="2" rx="34" ry="8" class="w2"/><path class="wd" d="M-30 2Q0 -16 30 2z"/>'
                 + anim('sw', '<path class="ln lw" d="M0 -8V-44" stroke-width="3.5"/><path class="lf" d="M0 -30C-6 -48-24 -50-30 -42-26 -30-12 -26 0 -30z"/>'
                              '<path class="l2" d="M0 -38C4 -56 22 -58 28 -50 24 -38 10 -34 0 -38z"/>')
                 + '<ellipse cx="0" cy="-2" rx="16" ry="4" fill="none" class="lp bl-s" stroke-width="2"/>')
    can = ('<g transform="translate(196 222) scale(-.8 .8)"><path class="b2" d="M0 0L-26 -4L-30 -30L-4 -34z"/><path class="bl" d="M-4 -34H-30V-30L-4 -30z"/>'
           '<path class="b2" d="M-26 -20L-50 -36L-46 -40L-22 -26z"/><path class="ln ls-b2" d="M-4 -34C-4 -50 -30 -50 -30 -30" stroke-width="3"/></g>'
           + anim('dr s', '<circle cx="226" cy="238" r="2.6" class="bl"/>', 0) + anim('dr s', '<circle cx="230" cy="236" r="2.2" class="bl"/>', .7)
           + anim('dr s', '<circle cx="222" cy="236" r="2.2" class="bl"/>', 1.4))
    ppl = (round_tree(60, 270, 1.4)
           + person(140, 296, 1.0, 'sk2', 'tc', 'n2', 'hr2', 'hijab', (20, 78), scarf='lf')
           + can
           + person(290, 300, 1.0, 'sk3', 'lf', 'l2', 'hr1', 'boy', (10, 24)))
    kit = at(374, 288, '<rect x="-14" y="-22" width="28" height="22" rx="5" class="pa"/><rect x="-5" y="-17" width="10" height="12" rx="1" class="tc" opacity="0"/><path class="rd" d="M-2.5 -18H2.5V-14H6.5V-9H2.5V-5H-2.5V-9H-6.5V-14H-2.5z"/>')
    return (sky(u, tint=14) + sun(404, 56, 20) + cloud(80, 40, .9) + cloud(200, 62, .6, 1)
            + hills(u, 200) + solar + bin_ + kit + sapling + drop + ppl)


def _t6(u):
    beams = ''.join(f'<path d="M{x} 0L{x - 50} 250H{x + 50}z" fill="url(#gr-{u})" class="pd" style="--d:{d}s"/>' for x, d in ((110, 0), (370, 1.2)))
    defs = (f'<defs><linearGradient id="gr-{u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gs pa" style="stop-opacity:.5"/>'
            f'<stop offset="1" class="gs pa" style="stop-opacity:0"/></linearGradient>'
            f'<linearGradient id="ph-{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--tc)"/><stop offset="1" style="stop-color:var(--a-bl)"/></linearGradient></defs>')
    phone = at(240, 100, anim('fl', '<g transform="rotate(-5)"><rect x="-40" y="-70" width="80" height="140" rx="16" class="nk"/>'
                                     f'<rect x="-34" y="-62" width="68" height="124" rx="11" fill="url(#ph-{u})"/>'
                                     '<circle cx="0" cy="-8" r="21" class="pa" opacity=".95"/><path class="tc" d="M-6 -19L14 -8L-6 3z"/>'
                                     '<rect x="-24" y="26" width="48" height="5" rx="2.5" class="pa" opacity=".9"/><rect x="-24" y="38" width="30" height="5" rx="2.5" class="pa" opacity=".6"/>'
                                     '<rect x="-12" y="-68" width="24" height="5" rx="2.5" class="nk"/></g>'))

    def bubble(x, y, s, c, flip, d):
        tb, tip, ta = (22, 26, 8) if flip else (-8, -22, -22)
        tb, ta = (24, 8) if flip else (-8, -24)
        return at(x, y, anim('fl', f'<path class="{c}" d="M-26 -18a12 12 0 0 1 12-12H14a12 12 0 0 1 12 12V2a12 12 0 0 1-12 12H{tb}L{tip} 28L{ta + (6 if flip else 8)} 14H-14a12 12 0 0 1-12-12z"/>'
                               + ''.join(anim('dt', f'<circle cx="{cx}" cy="-8" r="3" class="pa"/>', d + i * .25) for i, cx in enumerate((-11, 0, 11))), d), s)
    bubbles = bubble(120, 80, 1.0, 'tc', False, 0) + bubble(372, 62, .8, 'bl', True, .5) + bubble(444, 92, .62, 'ro', True, 1)
    cam = at(76, 280, '<ellipse cx="0" cy="2" rx="38" ry="6" class="sh"/><path class="ln" d="M0 -64L-30 0M0 -64L30 0M0 -64V0" stroke-width="4" style="stroke:var(--a-st)"/>'
             '<rect x="-34" y="-108" width="68" height="46" rx="10" class="nk"/><rect x="-44" y="-100" width="22" height="30" rx="7" class="n2"/>'
             '<circle cx="14" cy="-85" r="15" class="n2"/><circle cx="14" cy="-85" r="10" class="bl"/><circle cx="11" cy="-88" r="3" class="pa" opacity=".8"/>'
             + anim('fk', '<circle cx="-22" cy="-100" r="3.5" class="rd"/>'))
    mic = at(428, 290, '<ellipse cx="0" cy="2" rx="24" ry="5" class="sh"/><ellipse cx="0" cy="-4" rx="18" ry="5" class="st"/><rect x="-2" y="-110" width="4" height="106" class="st"/>'
             '<rect x="-12" y="-148" width="24" height="42" rx="12" class="n2"/>' + ''.join(f'<path class="lp" d="M-12 {y}H12" stroke-width="1.5" opacity=".5"/>' for y in (-138, -130, -122, -114))
             + ''.join(anim('pd', f'<path class="lt" d="M{-22 - 10 * k} -134A{26 + 10 * k} {26 + 10 * k} 0 0 0 {-22 - 10 * k} -112" stroke-width="3" fill="none"/>', k * .4) for k in range(3)))
    ppl = (person(180, 296, 1.02, 'sk2', 'tc', 'n2', 'hr2', 'hijab', (10, 150), scarf='td')
           + person(300, 296, 1.02, 'sk1', 'bl', 'n2', 'hr1', 'boy', (14, 100)))
    return (sky(u, tint=22) + defs + beams + '<rect y="262" width="480" height="58" class="fr"/>' + bubbles + phone + cam + mic + ppl)


def _t7(u):
    houses = ''
    for x, w, h, c in ((10, 50, 44, 'hl2'), (68, 40, 60, 'hl1'), (330, 56, 52, 'hl2'), (394, 42, 66, 'hl1'), (440, 48, 46, 'hl2')):
        houses += f'<rect x="{x}" y="{214 - h}" width="{w}" height="{h}" rx="3" class="{c}"/><path class="{c}" d="M{x - 4} {214 - h}L{x + w / 2} {214 - h - 18}L{x + w + 4} {214 - h}z"/>'
        houses += ''.join(f'<rect x="{x + 8 + k * 16}" y="{214 - h + 12}" width="8" height="10" rx="2" class="yl" opacity=".7"/>' for k in range(int((w - 8) // 16)))
    box = at(236, 240, '<rect x="-20" y="-26" width="40" height="30" rx="4" class="or"/><rect x="-22" y="-32" width="44" height="10" rx="3" class="yl"/>'
             '<rect x="-4" y="-32" width="8" height="36" class="rd"/><path class="rd" d="M0 -32C-12 -46-22 -34 -6 -32M0 -32C12 -46 22 -34 6 -32"/>')
    basket = at(124, 262, '<path class="wd" d="M-22 -22H22L17 0H-17z"/><path class="w2" d="M-22 -22H22" stroke-width="3"/><circle cx="-10" cy="-26" r="7" class="rd"/><circle cx="2" cy="-30" r="7" class="lf"/><circle cx="13" cy="-26" r="7" class="or"/>'
                 '<path class="ln lw" d="M-20 -22C-20 -48 20 -48 20 -22" stroke-width="3"/>')
    hearts = (heart(250, 80, 1.7, 'ro', 0) + anim('rise', heart(224, 100, .7, 'tl', 0, False), 0) + anim('rise', heart(276, 100, .6, 'rd', 0, False), 1.2)
              + '<circle cx="250" cy="80" r="46" fill="url(#gw-%s)" class="pd"/>' % u)
    ppl = (person(100, 298, 1.0, 'sk2', 'tc', 'n2', 'hr1', 'boy', (14, 38), tie='yl')
           + person(180, 298, 1.0, 'sk3', 'td', 'n2', 'hr2', 'hijab', (12, 62), scarf='tc')
           + person(310, 298, 1.0, 'sk4', 'pa', 'pa', 'hr1', 'hijab', (24, 56), scarf='lf')
           + person(366, 298, .62, 'sk1', 'yl', 'bl', 'hr1', 'girl', (8, 8))
           + person(412, 298, 1.0, 'sk2', 'bl', 'n2', 'hr3', 'boy', (30, 30)))
    return (sky(u, tint=20) + f'<defs>{glow_def(u, "gw", "ro")}</defs>' + cloud(60, 40, .9) + cloud(380, 50, .7, 1) + hills(u, 214) + houses
            + hearts + basket + box + ppl)


TEAM_SCENES = {'t1': _t1, 't2': _t2, 't3': _t3, 't4': _t4, 't5': _t5, 't6': _t6, 't7': _t7}


def _gdefs(uid):
    """Shared radial glow used as url(#gw-S) by sun()."""
    return (f'<defs><radialGradient id="gw-S"><stop offset="0" class="gs yl" style="stop-opacity:.7"/><stop offset="1" class="gs yl" style="stop-opacity:0"/></radialGradient></defs>')


def team_scene(tid, uid, vb=VB, par='xMidYMid slice', cls=''):
    body = TEAM_SCENES[tid](uid)
    # make every scene's local ids unique: gw-S (sun glow) is renamed per uid
    body = body.replace('gw-S', f'gw-S{uid}')
    body = body.replace('<defs>', f'<defs><radialGradient id="gw-S{uid}"><stop offset="0" class="gs yl" style="stop-opacity:.7"/><stop offset="1" class="gs yl" style="stop-opacity:0"/></radialGradient>', 1) if 'gw-S' in body else body
    return _svg(body, vb, f'art-team {cls}', f'--tc:var(--{tid})', par)


# ============================================================ SPOT ART ===
SPOT_VB = '0 0 160 120'


def _spot(body, tc='--brand', cls='', clip=False):
    if clip:  # landscape spots sit in an oval badge
        return _svg('<defs><clipPath id="cp-{u}"><ellipse cx="80" cy="62" rx="76" ry="57"/></clipPath></defs><ellipse cx="80" cy="62" rx="76" ry="57" class="blob"/>'
                    '<g clip-path="url(#cp-{u})">' + body + '</g>', SPOT_VB, f'art-spot-svg {cls}', f'--tc:var({tc})')
    return _svg('<circle cx="80" cy="62" r="54" class="blob"/>' + body, SPOT_VB, f'art-spot-svg {cls}', f'--tc:var({tc})')


def spot_vision(uid, cls=''):
    rays = ''.join(f'<rect x="-1.8" y="-44" width="3.6" height="10" rx="1.8" class="yl" transform="rotate({k * 30 - 90})"/>' for k in range(7))
    body = (f'<defs><radialGradient id="sg-{uid}"><stop offset="0" class="gs yl" style="stop-opacity:.55"/><stop offset="1" class="gs yl" style="stop-opacity:0"/></radialGradient></defs>'
            f'<circle cx="80" cy="76" r="50" fill="url(#sg-{uid})" class="pd"/>' + at(80, 76, anim('gr slow', rays))
            + '<circle cx="80" cy="76" r="24" class="yl"/>'
            + '<path class="hl2" d="M0 82Q36 62 70 78T160 70V120H0z"/><path class="hl3" d="M0 94Q50 82 90 92T160 88V120H0z"/>'
            + '<path class="lp" d="M64 120C58 106 104 104 88 94C80 90 84 86 80 82" stroke-width="10" opacity=".9"/>'
            + '<path class="ls-or" d="M64 120C58 106 104 104 88 94C80 90 84 86 80 82" stroke-width="1.6" stroke-dasharray="3 5" fill="none"/>'
            + anim('wlk', person(78, 112, .3, 'sk2', 'tc', 'n2', 'hr1', 'boy', (30, 20)), 0)
            + '<path class="ln" d="M24 40q4-4 8 0q4-4 8 0M120 30q3-3 6 0q3-3 6 0" stroke-width="1.6"/>' + spark(30, 64, .7, 0) + spark(132, 54, .6, 1))
    return _spot(body, '--t2', cls, True).replace('{u}', uid)


def spot_mission(uid, cls=''):
    def flag(x, y, c, d):
        return at(x, y, '<rect x="-1" y="-26" width="2" height="26" rx="1" class="p2"/>' + anim('fg', f'<path class="{c}" d="M1 -26C7 -29 11 -23 18 -26V-14C11 -11 7 -17 1 -14z"/>'), 1)
    body = ('<path class="hl2" d="M0 76Q30 56 62 70T120 62T160 70V120H0z"/><path class="hl3" d="M0 98Q40 84 80 94T160 90V120H0z"/>'
            '<path class="lp" d="M14 112C40 104 36 92 62 90C90 88 80 74 108 70C124 68 126 60 140 58" stroke-width="9" opacity=".9"/>'
            '<path class="ls-or" d="M14 112C40 104 36 92 62 90C90 88 80 74 108 70C124 68 126 60 140 58" stroke-width="1.6" stroke-dasharray="3 5"/>'
            + flag(60, 90, 'tc', 0) + flag(104, 70, 'bl', .4) + flag(142, 58, 'or', .8)
            + anim('wlk', person(28, 110, .3, 'sk3', 'td', 'n2', 'hr2', 'hijab', (20, 24), scarf='tc'), .3) + spark(124, 30, .8))
    return _spot(body, '--brand', cls, True).replace('{u}', uid)


def spot_funding(uid, cls=''):
    jars = ''
    for i, (x, lv, c) in enumerate(((34, 34, 'tc'), (80, 17, 'bl'), (126, 6, 'or'))):
        coins = ''.join(f'<ellipse cx="{x + dx}" cy="{106 - 4 - k * 4.6}" rx="9" ry="3.6" class="{c if k % 2 else "yl"}"/>' for k in range(max(1, int(lv / 4.6))) for dx in ((-3,) if k % 2 else (3,)))
        jars += (f'<g><path class="p2" d="M{x - 17} 56H{x + 17}V104Q{x + 17} 110 {x + 10} 110H{x - 10}Q{x - 17} 110 {x - 17} 104z" opacity=".55"/>'
                 f'<rect x="{x - 15}" y="{108 - lv}" width="30" height="{lv}" rx="3" class="{c}" opacity=".35"/>{coins}'
                 f'<rect x="{x - 19}" y="50" width="38" height="8" rx="4" class="{c}"/></g>')
    body = (jars + anim('dr s', '<ellipse cx="34" cy="24" rx="9" ry="9" class="yl"/><ellipse cx="34" cy="24" rx="5.5" ry="5.5" class="or" opacity=".6"/>', 0)
            + spark(118, 28, .8) + spark(60, 22, .6, 1))
    return _spot(body, '--leaf', cls)


def spot_legal(uid, cls=''):
    body = (at(54, 66, '<g transform="rotate(-9)"><rect x="-24" y="-34" width="48" height="64" rx="6" class="pa"/>'
             + ''.join(f'<rect x="-15" y="{y}" width="{w}" height="4" rx="2" class="st" opacity=".7"/>' for y, w in ((-22, 30), (-12, 22), (-2, 30), (8, 18)))
             + '<circle cx="12" cy="18" r="5" class="or" opacity=".8"/></g>')
            + at(96, 60, anim('fl', '<path class="tc" d="M0 -40C14 -33 26 -32 34 -32V4C34 24 18 34 0 42-18 34-34 24-34 4V-32C-26 -32-14 -33 0 -40z"/>'
                               '<path class="tl" d="M0 -30C11 -25 20 -24 26 -24V4C26 19 13 26 0 32V-30z" opacity=".35"/>'
                               '<path class="lp" d="M-13 2L-4 11L14 -9" stroke-width="6"/>'), 1)
            + at(128, 98, '<rect x="-12" y="-8" width="24" height="18" rx="4" class="or"/><path class="ln ls-or" d="M-7 -8V-14A7 7 0 0 1 7 -14V-8" stroke-width="3.2"/><circle cy="1" r="2.6" class="nk"/>')
            + spark(26, 24, .7) + spark(136, 32, .6, .8))
    return _spot(body, '--sky', cls)


def spot_integration(uid, cls=''):
    def piece(x, y, c, knob, d=0):
        k = {'r': f'<circle cx="{x + 40}" cy="{y + 20}" r="8" class="{c}"/>', 't': f'<circle cx="{x + 20}" cy="{y}" r="8" class="{c}"/>',
             'l': f'<circle cx="{x}" cy="{y + 20}" r="8" class="{c}"/>'}[knob]
        return f'<g><rect x="{x}" y="{y}" width="40" height="40" rx="8" class="{c}"/>{k}<rect x="{x + 8}" y="{y + 8}" width="24" height="5" rx="2.5" class="pa" opacity=".4"/></g>'
    body = (piece(22, 70, 'tc', 'r') + piece(64, 70, 'bl', 't') + anim('ud', piece(106, 26, 'or', 'l'), 0)
            + '<path class="ln ls-or" d="M126 70V78" stroke-width="2" stroke-dasharray="2 4"/>' + spark(30, 36, .8) + spark(140, 100, .6, .6) + spark(86, 36, .5, 1.1))
    return _spot(body, '--t6', cls)


def spot_kpi(uid, cls=''):
    bars = ''.join(anim('grow', f'<rect x="{x}" y="{104 - h}" width="17" height="{h}" rx="4" class="{c}"/>', d)
                   for x, h, c, d in ((20, 26, 'bl', 0), (42, 42, 'lf', .3), (64, 58, 'tc', .6), (86, 76, 'or', .9)))
    target = at(130, 44, '<circle r="24" class="pa"/><circle r="24" fill="none" class="lt ls-rd" stroke-width="4"/><circle r="15" class="rd" opacity=".85"/><circle r="8" class="pa"/><circle r="3.5" class="rd"/>'
                '<path class="ln ls-nk" d="M0 0L-26 -28" stroke-width="3"/><path class="rd" d="M-26 -28L-36 -26L-30 -20L-26 -32z"/>')
    body = (bars + '<path class="ln ls-st" d="M12 106H112" stroke-width="3"/>' + target + '<path class="ls-lf" d="M24 78L50 58L70 66L98 28" stroke-width="3" stroke-dasharray="1 6"/>' + spark(116, 90, .7))
    return _spot(body, '--sky', cls)


def spot_growth(uid, cls=''):
    body = ('<path class="hl3" d="M0 100Q80 90 160 100V120H0z"/>'
            + at(28, 100, anim('sw', '<path class="ln ls-l2" d="M0 0V-14" stroke-width="3"/><path class="lf" d="M0 -12C-4 -22-14 -22-16 -16-12 -9-6 -8 0 -12z"/><path class="l2" d="M0 -14C4 -24 14 -24 16 -18 12 -11 6 -10 0 -14z"/>'))
            + at(78, 100, anim('sw', '<path class="ln ls-l2" d="M0 0V-38" stroke-width="3.5"/><path class="lf" d="M0 -20C-8 -34-24 -32-26 -22-20 -14-8 -14 0 -20z"/><path class="l2" d="M0 -30C8 -44 24 -42 26 -32 20 -24 8 -24 0 -30z"/><path class="lf" d="M0 -38C-4 -50-14 -54-20 -50-18 -42-8 -36 0 -38z"/>'), 1)
            + at(128, 100, '<path class="wd" d="M-5 0L-3 -34H3L5 0z"/>' + anim('sw', '<circle cx="0" cy="-52" r="24" class="l2"/><circle cx="-15" cy="-38" r="16" class="lf"/><circle cx="16" cy="-40" r="17" class="lf"/><circle cx="2" cy="-64" r="16" class="lf"/><circle cx="-6" cy="-44" r="3" class="rd"/><circle cx="14" cy="-56" r="3" class="rd"/>'))
            + '<path class="ln ls-or" d="M30 66Q80 30 124 30" stroke-width="2.4" stroke-dasharray="2 5"/><path class="or" d="M124 30L116 24V36z"/>' + spark(80, 22, .7))
    return _spot(body, '--leaf', cls, True).replace('{u}', uid)


def spot_marketing(uid, cls=''):
    mega = at(44, 62, anim('fl', '<path class="tc" d="M-22 -10L22 -30V30L-22 10z"/><rect x="-32" y="-12" width="14" height="24" rx="5" class="td"/><path class="td" d="M-20 12L-14 34H-4L-8 14z"/><ellipse cx="22" cy="0" rx="6" ry="30" class="tl"/>')
              + ''.join(anim('pd', f'<path class="ln ls-or" d="M{36 + 11 * k} {-14 - 4 * k}Q{44 + 12 * k} 0 {36 + 11 * k} {14 + 4 * k}" stroke-width="3"/>', k * .35) for k in range(1, 3)))
    tv = at(120, 62, '<rect x="-34" y="-28" width="68" height="46" rx="8" class="nk"/><rect x="-29" y="-23" width="58" height="36" rx="4" class="bl"/>'
            '<circle cx="0" cy="-5" r="11" class="pa"/><path class="b2" d="M-3 -10L6 -5L-3 0z"/><path class="ln ls-st" d="M-14 28H14M-20 30L-14 18M20 30L14 18" stroke-width="3"/>')
    phone = at(84, 96, anim('ud', '<rect x="-15" y="-34" width="30" height="52" rx="8" class="nk"/><rect x="-11" y="-28" width="22" height="40" rx="4" class="or"/><circle cx="0" cy="-8" r="7" class="pa"/><path class="tc" d="M-2 -11L3 -8L-2 -5z"/>'), 0)
    body = mega + tv + phone + spark(76, 22, .8) + spark(148, 22, .6, 1) + spark(22, 100, .6, .5)
    return _spot(body, '--sun', cls)


SPOTS = {'vision': spot_vision, 'mission': spot_mission, 'funding': spot_funding, 'legal': spot_legal,
         'integration': spot_integration, 'kpi': spot_kpi, 'growth': spot_growth, 'marketing': spot_marketing}


# ============================================================ PAGE SCENES ===
def _tcs(i):
    return f'--a-tc:var(--t{i})'


def _win(x, y, cols, rows, dx=12, dy=14, w=6, h=8, cls='pa', op=.55):
    return ''.join(f'<rect x="{x + c * dx}" y="{y + r * dy}" width="{w}" height="{h}" rx="1.5" class="{cls}" opacity="{op}"/>' for c in range(cols) for r in range(rows))


def _mosque(x, y, s=1, minaret=True, cls='hl1'):
    m = f'<rect x="-6" y="-120" width="12" height="120" class="{cls}"/><path class="{cls}" d="M-9 -120H9L0 -146z"/><rect x="-9" y="-96" width="18" height="6" rx="2" class="{cls}"/><circle cx="0" cy="-150" r="2.4" class="or"/>' if minaret else ''
    return at(x, y, f'<rect x="-46" y="-40" width="92" height="40" class="{cls}"/><path class="{cls}" d="M-30 -40A30 30 0 0 1 30 -40z"/>'
              f'<rect x="-1.5" y="-84" width="3" height="14" class="or"/><circle cx="0" cy="-86" r="3" class="or"/>'
              f'<path class="wn" d="M-9 0V-14A9 9 0 0 1 9 -14V0z" opacity=".9"/>'
              + ''.join(f'<path class="wn" d="M{xx - 4} -14V-24A4 4 0 0 1 {xx + 4} -24V-14z" opacity=".8"/>' for xx in (-30, 30))
              + (f'<g transform="translate(-62 0)">{m}</g>' if minaret else ''), s)


def _fountain(x, y, uid, s=1):
    arcs = ''.join(f'<path class="lp ls-bl flow" d="M0 -62C{a * 0.6} -112 {a * 1.1} -96 {a * 1.2} -34" stroke-width="3.2" style="animation-delay:{k * -.3}s"/>' for k, a in enumerate((-46, -26, 26, 46)))
    return at(x, y, f'<ellipse cx="0" cy="2" rx="86" ry="14" class="hl2"/><ellipse cx="0" cy="-4" rx="72" ry="11" class="bl" opacity=".55"/><ellipse cx="0" cy="-6" rx="46" ry="7" class="pa" opacity=".4"/>'
              '<path class="st" d="M-16 -4H16L11 -34H-11z"/><ellipse cx="0" cy="-34" rx="26" ry="6" class="p2"/>'
              + arcs + f'<circle cx="0" cy="-92" r="52" fill="url(#fg-{uid})" class="pd"/>'
              + anim('fl', '<path class="bl" d="M0 -126C22 -100 34 -86 34 -70A34 34 0 0 1 -34 -70C-34 -86 -22 -100 0 -126z"/>'
                           '<path class="pa" d="M-18 -66C-18 -76 -13 -84 -6 -92" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55"/>'
                           '<path class="ln ls-pa" d="M-24 -56c8 -6 14 -6 24 0s16 6 24 0" stroke-width="3.5" opacity=".7"/>')
              + ''.join(f'<ellipse cx="0" cy="-2" rx="{r}" ry="{r * .16}" fill="none" class="lp rp" stroke-width="2" style="--d:{k * 1.1}s"/>' for k, r in enumerate((56, 56, 56))), s)


def home_band(uid):
    d = (f'<defs><radialGradient id="fg-{uid}"><stop offset="0" class="gs bl" style="stop-opacity:.5"/><stop offset="1" class="gs bl" style="stop-opacity:0"/></radialGradient></defs>')
    far = ''
    for x, w, h in ((180, 40, 70), (226, 30, 96), (270, 36, 58), (905, 38, 120), (948, 30, 74), (1156, 40, 66), (20, 44, 64)):
        far += f'<rect x="{x}" y="{196 - h}" width="{w}" height="{h}" rx="3" class="hl1"/>' + _win(x + 7, 196 - h + 10, max(1, (w - 8) // 12), h // 20)
    school = at(380, 196, '<rect x="-72" y="-56" width="144" height="56" rx="3" class="hl2"/><path class="hl1" d="M-24 -56L0 -84L24 -56z"/><rect x="-24" y="-56" width="48" height="56" class="hl1"/>'
                '<circle cx="0" cy="-66" r="6" class="pa" opacity=".7"/><path class="wn" d="M-7 0V-18A7 7 0 0 1 7 0z" opacity=".9"/>' + _win(-62, -44, 3, 2, 12, 20) + _win(26, -44, 3, 2, 12, 20)
                + '<rect x="-1" y="-112" width="2" height="30" class="p2"/>' + anim('fg', '<path class="tc" d="M1 -112H17V-100H1z"/>'))
    dome = at(786, 196, '<rect x="-64" y="-46" width="128" height="46" rx="3" class="hl2"/><path class="hl1" d="M-30 -46A30 30 0 0 1 30 -46z"/><rect x="-1.5" y="-88" width="3" height="12" class="or"/>'
              + _win(-54, -34, 9, 1, 13, 12, 6, 14) + '<path class="wn" d="M-8 0V-12A8 8 0 0 1 8 0z" opacity=".9"/>')
    tower = at(1000, 196, '<rect x="-20" y="-150" width="40" height="150" rx="5" class="hl2"/><rect x="-14" y="-160" width="28" height="12" rx="4" class="hl1"/>' + _win(-12, -140, 3, 9, 10, 15, 5, 8, 'pa', .5))
    houses = ''.join(at(x, 196, f'<rect x="-22" y="-26" width="44" height="26" class="hl2"/><path class="hl1" d="M-27 -26L0 -48L27 -26z"/><rect x="-5" y="-16" width="10" height="16" class="wn" opacity=".8"/>') for x in (480, 700, 1080))
    ground = ('<path class="hl3" d="M0 196Q300 186 600 198T1200 192V232H0z"/><path class="bl" opacity=".35" d="M560 202C580 214 560 224 590 232H640C630 220 660 212 640 202z"/>')
    figs = ''
    kinds = ['hijab', 'boy', 'girl', 'boy', 'hijab', 'girl', 'boy']
    xs = [316, 420, 520, 686, 742, 806, 866]
    ys = [226, 222, 226, 226, 222, 226, 222]
    skins = ['sk2', 'sk1', 'sk3', 'sk4', 'sk2', 'sk1', 'sk3']
    for i, (x, y, k, sk) in enumerate(zip(xs, ys, kinds, skins), 1):
        fig = person(x, y, .58, sk, 'tc', 'n2', 'hr1' if i % 2 else 'hr2', k, (22, 30) if i < 4 else (30, 22), scarf='tc')
        figs += anim('wlk', f'<g style="{_tcs(i)}">{fig}</g>', d=i * -.5)
    return _svg(d + far + school + dome + tower + houses + _mosque(120, 196, 1.0) + _mosque(1124, 196, .8, False, 'hl1') + ground + _fountain(600, 214, uid, 1.05) + figs,
                '0 0 1200 232', 'art-band-svg', '--tc:var(--brand)', 'xMidYMax slice')


def teams_banner(uid):
    def vig(i, inner):
        cx = 96 + (i - 1) * 168
        return (f'<g style="{_tcs(i)}">' + at(cx, 100, '<circle r="76" class="vw"/><circle r="76" fill="none" class="lt" stroke-width="2" stroke-dasharray="2 8" opacity=".7"/>'
                                               '<ellipse cx="0" cy="58" rx="62" ry="9" class="sh"/>' + inner) + '</g>')
    v1 = (person(-6, 60, .6, 'sk2', 'tc', 'tc', 'hr1', 'hijab', (14, 30), sit=True, scarf='tc')
          + '<path class="ln ls-wd" d="M20 62L46 36M46 62L20 36" stroke-width="5"/><path class="pa" d="M33 40C26 34 18 34 12 37V50C18 47 26 47 33 53C40 47 48 47 54 50V37C48 34 40 34 33 40z"/>'
          + anim('pd', '<circle cx="33" cy="22" r="24" fill="url(#bg-yl)"/>'))
    v2 = ('<path class="vl" d="M-52 58L-24 4L4 58z"/><path class="vd" d="M-34 58L-24 30L-14 58z"/>' + flame(30, 58, .55) + person(-16, 60, .0, 'sk2', 'tc', 'n2') * 0
          + person(46, 62, .62, 'sk2', 'tc', 'n2', 'hr1', 'boy', (6, 6), salute=True, hat=scout_hat('or'), tie='rd') + '')
    v3 = (anim('bx', anim('by', anim('spin', '<circle cx="-14" cy="48" r="8" class="pa"/><path class="nk" d="M-14 44L-11 47L-12 51H-16L-17 47z"/>')))
          + person(-34, 62, .66, 'sk3', 'tc', 'pa', 'hr1', 'boy', (45, 30), (4, 38)) + person(40, 62, .6, 'sk1', 'vl', 'n2', 'hr2', 'girl', (30, 40)))
    v4 = (gear(-26, 4, 20, 8, 'vd') + gear(8, 30, 14, 7, 'vl', rev=True)
          + '<rect x="-4" y="38" width="62" height="5" rx="2" class="wd"/><rect x="6" y="14" width="44" height="26" rx="4" class="nk"/><rect x="10" y="18" width="36" height="18" rx="2" class="n2"/>'
          + '<rect x="14" y="22" width="16" height="3" rx="1.5" class="yl"/><rect x="14" y="28" width="24" height="3" rx="1.5" class="bl"/>'
          + person(-40, 62, .62, 'sk2', 'tc', 'n2', 'hr1', 'boy', (14, 40)))
    v5 = (round_tree(-34, 60, .75) + person(34, 62, .62, 'sk3', 'tc', 'l2', 'hr1', 'hijab', (20, 24), scarf='tc')
          + at(2, 60, '<path class="wd" d="M-14 2Q0 -10 14 2z"/>' + anim('sw', '<path class="ln ls-l2" d="M0 -4V-22" stroke-width="2.5"/><path class="lf" d="M0 -14C-3 -24-13 -24-15 -19-12 -13-6 -12 0 -14z"/><path class="l2" d="M0 -20C3 -30 13 -30 15 -25 12 -19 6 -18 0 -20z"/>')))
    v6 = (anim('fl', at(-6, 4, '<g transform="rotate(-6)"><rect x="-22" y="-34" width="44" height="72" rx="10" class="nk"/><rect x="-18" y="-29" width="36" height="62" rx="6" class="tc"/><circle cy="-2" r="12" class="pa"/><path class="vd" d="M-3 -8L6 -2L-3 4z"/></g>'))
          + person(-44, 62, .0) * 0 + person(36, 62, .62, 'sk1', 'vl', 'n2', 'hr3', 'boy', (14, 100)))
    v7 = (heart(-2, 0, 1.6, 'tc') + at(-38, 58, '<rect x="-14" y="-24" width="28" height="22" rx="3" class="or"/><rect x="-16" y="-30" width="32" height="8" rx="2" class="yl"/><rect x="-3" y="-30" width="6" height="28" class="rd"/>')
          + person(34, 62, .64, 'sk4', 'tc', 'tc', 'hr2', 'hijab', (12, 60), scarf='vl'))
    body = ''.join(vig(i, v) for i, v in enumerate((v1, v2, v3, v4, v5, v6, v7), 1))
    defs = '<defs><radialGradient id="bg-yl"><stop offset="0" class="gs yl" style="stop-opacity:.5"/><stop offset="1" class="gs yl" style="stop-opacity:0"/></radialGradient></defs>'
    line = '<path class="lp flow" d="M20 178C140 150 200 196 300 172S480 150 600 176 780 196 900 172 1100 150 1180 176" stroke-width="3" opacity=".55"/>'
    return _svg(defs + line + body, '0 0 1200 190', 'art-band-svg', '--tc:var(--brand)', 'xMidYMid slice').replace('url(#bg-yl)', f'url(#bg-yl)').replace('bg-yl', f'bg-yl{uid}')


def ops_banner(uid):
    council = at(250, 168, '<rect x="-110" y="-8" width="220" height="10" rx="2" class="st"/><rect x="-96" y="-18" width="192" height="10" rx="2" class="p2"/>'
                 + ''.join(f'<rect x="{x - 6}" y="-92" width="12" height="74" rx="3" class="pa"/>' for x in range(-72, 90, 36))
                 + '<path class="tc" d="M-100 -92L0 -142L100 -92z"/><path class="pa" d="M-80 -97L0 -132L80 -97z" opacity=".35"/><circle cx="0" cy="-108" r="9" class="yl"/>'
                 + '<rect x="-96" y="-100" width="192" height="8" rx="2" class="p2"/><rect x="-2" y="-176" width="4" height="36" class="st"/>' + anim('fg', '<path class="or" d="M2 -176H26V-160H2z"/>'))
    nodes = [(560, 50, 'tc', 'u'), (760, 36, 'bl', 'b'), (860, 112, 'or', 's'), (980, 44, 'lf', 'u'), (1090, 108, 'ro', 'h'), (80, 54, 'bl', 'u'), (130, 126, 'lf', 'b')]
    links = ('<path class="lp flow" d="M250 56C320 20 460 30 560 50M560 50C640 70 700 60 760 36M760 36C800 50 840 80 860 112M860 112C900 70 940 40 980 44M980 44C1020 60 1060 80 1090 108'
             'M80 54C120 70 150 40 250 56M130 126C160 120 200 110 250 90" stroke-width="2.6" opacity=".6"/>')
    ico = {'u': '<circle cy="-3" r="4.5" class="pa"/><path class="pa" d="M-8 9A8 6 0 0 1 8 9z"/>',
           'b': '<rect x="-8" y="-8" width="16" height="16" rx="2" class="pa"/><rect x="-4" y="-4" width="3" height="3" class="nk"/><rect x="1.5" y="-4" width="3" height="3" class="nk"/>',
           's': '<path class="pa" d="M-9 -2L0 -9L9 -2z"/><rect x="-7" y="-2" width="14" height="9" class="pa"/>',
           'h': '<path class="pa" d="M0 8C-12 0-10 -9-4 -9-2 -9 0 -7 0 -6 0 -7 2 -9 4 -9 10 -9 12 0 0 8z"/>'}
    ns = ''.join(at(x, y, anim('pd2', f'<circle r="19" class="{c}"/>' + ico[k], i * .4)) for i, (x, y, c, k) in enumerate(nodes))
    phone = at(600, 176, '<ellipse cx="0" cy="2" rx="50" ry="6" class="sh"/><rect x="-40" y="-150" width="80" height="148" rx="16" class="nk"/><rect x="-34" y="-142" width="68" height="132" rx="10" class="pa"/>'
               '<rect x="-34" y="-142" width="68" height="26" rx="10" class="tc"/><rect x="-34" y="-126" width="68" height="10" class="tc"/>'
               + ''.join(f'<rect x="{-28 + (k % 3) * 20}" y="{-104 + (k // 3) * 20}" width="16" height="16" rx="5" class="{c}"/>' for k, c in enumerate(('bl', 'lf', 'or', 'ro', 'tc', 'yl')))
               + '<circle cx="0" cy="-30" r="12" class="lf"/><path class="lp" d="M-5 -30L-1 -26L6 -35" stroke-width="3"/><rect x="-24" y="-12" width="48" height="5" rx="2.5" class="st" opacity=".5"/>')
    ppl = (person(420, 178, .72, 'sk2', 'bl', 'n2', 'hr1', 'boy', (20, 70)) + person(700, 178, .72, 'sk3', 'tc', 'tc', 'hr2', 'hijab', (70, 14), scarf='tc')
           + person(790, 184, .62, 'sk1', 'or', 'n2', 'hr3', 'girl', (12, 12)) + person(1000, 184, .66, 'sk4', 'lf', 'n2', 'hr1', 'boy', (14, 40)))
    ground = '<path class="hl3" d="M0 168Q300 160 600 170T1200 166V190H0z"/>'
    return _svg(links + ground + council + phone + ns + ppl, '0 0 1200 190', 'art-band-svg', '--tc:var(--sun)', 'xMidYMax slice')


def _lantern(x, y, s, d=0):
    return at(x, y, anim('sw sw-t', '<path class="qg-l" d="M0 0V60" stroke-width="2"/><circle cy="70" r="58" fill="url(#ql-%s)" class="pd" style="--d:%ss"/>' % ('U', d)
                         + '<path class="qg" d="M-10 62L10 62L16 72L-16 72z"/><path class="qg2" d="M-16 72H16L24 104L12 120H-12L-24 104z"/>'
                           '<path class="qy" d="M-10 77H10L15 102L8 113H-8L-15 102z"/><path class="qg" d="M-14 120H14L10 128H-10z"/><circle cy="58" r="4" class="qg"/>'
                           '<path class="qg-l" d="M0 77V113M-6 80L-9 108M6 80L9 108" stroke-width="1.2" opacity=".5"/>'), s)


def quran_hero(uid, narrow=False):
    w, h = (480, 560) if narrow else (1200, 420)
    defs = (f'<defs><radialGradient id="ql-U"><stop offset="0" class="qs" style="stop-opacity:.6"/><stop offset="1" class="qs" style="stop-opacity:0"/></radialGradient></defs>')
    n = 4 if narrow else 9
    sp = (w - 40) / n
    arcade = ''
    for k in range(n):
        x0 = 20 + k * sp
        aw = sp - 14
        base = h
        top = h - (150 if narrow else 160)
        arcade += (f'<path class="qa" d="M{x0:.0f} {base}V{top + aw / 2:.0f}A{aw / 2:.0f} {aw / 2:.0f} 0 0 1 {x0 + aw:.0f} {top + aw / 2:.0f}V{base}z"/>'
                   f'<path class="qa-l" d="M{x0 + 8:.0f} {base}V{top + aw / 2 + 8:.0f}A{aw / 2 - 8:.0f} {aw / 2 - 8:.0f} 0 0 1 {x0 + aw - 8:.0f} {top + aw / 2 + 8:.0f}V{base}" fill="none" stroke-width="1.6"/>'
                   + at(x0 + aw / 2, top + aw / 2 - 14, anim('tk', f'<path class="qy" d="{star8(8)}"/>', k * .5)))
    stars = ''.join(spark(x, y, s, d, 'qy') for x, y, s, d in ((90, 60, 1, 0), (230, 120, .7, .8), (340, 40, .8, 1.5), (870, 70, 1, .4), (980, 130, .7, 1.1), (760, 30, .6, 2), (600, 24, .8, .6))
                    ) if not narrow else ''.join(spark(x, y, s, d, 'qy') for x, y, s, d in ((60, 150, .9, 0), (420, 190, .8, .8), (250, 40, .7, 1.4), (150, 300, .6, 1.1), (350, 330, .7, .3)))
    lant = (_lantern(60, 0, 1.0, 0) + _lantern(420, 0, 1.0, 1.2)) if narrow else (_lantern(150, 0, 1.15, 0) + _lantern(1050, 0, 1.15, 1.2) + _lantern(330, 0, .7, .6) + _lantern(870, 0, .7, 1.8))
    return _svg(defs + stars + arcade + lant, f'0 0 {w} {h}', 'art-q art-band-svg', '', 'xMidYMax slice')


def quran_book(uid):
    defs = (f'<defs><linearGradient id="qr-{uid}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="qs" style="stop-opacity:.7"/><stop offset="1" class="qs" style="stop-opacity:0"/></linearGradient></defs>')
    rays = anim('pd', ''.join(f'<path d="M120 112L{120 + 150 * math.cos(math.radians(a)):.0f} {112 + 150 * math.sin(math.radians(a)):.0f}L{120 + 150 * math.cos(math.radians(a + 8)):.0f} {112 + 150 * math.sin(math.radians(a + 8)):.0f}z" fill="url(#qr-{uid})"/>'
                              for a in range(-168, -10, 18)))
    book = ('<ellipse cx="120" cy="150" rx="90" ry="10" class="sh"/><path class="qd" d="M120 120C96 104 56 104 24 118V148C56 134 96 134 120 150C144 134 184 134 216 148V118C184 104 144 104 120 120z"/>'
            '<path class="qiv" d="M120 114C98 100 62 100 32 112V140C62 128 98 128 120 142C142 128 178 128 208 140V112C178 100 142 100 120 114z"/>'
            '<path class="qg-l" d="M44 116C66 110 90 112 108 120M44 124C66 118 90 120 108 128M44 132C66 126 90 128 108 136M196 116C174 110 150 112 132 120M196 124C174 118 150 120 132 128M196 132C174 126 150 128 132 136" stroke-width="1.5" opacity=".55" fill="none"/>'
            '<path class="qg-l" d="M120 114V142" stroke-width="2"/>')
    star = at(120, 52, anim('fl', f'<path class="qy" d="{star8(16)}"/><circle r="5" class="qiv"/>'))
    return _svg(defs + rays + book + star + spark(48, 56, .9, 0, 'qy') + spark(196, 40, .8, .8, 'qy') + spark(210, 96, .6, 1.4, 'qy'), '0 0 240 170', 'art-q', '')


# ============================================================ HTML HELPERS ===
def spot(name, uid, dark=False, cls=''):
    """A small decorative illustration wrapped for placement (aria-hidden)."""
    svg = SPOTS[f'{name}'](uid, 'dk' if dark else '')
    return f'<span class="art-spot sp-{name} {cls}" aria-hidden="true">{svg}</span>'


def frame(svg, cls=''):
    return f'<div class="art-frame {cls}" aria-hidden="true">{svg}</div>'


# ============================================================ PHOTOS ===
PHOTOS = {  # file: (width, height, default object-position)
    'team-t1': (1200, 1500, '50% 72%'), 'team-t2': (1200, 802, '50% 45%'), 'team-t3': (1200, 857, '58% 40%'),
    'team-t4': (1200, 800, '50% 45%'), 'team-t5': (1200, 1800, '50% 58%'), 'team-t6': (1200, 1800, '50% 38%'),
    'team-t7': (1200, 800, '45% 50%'), 'inclusion': (1200, 800, '50% 35%'), 'hero-home': (1200, 800, '50% 45%'),
    'hero-operations': (1200, 800, '40% 45%'), 'hero-quran': (1200, 1800, '50% 55%'), 'quran-dark': (1200, 800, '50% 50%'),
}


def photo(name, cls='', pos=None, eager=False):
    """A decorative photo (assets/photos/<name>.jpg, relative URL so file:// works). alt is empty on purpose."""
    w, h, p = PHOTOS[name]
    load = 'fetchpriority="high" decoding="async"' if eager else 'loading="lazy" decoding="async"'
    return (f'<img class="ph {cls}" src="assets/photos/{name}.jpg" alt="" width="{w}" height="{h}" {load} '
            f'style="object-position:{pos or p}">')
