"""register.html — استمارة تسجيل فريق + موافقة ولي الأمر (competition.txt: c-form, c-consent).

Every label and note on the form is a content line (via t()); the inputs, buttons and hints are UI chrome.
js/register.js runs the form: 5–7 member rows, nominee lists filled from the member names, checks, a local
draft (this browser only), a printable copy of the filled form and one parent consent per minor.
When the backend is configured, «أرسل التسجيل» sends the form once (yb_register_team, migration 0005)
and «تابع طلبك» shows the team checklist from a request number + the leader's phone. Nothing else leaves the page.
"""
from core import COMP as C, PAGE_LABEL, btn, ic, page, page_hero, plain, strip_colon, t
from features import assets
from docpage import STATUS, blocks_html, head

PAGE = 'register.html'


def field(label, name, kind='text', req=False, hint='', auto=''):
    r = ' required' if req else ''
    star = '<i class="req" aria-hidden="true">*</i>' if req else ''
    h = f'<small class="f-hint">{hint}</small>' if hint else ''
    a = f' autocomplete="{auto}"' if auto else ''
    if kind == 'textarea':
        inp = f'<textarea name="{name}" rows="3"{r}></textarea>'
    elif kind == 'select':
        inp = f'<select name="{name}" data-member-select{r}><option value="">— اختر من الأعضاء —</option></select>'
    else:
        inp = f'<input type="{kind}" name="{name}"{r}{a}>'
    return f'<label class="f"><span class="f-l">{t(label)}{star}</span>{inp}{h}</label>'


def part(node, inner, num):
    k, _, main = node.title.partition(':')
    return (f'<fieldset class="fpart rv" id="{node.id}"><legend><span class="fp-n">{num}</span>'
            f'<span><small>{t(k.strip())}</small><b>{t(main.strip())}</b></span></legend>{inner}</fieldset>')


