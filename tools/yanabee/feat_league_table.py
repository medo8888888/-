"""league-table — «احسب ترتيب الدوري»: standings for the league committee (lg8 'تسجيل النتائج والترتيب').

Placed by page_competition.league() after the chapters (.folds) and before #c-rules. Every rule the tool applies is
read here from content.COMP, asserted, and shipped as JSON (#lt-data) for js/league-table.js:
  - points from the lg6 table (الفوز 3 / التعادل 1 / الخسارة 0);
  - the tie-break chain from the lg6 line 'عند التساوي: …' (5 steps, in order);
  - the 0 – 3 decisions of lg2 plus the lg4 row 'إشراك لاعب غير مسجل' (results by regulation);
  - the lg2 exclusion row 'تكرار غياب الفريق أو الانسحاب مرتين' (a flag for the committee, never automatic);
  - lines found by their text: the lg1 format line, the lg6 knockout line, the lg8 duty line, the lg10 line.
The tool decides head-to-head only in the unambiguous case and sends every other case to the committee (lg10).
Without JavaScript the block stays hidden (the chapters above hold the same text).
"""
import json
import re

from core import COMP as C, ic, t


def _line(node, start):
    hits = [it.text for it in node.items if it.text.startswith(start)]
    assert len(hits) == 1, (node.id, start, hits)
    return hits[0]


def data():
    L = C['c-league']
    lg1, lg2, lg4, lg6, lg8, lg10 = (L[k] for k in ('lg1', 'lg2', 'lg4', 'lg6', 'lg8', 'lg10'))

    # points (lg6 table)
    pts_tbl = lg6.table
    assert pts_tbl[0] == ['النتيجة', 'النقاط'], pts_tbl[0]
    cells = {r[0]: r[1] for r in pts_tbl[1:]}
    assert cells == {'الفوز': '3 نقاط', 'التعادل': 'نقطة واحدة', 'الخسارة': 'صفر'}, cells
    points = {'win': 3, 'draw': 1, 'loss': 0}
    assert int(re.search(r'\d+', cells['الفوز']).group()) == points['win']

    # tie-break chain (lg6)
    tb = _line(lg6, 'عند التساوي: ')
    steps = tb[len('عند التساوي: '):].rstrip('.').split('، ثم ')
    assert steps == ['فارق الأهداف', 'الأهداف المسجلة', 'المواجهات المباشرة', 'الأقل بطاقات حمراء فصفراء', 'قرعة علنية'], steps

    # results by regulation: lg2 rows with 0 – 3, plus the lg4 row
    assert lg2.table[0] == ['الحالة', 'القرار'] and lg4.table[0] == ['المخالفة', 'العقوبة']
    f2 = [r for r in lg2.table[1:] if '0 – 3' in r[1]]
    assert [r[0] for r in f2] == ['تأخر الفريق لأكثر من 10 دقائق', 'غياب الفريق دون عذر', 'انسحاب الفريق قبل المباراة',
                                  'انسحاب الفريق أثناء المباراة'], f2
    f4 = [r for r in lg4.table[1:] if r[0] == 'إشراك لاعب غير مسجل']
    assert f4 == [['إشراك لاعب غير مسجل', 'خسارة اعتبارية 3 – 0']], f4
    absence = {'غياب الفريق دون عذر', 'انسحاب الفريق قبل المباراة', 'انسحاب الفريق أثناء المباراة'}
    reasons = [{'k': r[0], 'd': r[1], 'h': lg2.table[0], 'count': r[0] in absence,
                'keep': 'تثبيت النتيجة القائمة' in r[1]} for r in f2]
    reasons.append({'k': f4[0][0], 'd': f4[0][1], 'h': lg4.table[0], 'count': False, 'keep': False})
    assert sum(r['keep'] for r in reasons) == 1 and reasons[3]['keep']
    assert 'إذا كانت أكبر لمصلحة الفريق المنافس' in reasons[3]['d']

    excl = [r for r in lg2.table[1:] if r[0] == 'تكرار غياب الفريق أو الانسحاب مرتين']
    assert excl == [['تكرار غياب الفريق أو الانسحاب مرتين', 'استبعاد الفريق بقرار من لجنة المسابقة']], excl
    assert 'مرتين' in excl[0][0]

    fmt = _line(lg1, 'تحدد اللجنة نظام البطولة')
    assert fmt == 'تحدد اللجنة نظام البطولة (مجموعات أو خروج المغلوب) بحسب عدد الفرق.'
    ko = _line(lg6, 'في خروج المغلوب: ')
    assert ko == 'في خروج المغلوب: ثلاث ركلات ترجيح لكل فريق، ثم ركلة مقابل ركلة حتى الحسم.'
    duty = _line(lg8, 'تسجيل النتائج والترتيب')
    assert duty == 'تسجيل النتائج والترتيب وإعداد التقرير الختامي.'
    gen = _line(lg10, 'تفصل اللجنة في الحالات غير المنصوص عليها')
    assert gen == 'تفصل اللجنة في الحالات غير المنصوص عليها مع مراعاة العدالة وسلامة المشاركين.'

    return {'points': points, 'ptable': pts_tbl, 'tb': tb, 'steps': steps, 'reasons': reasons,
            'excl': excl[0], 'exclHead': lg2.table[0], 'fmt': fmt, 'ko': ko, 'duty': duty, 'gen': gen,
            'ch': {'lg2': lg2.title, 'lg4': lg4.title, 'lg6': lg6.title}}


