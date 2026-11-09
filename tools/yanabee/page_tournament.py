"""tournament.html — لوحة البطولة: نظام البطولة (competition.txt: c-format) وإدارة النتائج والترتيب.

The format text is a document section (verbatim via docpage). The interactive manager (groups, fixtures, results,
standings, chess cup, my team, share link) is built by js/tournament.js on top of js/tournament-engine.js and, when
Supabase is configured, js/yb-api.js. See docs/YANABEE_APP.md.
"""
from core import COMP as C, PAGE_LABEL, ic, page, page_hero, t
from docpage import STATUS, node_html, sec

PAGE = 'tournament.html'


def hero():
    chips = [('#c-format', 'نظام البطولة'), ('competition.html#c-league', 'لائحة الدوري'), ('register.html', 'سجّل فريقك')]
    return page_hero(PAGE, 'المسابقة الأولى · سورة الصف', 'لوحة البطولة',
                     'المجموعات والنتائج والترتيب لدوري كرة القدم وبطولة الشطرنج.', chips,
                     f'<div class="ch-visual rv">{STATUS}</div>', 'comp-hero')


def fmt():
    n = C['c-format']
    return sec('c-format', node_html(n))


def build():
    body = hero() + fmt()
    desc = C['c-format'].title
    page(PAGE, PAGE_LABEL[PAGE], body, desc, css=('css/comp.css',), js=('js/comp.js',))
    return PAGE
