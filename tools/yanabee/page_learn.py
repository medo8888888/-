"""Learn & play page (placeholder until the learn-and-play work-stream lands)."""
from core import page


def build():
    page('learn.html', 'تعلّم والعب', '<section class="sec"><div class="wrap"><h1>تعلّم والعب</h1></div></section>',
         'ألعاب واختبارات وبطاقات تعليمية من وثائق مشروع ينابيع.', css=('css/learn.css',), js=('js/learn.js',))
    return 'learn.html'
