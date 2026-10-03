"""Home page: hero (springs canvas), s1 vision/mission/goal, the seven teams,
the operating model, s9 growth phases + impact index, the Quran initiative."""
import re

from core import (PAGE_LABEL, PLATFORM as P, QURAN as Q, TEAMS, TEAM_IDS, btn, cta, ic, logo, page, paren,
                  plain, short, split_kicker, strip_colon, t)


def _title_html():
    h = t(P.meta['title'])  # 'مشروع «ينابيع»'
    return h.replace('«ينابيع»', '<span class="grad-text">«ينابيع»</span>')


def _item(node, label):
    for it in node.items:
        if strip_colon(it.label) == label:
            return it
    raise KeyError(label)


def hero():
    sub = P.meta['subtitle'].strip('()')
    dots = ''.join(f'<i style="--c:var(--{tid})"></i>' for tid in TEAM_IDS)
    s2_main = split_kicker(P['s2'].title)[1]
    teams_label = s2_main.split(' وأثرها')[0]  # 'الفرق السبع التخصصية'
    g = P['s9']['phases'].items[1]  # النمو (العام 2): … 1,000 قائد موهوب … 100 مبادرة …
    m = re.match(r'^(.+?) \((.+?)\)$', g.label)
    phase_tag = f'{t(m.group(1))} · {t(m.group(2))}' if m else t(g.label)
    stats = f'''
      <div class="hero-stats rv" data-stagger>
        <div class="hs"><b data-to="7">7</b><span>{t('فرق تخصصية تكاملية')}</span></div>
        <div class="hs"><small>{phase_tag}</small><b data-to="1000">1,000</b><span>{t('قائد موهوب من قادة الفرق')}</span></div>
        <div class="hs"><small>{phase_tag}</small><b data-to="100">100</b><span>{t('مبادرة مجتمعية وبيئية')}</span></div>
      </div>'''
    return f'''
<section class="hero hero-home">
  <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <a class="eyebrow team-dots rv" href="teams.html"><span class="dots" aria-hidden="true">{dots}</span>{t(teams_label)}{ic('arrow-left')}</a>
      <h1 class="rv">{_title_html()}</h1>
      <p class="hero-sub rv">{t(sub)}</p>
      <div class="btns rv">
        {btn('teams.html', 'استكشف الفرق السبع', 'users')}
        {btn('quran.html', t(Q.meta['title']), 'book-open', 'btn-ghost')}
      </div>
      {stats}
    </div>
    <div class="hero-visual" aria-hidden="true">
      <canvas class="springs" data-springs></canvas>
      <div class="spring-core">{logo(64, 'core', 'core-logo')}</div>
    </div>
  </div>
  <a class="scroll-cue" href="#s1" aria-label="انتقل إلى الرؤية والرسالة">{ic('chevron-down')}</a>
</section>'''


def s1():
    s = P['s1']
    k, main = split_kicker(s.title)
    v, m, g = s['vision'], s['mission'], s['goal']
    goals = ''.join(
        f'<li class="goal rv"><span class="gnum" aria-hidden="true">{i}</span><div><h4>{t(it.label)}</h4><p>{t(it.body)}</p></div></li>'
        if it.label else f'<li class="goal rv"><span class="gnum" aria-hidden="true">{i}</span><div><p class="strong">{t(it.body)}</p></div></li>'
        for i, it in enumerate(g.items, 1))
    return f'''
<section class="sec s1" id="s1">
  <div class="wrap">
    <header class="sec-head rv"><div><span class="kicker">{ic('eye')}{t(k)}</span><h2>{t(main)}</h2></div></header>
    <div class="bento">
      <article class="b-vision rv" id="vision">
        <div class="b-glow" aria-hidden="true"></div>
        <span class="b-label">{ic('eye')}<h3>{t(v.title)}</h3></span>
        <p class="vision-text">{t(v.paras[0])}</p>
      </article>
      <article class="b-mission rv" id="mission">
        <span class="b-label">{ic('route')}<h3>{t(m.title)}</h3></span>
        <p>{t(m.paras[0])}</p>
      </article>
      <article class="b-goal rv" id="goal">
        <span class="b-label">{ic('target')}<h3>{t(g.title)}</h3></span>
        <ol class="goals">{goals}</ol>
      </article>
    </div>
  </div>
</section>'''


