"""account.html — حسابي: الدخول وإنشاء حساب وشاشة لكل دور (إدارة، قائد فريق، عضو، ولي أمر). See docs/YANABEE_APP.md.

The page is one shell (`[data-account-root]`); js/account.js decides the screen from the signed-in profile's role. The words
that state rules or facts (the 5–7 members rule, the form labels, the paper parent consent, the names of the two
competitions) are content lines: they are rendered here through core.t() and handed to the script as JSON, never
typed in the script. Everything else (buttons, hints, errors) is UI chrome. Nothing about any account is in the HTML.
"""
import html as _html
import json
import re

from core import COMP as C, ICONS, PAGE_LABEL, page, page_hero, t

PAGE = 'account.html'

# icons the script draws (names from core.ICONS only)
ICON_NAMES = ['user', 'users', 'user-check', 'shield', 'lock', 'check', 'x', 'trash', 'printer', 'file-text', 'alert', 'chart',
              'calendar', 'clock', 'trophy', 'search', 'chevron-down', 'arrow-left', 'eye', 'flag', 'repeat', 'send', 'award',
              'hand-heart', 'star', 'landmark', 'bell', 'route']


def txt(s):
    """A content line as plain text, passed through core.t() (curly quotes) and with its markup removed."""
    return _html.unescape(re.sub(r'<[^>]+>', '', t(s)))


def words():
    f, m, k, fmt = C['c-form'], C['c-form']['f-members'], C['c-consent'], C['c-format']
    team = C['c-form']['f-team'].items
    kd = k['k-data'].items
    hd = m.table[0]
    return {
        'teamName': txt(team[0].text), 'leaderName': txt(team[1].text), 'area': txt(team[4].text),
        'memberName': txt(hd[1]), 'age': txt(hd[2]), 'contact': txt(hd[3]), 'membersTitle': txt(f['f-members'].title.partition(':')[2].strip() or f['f-members'].title),
        'countRule': txt(m.paras[0]),
        'guardianName': txt(kd[3].text), 'guardianPhone': txt(kd[5].text),
        'consentTitle': txt(k.title), 'consentNote': txt(k.paras[0]),
        'football': txt(fmt['fm-football'].title), 'chess': txt(fmt['fm-chess'].title),
    }


def data_blob():
    blob = {'icons': {n: ICONS[n] for n in ICON_NAMES}, 'words': words()}
    return json.dumps(blob, ensure_ascii=False).replace('</', '<\\/')


def build():
    hero = page_hero(PAGE, 'المسابقة الأولى · سورة الصف', 'حسابي',
                     'سجّل الدخول أو أنشئ حسابًا، وستجد شاشة تناسب دورك: قائد فريق، أو عضو، أو ولي أمر. أو جرّب أولًا بحسابات وهمية.', [], '', 'comp-hero acct-hero')
    skel = ('<div class="a-skel" aria-hidden="true"><i></i><i></i><i></i></div>')
    body = f'''{hero}
<section class="sec acct-sec" id="account">
  <div class="wrap">
    <div class="acct" data-account-root aria-busy="true" aria-label="حسابي">{skel}</div>
    <noscript><p class="a-note-plain">تحتاج صفحة الحساب إلى تفعيل JavaScript في المتصفح.</p></noscript>
    <div class="a-live" data-live role="status" aria-live="polite"></div>
    <script type="application/json" id="acct-data">{data_blob()}</script>
  </div>
</section>'''
    page(PAGE, PAGE_LABEL[PAGE], body, 'الدخول وإنشاء حساب في مسابقة ينابيع، وشاشة لكل دور: قائد الفريق والعضو وولي الأمر، وتجربة بحسابات وهمية.',
         css=('css/comp.css', 'css/account.css'),
         js=('js/yb-demo.js', 'js/yb-config.js', 'js/yb-api.js', 'js/tournament-engine.js', 'js/account.js'))
    return PAGE
