"""method.html — ملحق: منهجية ربط القرآن الكريم بالسلوك والتطبيق (content/yanabee/method.txt).

Content words come from METHOD via t(); layout and visual labels are UI chrome.
"""
from core import METHOD as M, PAGE_LABEL, btn, cta, ic, page, page_hero, plain, strip_colon, t
from features import assets
from docpage import ayah, blocks_html, head, num, sec, seg_bar
import feat_meeting_timer
import feat_publish_check

PAGE = 'method.html'
FIELD_ICON = ['home', 'building', 'heart', 'cap', 'users']
TONES = ['t1', 'sky', 't5', 'sun', 't7', 't3', 't4', 't6']


def hero():
    q = [b for k, b in M['m-intro'].blocks if k == 'quote'][0]
    visual = f'<div class="ch-visual rv"><div class="ch-ayah"><span class="ch-sura">سورة الصف</span><p>{t(q)}</p></div>' \
             f'<p class="ch-words"><b>حفظ</b><b>فهم</b><b>تطبيق</b></p></div>'
    chips = [('#m-fields', 'مجالات التطبيق'), ('#m-phases', 'المراحل'), ('#m-workshop', 'ورشة الفعل لا القول'),
             ('#m-meeting', 'اللقاء الأسبوعي'), ('#m-showcase', 'عرض الفريق'), ('#m-impact', 'قياس الأثر')]
    return page_hero(PAGE, t(M.meta['project']), t(M.meta['title']), t(M.meta['subtitle']), chips, visual, 'comp-hero')


def intro():
    n = M['m-intro']
    return sec('m-intro', head(n) + f'<div class="ch-about">{blocks_html(n)}</div>')


def cards(nid, rows, icons=None, cls='axes', alt=False):
    n = M[nid]
    li = ''.join(f'<li class="axis rv" style="--sc:var(--{TONES[i % len(TONES)]})">'
                 + (f'<span class="axis-ic">{ic(icons[i])}</span>' if icons else f'<span class="axis-ic num">{i + 1}</span>')
                 + f'<h3>{t(a)}</h3><p>{t(b)}</p></li>' for i, (a, b) in enumerate(rows))
    return sec(nid, head(n) + ''.join(f'<p class="dp-p rv">{t(p)}</p>' for p in n.paras)
               + f'<ul class="{cls}" data-stagger>{li}</ul>'
               + (f'<div class="tbl-print">{blocks_html(n)}</div>' if n.table else ''), 'alt' if alt else '')


def phases():
    n = M['m-phases']
    hd, rows = n.table[0], n.table[1:]
    weeks = [r[2] for r in rows]
    spans = [int(w.split('–')[1]) - int(w.split('–')[0]) + 1 for w in weeks]
    bar = seg_bar([(r[1], s, r[2]) for r, s in zip(rows, spans)], 'أسبوعًا', strip_colon(n.title))
    ph = ''.join(f'<li class="phase rv" style="--sc:var(--{TONES[i]})"><small>{t(r[0])} · {t(hd[2])} {t(r[2])}</small><h3>{t(r[1])}</h3>'
                 f'<p><b>{t(hd[3])}:</b> {t(r[3])}</p><p><b>{t(hd[4])}:</b> {t(r[4])}</p></li>' for i, r in enumerate(rows))
    return sec('m-phases', head(n) + bar + f'<ol class="phases">{ph}</ol><div class="tbl-print">{blocks_html(n)}</div>', 'alt')


def meeting():
    n = M['m-meeting']
    rows = [(r[1], num(r[0]), r[0]) for r in n.table[1:]]
    return sec('m-meeting', head(n) + seg_bar(rows, 'دقيقة', strip_colon(n.title)) + blocks_html(n) + feat_meeting_timer.html(), 'alt')


def media():
    n = M['m-media']
    return cards('m-media', [(strip_colon(it.label), it.body) for it in n.items], ['send', 'image', 'shield'])


