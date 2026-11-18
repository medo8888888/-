"""leaders.html — المرحلة الثانية: إعداد القادة والمساعدين المتميزين (content/yanabee/leaders.txt).

Content words come from LEADERS via t(); layout and the few labels on visuals are UI chrome. Numbers drawn
(minutes, weights, weeks) are the numbers of the adjacent text.
"""
from core import LEADERS as L, PAGE_LABEL, btn, cta, ic, page, page_hero, plain, strip_colon, t
from docpage import blocks_html, head, node_html, num, sec, seg_bar

PAGE = 'leaders.html'
AX_ICON = ['lightbulb', 'shield', 'handshake', 'flag']
TG_ICON = ['users', 'user-check', 'calendar', 'grid', 'target', 'hand-heart', 'check', 'clock']
M_TONE = ['sky', 't1', 't5', 'sun']


def hero():
    months = L['l-weeks'].subs
    strip = ''.join(
        f'<li style="--sc:var(--{M_TONE[i]})"><b>{i + 1}</b><span>{t(strip_colon(m.title.partition(":")[2].strip()))}</span></li>'
        for i, m in enumerate(months))
    visual = f'<div class="ch-visual rv"><ol class="mstrip" aria-label="أشهر البرنامج">{strip}</ol>' \
             f'<p class="ch-cap">{t(L["l-idea"].paras[0])}</p></div>'
    chips = [('#l-axes', 'المحاور'), ('#l-targets', 'المستهدفات'), ('#l-weeks', 'البرنامج الأسبوعي'),
             ('#l-meeting', 'اللقاء التدريبي'), ('#l-practice', 'الممارسة العملية'), ('#l-success', 'مؤشرات النجاح')]
    return page_hero(PAGE, t(L.meta['project']), t(L.meta['title']), t(L.meta['subtitle']), chips, visual, 'comp-hero')


def idea():
    n = L['l-idea']
    cards = ''.join(f'<li class="icard rv" id="{s.id}"><h3>{t(strip_colon(s.title))}</h3>{blocks_html(s)}</li>' for s in n.subs)
    return sec('l-idea', head(n) + blocks_html(n, skip=(0,)) + f'<ul class="icards">{cards}</ul>')


def targets():
    n = L['l-targets']
    tiles = ''.join(f'<li class="fact rv"><span class="fact-ic">{ic(TG_ICON[i % len(TG_ICON)])}</span><small>{t(a)}</small><b>{t(b)}</b></li>'
                    for i, (a, b) in enumerate(n.table[1:]))
    return sec('l-targets', head(n) + f'<ul class="facts" data-stagger>{tiles}</ul><div class="tbl-print">{blocks_html(n)}</div>', 'alt')


def axes():
    n = L['l-axes']
    cards = ''.join(f'<li class="axis rv" style="--sc:var(--{M_TONE[i]})"><span class="axis-ic">{ic(AX_ICON[i])}</span>'
                    f'<h3>{t(strip_colon(it.label))}</h3><p>{t(it.body)}</p></li>' for i, it in enumerate(n.items))
    return sec('l-axes', head(n) + f'<ul class="axes four" data-stagger>{cards}</ul>')


def weights(rows, label):
    bars = ''.join(f'<li><span>{t(a)}</span><i style="--v:{num(b)}%"></i><b>{t(b)}</b></li>' for a, b in rows)
    return f'<ul class="wbars rv" aria-label="{plain(label)}">{bars}</ul>'


def select():
    n = L['l-select']
    return sec('l-select', head(n) + f'<p class="dp-p rv">{t(n.paras[0])}</p>' + weights(n.table[1:], n.title)
               + f'<div class="tbl-print">{blocks_html(n, skip=(0,))}</div>', 'alt')


