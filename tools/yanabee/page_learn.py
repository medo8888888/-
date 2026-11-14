"""learn.html — «تعلّم والعب»: games and learning tools made only from the site's own content.

Content strings (team names, 'طبيعة العمل', impact lines, KPIs, axes …) come from content.py through
quizdata.py (also embedded as data/quiz.js for the games) and are rendered with t()/plain().
Written here: UI chrome only (game titles, instructions, buttons, praise messages, question templates).
The static parts (passport stamps, the «أي فريق يشدّك؟» cards, the daily-card fallback) are server-rendered;
js/learn.js brings the games to life. Without JavaScript the page keeps those and a short notice.
"""
import quizdata
from core import (PLATFORM as P, QURAN as Q, TEAMS, btn, cta, ic, logo, page, plain, section, strip_colon, svg, t)

PAGE = 'learn.html'
LEARN = {x['id']: x for x in quizdata.teams_data()}
TIDS = list(TEAMS)

SECTIONS = [  # id, nav label, icon
    ('passport', 'جواز المستكشف', 'award'),
    ('match', 'لعبة الذاكرة', 'layers'),
    ('quiz', 'اختبار الينابيع', 'lightbulb'),
    ('cards', 'بطاقات المراجعة', 'book'),
    ('pick', 'أي فريق يشدّك؟', 'compass'),
]

LOCAL = {  # Lucide (ISC) icons that core.ICONS does not have
    'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    'shuffle': '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>',
    'rotate': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
    'timer': '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
}


def lic(name, cls='i'):
    return svg(LOCAL[name], cls) if name in LOCAL else ic(name, cls)


def tc(tid):
    return f'--tc:var(--{tid})'


# ------------------------------------------------------------------ hero ---
def daily_card():
    first = quizdata.daily_data()[0]
    return f'''
      <article class="ln-daily card" id="daily" aria-labelledby="daily-h">
        <header class="ln-daily-head">
          <span class="ln-daily-ic" aria-hidden="true">{ic('sparkles')}</span>
          <h2 id="daily-h">بطاقة اليوم</h2>
          <span class="ln-daily-date" data-daily-date></span>
        </header>
        <div class="ln-daily-body" aria-live="polite">
          <p class="ln-daily-k"><span data-daily-k>{t(first['k'])}</span><span data-daily-who></span></p>
          <p class="ln-daily-x" data-daily-x>{t(first['x'])}</p>
        </div>
        <footer class="ln-daily-foot">
          <a class="btn btn-soft" data-daily-link href="{first['h']}">{ic('book-open')}<span>اقرأ المصدر</span></a>
          <button type="button" class="btn btn-ghost ln-jsonly" data-daily-next>{lic('shuffle')}<span>بطاقة أخرى</span></button>
        </footer>
      </article>'''


def drops():
    """Seven decorative droplets in the team colours floating behind the daily card."""
    out = ''
    for k, tid in enumerate(TIDS):
        out += f'<i class="ln-drop" style="{tc(tid)};--k:{k}"></i>'
    return f'<div class="ln-drops" aria-hidden="true">{out}</div>'


def hero():
    visual = f'<div class="ln-visual rv">{drops()}{daily_card()}</div>'
    title = '<span class="ln-h1-a">تعلّم</span> <span class="ln-h1-b">والعب</span>'
    lead = 'ألعاب واختبارات وبطاقات مراجعة مصنوعة من نصوص المشروع نفسها: اجمع الينابيع السبعة، طابِق الفرق، واختبر ما تعرفه.'
    btns = (f'<a class="btn btn-primary" href="#quiz">{lic("play")}<span>ابدأ الاختبار</span></a>'
            f'<a class="btn btn-ghost" href="#passport">{ic("award")}<span>جواز المستكشف</span></a>')
    return f'''
<section class="hero hero-page has-visual ln-hero">
  <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow rv">{logo(22, 'eb-learn', 'eb-logo')}{t(P.meta['title'])}</span>
      <h1 class="rv">{title}</h1>
      <p class="hero-lead rv">{lead}</p>
      <div class="btns rv">{btns}</div>
    </div>
    {visual}
  </div>
</section>'''


def subnav():
    links = ''.join(f'<a href="#{i}">{ic(icon)}<span>{label}</span></a>' for i, label, icon in SECTIONS)
    return f'<nav class="ln-nav" data-spy aria-label="أقسام تعلّم والعب"><div class="ln-nav-in">{links}</div></nav>'


