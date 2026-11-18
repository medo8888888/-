"""Inline-SVG scenes for «موسم القائد» (illustrations only — no content text).

Every scene is a layered 800x300 picture: sky (+sun/moon, drifting clouds), two hill layers, ground, a scenario
prop, and a character. Colours are CSS tokens (var(--t1) …) so both themes work; mood colours (--s1, --s2, --h1 …)
are defined per `data-mood` in css/season.css. Characters and scenes are invented for the simulation.
"""

W, H = 800, 300


def F(c, extra=''):
    return f'style="fill:var(--{c});{extra}"'


def S(c, w=3, fill='none'):
    return f'style="fill:{fill};stroke:var(--{c})" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"'


SKIN = ['#f4cfae', '#dba578', '#bd8656', '#8f5c36']


# ------------------------------------------------------------------ characters
def person(x, y, look='boy', top='t1', s=1.0, skin=1, arm='down'):
    sk = SKIN[skin % 4]
    hair = '#2b1b14'
    parts = [f'<g class="ch" transform="translate({x} {y}) scale({s})"><ellipse cx="0" cy="2" rx="38" ry="6" class="shadow"/><g class="ch-in">']
    pants = 'var(--ink-2)' if look != 'official' else 'var(--head)'
    parts.append(f'<rect x="-18" y="-50" width="14" height="50" rx="6" style="fill:{pants}"/><rect x="4" y="-50" width="14" height="50" rx="6" style="fill:{pants}"/>')
    parts.append('<ellipse cx="-12" cy="-1" rx="12" ry="5" style="fill:var(--head)"/><ellipse cx="12" cy="-1" rx="12" ry="5" style="fill:var(--head)"/>')
    topfill = F(top) if look != 'official' else 'style="fill:var(--head)"'
    parts.append(f'<path d="M-31 -46 L-27 -106 Q0 -119 27 -106 L31 -46 Z" {topfill}/>')
    if look == 'official':
        parts.append('<path d="M-6 -108 L0 -92 L6 -108Z" style="fill:#fff"/><path d="M0 -100 l5 8 -5 26 -5 -26z" style="fill:var(--t3)"/>')
    # arms
    if arm == 'wave':
        parts.append(f'<g class="arm-wave"><path d="M27 -100 Q50 -112 48 -140" fill="none" style="stroke:{"var(--"+top+")" if look != "official" else "var(--head)"}" stroke-width="13" stroke-linecap="round"/><circle cx="48" cy="-146" r="7" style="fill:{sk}"/></g>')
    else:
        parts.append(f'<path d="M27 -100 Q42 -70 33 -46" fill="none" style="stroke:{"var(--"+top+")" if look != "official" else "var(--head)"}" stroke-width="13" stroke-linecap="round"/><circle cx="33" cy="-42" r="6.5" style="fill:{sk}"/>')
    parts.append(f'<path d="M-27 -100 Q-42 -70 -33 -46" fill="none" style="stroke:{"var(--"+top+")" if look != "official" else "var(--head)"}" stroke-width="13" stroke-linecap="round"/><circle cx="-33" cy="-42" r="6.5" style="fill:{sk}"/>')
    parts.append(f'<rect x="-6" y="-112" width="12" height="12" rx="4" style="fill:{sk}"/>')
    face = f'<circle cx="0" cy="-128" r="21" style="fill:{sk}"/>'
    eyes = ('<g class="eyes"><circle class="eye" cx="-7.5" cy="-129" r="2.3" style="fill:#1b1410"/><circle class="eye" cx="7.5" cy="-129" r="2.3" style="fill:#1b1410"/></g>'
            '<path d="M-6 -120 Q0 -114 6 -120" fill="none" stroke="#1b1410" stroke-width="2" stroke-linecap="round"/>')
    if look in ('girl', 'woman'):
        col = F(top) if look == 'girl' else 'style="fill:var(--t6)"'
        if look == 'woman':
            col = F({'t1': 't4'}.get(top, top))
        parts.append(f'<path d="M-27 -124 Q-28 -161 0 -161 Q28 -161 27 -124 L27 -96 Q0 -86 -27 -96Z" {col}/>')
        parts.append(f'<ellipse cx="0" cy="-126" rx="16.5" ry="19" style="fill:{sk}"/>' + eyes)
    elif look == 'boy':
        parts.append(face + f'<path d="M-22 -130 Q-22 -154 0 -153 Q22 -154 22 -130 Q8 -142 -22 -130Z" style="fill:{hair}"/>' + eyes)
    elif look == 'man':
        parts.append(face + f'<path d="M-22 -130 Q-22 -154 0 -153 Q22 -154 22 -130 Q8 -142 -22 -130Z" style="fill:{hair}"/>'
                     f'<path d="M-19 -122 Q0 -96 19 -122 Q13 -108 0 -105 Q-13 -108 -19 -122Z" style="fill:{hair}"/>' + eyes)
    elif look == 'elder':
        parts.append(face + '<path d="M-22 -130 Q-22 -154 0 -153 Q22 -154 22 -130 Q8 -142 -22 -130Z" style="fill:#e9e4dc"/>'
                     '<path d="M-19 -122 Q0 -90 19 -122 Q13 -104 0 -100 Q-13 -104 -19 -122Z" style="fill:#e9e4dc"/>' + eyes)
        parts.append('<path d="M-46 -52 L-46 0" stroke="#7a5a3a" stroke-width="5" stroke-linecap="round"/><path d="M-46 -52 q-8 0 -8 8" fill="none" stroke="#7a5a3a" stroke-width="5" stroke-linecap="round"/>')
    elif look == 'official':
        parts.append(face + f'<path d="M-22 -130 Q-22 -154 0 -153 Q22 -154 22 -130 Q8 -142 -22 -130Z" style="fill:#3a3a3a"/>' + eyes)
    elif look == 'scout':
        parts.append(face + f'<path d="M-19 -122 Q0 -96 19 -122 Q13 -108 0 -105 Q-13 -108 -19 -122Z" style="fill:{hair}"/>' + eyes)
        parts.append('<ellipse cx="0" cy="-143" rx="34" ry="7" style="fill:var(--t2)"/><path d="M-19 -143 Q-17 -164 0 -164 Q17 -164 19 -143Z" style="fill:var(--t2)"/>'
                     '<path d="M-14 -104 L0 -90 L14 -104 L0 -108Z" style="fill:var(--sun)"/>')
    parts.append('</g></g>')
    return ''.join(parts)


