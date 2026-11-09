"""judge-sheet — «ورقة التحكيم وتقييم المشروع» (competition.html, inside #c-score, after #c-rubric).

Two tabs: a self-check of the application project against the proposed 45-point rubric (c-rubric), and a judges'
worksheet that adds up the five weights of c-score (10/15/45/20/10) per team and ranks the totals.

Every number comes from the documents at build time (asserted below); every content line is rendered with t() from the
parsed nodes. Behaviour: site/yanabee/js/judge-sheet.js. Styles: site/yanabee/css/judge-sheet.css.
Nothing is sent anywhere: the visitor's numbers stay in that browser (localStorage 'yanabee-judge-sheet-v1').
"""
import json
import re

from core import COMP as C, ic, plain, t

APPLY = 'التطبيق'  # the axis that the rubric (c-rubric) breaks down
TOTAL_ROW = 'الإجمالي'


def _data():
    s = C['c-score']
    para = s.paras[0]
    W = [(k, int(v)) for k, v in re.findall(r'(الحفظ|الفهم|التطبيق|كرة القدم|الشطرنج)\s+(\d+)', para)]
    assert dict(W) == {'الحفظ': 10, 'الفهم': 15, 'التطبيق': 45, 'كرة القدم': 20, 'الشطرنج': 10}, W
    assert sum(v for _, v in W) == 100, W
    rub = s['c-rubric']
    R = [(label, int(v)) for label, v in rub.table[1:] if label != TOTAL_ROW]
    total = [int(v) for label, v in rub.table[1:] if label == TOTAL_ROW]
    assert len(R) == 4 and total and sum(v for _, v in R) == total[0] == dict(W)[APPLY] == 45, (R, total)
    return s, para, W, rub, R


def _find(items, start):
    hit = [it.text for it in items if it.text.startswith(start)]
    assert len(hit) == 1, (start, [i.text for i in items])
    return hit[0]


def _evidence(R):
    """Exact source lines that describe each rubric criterion (verbatim, in document wording)."""
    form, card = C['c-form'], C['c-card']
    axes_rows = [r for r in C['c-axes'].table[1:] if r[0] == 'السلوكي والمجتمعي']
    assert len(axes_rows) == 1
    warn = [p for p in card['cd4'].paras if p.startswith('تنبيه:')]
    assert len(warn) == 1
    ev = {
        'وضوح فكرة المشروع وارتباطها بقيم السورة': [form['f-apply'].paras[0]],
        'مشاركة أعضاء الفريق وتوزيع الأدوار': [_find(form['f-nom'].items, 'جميع الأعضاء:'),
                                              _find(form['f-apply'].items, 'مسؤول التنسيق والتوثيق بالفريق')],
        'التنفيذ الفعلي للمشروع': [C['c-partner']['c-p-partner'].items[4].text,
                                   _find(C['c-q1']['q1-ready'].items, 'المشروع الجاهز:')],
        'توثيق النتائج والأثر': [axes_rows[0][2], warn[0]],
    }
    assert set(ev) == {label for label, _ in R}, (set(ev), R)
    assert ev['التنفيذ الفعلي للمشروع'][0].startswith('مساعدة الفريق على إعداد وتنفيذ مشروع تطبيقي')
    return ev


def _fields(W, R):
    """The judges' inputs in document order: one per weighted axis, the applied axis split into its rubric rows."""
    out = []
    for i, (label, mx) in enumerate(W):
        if label == APPLY:
            out += [{'k': f'r{j}', 'max': v, 'apply': True} for j, (_, v) in enumerate(R)]
        else:
            out.append({'k': f'a{i}', 'max': mx, 'apply': False})
    return out


def _jsdata(W, R):
    data = {'v': 1, 'weights': [v for _, v in W], 'applyIndex': [k for k, _ in W].index(APPLY),
            'rubric': [v for _, v in R], 'fields': _fields(W, R), 'total': sum(v for _, v in W),
            'applyMax': sum(v for _, v in R)}
    return json.dumps(data, ensure_ascii=False).replace('</', '<\\/')


