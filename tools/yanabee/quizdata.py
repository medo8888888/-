"""Question bank + learning data for learn.html, built from content.py at build time.

Everything a game shows (stems' quoted parts, answers, source lines) is a verbatim content
string. Only the question *templates* («أي فريق …؟») are UI chrome.

Output: site/yanabee/data/quiz.js, a classic script that sets
    window.YANABEE_QUIZ  = {rounds, questions: [...]}      (the quiz bank)
    window.YANABEE_LEARN = {teams, decks, daily, labels}   (flashcards, daily card, pick, match)

A question:  {id, t (type a…g), lead, quote, a:{t,k?}, d:[{t,k?}…] (distractor pool), s (source line), h (href)}
The runtime picks 3 distractors from `d` (or all of them when fewer), shuffles, and checks `a`.
"""
import json
import re

from content import PLATFORM as P, QURAN as Q
from core import ICONS, SEC_ICON, SITE, TEAMS, link_for, short, paren, split_kicker, strip_colon

TIDS = list(TEAMS)
TEAM = {t: P['s2'][t] for t in TIDS}
# item positions inside every team (same as page_teams)
BODIES, NATURE, IMP_IND, IMP_FAM, IMP_SOC = range(5)
IMPACT_IDX = (IMP_IND, IMP_FAM, IMP_SOC)


def team_short(tid):
    return short(TEAM[tid].title)


def opt(text, key=None):
    o = {'t': text}
    if key:
        o['k'] = key
    return o


def sample_distractors(correct, pool, n=3):
    return [o for o in pool if o['t'] != correct['t']]


# ---------------------------------------------------------------- questions ---
def questions():
    qs = []

    def add(kind, lead, quote, ans, dis, src, href, qlabel=''):
        qs.append({'t': kind, 'lead': lead, 'quote': quote, 'ql': qlabel, 'a': ans, 'd': dis, 's': src, 'h': href})

    team_opts = {tid: opt(team_short(tid), tid) for tid in TIDS}
    team_pool = list(team_opts.values())

    # (a) طبيعة العمل -> team
    for tid in TIDS:
        it = TEAM[tid].items[NATURE]
        add('a', 'أي فريق وُصفت «%s» فيه بهذه العبارة؟' % strip_colon(it.label), it.body,
            team_opts[tid], [o for o in team_pool if o['t'] != team_opts[tid]['t']], it.text, link_for(tid),
            strip_colon(it.label))

    # (b) الأثر على الفرد / الأسرة / المجتمع -> team
    for idx in IMPACT_IDX:
        for tid in TIDS:
            it = TEAM[tid].items[idx]
            add('b', 'لأي فريق تنتمي هذه العبارة من بند «%s»؟' % strip_colon(it.label), it.body,
                team_opts[tid], [o for o in team_pool if o['t'] != team_opts[tid]['t']], it.text, link_for(tid),
                strip_colon(it.label))

    # (c) funding: percentage <-> source
    fund = P['s6'].items[0]
    fl = strip_colon(fund.label)
    pcts = [c.label for c in fund.children]
    for c in fund.children:
        add('c', 'ما نسبة مصدر التمويل الذي وُصف بهذه العبارة ضمن «%s»؟' % fl, c.body,
            opt(c.label), [opt(x) for x in pcts if x != c.label], c.text, link_for('s6'), fl)
        add('c', 'أي مصدر من «%s» نسبته هذه؟' % fl, c.label,
            opt(c.body), [opt(x.body) for x in fund.children if x is not c], c.text, link_for('s6'), fl)

    # (d) growth phases: a clause -> phase
    ph = P['s9']['phases']
    ph_title = strip_colon(ph.title)
    for it in ph.items:
        others = [opt(o.label) for o in ph.items if o is not it]
        for clause in [c.strip() for c in it.body.split('،')]:
            if len(clause.split()) < 3:
                continue
            add('d', 'أي مرحلة من «%s» تذكر هذه العبارة؟' % ph_title, clause, opt(it.label), others,
                it.text, link_for('phases'), ph_title)

    # (e) Quran KPIs: sentence -> KPI name (the parenthesis)
    kpis = Q['a11']['kpis']
    kpi_title = split_kicker(kpis.title)[1]
    names = []
    for it in kpis.items:
        m = re.match(r'^KPI (\d+) \((.+)\)$', it.label)
        names.append((m.group(1), m.group(2), it))
    for n, name, it in names:
        add('e', 'أي مؤشر من «%s» تصفه هذه الجملة؟' % kpi_title, it.body,
            opt(name), [opt(x[1]) for x in names if x[0] != n], it.text, 'quran.html#kpi%s' % n, kpi_title)

    # (f) Quran axis that contains an item
    axes = [s for s in Q.sections[2:]]
    axis_opts = {s.id: opt(s.title) for s in axes}

    def axis_items(node):
        out = list(node.items)
        for sub in node.subs:
            out.extend(axis_items(sub))
        return out
    for s in axes:
        if s.id == 'a11':  # its items are the KPIs (type e)
            continue
        for it in axis_items(s):
            stem = it.label or it.text
            if len(stem) > 150:
                continue
            add('f', 'في أي محور من محاور المبادرة يرد هذا البند؟', strip_colon(stem), axis_opts[s.id],
                [o for k, o in axis_opts.items() if k != s.id], it.text, link_for(s.id), '')

    # (g) supervising bodies <-> team
    for tid in TIDS:
        it = TEAM[tid].items[BODIES]
        lab = strip_colon(it.label)
        add('g', 'أي فريق «%s» فيه كما يلي؟' % lab, it.body, team_opts[tid],
            [o for o in team_pool if o['t'] != team_opts[tid]['t']], it.text, link_for(tid), lab)
        add('g', 'ما «%s» للفريق التالي؟' % lab, team_short(tid), opt(it.body),
            [opt(TEAM[o].items[BODIES].body) for o in TIDS if o != tid], it.text, link_for(tid), lab)

    for i, q in enumerate(qs, 1):
        q['id'] = 'q%03d' % i
    validate(qs)
    return qs


