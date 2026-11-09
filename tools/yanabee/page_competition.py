"""competition.html — المسابقة الأولى لسورة الصف (content/yanabee/competition.txt, all sections but the
registration form and the parent consent, which live on register.html).

Content words come from COMP via t(); the rest is UI chrome. The live status (registration open / running /
results / ceremony) is computed in js/comp.js from the dates that appear in the text.
"""
from core import COMP as C, PAGE_LABEL, btn, cta, ic, page, page_hero, plain, split_kicker, strip_colon, t
from docpage import STATUS, ayah, blocks_html, fold, head, node_html, sec, seg_bar

PAGE = 'competition.html'

# date window of each line of the operating plan (c-timeline), for the «الآن» marker — dates from the same lines
WINDOWS = [('', '2026-10-31'), ('2026-11-01', '2026-11-14'), ('2026-11-15', '2026-11-30'), ('2026-12-01', '2026-12-31'),
           ('2027-01-01', '2027-01-14'), ('2027-01-15', '2027-01-24'), ('2027-01-25', '2027-01-31')]
FACT_ICON = ['users', 'coins', 'calendar', 'flag', 'flag', 'trophy', 'repeat', 'file-text']
AXIS_ICON = ['book-open', 'lightbulb', 'hand-heart', 'megaphone', 'trophy', 'cpu']
AXIS_TONE = ['t1', 'sky', 't5', 't6', 't3', 't4']


def hero():
    about = C['c-about']
    q = [b for k, b in about.blocks if k == 'quote'][0]
    visual = f'''
    <div class="ch-visual rv">
      <div class="ch-ayah"><span class="ch-sura">سورة الصف</span><p>{t(q)}</p></div>
      {STATUS}
    </div>'''
    chips = [('#c-plan', 'المواعيد'), ('#c-axes', 'المحاور والتقييم'), ('#c-prizes', 'الجوائز'),
             ('#c-league', 'لائحة الدوري'), ('#c-partner', 'الشراكة'), ('#c-ad', 'الإعلان'), ('#guide', 'دليل المنظِّمين'),
             ('register.html', 'سجّل فريقك')]
    return page_hero(PAGE, t(C.meta['project']), t(C.meta['title']), t(C.meta['subtitle']), chips, visual, 'comp-hero')


def about():
    n = C['c-about']
    return sec('c-about', head(n) + f'<div class="ch-about">{blocks_html(n)}</div>')


def terms():
    n = C['c-terms']
    rows = n.table[1:]
    tiles = ''.join(
        f'<li class="fact rv" style="--k:{i}"><span class="fact-ic">{ic(FACT_ICON[i % len(FACT_ICON)])}</span>'
        f'<small>{t(a)}</small><b>{t(b)}</b></li>' for i, (a, b) in enumerate(rows))
    return sec('c-terms', head(n) + f'<ul class="facts" data-stagger aria-label="{plain(n.title)}">{tiles}</ul>'
               + f'<div class="tbl-print">{blocks_html(n)}</div>', 'alt')


def plan():
    n = C['c-plan']
    tgt, tl = n['c-target'], n['c-timeline']
    steps = ''
    for i, it in enumerate(tl.items):
        a, b = WINDOWS[i]
        steps += (f'<li class="tl-step rv" data-from="{a}" data-to="{b}"><span class="tl-dot" aria-hidden="true"></span>'
                  f'<div><b class="tl-when">{t(strip_colon(it.label))}</b><p>{t(it.body)}</p>'
                  f'<span class="tl-now" hidden>الآن</span></div></li>')
    big = (f'<div class="ch-target rv"><div class="ct-n"><b>12</b><span>فريقًا</span></div>'
           f'<div class="ct-n"><b>5 إلى 7</b><span>أعضاء لكل فريق</span></div><div class="ct-n"><b>60 إلى 84</b><span>مشاركًا</span></div></div>')
    inner = (head(n) + blocks_html(n)
             + f'<div class="dp-sub" id="c-target">{head(tgt, level=3)}{blocks_html(tgt)}{big}</div>'
             + f'<div class="dp-sub" id="c-timeline">{head(tl, level=3)}<ol class="tl" data-timeline>{steps}</ol></div>')
    return sec('c-plan', inner)


def axes():
    n, s = C['c-axes'], C['c-score']
    hd, rows = n.table[0], n.table[1:]
    cards = ''
    for i, (ax, need, proof) in enumerate(rows):
        k, _, main = ax.partition(':') if ':' in ax else ('', '', ax)
        cards += (f'<li class="axis rv" style="--sc:var(--{AXIS_TONE[i]})"><span class="axis-ic">{ic(AXIS_ICON[i])}</span>'
                  f'<small>{t(k.strip())}</small><h3>{t(main.strip())}</h3>'
                  f'<p><b>{t(hd[1])}:</b> {t(need)}</p><p class="axis-proof"><b>{t(hd[2])}:</b> {t(proof)}</p></li>')
    para = s.paras[0]
    bar = seg_bar([('الحفظ', 10, '10'), ('الفهم', 15, '15'), ('التطبيق', 45, '45'), ('كرة القدم', 20, '20'), ('الشطرنج', 10, '10')],
                  'نقطة', strip_colon(s.title))
    rub = s['c-rubric']
    inner = (head(n) + f'<ul class="axes" data-stagger>{cards}</ul><div class="tbl-print">{blocks_html(n)}</div>'
             + f'<div class="dp-sub score" id="c-score">{head(s, level=3)}<p class="dp-p rv">{t(para)}</p>{bar}'
             + f'<div class="dp-sub" id="c-rubric">{head(rub, level=3)}{blocks_html(rub)}</div></div>')
    return sec('c-axes', inner, 'alt')