# -------------------------------------------------------------- passport ---
def passport():
    stamps = ''
    for tid in TIDS:
        x = LEARN[tid]
        stamps += (f'<li><a class="ln-stamp" data-team="{tid}" href="{x["href"]}" style="{tc(tid)}">'
                   f'<span class="ln-stamp-ic" aria-hidden="true">{ic(TEAMS[tid])}<i class="ln-stamp-ok">{ic("check")}</i></span>'
                   f'<b>{t(x["short"])}</b><span class="ln-stamp-s" data-state>لم يُجمع بعد</span></a></li>')
    body = f'''
    <div class="ln-pp rv">
      <div class="ln-pp-side">
        <div class="ln-pp-ring" data-pp-ring style="--v:0" role="img" aria-label="">
          <span class="ln-pp-n"><b data-pp-n>0</b><small>من 7</small></span>
        </div>
        <p class="ln-pp-hint">زُر كل فريق في صفحة <a href="teams.html">الفرق السبع</a> وتمهّل عنده قليلاً لتحصل على ينبوعه.</p>
        <div class="btns">
          <a class="btn btn-primary" href="teams.html">{ic('users')}<span>ابدأ الجولة</span></a>
          <button type="button" class="btn btn-ghost ln-jsonly" data-pp-reset>{lic('rotate')}<span>مسح التقدّم</span></button>
        </div>
        <p class="ln-pp-done" data-pp-done hidden>{ic('sparkles')}<span>اكتملت الينابيع السبعة!</span></p>
      </div>
      <ol class="ln-stamps" data-stagger>{stamps}</ol>
    </div>'''
    return section('passport', 'جواز المستكشف', body, icon='award', sub='اجمع ينبوعاً من كل فريق؛ يُحفظ تقدّمك في متصفحك فقط.')


# ----------------------------------------------------------------- match ---
def match():
    body = f'''
    <div class="ln-game rv">
      <div class="ln-bar">
        <div class="ln-seg" role="group" aria-label="مستوى الصعوبة" data-m-level>
          <button type="button" data-n="3" aria-pressed="false">3 أزواج</button>
          <button type="button" data-n="5" aria-pressed="true">5 أزواج</button>
          <button type="button" data-n="7" aria-pressed="false">7 أزواج</button>
        </div>
        <ul class="ln-stats" aria-label="نتيجتك">
          <li>{lic('repeat')}<span>الحركات</span><b data-m-moves>0</b></li>
          <li>{ic('clock')}<span>الوقت</span><b data-m-time>0:00</b></li>
          <li>{ic('trophy')}<span>أفضل نتيجة</span><b data-m-best>—</b></li>
        </ul>
        <button type="button" class="btn btn-soft" data-m-new>{lic('rotate')}<span>لعبة جديدة</span></button>
      </div>
      <p class="ln-how">اقلب بطاقتين: أيقونة الفريق وعنوانه. طابِق الزوج الصحيح بأقل عدد من الحركات.</p>
      <div class="ln-board" data-m-board role="group" aria-label="بطاقات الذاكرة"></div>
      <p class="sr-only" role="status" aria-live="polite" data-m-live></p>
      <div class="ln-win" data-m-win hidden role="dialog" aria-modal="false" aria-labelledby="m-win-h">
        <span class="ln-win-ic" aria-hidden="true">{ic('trophy')}</span>
        <h3 id="m-win-h">أحسنت!</h3>
        <p data-m-win-text></p>
        <button type="button" class="btn btn-primary" data-m-again>{lic('rotate')}<span>العب مرة أخرى</span></button>
      </div>
    </div>'''
    return section('match', 'لعبة الذاكرة: طابِق الفريق', body, icon='layers', cls='alt',
                   sub='كل فريق يظهر مرتين: مرة بأيقونته ومرة باسمه.')


# ------------------------------------------------------------------ quiz ---
def quiz():
    body = f'''
    <div class="ln-game ln-quiz rv" data-quiz>
      <div class="ln-q-start" data-q-start>
        <span class="ln-q-ic" aria-hidden="true">{ic('lightbulb')}</span>
        <h3>جولة من 8 أسئلة</h3>
        <p>أسئلة عشوائية من نصوص المشروع: الفرق، وجهات الإشراف، التمويل، المراحل، مؤشرات الأداء، ومحاور المبادرة. بعد كل إجابة ترى السطر الأصلي ورابط مصدره.</p>
        <label class="ln-switch"><input type="checkbox" data-q-timer checked><span class="ln-switch-t" aria-hidden="true"></span><span>مؤقّت 20 ثانية لكل سؤال</span></label>
        <button type="button" class="btn btn-primary ln-jsonly" data-q-go>{lic('play')}<span>ابدأ الجولة</span></button>
        <p class="ln-best" data-q-best hidden></p>
      </div>
      <div class="ln-q-play" data-q-play hidden></div>
      <div class="ln-q-end" data-q-end hidden></div>
    </div>'''
    return section('quiz', 'اختبار الينابيع', body, icon='lightbulb',
                   sub='اجمع النقاط وأشعل شعلة الإجابات المتتالية.')


