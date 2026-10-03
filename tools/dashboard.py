"""Command-center page (dashboard.html). Owned by the dashboard work-stream.

An asymmetric bento grid of interactive tiles built only from brochure facts.
Every visible brochure text comes from L(n); numbers shown as big figures are
taken from the line cited next to them. UI chrome (button labels, units, hints)
is plain Arabic UI text. See docs/ARCHITECTURE.md.
"""
from core import *  # noqa: F401,F403


def _tablist(name, label, tabs, cls=''):
    """ARIA tabs: tabs = [(tab_html, panel_html)]. First tab active."""
    t, p = [], []
    for i, (tab, panel) in enumerate(tabs):
        on = i == 0
        t.append(f'<button type="button" role="tab" class="db-tab" id="{name}-t{i}" aria-controls="{name}-p{i}" '
                 f'aria-selected="{"true" if on else "false"}" tabindex="{0 if on else -1}">{tab}</button>')
        p.append(f'<div role="tabpanel" class="db-panel" id="{name}-p{i}" aria-labelledby="{name}-t{i}" tabindex="0"'
                 f'{"" if on else " hidden"}>{panel}</div>')
    return (f'<div class="db-tabs {cls}" data-db-tabs><div role="tablist" class="db-tablist" aria-label="{label}">'
            + ''.join(t) + '</div><div class="db-panels">' + ''.join(p) + '</div></div>')


def _tile(body, cls='', label=None, icon=None, kicker=''):
    head = ''
    if label:
        k = f'<span class="db-kicker">{kicker}</span>' if kicker else ''
        head = (f'<header class="db-tile-head">{ic(icon, "i db-ic") if icon else ""}'
                f'<div><h2 class="db-h">{label}</h2>{k}</div></header>')
    return f'<article class="db-tile rv {cls}">{head}{body}</article>'