def mini(x, y, c, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})"><circle cy="-28" r="7" style="fill:#e8b88f"/>'
            f'<path d="M-9 0 L-7 -20 Q0 -24 7 -20 L9 0Z" {F(c)}/></g>')


# ------------------------------------------------------------------ props (centre ~ x=330, ground y~235)
def p_crowd():
    out = ['<g class="prop">']
    cols = ['t1', 't2', 't3', 't4', 't5', 't6', 't7']
    for i in range(14):
        x = 120 + i * 30 + (i % 2) * 8
        y = 244 + (i % 3) * 8
        out.append(mini(x, y, cols[i % 7], 1.15))
    out.append('<g transform="translate(300 118)"><rect x="-60" y="-34" width="120" height="68" rx="16" ' + F('brand') + '/>'
               '<text x="0" y="12" text-anchor="middle" class="svg-big" style="fill:var(--on-brand)">٤٠</text></g>')
    out.append('<path d="M300 152 L300 205" ' + S('muted', 4) + '/>')
    for i, x in enumerate((180, 420)):
        out.append(f'<g class="float" style="animation-delay:{-i*1.3}s"><path d="M{x} 96 l12 -22 12 22 -12 -6z" ' + F('sun') + '/></g>')
    out.append('</g>')
    return ''.join(out)


def p_flood():
    rain = ''.join(f'<line class="rain" x1="{x}" y1="{60 + (x % 5) * 8}" x2="{x - 10}" y2="{92 + (x % 5) * 8}" style="animation-delay:{-(x % 7) * .17}s"/>'
                   for x in range(130, 520, 24))
    return ('<g class="prop"><g class="cloud-dark"><ellipse cx="250" cy="52" rx="110" ry="30" style="fill:var(--ink-2)"/><ellipse cx="330" cy="40" rx="80" ry="30" style="fill:var(--ink-2)"/><ellipse cx="180" cy="62" rx="70" ry="22" style="fill:var(--ink-2)"/></g>'
            + f'<g class="rains">{rain}</g>'
            '<g transform="translate(400 120)"><path d="M0 0 V110" ' + S('muted', 5) + '/><rect x="-34" y="-30" width="68" height="46" rx="10" ' + F('t3') + '/>'
            '<path d="M-14 -20 L14 8 M14 -20 L-14 8" stroke="#fff" stroke-width="6" stroke-linecap="round"/></g>'
            '<g transform="translate(200 215)"><path d="M-40 10 L0 -48 L40 10Z" ' + F('t2') + '/><path d="M-12 10 L0 -14 L12 10Z" style="fill:var(--head)"/></g>'
            '<g class="waves"><path d="M-40 250 q25 -14 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V310 H-40Z" style="fill:var(--sky);opacity:.72"/></g>'
            '<g class="waves w2"><path d="M-40 266 q25 -12 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V310 H-40Z" style="fill:var(--sky);opacity:.9"/></g></g>')


