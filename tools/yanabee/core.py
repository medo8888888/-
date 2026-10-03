"""Shared core for the Yanabee site generator: typography, icons, site
structure, reusable components and the page shell.

Every visible content word comes verbatim from content/yanabee/*.txt through
content.py (PLATFORM, QURAN). UI chrome (button labels, hints) may be written
here. Entry point: python3 tools/yanabee/build.py — see docs/YANABEE.md.
"""
import html as _html
import re

from content import PLATFORM, QURAN, ROOT  # noqa: F401  (re-exported for page modules)

SITE = ROOT / 'site' / 'yanabee'

# ------------------------------------------------------------ typography ---
_LATIN = re.compile(r'[A-Za-z][A-Za-z0-9&+\-/.]*(?:\s+[A-Za-z0-9&+\-/.]+)*')


def esc(s):
    return _html.escape(s, quote=True)


def t(s):
    """Content text -> safe HTML: escape, curly Arabic quotes «…», and isolate
    Latin runs (CSR, Peer-to-Peer, KPI 1 …) so they don't scramble RTL lines."""
    s = re.sub(r'"([^"\n]+)"', '«\\1»', s)
    out, pos = [], 0
    for m in _LATIN.finditer(s):  # wrap on the raw text, then escape each piece
        out.append(esc(s[pos:m.start()]))
        out.append(f'<bdi lang="en">{esc(m.group(0))}</bdi>')
        pos = m.end()
    out.append(esc(s[pos:]))
    return ''.join(out).replace('&quot;', '"')


def plain(s):
    """Content text for attributes (title, aria-label, meta): quotes curled, escaped."""
    return esc(re.sub(r'"([^"\n]+)"', '«\\1»', s))


def split_kicker(title):
    """'أولاً: الرؤية والرسالة' -> ('أولاً', 'الرؤية والرسالة'); 'المحور الأول: الحفظ' -> ('المحور الأول', 'الحفظ').
    Titles without such a prefix -> ('', title)."""
    m = re.match(r'^(\S+(?:\s\S+){0,2}?):\s+(.+)$', title)
    if m and (re.match(r'^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً)$', m.group(1))
              or m.group(1).startswith('المحور ')):
        return m.group(1), m.group(2)
    return '', title


def strip_colon(s):
    return s[:-1].rstrip() if s.endswith(':') else s


