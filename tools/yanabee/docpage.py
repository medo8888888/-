"""Shared renderers for the newer documents (competition.txt, leaders.txt, method.txt).

Every content word still comes from the content files through core.t(); what is written here is
markup and UI chrome only. Pages: page_competition, page_register, page_leaders, page_method.
"""
import re

from core import SEC_ICON, ic, items_html, plain, split_kicker, strip_colon, t, table_html


def blocks_html(node, skip=()):
    """A node's own blocks in document order: paragraphs, ayat, lists, tables."""
    out = []
    for i, (kind, b) in enumerate(node.blocks):
        if i in skip:
            continue
        if kind == 'p':
            out.append(f'<p class="dp-p rv">{t(b)}</p>')
        elif kind == 'quote':
            out.append(ayah(b))
        elif kind == 'ul':
            out.append(items_html(b, 'list dp-list rv'))
        elif kind == 'table':
            out.append(table_html(b, 'tbl dp-tbl', caption=split_kicker(node.title)[1]))
    return ''.join(out)


def ayah(text):
    return f'<blockquote class="dp-ayah rv"><p>{t(text)}</p></blockquote>'


DOC_KICKER = {'c-': 'المسابقة الأولى · سورة الصف', 'l-': 'المرحلة الثانية · إعداد القادة', 'm-': 'ملحق المنهجية'}


def head(node, icon=None, level=2, sub=''):
    """Heading for a (sub)section: 'أولًا: …' becomes a kicker + title."""
    kicker, main = split_kicker(node.title)
    icon = icon or SEC_ICON.get(node.id)
    if not kicker and level == 2:
        kicker = DOC_KICKER.get(node.id[:2], '')  # UI chrome: which document this section belongs to
    k = f'<span class="kicker">{ic(icon) if icon else ""}{t(kicker)}</span>' if kicker else ''
    s = f'<p class="sec-sub">{sub}</p>' if sub else ''
    if level == 2:
        return f'<header class="sec-head rv"><div>{k}<h2>{t(strip_colon(main))}</h2>{s}</div></header>'
    return f'<h3 class="dp-h3 rv" id="h-{node.id}">{k}{t(strip_colon(main))}</h3>'


def node_html(node, level=2, icon=None):
    """A whole node: heading, own blocks, then each subsection."""
    body = head(node, icon, level) + blocks_html(node)
    for sub in node.subs:
        body += f'<div class="dp-sub" id="{sub.id}">' + head(sub, level=3) + blocks_html(sub) + '</div>'
    return body


def sec(nid, inner, cls='', tone=None):
    style = f' style="--sc:var(--{tone})"' if tone else ''
    return f'<section class="sec dp-sec {cls}" id="{nid}"{style}><div class="wrap">{inner}</div></section>'


def fold(node, open_=False, num='', icon=None):
    """A collapsible chapter (regulations): <details> keeps the text in the page for print and search."""
    kicker, main = split_kicker(node.title)
    n = f'<span class="fold-n" aria-hidden="true">{num}</span>' if num else (
        f'<span class="fold-n" aria-hidden="true">{ic(icon)}</span>' if icon else '')
    kk = f'<small>{t(kicker)}</small>' if kicker else ''
    return (f'<details class="fold rv" id="{node.id}"{" open" if open_ else ""}>'
            f'<summary>{n}<span class="fold-t">{kk}<b>{t(strip_colon(main))}</b></span>{ic("chevron-down", "i fold-c")}</summary>'
            f'<div class="fold-b">{blocks_html(node)}'
            + ''.join(f'<div class="dp-sub" id="{s.id}">{head(s, level=3)}{blocks_html(s)}</div>' for s in node.subs)
            + '</div></details>')


def seg_bar(rows, unit, label, cols=None):
    """Proportional bar for a timed agenda or a score split. rows: [(name, value, display)] — numbers from the text.
    cols: the source table's header cells, shown as the bar's key (name · value)."""
    total = sum(v for _, v, _ in rows) or 1
    segs = ''.join(
        f'<li style="--w:{v / total * 100:.3f}%;--k:{i}"><b>{t(d)}</b><span>{t(n)}</span></li>'
        for i, (n, v, d) in enumerate(rows))
    return (f'<figure class="segbar rv" aria-label="{plain(label)}"><ol>{segs}</ol>'
            f'<figcaption>{t(label)} — {total:g} {unit}'
            + (f' <small class="sb-key">({t(cols[0])} · {t(cols[1])})</small>' if cols else '') + '</figcaption></figure>')


def num(s):
    """First number in a cell ('10 دقائق' -> 10.0)."""
    m = re.search(r'\d+(?:\.\d+)?', s)
    return float(m.group()) if m else 0.0


STATUS = '''<div class="cstatus" data-comp-status aria-live="polite">
  <span class="cs-dot" aria-hidden="true"></span>
  <div class="cs-t"><b data-cs-title>المسابقة الأولى: سورة الصف</b><span data-cs-sub>التسجيل 1 نوفمبر 2026 · الانطلاق 15 نوفمبر 2026 · الختام 25 يناير 2027 · الحفل 31 يناير 2027</span></div>
  <div class="cs-count" data-cs-count hidden><b data-cs-n></b><small data-cs-unit></small></div>
</div>'''
