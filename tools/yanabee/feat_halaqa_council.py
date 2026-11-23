"""«أدوات مجلس قادة الفرق: مداورة القيادة والدوري القيمي» — two working tools for the halaqa teams of axis three
(inside quran.html #a3). Feature id: halaqa-council (css/halaqa-council.css, js/halaqa-council.js).

Build time: every sentence comes from content.py, found by its label/content (never by position alone) and
asserted, then rendered verbatim with core.t(); the JS receives only what it must compute with (the team size range
from the a3 label, for a soft warning) in <script type="application/json" id="hc-data">.
  a3        «تكوين الفريق (6 - 10 طلاب)» and its three roles; only «قائد الفريق … يداور هذا الدور شهرياً» rotates.
            The two other roles are assigned by hand (the document does not say they rotate).
  a3        «الدوري القيمي والتنافس الشريف: … (الحفظ + التفسير + … + التزام الفريق)» -> the four point columns.
            No weights or scale are given, so the tool only adds what the council enters.
  a8        «مجلس قادة الفرق: …» and the weekly follow-up meeting sentence.
  a10       «1. الجوائز الدورية (الأسبوعية والشهرية):» + «درع الفريق المثالي: …» — a reference quote only; the tool
            never says a shield was awarded (the period of the shield is not stated).
  a7, KPI 6 the second row of leaders and «وتناوب القيادة بانتظام».
  c-score   the competition's own scoring line, quoted to separate the two: this is not a competition tool and the
            competition's registered leader is untouched.

Runtime: everything stays in this browser (localStorage 'yanabee-halaqa-council-v1'); export/import is a local file.
"""
import json
import re

from core import COMP as C, QURAN as Q, ic, paren, plain, split_kicker, strip_colon, t

ID = 'halaqa-council'


def _numbered(title):
    m = re.match(r'^(\d+)\.\s*(.+)$', strip_colon(title))
    return (m.group(1), m.group(2)) if m else ('', strip_colon(title))


def _src(sid, sub=None, doc=Q, href=None):
    """Source tag: document title — section (— subsection), linking to the place on the site."""
    node = doc[sid]
    kicker, main = split_kicker(node.title)
    parts = [t(doc.meta['title']), t(kicker or main)]
    if sub:
        parts.append(t(_numbered(node[sub].title)[1]))
    href = href or f'#{sub or sid}'
    return f'<a class="hc-src" href="{href}">{ic("file-text")}<span>{" — ".join(parts)}</span></a>'


def _q(label, body, src, cls='hc-q'):
    lab = f'<b>{t(strip_colon(label))}:</b> ' if label else ''
    return f'<blockquote class="{cls}"><p>{lab}{t(body)}</p>{src}</blockquote>'


def data():
    a3 = Q['a3']
    team, buddy, league = a3.items
    size_txt = paren(strip_colon(team.label))
    m = re.search(r'(\d+)\s*-\s*(\d+)', size_txt)
    size = (int(m.group(1)), int(m.group(2)))
    assert size == (6, 10), size
    roles = team.children
    assert len(roles) == 3 and roles[0].label == 'قائد الفريق' and 'يداور هذا الدور شهرياً' in roles[0].body, roles
    lm = re.match(r'^(.*?)\s*\((.+)\)\.?$', league.body)
    comps = lm.group(2).split(' + ')
    assert len(comps) == 4, comps
    fu = Q['a8']['followup']
    follow = fu.paras[0]
    assert 'نقاط الدوري' in follow, follow
    council = next(i for i in Q['a8']['structure'].items if i.label == 'مجلس قادة الفرق')
    periodic = Q['a10']['periodic']
    shield = next(i for i in periodic.items if i.label == 'درع الفريق المثالي')
    second = next(i for i in Q['a7'].items if i.label.startswith('تأهيل صف ثاني من القادة'))
    kpi6 = next(i for i in Q['a11']['kpis'].items if i.text.startswith('KPI 6'))
    assert 'تناوب القيادة' in kpi6.body, kpi6
    score = C['c-score'].paras[0]
    assert score.startswith('اعتماد معايير تقييم المسابقة'), score
    return dict(team=team, roles=roles, league=league, lead=lm.group(1), comps=comps, follow=follow, fu=fu,
                council=council, periodic=periodic, shield=shield, second=second, kpi6=kpi6, score=score, size=size)


