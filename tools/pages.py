"""Page compositions for the Takamul site (home + inner pages + 404).
Uses the components and shell from core.py. See docs/ARCHITECTURE.md."""
from core import *  # noqa: F401,F403  (L, LS, ic, page, section, card, ...)
import core
from core import D, SECTIONS, SEC_ICON, PAGE_LABEL, photo_layer, photo_strip, gallery


# ================================================================ HOME ===
def hero_name():
    if core.LANG == 'ar':
        return 'جمعية <span class="grad">تكامل</span> لبناء القيم والتنمية'
    return L(501).split('  |  ')[0].strip().replace('Takamul', '<span class="grad">Takamul</span>', 1)


def _after_dash(n):
    """'3.1  مبادرة «ينابيع» – البناء ...' → ('مبادرة «ينابيع»', 'البناء ...') (verbatim pieces)."""
    t = L(n).split('  ', 1)[-1]
    a, _, b = t.partition(' – ')
    return a.strip(), b.strip()


def program_cards(share=False, link='support.html#donate'):
    out = ''
    for n, kind, icon in PROGRAMS:
        tag = _after_dash(76 if kind == 'yanabee' else 82)[0]
        sh = (f'<button type="button" class="icon-btn share-btn" data-share data-share-title="{L(n)}" data-share-url="support.html#programs" '
              f'aria-label="مشاركة البرنامج">{ic("share")}</button>') if share else ''
        act = (f'<button type="button" class="btn btn-soft prog-btn" data-program="{L(n)}">{ic("heart")}ادعم هذا البرنامج</button>' if share
               else f'<a class="btn btn-soft prog-btn" href="{link}">{ic("heart")}ادعم هذا البرنامج</a>')
        out += (f'<article class="pcard rv {kind}" data-kind="{kind}"><div class="pcard-img" style="--img:url(../assets/img/{PHOTO_OF[n]}.jpg)">'
                f'<span class="pcard-tag">{tag}</span></div><div class="pcard-body"><span class="pcard-ic">{ic(icon)}</span>'
                f'<p>{L(n)}</p><div class="prog-actions">{act}{sh}</div></div></article>')
    return out


PILLAR_L = [306, 314, 323, 330, 334, 342, 348, 354, 363, 367]
PILLAR_IC = ['shield', 'globe', 'link', 'target', 'heart', 'sparkles', 'sprout', 'refresh', 'briefcase', 'coins']


def pillar_flips():
    out = ''
    for i, a in enumerate(PILLAR_L):
        out += (f'<div class="flip rv" role="button" tabindex="0" aria-pressed="false" style="--fc:var(--c-{SECTIONS[(i % 13) + 1][4]})">'
                f'<div class="flip-in"><div class="flip-front"><b class="fnum">{L(a)}</b><span class="fic">{ic(PILLAR_IC[i])}</span>'
                f'<h3>{L(a + 1)}</h3><small>{L(a + 2)}</small><span class="fhint">{ic("refresh")}اضغط للتفاصيل</span></div>'
                f'<div class="flip-back"><h3>{L(a + 1)}</h3><p>{L(a + 3)}</p></div></div></div>')
    return out


def role_quiz():
    ini = {'yanabee': _after_dash(76), 'manafea': _after_dash(82), 'coord': (L(88).split('  ', 1)[-1], L(90))}
    prog = {'yanabee': L(78), 'manafea': L(84), 'coord': 'حيث الحاجة أكبر'}
    dept = {'yanabee': (116, 117), 'manafea': (120, 121), 'coord': (118, 119)}
    q2 = ''.join(f'<button type="button" class="q-opt" data-a="{k}">{ic(i)}<b>{ini[k][0]}</b><small>{ini[k][1]}</small></button>'
                 for k, i in (('yanabee', 'droplet'), ('manafea', 'coins'), ('coord', 'link')))
    res = ''
    for k in ini:
        d1, d2 = dept[k]
        res += (f'<template data-r="money-{k}"><span class="r-ic">{ic("heart")}</span><span class="kicker">نقترح عليك</span><h3>التبرع لدعم {ini[k][0]}</h3>'
                f'<p>{ini[k][1]}</p><a class="btn btn-gold btn-lg" href="support.html?program={prog[k]}#donate">{ic("heart")}تبرع الآن</a></template>'
                f'<template data-r="time-{k}"><span class="r-ic">{ic("users")}</span><span class="kicker">نقترح عليك</span><h3>التطوع في {L(d1)}</h3>'
                f'<p>{L(d2)}</p><a class="btn btn-gold btn-lg" href="support.html#volunteer">{ic("users")}تطوّع معنا</a></template>'
                f'<template data-r="member-{k}"><span class="r-ic">{ic("check")}</span><span class="kicker">نقترح عليك</span><h3>العضوية في «تكامل»</h3>'
                f'<p>{L(234) if k != "coord" else L(233)}</p><a class="btn btn-gold btn-lg" href="join.html#apply">{ic("check")}طلب العضوية</a></template>')
    return f'''
<div class="quiz rv" data-quiz>
  <div class="quiz-side">
    <span class="kicker">اختبار قصير</span>
    <h2>اكتشف دورك في «تكامل»</h2>
    <p>أجب عن سؤالين لنقترح عليك أنسب طريقة للمشاركة.</p>
    <ol class="q-progress"><li class="is-on">1</li><li>2</li><li>{ic('check')}</li></ol>
  </div>
  <div class="quiz-main">
    <div class="q-step is-on" data-step="1"><h3>كيف تحب أن تساهم؟</h3><div class="q-opts">
      <button type="button" class="q-opt" data-a="money">{ic('heart')}<b>بالمال</b><small>التبرع لبرامج الجمعية</small></button>
      <button type="button" class="q-opt" data-a="time">{ic('users')}<b>بالوقت والخبرة</b><small>التطوع في أحد الأقسام التنفيذية</small></button>
      <button type="button" class="q-opt" data-a="member">{ic('check')}<b>أن أكون عضواً</b><small>المشاركة في القرار والتصويت</small></button>
    </div></div>
    <div class="q-step" data-step="2"><h3>أي مجال يلامس قلبك أكثر؟</h3><div class="q-opts">{q2}</div></div>
    <div class="q-step q-result" data-step="3" aria-live="polite"><div class="q-out"></div>
      <button type="button" class="btn btn-soft q-restart">{ic('refresh')}ابدأ من جديد</button></div>
    {res}
  </div>
</div>'''


def splitter():
    y, m = _after_dash(76)[0], _after_dash(82)[0]
    return f'''
<div class="splitter rv" data-splitter data-a="{y}" data-b="{m}">
  <div class="sp-copy">
    <span class="kicker">تبرّع بطريقتك</span>
    <h2>وزّع تبرعك بين المبادرتين</h2>
    <p>حرّك المؤشرين لتختار المبلغ وطريقة توزيعه، ثم أضفه إلى سلة التبرعات.</p>
    <label class="sp-row"><span>المبلغ <output data-out="amount"></output></span>
      <input type="range" min="50" max="5000" step="50" value="500" data-in="amount" aria-label="المبلغ"></label>
    <label class="sp-row"><span class="sp-ends"><b class="a">{y}</b><b class="b">{m}</b></span>
      <input type="range" min="0" max="100" step="5" value="50" data-in="split" aria-label="التوزيع"></label>
    <div class="sp-cur" role="radiogroup" aria-label="العملة">
      <label><input type="radio" name="sp_cur" value="TRY" checked><span>TRY</span></label>
      <label><input type="radio" name="sp_cur" value="USD"><span>USD</span></label>
      <label><input type="radio" name="sp_cur" value="EUR"><span>EUR</span></label>
    </div>
    <a class="btn btn-gold btn-lg" href="support.html#donate" data-sp-go>{ic('cart')}أضف التوزيع إلى السلة</a>
  </div>
  <div class="sp-viz" aria-hidden="true">
    <svg viewBox="0 0 200 200" class="donut"><circle cx="100" cy="100" r="80" class="d-bg"/><circle cx="100" cy="100" r="80" class="d-a" pathLength="100"/><circle cx="100" cy="100" r="80" class="d-b" pathLength="100"/></svg>
    <div class="d-center"><b data-out="total"></b><small data-out="cur"></small></div>
    <ul class="d-legend"><li class="a"><i></i><span>{y}</span><b data-out="a"></b></li><li class="b"><i></i><span>{m}</span><b data-out="b"></b></li></ul>
  </div>
</div>'''


def journey():
    steps = ''.join(f'<button type="button" role="tab" class="jr-step{" is-on" if i == 0 else ""}" data-i="{i}" aria-selected="{"true" if i == 0 else "false"}">'
                    f'<span class="st-n">{L(130 + 4 * i)}</span><b>{L(131 + 4 * i)}</b></button>' for i in range(7))
    panels = ''.join(f'<div class="jr-panel{" is-on" if i == 0 else ""}" role="tabpanel" data-i="{i}"><span class="jr-big">{L(130 + 4 * i)}</span>'
                     f'<div><span class="kicker">{L(129)} {L(130 + 4 * i)}</span><h3>{L(131 + 4 * i)}</h3><p>{L(132 + 4 * i)}</p></div></div>' for i in range(7))
    return (f'<div class="jr" data-journey><div class="jr-track" role="tablist">{steps}</div>'
            f'<div class="jr-bar"><span class="jr-fill"></span></div><div class="jr-panels">{panels}</div></div>')


TREE = [  # (branch path, leaf x, leaf y, angle, colour)
    ('M300 420 C260 400 220 380 172 332', 160, 320, -40, 'teal'),
    ('M300 400 C340 380 390 360 438 312', 450, 300, 40, 'amber'),
    ('M300 340 C262 318 224 288 202 232', 196, 214, -60, 'green'),
    ('M300 330 C344 305 380 272 400 218', 405, 200, 60, 'red'),
    ('M300 282 C286 242 270 202 252 152', 246, 134, -75, 'blue'),
    ('M300 272 C318 232 334 192 354 142', 360, 124, 75, 'purple'),
    ('M300 252 C300 202 300 150 300 96', 300, 76, 90, 'gold'),
]


