"""Home (the landing page): simple, in plain words, and it shows everything Yanabee does.

The owner asked for a landing page that explains the project in its own words rather than pasting the book.
So every block below is written here (Arabic, plain) from a reading of the two documents; no new facts, numbers
or names are introduced. The document's own wording stays one tap away: the team cards open a sheet with the
document's text, the detail pages carry it verbatim, and the last block of this page folds the vision, mission,
goal, growth phases and impact index exactly as written (so nothing in the document is lost).
"""
import html as _html
import json

import art
import wow_gallery
import wow_story
from core import PLATFORM as P, TEAM_IDS, btn, cta, ic, logo, page, short, strip_colon, t


def _title_html():
    h = t(P.meta['title'])  # 'مشروع «ينابيع»'
    return h.replace('«ينابيع»', '<span class="brand-word">«ينابيع»</span>')


def hero():
    dots = ''.join(f'<i style="--c:var(--{tid})"></i>' for tid in TEAM_IDS)
    streams = json.dumps([{'t': tid, 'name': short(P['s2'][tid].title), 'href': f'teams.html#{tid}'} for tid in TEAM_IDS],
                         ensure_ascii=False)  # the seven streams of the hero canvas are the seven teams
    return f'''
<section class="hero hero-home">
  <canvas class="water" data-water aria-hidden="true"></canvas>
  <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
  <div class="hero-art" aria-hidden="true">{art.home_band('hb')}</div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <a class="eyebrow team-dots rv" href="teams.html"><span class="dots" aria-hidden="true">{dots}</span>سبعة مجالات لكل اهتمام{ic('arrow-left')}</a>
      <h1 class="rv">{_title_html()}</h1>
      <p class="hero-sub rv">منصة وطنية تجمع الأطفال والشباب في فرق صغيرة تتنافس في تحديات حقيقية تخدم الناس، بدل أن يقضوا وقتهم وحدهم أمام الشاشات.</p>
      <div class="btns rv">
        {btn('teams.html', 'اكتشف الفرق السبع', 'users')}
        {btn('learn.html', 'جرّب بنفسك', 'trophy', 'btn-ghost')}
      </div>
    </div>
    <div class="hero-visual" aria-hidden="true">
      <canvas class="springs" data-springs data-teams="{_html.escape(streams, quote=True)}"></canvas>
      <p class="stream-hint">اضغط على أي نبع لتستكشف فريقه</p>
      <div class="spring-core">{logo(64, 'core', 'core-logo')}</div>
    </div>
  </div>
  <a class="scroll-cue" href="#how" aria-label="انتقل إلى كيف يعمل ينابيع">{ic('chevron-down')}</a>
</section>'''


def _head(icon, kicker, title, sub=''):
    s = f'<p class="sec-sub">{t(sub)}</p>' if sub else ''
    return (f'<header class="sec-head rv"><div><span class="kicker">{ic(icon)}{t(kicker)}</span>'
            f'<h2>{t(title)}</h2>{s}</div></header>')


def how():
    steps = (
        ('users', 'سجّل فريقك', 'خمسة أو سبعة أعضاء يختارون مجالهم من المجالات السبعة ويسجّلون فريقهم في تطبيق «ينابيع».'),
        ('flag', 'تحدٍّ جديد كل أسبوع', 'يصل الفريق تحدٍّ ميداني عبر التطبيق، وكثير منها يلبّي حاجة حقيقية عند جمعية أو مدرسة أو حي.'),
        ('hand-heart', 'نفّذوه في الميدان', 'يعمل الفريق معاً على الأرض، ويرافقه قائد شاب من الأقران يوجّهه تحت إشراف موجّه إقليمي.'),
        ('trophy', 'نقاط وتقدّم', 'يرصد التطبيق النقاط تلقائياً، فتكون المنافسة عادلة، ويظهر القادة الموهوبون ليتأهلوا لقيادة مبادرات أكبر.'),
    )
    cards = ''.join(
        f'<li class="how-step rv"><span class="how-n" aria-hidden="true">{i}</span><span class="how-ic">{ic(icn)}</span>'
        f'<h3>{t(h)}</h3><p>{t(p)}</p></li>'
        for i, (icn, h, p) in enumerate(steps, 1))
    return f'''
<section class="sec how" id="how">
  <div class="wrap">
    {_head('route', 'كيف يعمل', 'من التسجيل إلى الأثر، في أربع خطوات')}
    <ol class="how-grid" data-stagger>{cards}</ol>
  </div>
</section>'''