def p_village():
    def house(x, h, c):
        return (f'<g transform="translate({x} 236)"><rect x="-42" y="{-h}" width="84" height="{h}" rx="6" style="fill:var(--surface-3)"/>'
                f'<rect x="-46" y="{-h-8}" width="92" height="12" rx="4" {F(c)}/><rect x="-10" y="-46" width="20" height="46" rx="8" style="fill:var(--head)"/>'
                f'<rect x="-34" y="{-h+16}" width="18" height="18" rx="4" class="lit"/><rect x="16" y="{-h+16}" width="18" height="18" rx="4" class="lit"/></g>')

    def palm(x):
        return (f'<g class="sway" transform="translate({x} 238)"><path d="M0 0 Q6 -50 -2 -96" ' + S('t2', 7) + '/>'
                '<path d="M-2 -96 q-34 -6 -52 22 M-2 -96 q-8 -34 -46 -38 M-2 -96 q10 -36 44 -34 M-2 -96 q34 -2 52 24" ' + S('leaf', 6) + '/></g>')
    return ('<g class="prop">' + house(190, 90, 't2') + house(300, 70, 't3') + house(410, 100, 't6') + palm(120) + palm(480)
            + '<g transform="translate(300 66)"><path d="M-28 28 Q-28 -6 0 -6 Q28 -6 28 28Z" ' + F('brand') + '/><path d="M0 -6 V-26" ' + S('sun', 3) + '/>'
            '<circle cx="0" cy="-32" r="6" style="fill:var(--sun)"/></g></g>')


def p_parents():
    out = ['<g class="prop">']
    out.append('<g transform="translate(150 60)"><path d="M0 70 L80 6 L160 70 V180 H0Z" style="fill:var(--surface-3)"/><path d="M-8 74 L80 -2 L168 74" ' + S('t3', 8) + '/>'
               '<rect x="48" y="86" width="64" height="52" rx="8" class="lit"/>' + mini(70, 138, 't7', 1.3).replace('translate(70 138)', 'translate(70 138)') + mini(94, 138, 't4', 1.1) + '</g>')
    out.append('<g transform="translate(380 70) rotate(-8)"><rect x="-38" y="0" width="76" height="140" rx="14" style="fill:var(--head)"/><rect x="-31" y="12" width="62" height="112" rx="8" ' + F('brand') + '/>'
               '<g class="beat"><path d="M0 92 q-22 -16 -14 -32 q10 -14 14 0 q4 -14 14 0 q8 16 -14 32z" style="fill:#fff"/></g></g>')
    for i, (x, y, tx) in enumerate(((300, 70, '؟'), (470, 100, '؟'), (445, 40, '!'))):
        out.append(f'<g class="float" style="animation-delay:{-i*1.1}s"><rect x="{x-24}" y="{y-20}" width="48" height="38" rx="14" style="fill:var(--surface)" stroke="var(--line-2)"/><text x="{x}" y="{y+8}" text-anchor="middle" class="svg-mid" style="fill:var(--t3)">{tx}</text></g>')
    out.append('</g>')
    return ''.join(out)


def p_photo(alert=False):
    out = ['<g class="prop">']
    for i, (x, c) in enumerate(((160, 't1'), (250, 't4'), (340, 't6'))):
        out.append(f'<g transform="translate({x} {90 + i*6}) rotate({-6 + i*6})"><rect x="-38" y="0" width="76" height="92" rx="8" style="fill:var(--surface);stroke:var(--line-2)"/><rect x="-30" y="8" width="60" height="62" rx="4" {F(c, "opacity:.25")}/>'
                   f'<circle cx="0" cy="34" r="14" style="fill:#e0b48c"/><path d="M-20 70 Q0 44 20 70Z" {F(c)}/>'
                   + ('<rect x="-18" y="22" width="36" height="26" rx="8" class="blur"/>' if i != 1 else '') + '</g>')
    out.append('<g transform="translate(450 150)"><rect x="-48" y="-26" width="96" height="62" rx="12" style="fill:var(--head)"/><rect x="-26" y="-38" width="30" height="14" rx="5" style="fill:var(--head)"/>'
               '<circle cx="0" cy="5" r="22" style="fill:var(--surface-3)"/><circle cx="0" cy="5" r="13" ' + F('sky') + '/><circle cx="-6" cy="0" r="4" style="fill:#fff;opacity:.8"/>'
               '<g class="flash"><path d="M34 -30 l6 -14 6 14 14 6 -14 6 -6 14 -6 -14 -14 -6z" ' + F('sun') + '/></g></g>')
    if alert:
        out.append('<g class="beat" transform="translate(300 40)"><path d="M0 -28 L30 24 H-30Z" ' + F('t3') + '/><rect x="-3" y="-8" width="6" height="18" rx="3" style="fill:#fff"/><circle cy="17" r="3.3" style="fill:#fff"/></g>')
    else:
        out.append('<g transform="translate(300 52)"><path d="M0 -30 L26 -20 V6 Q26 24 0 34 Q-26 24 -26 6 V-20Z" ' + F('brand') + '/><rect x="-11" y="-4" width="22" height="18" rx="4" style="fill:#fff"/><path d="M-7 -4 V-10 a7 7 0 0 1 14 0 V-4" fill="none" stroke="#fff" stroke-width="3.4"/></g>')
    out.append('</g>')
    return ''.join(out)