def short(title):
    """Team title without its parenthetical: 'فرق الصحة والبيئة (المسار الأخضر والاستدامة)' -> 'فرق الصحة والبيئة'."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', title)


def paren(title):
    """The parenthetical of a title, without parentheses ('' if none)."""
    m = re.search(r'\(([^)]*)\)\s*$', title)
    return m.group(1) if m else ''


AR_DIGITS = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')
ORDINAL = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر']

# ----------------------------------------------------------------- icons ---
# Lucide (ISC licence) paths, 24x24, stroke icons.
ICONS = {
    'home': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'user': '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    'user-check': '<path d="m16 11 2 2 4-4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    'book': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    'tent': '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
    'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    'cpu': '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    'leaf': '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    'megaphone': '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    'hand-heart': '<path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"/><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 15 6 6"/><path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z"/>',
    'handshake': '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    'droplet': '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    'waves': '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'compass': '<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/>',
    'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    'route': '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    'network': '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
    'layers': '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    'gauge': '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    'chart': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    'award': '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
    'star': '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'scale': '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    'alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'coins': '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    'landmark': '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    'building': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    'cap': '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    'accessibility': '<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>',
    'map': '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    'pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    'qr': '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
    'tv': '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
    'smartphone': '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    'video': '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    'image': '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    'mic': '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    'bell': '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    'message': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'calendar': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    'repeat': '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    'lightbulb': '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    'basket': '<path d="m15 11-1 9"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"/><path d="M4.5 15.5h15"/><path d="m5 11 4-7"/><path d="m9 11 1 9"/>',
    'quote': '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
    'sparkles': '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    'menu': '<line x1="4" x2="20" y1="7" y2="7"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="17" y2="17"/>',
    'grid': '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    'trash': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'printer': '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
}


def svg(paths, cls='i'):
    """An inline stroke icon from raw SVG path markup (for page-local icons)."""
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths}</svg>')


def ic(name, cls='i'):
    return svg(ICONS[name], cls)


# The brand mark: a spring droplet with ripples. `uid` keeps gradient ids unique per page.
def logo(size=40, uid='a', cls='logo'):
    return f'''<svg class="{cls}" width="{size}" height="{size}" viewBox="0 0 48 48" aria-hidden="true">
<defs><linearGradient id="lg-{uid}" x1="10" y1="6" x2="38" y2="44" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#2fd3c6"/><stop offset=".55" stop-color="#14a3b8"/><stop offset="1" stop-color="#2c63d6"/></linearGradient></defs>
<path d="M24 3.5C24 3.5 9.5 19.6 9.5 29.6a14.5 14.5 0 0 0 29 0C38.5 19.6 24 3.5 24 3.5Z" fill="url(#lg-{uid})"/>
<path d="M15.2 29.4c3-2.7 6-2.7 8.8 0s5.9 2.7 8.8 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
<path d="M18.2 35.4c2-1.8 3.9-1.8 5.8 0s3.9 1.8 5.8 0" fill="none" stroke="#fff" stroke-opacity=".72" stroke-width="2.3" stroke-linecap="round"/>
<ellipse cx="18.6" cy="21.2" rx="2.1" ry="3.3" transform="rotate(28 18.6 21.2)" fill="#fff" fill-opacity=".45"/>
</svg>'''


# ------------------------------------------------------------- structure ---
# file, nav label (UI chrome), icon
PAGES = [
    ('index.html', 'الرئيسية', 'home'),
    ('teams.html', 'الفرق السبع', 'users'),
    ('operations.html', 'التشغيل والحوكمة', 'shield'),
    ('quran.html', 'حفظ، فهم، تطبيق', 'book-open'),
]
PAGE_LABEL = {f: label for f, label, _ in PAGES}

# Platform sections -> page. Quran sections all live on quran.html.
HOME_OF = {'s1': 'index.html', 's9': 'index.html', 's2': 'teams.html', 's3': 'teams.html',
           's4': 'operations.html', 's5': 'operations.html', 's6': 'operations.html',
           's7': 'operations.html', 's8': 'operations.html'}

# Seven teams: id -> (icon, colour token). Colours are --t1 … --t7 in base.css.
TEAMS = {
    't1': 'book-open', 't2': 'tent', 't3': 'trophy', 't4': 'cpu',
    't5': 'leaf', 't6': 'megaphone', 't7': 'hand-heart',
}
TEAM_IDS = list(TEAMS)

SEC_ICON = {'s1': 'eye', 's2': 'users', 's3': 'accessibility', 's4': 'megaphone', 's5': 'network',
            's6': 'coins', 's7': 'scale', 's8': 'layers', 's9': 'chart',
            'intro': 'book-open', 'goals': 'target', 'a1': 'book', 'a2': 'lightbulb', 'a3': 'users',
            'a4': 'hand-heart', 'a5': 'smartphone', 'a6': 'megaphone', 'a7': 'leaf', 'a8': 'network',
            'a9': 'coins', 'a10': 'award', 'a11': 'gauge'}


def link_for(nid):
    """Deep link for any section/subsection id of either document."""
    if nid in HOME_OF:
        return f'{HOME_OF[nid]}#{nid}'
    if nid in TEAMS:
        return f'teams.html#{nid}'
    for s in PLATFORM.sections:
        if any(sub.id == nid for sub in s.subs):
            return f'{HOME_OF[s.id]}#{nid}'
    return f'quran.html#{nid}'


# ------------------------------------------------------------ components ---
def item_html(it, cls='item'):
    """One bullet: bold label + body, with nested children."""
    head = (f'<b class="lbl">{t(strip_colon(it.label))}</b><span class="body">{t(it.body)}</span>'
            if it.label else f'<span class="body">{t(it.body)}</span>')
    kids = ''
    if it.children:
        kids = '<ul class="sublist">' + ''.join(f'<li>{_item_inner(c)}</li>' for c in it.children) + '</ul>'
    return f'<li class="{cls}">{head}{kids}</li>'


def _item_inner(it):
    if it.label:
        return f'<b class="lbl">{t(strip_colon(it.label))}</b><span class="body">{t(it.body)}</span>'
    return f'<span class="body">{t(it.body)}</span>'


def items_html(items, cls='list'):
    return f'<ul class="{cls}">' + ''.join(item_html(i) for i in items) + '</ul>'


def table_html(rows, cls='tbl', caption=''):
    """Accessible table; on phones base.css turns rows into labelled cards (data-th)."""
    head, body = rows[0], rows[1:]
    cap = f'<caption class="sr-only">{t(caption)}</caption>' if caption else ''
    th = ''.join(f'<th scope="col">{t(h)}</th>' for h in head)
    trs = ''
    for r in body:
        tds = ''.join(
            (f'<th scope="row" data-th="{plain(head[i])}">{t(c)}</th>' if i == 0 else f'<td data-th="{plain(head[i])}">{t(c)}</td>')
            for i, c in enumerate(r))
        trs += f'<tr>{tds}</tr>'
    return f'<div class="tbl-wrap rv"><table class="{cls}">{cap}<thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>'


def sec_head(title, icon=None, sub='', num=''):
    """Section heading: splits 'أولاً: …' / 'المحور الأول: …' into a kicker + title."""
    kicker, main = split_kicker(title)
    k = f'<span class="kicker">{ic(icon) if icon else ""}{t(kicker)}</span>' if kicker else (
        f'<span class="kicker">{ic(icon)}</span>' if icon else '')
    n = f'<span class="sec-num" aria-hidden="true">{num}</span>' if num else ''
    s = f'<p class="sec-sub">{sub}</p>' if sub else ''
    return f'<header class="sec-head rv">{n}<div>{k}<h2>{t(main)}</h2>{s}</div></header>'


def section(nid, title, body, icon=None, cls='', sub='', num='', color=None):
    style = f' style="--sc:var({color})"' if color else ''
    return f'''
<section class="sec {cls}" id="{nid}"{style}>
  <div class="wrap">
    {sec_head(title, icon, sub, num)}
    {body}
  </div>
</section>'''


def page_hero(fn, kicker, title, lead='', chips=(), visual='', cls=''):
    """Inner-page hero. chips: [(href, label)] in-page navigation."""
    ch = ''
    if chips:
        ch = '<nav class="chips rv" aria-label="أقسام الصفحة">' + ''.join(
            f'<a class="chip" href="{h}">{lab}</a>' for h, lab in chips) + '</nav>'
    ld = f'<p class="hero-lead rv">{lead}</p>' if lead else ''
    return f'''
<section class="hero hero-page {cls}">
  <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <span class="eyebrow rv">{logo(22, 'eb-' + fn.split('.')[0], 'eb-logo')}{kicker}</span>
      <h1 class="rv">{title}</h1>
      {ld}
      {ch}
    </div>
    {visual}
  </div>
</section>'''


def cta(title_html, text_html, buttons_html):
    return f'''
<section class="cta">
  <div class="wrap">
    <div class="cta-card rv">
      <div class="cta-bg" aria-hidden="true"></div>
      {logo(64, 'cta', 'cta-logo')}
      <h2>{title_html}</h2>
      <p>{text_html}</p>
      <div class="btns center">{buttons_html}</div>
    </div>
  </div>
</section>'''


def btn(href, label, icon=None, cls='btn-primary'):
    return f'<a class="btn {cls}" href="{href}">{ic(icon) if icon else ""}<span>{label}</span></a>'


# ----------------------------------------------------------------- shell ---
FONTS = ('https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;500;600;700'
         '&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Amiri:wght@400;700&display=swap')

SITE_NAME = 'مشروع «ينابيع»'


def page(fn, title, body, desc, css=(), js=(), base=None):
    """Write site/yanabee/<fn>. `title` is plain text; `body` is HTML for <main>."""
    P = PLATFORM
    links = ''.join(
        f'<a href="{h}"{" class=active aria-current=page" if h == fn else ""}>{lab}</a>' for h, lab, _ in PAGES)
    sheet = ''.join(
        f'<a class="sheet-item{" active" if h == fn else ""}" href="{h}"{" aria-current=page" if h == fn else ""}>{ic(i)}<span>{lab}</span></a>'
        for h, lab, i in PAGES)
    foot_pages = ''.join(f'<a href="{h}">{lab}</a>' for h, lab, _ in PAGES)
    foot_secs = ''.join(f'<a href="{link_for(s.id)}">{t(split_kicker(s.title)[1])}</a>' for s in P.sections)
    foot_axes = ''.join(f'<a href="quran.html#{s.id}">{t(split_kicker(s.title)[1])}</a>' for s in QURAN.sections[2:])

    def tab(h, label, icon):
        a = ' class="active" aria-current="page"' if h == fn else ''
        return f'<a href="{h}"{a}>{ic(icon)}<span>{label}</span></a>'

    tabbar = (tab('index.html', 'الرئيسية', 'home') + tab('teams.html', 'الفرق', 'users')
              + f'<button type="button" class="tab-ai" data-open-chat aria-label="اسأل مساعد ينابيع">{ic("sparkles")}<span>المساعد</span></button>'
              + tab('quran.html', 'المبادرة', 'book-open')
              + f'<button type="button" data-open-sheet aria-label="القائمة الكاملة">{ic("grid")}<span>المزيد</span></button>')
    extra_css = ''.join(f'<link rel="stylesheet" href="{h}">\n' for h in css)
    extra_js = ''.join(f'<script src="{h}" defer></script>\n' for h in js)
    full_title = f'{title} | {SITE_NAME}' if title != SITE_NAME else SITE_NAME
    base_tag = f'<base href="{base}">\n' if base else ''

    html = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{base_tag}<title>{plain(full_title)}</title>
<meta name="description" content="{plain(desc)}">
<meta name="theme-color" content="#f3f8f7">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="{plain(full_title)}">
<meta property="og:description" content="{plain(desc)}">
<meta property="og:image" content="assets/og.png">
<link rel="icon" href="assets/logo.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/icon-180.png">
<script>(function(){{var t;try{{t=localStorage.getItem('yanabee-theme')}}catch(e){{}}if(t!=='light'&&t!=='dark'){{t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}}var d=document.documentElement;d.dataset.theme=t;d.classList.add('js');setTimeout(function(){{if(!window.__yanabeeReady)d.classList.remove('js')}},2500)}})();</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{FONTS}" rel="stylesheet">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/assist.css">
{extra_css}<script src="data/kb.js" defer></script>
<script src="js/main.js" defer></script>
<script src="js/search.js" defer></script>
<script src="js/chat.js" defer></script>
{extra_js}</head>
<body data-page="{fn}">
<div class="progress" aria-hidden="true"></div>
<a class="skip" href="#main">تخطَّ إلى المحتوى</a>

<header class="nav">
  <div class="nav-bar">
    <a class="brand" href="index.html" aria-label="مشروع ينابيع – الرئيسية">
      {logo(42, 'nav')}
      <span><b>ينابيع</b><small>المنصة الوطنية الموحدة</small></span>
    </a>
    <nav class="links" aria-label="القائمة الرئيسية">
      <span class="pill pill-hover" aria-hidden="true"></span><span class="pill pill-active" aria-hidden="true"></span>
      {links}
    </nav>
    <div class="actions">
      <button type="button" class="icon-btn search-btn" data-open-search aria-label="بحث في الموقع" title="بحث (Ctrl+K)">{ic('search')}</button>
      <button type="button" class="icon-btn theme-toggle" aria-label="تبديل الوضع الليلي والنهاري" title="الوضع الليلي / النهاري">{ic('sun', 'i sun')}{ic('moon', 'i moon')}</button>
      <button type="button" class="btn-ai" data-open-chat>{ic('sparkles')}<span>اسأل ينابيع</span></button>
      <button type="button" class="icon-btn menu-btn" data-open-sheet aria-label="القائمة">{ic('menu')}</button>
    </div>
  </div>
</header>

<main id="main">
{body}
</main>

<footer class="footer">
  <div class="foot-wave" aria-hidden="true"><svg viewBox="0 0 1440 60" preserveAspectRatio="none"><path d="M0 30c120-26 240-26 360 0s240 26 360 0 240-26 360 0 240 26 360 0v30H0z"/></svg></div>
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <a class="brand" href="index.html" aria-label="مشروع ينابيع – الرئيسية">{logo(52, 'foot')}<span><b>ينابيع</b></span></a>
        <p>{t(P.meta['subtitle'].strip('()'))}</p>
      </div>
      <div><h4>الصفحات</h4>{foot_pages}</div>
      <div><h4>{t(P.meta['title'])}</h4>{foot_secs}</div>
      <div><h4>{t(QURAN.meta['title'])}</h4>{foot_axes}</div>
    </div>
    <div class="foot-bottom"><span>{t(P.meta['title'])} {t(P.meta['subtitle'])}</span><button type="button" class="link-btn" data-print>{ic('printer')}طباعة الصفحة</button></div>
  </div>
</footer>

<nav class="tabbar" aria-label="التنقل السريع">{tabbar}</nav>

<div class="sheet" hidden>
  <div class="sheet-backdrop" data-close-sheet></div>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="القائمة">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head"><b>القائمة</b><button type="button" class="icon-btn" data-close-sheet aria-label="إغلاق">{ic('x')}</button></div>
    <div class="sheet-grid">{sheet}</div>
    <div class="sheet-row">
      <button type="button" class="sheet-wide theme-toggle">{ic('sun', 'i sun')}{ic('moon', 'i moon')}<span class="label-light">الوضع الليلي</span><span class="label-dark">الوضع النهاري</span></button>
      <button type="button" class="sheet-wide" data-open-search>{ic('search')}<span>بحث</span></button>
      <button type="button" class="sheet-wide ai" data-open-chat>{ic('sparkles')}<span>اسأل ينابيع</span></button>
    </div>
  </div>
</div>

<div class="search" hidden>
  <div class="search-backdrop" data-close-search></div>
  <div class="search-panel" role="dialog" aria-modal="true" aria-label="بحث في الموقع">
    <div class="search-bar">{ic('search')}<input type="search" placeholder="ابحث في الفرق والمحاور والمؤشرات…" aria-label="كلمات البحث" autocomplete="off" enterkeyhint="search" role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list"><button type="button" class="icon-btn" data-close-search aria-label="إغلاق البحث">{ic('x')}</button></div>
    <div class="search-results" id="search-results" role="listbox" aria-label="نتائج البحث"></div>
    <p class="search-foot"><kbd>↑</kbd><kbd>↓</kbd> للتنقل · <kbd>Enter</kbd> للفتح · <kbd>Esc</kbd> للإغلاق</p>
  </div>
</div>

<button type="button" class="chat-fab" data-open-chat aria-label="افتح مساعد ينابيع">{ic('sparkles')}<span>اسأل ينابيع</span></button>
<div class="chat" hidden>
  <div class="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title">
    <div class="chat-head">
      {logo(38, 'chat')}
      <div><b id="chat-title">مساعد ينابيع</b><small><span class="dot"></span><span class="chat-mode">يجيب من وثائق المشروع</span></small></div>
      <button type="button" class="icon-btn chat-clear" aria-label="محادثة جديدة" title="محادثة جديدة">{ic('trash')}</button>
      <button type="button" class="icon-btn chat-close" aria-label="إغلاق المساعد">{ic('x')}</button>
    </div>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-suggest"></div>
    <form class="chat-form">
      <textarea rows="1" maxlength="1500" placeholder="اكتب سؤالك عن مشروع ينابيع…" aria-label="رسالتك"></textarea>
      <button type="submit" class="chat-send" aria-label="إرسال">{ic('send')}</button>
    </form>
    <p class="chat-note">قد يخطئ المساعد أحياناً؛ يُرجى الرجوع إلى نص الوثيقة في الموقع.</p>
  </div>
</div>

<button type="button" class="totop" aria-label="العودة للأعلى">{ic('arrow-up')}</button>
</body>
</html>
'''
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / fn).write_text(html, encoding='utf-8')
    return html