def html():
    d = data()
    team, roles, league = d['team'], d['roles'], d['league']
    lead_r, qual_r, tech_r = roles
    chips = '<li class="q-plus" aria-hidden="true">+</li>'.join(f'<li class="q-point">{t(p)}</li>' for p in d['comps'])
    fn = ''.join(f'<li><b>{t(r.label)}:</b> {t(r.body)}</li>' for r in roles)
    comp_th = ''.join(f'<th scope="col">{t(p)}</th>' for p in d['comps'])
    p_n, p_title = _numbered(d['periodic'].title)
    payload = json.dumps({'size': list(d['size'])}, separators=(',', ':'))
    src_a3 = _src('a3')
    return f'''
<div class="hc-box" id="{ID}">
  <header class="hc-head">
    <span class="hc-hic" aria-hidden="true">{ic('users')}</span>
    <div>
      <h3 id="hc-title">أدوات مجلس قادة الفرق</h3>
      <p class="hc-kick">مداورة القيادة والدوري القيمي</p>
    </div>
  </header>
  <div class="hc-top">
    {_q(d['council'].label, d['council'].body, _src('a8', 'structure'))}
    {_q(strip_colon(d['fu'].title), d['follow'], _src('a8', 'followup'))}
  </div>
  <p class="hc-note">{ic('lock')}<span>أداة عمل لفرق الحلقات في هذا المحور، وليست من أدوات المسابقة الأولى ولا تغيّر قائد الفريق المسجّل فيها. ما تكتبه يبقى في هذا المتصفح ولا يُرسل منه شيء.
    في مختبر ينابيع محاكاة تجريبية للفكرة بفرق افتراضية: <a href="lab.html#panel-studio">جرّب المحاكاة</a>.</span></p>
  <p class="hc-store" id="hc-store" role="status" hidden>{ic('alert')}<span>لن تُحفظ البيانات في هذا المتصفح؛ احفظ نسخة في ملف قبل أن تغلق الصفحة.</span></p>

  <div class="hc-tabs" role="tablist" aria-label="أدوات المجلس" data-seg="own" hidden>
    <button type="button" role="tab" id="hc-tab-rot" aria-controls="hc-p-rot" aria-selected="true">{ic('repeat')}<span>جدول المداورة</span></button>
    <button type="button" role="tab" id="hc-tab-league" aria-controls="hc-p-league" aria-selected="false" tabindex="-1">{ic('trophy')}<span>نقاط الدوري القيمي</span></button>
  </div>

  <section class="hc-panel" id="hc-p-rot" role="tabpanel" aria-labelledby="hc-tab-rot">
    <h4 class="hc-ph">جدول المداورة</h4>
    <p class="hc-print-h" aria-hidden="true">أدوات مجلس قادة الفرق — جدول المداورة</p>
    <blockquote class="hc-q"><p><b>{t(team.label)}</b></p><p><b>{t(lead_r.label)}:</b> {t(lead_r.body)}</p>{src_a3}</blockquote>
    <div class="hc-tool" hidden>
      <div class="hc-cols hc-noprint">
        <div class="hc-f">
          <label for="hc-names">أسماء أعضاء الفريق، اسم في كل سطر</label>
          <textarea id="hc-names" rows="7" autocomplete="off" aria-describedby="hc-names-h hc-count"></textarea>
          <small class="hc-hint" id="hc-names-h">الأداة لا تختار القائد؛ رتّب الأسماء بالترتيب الذي تعتمدونه، والاسم الأول يبدأ القيادة.</small>
          <p class="hc-count" id="hc-count" aria-live="polite"></p>
          <p class="hc-warn" id="hc-warn" hidden>{ic('alert')}<span>عدد الأسماء خارج ما ورد في الوثيقة: <span class="hc-ql">{t(team.label)}</span></span></p>
        </div>
        <div class="hc-stack">
          <fieldset class="hc-f">
            <legend>شهر البداية</legend>
            <div class="hc-pair">
              <label class="sr-only" for="hc-start-m">الشهر</label><select id="hc-start-m"></select>
              <label class="sr-only" for="hc-start-y">السنة</label><select id="hc-start-y"></select>
            </div>
          </fieldset>
          <div class="hc-f">
            <label for="hc-months">عدد الأشهر</label>
            <div class="hc-pair">
              <input id="hc-months" type="text" inputmode="numeric" maxlength="2" autocomplete="off" aria-describedby="hc-months-h">
              <button type="button" class="hc-btn" id="hc-full">دورة كاملة</button>
            </div>
            <small class="hc-hint" id="hc-months-h">دورة كاملة: كل عضو يتولى القيادة مرة</small>
          </div>
        </div>
      </div>
      <fieldset class="hc-f hc-fixed hc-noprint">
        <legend>الدوران الآخران</legend>
        <p class="hc-hint">الوثيقة تنص على مداورة دور القائد شهرياً، ولا تذكر مداورة الدورين الآخرين؛ عيّنهما يدوياً.</p>
        <div class="hc-pair2">
          <div class="hc-f"><label for="hc-fix-q">{t(qual_r.label)}</label><select id="hc-fix-q"></select></div>
          <div class="hc-f"><label for="hc-fix-t">{t(tech_r.label)}</label><select id="hc-fix-t"></select></div>
        </div>
        <small class="hc-hint">يُنسخ الاختيار إلى كل الأشهر، ويمكن تغييره لشهر واحد من الجدول.</small>
      </fieldset>
      <p class="hc-period" id="hc-rot-range" aria-live="polite"></p>
      <div class="hc-tw">
        <table class="hc-tbl" id="hc-rot-tbl">
          <caption class="sr-only">جدول المداورة الشهري</caption>
          <thead><tr><th scope="col">الشهر</th>
            <th scope="col" title="{plain(lead_r.body)}">{t(lead_r.label)}<sup aria-hidden="true">1</sup></th>
            <th scope="col" title="{plain(qual_r.body)}">{t(qual_r.label)}<sup aria-hidden="true">2</sup></th>
            <th scope="col" title="{plain(tech_r.body)}">{t(tech_r.label)}<sup aria-hidden="true">3</sup></th></tr></thead>
          <tbody id="hc-rot-body"></tbody>
        </table>
      </div>
      <ol class="hc-fn">{fn}</ol>
      <div class="hc-sofar hc-noprint">
        <h5>من تولّى القيادة حتى الآن</h5>
        <ul id="hc-sofar"></ul>
      </div>
      <div class="hc-actions hc-noprint">
        <button type="button" class="hc-btn" id="hc-print-rot">{ic('printer')}<span>اطبع الجدول</span></button>
      </div>
    </div>
    <div class="hc-more hc-noprint">
      {_q(d['second'].label, d['second'].body, _src('a7', href='#a7'))}
      {_q(d['kpi6'].label, d['kpi6'].body, _src('a11', 'kpis', href='#kpi6'))}
    </div>
  </section>

  <section class="hc-panel" id="hc-p-league" role="tabpanel" aria-labelledby="hc-tab-league">
    <h4 class="hc-ph">نقاط الدوري القيمي</h4>
    <p class="hc-print-h" aria-hidden="true">أدوات مجلس قادة الفرق — نقاط الدوري القيمي</p>
    <blockquote class="hc-q"><p><b>{t(league.label)}:</b> {t(d['lead'])}</p><ul class="q-points hc-points">{chips}</ul>{src_a3}</blockquote>
    <div class="hc-tool" hidden>
      <div class="hc-cols hc-noprint">
        <div class="hc-f">
          <label for="hc-teams">أسماء الفرق، اسم في كل سطر</label>
          <textarea id="hc-teams" rows="5" autocomplete="off" aria-describedby="hc-teams-h"></textarea>
          <small class="hc-hint" id="hc-teams-h">أسماء الفرق فقط، بلا أسماء طلاب.</small>
        </div>
        <div class="hc-stack">
          <div class="hc-f"><label for="hc-week">الأسبوع</label><select id="hc-week"></select></div>
          <div class="hc-f"><label for="hc-week-start">بداية الأسبوع</label><input id="hc-week-start" type="date"></div>
          <div class="hc-pair">
            <button type="button" class="hc-btn" id="hc-week-add">{ic('calendar')}<span>أسبوع جديد</span></button>
            <button type="button" class="hc-btn hc-danger" id="hc-week-del">{ic('trash')}<span>احذف الأسبوع</span></button>
          </div>
        </div>
      </div>
      <div class="hc-noprint">
        <p class="hc-hint hc-scale">{ic('scale')}<span>الوثيقة لا تحدد أوزاناً ولا سلّماً لهذه المكونات؛ أدخلوا النقاط كما اعتُمدت في اجتماعكم.</span></p>
        <p class="hc-hint hc-scale-q">{t(d['follow'])}</p>
        <p class="hc-empty" id="hc-grid-empty"></p>
        <div class="hc-tw" id="hc-grid-w">
          <table class="hc-tbl hc-grid" id="hc-grid">
            <caption class="sr-only">نقاط الأسبوع المحدد</caption>
            <thead><tr><th scope="col">الفريق</th>{comp_th}<th scope="col">المجموع</th></tr></thead>
            <tbody id="hc-grid-body"></tbody>
          </table>
        </div>
      </div>
      <div class="hc-viewbar hc-noprint">
        <span class="hc-vl" id="hc-view-l">عرض المجموع:</span>
        <div class="hc-seg" role="group" aria-labelledby="hc-view-l">
          <button type="button" data-view="week" aria-pressed="true">الأسبوع</button>
          <button type="button" data-view="month" aria-pressed="false">الشهر</button>
          <button type="button" data-view="season" aria-pressed="false">الموسم</button>
        </div>
      </div>
      <p class="hc-period" id="hc-period" aria-live="polite"></p>
      <div class="hc-tw" id="hc-tot-w">
        <table class="hc-tbl hc-tot" id="hc-tot">
          <caption class="sr-only">مجموع النقاط في الفترة</caption>
          <thead><tr><th scope="col">الفريق</th>{comp_th}<th scope="col">المجموع</th><th scope="col"><span class="sr-only">ملاحظة</span></th></tr></thead>
          <tbody id="hc-tot-body"></tbody>
        </table>
      </div>
      <div class="hc-actions hc-noprint">
        <button type="button" class="hc-btn" id="hc-print-league">{ic('printer')}<span>اطبع الفترة</span></button>
      </div>
    </div>
    <div class="hc-refs">
      <div class="hc-ref">
        <p class="hc-ref-k">{ic('award')}<span>مرجع من الوثيقة</span></p>
        <p class="hc-ref-t">{t(p_n + '. ' + p_title) if p_n else t(p_title)}</p>
        {_q(d['shield'].label, d['shield'].body, _src('a10', 'periodic'), 'hc-q hc-q-in')}
      </div>
      <div class="hc-ref hc-sep">
        <p class="hc-ref-k">{ic('flag')}<span>هذا الدوري القيمي للحلقات منفصل عن معايير تقييم المسابقة الأولى:</span></p>
        <blockquote class="hc-q hc-q-in"><p>{t(d['score'])}</p>{_src('c-score', doc=C, href='competition.html#c-score')}</blockquote>
      </div>
    </div>
  </section>

  <div class="hc-foot" hidden>
    <p class="hc-msg" id="hc-msg" aria-live="polite"></p>
    <div class="hc-actions">
      <button type="button" class="hc-btn" id="hc-export">{ic('file-text')}<span>احفظ نسخة في ملف</span></button>
      <button type="button" class="hc-btn" id="hc-import">{ic('arrow-up')}<span>افتح نسخة من ملف</span></button>
      <input type="file" id="hc-file" accept="application/json,.json" class="sr-only" tabindex="-1" aria-hidden="true">
      <button type="button" class="hc-btn hc-danger" id="hc-clear">{ic('trash')}<span>امسح البيانات</span></button>
    </div>
  </div>
  <script type="application/json" id="hc-data">{payload}</script>
</div>'''
