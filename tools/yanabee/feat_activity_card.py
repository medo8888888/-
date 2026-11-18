"""activity-card — «املأ بطاقة نشاط» (competition.html, #guide, after the folds).

A fillable, printable copy of «بطاقة إعداد وتنفيذ ومتابعة وتقييم النشاط» (c-card, cd1–cd6). Every label, option and
example comes from the document through t() / plain(); the rest is UI chrome. The c-card fold above stays as it is.
Behaviour: site/yanabee/js/activity-card.js (autosave in this browser only, key 'yanabee-activity-card-v1').
Styles: site/yanabee/css/activity-card.css. Ids are prefixed 'ac-' (the fold already uses c-card and cd1–cd6).
"""
import json
import re

from core import COMP as C, ic, plain, split_kicker, strip_colon, t

DASH = ' – '
# Number fields are text + inputmode so Arabic-Indic digits work (a type=number input drops them); activity-card.js
# normalises the digits and computes only from non-negative numbers.
NUM = 'type="text" inputmode="decimal" autocomplete="off" data-num'


def _split_dash(cell):
    parts = [p.strip() for p in cell.split(DASH)]
    assert all(parts), cell
    return parts


def _checks(key, parts, cls='ac-checks'):
    return f'<ul class="{cls}">' + ''.join(
        f'<li><label class="ac-opt"><input type="checkbox" data-k="{key}-{j}"><span>{t(p)}</span></label></li>'
        for j, p in enumerate(parts)) + '</ul>'


def _legend(node, n):
    kicker, main = split_kicker(node.title)
    return (f'<legend><span class="fp-n" aria-hidden="true">{n}</span><span><small>{t(kicker)}</small>'
            f'<b>{t(strip_colon(main))}</b></span></legend>')


def _part(node, n, inner, two=True):
    """A part of the card. two: its rows print as the document's two-column table (header row from the document)."""
    h = node.table[0]
    head = f' data-h1="{plain(h[0])}" data-h2="{plain(h[1])}"' if two else ''
    return f'<fieldset class="fpart ac-part" id="ac-{node.id}"{head}>{_legend(node, n)}{inner}</fieldset>'



def _row(label, inner, cls=''):
    """One document row: its label (printed in the first column) + the controls."""
    return f'<div class="ac-row {cls}" data-pr="row"><span class="ac-rl f-l" data-rl>{t(label)}</span>{inner}</div>'


def _num(key, label, extra=''):
    return (f'<label class="f ac-sub"><span class="f-l">{t(label)}</span>'
            f'<input {NUM} data-k="{key}" data-sub="{plain(label)}"{extra}></label>')