def form():
    f = C['c-form']
    team, mem, nom, app, fee, pl, adm = (f[x] for x in ('f-team', 'f-members', 'f-nom', 'f-apply', 'f-fee', 'f-pledge', 'f-admin'))
    ti = [it.text for it in team.items]
    p1 = part(team, '<div class="fgrid">'
              + field(ti[0], 'team', req=True)
              + field(ti[1], 'leader', req=True, hint='يُضاف تلقائيًا عضوًا أول في الجدول', auto='name')
              + field(ti[2], 'phone', 'tel', req=True, auto='tel')
              + field(ti[3], 'email', 'email', auto='email')
              + field(ti[4], 'area') + '</div>', 1)
    hd = mem.table[0]
    th = ''.join(f'<th scope="col">{t(h)}</th>' for h in hd) + '<th scope="col"><span class="sr-only">حذف</span></th>'
    p2 = part(mem, f'''
      <div class="mtable-wrap"><table class="mtable"><thead><tr>{th}</tr></thead><tbody data-members></tbody></table></div>
      <div class="mtools"><button type="button" class="btn btn-ghost btn-sm" data-add-member>{ic('users')}<span>أضف عضوًا</span></button>
        <output class="mcount" data-member-count aria-live="polite"></output></div>
      <p class="f-note">{t(mem.paras[0])}</p>''', 2)
    ni = nom.items
    p3 = part(nom, '<div class="fgrid">'
              + field(ni[0].text, 'rec1', 'select', req=True)
              + field(ni[1].text, 'rec2', 'select', req=True, hint='عضو أساسي وعضو احتياطي: اختر عضوين مختلفين')
              + field(ni[2].text, 'chess', 'select', req=True) + '</div>'
              + ''.join(f'<p class="f-note">{ic("check")}<b>{t(strip_colon(it.label))}:</b> {t(it.body)}</p>' for it in ni[3:]), 3)
    ai = app.items
    p4 = part(app, f'<p class="f-note">{t(app.paras[0])}</p><div class="fgrid">'
              + field(ai[0].text, 'idea', 'textarea') + field(ai[1].text, 'coord', 'select') + '</div>', 4)
    p5 = part(fee, f'<p class="f-fee">{ic("coins")}<span>{t(fee.paras[0])}</span></p>'
              f'<p class="f-note admin-note">{t(fee.items[0].text)} <small>(تُعبّأ عند السداد لدى مسؤول التسجيل)</small></p>', 5)
    pledges = ''.join(f'<label class="chk"><input type="checkbox" name="pledge{i}" required><span>{t(it.text)}</span></label>'
                      for i, it in enumerate(pl.items))
    p6 = part(pl, pledges, 6)
    p7 = part(adm, blocks_html(adm) + '<p class="f-hint">تملؤه إدارة المسابقة بعد مراجعة الاستمارة.</p>', 7)
    from feat_team_builder import html as team_builder  # feature «team-builder»: sits in <main> right before #c-form
    return team_builder() + f'''
<section class="sec dp-sec reg" id="c-form">
  <div class="wrap">
    {head(f, 'file-text', sub='المسابقة الأولى (سورة الصف) · 1 نوفمبر 2026 – 25 يناير 2027')}
    <p class="privacy rv">{ic('lock')}<span data-priv-local>تبقى البيانات على هذا الجهاز فقط: يحفظ المتصفح مسودتك لتكملها لاحقًا، ولا يُرسل الموقع شيئًا. سلّم الاستمارة المطبوعة لمسؤول التسجيل.</span><span data-priv-online hidden>يحفظ المتصفح مسودتك على هذا الجهاز لتكملها لاحقًا. لا يصل شيء إلى إدارة المسابقة إلا حين تضغط «أرسل التسجيل»، وأسماء الأعضاء وأرقامهم لا تظهر للعموم أبدًا.</span></p>
    <form class="regform" data-reg novalidate autocomplete="on">
      {p1}{p2}{p3}{p4}{p5}{p6}{p7}
      <div class="ferr" data-errors role="alert" hidden></div>
      <div class="factions">
        <button type="submit" class="btn btn-primary">{ic('check')}<span>تحقق من الاستمارة</span></button>
        <button type="button" class="btn btn-ghost" data-clear>{ic('trash')}<span>مسح البيانات</span></button>
        <span class="saved" data-saved aria-live="polite"></span>
      </div>
    </form>
    <div class="done rv" data-done hidden tabindex="-1">
      <h3>{ic('check')}الاستمارة مكتملة</h3>
      <p data-done-sum></p>
      <div class="send" data-send-box hidden>
        <button type="button" class="btn btn-primary" data-send>{ic('send')}<span>أرسل التسجيل إلى إدارة المسابقة</span></button>
        <small class="f-hint">تحصل فورًا على رقم طلب تتابع به حالة فريقك. يمكنك الإرسال مرة واحدة؛ تكرار الإرسال يعيد الرقم نفسه.</small>
        <p class="ferr" data-send-err role="alert" hidden></p>
      </div>
      <div class="sent" data-sent hidden tabindex="-1"></div>
      <div class="btns">
        <button type="button" class="btn btn-primary" data-print-form>{ic('printer')}<span>اطبع الاستمارة</span></button>
        <button type="button" class="btn btn-ghost" data-print-consent>{ic('user-check')}<span>اطبع موافقات أولياء الأمور</span></button>
        <button type="button" class="btn btn-ghost" data-copy>{ic('file-text')}<span>انسخ نص الطلب</span></button>
        <a class="btn btn-ghost" data-wa hidden target="_blank" rel="noopener">{ic('send')}<span>أرسل عبر واتساب</span></a>
      </div>
      <p class="f-hint" data-wa-note>رقم واتساب التسجيل تعلنه الجمعية أو المدرسة المنظِّمة؛ أرسل النص المنسوخ إليه أو سلّم الاستمارة المطبوعة.</p>
    </div>
  </div>
</section>'''


def consent():
    c = C['c-consent']
    data, ok, photo = c['k-data'], c['k-ok'], c['k-photo']
    rows = ''.join(f'<div class="cf-row"><span>{t(it.text)}</span><i data-k="{i}"></i></div>' for i, it in enumerate(data.items))
    tpl = f'''
    <article class="consent rv" data-consent-tpl>
      <header><b>{t(strip_colon(c.title))}</b><small>مشروع ينابيع · المسابقة الأولى (سورة الصف)</small></header>
      <p class="cf-note">{t(c.paras[0])}</p>
      <h4>{t(data.title)}</h4><div class="cf-grid">{rows}</div>
      <h4>{t(ok.title)}</h4><p class="cf-box"><span class="box" aria-hidden="true"></span>{t(ok.paras[0])}</p>
      <div class="cf-row wide"><span>{t(ok.items[0].text)}</span><i></i></div>
      <h4>{t(photo.title)}</h4><p class="cf-box"><span class="box" aria-hidden="true"></span>{t(photo.paras[0])}</p>
      <div class="cf-sign"><span>اسم ولي الأمر:</span><i></i><span>التوقيع:</span><i></i><span>التاريخ:</span><i></i></div>
    </article>'''
    return f'''
<section class="sec dp-sec alt" id="c-consent">
  <div class="wrap">
    {head(c, 'user-check', sub='نسخة لكل مشارك قاصر. بعد التحقق من الاستمارة تُطبع النسخ بأسماء الأعضاء جاهزة، أو اطبع النموذج فارغًا.')}
    <div class="consent-wrap">{tpl}</div>
    <div class="fold-tools rv"><button type="button" class="btn btn-ghost btn-sm" data-print-blank>{ic('printer')}<span>اطبع نموذجًا فارغًا</span></button></div>
  </div>
</section>
<div class="print-area" data-consent-print aria-hidden="true"></div>'''


