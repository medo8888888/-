"""meeting-timer — «مؤقّت اللقاء» on method.html (inside section#m-meeting, under the static bar and table).

Four agendas, every word and minute from the documents:
  m90  method.txt  m-meeting table   (نموذج اللقاء الأسبوعي (90 دقيقة) — six segments, 90 minutes)
  l100 leaders.txt l-meeting table   (هيكل اللقاء التدريبي (100 دقيقة) — five segments, 100 minutes)
  l30  leaders.txt l-meeting para 0  (لقاء تقييم قيادي أسبوعي مدته 30 دقيقة — one block)
  q10  quran.txt   a4 item «المصارحة والقصص الأسبوعية» (أول 10 دقائق — one block, standalone, never merged with m90)
No dates or schedules are claimed. The widget ships `hidden`; js/meeting-timer.js reveals it, so without JavaScript
the page shows only the static bar and table. Visible labels written here are UI chrome.
"""
import json
import re

from core import LEADERS as L, METHOD as M, QURAN as Q, ic, plain, strip_colon, t
from docpage import num


def _txt(s):
    """Content text for the JSON payload (read by JS via textContent): quotes curled like t()."""
    return re.sub(r'"([^"\n]+)"', '«\\1»', s)


def agendas():
    out = []
    # m90 — method appendix weekly meeting model
    n = M['m-meeting']
    rows = n.table[1:]
    blocks = [{'min': num(r[0]), 'dur': r[0], 'name': r[1], 'goal': r[2]} for r in rows]
    total = sum(b['min'] for b in blocks)
    assert total == 90 == num(n.title), ('m90', total, n.title)
    out.append({'id': 'm90', 'label': strip_colon(n.title), 'source': M.meta['title'],
                'cols': [n.table[0][1], n.table[0][0], n.table[0][2]], 'blocks': blocks})
    # l100 — leaders' training meeting structure
    n = L['l-meeting']
    blocks = [{'min': num(b), 'dur': b, 'name': a} for a, b in n.table[1:]]
    total = sum(b['min'] for b in blocks)
    assert total == 100 == num(n.title), ('l100', total, n.title)
    out.append({'id': 'l100', 'label': strip_colon(n.title), 'source': L.meta['title'],
                'cols': [n.table[0][0], n.table[0][1]], 'blocks': blocks})
    # l30 — the weekly leadership review (one block; the sentence is a note, not a goal)
    s = n.paras[0]
    name, label = 'لقاء تقييم قيادي أسبوعي', 'لقاء تقييم قيادي أسبوعي مدته 30 دقيقة'
    assert name in s and label in s and 'مدته 30 دقيقة' in s, s
    out.append({'id': 'l30', 'label': label, 'source': L.meta['title'], 'cols': [],
                'blocks': [{'min': 30.0, 'name': name, 'note': s}]})
    # q10 — «المصارحة والقصص الأسبوعية» (first 10 minutes of the halaqa; its own one-block agenda)
    it = [i for i in Q['a4'].items if 'المصارحة والقصص الأسبوعية' in i.label]
    assert len(it) == 1, it
    it = it[0]
    assert 'أول 10 دقائق' in it.body, it.body
    out.append({'id': 'q10', 'label': strip_colon(it.label), 'source': Q.meta['title'], 'cols': [],
                'blocks': [{'min': 10.0, 'name': strip_colon(it.label), 'note': it.body}]})
    for a in out:
        for b in a['blocks']:
            assert b['min'] > 0 and b['name'], b
    return out


def _json(data):
    s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    return s.replace('</', '<\\/')


