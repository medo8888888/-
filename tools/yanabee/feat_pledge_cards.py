"""pledge-cards — بطاقات الوعد والميثاق والمتابعة المنزلية (method.html, after m-workshop).

Three printables the methodology asks for but never supplies:
  * the member's one-week pledge   (m-workshop item 3: «ميثاق الوعد والالتزام للعضو …»)
  * the team charter               (m-workshop item 2: «ميثاق الوعد والالتزام للفرق …»)
  * the home follow-up card        (m-meeting row «المهمة السلوكية | تحديد مهمة منزلية وتوزيع بطاقة المتابعة»)

Every content word comes from METHOD through t() (static markup) or as a raw document string inside
<script type="application/json" id="pl-data"> (js/pledge-cards.js renders it with textContent only).
Labels, hints and button names are UI chrome. Nothing here states a fact the document does not state.
Behaviour: site/yanabee/js/pledge-cards.js. Styles + print: site/yanabee/css/pledge-cards.css.
"""
import json

from core import METHOD as M, ic, plain, t

# The four charter steps, verbatim fragments of m-workshop item 2 (asserted below).
CHARTER_STEPS = ['قيمة من القيم', 'طريقة التطبيق', 'من المسؤول', 'متى يتم تنفيذها']
VALUES = ['التعاون', 'الأمانة والصدق', 'الاحترام وبر الوالدين', 'النظافة والمسؤولية']


def data():
    """The raw document strings the tool reuses (checked at build time)."""
    w = M['m-workshop']
    charter, pledge = w.items[2], w.items[3]  # 0-based: item 2 = the team charter, item 3 = the member pledge
    assert charter.text.startswith('ميثاق الوعد والالتزام للفرق'), charter.text
    assert pledge.text.startswith('ميثاق الوعد والالتزام للعضو'), pledge.text
    for s in CHARTER_STEPS:
        assert s in charter.text, s
    saff = [b for k, b in M['m-intro'].blocks if k == 'quote']
    muminun = [b for k, b in M['m-showcase']['m-card'].blocks if k == 'quote']
    assert len(saff) == 1 and len(muminun) == 1
    fields = [(r[0], r[1].split('، ')) for r in M['m-fields'].table[1:]]
    assert len(fields) == 5, fields
    for name, segs in fields:  # segments re-join to the cell exactly (no word lost or reworded)
        assert '، '.join(segs) in [r[1] for r in M['m-fields'].table[1:]], name
    values = M['m-phases'].table[2][3].split('؛')[0].split('، ')  # table[0] is the header; row 2 = المرحلة الثانية
    assert values == VALUES, values
    meet = [r for r in M['m-meeting'].table[1:] if r[1] == 'المهمة السلوكية']
    assert len(meet) == 1 and 'بطاقة المتابعة' in meet[0][2], meet
    parents = [r for r in M['m-roles'].table[1:] if r[0] == 'أولياء الأمور']
    assert len(parents) == 1, parents
    return {
        'pledge': [strip(pledge.label), pledge.body], 'pledgeLine': pledge.text,
        'charter': [strip(charter.label), charter.body], 'charterLine': charter.text,
        'saff': saff[0], 'muminun': muminun[0],
        'fields': [[n, s] for n, s in fields], 'values': values, 'steps': CHARTER_STEPS,
        'meet': [meet[0][1], meet[0][2]], 'parents': [parents[0][0], parents[0][1]],
    }


def strip(s):
    return s[:-1].rstrip() if s.endswith(':') else s


def _src(label, body):
    """A document line shown above a form: label bold, body after it (same words, same order)."""
    return f'<p class="pl-src"><b>{t(label)}:</b> {t(body)}</p>'