def p_money(alert=False):
    out = ['<g class="prop">']
    out.append('<g transform="translate(150 120) rotate(-6)"><rect width="150" height="92" rx="16" ' + F('brand') + '/><rect x="16" y="22" width="30" height="24" rx="5" style="fill:var(--sun)"/>'
               '<rect x="16" y="62" width="90" height="8" rx="4" style="fill:#fff;opacity:.7"/><circle cx="118" cy="30" r="12" style="fill:#fff;opacity:.35"/></g>')
    for i in range(3):
        out.append(f'<g transform="translate({300 + i*26} {112 - i*8}) rotate({i*4})"><rect width="82" height="108" rx="6" style="fill:var(--surface);stroke:var(--line-2)"/>'
                   '<rect x="12" y="14" width="46" height="6" rx="3" style="fill:var(--line-2)"/><rect x="12" y="30" width="58" height="6" rx="3" style="fill:var(--line-2)"/><rect x="12" y="46" width="38" height="6" rx="3" style="fill:var(--line-2)"/>'
                   + (f'<path d="M26 82 l10 10 22 -26" ' + S('leaf', 7) + '/>' if i == 2 and not alert else '') + '</g>')
    if alert:
        out.append('<g class="beat" transform="translate(402 78)"><circle r="26" ' + F('t3') + '/><path d="M-10 -10 L10 10 M10 -10 L-10 10" stroke="#fff" stroke-width="6" stroke-linecap="round"/></g>')
    out.append('<g transform="translate(470 206)"><ellipse cy="14" rx="30" ry="8" ' + F('sun') + '/><ellipse cy="4" rx="30" ry="8" style="fill:#f1bd3f"/><ellipse cy="-6" rx="30" ry="8" ' + F('sun') + '/></g>')
    out.append('</g>')
    return ''.join(out)


def p_centre():
    return ('<g class="prop"><g transform="translate(120 236)"><rect x="0" y="-130" width="260" height="130" rx="10" style="fill:var(--surface-3)"/><rect x="-10" y="-146" width="280" height="22" rx="8" ' + F('t3') + '/>'
            '<rect x="100" y="-76" width="60" height="76" rx="10" style="fill:var(--head)"/><rect x="24" y="-100" width="52" height="40" rx="6" class="lit"/><rect x="184" y="-100" width="52" height="40" rx="6" class="lit"/>'
            '<circle cx="130" cy="-170" r="0"/></g>'
            '<g transform="translate(450 232)"><rect x="-36" y="-84" width="72" height="84" rx="6" fill="none" style="stroke:var(--ink-2)" stroke-width="5"/><path d="M-36 -52 H36 M0 -84 V0" ' + S('ink-2', 2) + '/></g>'
            '<g class="bounce" transform="translate(500 232)"><circle cy="-20" r="18" style="fill:#fff;stroke:var(--ink-2)" stroke-width="3"/><path d="M0 -38 L-10 -26 L-6 -10 H6 L10 -26Z" style="fill:var(--ink-2)"/></g>'
            '<path d="M130 76 l10 -16 10 16z" ' + F('sun') + '/></g>')


def p_assoc():
    def basket(x, c):
        return (f'<g transform="translate({x} 232)"><path d="M-34 -42 H34 L28 0 H-28Z" {F(c)}/><path d="M-34 -42 H34" ' + S('head', 4) + '/>'
                '<circle cx="-14" cy="-52" r="9" style="fill:#f1bd3f"/><circle cx="6" cy="-56" r="10" style="fill:var(--t3)"/><circle cx="22" cy="-50" r="8" style="fill:var(--leaf)"/></g>')
    return ('<g class="prop"><rect x="120" y="190" width="380" height="14" rx="6" style="fill:var(--t2)"/><path d="M150 204 V236 M470 204 V236" ' + S('t2', 8) + '/>'
            + basket(190, 't7') + basket(290, 't5') + basket(390, 't4')
            + '<g class="beat" transform="translate(300 90)"><path d="M0 40 q-60 -42 -34 -76 q24 -26 34 6 q10 -32 34 -6 q26 34 -34 76z" ' + F('t7') + '/></g>'
            + mini(150, 262, 't1', 1.2) + mini(450, 262, 't2', 1.2) + '</g>')


def p_party():
    return ('<g class="prop"><g class="sway" transform="translate(220 236)"><path d="M0 0 V-170" ' + S('muted', 6) + '/><path d="M0 -168 H120 L100 -134 L120 -100 H0Z" ' + F('t4') + '/>'
            '<path d="M14 -150 H90 M14 -134 H80 M14 -118 H86" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/></g>'
            '<g class="beat" transform="translate(240 120)"><circle r="78" fill="none" style="stroke:var(--t3)" stroke-width="12"/><path d="M-55 -55 L55 55" ' + S('t3', 12) + '/></g>'
            '<g transform="translate(430 232)"><rect x="-26" y="-36" width="52" height="36" rx="8" ' + F('t1') + '/><path d="M-26 -36 Q0 -62 26 -36" ' + S('brand', 5) + '/>'
            '<path d="M0 -62 V-78 M-18 -58 L-26 -72 M18 -58 L26 -72" ' + S('sun', 4) + '/></g></g>')