def teams():
    s2 = P['s2']
    k, main = split_kicker(s2.title)
    cards = ''
    for i, tid in enumerate(TEAM_IDS, 1):
        node = s2[tid]
        work = _item(node, 'طبيعة العمل')
        sub = paren(node.title)
        cards += f'''
      <a class="team-card rv" href="teams.html#{tid}" style="--tc:var(--{tid})">
        <span class="tc-num" aria-hidden="true">{i:02d}</span>
        <span class="tc-ic">{ic(TEAMS[tid])}</span>
        <h3>{t(short(node.title))}</h3>
        {f'<p class="tc-sub">{t(sub)}</p>' if sub else ''}
        <p class="tc-work"><b>{t(work.label)}:</b> {t(work.body)}</p>
        <span class="tc-more">التفاصيل {ic('arrow-left')}</span>
      </a>'''
    s3 = P['s3']
    k3, main3 = split_kicker(s3.title)
    cards += f'''
      <a class="team-card tc-incl rv" href="teams.html#s3">
        <span class="tc-ic">{ic('accessibility')}</span>
        <span class="tc-kicker">{t(k3)}</span>
        <h3>{t(main3)}</h3>
        <ul class="incl-list">{''.join(f'<li>{t(strip_colon(it.label))}</li>' for it in s3.items)}</ul>
        <span class="tc-more">التفاصيل {ic('arrow-left')}</span>
      </a>'''
    return f'''
<section class="sec band teams-home" id="teams">
  <div class="wrap">
    <header class="sec-head rv"><div><span class="kicker">{ic('users')}{t(k)}</span><h2>{t(main)}</h2><p class="sec-sub">{t(s2.paras[0])}</p></div></header>
    <div class="team-grid" data-stagger>{cards}
    </div>
  </div>
</section>'''


def model():
    s5, s6 = P['s5'], P['s6']
    k5, main5 = split_kicker(s5.title)
    principle = s5.paras[0]
    pillars = ''.join(
        f'<a class="pillar rv" href="operations.html#s5"><span class="pl-ic">{ic(icn)}</span><b>{t(strip_colon(it.label))}</b></a>'
        for it, icn in zip(s5.items, ('landmark', 'smartphone', 'users')))
    fund = s6.items[0]
    shares = []
    for c in fund.children:
        mm = re.match(r'^(\d+)%', c.label or c.text)
        shares.append(int(mm.group(1)) if mm else 0)
    legend = ''.join(
        f'<li style="--fc:var(--f{i})"><b>{t(c.label)}</b><span>{t(c.body)}</span></li>'
        for i, c in enumerate(fund.children, 1))
    a, b = shares[0], shares[0] + shares[1]
    return f'''
<section class="sec model" id="model">
  <div class="wrap">
    <div class="model-card rv">
      <div class="model-bg" aria-hidden="true"></div>
      <div class="model-main">
        <span class="kicker on-dark">{ic('network')}{t(k5)} · {t(main5)}</span>
        <p class="principle">{t(principle)}</p>
        <div class="pillars" data-stagger>{''.join([pillars])}</div>
        {btn('operations.html', PAGE_LABEL['operations.html'], 'shield', 'btn-ghost on-dark')}
      </div>
      <div class="model-fund">
        <h3>{t(strip_colon(fund.label))}</h3>
        <a class="donut" href="operations.html#s6" style="--a:{a};--b:{b}" aria-label="{plain(strip_colon(fund.label))}: {' / '.join(f'{x}%' for x in shares)}">
          <span class="donut-hole"><b>{shares[0]}%</b></span>
        </a>
        <ul class="fund-legend">{legend}</ul>
      </div>
    </div>
  </div>
</section>'''