def html():
    card = C['c-card']
    cd1, cd2, cd3, cd4, cd5, cd6 = (card[f'cd{i}'] for i in range(1, 7))

    # ---------------------------------------------------------------- build-time checks
    rows1 = cd1.table[1:]
    status_cell = dict(rows1)['حالة اعتماد النشاط']
    statuses = status_cell.split(' / ')
    assert len(statuses) == 5 and 'مكتمل' in statuses, statuses
    date_cell = dict(rows1)['تاريخ البداية والنهاية']
    dates = re.findall(r'(\d{1,2}) / (\d{1,2}) / (\d{4})', date_cell)
    assert len(dates) == 2, date_cell
    iso = [f'{y}-{int(m):02d}-{int(d):02d}' for d, m, y in dates]
    assert iso == ['2026-11-15', '2027-01-31'], iso
    words = re.match(r'^(\S+) [\d /]+? (\S+) [\d /]+$', date_cell)
    assert words and words.group(1) == 'من' and words.group(2) == 'إلى', date_cell
    att_para = [p for p in cd6.paras if p.startswith('المرفقات عند الإغلاق:')]
    assert len(att_para) == 1
    att_label, _, att_rest = att_para[0].partition(':')
    attachments = att_rest.strip().rstrip('.').split('، ')
    assert len(attachments) == 5, attachments
    assert len(cd5.table) == 5 and len(cd5.items) == 3 and len(cd6.table) == 4, (cd5.table, cd5.items, cd6.table)
    formula = cd5.paras[0]
    assert formula.startswith('طريقة الاحتساب:')
    tool_label = formula.rsplit('؛', 1)[1].strip().rstrip('.')
    assert tool_label == 'بأداة تقييم واضحة', tool_label
    warn = [p for p in cd4.paras if p.startswith('تنبيه:')]
    assert len(warn) == 1
    rows3 = dict(cd3.table[1:])
    subs_parts = rows3['اشتراكات المشاركين'].split('، ')
    spons_parts = rows3['الرعاية والدعم العيني أو المالي'].split('، ')
    prize_parts = rows3['الجوائز والشهادات'].split('، ')
    assert len(subs_parts) == 3 and len(spons_parts) == 2 and len(prize_parts) == 3
    assert len(cd2.table) == 5 and len(cd4.table) == 5

    # ---------------------------------------------------------------- cd1: identity and responsibilities
    f1 = ''
    for i, (label, cell) in enumerate(rows1):
        if label == 'حالة اعتماد النشاط':
            pills = ''.join(f'<label class="ac-pill"><input type="radio" name="ac-status" value="{j}" data-k="status"><span>{t(s)}</span></label>'
                            for j, s in enumerate(statuses))
            f1 += _row(label, f'<div class="ac-pills" role="radiogroup" aria-label="{plain(label)}">{pills}</div>'
                       '<p class="ac-warn-line" data-att-warn hidden role="status">' + ic('alert') + '<span>لم تُعلَّم كل المرفقات عند الإغلاق</span></p>',
                       'ac-wide')
        elif label == 'تاريخ البداية والنهاية':
            f1 += _row(label, '<div class="ac-dates">'
                       f'<label class="f ac-sub"><span class="f-l">{t(words.group(1))}</span><input type="date" data-k="from" data-sub="{plain(words.group(1))}" data-example="{iso[0]}"></label>'
                       f'<label class="f ac-sub"><span class="f-l">{t(words.group(2))}</span><input type="date" data-k="to" data-sub="{plain(words.group(2))}" data-example="{iso[1]}"></label></div>')
        else:
            ph = plain('من البطاقة: ' + cell)
            ctl = (f'<textarea id="ac-f{i}" rows="2" data-k="t{i}" placeholder="{ph}" data-example="{plain(cell)}"></textarea>' if len(cell) > 60 else
                   f'<input id="ac-f{i}" type="text" data-k="t{i}" placeholder="{ph}" data-example="{plain(cell)}">')
            f1 += (f'<div class="ac-row f{" ac-wide" if len(cell) > 60 else ""}" data-pr="row">'
                   f'<label class="ac-rl f-l" for="ac-f{i}" data-rl>{t(label)}</label>{ctl}</div>')
    tools1 = (f'<div class="ac-ex"><button type="button" class="btn btn-ghost btn-sm ac-btn" data-example>{ic("file-text")}<span>املأ بمثال البطاقة</span></button>'
              '<p class="ac-strip" data-ex-strip hidden role="status">هذه قيم المثال الوارد في البطاقة؛ عدّلها لنشاطك</p></div>')
    part1 = _part(cd1, 1, tools1 + f'<div class="ac-grid">{f1}</div>')

    # ---------------------------------------------------------------- cd2: stages
    f2 = ''
    for r, (stage, cell) in enumerate(cd2.table[1:]):
        parts = _split_dash(cell)
        f2 += (f'<div class="ac-stage" data-pr="row" data-count><div class="ac-stage-h"><span class="ac-rl" data-rl>{t(stage)}</span>'
               f'<span class="ac-count" aria-live="polite">تم <b data-x>0</b> من <b>{len(parts)}</b></span></div>{_checks(f"s{r}", parts)}</div>')
    part2 = _part(cd2, 2, f'<p class="ac-total-count" aria-live="polite">تم <b data-all-x>0</b> من <b data-all-y></b></p>{f2}')

    # ---------------------------------------------------------------- cd3: needs, resources, permits
    f3 = ''
    for r, (label, cell) in enumerate(cd3.table[1:]):
        if label in ('الأدوات والاحتياجات', 'المقر / التجهيزات', 'التصاريح والموافقات اللازمة'):
            f3 += _row(label, _checks(f'n{r}', _split_dash(cell)), 'ac-wide')
        elif label == 'اشتراكات المشاركين':
            a, b, c = subs_parts
            f3 += _row(label, '<div class="ac-trio">' + _num('subV', a) + _num('subN', b)
                       + f'<label class="f ac-sub"><span class="f-l">{t(c)}</span><output data-k="subT" data-sub="{plain(c)}" aria-live="polite">—</output></label></div>',
                       'ac-wide')
        elif label in ('الرعاية والدعم العيني أو المالي', 'الجوائز والشهادات'):
            key = 'sp' if label.startswith('الرعاية') else 'pz'
            cols = spons_parts if key == 'sp' else prize_parts
            tpl = ''.join(
                (f'<label class="f ac-sub"><span class="f-l">{t(cl)}</span><input {"type=text" if ci == 0 else NUM}'
                 f' data-c="{ci}" data-sub="{plain(cl)}"></label>')
                for ci, cl in enumerate(cols))
            f3 += _row(label, f'<div class="ac-rep" data-rep="{key}" data-cols="{len(cols)}"><ol class="ac-rep-list"></ol>'
                       f'<template>{tpl}</template>'
                       f'<button type="button" class="btn btn-ghost btn-sm ac-btn" data-rep-add><span>أضف سطرًا</span></button></div>',
                       'ac-wide')
        elif label in ('التكلفة التقديرية', 'التكلفة الفعلية'):
            key = 'est' if label == 'التكلفة التقديرية' else 'act'
            f3 += (f'<div class="ac-row f" data-pr="row"><label class="ac-rl f-l" for="ac-{key}" data-rl>{t(label)}</label>'
                   f'<input id="ac-{key}" {NUM} data-k="{key}" aria-describedby="ac-{key}-h">'
                   f'<span class="f-hint" id="ac-{key}-h" data-pr-text>{t(cell)}</span></div>')
            if key == 'act':
                f3 += ('<p class="ac-diff" data-diff hidden aria-live="polite"><span>الفرق</span> <b data-diff-v></b></p>')
        else:
            raise AssertionError(f'cd3 row without a field: {label}')
    part3 = _part(cd3, 3, f'<div class="ac-grid">{f3}</div>')

    # ---------------------------------------------------------------- cd4: announcement, documentation, attendance
    f4 = ''.join(_row(label, _checks(f'd{r}', _split_dash(cell)), 'ac-wide') for r, (label, cell) in enumerate(cd4.table[1:]))
    photo = [(r, j) for r, (lb, cell) in enumerate(cd4.table[1:]) for j, p in enumerate(_split_dash(cell)) if p == 'تصوير المشاركين ونشره']
    perm = [(r, j) for r, (lb, cell) in enumerate(cd3.table[1:]) if lb == 'التصاريح والموافقات اللازمة'
            for j, p in enumerate(_split_dash(cell)) if p == 'إذن التصوير والنشر']
    assert len(photo) == 1 and len(perm) == 1, (photo, perm)
    part4 = _part(cd4, 4, f'<div class="ac-grid">{f4}</div><p class="ac-note ac-alert" data-pr="note" data-photo-warn>{ic("alert")}<span>{t(warn[0])}</span></p>')

    # ---------------------------------------------------------------- cd5: follow-up, evaluation, results
    hd = cd5.table[0]
    trs = ''
    for r, row in enumerate(cd5.table[1:]):
        label = row[0]
        impact = label == 'مؤشر أثر خاص بالنشاط'
        note = (f'<label class="f ac-sub ac-tool"><span class="f-l">{t(tool_label)}</span><input type="text" data-k="k{r}n" data-sub="{plain(tool_label)}"></label>'
                if impact else '')
        trs += (f'<tr><th scope="row">{t(label)}{note}</th>'
                f'<td data-th="{plain(hd[1])}"><input {NUM} data-k="k{r}t" aria-label="{plain(hd[1] + " — " + label)}"></td>'
                f'<td data-th="{plain(hd[2])}"><input {NUM} data-k="k{r}a" aria-label="{plain(hd[2] + " — " + label)}"></td>'
                f'<td data-th="{plain(hd[3])}"><output data-pct="{r}" aria-live="polite">—</output></td></tr>')
    table5 = (f'<div class="ac-tbl-wrap" data-pr="grid"><table class="ac-tbl ac-k"><thead><tr>{"".join(f"<th scope=col>{t(h)}</th>" for h in hd)}</tr></thead>'
              f'<tbody>{trs}</tbody></table></div>')
    areas = ''.join(f'<div class="ac-row f ac-wide" data-pr="row"><label class="ac-rl f-l" for="ac-l{j}" data-rl>{t(it.text)}</label>'
                    f'<textarea id="ac-l{j}" rows="3" data-k="l{j}"></textarea></div>' for j, it in enumerate(cd5.items))
    part5 = _part(cd5, 5, table5 + f'<p class="ac-note" data-pr="note">{t(formula)}</p><div class="ac-grid">{areas}</div>', two=False)

    # ---------------------------------------------------------------- cd6: approval and closing
    hd6 = cd6.table[0]
    trs6 = ''.join(f'<tr><th scope="row">{t(r[0])}</th><td data-th="{plain(hd6[1])}"></td><td data-th="{plain(hd6[2])}"></td></tr>' for r in cd6.table[1:])
    table6 = (f'<div class="ac-tbl-wrap" data-pr="grid" data-blank><table class="ac-tbl ac-sign"><thead><tr>{"".join(f"<th scope=col>{t(h)}</th>" for h in hd6)}</tr></thead>'
              f'<tbody>{trs6}</tbody></table></div><p class="f-hint ac-sign-h">تُملأ هذه الخانات على الورقة المطبوعة.</p>')
    att = _row(att_label, _checks('att', attachments) + '<p class="ac-warn-line" data-att-warn hidden role="status">' + ic('alert')
               + '<span>لم تُعلَّم كل المرفقات عند الإغلاق</span></p>', 'ac-wide ac-att')
    part6 = _part(cd6, 6, table6 + f'<div class="ac-grid">{att}</div>', two=False)

    nav = ''.join(f'<a href="#ac-{n.id}">{t(split_kicker(n.title)[0])}</a>' for n in (cd1, cd2, cd3, cd4, cd5, cd6))
    data = {'v': 1, 'done': str(statuses.index('مكتمل')), 'photo': f'd{photo[0][0]}-{photo[0][1]}',
            'perm': f'n{[i for i, (lb, _) in enumerate(cd3.table[1:]) if lb == "التصاريح والموافقات اللازمة"][0]}-{perm[0][1]}',
            'att': len(attachments), 'cd5': len(cd5.table) - 1,
            'name': f't{[i for i, (lb, _) in enumerate(rows1) if lb == "اسم المهمة / النشاط"][0]}'}
    js = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')

    return f'''
<div class="ac" id="ac" role="region" aria-labelledby="ac-h" hidden>
  <script type="application/json" id="ac-data">{js}</script>
  <header class="ac-head"><span class="kicker">{ic("grid")}{t(strip_colon(card.title))}</span>
    <h3 id="ac-h">املأ بطاقة نشاط</h3><p>{t(card.paras[0])}</p></header>
  <div class="ac-saved">
    <div class="ac-saved-h"><h4>البطاقات المحفوظة على هذا الجهاز</h4>
      <button type="button" class="btn btn-primary btn-sm ac-btn" data-new>{ic("file-text")}<span>بطاقة جديدة</span></button></div>
    <p class="ac-privacy">{ic("lock")}<span>تُحفظ البطاقات في هذا المتصفح فقط؛ مسح بيانات المتصفح يحذفها.</span></p>
    <ul class="ac-list" aria-live="polite"></ul>
    <p class="ac-none">لا بطاقات محفوظة بعد. ما تكتبه يُحفظ تلقائيًا.</p>
    <p class="ac-status" role="status"></p>
  </div>
  <nav class="ac-nav" aria-label="أجزاء البطاقة">{nav}</nav>
  <form class="ac-form" novalidate autocomplete="off">
    {part1}{part2}{part3}{part4}{part5}{part6}
  </form>
  <div class="ac-tools">
    <button type="button" class="btn btn-primary btn-sm ac-btn" data-print-card="filled">{ic("printer")}<span>اطبع البطاقة</span></button>
    <button type="button" class="btn btn-ghost btn-sm ac-btn" data-print-card="blank">{ic("printer")}<span>اطبع بطاقة فارغة</span></button>
  </div>
  <div class="ac-print" aria-hidden="true"></div>
</div>'''
