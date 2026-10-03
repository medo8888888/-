"""Page compositions for the Takamul site (home + inner pages + 404).
Uses the components and shell from core.py. See docs/ARCHITECTURE.md."""
from core import *  # noqa: F401,F403  (L, LS, ic, page, section, card, ...)
import core
from core import D, SECTIONS, SEC_ICON, PAGE_LABEL, photo_layer, photo_strip, gallery


# ================================================================ HOME ===
def hero_name():
    if core.LANG == 'ar':
        return 'جمعية <span class="grad">تكامل</span><br>لبناء القيم والتنمية'
    return L(501).split('  |  ')[0].strip().replace('Takamul', '<span class="grad">Takamul</span>', 1)


def build_home():
    toc = ''.join(
        f'<a class="toc-item tilt rv" href="{sec_link(n)}" style="--sc:var(--c-{SECTIONS[n][4]})">'
        f'<span class="toc-num">{n}</span><span class="toc-ic">{ic(SEC_ICON[n])}</span>'
        f'<span class="toc-title">{t}</span><span class="toc-go">{ic("arrow-left")}</span></a>'
        for n, t in toc_items())
    stages = ''.join(
        f'<li class="rv"><span>{L(130 + 4 * i)}</span><b>{L(131 + 4 * i)}</b></li>' for i in range(7))
    body = f'''
<section class="hero hero-home has-photo">
  <div class="hero-bg" aria-hidden="true"></div>{photo_layer('istanbul')}
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <h1 class="rv">{hero_name()}</h1>
      <p class="sub rv">{L(3)} — {L(8)}</p>
    </div>
  </div>
  <a class="scroll-cue" href="#welcome" aria-label="انتقل للأسفل"><span></span></a>
</section>

<section class="impact-band"><div class="wrap">
  <div class="impact-grid">
    <div class="rv"><b data-to="2">2</b><span>{L(4)}</span></div>
    <div class="rv"><b data-to="8">8</b><span>برامج ميدانية</span></div>
    <div class="rv"><b data-to="5">5</b><span>{L(113).split('  ')[-1]}</span></div>
    <div class="rv"><b data-to="4">4</b><span>{L(158)}</span></div>
    <div class="rv"><b data-to="7">7</b><span>{L(6).split(' ',1)[1]} — {L(7)}</span></div>
  </div>
  <div class="impact-cta rv"><a class="btn btn-gold" href="support.html#donate">{ic('heart')}تبرع الآن</a><a class="btn btn-soft" href="support.html#volunteer">{ic('users')}تطوع معنا</a><a class="btn btn-soft" href="join.html#apply">{ic('check')}طلب العضوية</a></div>
</div></section>

<section class="sec photo-sec"><div class="wrap">
  <div class="center"><span class="kicker rv">{L(74)}</span><h2 class="rv">مجالات عملنا</h2></div>
  <div class="photo-band">
    <a class="ph rv" href="initiatives.html#s3-1" style="--img:url(../assets/img/classroom.jpg)"><span class="ph-tag">«ينابيع»</span><b>{L(77).split(':',1)[-1].strip()}</b></a>
    <a class="ph rv" href="initiatives.html#s3-2" style="--img:url(../assets/img/workshop.jpg)"><span class="ph-tag">«منافع»</span><b>{L(84)}</b></a>
    <a class="ph rv" href="support.html#programs" style="--img:url(../assets/img/bakery.jpg)"><span class="ph-tag">«منافع»</span><b>{L(86)}</b></a>
    <a class="ph rv" href="support.html#donate" style="--img:url(../assets/img/distribution.jpg)"><span class="ph-tag">التكافل</span><b>{L(87)}</b></a>
  </div>
  <p class="ph-note rv">صور تعبيرية</p>
</div></section>

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

<section class="gallery-sec">
  <div class="wrap center"><span class="kicker rv">{L(1)}</span><h2 class="rv">من أجواء عملنا</h2></div>
  {gallery()}
  <p class="ph-note">صور تعبيرية</p>
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
    page('join.html', 'العضوية', page_hero('join.html', [9, 12, 11]) + membership_form() + s9 + s12 + s11 + cta(), L(304), js=('js/join.js',))


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
    cards = ''.join(
        f'<article class="prog-card tilt rv {kind}" style="--img:url(../assets/img/{PHOTO_OF[n]}.jpg)"><span class="ic">{ic(icon)}</span>'
        f'<span class="prog-tag">{"«ينابيع»" if kind == "yanabee" else "«منافع»"}</span>'
        f'<p>{L(n)}</p><div class="prog-actions"><button type="button" class="btn btn-soft prog-btn" data-program="{L(n)}">{ic("heart")}ادعم هذا البرنامج</button>'
        f'<button type="button" class="icon-btn share-btn" data-share data-share-title="{L(n)}" data-share-url="support.html#programs" aria-label="مشاركة البرنامج">{ic("share")}</button></div></article>'
        for n, kind, icon in PROGRAMS)
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
  <div class="prog-grid">{cards}</div>
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


def build_pages():
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
