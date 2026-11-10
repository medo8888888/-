"""tournament.html — لوحة البطولة: متابعة وإدارة دوري كرة القدم وبطولة الشطرنج.

Two parts:
  1. the interactive board (#tn-app), built entirely by js/tournament.js on top of js/tournament-engine.js and, when Supabase
     is configured, js/yb-api.js. The page ships the skeleton, the no-JS notice and a small JSON block of document words
     (#tn-words) that the script reuses: it never writes rules of its own.
  2. the format document section (c-format: fm-football, fm-chess) — a document section, rendered verbatim as before.

Words in #tn-words come from content/yanabee/competition.txt through the content tree (never retyped here):
  fm-football / fm-chess lines, lg2 (التأخر والغياب والانسحاب), lg4 (إشراك لاعب غير مسجل), lg6 (points + the tie-break line),
  lg10 (الحالات غير المنصوص عليها). See docs/YANABEE_APP.md.
"""
import json

from core import COMP as C, PAGE_LABEL, page, page_hero, split_kicker, strip_colon
from docpage import STATUS, node_html, sec

PAGE = 'tournament.html'


def hero():
    chips = [('#tn-app', 'لوحة المتابعة'), ('#c-format', 'نظام البطولة'), ('competition.html#c-league', 'لائحة الدوري'),
             ('register.html', 'سجّل فريقك')]
    return page_hero(PAGE, 'المسابقة الأولى · سورة الصف', 'لوحة البطولة',
                     'المجموعات والنتائج والترتيب لدوري كرة القدم وبطولة الشطرنج.', chips,
                     f'<div class="ch-visual rv">{STATUS}</div>', 'comp-hero tn-hero')


def _row(table, prefix):
    for r in table[1:]:
        if r[0].startswith(prefix):
            return list(r)
    raise KeyError(prefix)


def words():
    """The document words the board reuses (all verbatim from competition.txt)."""
    fmt = C['c-format']
    lg2, lg4, lg6, lg10 = C['c-league']['lg2'], C['c-league']['lg4'], C['c-league']['lg6'], C['c-league']['lg10']
    tie = [it.text for it in lg6.items if it.text.startswith('عند التساوي')][0]
    committee = [it.text for it in lg10.items if it.text.startswith('تفصل اللجنة')][0]
    data = {
        'fbTitle': strip_colon(fmt['fm-football'].title),
        'fbLines': [it.text for it in fmt['fm-football'].items],
        'chTitle': strip_colon(fmt['fm-chess'].title),
        'chLines': [it.text for it in fmt['fm-chess'].items],
        'lg2Title': strip_colon(split_kicker(lg2.title)[1]),
        'lg6Title': strip_colon(split_kicker(lg6.title)[1]),
        'points': [list(r) for r in lg6.table[1:]],
        'tiebreak': tie,
        'committee': committee,
        'forfeit': {
            'late': [_row(lg2.table, 'تأخر الفريق لأكثر')],
            'absent': [_row(lg2.table, 'غياب الفريق دون')],
            'withdraw': [_row(lg2.table, 'انسحاب الفريق قبل'), _row(lg2.table, 'انسحاب الفريق أثناء')],
            'unregistered': [_row(lg4.table, 'إشراك لاعب غير مسجل')],
        },
    }
    return json.dumps(data, ensure_ascii=False).replace('</', '<\\/')


def app():
    skeleton = ('<div class="tn-skel" aria-hidden="true"><i></i><i></i><i></i></div>'
                '<p class="tn-nojs">تحتاج لوحة البطولة إلى تفعيل JavaScript في المتصفح. نظام البطولة مكتوب أدناه.</p>')
    return f'''
<section class="sec tn-sec" aria-label="لوحة البطولة">
  <div class="wrap">
    <div id="tn-app" class="tn" data-tn aria-busy="true">{skeleton}</div>
  </div>
</section>
<section class="tn-printwrap" id="tn-print" aria-hidden="true"></section>
<script type="application/json" id="tn-words">{words()}</script>'''


def fmt():
    n = C['c-format']
    return sec('c-format', node_html(n), 'alt')


def build():
    body = hero() + app() + fmt()
    desc = C['c-format'].title
    page(PAGE, PAGE_LABEL[PAGE], body, desc,
         css=('css/comp.css', 'css/tournament.css'),
         js=('js/comp.js', 'js/yb-demo.js', 'js/yb-config.js', 'js/yb-api.js', 'js/tournament-engine.js', 'js/tournament.js'))
    return PAGE
