"""404 page for /yanabee/* (Cloudflare serves the nearest 404.html)."""
from core import btn, ic, logo, page


def build():
    body = f'''
<section class="hero hero-page nf">
  <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
  <div class="wrap center">
    {logo(96, 'nf', 'nf-logo')}
    <h1>الصفحة غير موجودة</h1>
    <p class="hero-lead" style="margin-inline:auto">ربما تغيّر الرابط أو كُتب بشكل غير صحيح. يمكنك العودة إلى الرئيسية أو البحث في الموقع.</p>
    <div class="btns center">
      {btn('index.html', 'العودة إلى الرئيسية', 'home')}
      <button type="button" class="btn btn-ghost" data-open-search>{ic('search')}<span>بحث في الموقع</span></button>
    </div>
  </div>
</section>'''
    page('404.html', 'الصفحة غير موجودة', body, 'الصفحة المطلوبة غير موجودة في موقع مشروع ينابيع.', base='/yanabee/')
    return '404.html'