def _num_field(k, label_html, mx, hint_id=''):
    h = ''
    desc = f' aria-describedby="jsh-e-{k}{" " + hint_id if hint_id else ""}"'
    return (f'<div class="f jsh-f" data-field="{k}"><label class="f-l" for="jsh-in-{k}">{label_html} <span class="jsh-max">/ {mx}</span></label>'
            f'<input id="jsh-in-{k}" type="text" inputmode="decimal" autocomplete="off" data-k="{k}" data-max="{mx}" placeholder="—"{desc}>'
            f'{h}<span class="jsh-err" id="jsh-e-{k}" role="alert" hidden></span></div>')


def html():
    s, para, W, rub, R = _data()
    ev = _evidence(R)
    tl = C['c-plan']['c-timeline'].items
    assert tl[3].text.endswith('ومراجعة نتائج التحكيم أسبوعيًا.') and tl[5].text.startswith('15 – 24 يناير:')
    tie = _find(C['c-rules'].items, 'وضع سياسة تحكيم')
    apply_max = sum(v for _, v in R)

    # ---- tab 1: self-check ----
    crit = ''
    for j, (label, mx) in enumerate(R):
        lines = ''.join(f'<li>{t(x)}</li>' for x in ev[label])
        crit += (f'<li class="jsh-crit" data-i="{j}"><div class="jsh-crit-top">'
                 f'<label class="f-l" for="jsh-s{j}">{t(label)}</label>'
                 f'<span class="jsh-start" hidden>ابدؤوا من هنا</span>'
                 f'<output class="jsh-out" for="jsh-s{j}" id="jsh-o{j}"><b>0</b> / {mx}</output></div>'
                 f'<input class="jsh-range" type="range" id="jsh-s{j}" min="0" max="{mx}" step="1" value="0" data-max="{mx}"'
                 f' aria-valuetext="0 من {mx}">'
                 f'<div class="jsh-ev"><span class="jsh-ev-h">{ic("book-open")}من الوثائق</span><ul>{lines}</ul></div></li>')
    self_panel = f'''
    <div class="jsh-panel" role="tabpanel" id="jsh-p-self" aria-labelledby="jsh-t-self" tabindex="0">
      <p class="jsh-rubt">{t(rub.title)}</p>
      <p class="jsh-note">{ic("alert")}<span>تقدير ذاتي للمراجعة، لا يتنبأ بدرجة لجنة التحكيم.</span></p>
      <div class="jsh-self">
        <ol class="jsh-crits">{crit}</ol>
        <div class="jsh-side">
          <div class="jsh-ring" style="--p:0" aria-hidden="true"><b data-ring-n>0</b><small>من {apply_max}</small></div>
          <p class="jsh-score" aria-live="polite" aria-atomic="true">تقديركم: <b data-self-total>0</b> من {apply_max}</p>
          <p class="jsh-full" hidden>اكتملت الدرجات في تقديركم</p>
          <button type="button" class="btn btn-ghost btn-sm jsh-btn" data-self-reset>{ic("repeat")}<span>أعد الضبط</span></button>
        </div>
      </div>
    </div>'''

    # ---- tab 2: judges' worksheet ----
    fields = ''
    for i, (label, mx) in enumerate(W):
        if label == APPLY:
            sub = ''.join(_num_field(f'r{j}', t(rl), rv) for j, (rl, rv) in enumerate(R))
            fields += (f'<div class="jsh-apply" role="group" aria-labelledby="jsh-apply-h"><p class="jsh-apply-h" id="jsh-apply-h">{t(rub.title)}</p>'
                       f'<div class="jsh-grid">{sub}</div>'
                       f'<p class="jsh-apply-sum"><span>{t(label)} <span class="jsh-max">/ {mx}</span></span>'
                       f'<output data-apply-sum aria-live="polite">—</output></p></div>')
        else:
            sport = label in ('كرة القدم', 'الشطرنج')
            fields += _num_field(f'a{i}', t(label), mx, 'jsh-h-sport' if sport else '')
            if label == 'الشطرنج':
                fields += '<p class="f-hint jsh-sport-h" id="jsh-h-sport">تُكتب كما تعتمدها اللجنة؛ لا تحويل تلقائي من نقاط الدوري</p>'
    assert [k for k, _ in W][-2:] == ['كرة القدم', 'الشطرنج']
    segs = ''.join(f'<li style="--w:{mx}" data-seg="{i}"><i style="--f:0"></i></li>' for i, (label, mx) in enumerate(W))
    seg_key = ''.join(f'<li>{t(label)} <span class="jsh-max">/ {mx}</span></li>' for label, mx in W)
    total = sum(v for _, v in W)
    rank_head = ''.join(f'<th scope="col">{t(label)}</th>' for label, _ in W)
    judge_panel = f'''
    <div class="jsh-panel" role="tabpanel" id="jsh-p-judge" aria-labelledby="jsh-t-judge" tabindex="0">
      <div class="jsh-banner">{ic("lock")}<div><p>ورقة عمل للتجربة والمراجعة؛ تبقى في هذا المتصفح ولا تُرسَل إلى أي جهة.</p>
        <ul class="jsh-quotes"><li>{t(tl[3].text)}</li><li>{t(tl[5].text)}</li></ul></div></div>
      <div class="jsh-add">
        <div class="f"><label class="f-l" for="jsh-name">اسم الفريق</label>
          <input id="jsh-name" type="text" maxlength="60" autocomplete="off" aria-describedby="jsh-name-e jsh-name-h"></div>
        <button type="button" class="btn btn-primary btn-sm jsh-btn" data-add>{ic("users")}<span>أضف فريقًا</span></button>
      </div>
      <p class="jsh-err jsh-add-e" id="jsh-name-e" role="alert" hidden></p>
      <p class="f-hint jsh-add-h" id="jsh-name-h">اسم الفريق فقط، دون أسماء الأعضاء أو أي بيانات شخصية.</p>
      <div class="jsh-pick" hidden>
        <div class="f"><label class="f-l" for="jsh-sel">الفريق المعروض</label><select id="jsh-sel"></select></div>
        <button type="button" class="btn btn-ghost btn-sm jsh-btn jsh-del" data-del>{ic("trash")}<span>احذف الفريق</span></button>
      </div>
      <fieldset class="fpart jsh-card" hidden>
        <legend><b data-team-name></b></legend>
        <div class="jsh-grid jsh-main">{fields}</div>
        <div class="jsh-total">
          <p class="jsh-total-n" aria-live="polite" aria-atomic="true"><span>المجموع <span class="jsh-max">/ {total}</span></span> <b data-total>0</b></p>
          <ol class="jsh-seg" aria-hidden="true">{segs}</ol>
          <ul class="jsh-seg-key" aria-hidden="true">{seg_key}</ul>
        </div>
      </fieldset>
      <div class="jsh-rank">
        <h4 class="jsh-h4">ورقة الترتيب</h4>
        <p class="jsh-empty">أضف فريقًا لتظهر ورقة الترتيب</p>
        <div class="jsh-scroll" hidden tabindex="0" role="region" aria-label="ورقة الترتيب">
          <table class="jsh-table"><thead><tr><th scope="col">#</th><th scope="col">الفريق</th>{rank_head}<th scope="col">المجموع</th></tr></thead>
          <tbody></tbody></table>
        </div>
        <p class="jsh-tie" hidden>{ic("scale")}<span>{t(tie)}</span></p>
      </div>
      <div class="jsh-tools">
        <button type="button" class="btn btn-ghost btn-sm jsh-btn" data-print-mode="team" disabled>{ic("printer")}<span>اطبع ورقة فريق</span></button>
        <button type="button" class="btn btn-ghost btn-sm jsh-btn" data-print-mode="blank">{ic("printer")}<span>اطبع ورقة فارغة</span></button>
        <button type="button" class="btn btn-ghost btn-sm jsh-btn" data-print-mode="rank" disabled>{ic("printer")}<span>اطبع الترتيب</span></button>
        <button type="button" class="btn btn-ghost btn-sm jsh-btn" data-export disabled>{ic("file-text")}<span>احفظ نسخة في ملف</span></button>
        <label class="btn btn-ghost btn-sm jsh-btn jsh-file">{ic("file-text")}<span>افتح نسخة من ملف</span>
          <input type="file" accept="application/json,.json" data-import class="sr-only"></label>
      </div>
      <p class="jsh-status" role="status" aria-live="polite"></p>
    </div>'''

    # ---- print views (filled by the script at print time) ----
    prow = ''
    for i, (label, mx) in enumerate(W):
        if label == APPLY:
            prow += f'<tr class="jsh-pr-apply"><th scope="row">{t(label)}</th><td>/ {mx}</td><td data-pv="apply"></td></tr>'
            prow += ''.join(f'<tr class="jsh-pr-sub"><th scope="row">{t(rl)}</th><td>/ {rv}</td><td data-pv="r{j}"></td></tr>'
                            for j, (rl, rv) in enumerate(R))
        else:
            prow += f'<tr><th scope="row">{t(label)}</th><td>/ {mx}</td><td data-pv="a{i}"></td></tr>'
    prow += f'<tr class="jsh-pr-total"><th scope="row">المجموع</th><td>/ {total}</td><td data-pv="total"></td></tr>'
    printv = f'''
    <div class="jsh-print" aria-hidden="true">
      <header><b>ورقة التحكيم وتقييم المشروع</b><small>{t(C.meta['title'])}</small></header>
      <p class="jsh-p-para">{t(para)}</p>
      <div class="jsh-p-sheet">
        <p class="jsh-p-line"><span>اسم الفريق</span><i data-pv="name"></i></p>
        <p class="jsh-p-rub">{t(rub.title)}</p>
        <table class="jsh-ptable"><tbody>{prow}</tbody></table>
        <div class="jsh-p-sign"><span>التوقيع</span><i></i><span>التاريخ</span><i></i></div>
      </div>
      <div class="jsh-p-rank">
        <table class="jsh-ptable"><thead><tr><th>#</th><th>الفريق</th>{''.join(f'<th>{t(label)} / {mx}</th>' for label, mx in W)}<th>المجموع / {total}</th></tr></thead><tbody data-prank></tbody></table>
        <p class="jsh-p-tie">{t(tie)}</p>
      </div>
      <p class="jsh-p-note">ورقة عمل للتجربة والمراجعة؛ تبقى في هذا المتصفح ولا تُرسَل إلى أي جهة.</p>
      <ul class="jsh-p-quotes"><li>{t(tl[3].text)}</li><li>{t(tl[5].text)}</li></ul>
    </div>'''

    return f'''
<div class="jsh" id="jsh" role="region" data-tabs hidden aria-labelledby="jsh-h">
  <script type="application/json" id="jsh-data">{_jsdata(W, R)}</script>
  <h3 class="dp-h3 jsh-title" id="jsh-h">{ic("scale")}ورقة التحكيم وتقييم المشروع</h3>
  <div class="jsh-tabs" role="tablist" aria-label="{plain('ورقة التحكيم وتقييم المشروع')}">
    <button type="button" role="tab" id="jsh-t-self" aria-controls="jsh-p-self" aria-selected="true">{ic("target")}<span>قيّموا مشروعكم بأنفسكم</span></button>
    <button type="button" role="tab" id="jsh-t-judge" aria-controls="jsh-p-judge" aria-selected="false" tabindex="-1">{ic("users")}<span>ورقة لجنة التحكيم</span></button>
  </div>
  {self_panel}
  {judge_panel}
  {printv}
</div>'''