def prizes():
    n = C['c-prizes']
    rows = n.table[1:]
    pod = ''
    for i, (place, prize) in enumerate(rows[:3]):
        pod += (f'<li class="pod p{i + 1} rv"><span class="pod-medal" aria-hidden="true">{i + 1}</span>'
                f'<small>{t(place)}</small><b>{t(prize)}</b></li>')
    extra = rows[3]
    hon = n['c-honors']
    inner = (head(n) + f'<ol class="podium" aria-label="{plain(n.title)}">{pod}</ol>'
             + f'<p class="pod-extra rv">{ic("award")}<b>{t(extra[0])}:</b> {t(extra[1])}</p>'
             + f'<div class="tbl-print">{blocks_html(n)}</div>'
             + f'<div class="dp-sub honors" id="c-honors">{head(hon, level=3)}{blocks_html(hon)}</div>')
    return sec('c-prizes', inner)


def band():
    return f'''
<section class="sec reg-band">
  <div class="wrap">
    <div class="rb-card rv">
      <div><span class="kicker">{ic('file-text')}سجّل فريقك</span>
        <h2>5 إلى 7 أعضاء، وقائد، ورسوم 10 $ للفريق</h2>
        <p>املأ الاستمارة على الموقع، واطبعها مع موافقات أولياء الأمور، ثم سلّمها لمسؤول التسجيل.</p></div>
      <div class="btns">{btn('register.html', 'افتح استمارة التسجيل', 'file-text')}{btn('#c-league', 'اقرأ اللوائح أولًا', 'scale', 'btn-ghost')}</div>
    </div>
  </div>
</section>'''


def league():
    n, r = C['c-league'], C['c-rules']
    folds = ''.join(fold(s, open_=(i == 0), num=str(i + 1)) for i, s in enumerate(n.subs))
    inner = (head(n) + blocks_html(n)
             + '<div class="fold-tools rv"><button type="button" class="btn btn-ghost btn-sm" data-fold-all>'
             + f'{ic("layers")}<span>افتح كل الفصول</span></button><button type="button" class="btn btn-ghost btn-sm" data-print>'
             + f'{ic("printer")}<span>اطبع اللائحة</span></button></div>'
             + f'<div class="folds">{folds}</div>'
             + f'<div class="dp-sub rules" id="c-rules">{head(r, level=3)}{blocks_html(r)}</div>')
    return sec('c-league', inner, 'alt')


def partner():
    return sec('c-partner', node_html(C['c-partner']))


def ad():
    n = C['c-ad']
    paras = [b for k, b in n.blocks if k == 'p']
    q = [b for k, b in n.blocks if k == 'quote'][0]
    subs = ''.join(f'<div class="ad-part" id="{s.id}"><h3>{t(strip_colon(s.title))}</h3>{blocks_html(s)}</div>' for s in n.subs)
    poster = f'''
    <article class="poster rv" data-print-area>
      <header><span class="poster-k">{t(paras[0])}</span>{ayah(q)}<p class="poster-q">{t(paras[1])}</p></header>
      <p class="poster-lead">{t(paras[2])}</p>
      <div class="ad-grid">{subs}</div>
    </article>'''
    tools = (f'<div class="fold-tools rv"><button type="button" class="btn btn-ghost btn-sm" data-print-poster>{ic("printer")}'
             f'<span>اطبع الإعلان</span></button>{btn("register.html", "سجّل فريقك", "file-text", "btn-primary btn-sm")}</div>')
    return sec('c-ad', head(n) + tools + poster)


def guide():
    ids = ['c-ops', 'c-decisions', 'c-follow', 'c-q1', 'c-card']
    folds = ''.join(fold(C[i], num=str(k + 1)) for k, i in enumerate(ids))
    inner = ('<header class="sec-head rv"><div><span class="kicker">' + ic('network') + 'للإدارة والمشرفين</span>'
             '<h2>دليل المنظِّمين</h2><p class="sec-sub">الترتيبات التشغيلية، والقرارات العاجلة، والمتابعة، ومستهدفات الربع الأول، '
             'وبطاقة إعداد كل نشاط وتقييمه.</p></div></header>'
             + '<div class="fold-tools rv"><button type="button" class="btn btn-ghost btn-sm" data-fold-all>'
             + f'{ic("layers")}<span>افتح الكل</span></button></div>'
             + f'<div class="folds">{folds}</div>')
    return sec('guide', inner, 'alt')


def build():
    buttons = (btn('register.html', 'سجّل فريقك', 'file-text') + btn('quran.html', 'مبادرة «حفظ، فهم، تطبيق»', 'book-open', 'btn-ghost')
               + btn('leaders.html', 'المرحلة الثانية: إعداد القادة', 'user-check', 'btn-ghost'))
    body = (hero() + about() + plan() + terms() + axes() + prizes() + band() + league() + partner() + ad() + guide()
            + cta(t(C.meta['title']), t(C['c-about'].paras[1]), buttons))
    desc = C['c-plan'].paras[0] + ' ' + C['c-plan']['c-target'].paras[0]
    page(PAGE, PAGE_LABEL[PAGE], body, desc, css=('css/comp.css',), js=('js/comp.js',))
    return PAGE
