"""calendar-ics — «أضف مواعيد المسابقة إلى تقويمك» (competition.html, inside #c-timeline).

The dates are the competition document's own dates (competition.txt c-timeline lines 1–6 and the c-terms rows
'بداية المسابقة', 'نهاية المسابقة', 'حفل الجوائز'). Each window is written below as the line states it, and the build
fails if a line no longer states that day/month (and, for c-terms, that year). Line 0 'قبل 1 نوفمبر' has no start
date, so it cannot be an event. The optional weekly meeting uses the c-terms row 'المتابعة' verbatim; its weekday is
chosen by the visitor, because the document gives none.

Markup: the event list (labels via t()), the weekday select, buttons and a hidden fallback; the ICS strings travel in
<script type="application/json" id="ics-data">. Behaviour: site/yanabee/js/calendar-ics.js. Styles: css/calendar-ics.css.
Nothing is sent anywhere; the file is made in the browser.
"""
import json
import re
from datetime import date, timedelta

from core import COMP as C, ic, strip_colon, t

UID = 'yanabee-{}@yanabee.local'
FILE = 'yanabee-competition.ics'
MONTH = {11: 'نوفمبر', 12: 'ديسمبر', 1: 'يناير'}

# c-timeline item index -> (first day, last day), as the line's label states it. Item 0 has no start date.
WINDOWS = {
    1: ('2026-11-01', '2026-11-14'),   # 1 – 14 نوفمبر
    2: ('2026-11-15', '2026-11-30'),   # 15 – 30 نوفمبر
    3: ('2026-12-01', '2026-12-31'),   # 1 – 31 ديسمبر
    4: ('2027-01-01', '2027-01-15'),   # 1 – 15 يناير (the text says 15)
    5: ('2027-01-15', '2027-01-24'),   # 15 – 24 يناير
    6: ('2027-01-25', '2027-01-30'),   # 25 – 30 يناير (the text says 30)
}
# c-terms rows (first cell) -> the single day the row states
TERMS = {
    'بداية المسابقة': ('start', '2026-11-15'),
    'نهاية المسابقة': ('end', '2027-01-25'),
    'حفل الجوائز': ('gala', '2027-01-31'),
}
WEEKLY_ROW = 'المتابعة'

# UI chrome (never a fact): the weekday picker; values are JavaScript getDay() numbers
WEEKDAYS = [('6', 'السبت'), ('0', 'الأحد'), ('1', 'الاثنين'), ('2', 'الثلاثاء'), ('3', 'الأربعاء'), ('4', 'الخميس'), ('5', 'الجمعة')]


def _txt(s):
    """Plain text for the calendar file: the same quote curling as t(), no HTML."""
    return re.sub(r'"([^"\n]+)"', '«\\1»', s)


def _d(iso):
    return date.fromisoformat(iso)


def _assert_states(src, first, last, year=False):
    """The source text must state the day numbers and month names (and the year when asked) of this event."""
    nums = re.findall(r'\d+', src)
    for d in (first, last):
        if str(d.day) not in nums or MONTH[d.month] not in src or (year and str(d.year) not in nums):
            raise ValueError(f'calendar-ics: {src!r} does not state {d.isoformat()}')


def events():
    """[(kind, label, sub, ev)] in date order; ev is the JSON object for one VEVENT."""
    plan = C['c-plan']
    span = plan.paras[0]  # '… من 15 نوفمبر 2026 إلى 25 يناير 2027 …' gives the years of the timeline's months
    if not ('نوفمبر 2026' in span and 'يناير 2027' in span):
        raise ValueError('calendar-ics: c-plan no longer states نوفمبر 2026 … يناير 2027')
    project = C.meta['project']
    tl = plan['c-timeline'].items
    out = []
    for i, (a, b) in WINDOWS.items():
        it = tl[i]
        label = strip_colon(it.label)
        first, last = _d(a), _d(b)
        _assert_states(label, first, last)
        if first.year != (2027 if first.month == 1 else 2026) or last.year != (2027 if last.month == 1 else 2026):
            raise ValueError(f'calendar-ics: year of {label!r} does not follow c-plan')
        out.append(('c-timeline', label, it.body, {
            'uid': UID.format(f'c-timeline-{i}'), 'start': first.strftime('%Y%m%d'),
            'end': (last + timedelta(days=1)).strftime('%Y%m%d'), 'last': b,
            'summary': _txt(project) + ' — ' + _txt(label), 'description': _txt(it.body)}))
    rows = {r[0]: r for r in C['c-terms'].table[1:]}
    for name, (key, iso) in TERMS.items():
        row = rows[name]
        day = _d(iso)
        _assert_states(row[1], day, day, year=True)
        out.append(('c-terms', row[0], row[1], {
            'uid': UID.format(f'c-terms-{key}'), 'start': day.strftime('%Y%m%d'),
            'end': (day + timedelta(days=1)).strftime('%Y%m%d'), 'last': iso,
            'summary': _txt(project) + ' — ' + _txt(row[0]), 'description': _txt(row[0]) + ': ' + _txt(row[1])}))
    out.sort(key=lambda e: (e[3]['start'], e[3]['end']))
    return out