def growth_tree():
    leaves = [(L(101), L(103)), (L(104), L(106)), (L(107), L(109)), (L(110), L(112)),
              (_after_dash(76)[0], L(77)), (_after_dash(82)[0], L(83)), (L(52), L(2))]
    branches = ''.join(f'<path class="br" d="{d}" style="--i:{i}"/>' for i, (d, *_rest) in enumerate(TREE))
    nodes = ''.join(
        f'<g class="lf{" is-on" if i == 0 else ""}" tabindex="0" role="button" data-i="{i}" style="--i:{i};--lc:var(--c-{c})" '
        f'transform="translate({x} {y})" aria-label="{t}"><circle r="34" class="lf-hit"/>'
        f'<ellipse rx="30" ry="16" transform="rotate({-a})" class="lf-shape"/><text y="5" class="lf-n">{i + 1}</text></g>'
        for i, ((_, x, y, a, c), (t, _d)) in enumerate(zip(TREE, leaves)))
    info = ''.join(f'<div class="ti{" is-on" if i == 0 else ""}" data-i="{i}"><span class="ti-n" style="--lc:var(--c-{TREE[i][4]})">{i + 1}</span>'
                   f'<h3>{t}</h3><p>{d}</p></div>' for i, (t, d) in enumerate(leaves))
    return f'''
<div class="tree-wrap" data-tree>
  <div class="tree-art">
    <svg viewBox="0 0 600 540" class="tree-svg" aria-hidden="false" role="group" aria-label="{L(100).split('  ', 1)[-1]}">
      <ellipse cx="300" cy="522" rx="170" ry="16" class="ground"/>
      <path class="trunk" d="M300 524 C300 462 294 420 300 360 C305 320 300 290 300 250"/>
      {branches}
      <g class="planted"></g>
      {nodes}
    </svg>
  </div>
  <div class="tree-info">
    <span class="kicker">{L(100).split('  ', 1)[-1]}</span>
    <h2>ازرع أثرك معنا</h2>
    <p class="muted">هذه الشجرة تنمو بقيمنا ومبادراتنا. اضغط على أي ورقة لتتعرّف عليها، ثم ازرع ورقتك.</p>
    <div class="ti-box">{info}</div>
    <div class="tree-actions">
      <button type="button" class="btn btn-gold" data-plant>{ic('sprout')}ازرع ورقة</button>
      <span class="planted-count" aria-live="polite"><b data-count>0</b> ورقة زرعتها أنت</span>
    </div>
  </div>
</div>'''


def kinetic():
    words = [L(101), L(104), L(107), L(110), L(52), L(54), L(4)]
    row = ''.join(f'<span>{w}</span><i>✦</i>' for w in words)
    return (f'<section class="kinetic" aria-hidden="true"><div class="kin-row" data-dir="1"><div class="kin-track">{row}{row}</div></div>'
            f'<div class="kin-row outline" data-dir="-1"><div class="kin-track">{row}{row}</div></div></section>')


def build_home():
    y_t, y_s = _after_dash(76)
    m_t, m_s = _after_dash(82)
    slides = [
        ('istanbul', L(1), hero_name(), f'{L(3)} — {L(8)}',
         f'<a class="btn btn-gold btn-lg" href="support.html#donate">{ic("heart")}تبرع الآن</a><a class="btn btn-glass btn-lg" href="join.html#apply">{ic("users")}انضم إلينا</a>'),
        ('reading', y_t, y_s, L(77),
         f'<a class="btn btn-gold btn-lg" href="support.html#programs">{ic("heart")}ادعم «ينابيع»</a><a class="btn btn-glass btn-lg" href="initiatives.html#s3-1">اكتشف المبادرة {ic("arrow-left")}</a>'),
        ('workshop', m_t, m_s, L(83),
         f'<a class="btn btn-gold btn-lg" href="support.html#programs">{ic("heart")}ادعم «منافع»</a><a class="btn btn-glass btn-lg" href="initiatives.html#s3-2">اكتشف المبادرة {ic("arrow-left")}</a>'),
        ('bosphorus', L(2), L(7), L(53),
         f'<a class="btn btn-gold btn-lg" href="expansion.html">{ic("globe")}{L(127)}</a><a class="btn btn-glass btn-lg" href="about.html#s2">{L(52)} {ic("arrow-left")}</a>'),
    ]
    slides_html = ''.join(
        f'<div class="slide{" is-on" if i == 0 else ""}" data-slide="{i}" aria-hidden="{"false" if i == 0 else "true"}">'
        f'<div class="slide-bg" style="--img:url(../assets/img/{img}.jpg)"></div>'
        f'<div class="wrap slide-copy"><span class="slide-kicker">{k}</span>'
        f'<{"h1" if i == 0 else "h2"} class="slide-title">{t}</{"h1" if i == 0 else "h2"}><p class="slide-text">{tx}</p>'
        f'<div class="slide-btns">{btns}</div></div></div>'
        for i, (img, k, t, tx, btns) in enumerate(slides))
    dots = ''.join(f'<button type="button" class="dot{" is-on" if i == 0 else ""}" data-go="{i}" aria-label="{i + 1}"></button>' for i in range(len(slides)))
    amounts = ''.join(f'<label class="qd-amt"><input type="radio" name="amount" value="{a}"{" checked" if a == 250 else ""}><span>{a}</span></label>'
                      for a in (100, 250, 500, 1000))
    progs = ''.join(f'<option>{L(n)}</option>' for n, _, _ in PROGRAMS)
    stats = [('2', L(4), 'sprout'), ('8', 'برامج ميدانية', 'heart'), ('5', L(113).split('  ')[-1], 'grid'),
             ('4', L(158), 'users'), ('7', f'{L(6).split(" ", 1)[1]} — {L(7)}', 'globe')]
    stats_html = ''.join(f'<div class="stat rv"><span class="stat-ic">{ic(i)}</span><b data-to="{n}">{n}</b><span>{t}</span></div>' for n, t, i in stats)
    values = ''.join(f'<li><span>{ic("check")}</span><b>{L(101 + 3 * i)}</b><small>{L(103 + 3 * i)}</small></li>' for i in range(4))
    ways = [('support.html#donate', 'heart', 'تبرّع', L(211), 'gold'),
            ('support.html#volunteer', 'users', 'تطوّع معنا', L(161), 'teal'),
            ('join.html#apply', 'check', 'طلب العضوية', L(184).split('  ', 1)[-1], 'blue'),
            ('support.html#zakat', 'calc', 'حاسبة الزكاة', 'احسب زكاة مالك في دقيقة', 'purple')]
    ways_html = ''.join(f'<a class="way rv" href="{h}" style="--wc:var(--c-{c})"><span class="way-ic">{ic(i)}</span><h3>{t}</h3><p>{d}</p>'
                        f'<span class="way-go">{ic("arrow-left")}</span></a>' for h, i, t, d, c in ways)
    stages = ''.join(f'<li class="rv"><span class="st-n">{L(130 + 4 * i)}</span><b>{L(131 + 4 * i)}</b><small>{L(132 + 4 * i)}</small></li>' for i in range(7))
    faqs = ''.join(qa(a, s_, e, f'hf{i + 1}') for i, (a, s_, e) in enumerate(F[:4]))
    body = f'''
<section class="hero-slider" aria-roledescription="carousel" aria-label="{L(1)}" data-slider>
  <canvas class="constellation" aria-hidden="true"></canvas>
  {slides_html}
  <div class="slider-ui wrap">
    <div class="dots" role="tablist">{dots}</div>
    <div class="arrows"><button type="button" class="arrow" data-prev aria-label="السابق">{ic('arrow-right')}</button><button type="button" class="arrow" data-next aria-label="التالي">{ic('arrow-left')}</button></div>
  </div>
</section>

<section class="quick-donate-wrap"><div class="wrap">
  <form class="quick-donate rv" action="support.html" method="get" data-quick-donate>
    <div class="qd-head"><span class="qd-ic">{ic('heart')}</span><div><b>تبرّع سريع</b><small>{L(211)}</small></div></div>
    <div class="qd-amts" role="radiogroup" aria-label="المبلغ">{amounts}</div>
    <label class="qd-field"><span>المبلغ</span><input type="number" name="amount_custom" min="1" inputmode="numeric" dir="ltr" placeholder="مبلغ آخر"></label>
    <label class="qd-field qd-prog"><span>البرنامج</span><select name="program"><option>حيث الحاجة أكبر</option>{progs}</select></label>
    <button class="btn btn-gold btn-lg" type="submit">{ic('heart')}تبرع الآن</button>
  </form>
</div></section>

<section class="stats-band"><div class="wrap stats">{stats_html}</div></section>

{kinetic()}

<section class="sec about-split" id="welcome"><div class="wrap split">
  <div class="split-media rv">
    <div class="sm-main" style="--img:url(../assets/img/courtyard.jpg)"></div>
    <div class="sm-badge"><img src="assets/logo.png" alt="" width="84" height="84"><b>{L(2)}</b></div>
  </div>
  <div class="split-copy">
    <span class="kicker rv">{L(41)}</span>
    <h2 class="rv">{L(9)}</h2>
    <p class="big rv" data-words>{L(42)}</p>
    <p class="rv muted">{L(10)}</p>
    <ul class="values rv">{values}</ul>
    <div class="btns rv"><a class="btn btn-primary" href="about.html">{ic('info')}اعرف المزيد عنا</a><a class="btn btn-soft" href="transparency.html">{ic('file')}الشفافية</a></div>
  </div>
</div></section>

<section class="sec alt" id="programs"><div class="wrap">
  <div class="sec-title rv"><span class="kicker">{L(73)}</span><h2>برامجنا</h2><p>{L(75)}</p></div>
  <div class="filter-tabs rv" role="tablist">
    <button type="button" class="ft is-on" data-filter="all">الكل</button>
    <button type="button" class="ft" data-filter="yanabee">{_after_dash(76)[0]}</button>
    <button type="button" class="ft" data-filter="manafea">{_after_dash(82)[0]}</button>
  </div>
  <div class="pgrid" data-filter-grid>{program_cards()}</div>
  <div class="center rv" style="margin-top:28px"><a class="btn btn-primary" href="initiatives.html">{ic('sprout')}{L(73)}</a></div>
</div></section>

<section class="sec split-sec"><div class="wrap">{splitter()}</div></section>

<section class="sec alt" id="help"><div class="wrap">
  <div class="sec-title rv"><span class="kicker">ساهم معنا</span><h2>كيف تساهم في صناعة الأثر؟</h2></div>
  <div class="ways">{ways_html}</div>
</div></section>

<section class="journey" style="--img:url(../assets/img/bosphorus.jpg)"><div class="wrap">
  <div class="sec-title light rv"><span class="kicker">{L(127)}</span><h2>{L(7)}</h2><p>{L(128)}</p></div>
  {journey()}
  <div class="center rv"><a class="btn btn-gold" href="expansion.html">{ic('globe')}{L(127)}</a></div>
</div></section>

<section class="sec tree-sec" id="grow"><div class="wrap">{growth_tree()}</div></section>

<section class="sec alt" id="role"><div class="wrap">{role_quiz()}</div></section>

<section class="sec" id="why"><div class="wrap">
  <div class="sec-title rv"><span class="kicker">{L(303)}</span><h2>{L(302)}</h2><p>{L(305)}</p></div>
  <div class="flips">{pillar_flips()}</div>
</div></section>

<section class="sec" id="vision"><div class="wrap vm">
  <article class="vm-card rv" style="--vc:var(--c-teal)"><span class="vm-ic">{ic('eye')}</span><span class="kicker">{L(2)}</span><h3>{L(52)}</h3><p>{L(53)}</p></article>
  <article class="vm-card rv" style="--vc:var(--c-gold)"><span class="vm-ic">{ic('target')}</span><span class="kicker">{L(5)}</span><h3>{L(54)}</h3><p>{L(55)}</p></article>
</div></section>

<section class="gallery-sec">
  <div class="wrap sec-title rv"><span class="kicker">{L(1)}</span><h2>من أجواء عملنا</h2></div>
  {gallery()}
  <p class="ph-note">صور تعبيرية</p>
</section>

<section class="sec alt" id="faq-teaser"><div class="wrap faq-split">
  <div class="rv"><span class="kicker">{L(377)}</span><h2>أسئلة شائعة</h2><p class="muted">{L(378)}</p>
    <div class="btns"><a class="btn btn-primary" href="faq.html">{ic('help')}{L(377)}</a><button type="button" class="btn btn-soft" data-open-chat>{ic('sparkles')}اسأل المساعد</button></div></div>
  <div class="faq-list">{faqs}</div>
</div></section>
{cta()}'''
    page('index.html', 'الرئيسية', body, L(10))


