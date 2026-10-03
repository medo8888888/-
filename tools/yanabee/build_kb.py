"""Build the Yanabee knowledge base from content/yanabee/*.txt (via content.py).

    python3 tools/yanabee/build.py build_kb

Writes two generated files (never edit them by hand — docs/YANABEE.md, law 7):

1. site/yanabee/data/kb.js — a classic script (works from file://) that sets
   window.YANABEE_KB, shared by the search overlay (js/search.js) and the
   assistant's offline "document search" answers (js/chat.js).
   Schema (contract — add fields, never rename/remove):

   window.YANABEE_KB = {
     version: 1,
     docs:  {platform: {title, subtitle}, quran: {project, title, subtitle}},
     pages: [{url, title, icon, tone}],       # core.PAGES order; title = nav label (UI chrome)
     icons: {name: '<path …/>'},              # trusted Lucide markup (core.ICONS) for every icon used
     items: [{
       id,      # content id: 's1'…'s9', 'vision', 't1'…'t7', 'intro', 'goals', 'a1'…'a11', 'kpis', 'kpi1'…'kpi9'
       doc,     # 'platform' | 'quran'
       type,    # 'section' | 'subsection' | 'team' | 'axis' | 'kpi'
       kicker,  # 'ثانياً', 'المحور الأول', 'KPI 1' … ('' if none) — core.split_kicker
       title,   # heading without its kicker (trailing ':' dropped)
       text,    # the node's own source lines after the heading, verbatim, joined with '\\n'
                #   (table rows are cells joined with ' | '; quotes curled «…» like core.t())
       k,       # one char per text line: p paragraph, i item, c child item, t table row, q quotation
       url,     # deep link (core.link_for; KPIs -> quran.html#kpiN)
       page,    # 'teams.html' …
       parent,  # parent id for subsections/teams/KPIs ('' for top-level sections)
       icon,    # key into icons
       tone,    # colour token name without '--' (brand, sky, t1 … t7)
     }]
   }

   Sections hold only their own lines; their subsections are separate items
   (find them with item.parent). Every source line of both documents appears
   in exactly one item's title/kicker or text (asserted below).

2. worker/knowledge-yanabee.js — `export const KNOWLEDGE_YANABEE = "…";`, both
   documents as readable text with headings (every source line, verbatim, in
   order), appended to the «مساعد ينابيع» system prompt by worker/index.js.
"""
import json
import re

from content import DOCS, PLATFORM, QURAN, ROOT
from core import ICONS, PAGES, SEC_ICON, SITE, TEAMS, link_for, split_kicker, strip_colon

KB_JS = SITE / 'data' / 'kb.js'
WORKER_JS = ROOT / 'worker' / 'knowledge-yanabee.js'

# UI chrome: icons for subsections and KPIs, colour per page (teams use their own --tN).
SUB_ICON = {
    'vision': 'eye', 'mission': 'compass', 'goal': 'target', 'phases': 'route', 'impact': 'gauge',
    'media': 'video', 'outreach': 'megaphone', 'support': 'handshake', 'structure': 'network',
    'followup': 'calendar', 'periodic': 'award', 'annual': 'trophy', 'levels': 'layers', 'kpis': 'chart',
}
PAGE_TONE = {'index.html': 'brand', 'teams.html': 'accent', 'operations.html': 'sky', 'quran.html': 't1'}
UI_ICONS = ['search', 'sparkles', 'arrow-left', 'file-text', 'x', 'book-open', 'users', 'home', 'shield', 'gauge']


def curl(s):
    """Straight quotes -> «…», exactly like core.t()/core.plain() do on the pages."""
    return re.sub(r'"([^"\n]+)"', '«\\1»', s)


def own_lines(node):
    """[(kind, text)] for the node's own blocks, in order — mirrors Node.lines(deep=False)[1:]."""
    out = []
    for kind, b in node.blocks:
        if kind == 'p':
            out.append(('p', b))
        elif kind == 'quote':
            out.append(('q', b))
        elif kind == 'ul':
            for it in b:
                out.append(('i', it.text))
                out.extend(('c', c.text) for c in it.children)
        elif kind == 'table':
            out.extend(('t', ' | '.join(r)) for r in b)
    assert [x for _, x in out] == node.lines(deep=False)[1:], node.id
    return out


def heading(title):
    kicker, main = split_kicker(title)
    return curl(kicker), curl(strip_colon(main))


def make_item(node, doc, typ, parent=''):
    lines = own_lines(node)
    kicker, title = heading(node.title)
    url = link_for(node.id)
    page = url.split('#')[0]
    if typ == 'team':
        icon, tone = TEAMS[node.id], node.id
    else:
        icon = SEC_ICON.get(node.id) or SUB_ICON.get(node.id) or SEC_ICON.get(parent, 'file-text')
        tone = PAGE_TONE[page]
    return dict(id=node.id, doc=doc, type=typ, kicker=kicker, title=title,
                text='\n'.join(curl(x) for _, x in lines), k=''.join(k for k, _ in lines),
                url=url, page=page, parent=parent, icon=icon, tone=tone)