def showcase():
    n = M['m-showcase']
    card, vis, gal, board, com = (n[x] for x in ('m-card', 'm-visual', 'm-gallery', 'm-board', 'm-comments'))
    q = [b for k, b in card.blocks if k == 'quote'][0]
    tiles = ''.join(f'<li class="gtile">{ic("image")}<span>{t(it.text)}</span></li>' for it in gal.items)
    stats = ''.join(f'<li><b>{t(b)}</b><span>{t(a)}</span></li>' for a, b in board.table[1:])
    chat = ''
    for it in com.items:
        chat += f'<li class="bub"><b>{t(strip_colon(it.label))}</b><p>{t(it.body)}</p></li>'
        for c in it.children:
            chat += f'<li class="bub me"><b>{t(strip_colon(c.label))}</b><p>{t(c.body)}</p></li>'
    demo = f'''
    <div class="showcase rv">
      <div class="sc-head" id="m-card"><span class="sc-badge">{ic('users')}</span><div><small>{t(card.title)}</small><p>{t(card.paras[0])}</p></div></div>
      {ayah(q)}
      <div class="dp-sub" id="m-visual"><h4>{t(vis.title)}</h4><p>{t(vis.paras[0])}</p></div>
      <div class="dp-sub" id="m-gallery"><h4>{t(gal.title)}</h4><ul class="gtiles">{tiles}</ul></div>
      <div class="dp-sub" id="m-board"><h4>{t(board.title)}</h4><ul class="sc-stats">{stats}</ul><div class="tbl-print">{blocks_html(board)}</div></div>
      <div class="dp-sub" id="m-comments"><h4>{t(com.title)}</h4><ul class="chat-demo">{chat}</ul></div>
    </div>'''
    return sec('m-showcase', head(n, 'image', sub='مثال توضيحي من الملحق لما يعرضه كل فريق؛ لا تُنشر فيه وجوه أو أسماء دون موافقة.') + demo)


def impact():
    n = M['m-impact']
    k, p = n['m-kpis'], n['m-privacy']
    tiles = ''.join(f'<li class="fact rv"><span class="fact-ic">{ic("gauge")}</span><small>{t(a)}</small><b>{t(b)}</b></li>' for a, b in k.table[1:])
    return sec('m-impact', head(n) + f'<div class="dp-sub" id="m-kpis">{head(k, level=3)}<ul class="facts" data-stagger>{tiles}</ul>'
               + f'<div class="tbl-print">{blocks_html(k)}</div></div>'
               + f'<div class="dp-sub pcard rv" id="m-privacy">{head(p, level=3)}{blocks_html(p)}</div>'
               + feat_publish_check.html(), 'alt')


def build():
    f = M['m-fields']
    r = M['m-roles']
    w = M['m-workshop']
    buttons = (btn('competition.html', 'المسابقة الأولى: سورة الصف', 'trophy') + btn('quran.html', 'مبادرة «حفظ، فهم، تطبيق»', 'book-open', 'btn-ghost')
               + btn('leaders.html', 'المرحلة الثانية: إعداد القادة', 'user-check', 'btn-ghost'))
    body = (hero() + intro()
            + cards('m-fields', [(a, b) for a, b in f.table[1:]], FIELD_ICON, alt=True)
            + phases().replace(' alt"', '"', 1)
            + cards('m-workshop', [(strip_colon(it.label), it.body) for it in w.items], None, 'axes four', alt=True)
            + cards('m-roles', [(a, b) for a, b in r.table[1:]], ['cap', 'flag', 'image', 'home'])
            + meeting() + media() + showcase() + impact()
            + cta(t(M.meta['title']), t(M['m-intro'].paras[1]), buttons))
    desc = M['m-intro'].paras[1]
    fcss, fjs = assets(PAGE)
    page(PAGE, PAGE_LABEL[PAGE], body, desc, css=('css/comp.css',) + fcss, js=fjs)
    return PAGE
