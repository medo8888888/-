"""Home: app-style swipe carousel of the seven teams (+ inclusion) with a detail sheet.

Markup contract (css/gallery.css, js/gallery.js). Nothing is pinned, nothing is staged:

  div.tgal[data-gallery]  role=region aria-roledescription=carousel     root (also carries .rv: the shared fade-up)
    ul.tgal-scroller[data-scroller]                native scroll-snap row along the inline axis (RTL), peeking neighbours
      li.tg-item#g-t1 … #g-t7, #g-s3               8 cards: the seven teams + inclusion (deep-link ids)
        a.tg-card[href=teams.html#tN]              the whole card is the tap target; JS opens the detail sheet instead
          div.tg-media > div.tg-photo (arched photo) + span.tg-ic (icon badge)
          div.tg-body > h3.tg-title, .tg-sub, .tg-brief, .tg-go
        div.tg-detail[hidden]                      verbatim detail used by the sheet (and printed): work text, three impact
                                                   lines, the details link. Never fetched, never invented.
    div.tgal-bar[data-bar]                         prev / 8 segment buttons / next (JS-only controls, shown with .is-ready)
  template[data-sheet-tpl]                         skeleton of the detail sheet (js/gallery.js clones it into <body>)

Every content word comes from content/yanabee/platform.txt through t(); only the labels of the controls
(السابق, التالي, إغلاق, التفاصيل, the tab-list names) are UI chrome.
"""
import art
from core import PLATFORM as P, TEAMS, TEAM_IDS, ic, plain, short, split_kicker, strip_colon, svg, t, paren

IMPACT_ICON = ('user', 'home', 'users')  # الفرد / الأسرة / المجتمع
CHEV_NEXT = svg('<path d="m15 18-6-6 6-6"/>')   # points left: "next" in RTL
CHEV_PREV = svg('<path d="m9 18 6-6-6-6"/>')    # points right: "previous" in RTL


def _item(node, label):
    for it in node.items:
        if strip_colon(it.label) == label:
            return it
    raise KeyError(label)


def _media(photo, icon):
    return (f'<div class="tg-media" aria-hidden="true"><div class="tg-photo">{art.photo(photo)}<i class="tg-tint"></i></div>'
            f'<span class="tg-ic">{ic(icon)}</span></div>')


def _detail(href, who, tabs_label, work, rows):
    """Hidden verbatim detail of one card. rows: [(label, body, icon)] -> the sheet's three tabs."""
    work_html = f'<p class="tg-d-work"><b>{t(work.label)}:</b> {t(work.body)}</p>' if work else ''
    imp = ''.join(
        f'<p class="tg-d-i"><span class="tg-d-ic" aria-hidden="true">{ic(icn)}</span><b class="tg-d-l">{t(lab)}:</b> <span class="tg-d-b">{t(body)}</span></p>'
        for lab, body, icn in rows)
    return (f'<div class="tg-detail" hidden data-tabs-label="{plain(tabs_label)}">{work_html}'
            f'<div class="tg-d-imp">{imp}</div>'
            f'<a class="tg-d-more" href="{href}"><span>التفاصيل</span><span class="sr-only"> — {plain(who)}</span></a></div>')


def _dot(i, tc, who):
    return (f'<button type="button" class="tg-dot" style="--tc:{tc}" data-go="{i}" aria-label="{plain(who)}">'
            f'<i></i></button>')