# ----------------------------------------------------------------- cards ---
def cards():
    body = f'''
    <div class="ln-game ln-fc rv" data-fc>
      <div class="ln-bar">
        <div class="ln-seg" role="group" aria-label="اختر المجموعة" data-fc-decks>
          <button type="button" data-deck="kpi" aria-pressed="true">مؤشرات الأداء</button>
          <button type="button" data-deck="axes" aria-pressed="false">محاور المبادرة</button>
          <button type="button" data-deck="teams" aria-pressed="false">الفرق السبع</button>
        </div>
        <button type="button" class="btn btn-soft" data-fc-shuffle>{lic('shuffle')}<span>اخلط البطاقات</span></button>
      </div>
      <div class="ln-fc-prog" role="progressbar" aria-label="تقدّم المراجعة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-fc-bar></i></div>
      <p class="ln-fc-count" data-fc-count aria-live="polite"></p>
      <div class="ln-fc-stage" data-fc-stage></div>
      <div class="ln-fc-actions" data-fc-actions>
        <button type="button" class="btn btn-ghost" data-fc-later>{lic('repeat')}<span>أعد لاحقاً</span></button>
        <button type="button" class="btn btn-primary" data-fc-know>{ic('check')}<span>عرفتها</span></button>
      </div>
      <p class="ln-keys">المسافة لقلب البطاقة · الأسهم للتنقل · أو اسحب البطاقة على الهاتف</p>
    </div>'''
    return section('cards', 'بطاقات المراجعة', body, icon='book', cls='alt',
                   sub='اقلب البطاقة، وما لم تحفظه يعود إليك لاحقاً.')


# ------------------------------------------------------------------ pick ---
def pick():
    cs = ''
    for i, tid in enumerate(TIDS, 1):
        x = LEARN[tid]
        cs += (f'<li><button type="button" class="ln-pk" data-team="{tid}" aria-pressed="false" style="{tc(tid)}">'
               f'<span class="ln-pk-top"><span class="ln-pk-ic" aria-hidden="true">{ic(TEAMS[tid])}</span>'
               f'<span class="ln-pk-lbl">{t(x["natL"])}</span><span class="ln-pk-n" aria-hidden="true"></span></span>'
               f'<span class="ln-pk-t">{t(x["nat"])}</span></button></li>')
    body = f'''
    <div class="ln-game ln-pick rv" data-pick>
      <div class="ln-bar">
        <p class="ln-pick-count" aria-live="polite" data-pk-count>اختر حتى 3 عبارات تشدّك</p>
        <div class="btns">
          <button type="button" class="btn btn-primary ln-jsonly" data-pk-show disabled>{ic('sparkles')}<span>اعرض فرقي</span></button>
          <button type="button" class="btn btn-ghost ln-jsonly" data-pk-reset>{lic('rotate')}<span>ابدأ من جديد</span></button>
        </div>
      </div>
      <ul class="ln-pk-grid" data-stagger>{cs}</ul>
      <div class="ln-pk-res" data-pk-res hidden aria-live="polite"></div>
    </div>'''
    return section('pick', 'أي فريق يشدّك؟', body, icon='compass',
                   sub='هذه طبيعة عمل كل فريق كما وردت في الوثيقة. اختر ما يشدّك وتعرّف على الفرق الأقرب إليك.')


# ------------------------------------------------------------------ page ---
def build():
    quizdata.build_js()
    buttons = (btn('teams.html', 'الفرق السبع', 'users') + btn('quran.html', t(Q.meta['title']), 'book-open', 'btn-ghost')
               + btn('operations.html', 'التشغيل والحوكمة', 'shield', 'btn-ghost'))
    notice = ('<noscript><p class="ln-noscript">الألعاب والاختبارات تحتاج إلى تفعيل JavaScript في المتصفح؛ '
              'يمكنك قراءة المحتوى الكامل في صفحات الموقع الأخرى.</p></noscript>')
    body = f'''{hero()}
<div class="ln-main">
{subnav()}{notice}
{passport()}{match()}{quiz()}{cards()}{pick()}
</div>
{cta(t(P.meta['title']), t(P.meta['subtitle'].strip('()')), buttons)}'''
    page(PAGE, 'تعلّم والعب', body,
         'ألعاب واختبارات وبطاقات مراجعة مصنوعة من نصوص مشروع ينابيع: جواز المستكشف، لعبة الذاكرة، اختبار الينابيع، بطاقات المراجعة، وأي فريق يشدّك.',
         css=('css/learn.css',), js=('data/quiz.js', 'js/learn.js'))
    return PAGE
