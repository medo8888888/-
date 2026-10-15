#!/usr/bin/env python3
"""Fail (exit 1) unless every content line of content/yanabee/*.txt appears
verbatim as visible text on the Yanabee pages (404 excluded). Punctuation and
quote style are ignored (the site curls quotes); words, letters and numbers
must match exactly. Run after every build."""
import html
import re
import sys

from content import DOCS
from core import SITE

norm = lambda s: ' '.join(re.sub(r'[^\w\s]', ' ', s).split())  # noqa: E731


def visible_text(path):
    t = path.read_text(encoding='utf-8')
    t = re.sub(r'<(script|style|template|noscript)\b.*?</\1>', ' ', t, flags=re.S)
    t = re.sub(r'<head>.*?</head>', ' ', t, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    return html.unescape(t)


def main(argv):
    """Optional: --only s2,s3,t1 (check just those sections' lines, any document)."""
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else None
    pages = sorted(p for p in SITE.glob('*.html') if p.name != '404.html')
    if not pages:
        print('no pages built'); return 1
    text = {p.name: ' ' + norm(visible_text(p)) + ' ' for p in pages}
    allt = ' '.join(text.values())
    bad = 0
    for name, doc in DOCS.items():
        lines = doc.source_lines
        if only:
            lines = []
            for nid in only:
                try:
                    lines += doc.find(nid).lines()
                except KeyError:
                    pass
            if not lines:
                continue
        missing = [l for l in lines if norm(l) and ' ' + norm(l) + ' ' not in allt]
        for l in missing:
            print(f'MISSING [{name}] {l[:100]}')
        n = len([l for l in lines if norm(l)])
        print(f'content check [{name}]: {n - len(missing)}/{n} lines present')
        bad += len(missing)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