def validate(qs):
    """One defensible correct answer per question; no duplicate options; no stem under two answers."""
    stems = {}
    for q in qs:
        texts = [q['a']['t']] + [d['t'] for d in q['d']]
        assert len(texts) == len(set(texts)), ('duplicate option text', q['id'], texts)
        assert len(q['d']) >= 2, ('too few distractors', q['id'])
        assert q['quote'].strip() and q['s'].strip() and q['h'], q['id']
        assert q['quote'] in q['s'] or q['t'] in ('c', 'f', 'g') or q['quote'] == q['a']['t'], ('quote not from source', q['id'])
        key = (q['lead'], q['quote'])
        assert key not in stems, ('stem twice', q['id'], stems.get(key))
        stems[key] = q['a']['t']
    # the same quoted text must never be the answer of two different questions of the same lead
    by_quote = {}
    for q in qs:
        by_quote.setdefault((q['t'], q['quote']), set()).add(q['a']['t'])
    for k, v in by_quote.items():
        assert len(v) == 1, ('quote with several answers', k, v)
    assert len(qs) >= 24
    # sampling needs at least 8 questions in more than 4 types
    assert len({q['t'] for q in qs}) >= 6


# --------------------------------------------------------------- learn data ---
def icon_of(name):
    return ICONS[name]


def teams_data():
    out = []
    for tid in TIDS:
        n = TEAM[tid]
        imp = [{'l': strip_colon(n.items[i].label), 'b': n.items[i].body} for i in IMPACT_IDX]
        out.append({
            'id': tid, 'short': team_short(tid), 'title': n.title, 'paren': paren(n.title),
            'icon': icon_of(TEAMS[tid]), 'href': link_for(tid),
            'natL': strip_colon(n.items[NATURE].label), 'nat': n.items[NATURE].body, 'natS': n.items[NATURE].text,
            'imp': imp,
        })
    return out


def decks_data():
    kpis = []
    for it in Q['a11']['kpis'].items:
        m = re.match(r'^KPI (\d+) \((.+)\)$', it.label)
        kpis.append({'id': 'k' + m.group(1), 'tag': 'KPI ' + m.group(1), 'front': m.group(2), 'back': [it.body],
                     'h': 'quran.html#kpi' + m.group(1), 'ic': icon_of('gauge')})

    def units(node):
        out = [[it.text] + [c.text for c in it.children] for it in node.items]
        for sub in node.subs:
            out.extend(units(sub))
        return out
    axes = []
    for s in Q.sections[2:]:
        kicker, main = split_kicker(s.title)
        back, size = [], 0
        for u in units(s):
            n = sum(len(x) for x in u)
            if back and size + n > 330:
                break
            back.append(u)
            size += n
        axes.append({'id': s.id, 'tag': kicker, 'front': main, 'back': back, 'h': link_for(s.id),
                     'ic': icon_of(SEC_ICON[s.id]), 'more': len(units(s)) > len(back)})
    tms = [{'id': tid, 'tag': paren(TEAM[tid].title), 'front': team_short(tid),
            'back': [TEAM[tid].items[NATURE].text], 'h': link_for(tid), 'ic': icon_of(TEAMS[tid]), 'c': tid}
           for tid in TIDS]
    return {'kpi': kpis, 'axes': axes, 'teams': tms}


def daily_data():
    pool = []
    for tid in TIDS:
        for idx in IMPACT_IDX:
            it = TEAM[tid].items[idx]
            pool.append({'k': strip_colon(it.label), 'who': team_short(tid), 'c': tid, 'x': it.body, 'h': link_for(tid)})
    for it in Q['a11']['kpis'].items:
        m = re.match(r'^KPI (\d+) \((.+)\)$', it.label)
        pool.append({'k': it.label, 'who': split_kicker(Q['a11']['kpis'].title)[1], 'c': '', 'x': it.body,
                     'h': 'quran.html#kpi' + m.group(1)})
    for i, it in enumerate(P['s1']['goal'].items):
        pool.append({'k': P['s1']['goal'].title, 'who': '', 'c': '', 'x': it.text, 'h': link_for('goal')})
    for i, it in enumerate(Q['goals'].items):
        pool.append({'k': Q['goals'].title, 'who': '', 'c': '', 'x': it.text, 'h': link_for('goals')})
    return pool


def build_js():
    data_q = {'rounds': 8, 'questions': questions()}
    learn = {'teams': teams_data(), 'decks': decks_data(), 'daily': daily_data(),
             'labels': {'nat': strip_colon(TEAM['t1'].items[NATURE].label)}}
    js = ('/* generated by tools/yanabee/quizdata.py from content/yanabee/*.txt - do not edit */\n'
          'window.YANABEE_QUIZ=%s;\nwindow.YANABEE_LEARN=%s;\n') % (
        json.dumps(data_q, ensure_ascii=False, separators=(',', ':')),
        json.dumps(learn, ensure_ascii=False, separators=(',', ':')))
    out = SITE / 'data' / 'quiz.js'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(js, encoding='utf-8')
    return data_q, learn


if __name__ == '__main__':
    dq, lr = build_js()
    from collections import Counter
    print(len(dq['questions']), Counter(q['t'] for q in dq['questions']))