def p_csr():
    bars = ''.join(f'<path class="sig" d="M{300 + i*0} {90} " />' for i in range(0))
    return ('<g class="prop"><g transform="translate(160 236)"><path d="M0 0 L22 -150 L44 0 M8 -60 H36 M12 -100 H32 M2 -20 H42" ' + S('ink-2', 5) + '/>'
            '<circle cx="22" cy="-158" r="8" ' + F('t3') + '/>'
            '<path class="sig" d="M-16 -176 q38 -40 76 0" ' + S('brand', 4) + ' style="animation-delay:-.2s"/><path class="sig" d="M-32 -190 q54 -62 108 0" ' + S('brand', 4) + ' style="animation-delay:-.7s"/></g>'
            '<g transform="translate(330 236)"><ellipse cy="-8" rx="32" ry="9" ' + F('sun') + '/><ellipse cy="-20" rx="32" ry="9" style="fill:#f1bd3f"/><ellipse cy="-32" rx="32" ry="9" ' + F('sun') + '/><ellipse cy="-44" rx="32" ry="9" style="fill:#f1bd3f"/></g>'
            '<g transform="translate(400 130)"><rect x="0" y="0" width="120" height="70" rx="10" style="fill:var(--surface);stroke:var(--line-2)" stroke-width="3"/><rect x="0" y="0" width="120" height="70" rx="10" style="fill:var(--surface)"/>'
            '<rect x="14" y="14" width="60" height="9" rx="4" ' + F('brand') + '/><rect x="14" y="32" width="86" height="7" rx="3" style="fill:var(--line-2)"/><rect x="14" y="46" width="48" height="7" rx="3" style="fill:var(--line-2)"/><path d="M60 70 V104 M24 70 V104" ' + S('muted', 5) + '/></g>'
            '<g class="beat" transform="translate(300 110)"><path d="M-34 6 L-10 -14 L6 -2 L22 -14 L38 6 L16 26 L-12 26Z" ' + F('t7', 'opacity:.9') + '/></g></g>')


def p_border():
    return ('<g class="prop"><path d="M-10 215 Q150 150 300 190 T620 130" fill="none" style="stroke:var(--muted)" stroke-width="30" opacity=".35"/>'
            '<path d="M-10 215 Q150 150 300 190 T620 130" fill="none" style="stroke:#fff" stroke-width="3" stroke-dasharray="14 14" opacity=".8"/>'
            '<path d="M300 150 l60 -90 40 50 50 -70 90 110z" style="fill:var(--h1);opacity:.9"/>'
            '<g class="drive" transform="translate(130 188)"><rect x="0" y="-48" width="96" height="48" rx="8" ' + F('t1') + '/><path d="M96 -36 H124 L138 -14 V0 H96Z" ' + F('t1', 'filter:brightness(.85)') + '/>'
            '<rect x="12" y="-38" width="22" height="16" rx="3" class="lit"/><rect x="44" y="-38" width="22" height="16" rx="3" class="lit"/>'
            '<circle cx="24" cy="2" r="12" style="fill:var(--head)"/><circle cx="108" cy="2" r="12" style="fill:var(--head)"/><circle cx="24" cy="2" r="4" style="fill:#fff"/><circle cx="108" cy="2" r="4" style="fill:#fff"/></g>'
            '<g transform="translate(505 130)"><path d="M0 0 V-70" ' + S('muted', 5) + '/><path d="M0 -70 H38 V-44 H0Z" ' + F('t3') + '/></g>'
            '<g transform="translate(470 175)"><rect x="-22" y="-26" width="44" height="26" rx="4" style="fill:var(--surface-3)"/><path d="M-26 -26 L0 -48 L26 -26Z" ' + F('t2') + '/></g></g>')


def p_disability():
    return ('<g class="prop"><g transform="translate(150 236)"><rect x="0" y="-130" width="210" height="130" rx="10" style="fill:var(--surface-3)"/><rect x="60" y="-70" width="56" height="70" rx="8" style="fill:var(--head)"/>'
            '<rect x="14" y="-104" width="40" height="34" rx="5" class="lit"/><rect x="150" y="-104" width="40" height="34" rx="5" class="lit"/>'
            '<path d="M210 0 L330 -48 V0Z" style="fill:var(--line-2)"/><path d="M210 -4 L330 -52" ' + S('brand', 6) + '/></g>'
            '<g class="roll" transform="translate(440 192)"><circle cx="0" cy="12" r="26" fill="none" style="stroke:var(--head)" stroke-width="6"/><circle cx="0" cy="12" r="4" style="fill:var(--head)"/>'
            '<path d="M-6 -20 V10 H24" ' + S('head', 6) + '/><circle cx="-6" cy="-36" r="12" style="fill:#dba578"/><path d="M-6 -22 Q-26 -6 -4 10" ' + S('t6', 14) + '/></g>'
            '<g transform="translate(370 96)"><rect x="-28" y="-28" width="56" height="56" rx="12" ' + F('sky') + '/><circle cx="4" cy="-14" r="5" style="fill:#fff"/><path d="M0 -8 V6 H12 M-10 0 H6" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="-4" cy="14" r="10" fill="none" stroke="#fff" stroke-width="3.5"/></g></g>')