def gallery():
    s2, s3 = P['s2'], P['s3']
    k2, main2 = split_kicker(s2.title)
    name = main2.split(' وأثرها')[0]  # 'الفرق السبع التخصصية'
    total = len(TEAM_IDS) + 1
    items, dots = '', ''

    for i, tid in enumerate(TEAM_IDS):
        node = s2[tid]
        work = _item(node, 'طبيعة العمل')
        sub = paren(node.title)
        who = short(node.title)
        rows = [(strip_colon(it.label), it.body, icn)
                for it, icn in zip((_item(node, 'الأثر على الفرد'), _item(node, 'الأثر على الأسرة'), _item(node, 'الأثر على المجتمع')),
                                   IMPACT_ICON)]
        tc = f'var(--{tid})'
        items += f'''
      <li class="tg-item" id="g-{tid}" style="--tc:{tc}" data-i="{i}">
        <a class="tg-card" href="teams.html#{tid}" draggable="false" aria-labelledby="g-{tid}-h" aria-describedby="g-{tid}-b">
          {_media('team-' + tid, TEAMS[tid])}
          <div class="tg-body">
            <h3 class="tg-title" id="g-{tid}-h">{t(who)}</h3>
            {f'<p class="tg-sub">{t(sub)}</p>' if sub else ''}
            <p class="tg-brief" id="g-{tid}-b">{t(work.body)}</p>
            <span class="tg-go" aria-hidden="true"><span>التفاصيل</span>{ic('arrow-left')}</span>
          </div>
        </a>
        {_detail(f'teams.html#{tid}', who, 'أبعاد الأثر', work, rows)}
      </li>'''
        dots += _dot(i, tc, who)

    k3, main3 = split_kicker(s3.title)
    rows3 = [(strip_colon(it.label), it.body, icn) for it, icn in zip(s3.items, ('accessibility', 'map', 'heart'))]
    chips = ''.join(f'<span class="tg-chip">{t(strip_colon(it.label))}</span>' for it in s3.items)
    items += f'''
      <li class="tg-item tg-incl" id="g-s3" style="--tc:var(--brand)" data-i="{total - 1}">
        <a class="tg-card" href="teams.html#s3" draggable="false" aria-labelledby="g-s3-h" aria-describedby="g-s3-b">
          {_media('inclusion', 'accessibility')}
          <div class="tg-body">
            <p class="tg-kick">{t(k3)}</p>
            <h3 class="tg-title" id="g-s3-h">{t(main3)}</h3>
            <div class="tg-chips" id="g-s3-b">{chips}</div>
            <span class="tg-go" aria-hidden="true"><span>التفاصيل</span>{ic('arrow-left')}</span>
          </div>
        </a>
        {_detail('teams.html#s3', main3, 'محاور الشمول', None, rows3)}
      </li>'''
    dots += _dot(total - 1, 'var(--brand)', main3)

    return f'''
    <div class="tgal rv" data-gallery role="region" aria-roledescription="carousel" aria-label="{plain(name)}" style="--n:{total}">
      <ul class="tgal-scroller" data-scroller aria-label="{plain(name)}">{items}
      </ul>
      <div class="tgal-bar" data-bar>
        <button type="button" class="tg-nav tg-prev" data-prev aria-label="الفريق السابق">{CHEV_PREV}</button>
        <div class="tg-dots" role="group" aria-label="التنقل بين الفرق">{dots}</div>
        <button type="button" class="tg-nav tg-next" data-next aria-label="الفريق التالي">{CHEV_NEXT}</button>
      </div>
      <template data-sheet-tpl>
        <div class="tsheet" hidden>
          <div class="tsheet-scrim" data-close></div>
          <div class="tsheet-panel" role="dialog" aria-modal="true" aria-labelledby="tsheet-title" tabindex="-1">
            <div class="tsheet-top" data-grab>
              <span class="tsheet-handle" aria-hidden="true"></span>
              <div class="tsheet-head">
                <span class="tsheet-ic" data-slot="ic" aria-hidden="true"></span>
                <div class="tsheet-ttl"><h2 class="tsheet-title" id="tsheet-title" data-slot="title"></h2><p class="tsheet-sub" data-slot="sub"></p></div>
                <button type="button" class="tsheet-x" data-close aria-label="إغلاق">{ic('x')}</button>
              </div>
              <div class="tsheet-art" data-slot="art" aria-hidden="true"><div class="tsheet-art-in" data-slot="art-in"></div></div>
            </div>
            <div class="tsheet-body" data-body>
              <div class="tsheet-text">
                <p class="tsheet-work" data-slot="work"></p>
                <div class="tg-seg" role="tablist" data-seg="own" data-slot="tabs"><span class="seg-ind" aria-hidden="true"></span></div>
                <div class="tsheet-panels" data-slot="panels"></div>
                <div class="tsheet-foot" data-slot="more"></div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>'''
