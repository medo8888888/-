"""match-day — «أدوات يوم المباراة»: a referee's kit for one football match (competition.html, end of #c-league).

Four tabs: a match clock (arrival, fixed end, halves, lateness rows of lg2), offences and cards with per-chip
sanction timers (lg4), the knockout shootout (lg6), and a printable match sheet. Every rule shown is a verbatim
document line shipped in #md-data; every number the clock uses is read here from a quoted line and asserted:
  lg1 '… 30 دقيقة … كل شوط 15 دقيقة، وبينهما استراحة خمس دقائق' -> 30 / 15 / 5
  lg2 'تأخر الفريق حتى 10 دقائق' -> 10;  lg2 '… بخمس عشرة دقيقة …' -> 15
  lg4 'طرد دقيقتين' -> 2;  lg4 '… وبعد 3 دقائق …' -> 3;  lg6 'ثلاث ركلات ترجيح' -> 3;  lg7 '… 24 ساعة …' -> 24
  c-terms 'عدد الفريق | 5 إلى 7 أعضاء شاملًا قائد الفريق' -> at most 7 rows per team on the sheet (no reserve count:
  lg1 says only 'ولاعبين احتياطيين').
The tool never treats an 'إنذار' or a 'طرد' as a card (the documents never say so): card counters count only the cards
the referee records. It never changes a score by itself. Without JavaScript the kit stays hidden.
"""
import json
import re

from core import COMP as C, ic, t


def _row(table, first):
    rows = [r for r in table[1:] if r[0] == first]
    assert len(rows) == 1, (first, rows)
    return rows[0]


def data():
    L = C['c-league']
    lg1, lg2, lg3, lg4, lg5, lg6, lg7, lg9 = (L[k] for k in ('lg1', 'lg2', 'lg3', 'lg4', 'lg5', 'lg6', 'lg7', 'lg9'))

    dur = lg1.items[4].text
    assert dur == 'مدة المباراة 30 دقيقة على شوطين، كل شوط 15 دقيقة، وبينهما استراحة خمس دقائق.', dur
    total = int(re.search(r'(\d+) دقيقة على شوطين', dur).group(1))
    half = int(re.search(r'كل شوط (\d+) دقيقة', dur).group(1))
    assert 'استراحة خمس دقائق' in dur
    brk = 5
    assert total == 2 * half == 30

    assert lg2.table[0] == ['الحالة', 'القرار']
    late_ok = _row(lg2.table, 'تأخر الفريق حتى 10 دقائق')
    late_bad = _row(lg2.table, 'تأخر الفريق لأكثر من 10 دقائق')
    grace = int(re.search(r'حتى (\d+) دقائق', late_ok[0]).group(1))
    assert grace == 10 and 'ولا يتغير موعد انتهاء المباراة' in late_ok[1]
    assert 'بعشرين دقيقة' in lg2.paras[0]   # revised Nov 2026 (was 15)
    arrive = 20

    assert lg4.table[0] == ['المخالفة', 'العقوبة']
    verbal = _row(lg4.table, 'الإساءة اللفظية أو السخرية')
    assert verbal[1] == 'طرد 5 دقائق'   # revised Nov 2026 (was 2 minutes)
    two_min = int(re.search(r'طرد (\d+) دقائق', verbal[1]).group(1))
    assert two_min == 5
    two_y = _row(lg4.table, 'بطاقتان صفراوان في مباراة')
    after = int(re.search(r'بعد (\d+) دقائق', two_y[1]).group(1))
    assert after == 3
    red = _row(lg4.table, 'بطاقة حمراء مباشرة')
    violent = _row(lg4.table, 'اللعب العنيف أو المتهور')
    assert violent[1] == 'إنذار أو طرد بحسب الخطورة'
    assault = _row(lg4.table, 'اعتداء بدني متعمد')
    assert assault[1] == 'طرد فوري وإحالة للجنة الانضباط'

    pens_line = lg6.items[1].text
    assert pens_line.startswith('في خروج المغلوب: ') and 'ثلاث ركلات ترجيح' in pens_line
    pens = 3
    appeal_line = lg7.items[0].text
    appeal = int(re.search(r'(\d+) ساعة', appeal_line).group(1))
    assert appeal == 24
    fmt_line = lg1.items[1].text
    assert 'مجموعات أو خروج المغلوب' in fmt_line
    assert lg6.table[0] == ['النتيجة', 'النقاط']
    draw = _row(lg6.table, 'التعادل')
    terms = _row(C['c-terms'].table, 'عدد الفريق')
    assert terms[1] == '5 إلى 7 أعضاء شاملًا قائد الفريق', terms
    max_team = int(re.search(r'إلى (\d+) أعضاء', terms[1]).group(1))
    assert max_team == 7
    assert lg3.items[1].text == 'قرارات الحكم في وقائع اللعب نهائية، ويُمنع الاعتراض غير اللائق.'
    assert lg3.items[4].text.startswith('للحكم إيقاف المباراة')
    assert lg5.items[1].text.startswith('يوقف الحكم اللعب')
    assert lg6.items[0].text.startswith('عند التساوي: ')
    assert lg1.items[2].text.startswith('يتكون فريق المباراة')

    # player offences (part a) — the lg4 rows that concern one player; team rows go to «وقائع الفريق»
    player_rows = [r for r in lg4.table[1:] if r[0] in ('الاعتراض غير اللائق', 'تعمد إضاعة الوقت', 'اللعب العنيف أو المتهور',
                                                        'الإساءة اللفظية أو السخرية', 'اعتداء بدني متعمد')]
    assert len(player_rows) == 5
    team_rows = [_row(lg4.table, 'تدخل الجمهور أو المشرفين'), _row(lg4.table, 'إشراك لاعب غير مسجل'),
                 _row(lg2.table, 'غياب الفريق دون عذر'), _row(lg2.table, 'انسحاب الفريق قبل المباراة'),
                 _row(lg2.table, 'انسحاب الفريق أثناء المباراة')]
    team_heads = [lg4.table[0], lg4.table[0], lg2.table[0], lg2.table[0], lg2.table[0]]

    return {
        'n': {'total': total, 'half': half, 'brk': brk, 'grace': grace, 'arrive': arrive, 'two': two_min, 'after': after,
              'pens': pens, 'appeal': appeal, 'max': max_team},
        'lg2': lg2.table, 'lg4': lg4.table,
        'late': [late_ok, late_bad], 'two_y': two_y, 'red': red, 'violent': violent, 'verbal': verbal, 'assault': assault,
        'player': player_rows, 'team': [{'h': h, 'r': r} for h, r in zip(team_heads, team_rows)], 'draw': draw,
        'heads': {'lg2': lg2.table[0], 'lg4': lg4.table[0], 'lg6': lg6.table[0]},
        'terms': [C['c-terms'].table[0], terms],
        'line': {
            'fmt': fmt_line, 'squad': lg1.items[2].text, 'elig': lg1.items[3].text, 'dur': dur, 'arrive': lg2.paras[0],
            'final': lg3.items[1].text, 'stop': lg3.items[4].text, 'safety': lg5.items[0].text, 'injury': lg5.items[1].text,
            'head': lg5.items[2].text, 'incomplete': lg5.items[3].text, 'tb': lg6.items[0].text, 'pens': pens_line,
            'appeal': appeal_line, 'greet': lg9.items[2].text,
        },
    }