def data():
    rows = {r[0]: r for r in C['c-terms'].table[1:]}
    wk = rows[WEEKLY_ROW]
    start, end = rows['بداية المسابقة'][1], rows['نهاية المسابقة'][1]
    _assert_states(start, _d('2026-11-15'), _d('2026-11-15'), year=True)
    _assert_states(end, _d('2027-01-25'), _d('2027-01-25'), year=True)
    project = C.meta['project']
    return {
        'file': FILE,
        'events': [e[3] for e in events()],
        'weekly': {'uid': UID.format('c-terms-weekly'), 'from': '2026-11-15', 'until': '20270125',
                   'summary': _txt(project) + ' — ' + _txt(wk[1]), 'description': _txt(wk[0]) + ': ' + _txt(wk[1]),
                   'untilText': _txt(end)},
        'months': {str(k): v for k, v in MONTH.items()},
    }


def html():
    evs = events()
    rows = {r[0]: r for r in C['c-terms'].table[1:]}
    wk = rows[WEEKLY_ROW]
    items = ''
    for i, (src, label, sub, ev) in enumerate(evs):
        items += (f'<li class="ics-ev" data-src="{src}"><label class="ics-row">'
                  f'<input type="checkbox" class="ics-cb" value="{ev["uid"]}" data-last="{ev["last"]}" checked>'
                  f'<span class="ics-t"><b>{t(label)}</b><small>{t(sub)}</small></span>'
                  f'<span class="ics-past" hidden>انتهى</span></label></li>')
    items += (f'<li class="ics-ev ics-wk" data-ics-wkrow hidden><span class="ics-row"><span class="ics-rep">{ic("repeat")}</span>'
              f'<span class="ics-t"><b>{t(wk[0])}</b><small>{t(wk[1])}</small></span>'
              f'<span class="ics-day" data-ics-wkday></span></span></li>')
    opts = '<option value="">— بلا —</option>' + ''.join(f'<option value="{v}">{n}</option>' for v, n in WEEKDAYS)
    blob = json.dumps(data(), ensure_ascii=False).replace('</', '<\\/')
    return f'''
<div class="ics" id="ics" role="group" data-ics hidden aria-labelledby="ics-h">
  <div class="ics-head"><span class="ics-ic">{ic('calendar')}</span>
    <div><h4 id="ics-h">أضف مواعيد المسابقة إلى تقويمك</h4>
    <p class="ics-note">المواعيد طوال اليوم؛ الوثيقة لا تذكر ساعات.</p></div></div>
  <fieldset class="ics-set">
    <legend class="ics-leg">اختر المواعيد التي تريدها في ملف التقويم</legend>
    <div class="ics-bulk"><button type="button" class="ics-mini" data-ics-all>حدّد الكل</button><button type="button" class="ics-mini" data-ics-none>ألغِ التحديد</button></div>
    <ul class="ics-list">{items}</ul>
  </fieldset>
  <div class="ics-wkpick">
    <label for="ics-wd">لقاء المتابعة الأسبوعي: اختر اليوم الذي تعلنه الجهة المنظِّمة (الوثيقة لا تحدد يومًا)</label>
    <select id="ics-wd" data-ics-wd>{opts}</select>
    <p class="ics-hint" data-ics-wkhint hidden></p>
  </div>
  <p class="ics-status" id="ics-status" aria-live="polite" data-ics-status></p>
  <div class="ics-actions">
    <button type="button" class="btn btn-primary ics-dl" data-ics-dl>{ic('calendar')}<span>نزّل ملف التقويم (ics)</span></button>
    <button type="button" class="btn btn-ghost btn-sm ics-pr" data-ics-print>{ic('printer')}<span>اطبع المواعيد المحددة</span></button>
  </div>
  <details class="ics-fb" data-ics-fb hidden>
    <summary>لم يُنزَّل الملف؟</summary>
    <p>إن لم يُنزَّل الملف، انسخ هذا النص واحفظه في ملف ينتهي بـ <bdi dir="ltr">.ics</bdi></p>
    <textarea id="ics-text" class="ics-text" readonly rows="7" dir="ltr" spellcheck="false" aria-label="نص ملف التقويم"></textarea>
    <div class="ics-copyrow"><button type="button" class="btn btn-ghost btn-sm" data-ics-copy>{ic('file-text')}<span>انسخ النص</span></button>
    <span class="ics-copied" data-ics-copied aria-live="polite"></span></div>
  </details>
  <script type="application/json" id="ics-data">{blob}</script>
</div>'''