def teams():
    s2 = P['s2']
    return f'''
<section class="sec band teams-home" id="teams">
  <div class="wrap">
    {_head('users', 'الفرق', 'سبعة مجالات، وفريق لكل اهتمام', 'اسحب البطاقات يميناً ويساراً، واضغط على أي فريق لترى ما يفعله وأثره عليك وعلى أسرتك وعلى مجتمعك.')}
    {wow_gallery.gallery()}
    <noscript><p class="sec-sub">{t(s2.paras[0])}</p></noscript>
  </div>
</section>'''


def behind():
    cards = (
        ('landmark', 'قيادة وطنية، وتنفيذ محلي',
         'مجلس أعلى يضع السياسات ويفتح الطريق بين المدارس ومراكز الشباب والمساجد والجمعيات. أما العمل فيجري في كل منطقة وبأيدي أهلها.', 'sky'),
        ('users', 'قادة من الأقران',
         'يُدرَّب طلاب الجامعة والثانوية ليقودوا من هم أصغر منهم، ومن يتميّز منهم يدخل برنامجاً لإعداد القادة بمنح تدريبية ورعاية خاصة.', 't1'),
        ('coins', 'تمويل مدروس',
         'نحو 60% من إعادة توجيه ميزانيات أنشطة قائمة في الوزارات، و30% من شراكات الشركات، و10% من المساهمات الأهلية. والمصروفات الميدانية لا تُسوّى إلا بإثبات إنجاز التحدي.', 'sun'),
        ('shield', 'للجميع وبأمان',
         'مسارات لذوي الإعاقة، ووصول إلى القرى والمناطق النائية، ودعم نفسي وتربوي لمن يعاني العزلة. وفي المقابل حماية صارمة لبيانات الأطفال وصورهم، وتأمين صحي، ولا مكان لأي نشاط حزبي.', 't5'),
        ('handshake', 'يكمّل ولا يزاحم',
         'يتعاون مع مراكز الشباب والأندية والجمعيات والكشافة بدل أن ينافسها، فتزداد حركتها ويستفيد الجميع.', 't7'),
        ('megaphone', 'يصل إلى الجميع',
         'حملة «فريقك سر قوتك» في المدارس والجامعات، ورسائل طمأنة لأولياء الأمور، وتغطية إعلامية تُبرز كيف يتغيّر سلوك الشباب.', 't3'),
    )
    items = ''.join(
        f'<li class="pl-card rv" style="--sc:var(--{c})"><span class="pl-ic">{ic(icn)}</span><h3>{t(h)}</h3><p>{t(p)}</p></li>'
        for icn, h, p, c in cards)
    return f'''
<section class="sec behind" id="behind">
  <div class="wrap">
    {_head('layers', 'ما وراءه', 'ما الذي يقف وراء الفرق؟')}
    <ul class="pl-grid" data-stagger>{items}</ul>
    <p class="more-link rv"><a href="operations.html">{ic('arrow-left')}<span>التفاصيل: التشغيل والحوكمة والتمويل والمخاطر</span></a></p>
  </div>
</section>'''