def _tab(i, key, label, icon):
    sel = ' aria-selected="true"' if i == 0 else ' aria-selected="false" tabindex="-1"'
    return (f'<button type="button" role="tab" id="md-tab-{key}" aria-controls="md-p-{key}"{sel}>'
            f'{ic(icon)}<span>{label}</span></button>')


def html():
    D = data()
    L = D['line']
    js = json.dumps(D, ensure_ascii=False).replace('</', '<\\/')
    tabs = ''.join(_tab(i, k, lab, icn) for i, (k, lab, icn) in enumerate(
        [('clock', 'ساعة المباراة', 'clock'), ('cards', 'المخالفات والبطاقات', 'flag'),
         ('pens', 'ركلات الترجيح', 'target'), ('sheet', 'ورقة المباراة', 'file-text')]))
    return f'''
<div class="dp-sub md-kit" id="match-day" hidden>
  <h3 class="dp-h3 md-h">{ic('clock')}<span>أدوات يوم المباراة</span></h3>
  <p class="md-note">أداة مساعدة للحكم في الملعب، ولا تحل محل قراره أو قرار لجنة تنظيم الدوري.</p>
  <p class="md-q md-final">{t(L['final'])}</p>
  <div class="md-chips" id="md-chips" hidden></div>
  <div class="md-tabs" data-tabs>
    <div class="md-tablist" role="tablist" aria-label="أدوات يوم المباراة">{tabs}</div>
    <div class="md-panels">

    <div class="md-panel" role="tabpanel" id="md-p-clock" aria-labelledby="md-tab-clock">
      <div class="md-setup">
        <label class="md-f"><span>موعد المباراة</span><input type="time" id="md-kick"></label>
        <fieldset class="md-seg"><legend>نظام البطولة</legend>
          <label><input type="radio" name="md-format" value="groups" checked><span>مجموعات</span></label>
          <label><input type="radio" name="md-format" value="ko"><span>خروج المغلوب</span></label>
        </fieldset>
      </div>
      <p class="md-q md-src">{t(L['fmt'])}</p>
      <div class="md-times" aria-live="polite">
        <div class="md-time"><small>الحضور قبل</small><b id="md-arrive">--:--</b><p class="md-q">{t(L['arrive'])}</p></div>
        <div class="md-time"><small>موعد الانتهاء</small><b id="md-end">--:--</b><span class="md-sum" dir="ltr">{D['n']['half']} + {D['n']['brk']} + {D['n']['half']}</span><p class="md-q">{t(L['dur'])}</p></div>
      </div>
      <div class="md-clock" id="md-clock">
        <div class="md-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="md-ring-bg" cx="60" cy="60" r="54"/><circle class="md-ring-fg" id="md-ring" cx="60" cy="60" r="54" pathLength="100"/></svg></div>
        <div class="md-face">
          <small id="md-phase">لم يبدأ اللعب</small>
          <b id="md-digits" class="md-digits" role="timer" aria-live="off">{D['n']['half']:02d}:00</b>
          <span id="md-sub" class="md-subt"></span>
        </div>
      </div>
      <p class="md-status" id="md-status" role="status" aria-live="polite"></p>
      <div class="md-late" id="md-late" hidden aria-live="polite"></div>
      <div class="md-ctrl">
        <button type="button" class="md-big md-go" id="md-start">{ic('flag')}<span>بدأ اللعب الآن</span></button>
        <button type="button" class="md-big md-go" id="md-next" hidden>{ic('arrow-left')}<span>نهاية الشوط الأول</span></button>
        <button type="button" class="md-big md-pause" id="md-pause" hidden aria-pressed="false">{ic('clock')}<span>أوقف مؤقتًا</span></button>
      </div>
      <div class="md-why">
        <p class="md-q">{t(L['stop'])}</p>
        <p class="md-q">{t(L['injury'])}</p>
      </div>
      <div class="md-opts">
        <label class="md-check"><input type="checkbox" id="md-tone"><span>نغمة خفيفة عند انتهاء الوقت</span></label>
        <button type="button" class="md-small" id="md-reset-clock">{ic('repeat')}<span>أعد ضبط الساعة</span></button>
      </div>
    </div>

    <div class="md-panel" role="tabpanel" id="md-p-cards" aria-labelledby="md-tab-cards" hidden>
      <div class="md-teams" id="md-teams"></div>
      <dialog class="md-sheet-ui" id="md-player" aria-labelledby="md-player-h"></dialog>
      <p class="md-q md-tb">{t(L['tb'])}</p>
      <section class="md-box" aria-labelledby="md-log-h">
        <h4 id="md-log-h">سجل المباراة</h4>
        <ol class="md-log" id="md-log"></ol>
      </section>
      <section class="md-box" aria-labelledby="md-saved-h">
        <h4 id="md-saved-h">نتائج محفوظة على هذا الجهاز</h4>
        <div class="md-row">
          <button type="button" class="md-small md-primary" id="md-save-res">{ic('check')}<span>احفظ نتيجة المباراة</span></button>
          <button type="button" class="md-small md-danger" id="md-clear">{ic('trash')}<span>امسح بيانات هذه المباراة</span></button>
        </div>
        <p class="md-status" id="md-save-msg" role="status" aria-live="polite"></p>
        <ol class="md-saved" id="md-saved"></ol>
      </section>
      <p class="md-privacy">{ic('lock')}<span>يكفي رقم القميص. كل ما تكتبه يبقى في هذا المتصفح، ولا يُرسل شيء.</span></p>
    </div>

    <div class="md-panel" role="tabpanel" id="md-p-pens" aria-labelledby="md-tab-pens" hidden>
      <div id="md-pens"></div>
    </div>

    <div class="md-panel" role="tabpanel" id="md-p-sheet" aria-labelledby="md-tab-sheet" hidden>
      <div class="md-form" id="md-sheet-form">
        <label class="md-f"><span>التاريخ</span><input type="date" id="md-s-date"></label>
        <label class="md-f"><span>الوقت</span><input type="time" id="md-s-time"></label>
        <label class="md-f"><span>نهاية المباراة</span><input type="time" id="md-s-end"></label>
        <label class="md-f"><span>الحكم</span><input type="text" id="md-s-ref" maxlength="60" autocomplete="off"></label>
        <label class="md-f md-f-w"><span>الشخص البالغ المكلف بالسلامة</span><input type="text" id="md-s-safe" maxlength="60" autocomplete="off"></label>
      </div>
      <div class="md-row">
        <button type="button" class="md-small md-primary" id="md-print">{ic('printer')}<span>اطبع ورقة المباراة</span></button>
        <button type="button" class="md-small" id="md-print-blank">{ic('printer')}<span>اطبع ورقة فارغة</span></button>
      </div>
      <article class="md-doc" id="md-doc" aria-label="ورقة المباراة"></article>
    </div>
    </div>
  </div>
  <script type="application/json" id="md-data">{js}</script>
</div>'''
