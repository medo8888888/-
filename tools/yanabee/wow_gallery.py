"""Home: cinematic pinned horizontal gallery of the seven teams (+ inclusion).

Markup contract (css/gallery.css, js/gallery.js):

  .tgal[data-gallery]                      root; hidden below 1000px (the plain .team-grid shows there)
    .tgal-pin                              becomes the tall scroll track in live mode (JS adds .is-live)
      .tgal-stage                          sticky full-viewport stage in live mode
        .tgal-wash > i*8                   team-colour washes, cross-faded by scroll progress
        .tgal-bubbles > i*14               spring bubbles (CSS animation only)
        a.tgal-skip                        keyboard skip link
        .tgal-viewport > ol.tgal-track     native horizontal scroller by default (scroll-snap), moved by transform when live
          li.tg-panel*8                    one per team (TEAM_IDS order) + the inclusion card (section s3)
        nav.tgal-hud                       counter + 8-segment rail + hint (JS-only controls)
    span#tgal-end                          skip-link target

Every content word comes from content/yanabee/platform.txt through t(); only the labels of the
controls (التفاصيل, the rail and tab-list names, the skip link, the scroll hint) are UI chrome.
"""
import re

import art
from core import PLATFORM as P, TEAMS, TEAM_IDS, ic, plain, short, split_kicker, strip_colon, t, paren

_LATIN = re.compile(r'[A-Za-z"]')
IMPACT_ICON = ('user', 'home', 'users')  # الفرد / الأسرة / المجتمع


def _item(node, label):
    for it in node.items:
        if strip_colon(it.label) == label:
            return it
    raise KeyError(label)


def _title_words(text):
    """Title with every word in its own inline-block span so the words can rise one after another
    (shaping is per word, so Arabic letters still join). Falls back to plain t() for Latin/quotes."""
    if _LATIN.search(text):
        return t(text)
    return ' '.join(f'<span class="tg-w" style="--k:{k}">{t(w)}</span>' for k, w in enumerate(text.split()))


def _tabs(pid, label, rows):
    """rows: [(tab label, body, icon)] -> a [data-tabs] group (main.js wires it). Without JS every body is
    shown under its own label (CSS hides the tab list and the inline labels when JS runs)."""
    tabs = ''.join(
        f'<button type="button" role="tab" id="{pid}-tab{k}" aria-controls="{pid}-p{k}" aria-selected="{"true" if k == 0 else "false"}" '
        f'tabindex="{0 if k == 0 else -1}">{ic(icn)}<span>{t(lab)}</span></button>'
        for k, (lab, _, icn) in enumerate(rows))
    panels = ''.join(
        f'<div class="tg-tp" role="tabpanel" id="{pid}-p{k}" aria-labelledby="{pid}-tab{k}">'
        f'<b class="tg-tl">{t(lab)}:</b> <span>{t(body)}</span></div>'
        for k, (lab, body, _) in enumerate(rows))
    return (f'<div class="tg-imp tg-l" data-tabs style="--s:4"><div class="tg-tabs" role="tablist" aria-label="{plain(label)}">{tabs}</div>'
            f'{panels}</div>')


def _media(photo, icon, pos=None):
    return (f'<div class="tg-media" aria-hidden="true"><span class="tg-arch2"></span><span class="tg-shadow"></span>'
            f'<div class="tg-photo"><div class="tg-mask">{art.photo(photo, pos=pos)}<i class="tg-tint"></i></div></div>'
            f'<span class="tg-ic">{ic(icon)}</span></div>')


def _more(href, who):
    return (f'<a class="tg-more tg-l" href="{href}" style="--s:5"><span>التفاصيل<span class="sr-only"> — {plain(who)}</span></span>'
            f'{ic("arrow-left")}</a>')