def weeks():
    n = L['l-weeks']
    cols = ''
    for i, m in enumerate(n.subs):
        k, _, main = m.title.partition(':')
        hd = m.table[0]
        wk = ''.join(f'<li class="wk"><span class="wk-n">{t(hd[0])} {t(r[0])}</span><b>{t(r[1])}</b><p><small>{t(hd[2])}:</small> {t(r[2])}</p></li>'
                     for r in m.table[1:])
        cols += (f'<div class="month rv" id="{m.id}" style="--sc:var(--{M_TONE[i]})"><h3><small>{t(k.strip())}</small>{t(main.strip())}</h3>'
                 f'<ol class="wks">{wk}</ol></div>')
    return sec('l-weeks', head(n) + f'<div class="months">{cols}</div>')


def meeting():
    n = L['l-meeting']
    rows = [(a, num(b), b) for a, b in n.table[1:]]
    # UI chrome: deep links into the meeting timer on method.html (meeting-timer feature), preselecting the agenda
    run = lambda href, label: f'<p class="btns rv">{btn(href, label, "clock", "btn-soft btn-sm")}</p>'  # noqa: E731
    return sec('l-meeting', head(n) + seg_bar(rows, 'دقيقة', strip_colon(n.title), n.table[0]) + f'<div class="tbl-print">{blocks_html(n, skip=(0,))}</div>'
               + run('method.html?mt=l100#mt', 'شغّل هذا اللقاء بالمؤقّت')
               + f'<p class="dp-p rv">{t(n.paras[0])}</p>' + run('method.html?mt=l30#mt', 'شغّل لقاء التقييم بالمؤقّت'), 'alt')


def practice():
    n = L['l-practice']
    out = head(n)
    for s in n.subs:
        body = blocks_html(s)
        if s.table and len(s.table[0]) == 2 and s.table[1][1].endswith('%'):
            body = ''.join(f'<p class="dp-p rv">{t(p)}</p>' for p in s.paras) + weights(s.table[1:], s.title) \
                   + f'<div class="tbl-print">{blocks_html(s, skip=tuple(range(len(s.paras))))}</div>'
        out += f'<div class="dp-sub pcard rv" id="{s.id}">{head(s, level=3)}{body}</div>'
    return sec('l-practice', out)


def success():
    n = L['l-success']
    cards = ''.join(f'<li class="axis rv" style="--sc:var(--{M_TONE[i]})"><span class="axis-ic">{ic(["target", "check", "users"][i])}</span>'
                    f'<h3>{t(strip_colon(it.label))}</h3><p>{t(it.body)}</p></li>' for i, it in enumerate(n.items))
    return sec('l-success', head(n) + f'<ul class="axes three" data-stagger>{cards}</ul>'
               + f'<p class="pass rv">{ic("award")}<span>{t(n.paras[0])}</span></p>', 'alt')


def outputs():
    n, r = L['l-outputs'], L['l-roles']
    summ = n['l-summary']
    flow = ''.join(f'<li>{t(x.strip())}</li>' for x in summ.paras[0].split('←'))
    return (sec('l-roles', node_html(r))
            + sec('l-outputs', head(n) + blocks_html(n)
                  + f'<div class="dp-sub" id="l-summary">{head(summ, level=3)}<ol class="flow rv" aria-label="{plain(summ.paras[0])}">{flow}</ol>'
                  + f'<p class="dp-p rv">{t(summ.paras[1])}</p></div>', 'alt'))


def build():
    buttons = (btn('competition.html', 'المسابقة الأولى: سورة الصف', 'trophy') + btn('method.html', 'منهجية ربط القرآن بالسلوك', 'route', 'btn-ghost'))
    body = (hero() + idea() + axes() + targets() + select() + weeks() + meeting() + practice() + success() + outputs()
            + cta(t(L.meta['title']), t(L['l-outputs']['l-summary'].paras[1]), buttons))
    desc = L['l-idea'].paras[1] + ' ' + L['l-idea']['l-goal'].paras[0]
    page(PAGE, PAGE_LABEL[PAGE], body, desc, css=('css/comp.css',))
    return PAGE
