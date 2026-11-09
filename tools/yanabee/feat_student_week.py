"""«دفتري: حفظ، فهم، تطبيق» — a student's personal notebook for the initiative's routine (inside quran.html #a4).

Feature id: student-week (css/student-week.css, js/student-week.js; assets loaded by features.assets()).

Build time: the five sentences the notebook rests on are read from content.py by their label (never by index) and
asserted, then rendered verbatim with core.t():
  a1  «المنهجية: … من 1 إلى 3 آيات يومياً …»            -> the only numbers in the tool: the paces 1, 2, 3
  a2  «استنباط القيم: …»                                 -> the understanding notes
  a4  «استمارة التطبيق العملي الفردي: …»                  -> the weekly form (printable, A5)
  a3  «مسؤول الجودة والسلوك: …»                          -> closes the printed form (quoted; no signature lines)
  kpis «KPI 2 …»                                         -> a muted reminder (nothing is computed from it)
There is deliberately no ayah-count preset and no surah preset (no document gives one).

Runtime: js/student-week.js. Everything stays in this browser (localStorage 'yanabee-student-week-v1'); nothing is
sent. This is NOT the competition's scoring or submission and the UI never suggests it is.
"""
import json
import re

from core import QURAN as Q, ic, split_kicker, strip_colon, t

ID = 'student-week'


def _src(sid):
    """Small source tag: the document title and the axis, linking to the axis on this page."""
    kicker, _ = split_kicker(Q[sid].title)
    return (f'<a class="sw-src" href="#{sid}">{ic("file-text")}<span>{t(Q.meta["title"])}'
            f' — {t(kicker or Q[sid].title)}</span></a>')


def data():
    pace_item = next(i for i in Q['a1'].items if i.label.startswith('المنهجية'))
    assert 'من 1 إلى 3 آيات يومياً' in pace_item.body, 'student-week: pace sentence changed'
    m = re.search(r'من (\d+) إلى (\d+) آيات', pace_item.body)
    lo, hi = int(m.group(1)), int(m.group(2))
    paces = list(range(lo, hi + 1))
    assert paces == [1, 2, 3], paces
    fahm_item = next(i for i in Q['a2'].items if i.label.startswith('استنباط القيم'))
    form_item = next(i for i in Q['a4'].items if i.label.startswith('استمارة التطبيق العملي الفردي'))
    role = next(c for c in Q['a3'].items[0].children if c.label == 'مسؤول الجودة والسلوك')
    kpi2 = next(i for i in Q['a11']['kpis'].items if i.label.startswith('KPI 2 '))
    assert '90%' in kpi2.body, 'student-week: KPI 2 changed'
    return {'pace': pace_item, 'fahm': fahm_item, 'form': form_item, 'role': role, 'kpi2': kpi2, 'paces': paces}


def _quote(it, sid):
    return (f'<blockquote class="sw-q"><p><b>{t(strip_colon(it.label))}:</b> {t(it.body)}</p>'
            f'{_src(sid)}</blockquote>')


UNIT = {1: 'آية', 2: 'آيتان'}  # chrome: the unit word under each pace number


