"""ad-maker — «خصّص الإعلان: اسم الجهة ورقم الواتساب» (competition.html, #c-ad).

The announcement (competition.txt c-ad) has exactly two blanks: 'جمعية / مدرسة ..................' in its third
paragraph and '[رقم الواتساب]' in c-ad-how. page_competition.ad() wraps both in the poster markup (mark_lead(),
mark_subs()); this panel lets a partner fill them in the browser, copy the whole announcement as plain text, or print
it. The site never supplies a number: the c-decisions row 'اعتماد رابط التسجيل ورقم التواصل' gives that decision to
'مسؤول التسجيل', and the panel shows that row verbatim.

Behaviour: site/yanabee/js/ad-maker.js (values stay in this browser, localStorage 'yanabee-ad-maker-v1').
Styles: site/yanabee/css/ad-maker.css. The panel ships hidden; without JavaScript the poster reads as before.
"""
from core import COMP as C, ic, plain, t

KIND = 'جمعية / مدرسة'
DOTS = '..................'
WA_LABEL = 'للتسجيل والاستفسار'   # c-ad-how: the line that carries the registration WhatsApp number
DECISION = 'اعتماد رابط التسجيل ورقم التواصل'


def _lead_src():
    paras = [b for k, b in C['c-ad'].blocks if k == 'p']
    src = paras[2]
    assert src.count(KIND + ' ' + DOTS) == 1, 'ad-maker: c-ad paragraph 3 no longer has the blank'
    assert src.count(KIND) == 1 and src.count(DOTS) == 1
    return src


def mark_lead(lead_html):
    """t(paras[2]) -> the same text with the organisation kind and the dots wrapped for live editing."""
    assert lead_html.count(KIND) == 1 and lead_html.count(DOTS) == 1, 'ad-maker: blank not found once in the lead'
    return (lead_html.replace(KIND, f'<span data-ad-kind>{KIND}</span>')
            .replace(DOTS, f'<span data-ad-org>{DOTS}</span>'))


def wa_value():
    """The WhatsApp value of c-ad-how, verbatim: the official number since the Nov 2026 revision (was '[رقم الواتساب]')."""
    hit = [it.body for it in C['c-ad']['c-ad-how'].items if it.text.startswith(WA_LABEL)]
    assert len(hit) == 1 and hit[0], 'ad-maker: c-ad-how has no WhatsApp line'
    return hit[0]


def mark_subs(subs_html):
    """The rendered c-ad sub-parts -> the WhatsApp value wrapped once in a <bdi> the panel can replace."""
    wa = wa_value()
    assert subs_html.count(wa) == 1, 'ad-maker: WhatsApp value not found once in the poster'
    return subs_html.replace(wa, f'<bdi data-ad-wa>{wa}</bdi>')


def _decision():
    tbl = C['c-decisions'].table
    head, rows = tbl[0], [r for r in tbl[1:] if r[0] == DECISION]
    assert len(rows) == 1, 'ad-maker: c-decisions row not found'
    cells = ' · '.join(f'<span><small>{t(h)}:</small> {t(c)}</span>' for h, c in zip(head, rows[0]))
    return f'<p class="ad-maker-note">{ic("alert")}<span><b>{t(C["c-decisions"].title)}</b> {cells}</span></p>'


def html():
    _lead_src()
    a, b = KIND.split(' / ')
    kinds = [(a, a), (b, b), ('', 'اترك الكلمتين')]
    radios = ''.join(
        f'<label class="adm-pill"><input type="radio" name="adm-kind" value="{plain(v)}"{" checked" if not v else ""}>'
        f'<span>{t(lab) if v else lab}</span></label>' for v, lab in kinds)
    return f'''
<div class="ad-maker" id="ad-maker" role="group" aria-labelledby="adm-h" data-ad-maker hidden>
  <h3 class="adm-h" id="adm-h">{ic('megaphone')}<span>خصّص الإعلان لجهتك</span></h3>
  <fieldset class="adm-kind"><legend>نوع الجهة</legend><div class="adm-pills">{radios}</div></fieldset>
  <div class="adm-fields">
    <div class="adm-f"><label for="adm-org">اسم الجمعية أو المدرسة</label>
      <input type="text" id="adm-org" maxlength="80" autocomplete="organization" data-ad-in-org></div>
    <div class="adm-f"><label for="adm-wa">رقم الواتساب المعتمد للتسجيل</label>
      <input type="tel" id="adm-wa" inputmode="tel" dir="ltr" maxlength="20" autocomplete="off" aria-describedby="adm-wa-hint" data-ad-in-wa>
      <small id="adm-wa-hint" class="adm-hint">الرقم المعتمد في الإعلان ظاهر في الملصق؛ اكتب رقمًا آخر فقط إن اعتمدت جهتكم رقمًا مختلفًا.</small></div>
  </div>
  {_decision()}
  <div class="adm-actions">
    <button type="button" class="btn btn-primary btn-sm" data-ad-copy>{ic('file-text')}<span>انسخ نص الإعلان</span></button>
    <button type="button" class="btn btn-ghost btn-sm" data-ad-reset>{ic('repeat')}<span>أعد النص الأصلي</span></button>
  </div>
  <p class="adm-status" id="adm-status" aria-live="polite" data-ad-status></p>
  <textarea class="adm-manual" id="adm-manual" readonly rows="8" aria-label="نص الإعلان للنسخ اليدوي" data-ad-manual hidden></textarea>
</div>'''