# =============================================================== ABOUT ===
def build_about():
    s1 = section(1, f'''<div class="grid g3">
      {card(L(43), L(44), 'landmark')}{card(L(45), L(46), 'pin')}{card(L(47), L(48), 'globe')}
    </div>
    {photo_strip('ortakoy', 'dome', 'courtyard')}''', lead=L(42))
    goals = ''.join(numcard(L(57 + 3 * i), L(58 + 3 * i), L(59 + 3 * i)) for i in range(5))
    s2 = section(2, f'''<div class="grid g2">
      <article class="card tilt rv feature" style="--fc:var(--c-gold)"><div class="ic">{ic('eye')}</div><h3>{L(52)}</h3><p>{L(53)}</p></article>
      <article class="card tilt rv feature" style="--fc:var(--c-leaf)"><div class="ic">{ic('target')}</div><h3>{L(54)}</h3><p>{L(55)}</p></article>
    </div>
    {subhead(L(56), id='s2-1')}
    <div class="grid g3">{goals}</div>''', alt=True)
    phil = ''.join(
        f'<article class="card tilt rv"><span class="tag" dir="ltr">{L(102 + 3 * i)}</span><h3>{L(101 + 3 * i)}</h3><p>{L(103 + 3 * i)}</p></article>'
        for i in range(4))
    rows = ''.join(
        f'<tr><td data-label="{L(114)}">{L(116 + 2 * i)}</td><td data-label="{L(115)}">{L(117 + 2 * i)}</td></tr>'
        for i in range(5))
    s4 = section(4, f'''{subhead(L(100), id='s4-1')}
    <div class="grid g4">{phil}</div>
    {subhead(L(113), id='s4-2')}
    <div class="table-wrap rv"><table class="rt"><thead><tr><th>{L(114)}</th><th>{L(115)}</th></tr></thead><tbody>{rows}</tbody></table></div>''')
    intro = f'<section class="sec intro-sec"><div class="wrap intro rv"><span class="kicker">{L(1)}</span><h2>{L(9)}</h2><p class="big">{L(10)}</p><p class="muted">{L(11)}</p></div></section>'
    page('about.html', 'من نحن', page_hero('about.html', [1, 2, 4]) + intro + s1 + s2 + s4 + cta(), L(42))


# ========================================================= INITIATIVES ===
def build_initiatives():
    s3 = section(3, f'''<div class="grid g2">
      <article class="init-card tilt rv yanabee" id="s3-1"><span class="ic big">{ic('droplet')}</span>
        <h3>{L(76)}</h3><p class="focus">{L(77)}</p>{ul(LS(78, 81))}
        <a class="init-link" href="yanabee/index.html">{ic('droplet')}<span>موقع مشروع «ينابيع»</span>{ic('arrow-left')}</a></article>
      <article class="init-card tilt rv manafea" id="s3-2"><span class="ic big">{ic('coins')}</span>
        <h3>{L(82)}</h3><p class="focus">{L(83)}</p>{ul(LS(84, 87), 'diamond')}</article>
    </div>
    {subhead(L(88), id='s3-3')}
    <div class="grid g4">{card(L(89), L(90), 'refresh')}{card(L(91), L(92), 'wrench')}{card(L(93), L(94), 'flask')}{card(L(95), L(96), 'scale')}</div>
    {photo_strip('reading', 'dialogue', 'training', 'bakery')}''',
                 lead=L(75))
    tg = ''.join(card(L(160 + 2 * i), L(161 + 2 * i), icn) for i, icn in enumerate(['building', 'cap', 'heart', 'landmark']))
    s6 = section(6, f'<div class="grid g4">{tg}</div>', alt=True)
    s10 = section(10, f'''<div class="grid g3">{card(L(243), L(244), 'briefcase')}{card(L(245), L(246), 'link')}{card(L(247), L(248), 'tree')}</div>''')
    page('initiatives.html', 'المبادرات', page_hero('initiatives.html', [3, 6, 10]) + s3 + s6 + s10 + cta(), L(75))


# =========================================================== EXPANSION ===
def build_expansion():
    tl = ''.join(
        f'<li class="tl" id="st{i + 1}"><span class="tl-n">{L(130 + 4 * i)}</span><div class="card"><span class="tag">{L(129 + 4 * i)} {L(130 + 4 * i)}</span>'
        f'<h3>{L(131 + 4 * i)}</h3><p>{L(132 + 4 * i)}</p></div></li>' for i in range(7))
    s5 = section(5, f'<div class="timeline"><span class="tl-fill" aria-hidden="true"></span><ol class="tl-list">{tl}</ol></div>' + photo_strip('istanbul', 'bosphorus', 'ortakoy'), lead=f'{L(6)} — {L(7)}')
    page('expansion.html', 'خطة التوسع', page_hero('expansion.html', [5], visual=True) + s5 + cta(), L(128), globe=True)


# ========================================================== GOVERNANCE ===
def build_governance():
    org = ''.join(
        f'<article class="org-card tilt rv"><div class="org-big">{L(a)}</div><div><h3>{L(a + 1)} <small dir="ltr">{L(a + 2)}</small></h3><p>{L(a + 3)}</p></div></article>'
        for a in (172, 176, 180))
    cycle = ''.join(
        f'<li class="rv"><span class="num">{L(189 + 4 * i)}</span><h3>{L(190 + 4 * i)}</h3><p>{L(191 + 4 * i)}</p></li>' for i in range(4))
    s7 = section(7, f'''{subhead(L(171), id='s7-1')}
    <div class="org">{org}</div>
    {subhead(L(184), id='s7-2')}
    <div class="card rv">{ul(LS(185, 187))}</div>
    {subhead(L(188), id='s7-3')}
    <ol class="cycle">{cycle}</ol>''')
    fin = ''.join(
        f'<article class="card tilt rv income"><span class="num">{L(208 + 2 * i)}</span><p>{L(209 + 2 * i)}</p></article>' for i in range(7))
    s8 = section(8, f'''{subhead(L(207), id='s8-1')}
    <div class="grid g4">{fin}</div>
    {subhead(L(222), id='s8-2')}
    <div class="grid g2">{card(L(223), L(224), 'scale')}{card(L(225), L(226), 'tree')}</div>
    {photo_strip('board', 'dialogue', 'distribution')}''', alt=True)
    page('governance.html', 'الحوكمة والتمويل', page_hero('governance.html', [7, 8]) + s7 + s8 + cta(), L(170))


# ================================================================ JOIN ===
def pcard(num, title, sub, text, extra=''):
    return (f'<article class="card tilt rv pillar" id="p{num}"><div class="pillar-top"><span class="num">{num}</span>'
            f'<div><h3>{title}</h3><p class="pillar-sub">{sub}</p></div></div><p>{text}</p>{extra}</article>')


def pair(a, b):
    return f'<div class="pair"><b>{L(a)}</b><span>{L(b)}</span></div>'



def membership_form():
    """Membership application (طلب عضوية). Data never leaves the visitor's
    browser unless they send it; JOIN_EMAIL below enables the e-mail button."""
    def f(name, label, typ='text', req=True, extra='', full=False):
        r = ' required' if req else ''
        star = '<b aria-hidden="true">*</b>' if req else '<small>(اختياري)</small>'
        return (f'<label class="fld{" full" if full else ""}"><span>{label} {star}</span>'
                f'<input name="{name}" type="{typ}"{r}{extra}><em class="err" aria-live="polite"></em></label>')
    def sel(name, label, opts, req=True):
        o = ''.join(f'<option>{x}</option>' for x in opts)
        return (f'<label class="fld"><span>{label} <b aria-hidden="true">*</b></span><select name="{name}" required>'
                f'<option value="">— اختر —</option>{o}</select><em class="err" aria-live="polite"></em></label>')
    interests = ''.join(
        f'<label class="pick"><input type="checkbox" name="interest" value="{v}"><span>{v}</span></label>'
        for v in ['مبادرة «ينابيع»', 'مبادرة «منافع»', 'التنسيق بين الجمعيات', 'التأهيل المهني والتوظيف',
                  'التكافل والتضامن الاجتماعي', 'الدراسات والتخطيط'])
    duties = ''.join(f'<li>{t}</li>' for t in LS(236, 239))
    return f'''
<section class="sec" id="apply">
  <div class="wrap">
    <div class="center"><span class="kicker rv">{L(184)}</span><h2 class="rv">استمارة طلب العضوية</h2>
      <p class="lead rv center-text">{L(185)}. {L(186)}.</p></div>
    <form class="join-form rv" novalidate data-email="">
      <fieldset><legend><span class="step">1</span> البيانات الشخصية</legend>
        <div class="fgrid">
          {f('full_name', 'الاسم الكامل', extra=' autocomplete="name" minlength="5"')}
          {f('nationality', 'الجنسية', extra=' autocomplete="country-name"')}
          {f('id_number', 'رقم الهوية / الإقامة', extra=' inputmode="numeric" minlength="5"')}
          {f('birth_date', 'تاريخ الميلاد', 'date')}
          {sel('member_type', 'نوع العضوية', ['شخص طبيعي (فرد)', 'شخص اعتباري (مؤسسة / جمعية)'])}
          {sel('residence', 'الإقامة في تركيا', ['مواطن تركي', 'إقامة قانونية سارية', 'مقيم خارج تركيا'])}
        </div>
      </fieldset>
      <fieldset><legend><span class="step">2</span> بيانات التواصل</legend>
        <div class="fgrid">
          {f('phone', 'رقم الجوال (مع رمز الدولة)', 'tel', extra=' autocomplete="tel" dir="ltr" placeholder="+90 5xx xxx xx xx"')}
          {f('email', 'البريد الإلكتروني', 'email', extra=' autocomplete="email" dir="ltr"')}
          {f('city', 'المدينة / الولاية', extra=' autocomplete="address-level2"')}
          {f('address', 'العنوان التفصيلي', req=False, full=True, extra=' autocomplete="street-address"')}
        </div>
      </fieldset>
      <fieldset><legend><span class="step">3</span> المؤهلات والاهتمامات</legend>
        <div class="fgrid">
          {f('profession', 'المهنة / المسمى الوظيفي')}
          {sel('education', 'المؤهل العلمي', ['ثانوي', 'دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه', 'أخرى'])}
          {f('languages', 'اللغات التي تتقنها', req=False)}
        </div>
        <p class="fhint">مجالات المشاركة التي تهمّك:</p>
        <div class="picks">{interests}</div>
        <label class="fld full"><span>كيف يمكنك أن تساهم في تحقيق أهداف الجمعية؟ <small>(اختياري)</small></span>
          <textarea name="contribution" rows="4" maxlength="1200"></textarea></label>
      </fieldset>
      <fieldset><legend><span class="step">4</span> الإقرار</legend>
        <ul class="list diamond">{duties}</ul>
        <label class="agree"><input type="checkbox" name="agree" required><span>أقرّ بصحة البيانات المذكورة، وألتزم بأهداف الجمعية ونظامها الأساسي وواجبات العضو المذكورة أعلاه.</span></label>
        <em class="err agree-err" aria-live="polite"></em>
      </fieldset>
      <div class="factions">
        <button class="btn btn-primary" type="submit">{ic('check')}إرسال طلب العضوية</button>
        <button class="btn btn-soft" type="reset">مسح الحقول</button>
      </div>
    </form>
    <div class="join-done" hidden tabindex="-1">
      <div class="done-head"><span class="ic big">{ic('check')}</span><div><h3>تم تجهيز طلب العضوية</h3>
        <p>راجع بياناتك أدناه، ثم احفظ الطلب أو اطبعه وسلّمه للجمعية.</p></div></div>
      <div class="done-sheet"></div>
      <div class="factions">
        <button class="btn btn-primary" type="button" data-join-print>{ic('book')}طباعة / حفظ PDF</button>
        <a class="btn btn-gold" data-join-mail hidden>{ic('send')}إرسال بالبريد الإلكتروني</a>
        <button class="btn btn-soft" type="button" data-join-edit>تعديل البيانات</button>
      </div>
    </div>
  </div>
</section>'''