def html():
    d = data()
    paces = ''.join(
        f'<label class="sw-pace"><input type="radio" name="sw-pace" value="{p}">'
        f'<span><b>{p}</b><small>{UNIT.get(p, "آيات")}</small></span></label>' for p in d['paces'])
    form, role = d['form'], d['role']
    payload = json.dumps({'paces': d['paces']}, separators=(',', ':'))
    return f'''
<div class="sw-box" id="{ID}">
  <header class="sw-head">
    <span class="sw-hic" aria-hidden="true">{ic('book-open')}</span>
    <div>
      <h3 id="sw-title">دفتري: حفظ، فهم، تطبيق</h3>
      <p class="sw-note">دفتر في متصفحك فقط، لا يُرسل منه شيء، وليس تطبيق المبادرة الموصوف في المحور الخامس.</p>
    </div>
  </header>
  <p class="sw-store" id="sw-store" role="status" hidden>{ic('alert')}<span>لن تُحفظ بياناتك في هذا المتصفح</span></p>
  <div class="sw-tabs" role="tablist" aria-label="أقسام الدفتر" data-seg="own" hidden>
    <button type="button" role="tab" id="sw-tab-hifz" aria-controls="sw-p-hifz" aria-selected="true">{ic('book')}<span>حفظي اليومي</span></button>
    <button type="button" role="tab" id="sw-tab-fahm" aria-controls="sw-p-fahm" aria-selected="false" tabindex="-1">{ic('lightbulb')}<span>فهمي</span></button>
    <button type="button" role="tab" id="sw-tab-tatbeeq" aria-controls="sw-p-tatbeeq" aria-selected="false" tabindex="-1">{ic('hand-heart')}<span>تطبيقي هذا الأسبوع</span></button>
  </div>

  <section class="sw-panel" id="sw-p-hifz" role="tabpanel" aria-labelledby="sw-tab-hifz">
    <h4 class="sw-ph">حفظي اليومي</h4>
    {_quote(d['pace'], 'a1')}
    <div class="sw-tool" hidden>
      <div class="sw-row2">
        <fieldset class="sw-paces">
          <legend>مقداري اليومي</legend>
          <div class="sw-pace-row">{paces}</div>
        </fieldset>
        <div class="sw-f">
          <label for="sw-total">عدد آيات المقطع الذي أحفظه</label>
          <input id="sw-total" type="number" min="1" step="1" inputmode="numeric" autocomplete="off" aria-describedby="sw-total-h">
          <small id="sw-total-h" class="sw-hint">اكتبه من مصحفك أو كما حدده المعلم</small>
        </div>
      </div>
      <p class="sw-out" id="sw-days" aria-live="polite"></p>
      <div class="sw-cal" id="sw-cal">
        <div class="sw-cal-bar">
          <button type="button" class="sw-btn sw-icon-btn" id="sw-prev-m"><span class="sw-flip" aria-hidden="true">{ic('arrow-left')}</span><span class="sr-only">الشهر السابق</span></button>
          <h5 class="sw-month" id="sw-month" aria-live="polite"></h5>
          <button type="button" class="sw-btn sw-icon-btn" id="sw-next-m">{ic('arrow-left')}<span class="sr-only">الشهر التالي</span></button>
        </div>
        <div class="sw-wd" id="sw-wd" aria-hidden="true"></div>
        <div class="sw-grid" id="sw-grid" role="group" aria-label="أيام الشهر"></div>
        <p class="sw-legend" aria-hidden="true"><span><i class="sw-dot d-h"></i>حفظت</span><span><i class="sw-dot d-r"></i>راجعت</span><span><i class="sw-today-k"></i>اليوم</span></p>
      </div>
      <fieldset class="sw-daybox">
        <legend id="sw-day-l"></legend>
        <label class="sw-check"><input type="checkbox" id="sw-did-h"><span>حفظت مقداري</span></label>
        <label class="sw-check"><input type="checkbox" id="sw-did-r"><span>راجعت</span></label>
      </fieldset>
      <p class="sw-out sw-week" id="sw-last7" aria-live="polite"></p>
    </div>
  </section>

  <section class="sw-panel" id="sw-p-fahm" role="tabpanel" aria-labelledby="sw-tab-fahm">
    <h4 class="sw-ph">فهمي</h4>
    {_quote(d['fahm'], 'a2')}
    <div class="sw-tool" hidden>
      <form class="sw-form" id="sw-fahm-form" novalidate>
        <div class="sw-row2">
          <div class="sw-f"><label for="sw-f-ayat">الآيات</label><input id="sw-f-ayat" type="text" autocomplete="off"></div>
          <div class="sw-f"><label for="sw-f-date">التاريخ</label><input id="sw-f-date" type="date"></div>
        </div>
        <div class="sw-f"><label for="sw-f-value">القيمة أو الحكم الذي استخرجته</label><textarea id="sw-f-value" rows="3"></textarea></div>
        <p class="sw-msg" id="sw-fahm-msg" aria-live="polite"></p>
        <button type="submit" class="sw-btn sw-primary">{ic('check')}<span>أضف</span></button>
      </form>
      <h5 class="sw-sub">ما سجّلته</h5>
      <ul class="sw-list" id="sw-fahm-list"></ul>
      <p class="sw-empty" id="sw-fahm-empty">لم تسجّل شيئاً بعد.</p>
    </div>
  </section>

  <section class="sw-panel" id="sw-p-tatbeeq" role="tabpanel" aria-labelledby="sw-tab-tatbeeq">
    <h4 class="sw-ph">تطبيقي هذا الأسبوع</h4>
    {_quote(form, 'a4')}
    <div class="sw-tool" hidden>
      <form class="sw-form" id="sw-week-form" novalidate>
        <div class="sw-weekbar">
          <div class="sw-f"><label for="sw-w-start">بداية الأسبوع</label><input id="sw-w-start" type="date" aria-describedby="sw-w-range"></div>
          <div class="sw-wnav">
            <button type="button" class="sw-btn" id="sw-w-prev"><span class="sw-flip" aria-hidden="true">{ic('arrow-left')}</span><span>الأسبوع السابق</span></button>
            <button type="button" class="sw-btn" id="sw-w-next"><span>الأسبوع التالي</span>{ic('arrow-left')}</button>
          </div>
        </div>
        <p class="sw-hint" id="sw-w-range"></p>
        <div class="sw-row2">
          <div class="sw-f"><label for="sw-w-name">الاسم (اختياري)</label><input id="sw-w-name" type="text" autocomplete="off"></div>
          <div class="sw-f"><label for="sw-w-value">القيمة المدروسة</label><input id="sw-w-value" type="text" autocomplete="off"></div>
        </div>
        <div class="sw-f"><label for="sw-w-task">المهمة الأسبوعية</label><textarea id="sw-w-task" rows="2"></textarea></div>
        <div class="sw-f"><label for="sw-w-report">تقرير قصير</label><textarea id="sw-w-report" rows="4" aria-describedby="sw-w-report-h"></textarea>
          <small class="sw-hint" id="sw-w-report-h">بضعة أسطر عمّا فعلت وما لاحظت</small></div>
        <p class="sw-msg" id="sw-week-msg" aria-live="polite"></p>
        <div class="sw-actions">
          <button type="submit" class="sw-btn sw-primary">{ic('check')}<span>احفظ هذا الأسبوع</span></button>
          <button type="button" class="sw-btn" id="sw-print-btn">{ic('printer')}<span>اطبع الاستمارة</span></button>
        </div>
      </form>
      <h5 class="sw-sub">أسابيعي المحفوظة</h5>
      <ul class="sw-list" id="sw-weeks"></ul>
      <p class="sw-empty" id="sw-weeks-empty">لا أسابيع محفوظة بعد.</p>
    </div>
    <p class="sw-kpi"><span>هدف جماعي في المبادرة: </span><a href="#kpi2">{t(d['kpi2'].text)}</a><span> — وليس درجة شخصية.</span></p>
  </section>

  <div class="sw-foot" hidden>
    <button type="button" class="sw-btn sw-danger" id="sw-clear">{ic('trash')}<span>امسح بياناتي</span></button>
  </div>

  <div class="sw-print" id="sw-print" aria-hidden="true">
    <h2>{t(strip_colon(form.label))}</h2>
    <p class="sw-print-note">{t(form.body)}</p>
    <dl class="sw-print-f">
      <div><dt>الاسم</dt><dd data-f="name"></dd></div>
      <div><dt>الأسبوع</dt><dd data-f="range"></dd></div>
      <div><dt>القيمة المدروسة</dt><dd data-f="value"></dd></div>
      <div class="tall"><dt>المهمة الأسبوعية</dt><dd data-f="task"></dd></div>
      <div class="taller"><dt>تقرير قصير</dt><dd data-f="report"></dd></div>
    </dl>
    <p class="sw-print-role"><b>{t(role.label)}:</b> {t(role.body)}</p>
    <p class="sw-print-src">{t(Q.meta['title'])} — {t(split_kicker(Q['a4'].title)[0])}، {t(split_kicker(Q['a3'].title)[0])}</p>
  </div>
  <script type="application/json" id="sw-data">{payload}</script>
</div>'''
