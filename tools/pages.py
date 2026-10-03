"""Page compositions for the Takamul site (home + inner pages + 404).
Uses the components and shell from core.py. See docs/ARCHITECTURE.md."""
from core import *  # noqa: F401,F403  (L, LS, ic, page, section, card, ...)
from core import D, SECTIONS, SEC_ICON, PAGE_LABEL


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
      <h1 class="rv">جمعية <span class="grad">تكامل</span><br>لبناء القيم والتنمية</h1>
      <p class="sub rv">{L(3)} — {L(8)}</p>
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

<section class="sec" id="hub">
  <div class="wrap">
    <div class="center"><span class="kicker rv">{L(1)}</span><h2 class="rv">كل ما تحتاجه في مكان واحد</h2></div>
    <div class="bento" style="margin-top:30px">
      <a class="tile t-dash rv" href="dashboard.html">
        <span class="ic big">{ic('chart')}</span>
        <h3>لوحة القيادة</h3>
        <p>رؤية الجمعية ومبادراتها وحوكمتها وخطة توسعها في لوحة تفاعلية واحدة.</p>
        <div class="dash-facts">
          <div><b data-to="2035">2035</b><span>{L(2)}</span></div>
          <div><b>2</b><span>{L(4)}: {L(5)}</span></div>
          <div><b>7</b><span>{L(6)} — {L(7)}</span></div>
        </div>
        <span class="go">افتح لوحة القيادة {ic('arrow-left')}</span>
      </a>
      <button type="button" class="tile t-search rv" data-open-palette>
        <span class="ic big">{ic('search')}</span>
        <h3>ابحث في الكتيب كله</h3>
        <p>اكتب أي كلمة وانتقل مباشرة إلى القسم أو الركيزة أو السؤال.</p>
        <span class="fake-search">{ic('search')}<span>مثال: منافع، الحوكمة، أنقرة…</span><kbd class="kbd-hint">⌘K</kbd></span>
      </button>
      <button type="button" class="tile t-ai rv" data-open-chat>
        <span class="ic big">{ic('sparkles')}</span>
        <h3>اسأل المساعد الذكي</h3>
        <p>إجابات فورية بالعربية من نص الكتيب التعريفي، مع روابط المصدر.</p>
        <span class="go">ابدأ المحادثة {ic('arrow-left')}</span>
      </button>
    </div>
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
    page('index.html', 'الرئيسية', body, L(10))


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
    page('about.html', 'من نحن', page_hero('about.html', [1, 2, 4]) + s1 + s2 + s4 + cta(), L(42))


# ========================================================= INITIATIVES ===
def build_initiatives():
    s3 = section(3, f'''<div class="grid g2">
      <article class="init-card tilt rv yanabee" id="s3-1"><span class="ic big">{ic('droplet')}</span>
        <h3>{L(76)}</h3><p class="focus">{L(77)}</p>{ul(LS(78, 81))}</article>
      <article class="init-card tilt rv manafea" id="s3-2"><span class="ic big">{ic('coins')}</span>
        <h3>{L(82)}</h3><p class="focus">{L(83)}</p>{ul(LS(84, 87), 'diamond')}</article>
    </div>
    {subhead(L(88), id='s3-3')}
    <div class="grid g4">{card(L(89), L(90), 'refresh')}{card(L(91), L(92), 'wrench')}{card(L(93), L(94), 'flask')}{card(L(95), L(96), 'scale')}</div>''',
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
    s5 = section(5, f'<div class="timeline"><span class="tl-fill" aria-hidden="true"></span><ol class="tl-list">{tl}</ol></div>', lead=f'{L(6)} — {L(7)}')
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
    <div class="grid g2">{card(L(223), L(224), 'scale')}{card(L(225), L(226), 'tree')}</div>''', alt=True)
    page('governance.html', 'الحوكمة والتمويل', page_hero('governance.html', [7, 8]) + s7 + s8 + cta(), L(170))


# ================================================================ JOIN ===
def pcard(num, title, sub, text, extra=''):
    return (f'<article class="card tilt rv pillar" id="p{num}"><div class="pillar-top"><span class="num">{num}</span>'
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


def build_pages():
    build_home()
    build_about()
    build_initiatives()
    build_expansion()
    build_governance()
    build_join()
    build_faq()
    build_404()