def html():
    D = data()
    js = json.dumps(D, ensure_ascii=False).replace('</', '<\\/')
    ptable = ''.join(f'<tr><th scope="row">{t(a)}</th><td>{t(b)}</td></tr>' for a, b in D['ptable'][1:])
    reasons = ''.join(f'<option value="{i}">{t(r["k"])}</option>' for i, r in enumerate(D['reasons']))
    return f'''
<div class="dp-sub lt" id="league-table" hidden>
  <h3 class="dp-h3 lt-h">{ic('chart')}<span>احسب ترتيب الدوري</span></h3>
  <p class="lt-hint">أداة مساعدة للجنة لترتيب الدوري فقط، ولا تحوّل الترتيب إلى نقاط معايير التقييم. يبقى القرار للجنة.</p>
  <div class="lt-src">
    <p class="lt-q">{t(D['duty'])}</p>
    <p class="lt-q">{t(D['fmt'])}</p>
    <div class="lt-rules">
      <table class="lt-pts"><caption class="sr-only">{t(D['ch']['lg6'])}</caption>
        <thead><tr><th scope="col">{t(D['ptable'][0][0])}</th><th scope="col">{t(D['ptable'][0][1])}</th></tr></thead><tbody>{ptable}</tbody></table>
      <p class="lt-q lt-tb">{t(D['tb'])}</p>
    </div>
    <p class="lt-q lt-ko"><span class="lt-tag">للعلم</span> {t(D['ko'])}</p>
  </div>

  <div class="lt-in">
    <section class="lt-box" aria-labelledby="lt-teams-h">
      <h4 id="lt-teams-h">الفرق</h4>
      <form class="lt-form lt-addteam" novalidate>
        <label class="lt-f"><span>اسم الفريق</span><input id="lt-tname" name="name" type="text" maxlength="60" autocomplete="off" required></label>
        <label class="lt-f lt-f-s"><span>المجموعة (اختياري)</span><input id="lt-tgroup" name="group" type="text" maxlength="30" autocomplete="off"></label>
        <button type="submit" class="btn btn-soft lt-btn">{ic('users')}<span>أضف الفريق</span></button>
      </form>
      <p class="lt-msg" id="lt-team-msg" role="status" aria-live="polite"></p>
      <ul class="lt-teams" id="lt-teams" aria-label="الفرق المسجلة في الأداة"></ul>
    </section>

    <section class="lt-box" aria-labelledby="lt-res-h">
      <h4 id="lt-res-h">سجّل نتيجة</h4>
      <form class="lt-form lt-result" novalidate>
        <fieldset class="lt-side"><legend>الفريق الأول</legend>
          <label class="lt-f"><span>الفريق</span><select id="lt-ra" name="a"></select></label>
          <label class="lt-f lt-n"><span>الأهداف</span><input id="lt-rga" name="ga" type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="lt-num" value="0"></label>
          <label class="lt-f lt-n"><span>بطاقات حمراء</span><input id="lt-rra" name="ra" type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="lt-num" value="0"></label>
          <label class="lt-f lt-n"><span>بطاقات صفراء</span><input id="lt-rya" name="ya" type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="lt-num" value="0"></label>
        </fieldset>
        <fieldset class="lt-side"><legend>الفريق الثاني</legend>
          <label class="lt-f"><span>الفريق</span><select id="lt-rb" name="b"></select></label>
          <label class="lt-f lt-n"><span>الأهداف</span><input id="lt-rgb" name="gb" type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="lt-num" value="0"></label>
          <label class="lt-f lt-n"><span>بطاقات حمراء</span><input id="lt-rrb" name="rb" type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="lt-num" value="0"></label>
          <label class="lt-f lt-n"><span>بطاقات صفراء</span><input id="lt-ryb" name="yb" type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="lt-num" value="0"></label>
        </fieldset>
        <label class="lt-f lt-f-s"><span>التاريخ (اختياري)</span><input id="lt-rdate" name="date" type="date"></label>
        <div class="lt-acts"><button type="submit" class="btn btn-primary lt-btn" id="lt-radd">{ic('check')}<span>أضف النتيجة</span></button>
          <button type="button" class="btn btn-ghost lt-btn" id="lt-rcancel" hidden><span>ألغِ التعديل</span></button></div>
      </form>
      <p class="lt-msg" id="lt-res-msg" role="status" aria-live="polite"></p>
    </section>

    <section class="lt-box" aria-labelledby="lt-ff-h">
      <h4 id="lt-ff-h">نتيجة بقرار اللائحة</h4>
      <form class="lt-form lt-forfeit" novalidate>
        <label class="lt-f"><span>الفريق الأول</span><select id="lt-fa" name="a"></select></label>
        <label class="lt-f"><span>الفريق الثاني</span><select id="lt-fb" name="b"></select></label>
        <label class="lt-f"><span>الفريق المخالف</span><select id="lt-foff" name="off"></select></label>
        <label class="lt-f"><span>السبب</span><select id="lt-freason" name="reason">{reasons}</select></label>
        <p class="lt-dec" id="lt-fdec" aria-live="polite"></p>
        <fieldset class="lt-cur" id="lt-fcur" hidden><legend>النتيجة القائمة (اختياري)</legend>
          <label class="lt-f lt-n"><span id="lt-fcur-off-l">أهداف الفريق المنسحب</span><input id="lt-fcoff" type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="lt-num"></label>
          <label class="lt-f lt-n"><span id="lt-fcur-opp-l">أهداف الفريق المنافس</span><input id="lt-fcopp" type="text" inputmode="numeric" autocomplete="off" maxlength="3" class="lt-num"></label>
          <div class="lt-choice" id="lt-fchoice" hidden role="radiogroup" aria-labelledby="lt-fchoice-h">
            <p id="lt-fchoice-h" class="lt-choice-h">اختر ما تقرره اللجنة:</p>
            <label class="lt-radio"><input type="radio" name="keep" value="0"><span>خسارة 0 – 3</span></label>
            <label class="lt-radio"><input type="radio" name="keep" value="1"><span>تثبيت النتيجة القائمة</span></label>
          </div>
        </fieldset>
        <label class="lt-f lt-f-s"><span>التاريخ (اختياري)</span><input id="lt-fdate" name="date" type="date"></label>
        <div class="lt-acts"><button type="submit" class="btn btn-primary lt-btn" id="lt-fadd">{ic('scale')}<span>أضف النتيجة</span></button>
          <button type="button" class="btn btn-ghost lt-btn" id="lt-fcancel" hidden><span>ألغِ التعديل</span></button></div>
      </form>
      <p class="lt-msg" id="lt-ff-msg" role="status" aria-live="polite"></p>
    </section>

    <section class="lt-box lt-wide" aria-labelledby="lt-list-h">
      <h4 id="lt-list-h">النتائج المسجلة</h4>
      <div class="lt-results" id="lt-results"></div>
    </section>
  </div>

  <div class="lt-print">
    <h4 class="lt-print-h">الترتيب</h4>
    <p class="lt-q lt-tb lt-print-only">{t(D['tb'])}</p>
    <div class="lt-standings" id="lt-standings" aria-live="polite"></div>
    <div class="lt-flags" id="lt-flags"></div>
  </div>

  <div class="lt-tools lt-in">
    <button type="button" class="btn btn-ghost lt-btn" id="lt-print">{ic('printer')}<span>اطبع الجدول</span></button>
    <button type="button" class="btn btn-ghost lt-btn" id="lt-csv">{ic('file-text')}<span>نزّل CSV</span></button>
    <button type="button" class="btn btn-ghost lt-btn" id="lt-save">{ic('arrow-up')}<span>احفظ نسخة في ملف</span></button>
    <label class="btn btn-ghost lt-btn lt-file">{ic('layers')}<span>افتح نسخة من ملف</span><input type="file" id="lt-open" accept="application/json,.json"></label>
    <button type="button" class="btn btn-ghost lt-btn lt-danger" id="lt-clear">{ic('trash')}<span>امسح كل البيانات</span></button>
  </div>
  <p class="lt-msg" id="lt-tools-msg" role="status" aria-live="polite"></p>
  <p class="lt-privacy">{ic('lock')}<span>تبقى البيانات في هذا المتصفح فقط، ولا يُرسل شيء.</span></p>
  <script type="application/json" id="lt-data">{js}</script>
</div>'''
