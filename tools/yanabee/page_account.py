"""account.html — حسابي: الدخول وإنشاء حساب وشاشة لكل دور (إدارة، قائد فريق، عضو، ولي أمر). See docs/YANABEE_APP.md."""
from core import PAGE_LABEL, page, page_hero

PAGE = 'account.html'


def build():
    body = page_hero(PAGE, 'المسابقة الأولى · سورة الصف', 'حسابي', 'الدخول وإنشاء حساب.', [], '', 'comp-hero')
    page(PAGE, PAGE_LABEL[PAGE], body, 'الدخول وإنشاء حساب في مسابقة ينابيع.', css=('css/comp.css',))
    return PAGE
