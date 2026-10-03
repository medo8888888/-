"""Build site/data/kb.js — the brochure as a searchable knowledge base.

Loaded on every page as a classic script (works on file:// too) and shared by
the search overlay (js/palette.js) and the assistant's offline brochure answers
(window.TakamulBrain in js/chat.js). Schema (contract — add fields, never
rename/remove):

window.TAKAMUL_KB = {
  version: 1,
  pages: [{id, url, title, icon}],
  items: [{
    id,        # 's3', 's3-1', 'p4', 'st2', 'f1', 'b3', 'welcome', 'toc', 'closing'
    type,      # 'section' | 'subsection' | 'pillar' | 'stage' | 'faq' | 'intro'
    num,       # display number: '3', '3.1', '4', 'س1' ... ('' if none)
    title,     # verbatim brochure heading / question
    subtitle,  # verbatim sub-heading ('' if none)
    text,      # verbatim brochure lines joined with '\n' (bullets without markers)
    url,       # deep link: 'initiatives.html#s3-1'
    page,      # 'initiatives.html'
    section,   # parent section number (int) or 0
    group,     # FAQ group: 'founders' | 'board' | ''
    rows,      # the same verbatim lines, structured for answers (added in v1, optional for readers):
               #   [{h}] heading  |  [{k, v}] label + value  |  [{v}] plain line / list item
               #   optional on any row: n (number or badge such as '5 + 5'), tag (Latin term, e.g. 'Synergy'),
               #   li: true when the brochure marks it as a bullet (●, ✔, ◆)
    related,   # ids of related items (for follow-up suggestions), most relevant first
  }]
}
Every string inside `rows` is a verbatim brochure line (L(n)); nothing is paraphrased.
"""
import json
import re

from core import D, L, LS, PAGES, SECTIONS, SITE, toc_items

SUBSECTIONS = [  # (anchor, heading line, first body line, last body line, section)
    ('s2-1', 56, 57, 71, 2), ('s3-1', 76, 77, 81, 3), ('s3-2', 82, 83, 87, 3), ('s3-3', 88, 89, 96, 3),
    ('s4-1', 100, 101, 112, 4), ('s4-2', 113, 114, 125, 4), ('s7-1', 171, 172, 183, 7), ('s7-2', 184, 185, 187, 7),
    ('s7-3', 188, 189, 203, 7), ('s8-1', 207, 208, 221, 8), ('s8-2', 222, 223, 226, 8),
    ('s13-1', 379, 380, 445, 13), ('s13-2', 446, 447, 498, 13),
]
PILLARS = [306, 314, 323, 330, 334, 342, 348, 354, 363, 367, 375]  # start lines (+ end sentinel)
FAQ_F = [381, 386, 399, 408, 412, 420, 427, 435, 439, 446]          # question-number lines (+ sentinel)
FAQ_B = [448, 452, 464, 468, 474, 478, 485, 492, 499]

# Lines that are table headers / layout labels, not answer content.
ROW_SKIP = {114, 115, 230, 231} | set(range(129, 154, 4)) | set(range(252, 300))

RELATED = {
    's1': ['s2', 'p4', 'f4'], 's2': ['s2-1', 'f2', 's3'], 's2-1': ['s2', 's10', 's3'],
    's3': ['s3-1', 's3-2', 's3-3'], 's3-1': ['s3-2', 'p5', 's4-2'], 's3-2': ['s3-1', 'p10', 's6'],
    's3-3': ['p3', 's4-2', 'b8'], 's4': ['s4-1', 's4-2', 'f3'], 's4-1': ['f3', 's4-2', 's3'],
    's4-2': ['b3', 'b8', 's3'], 's5': ['st1', 'st5', 'p4'], 's6': ['s3', 's10', 'p4'],
    's7': ['s7-1', 'f5', 'p8'], 's7-1': ['f5', 'p8', 'b4'], 's7-2': ['s9', 's12', 'f6'],
    's7-3': ['s10', 'b1', 's3'], 's8': ['s8-1', 'f7', 'p10'], 's8-1': ['f7', 's8-2', 'p10'],
    's8-2': ['f8', 'f9', 's8-1'], 's9': ['s7-2', 's12', 'f6'], 's10': ['b2', 's7-3', 'f2'],
    's11': ['p9', 's7-1', 'f6'], 's12': ['p1', 'p10', 's9'], 's13': ['s13-1', 's13-2', 'f1'],
    's13-1': ['f1', 'f2', 'f7'], 's13-2': ['b1', 'b2', 'b4'],
    'p1': ['p8', 's7-1', 'p2'], 'p2': ['p1', 's7-1', 'p4'], 'p3': ['s3-3', 's4-1', 'f1'],
    'p4': ['s5', 'st7', 'p2'], 'p5': ['s3-1', 's3-2', 'p10'], 'p6': ['p7', 's10', 'b2'],
    'p7': ['p6', 'p8', 's6'], 'p8': ['b3', 'p1', 's7-1'], 'p9': ['f5', 'p8', 's11'],
    'p10': ['f7', 's8-1', 'f8'],
    'f1': ['s3', 'p3', 'f2'], 'f2': ['s2', 's5', 'f7'], 'f3': ['s4-1', 'f1', 'p8'], 'f4': ['s1', 'f5', 'b6'],
    'f5': ['s7-1', 'f6', 'p9'], 'f6': ['s7-2', 's9', 'f5'], 'f7': ['s8-1', 'p10', 'f8'],
    'f8': ['f7', 's8-2', 'b5'], 'f9': ['b7', 's8-2', 'b6'],
    'b1': ['b2', 's7-3', 'f5'], 'b2': ['s10', 'b1', 'f2'], 'b3': ['p8', 's4-2', 'b1'], 'b4': ['s7-1', 'b5', 'b6'],
    'b5': ['b4', 's8-2', 'f8'], 'b6': ['b4', 'f4', 'f9'], 'b7': ['f9', 's7-2', 'b6'], 'b8': ['s3-3', 's4-2', 'f7'],
    'welcome': ['s2', 's3', 's12'], 'toc': ['s1', 's2', 's3'], 'closing': ['s12', 's9', 's7-2'],
}
for _i in range(1, 8):
    RELATED[f'st{_i}'] = ['s5', f'st{_i % 7 + 1}', 'p4']

