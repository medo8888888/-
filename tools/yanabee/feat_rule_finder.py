"""rule-finder — «ماذا لو؟ ابحث في اللائحة»: a scoped, row-level search over the league regulation (lg1…lg10).

Placed by page_competition.league() right after the section's purpose paragraph. Matching reuses the site's
Arabic engine (window.YanabeeSearch.engine from js/search.js); js/rule-finder.js only filters, ranks and draws.
The index is built here from content.COMP (c-league subsections only — c-rules is a pre-launch checklist, not a
league decision) and shipped as JSON; every string in it is a verbatim document line or table cell. Table header
rows are never entries: each row carries its own header words as labels ('الحالة'/'القرار', …).

Without JavaScript the block stays hidden (the folds below hold the same text).
"""
import json

from core import COMP as C, ic, plain, t

# topic chips: each word is verbatim in lg1…lg10 (asserted below)
TOPICS = ['تأخر', 'غياب', 'انسحاب', 'بطاقة', 'إصابة', 'تظلم', 'ركلات ترجيح', 'التعادل']


def entries():
    """One entry per own line of each chapter of the league regulation, in source order."""
    out = []
    for s in C['c-league'].subs:
        assert s.id.startswith('lg') and not s.subs, s.id
        for kind, b in s.blocks:
            if kind == 'p':
                out.append({'f': s.id, 'ch': s.title, 'k': 'p', 'text': b})
            elif kind == 'ul':
                for it in b:
                    assert not it.children, it.text
                    out.append({'f': s.id, 'ch': s.title, 'k': 'i', 'text': it.text})
            elif kind == 'table':
                head = b[0]
                for row in b[1:]:
                    assert len(row) == len(head) == 2, row
                    out.append({'f': s.id, 'ch': s.title, 'k': 't', 'cells': [[head[i], row[i]] for i in range(2)]})
            else:
                raise AssertionError(f'{s.id}: unexpected block {kind}')
    return out


def html():
    E = entries()
    league_text = ' '.join(e.get('text') or ' '.join(c for _, c in e['cells']) for e in E)
    for w in TOPICS:
        assert w in league_text, w
    assert not any(e['k'] == 't' and e['cells'][0][1] in ('الحالة', 'المخالفة', 'النتيجة') for e in E)
    assert any(e.get('text') == 'يلتزم كل فريق بالحضور قبل موعد المباراة بخمس عشرة دقيقة لإتمام التجهيز والتسجيل.' for e in E)
    # row chips: one per lg2 'الحالة' and lg4 'المخالفة' cell, opening that exact row
    rows = [(i, e) for i, e in enumerate(E) if e['k'] == 't' and e['f'] in ('lg2', 'lg4')]
    assert len(rows) == 7 + 9, len(rows)
    topic = ''.join(f'<button type="button" class="rf-chip" data-q="{plain(w)}" aria-pressed="false">{t(w)}</button>' for w in TOPICS)
    rowchips = ''.join(f'<button type="button" class="rf-chip rf-rchip" data-row="{i}" aria-pressed="false">{t(e["cells"][0][1])}</button>'
                       for i, e in rows)
    data = json.dumps(E, ensure_ascii=False).replace('</', '<\\/')
    return f'''
<div class="rf" id="rule-finder" hidden>
  <h3 class="rf-h">{ic('search')}<span>ماذا لو؟ ابحث في اللائحة</span></h3>
  <div class="rf-bar">
    <input type="search" id="rf-q" class="rf-q" aria-label="ابحث في اللائحة" placeholder="اكتب كلمة: تأخر، غياب، بطاقة، إصابة، تظلم…" autocomplete="off" enterkeyhint="search">
    <button type="button" class="rf-x" aria-label="مسح">{ic('x')}</button>
  </div>
  <div class="rf-chips" role="group" aria-label="كلمات للبحث">{topic}</div>
  <button type="button" class="rf-more" aria-expanded="false" aria-controls="rf-rows">{ic('chevron-down')}<span>حالات من الجدول</span></button>
  <div class="rf-chips rf-rows" id="rf-rows" role="group" aria-label="حالات من الجدول" hidden>{rowchips}</div>
  <div class="rf-out" id="rf-out" aria-live="polite"></div>
  <script type="application/json" id="rf-data">{data}</script>
</div>'''
