"""privacy.html — الخصوصية وحماية البيانات (content/yanabee/privacy.txt).

Written for the site (not from the project's documents); it describes what the site does. Content words come from
PRIVACY via t(); layout and the short chip labels are UI chrome.
"""
from core import PAGE_LABEL, PRIVACY as P, btn, cta, ic, page, page_hero, t
from docpage import blocks_html, head, sec

PAGE = 'privacy.html'
ICON = {'p-who': 'landmark', 'p-what': 'file-text', 'p-see': 'eye', 'p-photos': 'image', 'p-where': 'home', 'p-keep': 'clock',
        'p-rights': 'scale', 'p-kids': 'users', 'p-security': 'shield', 'p-change': 'repeat'}
CHIPS = [('#p-what', 'ما نجمعه'), ('#p-see', 'من يرى ماذا'), ('#p-photos', 'الصور'), ('#p-rights', 'حقوقكم'), ('#p-security', 'الحماية')]


def build():
    visual = (f'<div class="ch-visual rv"><div class="ch-ayah"><span class="ch-sura">{ic("lock")} آخر تحديث</span>'
              f'<p>{t(P.meta["updated"])}</p></div></div>')
    hero = page_hero(PAGE, t(P.meta['project']), t(P.meta['title']), t(P.meta['subtitle']), CHIPS, visual, 'comp-hero')
    body = hero + ''.join(sec(n.id, head(n, ICON.get(n.id)) + f'<div class="ch-about">{blocks_html(n)}</div>', 'alt' if i % 2 else '')
                          for i, n in enumerate(P.sections))
    body += cta(t(P.meta['title']), 'نزّلوا نسخة من بياناتكم، أو اطلبوا تصحيحها أو حذفها، أو غيّروا موافقة التصوير من حسابكم.',
                btn('account.html#privacy', 'الخصوصية وبياناتي', 'user') + btn('competition.html#c-consent', 'نموذج موافقة ولي الأمر', 'file-text', 'btn-ghost'))
    page(PAGE, PAGE_LABEL[PAGE], body, P.meta['subtitle'], css=('css/comp.css',))
    return PAGE
