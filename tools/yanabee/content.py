"""Parse the Yanabee content files (content/yanabee/*.txt) into a small tree.

Markup, one line per entry (see the header of content/yanabee/platform.txt):
    % comment                     ignored
    @key text                     document metadata (title, subtitle, project)
    # id | heading                top-level section
    ## id | heading               subsection of the current section
    - text                        bullet item       (  - text  = child of the previous item)
    | a | b | c |                 table row (the first row of a table is its header)
    > text                        quotation (Quran verse, hadith)
    anything else                 paragraph

Every visible word on the site comes from these files, verbatim (see
docs/YANABEE.md). Pages reach content by id, never by line number:

    from content import PLATFORM as P
    P['s1']['vision'].paras[0]       # a paragraph
    P['s2']['t1'].items[0].label     # 'الجهة الأقرب للإشراف والممارسة'
    P['s8'].table                    # [[header cells], [row cells], ...]
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTENT = ROOT / 'content' / 'yanabee'

LABEL_MAX = 70  # an item "label: body" is split only when the label is short


class Item:
    """A bullet. `label`/`body` split the text at the first ':' (when the part
    before it is short); otherwise label is '' and body is the whole text."""

    def __init__(self, text):
        self.text = text
        self.children = []
        m = re.match(r'^([^:]{1,%d}):\s*(.*)$' % LABEL_MAX, text)
        if m and not re.search(r'https?$', m.group(1)):
            self.label, self.body = m.group(1).strip(), m.group(2).strip()
        else:
            self.label, self.body = '', text

    def lines(self):
        """All source lines of this item (itself + children), for search/KB."""
        return [self.text] + [c.text for c in self.children]

    def __repr__(self):
        return f'Item({self.text[:40]!r}, children={len(self.children)})'


class Node:
    """A section ('#') or subsection ('##'). `blocks` keeps document order:
    ('p', str) | ('ul', [Item]) | ('table', [[str]]) | ('quote', str)."""

    def __init__(self, id, title, level):
        self.id, self.title, self.level = id, title, level
        self.blocks = []
        self.subs = []

    # --- children -------------------------------------------------------
    def __getitem__(self, sid):
        for s in self.subs:
            if s.id == sid:
                return s
        raise KeyError(f'{self.id}: no subsection {sid!r} (have {[s.id for s in self.subs]})')

    # --- convenient views (own blocks only, not subsections) -------------
    @property
    def paras(self):
        return [b for t, b in self.blocks if t == 'p']

    @property
    def items(self):
        out = []
        for t, b in self.blocks:
            if t == 'ul':
                out.extend(b)
        return out

    @property
    def table(self):
        for t, b in self.blocks:
            if t == 'table':
                return b
        return []

    @property
    def quotes(self):
        return [b for t, b in self.blocks if t == 'quote']

    def lines(self, deep=True):
        """Source lines in order (title first), for search/KB/checks."""
        out = [self.title]
        for t, b in self.blocks:
            if t in ('p', 'quote'):
                out.append(b)
            elif t == 'ul':
                for it in b:
                    out.extend(it.lines())
            elif t == 'table':
                out.extend(' | '.join(r) for r in b)
        if deep:
            for s in self.subs:
                out.extend(s.lines())
        return out

    def __repr__(self):
        return f'Node({self.id!r}, {self.title[:30]!r}, subs={[s.id for s in self.subs]})'


class Doc:
    def __init__(self, name):
        self.name = name
        self.meta = {}
        self.sections = []
        self.source_lines = []  # every visible source line (for check_content)

    def __getitem__(self, sid):
        for s in self.sections:
            if s.id == sid:
                return s
        raise KeyError(f'{self.name}: no section {sid!r} (have {[s.id for s in self.sections]})')

    def find(self, nid):
        """Find a section or subsection by id anywhere in the document."""
        for s in self.sections:
            if s.id == nid:
                return s
            for sub in s.subs:
                if sub.id == nid:
                    return sub
        raise KeyError(f'{self.name}: no node {nid!r}')

    def __repr__(self):
        return f'Doc({self.name!r}, {[s.id for s in self.sections]})'


def parse(name):
    path = CONTENT / f'{name}.txt'
    doc = Doc(name)
    sec = node = None
    last_item = None
    ids = set()

    def block(kind):
        """Return the open block of `kind` at the end of the current node, or open one."""
        if node is None:
            raise ValueError(f'{path.name}: content before the first "#" heading')
        if node.blocks and node.blocks[-1][0] == kind:
            return node.blocks[-1][1]
        node.blocks.append((kind, []))
        return node.blocks[-1][1]

    for n, raw in enumerate(path.read_text(encoding='utf-8').split('\n'), 1):
        line = raw.rstrip()
        if not line.strip() or line.startswith('%'):
            continue
        where = f'{path.name}:{n}'
        if line.startswith('@'):
            key, _, val = line[1:].partition(' ')
            doc.meta[key] = val.strip()
            doc.source_lines.append(val.strip())
            continue
        m = re.match(r'^(#{1,2})\s+([\w-]+)\s*\|\s*(.+)$', line)
        if m:
            level, nid, title = len(m.group(1)), m.group(2), m.group(3).strip()
            if nid in ids:
                raise ValueError(f'{where}: duplicate id {nid!r}')
            ids.add(nid)
            if level == 1:
                sec = node = Node(nid, title, 1)
                doc.sections.append(sec)
            else:
                if sec is None:
                    raise ValueError(f'{where}: "##" before any "#"')
                node = Node(nid, title, 2)
                sec.subs.append(node)
            last_item = None
            doc.source_lines.append(title)
            continue
        if line.startswith('#'):
            raise ValueError(f'{where}: malformed heading (expected "# id | title")')
        m = re.match(r'^( *)- (.+)$', line)
        if m:
            text = m.group(2).strip()
            if len(m.group(1)) >= 2:
                if last_item is None:
                    raise ValueError(f'{where}: nested item without a parent')
                last_item.children.append(Item(text))
            else:
                last_item = Item(text)
                block('ul').append(last_item)
            doc.source_lines.append(text)
            continue
        last_item = None
        s = line.strip()
        if s.startswith('|'):
            cells = [c.strip() for c in s.strip('|').split('|')]
            block('table').append(cells)
            doc.source_lines.extend(cells)
        elif s.startswith('>'):
            if node is None:
                raise ValueError(f'{where}: quotation before the first "#" heading')
            q = s[1:].strip()
            node.blocks.append(('quote', q))
            doc.source_lines.append(q)
        else:
            if node is None:
                raise ValueError(f'{where}: paragraph before the first "#" heading')
            node.blocks.append(('p', s))
            doc.source_lines.append(s)
    return doc


PLATFORM = parse('platform')
QURAN = parse('quran')
DOCS = {'platform': PLATFORM, 'quran': QURAN}


if __name__ == '__main__':  # quick structural dump
    for d in DOCS.values():
        print(d, d.meta)
        for s in d.sections:
            print(' ', s, f'paras={len(s.paras)} items={len(s.items)} table={len(s.table)} quotes={len(s.quotes)}')
            for sub in s.subs:
                print('    ', sub, f'paras={len(sub.paras)} items={len(sub.items)} table={len(sub.table)}')
        print('  source lines:', len(d.source_lines))