def p_isolation(alert=False):
    return ('<g class="prop"><g transform="translate(120 70)"><rect width="270" height="170" rx="18" style="fill:var(--surface-3)"/><rect x="18" y="18" width="70" height="86" rx="10" style="fill:var(--h2);opacity:.45"/>'
            '<circle cx="62" cy="48" r="14" style="fill:var(--sun)"/><path d="M0 170 V150 H270 V170Z" style="fill:var(--ink-2)"/>'
            '<g class="glow"><rect x="132" y="68" width="110" height="68" rx="8" style="fill:var(--head)"/><rect x="140" y="76" width="94" height="52" rx="4" ' + F('sky') + '/></g>'
            '<g transform="translate(110 150)"><circle cy="-70" r="17" style="fill:#e0b48c"/><path d="M-26 0 Q-30 -48 -6 -52 L22 -52 Q36 -40 30 0Z" ' + F('t7', 'filter:brightness(.8)') + '/><path d="M-4 -30 L40 -52" ' + S('t7', 9) + '/></g></g>'
            + ('<g class="float" transform="translate(430 90)"><rect x="-22" y="-22" width="44" height="44" rx="14" ' + F('t3') + '/><text y="9" text-anchor="middle" class="svg-mid" style="fill:#fff">٣</text></g>' if alert else '')
            + '<g class="float" transform="translate(420 120)"><path d="M0 0 h24 l-24 22 h24" ' + S('muted', 4) + '/></g></g>')


def p_burnout(alert=False):
    out = ['<g class="prop">']
    for i in range(5):
        out.append(f'<rect x="{150 + (i % 2)*10}" y="{214 - i*22}" width="120" height="20" rx="4" ' + F(['t2', 't4', 't5', 't6', 't3'][i]) + '/>')
    out.append('<g class="topple" transform="translate(205 108)"><rect width="120" height="20" rx="4" ' + F('t7') + '/></g>')
    out.append('<g transform="translate(360 150)"><rect width="110" height="56" rx="10" fill="none" style="stroke:var(--ink-2)" stroke-width="5"/><rect x="110" y="16" width="10" height="24" rx="3" style="fill:var(--ink-2)"/>'
               '<rect class="batt" x="9" y="9" width="22" height="38" rx="5" ' + F('t3') + '/></g>')
    out.append('<g transform="translate(420 82)"><circle r="30" fill="none" style="stroke:var(--ink-2)" stroke-width="5"/><path d="M0 -16 V0 L12 8" ' + S('ink-2', 5) + '/></g>')
    out.append('<g class="float" transform="translate(500 140)"><path d="M0 -16 q14 18 0 28 q-14 -10 0 -28z" ' + F('sky') + '/></g>')
    if alert:
        out.append('<g class="beat" transform="translate(300 50)"><circle r="24" ' + F('t3') + '/><rect x="-3" y="-14" width="6" height="18" rx="3" style="fill:#fff"/><circle cy="10" r="3.3" style="fill:#fff"/></g>')
    out.append('</g>')
    return ''.join(out)


def p_idea():
    return ('<g class="prop"><g class="float" transform="translate(220 110)"><path d="M0 -60 a44 44 0 0 1 26 80 v22 h-52 v-22 a44 44 0 0 1 26 -80z" ' + F('sun') + '/><rect x="-22" y="42" width="44" height="9" rx="4" style="fill:var(--ink-2)"/>'
            '<rect x="-14" y="56" width="28" height="8" rx="4" style="fill:var(--ink-2)"/><path d="M-12 -4 L0 14 L12 -4" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>'
            '<g class="spin" transform="translate(120 170)"><circle r="24" fill="none" style="stroke:var(--t4)" stroke-width="10" stroke-dasharray="9 7"/><circle r="9" ' + F('t4') + '/></g>'
            '<g transform="translate(330 120) rotate(8)"><rect x="0" y="0" width="70" height="126" rx="14" style="fill:var(--head)"/><rect x="7" y="12" width="56" height="94" rx="8" ' + F('t4') + '/>'
            '<circle cx="35" cy="50" r="14" style="fill:#fff;opacity:.9"/><rect x="16" y="76" width="38" height="8" rx="4" style="fill:#fff;opacity:.7"/></g>'
            '<g transform="translate(470 140)"><path d="M0 -40 L34 -26 V8 Q34 36 0 52 Q-34 36 -34 8 V-26Z" ' + F('brand') + '/><circle r="14" cy="0" fill="none" stroke="#fff" stroke-width="4"/><path d="M5 -6 a6 6 0 1 0 0 12" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/></g></g>')


