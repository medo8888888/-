"""publish-check — «قبل أن تنشر: افحص المادة» on method.html (inside section#m-impact, right after #m-privacy).

Three questions (UI chrome) with the rules quoted verbatim under each one, each quote tagged with its document.
The tool never gives its own approval: the last step quotes cd4 («اعتماد المواد للنشر») and the m-roles row of
«المشرف التربوي». Lines about publishing channels that differ between the documents are shown side by side in a
fold, without ruling between them. Without JavaScript the whole checklist is a static list (questions + quotes);
js/publish-check.js adds the yes/no buttons, the steps and the result. No storage, no network, no upload.
"""
from core import COMP as C, METHOD as M, ic, strip_colon, t

SRC_M = 'من ملحق المنهجية'   # UI chrome: which document a quote comes from
SRC_C = 'من ملف المسابقة'


def _item(it):
    """A whole bullet line, label + ': ' + body (verbatim)."""
    return f'<b>{t(strip_colon(it.label))}:</b> {t(it.body)}' if it.label else t(it.body)


def _row(r):
    return f'<b>{t(r[0])}</b> <span class="pc-sep" aria-hidden="true">—</span> {t(r[1])}'


def _quote(inner, src):
    return f'<blockquote class="pc-quote"><span class="pc-src">{src}</span><p>{inner}</p></blockquote>'


def data():
    media = M['m-media'].items
    child = [i for i in media if strip_colon(i.label) == 'ضوابط حماية الطفل والخصوصية']
    assert len(child) == 1 and 'موافقة كتابية صريحة' in child[0].body
    priv = M['m-impact']['m-privacy'].items
    pre = [i for i in priv if strip_colon(i.label) == 'الموافقة المسبقة'][0]
    safe = [i for i in priv if strip_colon(i.label) == 'الاستخدام الآمن'][0]
    assert 'القنوات المغلقة والمعتمدة' in safe.body
    roles = {r[0]: r for r in M['m-roles'].table[1:]}
    doc, sup = roles['الموثق الإعلامي'], roles['المشرف التربوي']
    consent = C['c-consent']
    photo = consent['k-photo']
    assert photo.title == 'اختيارات التصوير والنشر – مستقلة عن المشاركة', photo.title
    assert 'لكل مشارك قاصر' in consent.paras[0]
    cd4 = C['c-card']['cd4']
    appr = [r for r in cd4.table[1:] if r[0] == 'اعتماد المواد للنشر']
    assert len(appr) == 1 and 'مسؤول التوثيق' in appr[0][1]
    warn = cd4.paras[0]
    assert warn.startswith('تنبيه:')
    tele = [i for i in media if 'تيليجرام' in i.label][0]
    insta = [i for i in media if 'إنستجرام' in i.label][0]
    ad = C.find('c-ad-axes')
    content_ax = [c for it in ad.items for c in it.children if strip_colon(c.label) == 'صناعة المحتوى']
    assert len(content_ax) == 1 and 'منصات التواصل الاجتماعي' in content_ax[0].body
    return dict(child=child[0], pre=pre, safe=safe, doc=doc, sup=sup, consent=consent, photo=photo,
                appr=appr[0], warn=warn, tele=tele, insta=insta, content_ax=content_ax[0])