def s9():
    s = P['s9']
    k, main = split_kicker(s.title)
    ph, im = s['phases'], s['impact']
    steps = ''
    for i, it in enumerate(ph.items, 1):
        mm = re.match(r'^(.+?) \((.+?)\)$', it.label)
        name, year = (mm.group(1), mm.group(2)) if mm else (it.label, '')
        body = t(it.body)
        for num in ('30%', '1,000', '100'):  # highlight numbers that are literally in the text
            body = re.sub(rf'(?<![\d,]){re.escape(num)}(?![\d,%])' if num != '30%' else re.escape(num),
                          f'<mark>{num}</mark>', body, count=1)
        steps += f'''
        <li class="phase rv" style="--i:{i}">
          <span class="ph-dot" aria-hidden="true"><i></i></span>
          <h4>{t(name)}</h4>
          <span class="ph-year">{t(year)}</span>
          <p>{body}</p>
        </li>'''
    q, ql = im.items
    q_chips = ''.join(f'<li>{t(x)}</li>' for x in re.split(r'،\s*', q.body))
    pre, _, rest = ql.body.partition('لقياس:')
    ql_chips = ''.join(f'<li>{t(x)}</li>' for x in re.split(r'،\s*', rest.strip()))
    return f'''
<section class="sec s9" id="s9">
  <div class="wrap">
    <header class="sec-head rv"><div><span class="kicker">{ic('chart')}{t(k)}</span><h2>{t(main)}</h2></div></header>
    <div class="phases-wrap" id="phases">
      <h3 class="sub-h rv">{ic('route')}{t(strip_colon(ph.title))}</h3>
      <div class="phases-track">
        <div class="river" aria-hidden="true"><svg viewBox="0 0 1000 80" preserveAspectRatio="none"><path d="M0 40 C 120 24, 230 56, 340 40 S 560 24, 670 40 S 880 56, 1000 40"/></svg></div>
        <ol class="phases">{steps}
        </ol>
      </div>
    </div>
    <div class="impact" id="impact">
      <h3 class="sub-h rv">{ic('gauge')}{t(strip_colon(im.title))}</h3>
      <div class="impact-grid">
        <article class="card imp rv" style="--sc:var(--sky)">
          <div class="ic">{ic('chart')}</div>
          <h4>{t(strip_colon(q.label))}</h4>
          <ul class="imp-chips">{q_chips}</ul>
        </article>
        <article class="card imp rv" style="--sc:var(--sun)">
          <div class="ic">{ic('user-check')}</div>
          <h4>{t(strip_colon(ql.label))}</h4>
          <p>{t(pre.strip())} {t('لقياس:')}</p>
          <ul class="imp-chips">{ql_chips}</ul>
        </article>
      </div>
    </div>
  </div>
</section>'''


def initiative():
    closing = Q['intro'].paras[-1]
    words = [('حفظ', 'a1', 'book'), ('فهم', 'a2', 'lightbulb'), ('تطبيق', 'a4', 'hand-heart')]
    tiles = ''.join(
        f'<a class="w-tile" href="quran.html#{aid}"><span class="w-ic">{ic(icn)}</span><b>{w}</b><small>{t(split_kicker(Q[aid].title)[1])}</small></a>'
        for w, aid, icn in words)
    kpis = Q['a11']['kpis'].items[:3]
    rings = ''
    for i, it in enumerate(kpis, 1):
        mm = re.search(r'(\d+)%', it.body)
        if not mm:
            continue
        name = re.match(r'^KPI \d+ \((.+)\)$', it.label)
        rings += f'''<a class="mini-kpi" href="quran.html#kpi{i}"><span class="ring" data-ring style="--v:{mm.group(1)};--rs:78px;--rw:8px"><span>{mm.group(1)}%</span></span><small>{t(name.group(1) if name else it.label)}</small></a>'''
    return f'''
<section class="sec initiative" id="initiative">
  <div class="wrap">
    <div class="init-card rv">
      <div class="init-pattern" aria-hidden="true"></div>
      <div class="init-copy">
        <span class="kicker">{ic('book-open')}{t(Q.meta['subtitle'])}</span>
        <h2>{t(Q.meta['title'])}</h2>
        <p>{t(closing)}</p>
        <div class="w-tiles">{tiles}</div>
        <div class="btns">{btn('quran.html', 'استكشف المبادرة', 'arrow-left', 'btn-primary btn-emerald')}</div>
      </div>
      <div class="init-side">
        <p class="verse-mini">{t(Q['intro'].quotes[0])}</p>
        <div class="mini-kpis">{rings}</div>
      </div>
    </div>
  </div>
</section>'''


def build():
    body = (hero() + s1() + teams() + model() + s9() + initiative()
            + cta(t(P.meta['title']), 'اسأل المساعد عن أي تفصيل في وثائق المشروع، أو ابحث في الفرق والمحاور والمؤشرات.',
                  f'<button type="button" class="btn btn-primary" data-open-chat>{ic("sparkles")}<span>اسأل مساعد ينابيع</span></button>'
                  f'<button type="button" class="btn btn-ghost" data-open-search>{ic("search")}<span>ابحث في الموقع</span></button>'))
    desc = P['s1']['vision'].paras[0]
    page('index.html', 'مشروع «ينابيع»', body, desc, css=('css/home.css',), js=('js/springs.js',))
    return 'index.html'