def p_rivalry():
    return ('<g class="prop"><g class="sway" transform="translate(170 236)"><path d="M0 0 V-160" ' + S('muted', 6) + '/><path d="M0 -160 H92 V-100 H0Z" ' + F('t3') + '/><circle cx="46" cy="-130" r="14" style="fill:#fff;opacity:.85"/></g>'
            '<g class="sway" style="animation-delay:-1.2s" transform="translate(470 236)"><path d="M0 0 V-160" ' + S('muted', 6) + '/><path d="M0 -160 H-92 V-100 H0Z" ' + F('t4') + '/><circle cx="-46" cy="-130" r="14" style="fill:#fff;opacity:.85"/></g>'
            '<g class="flash" transform="translate(320 80)"><path d="M10 -50 L-22 6 H0 L-10 52 L26 -10 H4Z" ' + F('sun') + '/></g>'
            + mini(250, 248, 't3', 1.2) + mini(390, 248, 't4', 1.2) + '</g>')


def p_scouts():
    return ('<g class="prop"><g transform="translate(150 236)"><path d="M0 0 L70 -120 L140 0Z" ' + F('t2') + '/><path d="M70 -120 L46 0 H94Z" style="fill:var(--head)"/><path d="M70 -120 V-150" ' + S('muted', 4) + '/><path d="M70 -150 h26 l-6 10 6 10 h-26z" ' + F('t3') + '/></g>'
            '<g transform="translate(360 236)"><path d="M-40 0 L40 -12 M-40 -12 L40 0" ' + S('t2', 9) + '/><g class="flame"><path d="M0 -14 q-22 -30 0 -62 q8 18 18 22 q6 22 -18 40z" ' + F('t3') + '/><path d="M0 -14 q-10 -18 0 -36 q10 14 6 26z" ' + F('sun') + '/></g></g>'
            '<g transform="translate(470 236)"><path d="M0 0 V-60" ' + S('t2', 8) + '/><path d="M0 -50 q-36 -10 -34 -46 q34 6 34 46z M0 -60 q36 -10 34 -46 q-34 6 -34 46z" ' + F('leaf') + '/></g>'
            '<g transform="translate(250 100)"><path d="M0 0 l30 -24 30 24 -30 18z" ' + F('sun') + '/></g></g>')


def p_council():
    return ('<g class="prop"><g transform="translate(130 60)"><rect width="270" height="150" rx="14" style="fill:var(--surface);stroke:var(--line-2)" stroke-width="3"/>'
            '<g class="grow"><rect x="26" y="90" width="34" height="44" rx="5" ' + F('t1') + '/><rect x="76" y="64" width="34" height="70" rx="5" ' + F('t4') + '/><rect x="126" y="40" width="34" height="94" rx="5" ' + F('t2') + '/><rect x="176" y="22" width="34" height="112" rx="5" ' + F('t6') + '/></g>'
            '<path d="M24 138 H246" ' + S('muted', 3) + '/></g>'
            '<g transform="translate(430 236)"><rect x="-40" y="-70" width="80" height="70" rx="8" style="fill:var(--t2)"/><path d="M-48 -70 H48" ' + S('head', 8) + '/></g>'
            '<g class="beat" transform="translate(300 40)"><path d="M0 -4 l7 14 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2z" ' + F('sun') + '/></g></g>')


def p_halqa():
    out = ['<g class="prop"><g transform="translate(120 236)"><rect x="0" y="-100" width="180" height="100" rx="8" style="fill:var(--surface-3)"/><path d="M10 -100 Q90 -190 170 -100Z" ' + F('brand') + '/>'
           '<path d="M90 -158 V-180" ' + S('sun', 3) + '/><rect x="-26" y="-170" width="26" height="170" rx="6" style="fill:var(--surface-3)"/><path d="M-30 -170 L-13 -200 L4 -170Z" ' + F('brand') + '/>'
           '<rect x="70" y="-62" width="40" height="62" rx="18" style="fill:var(--head)"/></g>']
    out.append('<ellipse cx="400" cy="250" rx="130" ry="18" ' + F('t1', 'opacity:.35') + '/>')
    for i, c in enumerate(('t1', 't2', 't4', 't7', 't5')):
        x = 310 + i * 48
        out.append(f'<g transform="translate({x} 250)"><circle cy="-48" r="12" style="fill:#e2b38a"/><path d="M-17 0 Q-17 -34 0 -34 Q17 -34 17 0Z" {F(c)}/><rect x="-11" y="-20" width="22" height="14" rx="2" style="fill:#fff"/></g>')
    out.append('<g class="glow" transform="translate(400 190)"><path d="M-30 0 Q-15 -10 0 0 Q15 -10 30 0 V20 Q15 10 0 20 Q-15 10 -30 20Z" ' + F('sun') + '/></g>')
    out.append('</g>')
    return ''.join(out)