def build_dashboard():
    # ------------------------------------------------------------ hero ---
    kpis = [
        (13, L(12), 'index.html#toc', 'book'),
        (10, 'ركائز إستراتيجية', 'join.html#s12', 'sparkles'),
        (17, 'سؤالاً وجواباً', 'faq.html#s13', 'help'),
        (7, 'مراحل التوسع', 'expansion.html#s5', 'globe'),
    ]
    kpi_html = ''.join(
        f'<a class="db-kpi" href="{h}">{ic(i, "i db-kpi-ic")}<b data-to="{n}">{n}</b><span>{t}</span></a>'
        for n, t, h, i in kpis)

    hero = f'''
<section class="db-hero" aria-labelledby="db-title">
  <div class="db-mesh" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap">
    <span class="eyebrow rv">{ic('chart')} {L(1)}</span>
    <h1 class="db-title rv" id="db-title">لوحة القيادة</h1>
    <p class="db-sub rv"><b>{L(2)}</b><span aria-hidden="true"> · </span>{L(3)}</p>
    <nav class="db-kpis rv" aria-label="أرقام الكتيب">{kpi_html}</nav>
  </div>
</section>'''

    # ---------------------------------------------------------- vision ---
    units = [('d', 'يوماً'), ('h', 'ساعة'), ('m', 'دقيقة'), ('s', 'ثانية')]
    cd = ''.join(f'<div class="db-cd-cell"><b data-cd="{k}">--</b><span>{u}</span></div>' for k, u in units)
    vision = _tile(f'''
<div class="db-vision-top">
  <p class="db-mega" aria-hidden="true">2035</p>
  <div class="db-countdown" data-countdown="2035-01-01" role="timer" aria-live="off" aria-label="العد التنازلي حتى مطلع عام 2035">
    <span class="db-cd-label">{ic('target')} الوقت المتبقي حتى عام 2035</span>
    <div class="db-cd-grid">{cd}</div>
  </div>
</div>
<p class="db-quote">{L(53)}</p>
<p class="db-foot-note"><b>{L(54)}:</b> {L(55)}</p>''', 'db-vision db-span-7 db-glow-brand', L(2), 'eye', L(52))

    # ----------------------------------------------------- initiatives ---
    def initiative(t_line, f_line, a, b, emblem, tone):
        items = ''.join(f'<li>{x}</li>' for x in LS(a, b))
        return (f'<div class="db-init db-tone-{tone}"><h3 class="db-h3">{L(t_line)}</h3>'
                f'<p class="db-muted">{L(f_line)}</p><ul class="db-checks">{items}</ul></div>')

    inits = _tablist('db-ini', L(4), [
        (f'{ic("droplet")}<span>ينابيع</span>', initiative(76, 77, 78, 81, 'droplet', 'leaf')),
        (f'{ic("coins")}<span>منافع</span>', initiative(82, 83, 84, 87, 'coins', 'gold')),
    ], 'db-seg')
    initiatives = _tile(f'<p class="db-big"><b data-to="2">2</b> <span>{L(5)}</span></p>{inits}',
                        'db-span-5 db-glow-leaf', L(4), 'sprout', L(74))

    # ------------------------------------------------------- stages ------
    stages = [(130 + 4 * k, 131 + 4 * k, 132 + 4 * k) for k in range(7)]
    st_tabs = []
    for k, (n, place, desc) in enumerate(stages):
        tab = f'<span class="db-st-dot">{L(n)}</span><span class="db-st-name">{L(place)}</span>'
        panel = (f'<div class="db-st-detail"><span class="db-st-tag">{L(129)} {L(n)}</span>'
                 f'<h3 class="db-h3">{L(place)}</h3><p>{L(desc)}</p>'
                 f'<a class="db-link" href="expansion.html#st{k + 1}">التفاصيل في خطة التوسع {ic("arrow-left")}</a></div>')
        st_tabs.append((tab, panel))
    stepper = _tablist('db-st', L(127), st_tabs, 'db-stepper')
    expansion = _tile(f'''
<p class="db-big"><b data-to="7">7</b> <span>{L(7)}</span></p>
<div class="db-st-wrap" style="--st:0">
  <div class="db-st-track" aria-hidden="true"><i></i></div>
  {stepper}
  <div class="db-st-nav">
    <button type="button" class="db-btn" data-st="-1" aria-label="المرحلة السابقة">{ic('arrow-left', 'i flip')}<span>السابقة</span></button>
    <span class="db-st-count" aria-live="polite"><b data-st-now>1</b> / 7</span>
    <button type="button" class="db-btn" data-st="1" aria-label="المرحلة التالية"><span>التالية</span>{ic('arrow-left')}</button>
  </div>
</div>''', 'db-span-12 db-expansion db-glow-gold', L(127), 'globe', L(128))

    # ---------------------------------------------------------- goals ----
    goals = ''.join(
        f'<li class="db-goal" tabindex="0"><span class="db-goal-n">{L(57 + 3 * k)}</span>'
        f'<div><h3>{L(58 + 3 * k)}</h3><p>{L(59 + 3 * k)}</p></div></li>' for k in range(5))
    goals_t = _tile(f'<ol class="db-goals">{goals}</ol>', 'db-span-7', L(56), 'target', L(51))

    # ----------------------------------------------------- governance ----
    def seats(main, reserve):
        s = ''.join('<i class="on"></i>' for _ in range(main)) + ''.join('<i></i>' for _ in range(reserve))
        return f'<span class="db-seats" aria-hidden="true">{s}</span>'

    gov_nodes = [
        (f'<span class="db-node-k">{L(172)}</span><b>{L(173)}</b><small lang="tr" dir="ltr">{L(174)}</small>'
         f'<span class="db-seats db-seats-all" aria-hidden="true">{"<i class=on></i>" * 12}</span>',
         f'<p>{L(175)}</p><div class="db-facts"><span><b data-to="3">3</b> سنوات</span><span>أبريل</span></div>'),
        (f'<span class="db-node-k">{L(176)}</span><b>{L(177)}</b><small lang="tr" dir="ltr">{L(178)}</small>{seats(5, 5)}',
         f'<p>{L(179)}</p><div class="db-legend"><span><i class="on"></i>أساسي</span><span><i></i>احتياط</span></div>'),
        (f'<span class="db-node-k">{L(180)}</span><b>{L(181)}</b><small lang="tr" dir="ltr">{L(182)}</small>{seats(3, 3)}',
         f'<p>{L(183)}</p><div class="db-legend"><span><i class="on"></i>أساسي</span><span><i></i>احتياط</span></div>'),
    ]
    gov = _tablist('db-gov', L(171), gov_nodes, 'db-org')
    governance = _tile(f'<div class="db-org-lines" aria-hidden="true"></div>{gov}',
                       'db-span-5 db-glow-brand', L(169), 'shield', L(170))

    # ---------------------------------------------------- field cycle ----
    cyc = ''.join(
        f'<li class="db-cyc-step" tabindex="0" data-cyc="{k}"><span class="db-cyc-n">{L(189 + 4 * k)}</span>'
        f'<h3>{L(190 + 4 * k)}</h3><p>{L(191 + 4 * k)}</p></li>' for k in range(4))
    cycle = _tile(f'<ol class="db-cycle" data-cycle>{cyc}<li class="db-cyc-core" aria-hidden="true">{ic("refresh")}</li></ol>',
                  'db-span-5 db-glow-leaf', L(188), 'refresh')

    # -------------------------------------------------------- income -----
    src = [(208 + 2 * k, 209 + 2 * k) for k in range(7)]
    inc_list = ''.join(
        f'<li><button type="button" class="db-inc-item" data-inc="{k}" aria-pressed="{"true" if k == 0 else "false"}">'
        f'<span class="db-inc-n">{L(n)}</span><span>{L(t)}</span></button></li>' for k, (n, t) in enumerate(src))
    income = _tile(f'''
<div class="db-inc">
  <div class="db-orbit" aria-hidden="true">
    <svg viewBox="0 0 200 200" class="db-ring"></svg>
    <div class="db-orbit-core"><b data-inc-num>{L(208)}</b><span data-inc-text>{L(209)}</span></div>
  </div>
  <ol class="db-inc-list">{inc_list}</ol>
</div>
<p class="db-note">{ic('info')} الأجزاء متساوية عمداً: الكتيب يعدّد المصادر السبعة ولا يحدد نسباً لها.</p>''',
                   'db-span-7 db-glow-gold', L(207), 'coins', L(206))

    # -------------------------------------------------- sustainability ---
    sustain = _tile(f'''
<div class="db-stats">
  <div class="db-stat">
    <span class="db-stat-k">{L(397)}</span>
    <p class="db-stat-v"><b dir="ltr"><small>≥</small><span data-to="50">50</span><small>%</small></b></p>
    <div class="db-meter" role="img" aria-label="الحد الأدنى المستهدف: 50% من الميزانية التشغيلية"><i style="--v:50%"></i><span class="db-meter-mark"></span></div>
    <p class="db-muted">{L(398)}</p>
  </div>
  <div class="db-stat">
    <span class="db-stat-k">نقطة التعادل</span>
    <p class="db-stat-v"><b dir="ltr">24–36</b><small>شهراً</small></p>
    <details class="db-more"><summary>النص الكامل</summary><p>{L(438)}</p></details>
  </div>
  <div class="db-stat">
    <span class="db-stat-k">الاحتياطي النقدي</span>
    <p class="db-stat-v"><b dir="ltr"><small>≥</small><span data-to="6">6</span></b><small>أشهر</small></p>
    <p class="db-muted">{L(444)}</p>
  </div>
</div>''', 'db-span-12 db-sustain db-glow-leaf', L(225), 'tree', L(390))

    # --------------------------------------------------- leadership ------
    def years(n, cls):
        return '<span class="db-years ' + cls + '" aria-hidden="true">' + '<i></i>' * n + '</span>'
    lead = _tile(f'''
<p class="db-muted">{L(357)}</p>
<div class="db-term"><div class="db-term-h"><b>{L(358)}</b><span><b data-to="4">4</b> سنوات</span></div>{years(4, 'brand')}<p>{L(359)}</p></div>
<div class="db-term"><div class="db-term-h"><b>{L(360)}</b><span><b data-to="3">3</b> سنوات</span></div>{years(3, 'gold')}<p>{L(361)}</p></div>''',
                 'db-span-4', L(355), 'refresh', L(356))

    # ----------------------------------------------------- founders ------
    people = ''.join(f'<span class="db-person">{ic("user")}</span>' for _ in range(5))
    founders = _tile(f'''
<p class="db-big"><b data-to="5">5</b> <span>تفرّغ كامل</span></p>
<div class="db-people" aria-hidden="true">{people}</div>
<p class="db-muted">{L(366)}</p>
<div class="db-callout"><span class="db-callout-n"><b data-to="2">2</b><small>عامان</small></span><div><b>{L(371)}</b><p>{L(372)}</p></div></div>''',
                     'db-span-4 db-glow-brand', L(364), 'users', L(365))

    # ------------------------------------------------ nationalities ------
    flags = ''.join(f'<li>{ic("pin")}<span>{c}</span></li>' for c in LS(318, 322))
    nations = _tile(f'<p class="db-muted">{L(317)}</p><ul class="db-nations">{flags}</ul>',
                    'db-span-4 db-glow-gold', L(315), 'globe', L(316))

    # ---------------------------------------------------- philosophy -----
    phil = ''.join(
        f'<li class="db-phil" tabindex="0"><span class="db-phil-en" lang="en" dir="ltr">{L(102 + 3 * k)}</span>'
        f'<h3>{L(101 + 3 * k)}</h3><p>{L(103 + 3 * k)}</p></li>' for k in range(4))
    philosophy = _tile(f'<ul class="db-phils">{phil}</ul>', 'db-span-6', L(100), 'scale', L(99))

    # --------------------------------------------------- departments -----
    deps = ''.join(
        f'<li class="db-dep" tabindex="0"><span class="db-dep-n">{k + 1}</span>'
        f'<div><h3>{L(116 + 2 * k)}</h3><p>{L(117 + 2 * k)}</p></div></li>' for k in range(5))
    departments = _tile(f'<div class="db-dep-head" aria-hidden="true"><span>{L(114)}</span><span>{L(115)}</span></div>'
                        f'<ol class="db-deps">{deps}</ol>', 'db-span-6', L(113), 'building')

    # ------------------------------------------------- target groups -----
    gicons = ['link', 'briefcase', 'heart', 'landmark']
    groups = ''.join(
        f'<li class="db-grp" tabindex="0">{ic(gicons[k], "i db-grp-ic")}<h3>{L(160 + 2 * k)}</h3><p>{L(161 + 2 * k)}</p></li>'
        for k in range(4))
    targets = _tile(f'<ul class="db-grps">{groups}</ul>', 'db-span-6 db-glow-brand', L(158), 'users', L(159))

    # ---------------------------------------------- balanced scorecard ---
    bsc_icons = ['coins', 'users', 'wrench', 'sprout']
    bsc = _tablist('db-bsc', 'محاور بطاقة الأداء المتوازن', [
        (f'{ic(bsc_icons[k])}<span>{L(456 + 2 * k)}</span>',
         f'<div class="db-bsc-panel"><span class="db-bsc-n">{k + 1}<small>/4</small></span>'
         f'<div><h3 class="db-h3">{L(456 + 2 * k)}</h3><p>{L(457 + 2 * k)}</p></div></div>')
        for k in range(4)], 'db-seg db-bsc')
    scorecard = _tile(f'<p class="db-muted">{L(455)}</p>{bsc}', 'db-span-6 db-glow-gold', L(453), 'chart', L(447))

    grid = ''.join([vision, initiatives, expansion, goals_t, governance, cycle, income, sustain,
                    lead, founders, nations, philosophy, departments, targets, scorecard])

    body = f'''{hero}
<section class="db-board" aria-label="لوحة القيادة">
  <div class="wrap"><div class="db-grid">{grid}</div></div>
</section>
{cta()}'''
    page('dashboard.html', 'لوحة القيادة', body, L(53), css=('css/dashboard.css',), js=('js/dashboard.js',))