def build_join():
    s9 = section(9, f'''<div class="grid g2">
      <article class="card tilt rv feature" style="--fc:var(--c-leaf)"><div class="ic">{ic('check')}</div><h3>{L(230)}</h3>{ul(LS(232, 235))}</article>
      <article class="card tilt rv feature" style="--fc:var(--c-gold)"><div class="ic">{ic('pinmark')}</div><h3>{L(231)}</h3>{ul(LS(236, 239), 'diamond')}</article>
    </div>
    {photo_strip('hands', 'youth', 'mentor')}''')
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
    portal_cta = (f'<section class="sec portal-cta-sec"><div class="wrap"><a class="portal-cta rv" href="portal.html">'
                  f'<span class="pc-ic">{ic("users")}</span><div><b>قدّم طلبك إلكترونياً عبر بوابة الأعضاء</b>'
                  f'<span>أنشئ حسابك، املأ الاستمارة، ارفع إيصال الاشتراك، وتابع حالة عضويتك وإشعاراتك.</span></div>'
                  f'<span class="btn btn-gold">{ic("arrow-left")}الدخول إلى البوابة</span></a></div></section>')
    page('join.html', 'العضوية', page_hero('join.html', [9, 12, 11]) + portal_cta + membership_form() + s9 + s12 + s11 + cta(), L(304), js=('js/join.js',))


