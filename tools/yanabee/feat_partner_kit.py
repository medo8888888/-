"""partner-kit — «ملف الجهة الشريكة وتقرير الأسبوعين» (competition.html, #c-partner).

Replaces the plain rendering of c-p-partner, c-p-yanabee and c-p-by with a two-tab kit that carries their lines
verbatim: (1) the partner type (مدرسة / جمعية, from the c-p-by header) with the real c-p-by table, and the two lists
of obligations as checklists; (2) a fortnightly report draft whose fields are the c-follow items, with the
achievement rate computed by the cd5 formula. Without JavaScript both panels show one after the other.
Behaviour: site/yanabee/js/partner-kit.js (localStorage 'yanabee-partner-kit-v1', this browser only).
Styles: site/yanabee/css/partner-kit.css.
"""
import json

from core import COMP as C, ic, plain, t, table_html
from docpage import head


def _follow_parts():
    para = C['c-follow'].paras[0]
    _, _, rest = para.partition('تشمل: ')
    assert rest, para
    rest = rest.split(' تجمع إدارة ينابيع')[0].strip()
    assert rest.endswith('.')
    parts = rest[:-1].split('، ')
    assert parts == ['عدد الفرق والأعضاء المسجلين والمنتظمين', 'عدد الأنشطة المنفذة', 'المشروع التطبيقي لكل فريق',
                     'نسبة إنجاز المستهدف', 'أبرز التحديات', 'وخطوة التحسين التالية'], parts
    labels = parts[:5] + [parts[5][1:] if parts[5].startswith('و') else parts[5]]  # only the conjunction is dropped
    assert labels[5] == 'خطوة التحسين التالية'
    return para, parts, labels


def _check_list(node, key):
    lis = ''.join(f'<li><label class="pk-opt"><input type="checkbox" data-tick="{key}" data-i="{i}"><span>{t(it.text)}</span></label></li>'
                  for i, it in enumerate(node.items))
    return f'<div class="dp-sub pk-list" id="{node.id}">{head(node, level=3)}<ul class="pk-checks">{lis}</ul></div>'


def _num(fid, label, decimal=False):
    # type=text + inputmode: Arabic-Indic digits are accepted and normalised by partner-kit.js (a number input drops them)
    return (f'<div class="f pk-f"><label class="f-l" for="pk-{fid}">{label}</label>'
            f'<input id="pk-{fid}" type="text" inputmode="{"decimal" if decimal else "numeric"}" autocomplete="off"'
            f' data-num="{"dec" if decimal else "int"}" data-f="{fid}"></div>')


def _area(fid, label):
    return (f'<div class="f pk-f pk-wide"><label class="f-l" for="pk-{fid}">{label}</label>'
            f'<textarea id="pk-{fid}" rows="3" data-f="{fid}"></textarea></div>')


