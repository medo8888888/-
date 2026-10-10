"""مختبر ينابيع — the playable prototype of the program (shell: hero, honesty note, tabs).
Panels come from lab_studio.section() and lab_season.section(); each has its own css/js."""
from core import PLATFORM as P, btn, ic, logo, page, t
import lab_season
import lab_studio

NOTE = ('نموذج تجريبي مقترح مبني على وثيقة المشروع: القواعد والأهداف والنسب تأتي من الوثيقة وتظهر مع مصدرها، '
        'أما السيناريوهات والأسماء والأرقام التوضيحية فهي من تصميمنا لتجربة الفكرة.')


def build():
    tabs = [('studio', 'ستوديو الفريق', 'users'), ('season', 'لعبة موسم القائد', 'target')]
    tablist = ''.join(
        f'<button type="button" role="tab" id="tab-{i}" aria-controls="panel-{i}" aria-selected="{"true" if k == 0 else "false"}">{ic(icn)}<span>{lab}</span></button>'
        for k, (i, lab, icn) in enumerate(tabs))
    body = f'''
<section class="hero hero-page lab-hero">
  <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
  <div class="wrap">
    <span class="eyebrow rv">{logo(22, 'lab', 'eb-logo')}{t(P.meta['title'])}</span>
    <h1 class="rv">مختبر <span class="grad-text">ينابيع</span></h1>
    <p class="hero-lead rv">شغّل البرنامج بنفسك: كوّن فريقاً، وخُض تحديات الأسبوع، وأدِر موسماً كاملاً كمشرف إقليمي.</p>
    <p class="lab-note rv">{NOTE}</p>
  </div>
</section>
<section class="sec lab" id="lab">
  <div class="wrap">
    <div data-tabs class="lab-tabs">
      <div class="lab-tablist" role="tablist" aria-label="مختبر ينابيع">{tablist}</div>
      <div class="lab-panel" role="tabpanel" id="panel-studio" aria-labelledby="tab-studio">{lab_studio.section()}</div>
      <div class="lab-panel" role="tabpanel" id="panel-season" aria-labelledby="tab-season" hidden>{lab_season.section()}</div>
    </div>
  </div>
</section>'''
    page('lab.html', 'مختبر ينابيع', body, 'جرّب برنامج ينابيع: كوّن فريقاً، وخض التحديات الأسبوعية، وأدِر موسماً كاملاً.',
         css=('css/lab.css', 'css/studio.css', 'css/season.css'), js=('js/studio.js', 'js/season.js'))
    return 'lab.html'