def _picker(D, key, mode, field_icons):
    """Field picker. mode 'insert': a field opens its segment chips; a chip inserts its text into the textarea.
    mode 'pick': one field is this week's field; its chips toggle as the chosen task(s)."""
    btns, groups = '', ''
    for i, (name, segs) in enumerate(D['fields']):
        gid = f'pl-{key}-s{i}'
        attr = f'aria-expanded="false" aria-controls="{gid}"' if mode == 'insert' else 'aria-pressed="false"'
        btns += (f'<button type="button" class="pl-fbtn" data-f="{i}" {attr}>'
                 f'<span class="pl-fic" aria-hidden="true">{ic(field_icons[i])}</span><span>{t(name)}</span></button>')
        chips = ''.join(f'<button type="button" class="pl-seg" data-seg="{plain(s)}"'
                        + (' aria-pressed="false"' if mode == 'pick' else '') + f'>{t(s)}</button>' for s in segs)
        groups += f'<div class="pl-segs" id="{gid}" data-f="{i}" role="group" aria-label="{plain(name)}" hidden>{chips}</div>'
    if mode == 'insert':
        lab = 'اختر من مجالات التطبيق'
        hint = 'اختياري: افتح مجالًا ثم اضغط عبارة لتُضاف إلى النص عند المؤشر.'
    else:
        lab = 'المجال'
        hint = 'اختر مجالًا، ثم اضغط عبارة أو أكثر لتكون مهمة هذا الأسبوع.'
    return (f'<div class="pl-pick" data-mode="{mode}" data-key="{key}">'
            f'<p class="f-l" id="pl-{key}-pl">{lab}</p><p class="f-hint">{hint}</p>'
            f'<div class="pl-fbtns" role="group" aria-labelledby="pl-{key}-pl">{btns}</div>{groups}</div>')


def _tab(key, label, icon, on=False):
    return (f'<button type="button" role="tab" class="pl-tab" id="pl-tab-{key}" aria-controls="pl-p-{key}" '
            f'aria-selected="{"true" if on else "false"}" tabindex="{0 if on else -1}" data-tab="{key}">'
            f'{ic(icon)}<span>{label}</span></button>')


def _btn(label, icon, attr, cls='btn-primary'):
    return f'<button type="button" class="btn btn-sm {cls}" {attr}>{ic(icon)}<span>{label}</span></button>'


