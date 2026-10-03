#!/usr/bin/env python3
"""Fail (exit 1) unless every non-empty brochure line appears verbatim as visible
text on the site pages (404 excluded). Run after every build."""
import glob
import html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
norm = lambda s: ' '.join(re.sub(r'[^\w\s]', ' ', s).split())  # noqa: E731
site = ''
for f in sorted(glob.glob(str(ROOT / 'site' / '*.html'))):
    if f.endswith('404.html'):
        continue
    t = pathlib.Path(f).read_text(encoding='utf-8')
    t = re.sub(r'<(script|style)\b.*?</\1>', ' ', t, flags=re.S)
    t = re.sub(r'<head>.*?</head>', ' ', t, flags=re.S)
    t = re.sub(r'<(template|noscript)\b.*?</\1>', ' ', t, flags=re.S)
    site += ' ' + html.unescape(re.sub(r'<[^>]+>', ' ', t))
S = ' ' + norm(site) + ' '
lines = (ROOT / 'content' / 'brochure.txt').read_text(encoding='utf-8').split('\n')
missing = [(i, l) for i, l in enumerate(lines, 1) if norm(l) and ' ' + norm(l) + ' ' not in S]
header = 'جمعية تكامل لبناء القيم والتنمية   |   الكتيب التعريفي للأعضاء الجدد'
if ' ' + norm(header) + ' ' not in S:
    missing.append((0, header))
checked = sum(1 for l in lines if norm(l))
for i, l in missing:
    print(f'MISSING line {i}: {l[:90]}')
print(f'content check: {checked - len([m for m in missing if m[0]])}/{checked} brochure lines present'
      + ('' if not missing else f' — {len(missing)} missing'))
sys.exit(1 if missing else 0)