def track():
    """«تابع طلبك»: request number + the leader's phone -> the team checklist (yb_track_request, migration 0005)."""
    return f'''
<section class="sec dp-sec" id="track">
  <div class="wrap">
    <header class="sec-head rv"><div><span class="kicker">{ic('search')}بعد الإرسال</span><h2>تابع طلبك</h2>
      <p class="sec-sub">اكتب رقم الطلب الذي ظهر لك بعد الإرسال ورقم هاتف القائد كما كتبته في الاستمارة.</p></div></header>
    <div class="track rv" data-track>
      <div class="track-mine" data-track-mine hidden></div>
      <form class="track-f" data-track-form novalidate>
        <label class="f"><span class="f-l">رقم الطلب</span><input name="ref" dir="ltr" autocomplete="off" placeholder="YN-XXXX-XXXX" maxlength="16" required></label>
        <label class="f"><span class="f-l">هاتف قائد الفريق</span><input name="tphone" type="tel" dir="ltr" autocomplete="tel" required></label>
        <button type="submit" class="btn btn-primary">{ic('search')}<span>اعرض حالة الطلب</span></button>
      </form>
      <p class="ferr" data-track-err role="alert" hidden></p>
      <div class="track-out" data-track-out aria-live="polite"></div>
      <p class="f-hint" data-track-off hidden>المتابعة الإلكترونية غير متاحة في هذه النسخة من الموقع. تواصل مع مسؤول التسجيل لمعرفة حالة طلبك.</p>
    </div>
  </div>
</section>'''


def hero():
    how = C['c-ad']['c-ad-how']
    steps = ''.join(f'<li><span class="hs-n">{i + 1}</span><span>{t(it.text)}</span></li>' for i, it in enumerate(how.items[:2]))
    visual = f'<div class="ch-visual rv">{STATUS}<ol class="hsteps">{steps}<li><span class="hs-n">3</span><span>أرسل الطلب واحفظ رقمه، ثم سلّم موافقات أولياء الأمور والرسوم لمسؤول التسجيل.</span></li></ol></div>'
    chips = [('#c-form', 'الاستمارة'), ('#track', 'تابع طلبك'), ('#c-consent', 'موافقة ولي الأمر'), ('competition.html#c-league', 'لائحة الدوري'),
             ('competition.html#c-axes', 'المحاور والتقييم')]
    return page_hero(PAGE, 'المسابقة الأولى · سورة الصف', 'سجّل فريقك',
                     'فريق من 5 إلى 7 أعضاء شاملًا القائد، ورسوم 10 $ للفريق الواحد. املأ الاستمارة هنا، ثم اطبعها مع موافقات أولياء الأمور.',
                     chips, visual, 'comp-hero')


def build():
    body = (hero() + form() + track() + consent()
            + f'<section class="sec"><div class="wrap"><p class="back rv">{btn("competition.html", "المسابقة الأولى: المحاور واللوائح والجوائز", "arrow-left", "btn-ghost")}</p></div></section>')
    desc = 'استمارة تسجيل فريق في المسابقة الأولى لمشروع ينابيع (سورة الصف) وموافقة ولي الأمر للمشارك القاصر.'
    fcss, fjs = assets(PAGE)
    page(PAGE, PAGE_LABEL[PAGE], body, desc, css=('css/comp.css',) + fcss,
         js=('js/comp.js', 'js/yb-config.js', 'js/yb-api.js', 'js/yb-checklist.js', 'js/register.js') + fjs)
    return PAGE