def gallery():
    s2, s3 = P['s2'], P['s3']
    k2, main2 = split_kicker(s2.title)
    name = main2.split(' وأثرها')[0]  # 'الفرق السبع التخصصية'
    total = len(TEAM_IDS) + 1
    panels, segs, wash, names = '', '', '', []

    for i, tid in enumerate(TEAM_IDS, 1):
        node = s2[tid]
        work = _item(node, 'طبيعة العمل')
        sub = paren(node.title)
        who = short(node.title)
        names.append(who)
        rows = [(strip_colon(it.label), it.body, icn)
                for it, icn in zip((_item(node, 'الأثر على الفرد'), _item(node, 'الأثر على الأسرة'), _item(node, 'الأثر على المجتمع')),
                                   IMPACT_ICON)]
        panels += f'''
        <li class="tg-panel" id="g-{tid}" style="--tc:var(--{tid})" data-i="{i - 1}">
          <span class="tg-num" aria-hidden="true">{i:02d}</span>
          <div class="tg-copy">
            <h3 class="tg-title" style="--s:0">{_title_words(who)}</h3>
            {f'<p class="tg-sub tg-l" style="--s:2">{t(sub)}</p>' if sub else ''}
            <p class="tg-work tg-l" style="--s:3"><b>{t(work.label)}:</b> {t(work.body)}</p>
            {_tabs(f'g-{tid}', 'أبعاد الأثر', rows)}
            {_more(f'teams.html#{tid}', who)}
          </div>
          {_media('team-' + tid, TEAMS[tid])}
        </li>'''
        segs += (f'<button type="button" class="tg-seg" style="--tc:var(--{tid})" data-go="{i - 1}" title="{plain(who)}" aria-label="{i}. {plain(who)}">'
                 f'<i><b></b></i></button>')
        wash += f'<i style="--tc:var(--{tid})"></i>'

    k3, main3 = split_kicker(s3.title)
    names.append(main3)
    rows3 = [(strip_colon(it.label), it.body, icn) for it, icn in zip(s3.items, ('accessibility', 'map', 'heart'))]
    panels += f'''
        <li class="tg-panel tg-incl" id="g-s3" style="--tc:var(--brand)" data-i="{total - 1}">
          <span class="tg-num" aria-hidden="true">{total:02d}</span>
          <div class="tg-copy">
            <span class="tg-kick tg-l" style="--s:0">{t(k3)}</span>
            <h3 class="tg-title" style="--s:0">{_title_words(main3)}</h3>
            {_tabs('g-s3', 'محاور الشمول', rows3)}
            {_more('teams.html#s3', main3)}
          </div>
          {_media('inclusion', 'accessibility')}
        </li>'''
    segs += (f'<button type="button" class="tg-seg" style="--tc:var(--brand)" data-go="{total - 1}" title="{plain(main3)}" aria-label="{total}. {plain(main3)}">'
             f'<i><b></b></i></button>')
    wash += '<i style="--tc:var(--brand)"></i>'

    roll = ''.join(f'<i>{k:02d}</i>' for k in range(1, total + 1))
    # spring bubbles rising behind everything (pure CSS animation; deterministic spread, no randomness)
    bubbles = ''.join(
        f'<i style="--x:{(k * 37 + 11) % 97}%;--sz:{14 + (k * 29) % 38}px;--d:{-((k * 53) % 19)}s;--t:{15 + (k * 7) % 11}s;--dx:{((k * 41) % 120) - 60}px"></i>'
        for k in range(14))
    return f'''
    <div class="tgal" data-gallery role="group" aria-label="{plain(name)}" style="--n:{total}">
      <div class="tgal-pin" data-pin>
        <div class="tgal-stage" data-stage>
          <div class="tgal-wash" aria-hidden="true">{wash}</div>
          <div class="tgal-bubbles" aria-hidden="true">{bubbles}</div>
          <a class="tgal-skip" href="#tgal-end">تخطَّ المعرض</a>
          <div class="tgal-viewport" data-viewport>
            <ol class="tgal-track" data-track>{panels}
            </ol>
          </div>
          <nav class="tgal-hud" aria-label="التنقل بين الفرق" data-hud>
            <span class="tg-count" dir="ltr" aria-hidden="true"><span class="tg-roll"><span class="tg-strip" data-roll>{roll}</span></span><span class="tg-of">/ {total:02d}</span></span>
            <span class="tg-rail">{segs}</span>
            <span class="tg-hint" aria-hidden="true">{ic('chevron-down')}<span>مرِّر للأسفل</span></span>
          </nav>
        </div>
      </div>
      <span class="tgal-end" id="tgal-end" tabindex="-1"></span>
    </div>'''
