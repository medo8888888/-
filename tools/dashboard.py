"""Command-center page (dashboard.html). Owned by the dashboard work-stream.
Placeholder until the full bento dashboard lands. See docs/ARCHITECTURE.md."""
from core import *  # noqa: F401,F403


def build_dashboard():
    body = f'''
<section class="hero hero-small">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-grid"><div class="hero-copy">
    <span class="eyebrow rv">{ic('chart')} {L(1)}</span>
    <h1 class="rv">لوحة القيادة</h1>
  </div></div>
</section>
{cta()}'''
    page('dashboard.html', 'لوحة القيادة', body, L(242), css=('css/dashboard.css',), js=('js/dashboard.js',))