def html(field_icons):
    D = data()
    seg_vals = ''.join(
        f'<label class="pl-radio"><input type="radio" name="pl-value" value="{plain(v)}"><span>{t(v)}</span></label>'
        for v in D['values'])
    steps = D['steps']
    pledge = f'''
      <div class="pl-grid">
        <div class="pl-form">
          {_src(*D['pledge'])}
          <label class="f"><span class="f-l">وعدي: شيء أقدر أن أنفذه خلال أسبوع</span>
            <textarea id="pl-pledge" rows="3" data-k="pledge"></textarea></label>
          {_picker(D, 'pp', 'insert', field_icons)}
          <div class="pl-acts">
            {_btn('اطبع بطاقتي', 'printer', 'data-pl-print="cards"')}
            {_btn('اطبع بطاقات فارغة للفريق', 'file-text', 'data-pl-print="blank"', 'btn-ghost')}
          </div>
          <p class="f-hint">تُطبع 4 بطاقات على ورقة A4 واحدة، ثم تُقص.</p>
        </div>
        <div class="pl-prev" data-prev="cards" aria-hidden="true"></div>
      </div>'''
    charter = f'''
      <div class="pl-grid">
        <div class="pl-form">
          {_src(*D['charter'])}
          <ol class="pl-steps">
            <li><fieldset class="pl-step"><legend><span class="pl-n" aria-hidden="true">1</span>{t(steps[0])}</legend>
              <div class="pl-radios">{seg_vals}
                <label class="pl-radio"><input type="radio" name="pl-value" value="" data-other><span>قيمة أخرى</span></label></div>
              <label class="f pl-other"><span class="f-l">قيمة أخرى</span><input type="text" id="pl-vother" data-k="valueOther" autocomplete="off"></label>
            </fieldset></li>
            <li><div class="pl-step"><label class="f"><span class="f-l"><span class="pl-n" aria-hidden="true">2</span>{t(steps[1])}</span>
              <textarea id="pl-method" rows="3" data-k="method"></textarea></label>
              {_picker(D, 'cm', 'insert', field_icons)}</div></li>
            <li><div class="pl-step"><label class="f"><span class="f-l"><span class="pl-n" aria-hidden="true">3</span>{t(steps[2])}</span>
              <input type="text" id="pl-who" data-k="who" autocomplete="off"></label></div></li>
            <li><div class="pl-step"><label class="f"><span class="f-l"><span class="pl-n" aria-hidden="true">4</span>{t(steps[3])}</span>
              <input type="date" id="pl-when" data-k="when"></label></div></li>
          </ol>
          <div class="pl-acts">{_btn('اطبع الميثاق', 'printer', 'data-pl-print="charter"')}</div>
        </div>
        <div class="pl-prev" data-prev="charter" aria-hidden="true"></div>
      </div>'''
    home = f'''
      <div class="pl-grid">
        <div class="pl-form">
          {_src(*D['meet'])}
          {_picker(D, 'hm', 'pick', field_icons)}
          <label class="f"><span class="f-l">المهمة كما حددها المشرف</span>
            <input type="text" id="pl-htask" data-k="hTask" autocomplete="off"><span class="f-hint">اختياري.</span></label>
          <p class="pl-sum" id="pl-hsum" aria-live="polite"></p>
          <div class="pl-acts">{_btn('اطبع بطاقة المتابعة', 'printer', 'data-pl-print="home"')}</div>
          <p class="f-hint">تُطبع بطاقتان على ورقة A4 واحدة.</p>
        </div>
        <div class="pl-prev" data-prev="home" aria-hidden="true"></div>
      </div>'''
    blob = json.dumps(D, ensure_ascii=False).replace('</', '<\\/')
    return f'''
<div class="sec pl-sec" id="pledge" role="region" aria-labelledby="pl-h">
  <div class="wrap">
    <header class="sec-head rv"><div><span class="kicker">{ic('hand-heart')}ملحق المنهجية · أداة</span>
      <h2 id="pl-h">بطاقات الوعد والميثاق والمتابعة</h2>
      <p class="sec-sub pl-safe">{ic('lock')}<span>كل ما تكتبه يبقى في هذا المتصفح، ولا يُرسل إلى أي جهة.</span></p></div></header>
    <div class="pl-nojs" data-pl-nojs>
      {_src(*D['pledge'])}
      {_src(*D['charter'])}
      <p class="f-hint">تعمل البطاقات القابلة للطباعة عند تفعيل JavaScript في المتصفح.</p>
    </div>
    <div class="pl-tool" id="pl-tool" hidden>
      <fieldset class="pl-who">
        <legend class="sr-only">الاسم والفريق</legend>
        <label class="f"><span class="f-l">الاسم (اختياري)</span><input type="text" id="pl-name" data-k="name" autocomplete="off"></label>
        <label class="f"><span class="f-l">الفريق</span><input type="text" id="pl-team" data-k="team" autocomplete="off"></label>
        <label class="chk pl-keep"><input type="checkbox" id="pl-keep" data-k="keepName"><span>احفظ الاسم على هذا الجهاز</span></label>
      </fieldset>
      <div class="pl-tabs" role="tablist" aria-label="البطاقات">
        {_tab('cards', 'وعدي الأسبوعي', 'hand-heart', True)}{_tab('charter', 'ميثاق الفريق', 'handshake')}{_tab('home', 'بطاقة المتابعة المنزلية', 'home')}
      </div>
      <div class="pl-panel" role="tabpanel" id="pl-p-cards" aria-labelledby="pl-tab-cards" tabindex="0">{pledge}</div>
      <div class="pl-panel" role="tabpanel" id="pl-p-charter" aria-labelledby="pl-tab-charter" tabindex="0" hidden>{charter}</div>
      <div class="pl-panel" role="tabpanel" id="pl-p-home" aria-labelledby="pl-tab-home" tabindex="0" hidden>{home}</div>
      <div class="pl-foot">
        <div class="pl-msgs"><p class="pl-status" id="pl-status" role="status" aria-live="polite"></p><p class="pl-saved" id="pl-saved"></p></div>
        {_btn('امسح', 'trash', 'data-pl-clear', 'btn-ghost')}
      </div>
    </div>
    <div class="print-area pl-print" id="pl-print" aria-hidden="true"></div>
    <script type="application/json" id="pl-data">{blob}</script>
  </div>
</div>'''
