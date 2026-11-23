"""Feature «team-builder» on register.html: before registering, turn a list of students into teams of 5–7.

A school or association pastes its students' names; the tool proposes valid teams (sizes from c-terms), lets the
organiser move members between teams and a waiting list, pick each team's leader, the two reciters, the chess
nominee and the optional coordinator (labels from c-form), checks each team against the documents' rules (each
failing check shows its source line verbatim) and pushes a finished team into register.js's draft
('yanabee-reg-draft'), so nobody types it twice. Behaviour: site/yanabee/js/team-builder.js; styles:
site/yanabee/css/team-builder.css (both loaded by page_register.build() through features.assets()).

Every content line comes from content/yanabee/competition.txt: in the markup through t(), and for the JS through the
<script type="application/json" id="team-builder-data"> block (raw node text, json.dumps(ensure_ascii=False),
'</' escaped). Everything else here is short UI chrome that states no fact the documents do not state.
"""
import json
import re

from core import COMP as C, ic, plain, t

ID = 'team-builder'


def _data():
    terms = {r[0]: r[1] for r in C['c-terms'].table[1:]}
    size = terms['عدد الفريق']
    nums = [int(x) for x in re.findall(r'\d+', size)]
    lo, hi = nums[0], nums[1]
    assert (lo, hi) == (5, 7), size
    members = C['c-form']['f-members']
    assert '5' in members.paras[0] and '7' in members.paras[0], members.paras[0]

    reg = C['c-plan']['c-timeline'].items[1]
    assert reg.label == '1 – 14 نوفمبر', reg.label
    how = C['c-ad']['c-ad-how']
    assert how.items[0].text.startswith('اجمع فريقك (5 إلى 7 أعضاء)'), how.items[0].text
    assert how.items[1].text.startswith('سارع بالتسجيل'), how.items[1].text
    partner = C['c-partner']['c-p-partner']
    assert 'الصف السابع' in partner.items[0].text, partner.items[0].text
    rules = C['c-rules']
    assert 'الصف السابع إلى الصف الثاني عشر' in rules.items[2].text, rules.items[2].text
    lg1, lg10 = C['c-league']['lg1'], C['c-league']['lg10']
    assert lg1.items[3].text.startswith('لا يجوز للاعب المشاركة مع أكثر من فريق'), lg1.items[3].text
    assert lg10.items[3].text.startswith('يُعد تسجيل الفريق'), lg10.items[3].text
    form = C['c-form']
    team = form['f-team']
    assert [it.text for it in team.items[:2]] == ['اسم الفريق', 'اسم قائد الفريق'], team.items[:2]
    nom = form['f-nom']
    assert 'الشطرنج' in nom.items[2].text and 'الأول' in nom.items[0].text and 'الثاني' in nom.items[1].text
    coord = form['f-apply'].items[1].text
    assert coord == 'مسؤول التنسيق والتوثيق بالفريق', coord
    fee = form['f-fee']
    assert '10 $' in fee.paras[0], fee.paras[0]
    name_hint = members.table[0][1]
    assert name_hint == 'الاسم الثلاثي', name_hint

    def src(node, text):  # a source line with the title of the (sub)section it belongs to
        return {'t': text, 'from': node.title}

    return {
        'min': lo, 'max': hi,
        'start': '2026-11-01', 'end': '2026-11-14',  # c-terms «بداية التسجيل | 1 نوفمبر 2026» + c-timeline «1 – 14 نوفمبر»
        'reg': reg.text,
        'how0': src(how, how.items[0].text),
        'how1': src(how, how.items[1].text),
        'partner0': src(partner, partner.items[0].text),
        'ruleGrade': src(rules, rules.items[2].text),
        'oneTeam': src(lg1, lg1.items[3].text),
        'law': src(lg10, lg10.items[3].text),
        'fee': src(fee, fee.paras[0]),
        'lblTeam': team.items[0].text,
        'lblLeader': team.items[1].text,
        'nom': [nom.items[i].text for i in range(3)],
        'coord': coord,
        'nameHint': name_hint,
    }


DATA = _data()


def _json():
    return json.dumps(DATA, ensure_ascii=False).replace('</', '<\\/')


def html():
    d = DATA
    how1 = d['how1']['t']
    return f'''
<section class="sec dp-sec alt tb" id="{ID}" aria-labelledby="tb-title">
  <div class="wrap">
    <header class="sec-head rv"><div><span class="kicker">{ic('users')}{t('المسابقة الأولى · سورة الصف')}</span>
      <h2 id="tb-title">قبل التسجيل: كوّن فرقك ووزّع الأدوار</h2>
      <p class="sec-sub">للمدرسة أو الجمعية التي لديها أكثر من فريق، أو لقائد يريد التأكد من جاهزية فريقه قبل ملء الاستمارة.</p></div></header>
    <div class="tb-when">
      <p class="tb-chip" data-tb-chip hidden>{ic('calendar')}<span data-tb-chip-t></span></p>
      <p class="tb-src">{ic('quote')}<span>{t(d['reg'])}</span></p>
      <p class="tb-src">{ic('alert')}<span>{t(how1)}</span></p>
    </div>
    <p class="tb-nojs">تعمل أداة تكوين الفرق داخل المتصفح بعد تفعيل JavaScript، ويمكن ملء الاستمارة أدناه مباشرة.</p>
    <div class="tb-tool" data-tb-tool hidden>
      <p class="privacy">{ic('lock')}<span>الأسماء تبقى في هذا المتصفح فقط ولا تُرسل إلى أي جهة.</span></p>
      <div class="tb-input">
        <label class="tb-lab" for="tb-names">اكتب أسماء الطلاب، اسمًا في كل سطر</label>
        <textarea id="tb-names" rows="8" aria-describedby="tb-names-hint tb-names-info" autocomplete="off" spellcheck="false"></textarea>
        <small class="f-hint" id="tb-names-hint">{t(d['nameHint'])} يمنع الالتباس بين الأسماء المتشابهة.</small>
        <p class="tb-info" id="tb-names-info" data-tb-info aria-live="polite"></p>
        <ul class="tb-dups" data-tb-dups hidden></ul>
        <div class="tb-acts">
          <button type="button" class="btn btn-primary btn-sm" data-tb-split>{ic('users')}<span>اقترح التقسيم</span></button>
          <button type="button" class="btn btn-ghost btn-sm" data-tb-shuffle>{ic('repeat')}<span>اخلط الأسماء</span></button>
          <button type="button" class="btn btn-ghost btn-sm" data-tb-clear>{ic('trash')}<span>امسح القائمة</span></button>
        </div>
      </div>
      <div class="tb-note" data-tb-note role="status" hidden></div>
      <div class="tb-bar" data-tb-bar hidden>
        <p class="tb-sum" data-tb-sum aria-live="polite"></p>
        <button type="button" class="btn btn-ghost btn-sm" data-tb-print>{ic('printer')}<span>اطبع قوائم الفرق</span></button>
      </div>
      <p class="sr-only" data-tb-say aria-live="polite"></p>
      <p class="tb-saved" data-tb-saved aria-live="polite"></p>
    </div>
    <div class="tb-cards" data-tb-cards></div>
    <div class="tb-wait" data-tb-wait hidden></div>
    <script type="application/json" id="{ID}-data">{_json()}</script>
  </div>
</section>'''


if __name__ == '__main__':
    print(json.dumps(DATA, ensure_ascii=False, indent=1))
    print(plain(DATA['reg']))