PROPS = {
    'crowd': p_crowd, 'flood': p_flood, 'village': p_village, 'parents': p_parents, 'photo': p_photo,
    'photo_alert': lambda: p_photo(True), 'money': p_money, 'money_alert': lambda: p_money(True),
    'centre': p_centre, 'assoc': p_assoc, 'party': p_party, 'csr': p_csr, 'border': p_border,
    'disability': p_disability, 'isolation': p_isolation, 'isolation_alert': lambda: p_isolation(True),
    'burnout': p_burnout, 'burnout_alert': lambda: p_burnout(True), 'idea': p_idea, 'rivalry': p_rivalry,
    'scouts': p_scouts, 'council': p_council, 'halqa': p_halqa,
}


def scene(uid, key, mood, look, top, label, skin=1, wave=True):
    """The full layered scene as one <svg>. `key` selects the prop, `mood` the palette (set in season.css)."""
    cl = ''.join(f'<g class="cloud c{i}" style="animation-delay:{-i*13}s"><ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}"/><ellipse cx="{x+rx*.5:.0f}" cy="{y-ry*.6:.0f}" rx="{rx*.6:.0f}" ry="{ry*1.0:.0f}"/></g>'
                 for i, (x, y, rx, ry) in enumerate(((120, 46, 56, 16), (470, 30, 70, 18), (680, 74, 50, 14))))
    sun = '<g class="orb"><circle class="halo" cx="700" cy="56" r="58"/><circle class="disc" cx="700" cy="56" r="30"/></g>'
    stars = ''.join(f'<circle class="star" cx="{x}" cy="{y}" r="{r}" style="animation-delay:{-i*.37}s"/>' for i, (x, y, r) in enumerate(
        ((60, 30, 1.8), (200, 70, 1.4), (330, 24, 2), (520, 60, 1.5), (590, 22, 1.8), (760, 120, 1.4), (420, 100, 1.2), (140, 120, 1.5))))
    hills = ('<path class="hill-far" d="M0 190 Q120 120 250 170 T520 150 T800 170 V300 H0Z"/>'
             '<path class="hill-mid" d="M0 215 Q160 160 330 205 T640 190 T800 205 V300 H0Z"/>'
             '<path class="ground" d="M0 236 Q200 226 400 236 T800 232 V300 H0Z"/>')
    prop = PROPS[key]()
    char = person(585, 262, look, top, 1.28, skin, 'wave' if wave else 'down')
    return (f'<svg class="ss-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="{label}" focusable="false">'
            f'<defs><linearGradient id="ssk-{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></linearGradient></defs>'
            f'<rect width="{W}" height="{H}" fill="url(#ssk-{uid})"/><g class="stars">{stars}</g>{sun}<g class="clouds">{cl}</g>{hills}{prop}{char}</svg>')


def hero_scene(uid='hero'):
    """Start-screen panorama: a governorate with seven team banners."""
    cols = ['t1', 't2', 't3', 't4', 't5', 't6', 't7']
    flags = ''.join(f'<g class="sway" style="animation-delay:{-i*.5}s" transform="translate({90 + i*100} 246)"><path d="M0 0 V-{74 + (i%3)*14}" ' + S('muted', 4) + f'/><path d="M0 -{74 + (i%3)*14} h34 l-8 11 8 11 h-34z" ' + F(c) + '/></g>'
                    for i, c in enumerate(cols))
    cl = ''.join(f'<g class="cloud c{i}" style="animation-delay:{-i*13}s"><ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}"/><ellipse cx="{x+rx*.5:.0f}" cy="{y-ry*.6:.0f}" rx="{rx*.6:.0f}" ry="{ry}"/></g>'
                 for i, (x, y, rx, ry) in enumerate(((120, 46, 56, 16), (470, 30, 70, 18), (680, 74, 50, 14))))
    return (f'<svg class="ss-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            f'<defs><linearGradient id="ssk-{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></linearGradient></defs>'
            f'<rect width="{W}" height="{H}" fill="url(#ssk-{uid})"/><g class="orb"><circle class="halo" cx="400" cy="120" r="90"/><circle class="disc" cx="400" cy="120" r="46"/></g>'
            f'<g class="clouds">{cl}</g><path class="hill-far" d="M0 190 Q120 120 250 170 T520 150 T800 170 V300 H0Z"/><path class="hill-mid" d="M0 215 Q160 160 330 205 T640 190 T800 205 V300 H0Z"/>'
            f'<path class="ground" d="M0 236 Q200 226 400 236 T800 232 V300 H0Z"/>{flags}'
            '<g transform="translate(400 238)"><path d="M-6 0 Q0 -40 6 0Z" style="fill:var(--ink-2)"/></g></svg>')