NUM_RE = re.compile(r'^(\d+(\s*\+\s*\d+)?|س\d+)$')
HEAD_RE = re.compile(r'^\d+\.\d+\s')
LATIN_RE = re.compile(r'^[A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü\s\-()]*$')


def text(a, b):
    return '\n'.join(t for t in LS(a, b) if t and t not in ('◄',))


def is_label(s):
    return len(s) <= 45 and not re.search(r'[.:؛،!؟]$', s) and not s.startswith('[') and not HEAD_RE.match(s)


def rows_of(a, b):
    """Structure verbatim lines a..b into answer rows (see schema)."""
    toks = []
    for i in range(a, b + 1):
        s = L(i)
        if not s or s == '◄' or i in ROW_SKIP:
            continue
        toks.append((s, bool(re.match(r'^[●✔◆]\s', D[i - 1].strip()))))
    groups, cur = [], {'n': '', 'lines': []}
    for s, li in toks:
        if NUM_RE.match(s):
            if cur['lines'] or cur['n']:
                groups.append(cur)
            cur = {'n': s, 'lines': []}
        else:
            cur['lines'].append((s, li))
    groups.append(cur)

    rows = []
    for g in groups:
        lines, first = g['lines'], len(rows)
        i = 0
        while i < len(lines):
            s, li = lines[i]
            if LATIN_RE.match(s):
                if rows:
                    rows[-1]['tag'] = s
                i += 1
                continue
            if HEAD_RE.match(s):
                rows.append({'h': s})
                i += 1
                continue
            if li:
                rows.append({'v': s, 'li': True})
                i += 1
                continue
            nxt = [j for j in range(i + 1, len(lines)) if not LATIN_RE.match(lines[j][0])]
            j1 = nxt[0] if nxt else None
            j2 = nxt[1] if len(nxt) > 1 else None
            tags = lambda x, y: [lines[k][0] for k in range(x + 1, y) if LATIN_RE.match(lines[k][0])]  # noqa: E731
            if is_label(s) and j1 is not None and not lines[j1][1]:
                n1 = lines[j1][0]
                if (is_label(n1) and j2 is not None and not lines[j2][1] and not is_label(lines[j2][0])
                        and not HEAD_RE.match(lines[j2][0])):
                    row = {'k': n1, 'v': lines[j2][0], 'n': s}       # badge + label + value (e.g. 7.1)
                    t = tags(j1, j2)
                    if t:
                        row['tag'] = t[0]
                    rows.append(row)
                    i = j2 + 1
                    continue
                if len(n1) >= len(s) + 6 and not HEAD_RE.match(n1):
                    row = {'k': s, 'v': n1}
                    t = tags(i, j1)
                    if t:
                        row['tag'] = t[0]
                    rows.append(row)
                    i = j1 + 1
                    continue
            if is_label(s) and j1 is not None and lines[j1][1]:
                rows.append({'h': s})
            else:
                rows.append({'v': s})
            i += 1
        if g['n'] and len(rows) > first and 'n' not in rows[first]:
            rows[first]['n'] = g['n']
    return rows


def rights_rows():
    out = [{'h': L(230)}]
    out += [{'v': L(i), 'li': True} for i in range(232, 236)]
    out.append({'h': L(231)})
    out += [{'v': L(i), 'li': True} for i in range(236, 240)]
    return out