def kpi_items():
    """One item per KPI line of quran 'kpis': 'KPI 1 (مؤشر …): …' -> kicker 'KPI 1', title 'مؤشر …'."""
    out = []
    for n, it in enumerate(QURAN['a11']['kpis'].items, 1):
        m = re.match(r'^(KPI \d+) \((.+)\)$', it.label)
        assert m and m.group(1) == f'KPI {n}', it.label
        out.append(dict(id=f'kpi{n}', doc='quran', type='kpi', kicker=m.group(1), title=curl(m.group(2)),
                         text=curl(it.text), k='i', url=f'quran.html#kpi{n}', page='quran.html',
                         parent='kpis', icon='gauge', tone='t1'))
    return out


def build_items():
    items = []
    for s in PLATFORM.sections:
        items.append(make_item(s, 'platform', 'section'))
        for sub in s.subs:
            items.append(make_item(sub, 'platform', 'team' if sub.id in TEAMS else 'subsection', s.id))
    for s in QURAN.sections:
        items.append(make_item(s, 'quran', 'axis' if re.fullmatch(r'a\d+', s.id) else 'section'))
        for sub in s.subs:
            items.append(make_item(sub, 'quran', 'subsection', s.id))
    items.extend(kpi_items())
    return items


def check_coverage(items):
    """Every source line of both documents must be findable in the KB."""
    blob = []
    for it in items:
        blob += [it['kicker'], it['title'], f"{it['kicker']}: {it['title']}"] + it['text'].split('\n')
        blob += it['text'].replace(' | ', '\n').split('\n')
    have = {re.sub(r'[^\w]', '', x) for x in blob}
    alltext = re.sub(r'[^\w]', '', ' '.join(blob))
    for name, doc in DOCS.items():
        for line in doc.source_lines:
            key = re.sub(r'[^\w]', '', curl(line))
            if line in doc.meta.values():
                continue  # document metadata lives in kb.docs
            assert key in have or key in alltext, f'{name}: line missing from KB: {line[:60]}'


def knowledge_text():
    """Both documents as plain text with headings — every source line verbatim, in order."""
    out = []

    def node_lines(node, level):
        out.append('')
        out.append('#' * level + ' ' + node.title)
        for kind, b in node.blocks:
            if kind == 'p':
                out.append(b)
            elif kind == 'quote':
                out.append('> ' + b)
            elif kind == 'ul':
                for it in b:
                    out.append('- ' + it.text)
                    out.extend('  - ' + c.text for c in it.children)
            elif kind == 'table':
                out.extend('| ' + ' | '.join(r) + ' |' for r in b)
        for sub in node.subs:
            node_lines(sub, level + 1)

    P, Q = PLATFORM, QURAN
    out.append(f"# الوثيقة الأولى: {P.meta['title']} {P.meta['subtitle']}")
    for s in P.sections:
        node_lines(s, 2)
    out.append('')
    out.append(f"# الوثيقة الثانية: {Q.meta['title']} — {Q.meta['subtitle']} ({Q.meta['project']})")
    for s in Q.sections:
        node_lines(s, 2)
    text = '\n'.join(out).strip() + '\n'
    for name, doc in DOCS.items():  # nothing dropped, nothing reordered within a document
        pos = 0
        for line in doc.source_lines:
            i = text.find(line, pos if line not in doc.meta.values() else 0)
            assert i >= 0, f'{name}: knowledge is missing: {line[:60]}'
            if line not in doc.meta.values():
                pos = i
    return text


def build():
    items = build_items()
    ids = [it['id'] for it in items]
    assert len(ids) == len(set(ids)), 'duplicate KB ids'
    check_coverage(items)

    used = sorted({it['icon'] for it in items} | {i for _, _, i in PAGES} | set(UI_ICONS))
    kb = {
        'version': 1,
        'docs': {
            'platform': {'title': curl(PLATFORM.meta['title']), 'subtitle': curl(PLATFORM.meta['subtitle'])},
            'quran': {'project': curl(QURAN.meta['project']), 'title': curl(QURAN.meta['title']),
                      'subtitle': curl(QURAN.meta['subtitle'])},
        },
        'pages': [{'url': f, 'title': label, 'icon': icon, 'tone': PAGE_TONE[f]} for f, label, icon in PAGES],
        'icons': {name: ICONS[name] for name in used},
        'items': items,
    }
    data = json.dumps(kb, ensure_ascii=False, separators=(',', ':'))
    KB_JS.parent.mkdir(parents=True, exist_ok=True)
    KB_JS.write_text('// Generated by tools/yanabee/build_kb.py — do not edit by hand.\n'
                     f'window.YANABEE_KB = {data};\n', encoding='utf-8')

    text = knowledge_text()
    WORKER_JS.write_text('// Generated by tools/yanabee/build_kb.py from content/yanabee/*.txt — do not edit by hand.\n'
                         f'export const KNOWLEDGE_YANABEE = {json.dumps(text, ensure_ascii=False)};\n', encoding='utf-8')
    return f'data/kb.js ({len(items)} items, {len(data) // 1024} KB) + worker/knowledge-yanabee.js ({len(text)} chars)'


if __name__ == '__main__':
    print(build())
