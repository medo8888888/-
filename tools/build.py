#!/usr/bin/env python3
"""Generate the Takamul website (site/*.html) and the chat knowledge file
(worker/knowledge.js) from content/brochure.txt.

Every visible text comes verbatim from the brochure via L(n), where n is the
1-based line number in content/brochure.txt. Run: python3 tools/build.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
D = (ROOT / 'content' / 'brochure.txt').read_text(encoding='utf-8').split('\n')

HEADER_LINE = 'جمعية تكامل لبناء القيم والتنمية   |   الكتيب التعريفي للأعضاء الجدد'  # Word page header


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
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'menu': '<line x1="4" x2="20" y1="7" y2="7"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="17" y2="17"/>',
    'user': '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'pinmark': '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'chart': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    'book': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
}


def ic(name, cls='i'):
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
]
PAGE_LABEL = {f: t for f, t, _ in PAGES}

# section number -> (number line, title line, subtitle line, page, colour token)
SECTIONS = {
    1: (39, 40, 41, 'about.html', 'teal'),
    2: (49, 50, 51, 'about.html', 'navy'),
    3: (72, 73, 74, 'initiatives.html', 'leaf'),
    4: (97, 98, 99, 'about.html', 'purple'),
    5: (126, 127, 128, 'expansion.html', 'orange'),
    6: (157, 158, 159, 'initiatives.html', 'maroon'),
    7: (168, 169, 170, 'governance.html', 'navy'),
    8: (204, 205, 206, 'governance.html', 'gold'),
    9: (227, 228, 229, 'join.html', 'leaf'),
    10: (240, 241, 242, 'initiatives.html', 'teal'),
    11: (249, 250, 251, 'join.html', 'maroon'),
    12: (301, 302, 303, 'join.html', 'orange'),
    13: (376, 377, 378, 'faq.html', 'purple'),
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


def subhead(text, sub=''):
    s = f'<p class="subhead-sub">{sub}</p>' if sub else ''
    return f'<div class="subhead rv"><h3>{text}</h3>{s}</div>'


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


def page_hero(fn, nums, visual=False):
    chips = ''.join(
        f'<a class="chip-link" href="#s{n}" style="--sc:var(--c-{SECTIONS[n][4]})"><b>{L(SECTIONS[n][0])}</b>{L(SECTIONS[n][1])}</a>'
        for n in nums)
    vis = ('<div class="hero-visual small" aria-hidden="true"><canvas class="globe" data-globe></canvas></div>'
           if visual else '')
    return f'''
<section class="hero hero-small{' has-visual' if visual else ''}">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow rv">{ic('book')} {L(1)}</span>
      <h1 class="rv">{PAGE_LABEL[fn]}</h1>
      <nav class="chips rv" aria-label="أقسام الصفحة">{chips}</nav>
    </div>
    {vis}
  </div>
</section>'''


def cta():
    return f'''
<section class="cta">
  <div class="cta-glow" aria-hidden="true"></div>
  <div class="wrap rv">
    <img src="assets/logo.png" alt="" width="84" height="84" class="cta-logo">
    <h2>{L(499)}</h2>
    <p>{L(500)}</p>
    <div class="btns center">
      <a class="btn btn-gold" href="join.html">{ic('users')}العضوية</a>
      <button class="btn btn-ghost" type="button" data-open-chat>{ic('sparkles')}اسأل المساعد الذكي</button>
    </div>
  </div>
</section>'''


# --------------------------------------------------------------- shell ---
def page(fn, title, body, desc, globe=False):
    links = ''.join(
        f'<a href="{h}"{" class=active aria-current=page" if h == fn else ""}>{t}</a>' for h, t, _ in PAGES)
    sheet = ''.join(
        f'<a class="sheet-item{" active" if h == fn else ""}" href="{h}">{ic(i)}<span>{t}</span></a>'
        for h, t, i in PAGES)
    foot = ''.join(f'<a href="{h}">{t}</a>' for h, t, _ in PAGES)
    toc_foot = ''.join(f'<a href="{sec_link(n)}">{n}. {t}</a>' for n, t in toc_items()[:7])
    toc_foot2 = ''.join(f'<a href="{sec_link(n)}">{n}. {t}</a>' for n, t in toc_items()[7:])

    def tab(h, label, icon):
        a = ' class="active" aria-current="page"' if h == fn else ''
        return f'<a href="{h}"{a}>{ic(icon)}<span>{label}</span></a>'

    tabbar = (tab('index.html', 'الرئيسية', 'home') + tab('initiatives.html', 'المبادرات', 'sprout')
              + f'<button type="button" class="tab-ai" data-open-chat aria-label="المساعد الذكي">{ic("sparkles")}<span>المساعد</span></button>'
              + tab('join.html', 'العضوية', 'users')
              + f'<button type="button" data-open-sheet aria-label="القائمة الكاملة">{ic("grid")}<span>المزيد</span></button>')
    globe_js = '<script type="module" src="js/globe.js"></script>\n' if globe else ''

    html = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{'<base href="/">' if fn == '404.html' else ''}<title>{title} | جمعية تكامل لبناء القيم والتنمية</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#f7f4ec">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="{title} | جمعية تكامل لبناء القيم والتنمية">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="assets/logo.png">
<link rel="icon" href="assets/logo.png">
<link rel="apple-touch-icon" href="assets/logo.png">
<script>(function(){{var t;try{{t=localStorage.getItem('takamul-theme')}}catch(e){{}}if(t!=='light'&&t!=='dark'){{t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}}var d=document.documentElement;d.dataset.theme=t;d.classList.add('js');setTimeout(function(){{if(!window.__takamulReady)d.classList.remove('js')}},2500)}})();</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
<script src="js/main.js" defer></script>
<script src="js/chat.js" defer></script>
{globe_js}</head>
<body data-page="{fn}">
<div class="progress" aria-hidden="true"></div>
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>

<header class="nav">
  <div class="nav-bar">
    <a class="brand" href="index.html" aria-label="جمعية تكامل – الرئيسية">
      <img src="assets/logo.png" alt="" width="44" height="44">
      <span><b>تكامل</b><small>لبناء القيم والتنمية</small></span>
    </a>
    <nav class="links" aria-label="القائمة الرئيسية">
      <span class="pill pill-hover" aria-hidden="true"></span><span class="pill pill-active" aria-hidden="true"></span>
      {links}
    </nav>
    <div class="actions">
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
    <div class="foot-bottom"><span>{HEADER_LINE}</span><span>{L(501)}</span></div>
  </div>
</footer>

<nav class="tabbar" aria-label="التنقل السريع">{tabbar}</nav>

<div class="sheet" hidden>
  <div class="sheet-backdrop" data-close-sheet></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="القائمة">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head"><b>القائمة</b><button type="button" class="icon-btn" data-close-sheet aria-label="إغلاق">{ic('x')}</button></div>
    <div class="sheet-grid">{sheet}</div>
    <div class="sheet-row">
      <button type="button" class="sheet-wide theme-toggle">{ic('sun', 'i sun')}{ic('moon', 'i moon')}<span class="label-light">الوضع الليلي</span><span class="label-dark">الوضع النهاري</span></button>
      <button type="button" class="sheet-wide ai" data-open-chat>{ic('sparkles')}<span>اسأل المساعد</span></button>
    </div>
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
    (SITE / fn).write_text(html, encoding='utf-8')


# ================================================================ HOME ===
def build_home():
    toc = ''.join(
        f'<a class="toc-item tilt rv" href="{sec_link(n)}" style="--sc:var(--c-{SECTIONS[n][4]})">'
        f'<span class="toc-num">{n}</span><span class="toc-ic">{ic(SEC_ICON[n])}</span>'
        f'<span class="toc-title">{t}</span><span class="toc-go">{ic("arrow-left")}</span></a>'
        for n, t in toc_items())
    stages = ''.join(
        f'<li class="rv"><span>{L(130 + 4 * i)}</span><b>{L(131 + 4 * i)}</b></li>' for i in range(7))
    body = f'''
<section class="hero hero-home">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="greet rv"><span class="wave" aria-hidden="true">👋</span><span data-greet>أهلاً وسهلاً</span><span class="sep">·</span>{L(9)}</p>
      <span class="eyebrow rv">{ic('book')} {L(1)}</span>
      <h1 class="rv">جمعية <span class="grad">تكامل</span><br>لبناء القيم والتنمية</h1>
      <p class="sub rv">{L(3)} — {L(8)}</p>
      <div class="btns rv">
        <a class="btn btn-primary" href="#toc">{ic('book')}{L(12)}</a>
        <button class="btn btn-soft" type="button" data-open-chat>{ic('sparkles')}اسأل المساعد الذكي</button>
      </div>
      <dl class="hero-stats rv">
        <div><dt data-to="2035">2035</dt><dd>{L(2)}</dd></div>
        <div><dt>{L(4)}</dt><dd>{L(5)}</dd></div>
        <div><dt>{L(6)}</dt><dd>{L(7)}</dd></div>
      </dl>
    </div>
    <div class="hero-visual" aria-hidden="true">
      <canvas class="globe" data-globe data-arcs="1"></canvas>
      <span class="float-chip c1">{ic('pin')} إسطنبول</span>
      <span class="float-chip c2">{ic('droplet')} ينابيع</span>
      <span class="float-chip c3">{ic('coins')} منافع</span>
    </div>
  </div>
  <a class="scroll-cue" href="#welcome" aria-label="انتقل للأسفل"><span></span></a>
</section>

<section class="welcome" id="welcome">
  <div class="wrap welcome-grid">
    <div class="welcome-card tilt rv" aria-hidden="true"><img src="assets/logo.png" alt="" width="260" height="260"></div>
    <div>
      <span class="kicker rv">{L(2)}</span>
      <h2 class="rv">{L(9)}</h2>
      <p class="big rv">{L(10)}</p>
      <p class="rv muted">{L(11)}</p>
    </div>
  </div>
</section>

<section class="toc-sec alt" id="toc">
  <div class="wrap">
    <div class="center"><span class="kicker rv">{L(1)}</span><h2 class="rv">{L(12)}</h2></div>
    <div class="toc-grid">{toc}</div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="center"><span class="kicker rv">{L(73)}</span><h2 class="rv">{L(74)}</h2><p class="lead rv center-text">{L(75)}</p></div>
    <div class="grid g2">
      <a class="init-card tilt rv yanabee" href="{sec_link(3)}">
        <span class="ic big">{ic('droplet')}</span><h3>{L(76)}</h3><p>{L(77)}</p><span class="more">{ic('arrow-left')}</span></a>
      <a class="init-card tilt rv manafea" href="{sec_link(3)}">
        <span class="ic big">{ic('coins')}</span><h3>{L(82)}</h3><p>{L(83)}</p><span class="more">{ic('arrow-left')}</span></a>
    </div>
  </div>
</section>

<section class="sec alt">
  <div class="wrap">
    <div class="center"><span class="kicker rv">{L(127)}</span><h2 class="rv">{L(7)}</h2><p class="lead rv center-text">{L(128)}</p></div>
    <ol class="mini-steps">{stages}</ol>
    <div class="center rv"><a class="btn btn-primary" href="expansion.html">{ic('globe')}{L(127)}</a></div>
  </div>
</section>
{cta()}'''
    page('index.html', 'الرئيسية', body, L(10), globe=True)


# =============================================================== ABOUT ===
def build_about():
    s1 = section(1, f'''<div class="grid g3">
      {card(L(43), L(44), 'landmark')}{card(L(45), L(46), 'pin')}{card(L(47), L(48), 'globe')}
    </div>''', lead=L(42))
    goals = ''.join(numcard(L(57 + 3 * i), L(58 + 3 * i), L(59 + 3 * i)) for i in range(5))
    s2 = section(2, f'''<div class="grid g2">
      <article class="card tilt rv feature" style="--fc:var(--c-gold)"><div class="ic">{ic('eye')}</div><h3>{L(52)}</h3><p>{L(53)}</p></article>
      <article class="card tilt rv feature" style="--fc:var(--c-leaf)"><div class="ic">{ic('target')}</div><h3>{L(54)}</h3><p>{L(55)}</p></article>
    </div>
    {subhead(L(56))}
    <div class="grid g3">{goals}</div>''', alt=True)
    phil = ''.join(
        f'<article class="card tilt rv"><span class="tag" dir="ltr">{L(102 + 3 * i)}</span><h3>{L(101 + 3 * i)}</h3><p>{L(103 + 3 * i)}</p></article>'
        for i in range(4))
    rows = ''.join(
        f'<tr><td data-label="{L(114)}">{L(116 + 2 * i)}</td><td data-label="{L(115)}">{L(117 + 2 * i)}</td></tr>'
        for i in range(5))
    s4 = section(4, f'''{subhead(L(100))}
    <div class="grid g4">{phil}</div>
    {subhead(L(113))}
    <div class="table-wrap rv"><table class="rt"><thead><tr><th>{L(114)}</th><th>{L(115)}</th></tr></thead><tbody>{rows}</tbody></table></div>''')
    page('about.html', 'من نحن', page_hero('about.html', [1, 2, 4]) + s1 + s2 + s4 + cta(), L(42))


# ========================================================= INITIATIVES ===
def build_initiatives():
    s3 = section(3, f'''<div class="grid g2">
      <article class="init-card tilt rv yanabee" id="yanabee"><span class="ic big">{ic('droplet')}</span>
        <h3>{L(76)}</h3><p class="focus">{L(77)}</p>{ul(LS(78, 81))}</article>
      <article class="init-card tilt rv manafea" id="manafea"><span class="ic big">{ic('coins')}</span>
        <h3>{L(82)}</h3><p class="focus">{L(83)}</p>{ul(LS(84, 87), 'diamond')}</article>
    </div>
    {subhead(L(88))}
    <div class="grid g4">{card(L(89), L(90), 'refresh')}{card(L(91), L(92), 'wrench')}{card(L(93), L(94), 'flask')}{card(L(95), L(96), 'scale')}</div>''',
                 lead=L(75))
    tg = ''.join(card(L(160 + 2 * i), L(161 + 2 * i), icn) for i, icn in enumerate(['building', 'cap', 'heart', 'landmark']))
    s6 = section(6, f'<div class="grid g4">{tg}</div>', alt=True)
    s10 = section(10, f'''<div class="grid g3">{card(L(243), L(244), 'briefcase')}{card(L(245), L(246), 'link')}{card(L(247), L(248), 'tree')}</div>''')
    page('initiatives.html', 'المبادرات', page_hero('initiatives.html', [3, 6, 10]) + s3 + s6 + s10 + cta(), L(75))


# =========================================================== EXPANSION ===
def build_expansion():
    tl = ''.join(
        f'<li class="tl"><span class="tl-n">{L(130 + 4 * i)}</span><div class="card"><span class="tag">{L(129 + 4 * i)} {L(130 + 4 * i)}</span>'
        f'<h3>{L(131 + 4 * i)}</h3><p>{L(132 + 4 * i)}</p></div></li>' for i in range(7))
    s5 = section(5, f'<div class="timeline"><span class="tl-fill" aria-hidden="true"></span><ol class="tl-list">{tl}</ol></div>', lead=f'{L(6)} — {L(7)}')
    page('expansion.html', 'خطة التوسع', page_hero('expansion.html', [5], visual=True) + s5 + cta(), L(128), globe=True)


# ========================================================== GOVERNANCE ===
def build_governance():
    org = ''.join(
        f'<article class="org-card tilt rv"><div class="org-big">{L(a)}</div><div><h3>{L(a + 1)} <small dir="ltr">{L(a + 2)}</small></h3><p>{L(a + 3)}</p></div></article>'
        for a in (172, 176, 180))
    cycle = ''.join(
        f'<li class="rv"><span class="num">{L(189 + 4 * i)}</span><h3>{L(190 + 4 * i)}</h3><p>{L(191 + 4 * i)}</p></li>' for i in range(4))
    s7 = section(7, f'''{subhead(L(171))}
    <div class="org">{org}</div>
    {subhead(L(184))}
    <div class="card rv">{ul(LS(185, 187))}</div>
    {subhead(L(188))}
    <ol class="cycle">{cycle}</ol>''')
    fin = ''.join(
        f'<article class="card tilt rv income"><span class="num">{L(208 + 2 * i)}</span><p>{L(209 + 2 * i)}</p></article>' for i in range(7))
    s8 = section(8, f'''{subhead(L(207))}
    <div class="grid g4">{fin}</div>
    {subhead(L(222))}
    <div class="grid g2">{card(L(223), L(224), 'scale')}{card(L(225), L(226), 'tree')}</div>''', alt=True)
    page('governance.html', 'الحوكمة والتمويل', page_hero('governance.html', [7, 8]) + s7 + s8 + cta(), L(170))


# ================================================================ JOIN ===
def pcard(num, title, sub, text, extra=''):
    return (f'<article class="card tilt rv pillar"><div class="pillar-top"><span class="num">{num}</span>'
            f'<div><h3>{title}</h3><p class="pillar-sub">{sub}</p></div></div><p>{text}</p>{extra}</article>')


def pair(a, b):
    return f'<div class="pair"><b>{L(a)}</b><span>{L(b)}</span></div>'


def build_join():
    s9 = section(9, f'''<div class="grid g2">
      <article class="card tilt rv feature" style="--fc:var(--c-leaf)"><div class="ic">{ic('check')}</div><h3>{L(230)}</h3>{ul(LS(232, 235))}</article>
      <article class="card tilt rv feature" style="--fc:var(--c-gold)"><div class="ic">{ic('pinmark')}</div><h3>{L(231)}</h3>{ul(LS(236, 239), 'diamond')}</article>
    </div>''')
    chips = ''.join(f'<span class="flag">{L(i)}</span>' for i in range(318, 323))
    pillars = [
        pcard(L(306), L(307), L(308), L(309), ul(LS(310, 313))),
        pcard(L(314), L(315), L(316), L(317), f'<div class="flags">{chips}</div>'),
        pcard(L(323), L(324), L(325), L(326), ul(LS(327, 329))),
        pcard(L(330), L(331), L(332), L(333)),
        pcard(L(334), L(335), L(336), L(337), pair(338, 339) + pair(340, 341)),
        pcard(L(342), L(343), L(344), L(345), ul(LS(346, 347))),
        pcard(L(348), L(349), L(350), L(351), ul(LS(352, 353))),
        pcard(L(354), L(355), L(356), L(357), pair(358, 359) + pair(360, 361) + f'<p class="note">{L(362)}</p>'),
        pcard(L(363), L(364), L(365), L(366)),
        pcard(L(367), L(368), L(369), L(370), pair(371, 372) + pair(373, 374)),
    ]
    s12 = section(12, f'''<p class="rv strong">{L(305)}</p>
    <div class="grid g2 pillars">{''.join(pillars)}</div>
    <p class="closing rv">{L(375)}</p>''', alt=True, lead=L(304))
    heads = [L(i) for i in range(252, 258)]
    rows = ''.join(
        '<tr>' + ''.join(f'<td data-label="{heads[c]}">{L(258 + 6 * r + c)}</td>' for c in range(6)) + '</tr>'
        for r in range(7))
    s11 = section(11, f'''<div class="table-wrap rv"><table class="rt founders"><thead><tr>{''.join(f'<th>{h}</th>' for h in heads)}</tr></thead><tbody>{rows}</tbody></table></div>
    <p class="footnote rv">{L(300)}</p>''')
    page('join.html', 'العضوية', page_hero('join.html', [9, 12, 11]) + s9 + s12 + s11 + cta(), L(304))


# ================================================================= FAQ ===
def qa(qnum_line, start, end):
    """One Q&A accordion. qnum_line: 'س1'; question is the next line; the answer
    label ('الرد الإداري') is start-1; answer lines start..end."""
    out, i = '', start
    while i <= end:
        raw = D[i - 1].strip()
        t = L(i)
        if raw.startswith('●'):
            j = i
            while j <= end and D[j - 1].strip().startswith('●'):
                j += 1
            out += ul(LS(i, j - 1))
            i = j
        elif len(t) < 40 and i < end and not t.endswith(('.', '؟', ':')):
            out += pair(i, i + 1)
            i += 2
        else:
            out += f'<p>{t}</p>'
            i += 1
    return (f'<details class="qa rv"><summary><span class="q-num">{L(qnum_line)}</span>'
            f'<span class="q-text">{L(qnum_line + 1)}</span><span class="q-ic" aria-hidden="true"></span></summary>'
            f'<div class="qa-body"><span class="tag">{L(start - 1)}</span>{out}</div></details>')


F = [(381, 384, 385), (386, 389, 398), (399, 402, 407), (408, 411, 411), (412, 415, 419),
     (420, 423, 426), (427, 430, 434), (435, 438, 438), (439, 442, 445)]
B = [(448, 451, 451), (452, 455, 463), (464, 467, 467), (468, 471, 473), (474, 477, 477),
     (478, 481, 484), (485, 488, 491), (492, 495, 498)]


def build_faq():
    body = f'''
    <div class="faq-tools rv">
      <label class="search">{ic('search')}<input type="search" placeholder="ابحث في الأسئلة…" aria-label="ابحث في الأسئلة" data-faq-search></label>
      <button class="btn btn-soft" type="button" data-open-chat>{ic('sparkles')}لم تجد إجابتك؟ اسأل المساعد</button>
    </div>
    {subhead(L(379), L(380))}
    <div class="faq-list">{''.join(qa(a, s, e) for a, s, e in F)}</div>
    {subhead(L(446), L(447))}
    <div class="faq-list">{''.join(qa(a, s, e) for a, s, e in B)}</div>
    <p class="faq-empty" hidden>لا توجد نتائج مطابقة.</p>'''
    page('faq.html', 'دليل الإجابات', page_hero('faq.html', [13]) + section(13, body) + cta(), L(378))


def build_404():
    body = f'''
<section class="hero hero-small">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap center" style="padding-block:40px">
    <h1>الصفحة غير موجودة</h1>
    <p class="sub" style="margin-inline:auto">عذراً، لم نعثر على هذه الصفحة. يمكنك العودة إلى الرئيسية أو تصفح {L(12)}.</p>
    <div class="btns center"><a class="btn btn-primary" href="index.html">{ic('home')}الرئيسية</a><a class="btn btn-soft" href="index.html#toc">{ic('book')}{L(12)}</a></div>
  </div>
</section>'''
    page('404.html', 'الصفحة غير موجودة', body, L(42))


def build_knowledge():
    text = '\n'.join(D[:501])
    text = HEADER_LINE + '\n' + text
    (ROOT / 'worker').mkdir(exist_ok=True)
    (ROOT / 'worker' / 'knowledge.js').write_text(
        '// Generated by tools/build.py from content/brochure.txt — do not edit by hand.\n'
        f'export const KNOWLEDGE = {json.dumps(text, ensure_ascii=False)};\n', encoding='utf-8')


if __name__ == '__main__':
    build_home()
    build_about()
    build_initiatives()
    build_expansion()
    build_governance()
    build_join()
    build_faq()
    build_404()
    build_knowledge()
    print('built', sorted(p.name for p in SITE.glob('*.html')))