# ================================================================= FAQ ===
def qa(qnum_line, start, end, qid):
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
    return (f'<details class="qa rv" id="{qid}"><summary><span class="q-num">{L(qnum_line)}</span>'
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
    {subhead(L(379), L(380), id='s13-1')}
    <div class="faq-list">{''.join(qa(a, s, e, f'f{i + 1}') for i, (a, s, e) in enumerate(F))}</div>
    {subhead(L(446), L(447), id='s13-2')}
    <div class="faq-list">{''.join(qa(a, s, e, f'b{i + 1}') for i, (a, s, e) in enumerate(B))}</div>
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


def _fld(name, label, typ='text', req=True, extra='', full=False):
    r = ' required' if req else ''
    star = '<b aria-hidden="true">*</b>' if req else '<small>(اختياري)</small>'
    return (f'<label class="fld{" full" if full else ""}"><span>{label} {star}</span>'
            f'<input name="{name}" type="{typ}"{r}{extra}><em class="err" aria-live="polite"></em></label>')


def _sel(name, label, opts, req=True):
    o = ''.join(f'<option>{x}</option>' for x in opts)
    star = '<b aria-hidden="true">*</b>' if req else '<small>(اختياري)</small>'
    return (f'<label class="fld"><span>{label} {star}</span><select name="{name}"{" required" if req else ""}>'
            f'<option value="">— اختر —</option>{o}</select><em class="err" aria-live="polite"></em></label>')


PHOTO_OF = {78: 'reading', 79: 'mentor', 80: 'dialogue', 81: 'youth', 84: 'workshop', 85: 'training', 86: 'bakery', 87: 'distribution'}
PROGRAMS = [(78, 'yanabee', 'droplet'), (79, 'yanabee', 'heart'), (80, 'yanabee', 'users'), (81, 'yanabee', 'shield'),
            (84, 'manafea', 'briefcase'), (85, 'manafea', 'link'), (86, 'manafea', 'coins'), (87, 'manafea', 'heart')]


def build_support():
    prog_names = [L(n) for n, _, _ in PROGRAMS]
    amounts = ''.join(f'<label class="pick amt"><input type="radio" name="amount_preset" value="{a}"><span>{a}</span></label>' for a in (100, 250, 500, 1000, 2500))
    depts = ''.join(f'<label class="pick"><input type="checkbox" name="area" value="{L(116 + 2 * i)}"><span>{L(116 + 2 * i)}</span></label>' for i in range(5))
    sources = ''.join(f'<li><span class="num">{L(208 + 2 * i)}</span>{L(209 + 2 * i)}</li>' for i in range(7))
    body = f'''
<section class="hero hero-small support-hero has-photo">
  <div class="hero-bg" aria-hidden="true"></div>{photo_layer('distribution')}<div class="hero-aurora" aria-hidden="true"></div>
  <div class="wrap hero-grid"><div class="hero-copy">
    <span class="eyebrow rv">{ic('heart')} {L(7)}</span>
    <h1 class="rv hero-title">ساهم معنا</h1>
    <p class="sub rv">{L(2)} — {L(3)}</p>
    <div class="btns rv"><a class="btn btn-gold" href="#donate">{ic('heart')}تبرع الآن</a><a class="btn btn-soft" href="#volunteer">{ic('users')}تطوع معنا</a><a class="btn btn-soft" href="join.html#apply">{ic('check')}طلب العضوية</a><a class="btn btn-soft" href="#zakat">{ic('calc')}حاسبة الزكاة</a><a class="btn btn-soft" href="#contact">{ic('send')}تواصل معنا</a></div>
  </div></div>
</section>
{ticker()}
<section class="sec" id="programs"><div class="wrap">
  <div class="center"><span class="kicker rv">{L(73)}</span><h2 class="rv">برامج تحتاج دعمك</h2><p class="lead rv center-text">{L(75)}</p></div>
  <div class="pgrid">{program_cards(share=True)}</div>
</div></section>
<section class="sec" id="zakat"><div class="wrap">
  <div class="center"><span class="kicker rv">{ic('calc')} أداة مجانية</span><h2 class="rv">حاسبة الزكاة</h2>
    <p class="lead rv center-text">احسب زكاة مالك في دقيقة: أدخل ما تملكه وسعر غرام الذهب اليوم، وستظهر لك قيمة الزكاة مباشرة.</p></div>
  <form class="zakat rv" data-zakat novalidate>
    <div class="zk-grid">
      <div class="zk-card">
        <h3>{ic('coins')} الإعدادات</h3>
        <label class="fld"><span>العملة</span><select name="zk_cur"><option>TRY</option><option>USD</option><option>EUR</option><option>SAR</option><option>QAR</option><option>KWD</option><option>AED</option></select></label>
        <label class="fld"><span>أساس النصاب</span><select name="zk_basis"><option value="gold">الذهب (85 غراماً)</option><option value="silver">الفضة (595 غراماً)</option></select></label>
        <label class="fld"><span>سعر غرام الذهب اليوم</span><input name="zk_gold_price" type="number" min="0" step="any" inputmode="decimal" dir="ltr" placeholder="0"></label>
        <label class="fld"><span>سعر غرام الفضة اليوم</span><input name="zk_silver_price" type="number" min="0" step="any" inputmode="decimal" dir="ltr" placeholder="0"></label>
      </div>
      <div class="zk-card">
        <h3>{ic('chart')} ما تملكه منذ عام هجري</h3>
        <label class="fld"><span>النقد في اليد والحسابات البنكية</span><input name="zk_cash" type="number" min="0" step="any" inputmode="decimal" dir="ltr" placeholder="0"></label>
        <label class="fld"><span>الذهب (بالغرام)</span><input name="zk_gold_g" type="number" min="0" step="any" inputmode="decimal" dir="ltr" placeholder="0"></label>
        <label class="fld"><span>الفضة (بالغرام)</span><input name="zk_silver_g" type="number" min="0" step="any" inputmode="decimal" dir="ltr" placeholder="0"></label>
        <label class="fld"><span>عروض التجارة والأسهم والاستثمارات</span><input name="zk_trade" type="number" min="0" step="any" inputmode="decimal" dir="ltr" placeholder="0"></label>
        <label class="fld"><span>ديون لك مرجوّة السداد</span><input name="zk_recv" type="number" min="0" step="any" inputmode="decimal" dir="ltr" placeholder="0"></label>
        <label class="fld"><span>ديون عليك حالّة (تُخصم)</span><input name="zk_debt" type="number" min="0" step="any" inputmode="decimal" dir="ltr" placeholder="0"></label>
      </div>
      <div class="zk-card zk-result" aria-live="polite">
        <h3>{ic('check')} النتيجة</h3>
        <div class="zk-row"><span>إجمالي المال الخاضع للزكاة</span><b data-zk="total">—</b></div>
        <div class="zk-row"><span>قيمة النصاب</span><b data-zk="nisab">—</b></div>
        <div class="zk-big"><span>زكاتك المستحقة (2.5%)</span><b data-zk="zakat">—</b></div>
        <p class="zk-status" data-zk="status">أدخل سعر غرام الذهب أو الفضة لمعرفة النصاب.</p>
        <button type="button" class="btn btn-gold" data-zk-donate disabled>{ic('heart')}تبرّع بهذا المبلغ</button>
      </div>
    </div>
    <p class="zk-note">الحاسبة للاستئناس فقط: تُحسب الزكاة بنسبة 2.5% (ربع العشر) إذا بلغ المال النصاب ومرّ عليه حول هجري كامل. لحالتك الخاصة راجع أهل العلم، وتأكّد من الجمعية من آلية استلام أموال الزكاة وصرفها.</p>
  </form>
</div></section>
<section class="sec alt" id="donate"><div class="wrap">
  <div class="donate-grid">
    <div class="donate-info rv">
      <span class="kicker">{L(207)}</span>
      <h2>تبرّع لدعم البرامج</h2>
      <ol class="src-list">{sources}</ol>
    </div>
    <div>
      <form class="join-form donate-form rv" novalidate data-email="" data-title="تعهّد تبرّع">
        <fieldset><legend><span class="step">1</span> قيمة التبرع</legend>
          <div class="picks amounts">{amounts}</div>
          <div class="fgrid">
            {_fld('amount', 'المبلغ', 'number', extra=' min="1" step="1" inputmode="numeric" dir="ltr"')}
            {_sel('currency', 'العملة', ['TRY ليرة تركية', 'USD دولار أمريكي', 'EUR يورو', 'SAR ريال سعودي', 'QAR ريال قطري', 'KWD دينار كويتي', 'AED درهم إماراتي'])}
            {_sel('frequency', 'نوع التبرع', ['مرة واحدة', 'شهري', 'سنوي'])}
            {_sel('program', 'البرنامج', ['حيث الحاجة أكبر'] + prog_names)}
          </div>
          <div class="basket" data-basket>
            <button type="button" class="btn btn-soft basket-add" data-basket-add>{ic('cart')}أضف إلى سلة التبرعات</button>
            <p class="basket-hint">يمكنك دعم أكثر من برنامج في تعهّد واحد: اختر البرنامج والمبلغ ثم أضفه إلى السلة.</p>
            <div class="basket-box" hidden>
              <div class="basket-head"><b>{ic('cart')} سلة التبرعات</b><span class="basket-count"></span></div>
              <ul class="basket-list"></ul>
              <div class="basket-total"><span>الإجمالي</span><b data-basket-total></b></div>
            </div>
          </div>
        </fieldset>
        <fieldset class="gift-set"><legend><span class="step">2</span> لمن هذا التبرع؟</legend>
          <div class="picks gift-picks">
            <label class="pick"><input type="radio" name="gift_mode" value="self" checked><span>{ic('heart')}عن نفسي</span></label>
            <label class="pick"><input type="radio" name="gift_mode" value="behalf"><span>{ic('users')}عن شخص آخر</span></label>
            <label class="pick"><input type="radio" name="gift_mode" value="gift"><span>{ic('gift')}إهداء لشخص عزيز</span></label>
          </div>
          <div class="fgrid gift-fields" data-gift="behalf" hidden>
            {_fld('behalf_name', 'اسم من تتبرع عنه', extra=' disabled')}
          </div>
          <div class="fgrid gift-fields" data-gift="gift" hidden>
            {_fld('gift_to', 'اسم المُهدى إليه', extra=' disabled')}
            {_fld('gift_from', 'الاسم الذي يظهر على البطاقة', req=False, extra=' disabled')}
            <label class="fld full"><span>رسالة الإهداء <small>(اختياري)</small></span><textarea name="gift_msg" rows="2" maxlength="240" disabled></textarea><em class="err" aria-live="polite"></em></label>
          </div>
          <p class="gift-note">سنجهّز لك بطاقة إهداء أنيقة باسم من تحب لتطبعها أو ترسلها له مع التعهّد.</p>
        </fieldset>
        <fieldset><legend><span class="step">3</span> بيانات المتبرع</legend>
          <div class="fgrid">
            {_fld('full_name', 'الاسم', extra=' autocomplete="name"')}
            {_fld('phone', 'رقم الجوال (مع رمز الدولة)', 'tel', extra=' autocomplete="tel" dir="ltr" placeholder="+90 5xx xxx xx xx"')}
            {_fld('email', 'البريد الإلكتروني', 'email', req=False, extra=' autocomplete="email" dir="ltr"')}
          </div>
          <label class="agree"><input type="checkbox" name="agree" required><span>أرغب في التبرع للجمعية، وأوافق على تواصل الجمعية معي لاستكمال إجراءات التبرع ({L(217)}).</span></label>
          <em class="err agree-err" aria-live="polite"></em>
        </fieldset>
        <div class="factions"><button class="btn btn-gold" type="submit">{ic('heart')}تأكيد التبرع</button></div>
      </form>
      <div class="join-done" hidden tabindex="-1">
        <div class="done-head"><span class="ic big">{ic('heart')}</span><div><h3>جزاك الله خيراً — تم تجهيز تعهّد التبرع</h3><p>احفظ التعهّد أو اطبعه، وسلّمه للجمعية لإتمام التبرع.</p></div></div>
        <div class="done-sheet"></div>
        <div class="gift-card" hidden></div>
        <div class="factions"><button class="btn btn-primary" type="button" data-join-print>{ic('book')}طباعة / حفظ PDF</button><a class="btn btn-gold" data-join-mail hidden>{ic('send')}إرسال بالبريد الإلكتروني</a><button class="btn btn-soft" type="button" data-join-edit>تعديل</button></div>
      </div>
    </div>
  </div>
</div></section>
<section class="sec" id="volunteer"><div class="wrap">
  <div class="center"><span class="kicker rv">{L(113)}</span><h2 class="rv">تطوّع معنا</h2><p class="lead rv center-text">{L(326)}</p></div>
  {photo_strip('hands', 'youth', 'distribution')}
  <form class="join-form rv" novalidate data-email="" data-title="طلب تطوّع">
    <fieldset><legend><span class="step">1</span> بياناتك</legend>
      <div class="fgrid">
        {_fld('full_name', 'الاسم الكامل', extra=' autocomplete="name" minlength="5"')}
        {_fld('phone', 'رقم الجوال (مع رمز الدولة)', 'tel', extra=' autocomplete="tel" dir="ltr" placeholder="+90 5xx xxx xx xx"')}
        {_fld('email', 'البريد الإلكتروني', 'email', extra=' autocomplete="email" dir="ltr"')}
        {_fld('city', 'المدينة / الولاية')}
        {_fld('skills', 'المهارات والخبرات')}
        {_sel('hours', 'الوقت المتاح أسبوعياً', ['أقل من 3 ساعات', '3 – 6 ساعات', '6 – 10 ساعات', 'أكثر من 10 ساعات'])}
      </div>
    </fieldset>
    <fieldset><legend><span class="step">2</span> القسم الذي تود التطوع فيه</legend>
      <div class="picks">{depts}</div>
      <label class="agree"><input type="checkbox" name="agree" required><span>{L(236)}</span></label>
      <em class="err agree-err" aria-live="polite"></em>
    </fieldset>
    <div class="factions"><button class="btn btn-primary" type="submit">{ic('users')}إرسال طلب التطوع</button></div>
  </form>
  <div class="join-done" hidden tabindex="-1">
    <div class="done-head"><span class="ic big">{ic('check')}</span><div><h3>شكراً لك — تم تجهيز طلب التطوع</h3><p>احفظ الطلب أو اطبعه وسلّمه للجمعية.</p></div></div>
    <div class="done-sheet"></div>
    <div class="factions"><button class="btn btn-primary" type="button" data-join-print>{ic('book')}طباعة / حفظ PDF</button><a class="btn btn-gold" data-join-mail hidden>{ic('send')}إرسال بالبريد الإلكتروني</a><button class="btn btn-soft" type="button" data-join-edit>تعديل</button></div>
  </div>
</div></section>
<section class="sec alt" id="contact"><div class="wrap">
  <div class="center"><span class="kicker rv">{L(45)}</span><h2 class="rv">تواصل معنا</h2><p class="lead rv center-text">{L(46)} — {L(48)}</p></div>
  <div class="contact-grid">
    <div class="contact-info rv">
      <div class="ci"><span class="ic">{ic('pin')}</span><div><b>{L(45)}</b><span>{L(46)}</span></div></div>
      <div class="ci"><span class="ic">{ic('globe')}</span><div><b>{L(47)}</b><span>{L(48)}</span></div></div>
      <div class="ci"><span class="ic">{ic('sparkles')}</span><div><b>اسأل المساعد الذكي</b><span>إجابات فورية من نص الكتيب.</span><button class="btn btn-soft" type="button" data-open-chat>ابدأ المحادثة</button></div></div>
    </div>
    <div>
      <form class="join-form rv" novalidate data-email="" data-title="رسالة تواصل">
        <fieldset><legend><span class="step">{ic('send')}</span> أرسل رسالتك</legend>
          <div class="fgrid">
            {_fld('full_name', 'الاسم', extra=' autocomplete="name"')}
            {_fld('phone', 'رقم الجوال (مع رمز الدولة)', 'tel', extra=' autocomplete="tel" dir="ltr"')}
            {_fld('email', 'البريد الإلكتروني', 'email', req=False, extra=' autocomplete="email" dir="ltr"')}
            {_sel('topic', 'الموضوع', ['استفسار عام', 'العضوية', 'التبرع', 'التطوع', 'الشراكات والتعاون'])}
          </div>
          <label class="fld full"><span>الرسالة <b aria-hidden="true">*</b></span><textarea name="message" rows="5" required minlength="10" maxlength="1500"></textarea><em class="err" aria-live="polite"></em></label>
          <label class="agree"><input type="checkbox" name="agree" required><span>أوافق على تواصل الجمعية معي بخصوص رسالتي.</span></label>
          <em class="err agree-err" aria-live="polite"></em>
        </fieldset>
        <div class="factions"><button class="btn btn-primary" type="submit">{ic('send')}إرسال الرسالة</button></div>
      </form>
      <div class="join-done" hidden tabindex="-1">
        <div class="done-head"><span class="ic big">{ic('check')}</span><div><h3>تم تجهيز رسالتك</h3><p>احفظها أو اطبعها، أو أرسلها بالبريد عند توفره.</p></div></div>
        <div class="done-sheet"></div>
        <div class="factions"><button class="btn btn-primary" type="button" data-join-print>{ic('book')}طباعة / حفظ PDF</button><a class="btn btn-gold" data-join-mail hidden>{ic('send')}إرسال بالبريد الإلكتروني</a><button class="btn btn-soft" type="button" data-join-edit>تعديل</button></div>
      </div>
    </div>
  </div>
</div></section>
{cta()}'''
    page('support.html', 'ساهم معنا', body, L(75), js=('js/donate.js', 'js/join.js'))


# ======================================================== TRANSPARENCY ===
def build_transparency():
    def col(title_l, items, kind, img):
        return (f'<article class="tp-col rv {kind}" style="--img:url(../assets/img/{img}.jpg)"><div class="tp-photo" aria-hidden="true"></div>'
                f'<div class="tp-body"><h3>{L(title_l)}</h3>{ul(items, "diamond" if kind == "manafea" else "check")}</div></article>')
    sources = ''.join(f'<li><span class="num">{L(208 + 2 * i)}</span>{L(209 + 2 * i)}</li>' for i in range(7))
    org = ''.join(
        f'<article class="org-card tilt rv"><div class="org-big">{L(a)}</div><div><h3>{L(a + 1)} <small dir="ltr">{L(a + 2)}</small></h3><p>{L(a + 3)}</p></div></article>'
        for a in (172, 180))
    body = f'''
<section class="hero hero-small has-photo">
  <div class="hero-bg" aria-hidden="true"></div>{photo_layer('board')}<div class="hero-aurora" aria-hidden="true"></div>
  <div class="wrap hero-grid"><div class="hero-copy">
    <span class="eyebrow rv">{ic('file')} {L(206)}</span>
    <h1 class="rv hero-title">الشفافية</h1>
    <p class="sub rv">كيف تُموَّل الجمعية، وأين تذهب التبرعات، ومن يراقب ذلك — من نص الكتيب التعريفي.</p>
    <div class="btns rv"><a class="btn btn-gold" href="support.html#donate">{ic('heart')}تبرع الآن</a><a class="btn btn-soft" href="#reports">{ic('file')}التقارير السنوية</a>
      <button type="button" class="btn btn-soft" data-share data-share-title="الشفافية — جمعية تكامل لبناء القيم والتنمية">{ic('share')}مشاركة</button></div>
  </div></div>
</section>
{ticker()}
<section class="sec" id="where"><div class="wrap">
  <div class="center"><span class="kicker rv">{L(74)}</span><h2 class="rv">أين تذهب تبرعاتك</h2><p class="lead rv center-text">{L(75)}</p></div>
  <div class="tp-cols">{col(76, LS(78, 81), 'yanabee', 'reading')}{col(82, LS(84, 87), 'manafea', 'workshop')}</div>
</div></section>
<section class="sec alt" id="income"><div class="wrap">
  <div class="donate-grid">
    <div class="donate-info rv"><span class="kicker">{L(205)}</span><h2>{L(207)}</h2><ol class="src-list">{sources}</ol></div>
    <div class="tp-stack">
      <h3 class="rv tp-sub">{L(222)}</h3>
      {card(L(223), L(224), 'scale')}{card(L(225), L(226), 'tree')}
    </div>
  </div>
</div></section>
<section class="sec" id="oversight"><div class="wrap">
  <div class="center"><span class="kicker rv">{L(170)}</span><h2 class="rv">الرقابة والمساءلة</h2></div>
  <div class="org tp-org">{org}</div>
  <div class="grid g2" style="margin-top:22px">{card(L(202), L(203), 'chart')}{card(L(245), L(246), 'link')}</div>
</div></section>
<section class="sec alt" id="reports"><div class="wrap">
  <div class="tp-reports rv">
    <span class="ic big">{ic('file')}</span>
    <div><h2>التقارير السنوية والمالية</h2><p>ستُنشر هنا التقارير المالية والسنوية للجمعية فور صدورها، ليطّلع عليها الأعضاء والمتبرعون.</p></div>
    <a class="btn btn-soft" href="support.html#contact">{ic('send')}استفسار عن التقارير</a>
  </div>
</div></section>
{cta()}'''
    page('transparency.html', 'الشفافية', body, L(206))


# ============================================================ PORTAL ===
def build_portal():
    depts = ''.join(f'<label class="pick"><input type="checkbox" name="interests" value="{L(116 + 2 * i)}"><span>{L(116 + 2 * i)}</span></label>' for i in range(5))
    rights = ''.join(f'<li>{L(232 + i)}</li>' for i in range(4))
    duties = ''.join(f'<li>{L(236 + i)}</li>' for i in range(4))
    tab = lambda k, i, t: f'<button type="button" class="pt-tab" data-tab="{k}">{ic(i)}<span>{t}</span><b class="pt-badge" data-badge="{k}" hidden></b></button>'
    body = f'''
<section class="hero hero-small has-photo portal-hero">
  <div class="hero-bg" aria-hidden="true"></div>{photo_layer('hands')}
  <div class="wrap hero-grid"><div class="hero-copy">
    {crumbs('بوابة الأعضاء')}
    <h1 class="rv hero-title">بوابة الأعضاء</h1>
    <p class="sub rv">استمارة العضوية، وسداد الاشتراك، وتاريخ عضويتك، والإشعارات والملاحظات — كلها في حسابك.</p>
  </div></div>
</section>

<section class="sec portal" data-portal><div class="wrap">
  <div class="pt-loading" data-view="loading"><span class="spin"></span></div>

  <!-- ===== sign in / register ===== -->
  <div class="pt-auth" data-view="auth" hidden>
    <div class="pt-auth-card">
      <div class="pt-auth-tabs" role="tablist">
        <button type="button" class="is-on" data-auth="login">تسجيل الدخول</button>
        <button type="button" data-auth="register">حساب جديد</button>
      </div>
      <form class="pt-form" data-form="login">
        <label class="fld"><span>البريد الإلكتروني</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>
        <label class="fld"><span>كلمة المرور</span><input name="password" type="password" required autocomplete="current-password" minlength="8" dir="ltr"></label>
        <button class="btn btn-primary btn-lg" type="submit">{ic('users')}دخول</button>
        <button type="button" class="pt-link" data-forgot>نسيت كلمة المرور؟</button>
      </form>
      <form class="pt-form" data-form="register" hidden>
        <label class="fld"><span>الاسم الكامل</span><input name="full_name" required minlength="5" autocomplete="name"></label>
        <label class="fld"><span>البريد الإلكتروني</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>
        <label class="fld"><span>كلمة المرور (8 أحرف على الأقل)</span><input name="password" type="password" required minlength="8" autocomplete="new-password" dir="ltr"></label>
        <button class="btn btn-gold btn-lg" type="submit">{ic('check')}إنشاء الحساب</button>
        <p class="pt-fine">بعد إنشاء الحساب تصلك رسالة تأكيد على بريدك، ثم تُكمل استمارة العضوية من حسابك.</p>
      </form>
      <p class="pt-msg" data-auth-msg aria-live="polite"></p>
    </div>
    <aside class="pt-auth-side">
      <span class="kicker">{L(184).split('  ', 1)[-1]}</span>
      <h2>خطوات العضوية</h2>
      <ol class="pt-steps">
        <li><b>1</b><span>أنشئ حسابك</span></li>
        <li><b>2</b><span>املأ استمارة العضوية</span></li>
        <li><b>3</b><span>مراجعة الطلب من الإدارة</span></li>
        <li><b>4</b><span>سداد الاشتراك السنوي</span></li>
        <li><b>5</b><span>تفعيل العضوية وبطاقة العضو</span></li>
      </ol>
      <p class="muted">{L(185)}</p>
    </aside>
  </div>

  <!-- ===== member area ===== -->
  <div class="pt-app" data-view="app" hidden>
    <nav class="pt-side" aria-label="حسابي">
      <div class="pt-me"><span class="pt-avatar" data-me="initial"></span><div><b data-me="name"></b><small data-me="email"></small></div></div>
      {tab('overview', 'grid', 'نظرة عامة')}
      {tab('application', 'file', 'استمارة العضوية')}
      {tab('payments', 'coins', 'الاشتراكات والدفع')}
      {tab('notifications', 'send', 'الإشعارات')}
      {tab('events', 'calendar', 'الأنشطة والفعاليات')}
      {tab('requests', 'file', 'طلباتي ومراسلاتي')}
      {tab('violations', 'shield', 'الملاحظات والمخالفات')}
      {tab('profile', 'users', 'بياناتي')}
      <a class="pt-tab pt-admin-link" href="{'admin.html' if core.LANG == 'ar' else '../admin.html'}" hidden>{ic('chart')}<span>لوحة الإدارة</span></a>
      <button type="button" class="pt-tab pt-out" data-logout>{ic('arrow-right')}<span>تسجيل الخروج</span></button>
    </nav>

    <div class="pt-main">
      <!-- overview -->
      <section class="pt-panel" data-panel="overview">
        <div class="mcard">
          <div class="mcard-top"><img src="assets/logo.png" alt="" width="56" height="56"><div><b>بطاقة العضوية</b><small>{L(501).split('  |  ')[0]}</small></div><span class="st-badge" data-me="status"></span></div>
          <div class="mcard-id"><span class="mcard-photo" data-me="photo"></span><div class="mcard-name" data-me="name"></div></div>
          <div class="mcard-grid">
            <div><small>رقم العضوية</small><b data-me="no">—</b></div>
            <div><small>تاريخ الانضمام</small><b data-me="joined">—</b></div>
            <div><small>تنتهي في</small><b data-me="expires">—</b></div>
          </div>
          <div class="mcard-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="r-bg"/><circle cx="60" cy="60" r="52" class="r-fg" pathLength="100"/></svg><div><b data-me="days">—</b><small>يوماً متبقية</small></div></div>
        </div>
        <div class="mcard-actions" data-card-actions hidden>
          <div class="mcard-qr" data-qr aria-label="رمز التحقق من العضوية"></div>
          <div><b>بطاقتك الرقمية</b><p class="muted">امسح الرمز للتحقق من صلاحية العضوية، أو اطبع البطاقة واحملها معك.</p>
            <div class="row-btns"><button type="button" class="btn btn-primary" data-print-card>{ic('printer')}طباعة البطاقة</button>
            <a class="btn btn-soft" data-verify-link href="verify.html" target="_blank" rel="noopener">{ic('shield')}صفحة التحقق</a></div>
            <p class="vcode">رمز التحقق: <code dir="ltr" data-me="vcode"></code></p></div>
        </div>
        <div class="next-step" data-next></div>
        <div class="ov-grid">
          <button type="button" class="ov" data-go="notifications">{ic('send')}<b data-count="unread">0</b><span>إشعارات غير مقروءة</span></button>
          <button type="button" class="ov" data-go="payments">{ic('coins')}<b data-count="payments">0</b><span>دفعات مسجّلة</span></button>
          <button type="button" class="ov" data-go="violations">{ic('shield')}<b data-count="violations">0</b><span>ملاحظات مفتوحة</span></button>
          <button type="button" class="ov" data-go="events">{ic('calendar')}<b data-count="events">0</b><span>نشاطاً قادماً</span></button>
        </div>
        <div class="grid g2 pt-rights">
          <article class="card"><h3>{L(230)}</h3><ul class="list">{rights}</ul></article>
          <article class="card"><h3>{L(231)}</h3><ul class="list diamond">{duties}</ul></article>
        </div>
      </section>

      <!-- application -->
      <section class="pt-panel" data-panel="application" hidden>
        <div class="pt-head"><h2>استمارة طلب العضوية</h2><span class="st-badge" data-me="status"></span></div>
        <p class="pt-lock" data-app-lock hidden>{ic('shield')}تم اعتماد طلبك، لذلك أصبحت بيانات الهوية مقفلة. لتعديلها تواصل مع الإدارة.</p>
        <form class="pt-form app-form" data-form="application">
          <fieldset><legend><span class="step">1</span> البيانات الشخصية</legend><div class="fgrid">
            <label class="fld"><span>الاسم الكامل *</span><input name="full_name" required minlength="5"></label>
            <label class="fld"><span>الجنسية *</span><input name="nationality" required></label>
            <label class="fld"><span>رقم الهوية / الإقامة *</span><input name="id_number" required dir="ltr"></label>
            <label class="fld"><span>تاريخ الميلاد *</span><input name="birth_date" type="date" required dir="ltr"></label>
            <label class="fld"><span>رقم الجوال (مع رمز الدولة) *</span><input name="phone" type="tel" required dir="ltr" placeholder="+90 5xx xxx xx xx"></label>
            <label class="fld"><span>نوع الإقامة في تركيا *</span><select name="residence_status" required><option value="">— اختر —</option><option>مواطن تركي</option><option>إقامة قانونية سارية</option><option>حماية مؤقتة</option><option>أخرى</option></select></label>
          </div></fieldset>
          <fieldset><legend><span class="step">2</span> العنوان والعمل</legend><div class="fgrid">
            <label class="fld"><span>المدينة / الولاية *</span><input name="city" required></label>
            <label class="fld"><span>العنوان</span><input name="address"></label>
            <label class="fld"><span>المهنة *</span><input name="occupation" required></label>
            <label class="fld"><span>المؤهل العلمي</span><input name="education"></label>
            <label class="fld full"><span>المهارات والخبرات</span><textarea name="skills" rows="3"></textarea></label>
          </div></fieldset>
          <fieldset><legend><span class="step">3</span> مجالات المشاركة</legend><div class="picks">{depts}</div></fieldset>
          <fieldset><legend><span class="step">4</span> الإقرار</legend>
            <p class="muted">{L(185)}<br>{L(186)}</p>
            <label class="agree"><input type="checkbox" name="agree" required><span>{L(236)}</span></label>
          </fieldset>
          <div class="factions"><button class="btn btn-gold btn-lg" type="submit">{ic('send')}إرسال الطلب</button></div>
        </form>
      </section>

      <!-- payments -->
      <section class="pt-panel" data-panel="payments" hidden>
        <div class="pt-head"><h2>الاشتراكات والدفع</h2></div>
        <div class="pay-grid">
          <article class="pay-fee">
            <span class="kicker">الاشتراك السنوي</span>
            <b class="fee" data-set="fee">—</b>
            <dl class="bank">
              <div><dt>البنك</dt><dd data-set="bank_name">—</dd></div>
              <div><dt>اسم الحساب</dt><dd data-set="account_holder">—</dd></div>
              <div><dt>IBAN</dt><dd dir="ltr" data-set="iban">—</dd><button type="button" class="icon-btn" data-copy-iban aria-label="نسخ">{ic('file')}</button></div>
            </dl>
            <p class="muted" data-set="payment_note"></p>
          </article>
          <form class="pt-form pay-form" data-form="payment">
            <h3>{ic('coins')} رفع إيصال الدفع</h3>
            <div class="fgrid">
              <label class="fld"><span>المبلغ *</span><input name="amount" type="number" min="1" step="0.01" required dir="ltr"></label>
              <label class="fld"><span>العملة</span><select name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select></label>
              <label class="fld"><span>تاريخ الدفع *</span><input name="paid_on" type="date" required dir="ltr"></label>
              <label class="fld"><span>طريقة الدفع</span><select name="method"><option value="bank_transfer">تحويل بنكي</option><option value="cash">نقداً في مقر الجمعية</option><option value="other">أخرى</option></select></label>
              <label class="fld full"><span>رقم العملية / المرجع</span><input name="reference" dir="ltr"></label>
              <label class="fld full drop"><span>صورة الإيصال (JPG / PNG / PDF — حتى 5MB)</span><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>
            </div>
            <button class="btn btn-gold btn-lg" type="submit">{ic('send')}إرسال للمراجعة</button>
          </form>
        </div>
        <h3 class="pt-sub">سجلّ الدفعات</h3>
        <div class="table-wrap"><table class="rt pt-table"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th><th>الفترة</th><th>ملاحظة</th></tr></thead><tbody data-list="payments"></tbody></table></div>
      </section>

      <!-- notifications -->
      <section class="pt-panel" data-panel="notifications" hidden>
        <div class="pt-head"><h2>الإشعارات</h2><button type="button" class="btn btn-soft" data-read-all>{ic('check')}تعليم الكل كمقروء</button></div>
        <div class="nt-list" data-list="notifications"></div>
      </section>

      <!-- events -->
      <section class="pt-panel" data-panel="events" hidden>
        <div class="pt-head"><h2>الأنشطة والفعاليات</h2></div>
        <div class="ev-stats">
          <div><b data-ev="upcoming">0</b><span>تسجيلاتي القادمة</span></div>
          <div><b data-ev="attended">0</b><span>نشاطاً حضرته</span></div>
          <div><b data-ev="hours">0</b><span>ساعة تطوعية</span></div>
        </div>
        <h3 class="pt-sub">الأنشطة القادمة</h3>
        <div class="ev-list" data-list="events-up"></div>
        <h3 class="pt-sub">سجلّ مشاركاتي</h3>
        <div class="ev-list" data-list="events-past"></div>
      </section>

      <!-- requests -->
      <section class="pt-panel" data-panel="requests" hidden>
        <div class="pt-head"><h2>طلباتي ومراسلاتي</h2></div>
        <form class="pt-form card" data-form="request">
          <h3>{ic('send')} طلب أو رسالة جديدة إلى الإدارة</h3>
          <div class="fgrid">
            <label class="fld"><span>نوع الطلب *</span><select name="kind" required><option value="certificate">طلب شهادة عضوية</option><option value="data_change">تعديل بيانات</option><option value="suggestion">اقتراح</option><option value="complaint">شكوى</option><option value="other">أخرى</option></select></label>
            <label class="fld"><span>الموضوع *</span><input name="subject" required minlength="3" maxlength="200"></label>
            <label class="fld full"><span>التفاصيل *</span><textarea name="body" rows="4" required minlength="3" maxlength="4000"></textarea></label>
          </div>
          <button class="btn btn-gold" type="submit">{ic('send')}إرسال</button>
        </form>
        <h3 class="pt-sub">طلباتي السابقة</h3>
        <div class="rq-list" data-list="requests"></div>
      </section>

      <!-- violations -->
      <section class="pt-panel" data-panel="violations" hidden>
        <div class="pt-head"><h2>الملاحظات والمخالفات</h2></div>
        <p class="muted">{L(239)}</p>
        <div class="vl-list" data-list="violations"></div>
      </section>

      <!-- profile -->
      <section class="pt-panel" data-panel="profile" hidden>
        <div class="pt-head"><h2>بياناتي</h2></div>
        <form class="pt-form card av-form" data-form="avatar">
          <span class="av-preview" data-me="photo"></span>
          <div><h3>الصورة الشخصية</h3><p class="muted">تظهر على بطاقة العضوية فقط (JPG / PNG — حتى 2MB).</p>
          <label class="btn btn-soft av-pick">{ic('download')}اختيار صورة<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" hidden></label></div>
        </form>
        <div class="grid g2">
          <form class="pt-form card" data-form="contact">
            <h3>بيانات التواصل</h3>
            <label class="fld"><span>رقم الجوال</span><input name="phone" type="tel" dir="ltr"></label>
            <label class="fld"><span>المدينة / الولاية</span><input name="city"></label>
            <label class="fld"><span>العنوان</span><input name="address"></label>
            <button class="btn btn-primary" type="submit">{ic('check')}حفظ</button>
          </form>
          <form class="pt-form card" data-form="password">
            <h3>تغيير كلمة المرور</h3>
            <label class="fld"><span>كلمة المرور الجديدة</span><input name="password" type="password" minlength="8" required autocomplete="new-password" dir="ltr"></label>
            <button class="btn btn-primary" type="submit">{ic('shield')}تحديث</button>
          </form>
        </div>
      </section>
    </div>
  </div>
</div></section>
{print_templates()}'''
    page('portal.html', 'بوابة الأعضاء', body, L(184), css=('css/portal.css',), js=('js/vendor/supabase.js', 'js/vendor/qrcode.js', 'js/sb.js', 'js/portal.js'))


def print_templates():
    """Printable receipt + member card, filled in by sb.js (labels go through the normal translation)."""
    org = L(501).split('  |  ')[0]
    return f'''<template data-tpl="receipt"><div class="ps-receipt">
  <header><img src="assets/logo.png" alt="" width="70" height="70"><div><b>{org}</b><small>بوابة الأعضاء</small></div>
    <div class="ps-title"><b>سند قبض</b><span>رقم السند: <i data-r="no"></i></span></div></header>
  <dl>
    <div><dt>استلمنا من</dt><dd data-r="name"></dd></div>
    <div><dt>رقم العضوية</dt><dd data-r="member"></dd></div>
    <div><dt>المبلغ</dt><dd data-r="amount" class="ps-amount"></dd></div>
    <div><dt>طريقة الدفع</dt><dd data-r="method"></dd></div>
    <div><dt>تاريخ الدفع</dt><dd data-r="paid"></dd></div>
    <div><dt>رقم العملية / المرجع</dt><dd data-r="ref"></dd></div>
    <div class="ps-wide"><dt>وذلك عن</dt><dd>اشتراك العضوية السنوي للفترة من <b data-r="from"></b> إلى <b data-r="to"></b></dd></div>
  </dl>
  <footer><span>تاريخ الإصدار: <i data-r="issued"></i></span><span>صدر هذا السند إلكترونياً من بوابة أعضاء الجمعية.</span></footer>
</div></template>
<template data-tpl="card"><div class="ps-card">
  <div class="mcard ps-mcard">
    <div class="mcard-top"><img src="assets/logo.png" alt="" width="56" height="56"><div><b>بطاقة العضوية</b><small>{org}</small></div></div>
    <div class="mcard-id"><span class="mcard-photo" data-r="photo"></span><div class="mcard-name" data-r="name"></div></div>
    <div class="mcard-grid">
      <div><small>رقم العضوية</small><b data-r="no"></b></div>
      <div><small>تاريخ الانضمام</small><b data-r="joined"></b></div>
      <div><small>تنتهي في</small><b data-r="expires"></b></div>
    </div>
    <div class="ps-qr" data-r="qr"></div>
    <p class="ps-code">رمز التحقق: <code dir="ltr" data-r="code"></code></p>
  </div>
  <p class="ps-note">امسح الرمز للتحقق من صلاحية العضوية.</p>
</div></template>'''


def build_verify():
    body = f'''
<section class="hero hero-small has-photo portal-hero">
  <div class="hero-bg" aria-hidden="true"></div>{photo_layer('hands')}
  <div class="wrap hero-grid"><div class="hero-copy">
    {crumbs('التحقق من العضوية')}
    <h1 class="rv hero-title">التحقق من العضوية</h1>
    <p class="sub rv">امسح الرمز الموجود على بطاقة العضو، أو أدخل رقم العضوية ورمز التحقق.</p>
  </div></div>
</section>
<section class="sec portal" data-verify><div class="wrap vf-wrap">
  <form class="pt-form card" data-form="verify">
    <div class="fgrid">
      <label class="fld"><span>رقم العضوية</span><input name="n" inputmode="numeric" pattern="[0-9]+" required dir="ltr"></label>
      <label class="fld"><span>رمز التحقق</span><input name="c" required dir="ltr" autocomplete="off"></label>
    </div>
    <button class="btn btn-primary" type="submit">{ic('shield')}تحقّق</button>
  </form>
  <div class="vf-result" data-result aria-live="polite"></div>
  <p class="muted vf-fine">تعرض هذه الصفحة حالة العضوية فقط، ولا تعرض أي بيانات شخصية للعضو.</p>
</div></section>'''
    page('verify.html', 'التحقق من العضوية', body, L(184), css=('css/portal.css',), js=('js/vendor/supabase.js', 'js/sb.js', 'js/verify.js'))


# ============================================================= ADMIN ===
def build_admin():
    if core.LANG != 'ar':  # the association's staff panel is Arabic only
        return
    tab = lambda k, i, t: f'<button type="button" class="pt-tab" data-tab="{k}">{ic(i)}<span>{t}</span><b class="pt-badge" data-badge="{k}" hidden></b></button>'
    body = f'''
<section class="hero hero-small has-photo portal-hero">
  <div class="hero-bg" aria-hidden="true"></div>{photo_layer('board')}
  <div class="wrap hero-grid"><div class="hero-copy">
    {crumbs('لوحة الإدارة')}
    <h1 class="rv hero-title">لوحة إدارة العضوية</h1>
    <p class="sub rv">مراجعة الطلبات، وتأكيد الاشتراكات، ومتابعة الأعضاء والمخالفات والإشعارات.</p>
  </div></div>
</section>
<section class="sec portal" data-admin><div class="wrap">
  <div class="pt-loading" data-view="loading"><span class="spin"></span></div>
  <div class="pt-denied card" data-view="denied" hidden>{ic('shield')}<h2>هذه الصفحة لمسؤولي الجمعية فقط</h2>
    <p>سجّل الدخول بحساب له صلاحية الإدارة من <a href="portal.html">بوابة الأعضاء</a>.</p></div>
  <div class="pt-app" data-view="app" hidden>
    <nav class="pt-side" aria-label="الإدارة">
      <div class="pt-me"><span class="pt-avatar" data-me="initial"></span><div><b data-me="name"></b><small>مسؤول</small></div></div>
      {tab('stats', 'chart', 'الإحصاءات')}
      {tab('applications', 'file', 'طلبات العضوية')}
      {tab('members', 'users', 'الأعضاء')}
      {tab('payments', 'coins', 'المدفوعات')}
      {tab('events', 'calendar', 'الأنشطة')}
      {tab('requests', 'file', 'طلبات الأعضاء')}
      {tab('violations', 'shield', 'المخالفات')}
      {tab('notify', 'send', 'إرسال إشعار')}
      {tab('settings', 'wrench', 'الإعدادات')}
      <a class="pt-tab" href="portal.html">{ic('home')}<span>حسابي</span></a>
    </nav>
    <div class="pt-main">
      <section class="pt-panel" data-panel="stats">
        <div class="pt-head"><h2>الإحصاءات</h2><button type="button" class="btn btn-soft" data-refresh>{ic('refresh')}تحديث</button></div>
        <div class="kpis" data-kpis></div>
        <h3 class="pt-sub">عضويات تنتهي خلال 30 يوماً</h3>
        <div class="table-wrap"><table class="rt pt-table"><thead><tr><th>العضو</th><th>رقم العضوية</th><th>تنتهي في</th><th></th></tr></thead><tbody data-list="expiring"></tbody></table></div>
        <h3 class="pt-sub">التقارير</h3>
        <div class="rp-grid" data-reports></div>
      </section>
      <section class="pt-panel" data-panel="applications" hidden>
        <div class="pt-head"><h2>طلبات العضوية الجديدة</h2></div>
        <div class="ad-cards" data-list="applications"></div>
      </section>
      <section class="pt-panel" data-panel="members" hidden>
        <div class="pt-head"><h2>الأعضاء</h2>
          <div class="ad-filters"><input type="search" placeholder="بحث بالاسم أو الرقم أو البريد" data-q>
          <select data-status><option value="">كل الحالات</option><option value="pending">قيد المراجعة</option><option value="approved">مقبول – بانتظار الدفع</option><option value="active">فعّال</option><option value="expired">منتهية</option><option value="suspended">معلّق</option><option value="rejected">مرفوض</option></select>
          <button type="button" class="btn btn-soft" data-export>{ic('download')}تصدير CSV</button></div></div>
        <div class="table-wrap"><table class="rt pt-table"><thead><tr><th>رقم</th><th>الاسم</th><th>الجوال</th><th>الحالة</th><th>الانضمام</th><th>الانتهاء</th></tr></thead><tbody data-list="members"></tbody></table></div>
      </section>
      <section class="pt-panel" data-panel="payments" hidden>
        <div class="pt-head"><h2>المدفوعات</h2>
          <div class="ad-filters"><select data-pay-status><option value="pending">بانتظار التأكيد</option><option value="approved">مؤكدة</option><option value="rejected">مرفوضة</option><option value="">الكل</option></select></div></div>
        <div class="table-wrap"><table class="rt pt-table"><thead><tr><th>العضو</th><th>المبلغ</th><th>تاريخ الدفع</th><th>الطريقة / المرجع</th><th>الإيصال</th><th>الحالة</th><th></th></tr></thead><tbody data-list="payments"></tbody></table></div>
      </section>
      <section class="pt-panel" data-panel="violations" hidden>
        <div class="pt-head"><h2>الملاحظات والمخالفات</h2></div>
        <div class="vl-list" data-list="violations"></div>
      </section>
      <section class="pt-panel" data-panel="events" hidden>
        <div class="pt-head"><h2>الأنشطة والفعاليات</h2></div>
        <form class="pt-form card" data-form="event">
          <h3>{ic('calendar')} إضافة نشاط جديد</h3>
          <div class="fgrid">
            <label class="fld full"><span>عنوان النشاط *</span><input name="title" required minlength="3" maxlength="200"></label>
            <label class="fld"><span>البداية *</span><input name="starts_at" type="datetime-local" required dir="ltr"></label>
            <label class="fld"><span>النهاية</span><input name="ends_at" type="datetime-local" dir="ltr"></label>
            <label class="fld"><span>المكان</span><input name="place"></label>
            <label class="fld"><span>عدد المقاعد (فارغ = غير محدود)</span><input name="capacity" type="number" min="1" dir="ltr"></label>
            <label class="fld"><span>الساعات التطوعية المحتسبة</span><input name="hours" type="number" min="0" step="0.5" value="0" dir="ltr"></label>
            <label class="fld full"><span>الوصف</span><textarea name="description" rows="3"></textarea></label>
            <label class="agree full"><input type="checkbox" name="announce" checked><span>إرسال إشعار بالنشاط لجميع الأعضاء</span></label>
          </div>
          <button class="btn btn-gold" type="submit">{ic('check')}إضافة النشاط</button>
        </form>
        <div class="table-wrap"><table class="rt pt-table"><thead><tr><th>النشاط</th><th>الموعد</th><th>المسجّلون</th><th>الحالة</th><th></th></tr></thead><tbody data-list="events"></tbody></table></div>
      </section>
      <section class="pt-panel" data-panel="requests" hidden>
        <div class="pt-head"><h2>طلبات ومراسلات الأعضاء</h2>
          <div class="ad-filters"><select data-rq-status><option value="open">قيد المتابعة</option><option value="answered">تم الرد</option><option value="closed">مغلقة</option><option value="">الكل</option></select></div></div>
        <div class="rq-list" data-list="requests"></div>
      </section>
      <section class="pt-panel" data-panel="notify" hidden>
        <div class="pt-head"><h2>إرسال إشعار</h2></div>
        <form class="pt-form card" data-form="notify">
          <label class="fld"><span>إلى</span><select name="to"><option value="">جميع الأعضاء</option></select></label>
          <label class="fld"><span>العنوان *</span><input name="title" required maxlength="120"></label>
          <label class="fld"><span>النص</span><textarea name="body" rows="4" maxlength="2000"></textarea></label>
          <button class="btn btn-gold" type="submit">{ic('send')}إرسال</button>
        </form>
      </section>
      <section class="pt-panel" data-panel="settings" hidden>
        <div class="pt-head"><h2>إعدادات الاشتراك والدفع</h2></div>
        <form class="pt-form card" data-form="settings"><div class="fgrid">
          <label class="fld"><span>قيمة الاشتراك السنوي</span><input name="annual_fee" type="number" min="0" step="0.01" dir="ltr"></label>
          <label class="fld"><span>العملة</span><select name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select></label>
          <label class="fld"><span>اسم البنك</span><input name="bank_name"></label>
          <label class="fld"><span>اسم صاحب الحساب</span><input name="account_holder"></label>
          <label class="fld full"><span>IBAN</span><input name="iban" dir="ltr"></label>
          <label class="fld full"><span>ملاحظة تظهر للأعضاء</span><textarea name="payment_note" rows="2"></textarea></label>
        </div><button class="btn btn-primary" type="submit">{ic('check')}حفظ الإعدادات</button></form>
      </section>
    </div>
  </div>
</div></section>
<dialog class="ad-drawer" data-drawer><div class="ad-drawer-in" data-drawer-body></div></dialog>
{print_templates()}'''
    page('admin.html', 'لوحة الإدارة', body, L(170), css=('css/portal.css',), js=('js/vendor/supabase.js', 'js/vendor/qrcode.js', 'js/sb.js', 'js/admin.js'))


def build_pages():
    build_portal()
    build_verify()
    build_admin()
    build_transparency()
    build_home()
    build_about()
    build_initiatives()
    build_expansion()
    build_governance()
    build_join()
    build_faq()
    build_404()
    build_support()