def html():
    d = data()
    q_child = _quote(_item(d['child']), SRC_M)
    q_pre = _quote(_item(d['pre']), SRC_M)
    q_safe = _quote(_item(d['safe']), SRC_M)
    q_photo = _quote(f'<b class="pc-qt">{t(d["photo"].title)}</b> {t(d["photo"].paras[0])}', SRC_C)
    q_consent = _quote(t(d['consent'].paras[0]), SRC_C)
    q_doc = _quote(_row(d['doc']), SRC_M)
    q_sup = _quote(_row(d['sup']), SRC_M)
    q_appr = _quote(_row(d['appr']), SRC_C)

    def step(n, q, quotes, extra=''):
        return (f'<li class="pc-step" id="pc-s{n}" data-pc-step="{n}">'
                f'<p class="pc-q" id="pc-q{n}" tabindex="-1"><span class="pc-n" aria-hidden="true">{n}</span><span>{q}</span></p>'
                f'<div class="pc-yn" role="group" aria-labelledby="pc-q{n}" data-pc-yn hidden>'
                f'<button type="button" class="pc-b" data-pc-ans="yes" aria-pressed="false">نعم</button>'
                f'<button type="button" class="pc-b" data-pc-ans="no" aria-pressed="false">لا</button>'
                f'<span class="pc-skip" data-pc-skip hidden>لا ينطبق: الإجابة على السؤال 1 «لا»</span></div>'
                f'<div class="pc-quotes">{quotes}{extra}</div></li>')

    steps = (step(1, 'هل في المادة صورة أو مقطع أو بيانات قد تعرّف بطفل؟', q_child)
             + step(2, 'هل لدى المسؤول موافقة كتابية موقّعة من ولي أمر كل طفل يظهر أو يُذكر في المادة، في خانة التصوير والنشر تحديدًا؟',
                    q_pre + q_consent + q_photo + q_doc,
                    f'<p class="pc-link"><a class="btn btn-soft btn-sm" href="register.html#c-consent">{ic("printer")}<span>اطبع نموذج موافقة ولي الأمر</span></a></p>')
             + step(3, 'هل ستُنشر المادة عبر قناة مغلقة ومعتمدة من إدارة البرنامج؟', q_safe))

    res = (f'<div class="pc-res pc-stop" data-pc-res="consent" hidden>'
           f'<p class="pc-res-h" tabindex="-1">{ic("alert")}<span>لا تُنشر بعد: تنقص الموافقة الكتابية من ولي الأمر.</span></p>{q_pre}'
           f'<p class="pc-hint">يمكنك تعديل المادة ثم إعادة الفحص من البداية.</p>{q_child}</div>'
           f'<div class="pc-res pc-stop" data-pc-res="channel" hidden>'
           f'<p class="pc-res-h" tabindex="-1">{ic("alert")}<span>لا تُنشر بعد: القناة غير مذكورة في الضوابط.</span></p>{q_safe}</div>'
           f'<div class="pc-res pc-go" data-pc-res="next" hidden>'
           f'<p class="pc-res-h" tabindex="-1">{ic("arrow-left")}<span>الخطوة التالية قبل النشر:</span></p>{q_appr}{q_sup}</div>')

    # without JavaScript: the same next step, as part of the static checklist
    static_next = (f'<div class="pc-static" data-pc-static><p class="pc-res-h">{ic("arrow-left")}<span>الخطوة التالية قبل النشر:</span></p>'
                   f'{q_appr}{q_sup}</div>')
    fold = (f'<details class="pc-fold"><summary>{ic("scale")}<span>سطور تحتاج قرار الإدارة</span>{ic("chevron-down", "i pc-fold-c")}</summary>'
            f'<p class="pc-hint">سطور عن قنوات النشر كما وردت في الوثيقتين، بلا ترجيح بينها.</p><div class="pc-side">'
            + _quote(_item(d['tele']), SRC_M) + _quote(_item(d['insta']), SRC_M)
            + _quote(_item(d['content_ax']), SRC_C)
            + _quote(f'<b class="pc-qt">{t(d["photo"].title)}</b> {t(d["photo"].paras[0])}', SRC_C)
            + _quote(_item(d['safe']), SRC_M) + '</div></details>')
    return f'''
<div class="dp-sub pc rv" id="publish-check" data-pc>
  <h3 class="dp-h3" id="pc-h">{ic('shield')}<span>قبل أن تنشر: افحص المادة</span></h3>
  <p class="pc-intro">ثلاثة أسئلة قبل نشر صورة أو مقطع أو بيانات، وتحت كل سؤال القاعدة كما وردت. هذا الفحص لا يغني عن اعتماد المسؤولين المذكورين في آخره.</p>
  <p class="pc-prog" data-pc-prog hidden aria-hidden="true"></p>
  <ol class="pc-steps" data-pc-steps>{steps}</ol>
  {static_next}
  <div class="pc-result" aria-live="polite" data-pc-result>{res}</div>
  <p class="pc-warn">{ic('alert')}<span>{t(d['warn'])}</span></p>
  {fold}
  <p class="pc-again" data-pc-again hidden><button type="button" class="btn btn-ghost btn-sm" data-pc-reset>{ic('repeat')}<span>ابدأ من جديد</span></button></p>
</div>'''