def road():
    phases = (
        ('السنة الأولى', 'نبني المنصة الرقمية', 'نبدأ مع 30% من استيعاب المراكز والمدارس، ونطلق رخصة المشرف وقائد الفريق.', ''),
        ('السنة الثانية', 'نتوسّع في المحافظات', 'تنتشر المسابقات، ونؤهّل 1,000 قائد موهوب، وننفّذ 100 مبادرة مجتمعية وبيئية.',
         '<div class="road-nums"><span><b data-to="1000">1,000</b> قائد موهوب</span><span><b data-to="100">100</b> مبادرة</span></div>'),
        ('من السنة الثالثة', 'نثبّت التجربة', 'تدخل المناهج إلى الجامعات، ويصبح الخريجون وقادة الفرق موجّهين وقادة إقليميين، ويتحول «وسام ينابيع الوطن» إلى برنامج سنوي ثابت.', ''),
    )
    items = ''.join(
        f'<li class="road-step rv" style="--i:{i}"><span class="road-dot" aria-hidden="true"><i></i></span>'
        f'<small>{t(when)}</small><h3>{t(h)}</h3><p>{t(p)}</p>{extra}</li>'
        for i, (when, h, p, extra) in enumerate(phases, 1))
    return f'''
<section class="sec band road" id="road">
  <div class="wrap">
    {_head('chart', 'إلى أين', 'ثلاث مراحل نحو برنامج وطني دائم')}
    <ol class="road-grid" data-stagger>{items}</ol>
    <div class="measure rv">
      <span class="measure-ic">{ic('gauge')}</span>
      <p><b>كيف نعرف أن الأثر حقيقي؟</b> نعدّ الفرق المسجّلة والقادة المؤهَّلين وساعات التطوع والمشاريع المنجزة،
      ونسأل ولي الأمر والمعلم والمشرف عن الانضباط والتعاون وروح المبادرة وانخفاض ساعات استخدام الهاتف.</p>
    </div>
  </div>
</section>'''


def quran():
    return f'''
<section class="sec quran-home" id="quran">
  <div class="wrap">
    <div class="q-card rv">
      <div class="q-copy">
        <span class="kicker">{ic('book-open')}مبادرة داخل ينابيع</span>
        <h2>«حفظ، فهم، تطبيق»</h2>
        <p>مبادرة خاصة بفرق القرآن الكريم: يحفظ الفريق، ثم يفهم المعنى، ثم يحوّل ما تعلّمه إلى سلوك يراه الناس في الشارع والمدرسة والبيت.</p>
        <div class="btns">{btn('quran.html', 'اكتشف المبادرة', 'arrow-left', 'btn-primary btn-emerald')}</div>
      </div>
      <div class="q-words" aria-hidden="true"><b>حفظ</b><b>فهم</b><b>تطبيق</b></div>
    </div>
  </div>
</section>'''


def try_it():
    return f'''
<section class="sec try" id="try">
  <div class="wrap">
    {_head('lightbulb', 'جرّب', 'افهمه باللعب')}
    <div class="try-grid" data-stagger>
      <a class="try-card rv" href="learn.html" style="--sc:var(--sun)"><span class="try-ic">{ic('trophy')}</span><h3>تعلّم والعب</h3>
        <p>اختبارات وألعاب ذاكرة وبطاقات تعرّفك على الفرق والمحاور، وجواز تجمع فيه الينابيع السبعة.</p><span class="try-go">ابدأ{ic('arrow-left')}</span></a>
      <a class="try-card rv" href="lab.html" style="--sc:var(--sky)"><span class="try-ic">{ic('compass')}</span><h3>مختبر ينابيع</h3>
        <p>نموذج تجريبي: أسّس فريقاً وأنجز تحديات أسبوعية، أو أدِر موسماً كاملاً كمشرف إقليمي.</p><span class="try-go">ادخل المختبر{ic('arrow-left')}</span></a>
      <button type="button" class="try-card rv" data-open-chat style="--sc:var(--accent)"><span class="try-ic">{ic('message')}</span><h3>اسأل المساعد</h3>
        <p>اسأل عن أي تفصيل، وسيجيبك مما ورد في وثائق المشروع.</p><span class="try-go">اسأل{ic('arrow-left')}</span></button>
    </div>
  </div>
</section>'''


