#!/usr/bin/env python3
"""Shared core for the Takamul site generator: brochure access, icons, site
structure, reusable components and the page shell.

Every visible text comes verbatim from the brochure via L(n), where n is the
1-based line number in content/brochure.txt. Entry point: python3 tools/build.py
See docs/ARCHITECTURE.md for file ownership and contracts.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
D = (ROOT / 'content' / 'brochure.txt').read_text(encoding='utf-8').split('\n')
LANGS = ('ar', 'en', 'tr')
LANG = 'ar'
OUT = SITE  # where page()/build_kb write; site/<lang>/ for translations


def set_lang(lang):
    """Switch the brochure source + output folder. D is mutated in place so every
    `from core import D` keeps seeing the active language."""
    global LANG, OUT
    LANG = lang
    OUT = SITE if lang == 'ar' else SITE / lang
    OUT.mkdir(exist_ok=True)
    name = 'brochure.txt' if lang == 'ar' else f'brochure.{lang}.txt'
    D[:] = (ROOT / 'content' / name).read_text(encoding='utf-8').split('\n')


def alternates(fn):
    if fn == '404.html':
        return ''
    base = '' if LANG == 'ar' else '../'
    return ''.join(f'<link rel="alternate" hreflang="{l}" href="{base}{"" if l == "ar" else l + "/"}{fn}">' for l in LANGS)


def lang_switch(fn, cls='lang-switch'):
    """Links to the same page in the other languages (paths relative to the current page)."""
    base = '' if LANG == 'ar' else '../'
    href = {'ar': base + fn, 'en': base + 'en/' + fn, 'tr': base + 'tr/' + fn}
    names = {'ar': 'عربي', 'en': 'EN', 'tr': 'TR'}
    full = {'ar': 'العربية', 'en': 'English', 'tr': 'Türkçe'}
    return (f'<div class="{cls}" role="group" aria-label="Language">' + ''.join(
        f'<a href="{href[l]}" hreflang="{l}" lang="{l}" title="{full[l]}"'
        + (' class="on" aria-current="true"' if l == LANG else '') + f'>{names[l]}</a>' for l in LANGS) + '</div>')

HEADER_LINE = 'جمعية تكامل لبناء القيم والتنمية   |   الكتيب التعريفي للأعضاء الجدد'  # Word page header


def header_line():
    if LANG == 'ar':
        return HEADER_LINE
    return D[500].split('  |  ')[0].strip() + '   |   ' + D[0].strip()


def L(n):
    return re.sub(r'^[●✔◆]\s+', '', D[n - 1].strip())


def LS(a, b):
    return [L(i) for i in range(a, b + 1)]


# ---------------------------------------------------------------- icons ---
ICONS = {
    'home': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    'sprout': '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
    'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    'grid': '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
    'landmark': '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    'pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'droplet': '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    'coins': '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    'refresh': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'wrench': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    'flask': '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
    'scale': '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    'building': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    'cap': '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    'briefcase': '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    'tree': '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>',
    'sparkles': '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'trash': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    'download': '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    'calc': '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/>',
    'gift': '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    'share': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
    'cart': '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    'file': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8M16 17H8M16 13h-2"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'arrow-right': '<path d="m12 5 7 7-7 7"/><path d="M5 12h14"/>',
    'menu': '<line x1="4" x2="20" y1="7" y2="7"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="17" y2="17"/>',
    'user': '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'pinmark': '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'command': '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    'chart': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    'book': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
}


def ic(name, cls='i'):
    if LANG != 'ar' and name == 'arrow-left':  # "forward" points right in LTR pages
        name = 'arrow-right'
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>')


# ---------------------------------------------------------- structure ---
PAGES = [
    # file, nav label, icon, short label for tab bar
    ('index.html', 'الرئيسية', 'home'),
    ('about.html', 'من نحن', 'info'),
    ('initiatives.html', 'المبادرات', 'sprout'),
    ('expansion.html', 'خطة التوسع', 'globe'),
    ('governance.html', 'الحوكمة والتمويل', 'shield'),
    ('join.html', 'العضوية', 'users'),
    ('faq.html', 'دليل الإجابات', 'help'),
    ('dashboard.html', 'لوحة القيادة', 'chart'),
    ('support.html', 'ساهم معنا', 'heart'),
]
PAGE_LABEL = {f: t for f, t, _ in PAGES}
PAGE_LABEL['transparency.html'] = 'الشفافية'

# section number -> (number line, title line, subtitle line, page, colour token)
SECTIONS = {
    # colours = the brochure's section colours (see css/book.css)
    1: (39, 40, 41, 'about.html', 'blue'),
    2: (49, 50, 51, 'about.html', 'teal'),
    3: (72, 73, 74, 'initiatives.html', 'red'),
    4: (97, 98, 99, 'about.html', 'purple'),
    5: (126, 127, 128, 'expansion.html', 'amber'),
    6: (157, 158, 159, 'initiatives.html', 'green'),
    7: (168, 169, 170, 'governance.html', 'rust'),
    8: (204, 205, 206, 'governance.html', 'slate'),
    9: (227, 228, 229, 'join.html', 'cyan'),
    10: (240, 241, 242, 'initiatives.html', 'violet'),
    11: (249, 250, 251, 'join.html', 'forest'),
    12: (301, 302, 303, 'join.html', 'navy'),
    13: (376, 377, 378, 'faq.html', 'maroon'),
}
SEC_ICON = {1: 'landmark', 2: 'eye', 3: 'sprout', 4: 'scale', 5: 'globe', 6: 'users', 7: 'shield',
            8: 'coins', 9: 'check', 10: 'chart', 11: 'pinmark', 12: 'heart', 13: 'help'}


def sec_link(n):
    return f'{SECTIONS[n][3]}#s{n}'


def toc_items():
    """Table of contents exactly as in the brochure (lines 13-38: number/title pairs)."""
    pairs = [(int(L(i)), L(i + 1)) for i in range(13, 39, 2)]
    return sorted(pairs)


# ------------------------------------------------------------ helpers ---
def ul(items, cls=''):
    return f'<ul class="list {cls}">' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'


def card(title, text, icon=None, cls='', extra=''):
    i = f'<div class="ic">{ic(icon)}</div>' if icon else ''
    return f'<article class="card tilt rv {cls}">{i}<h3>{title}</h3><p>{text}</p>{extra}</article>'


def numcard(num, title, text, cls=''):
    return f'<article class="card tilt rv {cls}"><span class="num">{num}</span><h3>{title}</h3><p>{text}</p></article>'


def subhead(text, sub='', id=None):
    s = f'<p class="subhead-sub">{sub}</p>' if sub else ''
    a = f' id="{id}"' if id else ''
    return f'<div class="subhead rv"{a}><h3>{text}</h3>{s}</div>'


def section(n, body, alt=False, lead=''):
    num_l, title_l, sub_l, _, colour = SECTIONS[n]
    lead_html = f'<p class="lead rv">{lead}</p>' if lead else ''
    return f'''
<section class="sec{' alt' if alt else ''}" id="s{n}" style="--sc:var(--c-{colour})">
  <div class="wrap">
    <header class="sec-head rv">
      <span class="sec-num" aria-hidden="true">{L(num_l)}</span>
      <div><h2>{L(title_l)}</h2><p class="sec-sub">{L(sub_l)}</p></div>
    </header>
    {lead_html}
    {body}
  </div>
</section>'''


HERO_PHOTO = {'about.html': 'dome', 'initiatives.html': 'classroom', 'expansion.html': 'bosphorus',
              'governance.html': 'board', 'join.html': 'hands', 'faq.html': 'ortakoy'}


def photo_strip(*names):
    """A row of illustrative photos inside a section (decorative, labelled «صور تعبيرية»)."""
    figs = ''.join(f'<figure class="pstrip-item rv" style="--img:url(../assets/img/{n}.jpg)"></figure>' for n in names)
    return f'<div class="pstrip n{len(names)}" aria-hidden="true">{figs}</div><p class="ph-note rv">صور تعبيرية</p>'


GALLERY = ['istanbul', 'reading', 'workshop', 'dialogue', 'bakery', 'youth', 'dome', 'training',
           'classroom', 'ortakoy', 'mentor', 'distribution', 'hands', 'bosphorus', 'courtyard', 'board']


def gallery():
    one = ''.join(f'<span class="g-item" style="--img:url(../assets/img/{n}.jpg)"></span>' for n in GALLERY)
    return f'<div class="gallery" aria-hidden="true"><div class="g-track">{one}{one}</div></div>'


def photo_layer(name):
    return f'<div class="hero-photo" aria-hidden="true" style="--img:url(../assets/img/{name}.jpg)"></div>' if name else ''


def image_credits():
    try:
        cr = json.loads((ROOT / 'content' / 'image-credits.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return ''
    lic = {'by': 'CC BY', 'cc0': 'CC0', 'pdm': 'ملكية عامة'}
    items = ' · '.join(f'<a href="{c["url"]}" rel="noopener" target="_blank">{c["creator"] or c["title"]}</a> ({lic.get(c["license"], c["license"])})' for c in cr)
    return f'<p class="img-credits">صور تعبيرية — المصادر: {items}</p>'


def page_hero(fn, nums, visual=False):
    chips = ''.join(
        f'<a class="chip-link" href="#s{n}" style="--sc:var(--c-{SECTIONS[n][4]})"><b>{L(SECTIONS[n][0])}</b>{L(SECTIONS[n][1])}</a>'
        for n in nums)
    vis = ('<div class="hero-visual small" aria-hidden="true"><canvas class="globe" data-globe></canvas></div>'
           if visual else '')
    return f'''
<section class="hero hero-small{' has-visual' if visual else ''}{' has-photo' if HERO_PHOTO.get(fn) else ''}">
  <div class="hero-bg" aria-hidden="true"></div>{photo_layer(HERO_PHOTO.get(fn))}
  <div class="hero-aurora" aria-hidden="true"></div>
  <span class="hero-num" aria-hidden="true">{'·'.join(L(SECTIONS[n][0]) for n in nums)}</span>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow rv">{ic('book')} {L(1)}</span>
      <h1 class="rv hero-title">{PAGE_LABEL[fn]}</h1>
      <nav class="chips rv" aria-label="أقسام الصفحة">{chips}</nav>
    </div>
    {vis}
  </div>
</section>
{ticker()}'''


def ticker():
    items = ''.join(f'<span>✦ {L(n)}</span>' for n in (307, 315, 324, 331, 335, 343, 349, 355, 364, 368))
    return f'<div class="ticker" aria-hidden="true"><div class="ticker-track">{items}{items}</div></div>'


def cta():
    return f'''
<section class="cta">
  <div class="cta-glow" aria-hidden="true"></div>
  <div class="wrap rv">
    <img src="assets/logo.png" alt="" width="84" height="84" class="cta-logo">
    <h2>{L(499)}</h2>
    <p>{L(500)}</p>
    <div class="btns center">
      <a class="btn btn-gold" href="join.html#apply">{ic('users')}العضوية</a>
      <button class="btn btn-ghost" type="button" data-open-chat>{ic('sparkles')}اسأل المساعد الذكي</button>
    </div>
  </div>
</section>'''


# --------------------------------------------------------------- shell ---
def page(fn, title, body, desc, globe=False, css=(), js=()):
    links = ''.join(
        f'<a href="{h}"{" class=active aria-current=page" if h == fn else ""}>{t}</a>' for h, t, _ in PAGES)
    def mi(h, t, icon, sub=''):
        a = ' aria-current="page"' if h.split('#')[0] == fn and '#' not in h else ''
        sb = f'<small>{sub}</small>' if sub else ''
        return f'<a class="mm-item" href="{h}"{a}><span class="mm-ic">{ic(icon)}</span><span><b>{t}</b>{sb}</span></a>'
    groups = [
        ('عن تكامل', 'info', ['about.html', 'governance.html', 'expansion.html', 'dashboard.html', 'faq.html', 'transparency.html'], [
            mi('about.html', 'من نحن', 'info', L(41)), mi('governance.html', 'الحوكمة والتمويل', 'shield', L(170)),
            mi('expansion.html', 'خطة التوسع', 'globe', L(7)), mi('dashboard.html', 'لوحة القيادة', 'chart', L(2)),
            mi('faq.html', 'دليل الإجابات', 'help', L(378)), mi('transparency.html', 'الشفافية', 'file', L(206)),
            mi('index.html#toc', L(12), 'book', L(1))]),
        ('البرامج', 'sprout', ['initiatives.html'], [
            mi('initiatives.html#s3-1', 'مبادرة «ينابيع»', 'droplet', L(77).split(':', 1)[-1].strip()),
            mi('initiatives.html#s3-2', 'مبادرة «منافع»', 'coins', L(83).split(':', 1)[-1].strip()),
            mi('initiatives.html#s3-3', 'التنسيق والتكامل المؤسسي', 'link', L(90)),
            mi('initiatives.html#s6', L(158), 'users', L(159)), mi('support.html#programs', 'برامج تحتاج دعمك', 'heart')]),
        ('شارك معنا', 'heart', ['support.html', 'join.html'], [
            mi('support.html#donate', 'تبرع الآن', 'heart', L(211)), mi('support.html#zakat', 'حاسبة الزكاة', 'calc'), mi('support.html#volunteer', 'تطوّع معنا', 'users', L(326)[:70] + '…'),
            mi('join.html#apply', 'طلب العضوية', 'check', L(184)), mi('join.html#s9', L(228), 'pinmark', L(229))]),
    ]
    mega = '<a class="mtop' + (' on' if fn == 'index.html' else '') + '" href="index.html">الرئيسية</a>'
    for gi, (label, icon, pages_, items) in enumerate(groups):
        on = ' on' if fn in pages_ else ''
        mega += (f'<div class="mgroup"><button type="button" class="mtop{on}" aria-expanded="false" aria-controls="mm{gi}">{label}'
                 f'<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>'
                 f'<div class="mpanel" id="mm{gi}"><div class="mgrid">{"".join(items)}</div></div></div>')
    mega += '<a class="mtop" href="support.html#contact">تواصل معنا</a>'
    sheet = ''.join(
        f'<a class="sheet-item{" active" if h == fn else ""}" href="{h}">{ic(i)}<span>{t}</span></a>'
        for h, t, i in PAGES)
    foot = ''.join(f'<a href="{h}">{t}</a>' for h, t, _ in PAGES) + '<a href="transparency.html">الشفافية</a><a href="support.html#zakat">حاسبة الزكاة</a>'
    toc_foot = ''.join(f'<a href="{sec_link(n)}">{n}. {t}</a>' for n, t in toc_items()[:7])
    toc_foot2 = ''.join(f'<a href="{sec_link(n)}">{n}. {t}</a>' for n, t in toc_items()[7:])

    def tab(h, label, icon):
        a = ' class="active" aria-current="page"' if h == fn else ''
        return f'<a href="{h}"{a}>{ic(icon)}<span>{label}</span></a>'

    tabbar = (tab('index.html', 'الرئيسية', 'home') + tab('initiatives.html', 'المبادرات', 'sprout')
              + f'<button type="button" class="tab-ai" data-open-chat aria-label="المساعد الذكي">{ic("sparkles")}<span>المساعد</span></button>'
              + tab('join.html', 'العضوية', 'users')
              + f'<button type="button" data-open-sheet aria-label="القائمة الكاملة">{ic("grid")}<span>المزيد</span></button>')
    globe_js = ('<script src="data/world.js" defer></script>\n<script src="js/globe.js" defer></script>\n' if globe else '')
    extra_css = ''.join(f'<link rel="stylesheet" href="{h}">\n' for h in css)
    extra_js = ''.join(f'<script src="{h}" defer></script>\n' for h in js)

    html = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{'<base href="/">' if fn == '404.html' else ''}<title>{title} | جمعية تكامل لبناء القيم والتنمية</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="{title} | جمعية تكامل لبناء القيم والتنمية">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="assets/logo.png">
<link rel="icon" href="assets/logo.png">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="تكامل">
{alternates(fn)}
<script>(function(){{var t;try{{t=localStorage.getItem('takamul-theme-v2')}}catch(e){{}}if(t!=='light'&&t!=='dark'){{t='light'}}var d=document.documentElement;d.dataset.theme=t;d.classList.add('js');setTimeout(function(){{if(!window.__takamulReady)d.classList.remove('js')}},2500)}})();</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/pages.css">
<link rel="stylesheet" href="css/chat-plus.css">
<link rel="stylesheet" href="css/palette.css">
<link rel="stylesheet" href="css/globe.css">
{extra_css}<link rel="stylesheet" href="css/book.css">
<script src="data/kb.js" defer></script>
<script src="js/main.js" defer></script>
<script src="js/chat.js" defer></script>
<script src="js/palette.js" defer></script>
<script src="js/cursor.js" defer></script>
<script src="js/pwa.js" defer></script>
<script src="js/share.js" defer></script>
{globe_js}{extra_js}</head>
<body data-page="{fn}">
<div class="progress" aria-hidden="true"></div>
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>

<header class="nav">
  <div class="nav-bar">
    <a class="brand" href="index.html" aria-label="جمعية تكامل – الرئيسية">
      <img src="assets/logo.png" alt="" width="44" height="44">
      <span><b>تكامل</b><small>لبناء القيم والتنمية</small></span>
    </a>
    <nav class="mega" aria-label="القائمة الرئيسية">{mega}</nav>
    <nav class="links" aria-label="الصفحات">
      <span class="pill pill-hover" aria-hidden="true"></span><span class="pill pill-active" aria-hidden="true"></span>
      {links}
    </nav>
    <div class="actions">
      {lang_switch(fn)}
      <a class="btn-donate" href="support.html#donate">{ic('heart')}<span>تبرع الآن</span></a>
      <button type="button" class="search-btn" data-open-palette aria-label="ابحث في الموقع (Ctrl+K)" aria-keyshortcuts="Control+K Meta+K">{ic('search')}<span class="search-label">ابحث في الكتيب</span><kbd class="kbd-hint">⌘K</kbd></button>
      <button type="button" class="icon-btn theme-toggle" aria-label="تبديل الوضع الليلي والنهاري" title="الوضع الليلي / النهاري">{ic('sun', 'i sun')}{ic('moon', 'i moon')}</button>
      <button type="button" class="btn-ai" data-open-chat>{ic('sparkles')}<span>اسأل المساعد</span></button>
      <button type="button" class="icon-btn menu-btn" data-open-sheet aria-label="القائمة">{ic('menu')}</button>
    </div>
  </div>
</header>

<main id="main">
{body}
</main>

<footer class="footer">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <img src="assets/logo.png" alt="شعار جمعية تكامل" width="72" height="72">
        <p>{L(42)}</p>
      </div>
      <div><h4>الصفحات</h4>{foot}</div>
      <div><h4>{L(12)}</h4>{toc_foot}</div>
      <div><h4>&nbsp;</h4>{toc_foot2}</div>
    </div>
    <div class="foot-bottom"><span>{header_line()}</span><span>{L(501)}</span></div>
    <button type="button" class="foot-install" data-install hidden>{ic('download')}<span>ثبّت التطبيق</span></button>
    {image_credits()}
  </div>
</footer>

<nav class="tabbar" aria-label="التنقل السريع">{tabbar}</nav>

<div class="sheet" hidden>
  <div class="sheet-backdrop" data-close-sheet></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="القائمة">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head"><b>القائمة</b><button type="button" class="icon-btn" data-close-sheet aria-label="إغلاق">{ic('x')}</button></div>
    {lang_switch(fn, 'lang-switch sheet-lang')}
    <div class="sheet-grid">{sheet}</div>
    <button type="button" class="sheet-search" data-open-palette>{ic('search')}<span>ابحث في الكتيب…</span><kbd class="kbd-hint">⌘K</kbd></button>
    <div class="sheet-row">
      <button type="button" class="sheet-wide theme-toggle">{ic('sun', 'i sun')}{ic('moon', 'i moon')}<span class="label-light">الوضع الليلي</span><span class="label-dark">الوضع النهاري</span></button>
      <button type="button" class="sheet-wide ai" data-open-chat>{ic('sparkles')}<span>اسأل المساعد</span></button>
    </div>
    <button type="button" class="sheet-install" data-install hidden>{ic('download')}<span>ثبّت تطبيق «تكامل» على جوالك</span></button>
  </div>
</div>

<button type="button" class="chat-fab" data-open-chat aria-label="افتح المساعد الذكي">{ic('sparkles')}<span>اسأل تكامل</span></button>
<div class="chat" hidden>
  <div class="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title">
    <div class="chat-head">
      <img src="assets/logo.png" alt="" width="40" height="40">
      <div><b id="chat-title">مساعد تكامل الذكي</b><small><span class="dot"></span>مدعوم بـ Gemini</small></div>
      <button type="button" class="icon-btn chat-clear" aria-label="محادثة جديدة" title="محادثة جديدة">{ic('trash')}</button>
      <button type="button" class="icon-btn chat-close" aria-label="إغلاق المساعد">{ic('x')}</button>
    </div>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-suggest"></div>
    <form class="chat-form">
      <textarea rows="1" maxlength="1500" placeholder="اكتب سؤالك عن الجمعية…" aria-label="رسالتك"></textarea>
      <button type="submit" class="chat-send" aria-label="إرسال">{ic('send')}</button>
    </form>
    <p class="chat-note">قد يخطئ المساعد أحياناً؛ يُرجى التحقق من المعلومات المهمة.</p>
  </div>
</div>

<button type="button" class="totop" aria-label="العودة للأعلى">{ic('arrow-up')}</button>
</body>
</html>
'''
    (OUT / fn).write_text(html, encoding='utf-8')