def html():
    n = C['c-partner']
    P, Y, BY = n['c-p-partner'], n['c-p-yanabee'], n['c-p-by']
    assert len(P.items) == 8 and len(Y.items) == 6, (len(P.items), len(Y.items))
    assert len(BY.table) == 6 and BY.table[0] == ['العنصر', 'مدرسة', 'جمعية'], BY.table
    school, assoc = BY.table[0][1], BY.table[0][2]
    report_line = P.items[6].text
    assert report_line.startswith('تقديم ملاحظات تربوية وتقرير متابعة مختصر كل أسبوعين'), report_line
    ready = C['c-q1']['q1-ready'].paras[-1]
    assert ready.startswith('يُرفع تقرير مختصر كل أسبوعين'), ready
    for w in ('المستهدف', 'المتحقق', 'وأسباب التعثر'):
        assert w in ready, w
    follow, parts, labels = _follow_parts()
    formula = C['c-card']['cd5'].paras[0]
    assert formula.startswith('طريقة الاحتساب: (المنجز الفعلي ÷ المستهدف) × 100'), formula

    # ---------------- tab 1: partner type and obligations
    toggle = (f'<div class="pk-type" role="group" aria-label="نوع الجهة" hidden>'
              f'<button type="button" class="pk-tbtn" data-type="school" aria-pressed="true">{ic("building")}<span>{t(school)}</span></button>'
              f'<button type="button" class="pk-tbtn" data-type="assoc" aria-pressed="false">{ic("users")}<span>{t(assoc)}</span></button></div>')
    by = f'<div class="dp-sub pk-by" id="c-p-by">{head(BY, level=3)}{toggle}{table_html(BY.table, "tbl dp-tbl pk-tbl", caption=BY.title)}</div>'
    deal = f'''
    <div class="pk-panel" role="tabpanel" id="pk-p-deal" aria-labelledby="pk-t-deal" tabindex="0">
      {by}
      <p class="pk-hint" hidden>{ic("check")}<span>علِّم ما تحقق، ويبقى ذلك في هذا المتصفح فقط</span></p>
      <div class="pk-lists">{_check_list(P, 'p')}{_check_list(Y, 'y')}</div>
      <div class="pk-tools" hidden><button type="button" class="btn btn-ghost btn-sm pk-btn" data-print-sheet>{ic("printer")}<span>اطبع وثيقة الشراكة</span></button></div>
    </div>'''

    # ---------------- tab 2: the fortnightly report draft
    a_label = 'أسباب التعثر'
    fields = (
        '<div class="pk-grid pk-meta">'
        + _num('n', 'رقم التقرير')
        + '<div class="f pk-f"><label class="f-l" for="pk-date">التاريخ</label><input id="pk-date" type="date" data-f="date"></div></div>'
        + f'<fieldset class="pk-set"><legend>{t(parts[0])}</legend><div class="pk-grid pk-four">'
        + _num('teamsReg', 'الفرق المسجلة') + _num('teamsReg2', 'الفرق المنتظمة')
        + _num('memReg', 'الأعضاء المسجلون') + _num('memReg2', 'الأعضاء المنتظمون') + '</div></fieldset>'
        + '<div class="pk-grid">' + _num('acts', t(parts[1])) + '</div>'
        + f'<fieldset class="pk-set"><legend>{t(parts[2])}</legend><ol class="pk-proj"></ol>'
        + '<template><div class="f"><label class="f-l">الفريق</label><input type="text" maxlength="60" data-c="0"></div>'
        + '<div class="f"><label class="f-l">وصف مختصر</label><input type="text" maxlength="160" data-c="1"></div></template>'
        + '<button type="button" class="btn btn-ghost btn-sm pk-btn" data-proj-add><span>أضف فريقًا</span></button></fieldset>'
        + f'<fieldset class="pk-set"><legend>{t(parts[3])}</legend><div class="pk-grid pk-rate">'
        + _num('target', 'المستهدف', True) + _num('done', 'المتحقق', True)
        + f'<div class="f pk-f"><span class="f-l" id="pk-pct-l">{t(parts[3])}</span><output data-pct aria-labelledby="pk-pct-l" aria-live="polite">—</output></div></div>'
        + f'<p class="pk-formula">{t(formula)}</p></fieldset>'
        + '<div class="pk-grid">' + _area('challenges', t(parts[4])) + _area('causes', t(a_label)) + _area('next', t(labels[5])) + '</div>'
    )
    report = f'''
    <div class="pk-panel" role="tabpanel" id="pk-p-report" aria-labelledby="pk-t-report" tabindex="0">
      <h3 class="dp-h3">{ic("gauge")}تقرير الأسبوعين</h3>
      <ul class="pk-quotes">
        <li>{t(report_line)}</li>
        <li>{t(ready)}</li>
        <li>{t(follow)}</li>
      </ul>
      <div class="pk-form" hidden>
        <p class="pk-draft">{ic("alert")}<span>مسودة للاستخدام الداخلي مبنية على بنود المتابعة أعلاه</span></p>
        <form class="pk-rform" novalidate autocomplete="off">{fields}</form>
        <div class="pk-tools">
          <button type="button" class="btn btn-primary btn-sm pk-btn" data-save>{ic("check")}<span>احفظ التقرير</span></button>
          <button type="button" class="btn btn-ghost btn-sm pk-btn" data-print-report>{ic("printer")}<span>اطبع التقرير</span></button>
          <button type="button" class="btn btn-ghost btn-sm pk-btn" data-copy>{ic("file-text")}<span>انسخ نص التقرير</span></button>
          <button type="button" class="btn btn-ghost btn-sm pk-btn" data-new-report>{ic("repeat")}<span>تقرير جديد</span></button>
          <button type="button" class="btn btn-ghost btn-sm pk-btn pk-danger" data-clear>{ic("trash")}<span>امسح كل البيانات</span></button>
        </div>
        <p class="pk-status" role="status" aria-live="polite"></p>
        <div class="pk-hist">
          <h4>التقارير المحفوظة</h4>
          <p class="pk-since"></p>
          <svg class="pk-spark" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label=""><polyline points="" fill="none"/></svg>
          <ol class="pk-hlist"></ol>
          <p class="pk-hnone">لا تقارير محفوظة بعد.</p>
        </div>
      </div>
    </div>'''

    # ---------------- print views
    plist = lambda node: (f'<h3>{t(node.title)}</h3><ul class="pk-pchecks">'
                          + ''.join(f'<li><span class="pk-pbox"></span>{t(it.text)}</li>' for it in node.items) + '</ul>')
    by_rows = ''.join(f'<p class="pk-prow"><b>{t(r[0])}:</b> <span class="pk-col-s">{t(r[1])}</span><span class="pk-col-a">{t(r[2])}</span></p>'
                      for r in BY.table[1:])
    sheet = f'''
    <div class="pk-print-sheet" aria-hidden="true">
      <header><b>{t(n.title)}</b><small>{t(C.meta['title'])}</small></header>
      <h3>{t(n['c-p-goal'].title)}</h3><p>{t(n['c-p-goal'].paras[0])}</p>
      {plist(P)}{plist(Y)}
      <h3>{t(BY.title)} — <span class="pk-col-s">{t(school)}</span><span class="pk-col-a">{t(assoc)}</span></h3>{by_rows}
      <h3>{t(n['c-p-after'].title)}</h3><p>{t(n['c-p-after'].paras[0])}</p>
      <div class="pk-psign"><span>اسم الجهة</span><i></i><span>اسم المشرف</span><i></i><span>التوقيع</span><i></i><span>التاريخ</span><i></i></div>
    </div>'''
    rprint = f'''
    <div class="pk-print-report" aria-hidden="true">
      <header><b>تقرير الأسبوعين</b><small>{t(n.title)} · {t(C.meta['title'])}</small></header>
      <p class="pk-pnote">مسودة للاستخدام الداخلي مبنية على بنود المتابعة</p>
      <table class="pk-ptable"><tbody data-preport></tbody></table>
      <p>{t(formula)}</p>
    </div>'''

    data = json.dumps({'v': 1, 'p': len(P.items), 'y': len(Y.items)}).replace('</', '<\\/')
    return f'''
<div class="pk" id="pk" role="region" aria-labelledby="pk-h" data-tabs data-type="school">
  <script type="application/json" id="pk-data">{data}</script>
  <h3 class="pk-title" id="pk-h">{ic("handshake")}ملف الجهة الشريكة وتقرير الأسبوعين</h3>
  <div class="pk-tabs" role="tablist" aria-label="{plain('ملف الجهة الشريكة وتقرير الأسبوعين')}">
    <button type="button" role="tab" id="pk-t-deal" aria-controls="pk-p-deal" aria-selected="true">{ic("handshake")}<span>نوع الجهة والالتزامات</span></button>
    <button type="button" role="tab" id="pk-t-report" aria-controls="pk-p-report" aria-selected="false" tabindex="-1">{ic("gauge")}<span>تقرير الأسبوعين</span></button>
  </div>
  {deal}
  {report}
  {sheet}
  {rprint}
</div>'''