def document():
    """The document's own wording, folded: the vision/mission/goal and the growth phases and impact index, verbatim."""
    s1, s5, s9 = P['s1'], P['s5'], P['s9']
    v, m, g = s1['vision'], s1['mission'], s1['goal']
    goals = ''.join(f'<li>{t(it.text)}</li>' for it in g.items)
    ph, im = s9['phases'], s9['impact']
    phases = ''.join(f'<li>{t(it.text)}</li>' for it in ph.items)
    impact = ''.join(f'<li>{t(it.text)}</li>' for it in im.items)
    sub = P.meta['subtitle'].strip('()')
    return f'''
<section class="sec doc-sec" id="doc">
  <div class="wrap">
    <details class="doc rv">
      <summary><span class="doc-ic">{ic('file-text')}</span><span><b>من الوثيقة كما كُتبت</b><small>{t(P.meta['title'])} — {t(sub)}</small></span><span class="doc-chev">{ic('chevron-down')}</span></summary>
      <div class="doc-body">
        <h3>{t(s1.title)}</h3>
        <h4>{t(v.title)}</h4><p>{t(v.paras[0])}</p>
        <h4>{t(m.title)}</h4><p>{t(m.paras[0])}</p>
        <h4>{t(g.title)}</h4><ul>{goals}</ul>
        <h3>{t(s5.title)}</h3><p>{t(s5.paras[0])}</p>
        <h3>{t(s9.title)}</h3>
        <h4>{t(strip_colon(ph.title))}</h4><ul>{phases}</ul>
        <h4>{t(strip_colon(im.title))}</h4><ul>{impact}</ul>
      </div>
    </details>
  </div>
</section>'''


# Opening scene (once per browser session, home page only; see js/intro.js, css/intro.css).
# `?intro` in the URL replays it (and is the only way to see it under browser automation, so the test suites
# that drive the home page are not held up by it). It is skipped when you arrive from another page of the site.
INTRO_HEAD = ("<script>(function(){try{var d=document.documentElement,q=location.search.indexOf('intro')>-1,"
              "s=!q&&location.origin!=='null'&&document.referrer.indexOf(location.origin+'/')===0;"
              "if(s){sessionStorage.setItem('yb-intro','1')}else if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&(q||(!navigator.webdriver&&!sessionStorage.getItem('yb-intro')&&!location.hash))){"
              "d.classList.add('intro-on');setTimeout(function(){d.classList.remove('intro-on')},2600)}}catch(e){}})();</script>")
INTRO = f'''<div class="intro" id="intro" aria-hidden="true"><canvas class="intro-canvas"></canvas>
  <div class="intro-mark">{logo(84, 'intro', 'intro-logo')}</div><div class="intro-word">ينابيع</div></div>
'''


def build():
    body = (INTRO + hero() + wow_story.story() + how() + teams() + behind() + road() + quran() + try_it() + document()
            + cta(t(P.meta['title']), 'اسأل المساعد عن أي تفصيل، أو ابحث في الفرق والمحاور والمؤشرات.',
                  f'<button type="button" class="btn btn-primary" data-open-chat>{ic("sparkles")}<span>اسأل مساعد ينابيع</span></button>'
                  f'<button type="button" class="btn btn-ghost" data-open-search>{ic("search")}<span>ابحث في الموقع</span></button>'))
    desc = 'منصة وطنية تجمع الأطفال والشباب في فرق صغيرة تتنافس في تحديات ميدانية تخدم المجتمع، في سبعة مجالات وتحت مظلة وطنية واحدة.'
    page('index.html', 'مشروع «ينابيع»', body, desc,
         css=('css/home.css', 'css/landing.css', 'css/water.css', 'css/story.css', 'css/gallery.css', 'css/intro.css'),
         js=('js/springs.js', 'js/water.js', 'js/story.js', 'js/gallery.js', 'js/intro.js'),
         head=INTRO_HEAD)
    return 'index.html'