def html():
    A = agendas()
    payload = [{'id': a['id'], 'label': _txt(a['label']), 'source': _txt(a['source']), 'cols': [_txt(c) for c in a['cols']],
                'blocks': [{k: (_txt(v) if isinstance(v, str) else v) for k, v in b.items()} for b in a['blocks']]} for a in A]
    # options grouped by their source document (optgroup label = the document's own title)
    groups, order = {}, []
    for a in A:
        if a['source'] not in groups:
            groups[a['source']] = []
            order.append(a['source'])
        groups[a['source']].append(a)
    opts = ''.join(f'<optgroup label="{plain(src)}">' + ''.join(
        f'<option value="{a["id"]}">{plain(a["label"])}</option>' for a in groups[src]) + '</optgroup>' for src in order)
    ring = ('<svg class="mt-ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">'
            '<circle class="mt-ring-bg" cx="60" cy="60" r="54"/>'
            '<circle class="mt-ring-fg" cx="60" cy="60" r="54" pathLength="100" data-mt-ring/></svg>')
    return f'''
<div id="mt" class="mt" hidden data-mt>
  <script type="application/json" id="mt-data">{_json(payload)}</script>
  <div class="mt-top">
    <h3 class="mt-h" id="mt-h">{ic('clock')}<span>شغّل اللقاء بالمؤقّت</span></h3>
    <div class="mt-pick">
      <label for="mt-agenda">اختر اللقاء</label>
      <select id="mt-agenda" data-mt-agenda>{opts}</select>
      <p class="mt-src">المصدر: <span data-mt-src></span></p>
    </div>
  </div>
  <div class="mt-run" data-mt-run>
    <div class="mt-stage" tabindex="0" role="group" aria-labelledby="mt-h" aria-describedby="mt-keys" data-mt-stage>
      <div class="mt-dial">
        {ring}
        <div class="mt-dial-in">
          <small class="mt-pos" data-mt-pos></small>
          <span class="mt-time" role="timer" aria-live="off" aria-atomic="true" data-mt-time>00:00</span>
          <small class="mt-over" data-mt-over hidden>انتهى وقت الفقرة</small>
        </div>
      </div>
      <div class="mt-now">
        <p class="mt-name" data-mt-name></p>
        <p class="mt-goal" data-mt-goal></p>
        <p class="mt-next" data-mt-next></p>
        <p class="mt-elapsed" data-mt-elapsed></p>
      </div>
      <p class="sr-only" id="mt-keys">المسافة: إيقاف مؤقت أو استئناف. الأسهم: الفقرة السابقة أو التالية.</p>
    </div>
    <div class="mt-ctrl">
      <button type="button" class="btn btn-primary mt-go" data-mt-start>{ic('clock')}<span>ابدأ اللقاء</span></button>
      <button type="button" class="btn btn-primary mt-go" data-mt-pause hidden><span data-mt-pause-l>أوقف مؤقتًا</span></button>
      <button type="button" class="btn btn-soft" data-mt-prev disabled>الفقرة السابقة</button>
      <button type="button" class="btn btn-soft" data-mt-next-btn disabled>الفقرة التالية</button>
      <button type="button" class="btn btn-soft" data-mt-add disabled>+ دقيقة<span class="sr-only"> للفقرة الحالية</span></button>
      <button type="button" class="btn btn-ghost" data-mt-end disabled>أنهِ اللقاء</button>
      <button type="button" class="btn btn-ghost" data-mt-fs hidden><span data-mt-fs-l>ملء الشاشة</span></button>
    </div>
    <fieldset class="mt-opts">
      <legend>خيارات</legend>
      <label><input type="checkbox" data-mt-opt="auto"> <span>انتقل تلقائيًا للفقرة التالية</span></label>
      <label><input type="checkbox" data-mt-opt="tone"> <span>نغمة خفيفة عند نهاية الفقرة</span></label>
      <label data-mt-vib-wrap hidden><input type="checkbox" data-mt-opt="vib"> <span>اهتزاز</span></label>
    </fieldset>
    <ol class="mt-list" data-mt-list aria-label="فقرات اللقاء"></ol>
  </div>
  <div class="mt-sum" data-mt-sum hidden tabindex="-1" aria-labelledby="mt-sum-h">
    <h4 id="mt-sum-h">ملخص اللقاء</h4>
    <p class="mt-sum-meta" data-mt-sum-meta></p>
    <div class="mt-sum-wrap"><table class="mt-sum-tbl"><thead data-mt-sum-head></thead><tbody data-mt-sum-body></tbody><tfoot data-mt-sum-foot></tfoot></table></div>
    <div class="mt-sum-btns">
      <button type="button" class="btn btn-primary" data-mt-print>{ic('printer')}<span>اطبع ملخص اللقاء</span></button>
      <button type="button" class="btn btn-ghost" data-mt-new>{ic('repeat')}<span>لقاء جديد</span></button>
    </div>
  </div>
  <p class="sr-only" aria-live="polite" data-mt-live></p>
</div>'''
