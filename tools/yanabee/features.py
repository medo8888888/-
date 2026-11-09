"""Interactive features built on the documents (one module tools/yanabee/feat_<id>.py each, plus optional
site/yanabee/css/<id>.css and site/yanabee/js/<id>.js). Each page's build() loads the assets of its features
through assets(); the feature's markup is placed by the page function that owns its section.

A feature only uses the documents' own words (via core.t()) and UI chrome; numbers in tools are the documents'
numbers. Nothing is sent over the network; data a visitor types stays in that browser (localStorage at most).
"""
from core import SITE

# feature id -> page it lives on (assets load in this order, after the page's own files)
FEATURES = {
    'team-builder': 'register.html',
    'calendar-ics': 'competition.html',
    'ad-maker': 'competition.html',
    'match-day': 'competition.html',
    'league-table': 'competition.html',
    'rule-finder': 'competition.html',
    'judge-sheet': 'competition.html',
    'activity-card': 'competition.html',
    'partner-kit': 'competition.html',
    'meeting-timer': 'method.html',
    'publish-check': 'method.html',
    'pledge-cards': 'method.html',
    'student-week': 'quran.html',
    'halaqa-council': 'quran.html',
}


def assets(page):
    """(css, js) tuples of the features on `page` whose files exist."""
    ids = [f for f, p in FEATURES.items() if p == page]
    css = tuple(f'css/{f}.css' for f in ids if (SITE / 'css' / f'{f}.css').exists())
    js = tuple(f'js/{f}.js' for f in ids if (SITE / 'js' / f'{f}.js').exists())
    return css, js