def build_kb():
    items = []
    page_of = {}
    sec_order = sorted(SECTIONS)
    faq_rows = {'founders': [], 'board': []}
    for group, starts, prefix in (('founders', FAQ_F, 'f'), ('board', FAQ_B, 'b')):
        for k in range(len(starts) - 1):
            faq_rows[group].append({'n': L(starts[k]), 'v': L(starts[k] + 1)})
    for idx, n in enumerate(sec_order):
        num_l, title_l, sub_l, page, _ = SECTIONS[n]
        end = SECTIONS[sec_order[idx + 1]][0] - 1 if idx + 1 < len(sec_order) else 498
        page_of[n] = page
        if n == 9:
            rows = rights_rows()
        elif n == 11:
            rows = [{'v': L(300)}]
        elif n == 12:
            rows = [{'v': L(304)}, {'v': L(305)}] + [
                {'k': L(PILLARS[k] + 1), 'v': L(PILLARS[k] + 2), 'n': L(PILLARS[k])} for k in range(10)]
        elif n == 13:
            rows = ([{'h': L(379)}, {'v': L(380)}] + faq_rows['founders']
                    + [{'h': L(446)}, {'v': L(447)}] + faq_rows['board'])
        else:
            rows = rows_of(sub_l + 1, end)
        items.append(dict(id=f's{n}', type='section', num=L(num_l), title=L(title_l), subtitle=L(sub_l),
                          text=text(sub_l + 1, end), url=f'{page}#s{n}', page=page, section=n, group='',
                          rows=rows))
    for anchor, h, a, b, n in SUBSECTIONS:
        if anchor == 's13-1':
            rows = [{'v': L(380)}] + faq_rows['founders']
        elif anchor == 's13-2':
            rows = [{'v': L(447)}] + faq_rows['board']
        else:
            rows = rows_of(a, b)
        items.append(dict(id=anchor, type='subsection', num=anchor[1:].replace('-', '.'), title=L(h), subtitle='',
                          text=text(a, b), url=f'{page_of[n]}#{anchor}', page=page_of[n], section=n, group='',
                          rows=rows))
    for k in range(10):
        a, b = PILLARS[k], PILLARS[k + 1] - 1
        items.append(dict(id=f'p{k + 1}', type='pillar', num=L(a), title=L(a + 1), subtitle=L(a + 2),
                          text=text(a + 3, b), url=f'join.html#p{k + 1}', page='join.html', section=12, group='',
                          rows=rows_of(a + 3, b)))
    for i in range(7):
        items.append(dict(id=f'st{i + 1}', type='stage', num=L(130 + 4 * i), title=L(131 + 4 * i),
                          subtitle=f'{L(129 + 4 * i)} {L(130 + 4 * i)}', text=L(132 + 4 * i),
                          url=f'expansion.html#st{i + 1}', page='expansion.html', section=5, group='',
                          rows=[{'v': L(132 + 4 * i)}]))
    for group, starts, prefix in (('founders', FAQ_F, 'f'), ('board', FAQ_B, 'b')):
        for k in range(len(starts) - 1):
            a = starts[k]
            b = starts[k + 1] - 1
            if prefix == 'f' and k == len(starts) - 2:
                b = 445
            items.append(dict(id=f'{prefix}{k + 1}', type='faq', num=L(a), title=L(a + 1), subtitle='',
                              text=text(a + 3, b), url=f'faq.html#{prefix}{k + 1}', page='faq.html',
                              section=13, group=group, rows=rows_of(a + 3, b)))
    items.append(dict(id='welcome', type='intro', num='', title=L(9), subtitle=L(1), text=text(10, 11),
                      url='index.html#welcome', page='index.html', section=0, group='', rows=rows_of(10, 11)))
    toc = toc_items()
    items.append(dict(id='toc', type='intro', num='', title=L(12), subtitle=L(1),
                      text='\n'.join(f'{n}. {t}' for n, t in toc), url='index.html#toc',
                      page='index.html', section=0, group='', rows=[{'v': t, 'n': str(n)} for n, t in toc]))
    items.append(dict(id='closing', type='intro', num='', title=L(499), subtitle=L(500), text=L(501),
                      url='join.html', page='join.html', section=0, group='', rows=[{'v': L(501)}]))
    ids = {it['id'] for it in items}
    for it in items:
        it['related'] = [r for r in RELATED.get(it['id'], []) if r in ids and r != it['id']]
    kb = dict(version=1, pages=[dict(id=f.split('.')[0], url=f, title=t, icon=i) for f, t, i in PAGES], items=items)
    (SITE / 'data').mkdir(exist_ok=True)
    (SITE / 'data' / 'kb.js').write_text(
        '// Generated by tools/build_kb.py from content/brochure.txt — do not edit by hand.\n'
        'window.TAKAMUL_KB = ' + json.dumps(kb, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8')
    return kb


def _verify(kb):
    """Every row string must be a verbatim brochure line."""
    lines = {L(i) for i in range(1, len(D) + 1)}
    bad = []
    for it in kb['items']:
        for r in it['rows']:
            for key in ('h', 'k', 'v', 'tag', 'n'):
                if key in r and r[key] not in lines and not (key == 'n' and it['id'] == 'toc'):
                    bad.append((it['id'], key, r[key]))
    return bad


if __name__ == '__main__':
    kb = build_kb()
    problems = _verify(kb)
    for p in problems:
        print('NOT VERBATIM:', p)
    print('kb items:', len(kb['items']), '| rows:', sum(len(i['rows']) for i in kb['items']))
    raise SystemExit(1 if problems else 0)
