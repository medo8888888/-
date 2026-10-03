// Takamul deck — Arabic (RTL), all text verbatim from content/brochure.txt.
// Animations/transitions are added afterwards by animate.py (pptxgenjs has no animation API).
const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/fbd64ec7-4ac1-4c83-813f-2c5447ddc061_9c922fcd-c07e-4975-9281-753529705510/pptx/scripts/apply_theme.js');

const IMG = '/home/user/-/site/assets/img/';
const LOGO = '/home/user/-/site/assets/logo.png';
const OUT = process.argv[2] || 'takamul.pptx';

const THEME = {
  name: 'Takamul',
  headFontFace: 'Arial',
  bodyFontFace: 'Arial',
  colors: {
    dk1: '14202B', lt1: 'FFFFFF', dk2: '0E1A24', lt2: 'F3F6F5',
    accent1: '127A66', accent2: 'B8862B', accent3: '4FD1B5', accent4: 'E0B04C',
    accent5: '3E4C59', accent6: 'C9D6DF', hlink: '127A66', folHlink: '8A6216',
  },
};
const DARK_CARD = '17293A';
const DARK_LINE = '25425C';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
pres.rtlMode = true;
pres.title = 'جمعية تكامل لبناء القيم والتنمية';
pres.author = 'جمعية تكامل لبناء القيم والتنمية';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333, M = 0.6, CW = W - 2 * M;
const AR = { rtlMode: true, lang: 'ar-SA' };

const footer = (dark) => [
  { text: { text: 'جمعية تكامل لبناء القيم والتنمية', options: { x: W - M - 6, y: 6.95, w: 6, h: 0.3, fontSize: 10, color: dark ? C.accent6 : C.accent5, align: 'right', ...AR } } },
];
function layout(name, dark) {
  pres.defineSlideMaster({
    title: name,
    background: { color: dark ? C.text2 : C.background2 },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      ...footer(dark),
      { placeholder: { options: { name: 'eyebrow', type: 'body', x: M, y: 0.4, w: CW, h: 0.4, fontSize: 14, bold: true, color: dark ? C.accent3 : C.accent1, align: 'right', valign: 'middle', margin: 0, ...AR }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.8, w: CW, h: 0.85, fontSize: 34, bold: true, color: dark ? C.background1 : C.text1, align: 'right', valign: 'middle', margin: 0, ...AR }, text: '' } },
    ],
    slideNumber: { x: M, y: 6.95, w: 0.6, h: 0.3, fontSize: 10, color: dark ? C.accent6 : C.accent5, align: 'left' },
  });
}
layout('CONTENT_LIGHT', false);
layout('CONTENT_DARK', true);
pres.defineSlideMaster({ title: 'COVER', background: { color: C.text2 }, objects: [] });

let sec = '';
const section = t => { pres.addSection({ title: t }); sec = t; };
function content(dark, eyebrow, title) {
  const s = pres.addSlide({ masterName: dark ? 'CONTENT_DARK' : 'CONTENT_LIGHT', sectionTitle: sec });
  s.addText(eyebrow, { placeholder: 'eyebrow', ...AR });
  s.addText(title, { placeholder: 'title', ...AR });
  return s;
}
const shadow = () => ({ type: 'outer', color: '0E1A24', opacity: 0.12, blur: 8, offset: 2, angle: 90 });

// one shape = whole card (so each card animates as a single object)
function card(s, x, y, w, h, parts, o = {}) {
  const dark = !!o.dark;
  const runs = [];
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    runs.push({ text: p.t, options: { fontSize: p.size, bold: !!p.bold, color: p.color || (dark ? C.accent6 : C.accent5), breakLine: !last, paraSpaceAfter: p.after || 6, ...AR, align: 'right' } });
  });
  s.addText(runs, {
    x, y, w, h, shape: pres.ShapeType.roundRect, rectRadius: 0.12,
    fill: { color: dark ? DARK_CARD : C.background1 }, line: { color: dark ? DARK_LINE : 'E1E6E4', width: 0.75 },
    shadow: dark ? undefined : shadow(), margin: o.margin || [14, 16, 14, 16], valign: o.valign || 'top', align: 'right',
    isTextBox: true, objectName: o.name || 'card', ...AR,
  });
}
const H = (t, size, color) => ({ t, size, bold: true, color });

/* 1 cover --------------------------------------------------------------------------- */
section('الافتتاح والترحيب');
{
  const s = pres.addSlide({ masterName: 'COVER', sectionTitle: sec });
  s.addImage({ path: IMG + 'istanbul.jpg', x: 0, y: 0, w: W, h: 7.5, sizing: { type: 'cover', w: W, h: 7.5 }, transparency: 45, objectName: 'bg photo' });
  s.addShape(pres.ShapeType.rect, { x: 4.2, y: 0, w: W - 4.2, h: 7.5, fill: { color: C.text2, transparency: 12 }, line: { type: 'none' }, objectName: 'bg scrim' });
  s.addImage({ path: LOGO, x: W - M - 1.5, y: 0.9, w: 1.5, h: 1.46, objectName: 'logo' });
  s.addText('الكتيب التعريفي الشامل للأعضاء الجدد', { x: 4.6, y: 2.65, w: W - M - 4.6, h: 0.5, fontSize: 18, bold: true, color: C.accent3, align: 'right', margin: 0, isTextBox: true, ...AR });
  s.addText('جمعية تكامل لبناء القيم والتنمية', { x: 4.6, y: 3.15, w: W - M - 4.6, h: 1.9, fontSize: 50, bold: true, color: C.background1, align: 'right', valign: 'top', margin: 0, isTextBox: true, ...AR });
  s.addText('رؤية 2035 · مؤسسة رائدة عالمياً في بناء القيم', { x: 4.6, y: 5.15, w: W - M - 4.6, h: 0.5, fontSize: 22, bold: true, color: C.accent4, align: 'right', margin: 0, isTextBox: true, ...AR });
  s.addText('الجمهورية التركية – إسطنبول', { x: 4.6, y: 5.7, w: W - M - 4.6, h: 0.45, fontSize: 16, color: C.accent6, align: 'right', margin: 0, isTextBox: true, ...AR });
  s.addNotes('جمعية تكامل لبناء القيم والتنمية — الكتيب التعريفي الشامل للأعضاء الجدد. رؤية 2035.');
}

/* 2 welcome -------------------------------------------------------------------------- */
{
  const s = pres.addSlide({ masterName: 'CONTENT_LIGHT', sectionTitle: sec });
  s.addImage({ path: IMG + 'hands.jpg', x: 0, y: 0, w: 5.2, h: 7.5, sizing: { type: 'cover', w: 5.2, h: 7.5 }, objectName: 'photo' });
  s.addText('الكتيب التعريفي الشامل للأعضاء الجدد', { placeholder: 'eyebrow', ...AR });
  s.addText('أهلاً بك في أسرة «تكامل»', { x: 5.8, y: 1.9, w: W - M - 5.8, h: 1.0, fontSize: 40, bold: true, color: C.text1, align: 'right', margin: 0, isTextBox: true, ...AR });
  s.addText('يسعدنا انضمامك إلينا عضواً فاعلاً ومساهماً في مسيرة التنمية والبناء. إن حضورك يمثّل إضافة نوعية لجهودنا في ترسيخ القيم الأخلاقية، ودعم التمكين الاقتصادي والمجتمعي، وتحقيق الاستدامة التنموية.',
    { x: 5.8, y: 3.05, w: W - M - 5.8, h: 2.4, fontSize: 20, color: C.accent5, align: 'right', valign: 'top', margin: 0, lineSpacingMultiple: 1.25, isTextBox: true, ...AR });
  s.addText('صورة تعبيرية', { x: 0.2, y: 7.05, w: 2, h: 0.3, fontSize: 10, color: C.background1, align: 'left', isTextBox: true, ...AR });
}

/* 3 about ---------------------------------------------------------------------------- */
section('الهوية والرؤية والأهداف');
{
  const s = content(false, '1 · من نحن، وأين نعمل', 'الهوية والمقر والأحكام العامة');
  s.addText('جمعية تكامل لبناء القيم والتنمية مؤسسة أهلية مستقلة غير ربحية، مسجّلة وفق أحكام القانون، تسعى إلى بناء الإنسان وتعزيز منظومة القيم الأخلاقية والاجتماعية ودعم التنمية المستدامة عبر مشاريع نوعية ومبتكرة.',
    { x: M, y: 1.85, w: CW, h: 1.1, fontSize: 17, color: C.accent5, align: 'right', margin: 0, isTextBox: true, ...AR });
  const items = [['الاسم الرسمي', 'جمعية تكامل لبناء القيم والتنمية – مؤسسة أهلية مسجلة ذات نطاق عمل مجتمعي وتنموي شامل'],
    ['المقر الرئيسي', 'مدينة إسطنبول، الجمهورية التركية'],
    ['نطاق العمل', 'محلي ودولي؛ يحق للجمعية افتتاح فروع ومكاتب تمثيلية داخل تركيا وخارجها وفق خطة التوسع المعتمدة']];
  const cw = (CW - 0.6) / 3;
  items.forEach(([t, d], i) => card(s, W - M - cw - i * (cw + 0.3), 3.2, cw, 2.1, [H(t, 20, C.accent1), { t: d, size: 15 }]));
  s.addImage({ path: IMG + 'ortakoy.jpg', x: M, y: 5.5, w: CW, h: 1.25, sizing: { type: 'cover', w: CW, h: 1.25 }, rounding: false, objectName: 'photo' });
}

/* 4 vision & mission ----------------------------------------------------------------- */
{
  const s = content(true, '2 · إلى أين نتجه، وكيف نصل', 'الرؤية والرسالة والأهداف الإستراتيجية');
  const cw = (CW - 0.4) / 2;
  card(s, W - M - cw, 1.95, cw, 4.75, [H('رؤية 2035', 16, C.accent4), H('الرؤية', 30, C.background1),
    { t: 'أن نكون المؤسسة الرائدة عالمياً في بناء القيم وترسيخ البناء الأخلاقي وتعزيز التنسيق والشراكة بين منظمات المجتمع المدني، وتحقيق تنمية مجتمعية واقتصادية شاملة ومستدامة للمجتمعات والأسر والأفراد بحلول عام 2035.', size: 20 }], { dark: true, margin: [24, 26, 24, 26] });
  card(s, M, 1.95, cw, 4.75, [H('«ينابيع» و«منافع»', 16, C.accent3), H('الرسالة', 30, C.background1),
    { t: 'ترسيخ القيم الأخلاقية والمهارية لدى الأفراد والمؤسسات، واستثمار الطاقات البشرية عبر برامج قيمية وتكاملية، وتفعيل الشراكات مع الجمعيات التركية وجمعيات الجاليات، وإطلاق مبادرات تنموية وإنتاجية نموذجية تحقق الاستقرار والازدهار وتوفر فرص العمل.', size: 20 }], { dark: true, margin: [24, 26, 24, 26] });
}

/* 5 goals ---------------------------------------------------------------------------- */
{
  const s = content(false, '2 · الرؤية والرسالة والأهداف الإستراتيجية', 'الأهداف الإستراتيجية');
  const g = [['تعزيز القيم الإيجابية', 'ترسيخ القيم الأخلاقية والإنسانية والوسطية في المجتمع، وبناء أجيال ذات مرجعية قيمية راسخة.'],
    ['التمكين والتأهيل', 'إكساب الشباب والأسر والنساء المهارات الحياتية والاقتصادية الحديثة والتأهيل المهني.'],
    ['التكامل والتنسيق المؤسسي', 'الربط بين الجمعيات التركية وجمعيات الجاليات لتفادي تكرار الجهود وتبادل الخبرات وتعظيم الاستفادة من الموارد.'],
    ['مساندة التنمية والجهود الرسمية', 'دعم جهود الدولة في توفير فرص العمل والتأهيل المهني والحد من التحديات الاقتصادية والبطالة.'],
    ['الاستدامة والحلول الشاملة', 'تقديم حلول تنموية واجتماعية واقتصادية قائمة على الشراكات الإستراتيجية والاستثمار الاجتماعي.']];
  const cw = (CW - 4 * 0.25) / 5;
  g.forEach(([t, d], i) => card(s, W - M - cw - i * (cw + 0.25), 2.0, cw, 4.6, [H(String(i + 1), 36, C.accent1), H(t, 17, C.text1), { t: d, size: 14 }]));
}

/* 6 initiatives ---------------------------------------------------------------------- */
section('المبادرات وفلسفة العمل والأقسام');
{
  const s = content(true, '3 · مبادرتان تنمويتان ومحور مساند', 'المبادرات التنموية الرئيسية ومحاور العمل');
  const cw = (CW - 0.4) / 2;
  [[W - M - cw, 'reading.jpg', 'مبادرة «ينابيع» – البناء الفكري والقيمي والتربية التفاعلية', 'مجال التركيز: التربية القيمية، والبناء الفكري، والتواصل الثقافي والمجتمعي والتكيف.', C.accent3],
   [M, 'workshop.jpg', 'مبادرة «منافع» – التكافل والتضامن والتمكين الاقتصادي', 'مجال التركيز: معالجة التحديات الاقتصادية، والتمكين الاقتصادي، والتوظيف، والتكافل والتضامن.', C.accent4]]
    .forEach(([x, img, t, d, col]) => {
      s.addImage({ path: IMG + img, x, y: 1.95, w: cw, h: 2.2, sizing: { type: 'cover', w: cw, h: 2.2 }, objectName: 'photo' });
      card(s, x, 4.25, cw, 2.45, [H(t, 19, col), { t: d, size: 15 }], { dark: true });
    });
  s.addNotes('الصور تعبيرية.');
}

/* 7 philosophy ----------------------------------------------------------------------- */
{
  const s = content(false, '4 · المبادئ التي نعمل بها، والفرق التي تنفّذ', 'فلسفة العمل');
  const p = [['Synergy', 'التكامل والربط', 'تنسيق فاعل بين الجمعيات الأهلية لبناء شراكات مثمرة واستثمار الموارد بكفاءة.'],
    ['Empowerment', 'التمكين والديمومة', 'الانتقال من الإغاثة المباشرة إلى التأهيل المهني والتمكين الإنتاجي المستدام.'],
    ['Dual Impact', 'الأثر المزدوج', 'جمع متوازن بين البناء القيمي (ينابيع) والتمكين الاقتصادي والاجتماعي (منافع).'],
    ['Self-Sustainability', 'الاستدامة الذاتية', 'تشغيل استثماري واجتماعي يضمن موارد ثابتة لتمويل البرامج.']];
  const cw = (CW - 0.3) / 2, ch = 2.15;
  p.forEach(([en, t, d], i) => card(s, W - M - cw - (i % 2) * (cw + 0.3), 2.0 + Math.floor(i / 2) * (ch + 0.3), cw, ch,
    [H(en, 13, C.accent1), H(t, 24, C.text1), { t: d, size: 18 }]));
}

/* 8 departments ---------------------------------------------------------------------- */
{
  const s = content(false, '4 · فلسفة العمل والأقسام التنفيذية', 'الأقسام التنفيذية داخل الجمعية');
  const rows = [['قسم البرامج القيمية والتربوية', 'إعداد البرامج التربوية والمناهج القيمية لمبادرة «ينابيع» وتطبيقها.'],
    ['قسم التنسيق والعلاقات بين الجمعيات', 'بناء شبكة العلاقات المؤسسية والأنشطة المشتركة بين الجمعيات.'],
    ['قسم التأهيل المهني والتوظيف', 'إدارة دورات التدريب المهني ومنصات التوظيف والمشاريع الصغرى ضمن «منافع».'],
    ['قسم التكافل والتضامن الاجتماعي', 'المسح الميداني والدعم الاجتماعي المباشر للأسر والطلاب.'],
    ['قسم الدراسات والتخطيط والاستثمار الاجتماعي', 'البحث الميداني ومتابعة جودة الأداء وإدارة المطبوعات وتشغيل المنشآت الاقتصادية.']];
  const cell = (t, o) => ({ text: t, options: { align: 'right', rtlMode: true, valign: 'middle', ...o } });
  const data = [[cell('المهام الرئيسية', { bold: true, color: C.background1, fill: { color: C.accent1 } }), cell('القسم', { bold: true, color: C.background1, fill: { color: C.accent1 } })]]
    .concat(rows.map((r, i) => [cell(r[1], { color: C.accent5, fill: { color: i % 2 ? C.background2 : C.background1 } }), cell(r[0], { bold: true, color: C.text1, fill: { color: i % 2 ? C.background2 : C.background1 } })]));
  s.addTable(data, { x: M, y: 2.0, w: CW, colW: [CW * 0.62, CW * 0.38], fontSize: 15, rowH: 0.72, border: { type: 'solid', pt: 0.75, color: 'E1E6E4' }, margin: [6, 12, 6, 12], objectName: 'table' });
}

/* 9 expansion ------------------------------------------------------------------------ */
section('التوسع والفئات المستهدفة');
{
  const s = content(true, '5 · خطة مرحلية محسوبة تضمن الجودة ونقل الخبرة', 'البرنامج الزمني للتوسع الجغرافي');
  s.addText('7 مراحل · من إسطنبول إلى العالم', { x: M, y: 1.7, w: CW, h: 0.45, fontSize: 18, bold: true, color: C.accent4, align: 'right', margin: 0, isTextBox: true, ...AR });
  const st = [['إسطنبول', 'التأسيس وبناء النموذج التشغيلي المعياري واختبار المبادرات.'],
    ['أنقرة', 'تعزيز الحضور في العاصمة وبناء الشراكات المركزية مع المؤسسات الرسمية.'],
    ['أكبر 10 ولايات تركية', 'نشر النموذج وتغطية الكثافات السكانية الكبرى عبر فروع ومكاتب تمثيلية.'],
    ['كافة الولايات التركية', 'تحقيق التغطية الوطنية الشاملة.'],
    ['أهم 10 دول إسلامية', 'نقل التجربة وتأسيس شراكات إقليمية لتصدير الحقائب القيمية والتنموية.'],
    ['باقي الدول الإسلامية', 'تعميق الأثر وتفعيل التكافل والتكامل التنموي الإسلامي.'],
    ['الدول ذات الأهمية العالمية', 'التواصل مع الجاليات والمجتمعات العالمية وبناء نموذج عمل إنساني وقيمي عالمي.']];
  const cw = (CW - 6 * 0.18) / 7;
  // connecting line behind the stage cards
  s.addShape(pres.ShapeType.line, { x: M + 0.2, y: 2.75, w: CW - 0.4, h: 0, line: { color: DARK_LINE, width: 2 }, objectName: 'bg line' });
  st.forEach(([t, d], i) => card(s, W - M - cw - i * (cw + 0.18), 2.4, cw, 4.3,
    [H('المرحلة ' + (i + 1), 13, i < 4 ? C.accent3 : C.accent4), H(t, 16, C.background1), { t: d, size: 13 }], { dark: true, margin: [12, 10, 12, 10] }));
}

/* 10 targets ------------------------------------------------------------------------- */
{
  const s = content(false, '6 · لمن نعمل', 'الفئات والمؤسسات المستهدفة');
  const t = [['الجمعيات والمنظمات الأهلية', 'التنسيق وتكامل الموارد والخبرات والأنشطة المشتركة.'],
    ['الشباب والباحثون عن عمل', 'التأهيل المهني والتدريب والربط بسوق العمل والتوظيف.'],
    ['الأسر والأطفال والنساء', 'البناء القيمي والإرشاد الأسري والتمكين الإنتاجي.'],
    ['مؤسسات الدولة والمجتمع', 'الشراكة الاقتصادية والاجتماعية ومساندة خطط التنمية.']];
  const cw = (CW - 4.2 - 0.3) / 2, ch = 2.15;
  t.forEach(([h, d], i) => card(s, W - M - cw - (i % 2) * (cw + 0.3), 2.0 + Math.floor(i / 2) * (ch + 0.3), cw, ch, [H(h, 22, C.accent1), { t: d, size: 18 }]));
  s.addImage({ path: IMG + 'youth.jpg', x: M, y: 2.0, w: 3.9, h: 2 * ch + 0.3, sizing: { type: 'cover', w: 3.9, h: 2 * ch + 0.3 }, objectName: 'photo' });
}

/* 11 governance ---------------------------------------------------------------------- */
section('الحوكمة والتمويل');
{
  const s = content(true, '7 · الهيكل التنظيمي وآليات اتخاذ القرار', 'الهيكل الإداري والحوكمة المؤسسية');
  const g = [['جميع الأعضاء', 'الجمعية العمومية', 'Genel Kurul', 'السلطة العليا في الجمعية؛ تجتمع اجتماعاً عادياً كل 3 سنوات في شهر أبريل، وتختص بتعديل النظام الأساسي وإقرار السياسات العامة والتصويت.', C.accent3],
    ['5 + 5', 'مجلس الإدارة', 'Yönetim Kurulu', '5 أعضاء أساسيين و5 احتياط. السلطة التنفيذية الممثلة للجمعية: يدير الأنشطة ويشكّل اللجان ويشرف على «ينابيع» و«منافع» ويؤسس المنشآت الاقتصادية.', C.accent4],
    ['3 + 3', 'مجلس الرقابة', 'Denetim Kurulu', '3 أعضاء أساسيين و3 احتياط. يتولى الرقابة المالية والإدارية الدورية والتأكد من مطابقة الأعمال للقوانين والنظام الأساسي.', C.accent3]];
  const cw = (CW - 0.6) / 3;
  g.forEach(([big, t, tr, d, col], i) => card(s, W - M - cw - i * (cw + 0.3), 1.95, cw, 4.75,
    [H(big, 30, col), H(t, 22, C.background1), { t: tr, size: 13, color: '9FB3C2' }, { t: d, size: 18 }], { dark: true, margin: [20, 20, 20, 20] }));
}

/* 12 cycle --------------------------------------------------------------------------- */
{
  const s = content(false, '7 · الحوكمة والإدارة وإجراءات العمل', 'منهجية التطبيق الميداني (دورة العمل التنفيذية)');
  const c = [['الدراسة والتقييم', 'البحث الميداني وتحليل الاحتياجات المجتمعية'], ['التخطيط والشراكة', 'تصميم المبادرات وعقد البروتوكولات مع الجهات المعنية'],
    ['التنفيذ الميداني', 'إطلاق المشاريع عبر «ينابيع» و«منافع» واللجان'], ['قياس الأثر', 'التقييم المالي والفني ورفع التقارير للرقابة']];
  const aw = 0.45, cw = (CW - 3 * (aw + 0.2)) / 4;
  c.forEach(([t, d], i) => {
    const x = W - M - cw - i * (cw + aw + 0.2);
    card(s, x, 2.3, cw, 3.4, [H(String(i + 1), 40, C.accent1), H(t, 20, C.text1), { t: d, size: 17 }]);
    if (i < 3) s.addShape(pres.ShapeType.leftArrow, { x: x - aw - 0.1, y: 3.8, w: aw, h: 0.4, fill: { color: C.accent2 }, line: { type: 'none' }, objectName: 'arrow' });
  });
}

/* 13 funding ------------------------------------------------------------------------- */
{
  const s = content(true, '8 · الأحكام المالية وخطة الاستدامة والتمويل', 'مصادر الدخل المعتمدة');
  const f = ['رسوم الانتساب والاشتراكات السنوية للأعضاء', 'التبرعات والهبات الطوعية من الأفراد والمؤسسات', 'عوائد المطبوعات والمعارض والندوات والرحلات والأنشطة',
    'ريع أصول الجمعية وممتلكاتها', 'التبرعات المجمّعة وفق تشريعات جمع التبرعات', 'أرباح المنشآت الاقتصادية والتجارية التابعة', 'المنح وبرامج الصناديق المحلية والدولية والتمويل المشترك'];
  const cw = (CW - 3 * 0.25) / 4, ch = 2.15;
  f.forEach((t, i) => {
    const r = Math.floor(i / 4), c = i % 4, w = cw;
    card(s, W - M - cw - c * (cw + 0.25), 1.95 + r * (ch + 0.3), w, ch, [H(String(i + 1), 28, i < 4 ? C.accent4 : C.accent3), { t, size: 18, color: 'E6EEF2' }], { dark: true });
  });
  s.addImage({ path: IMG + 'board.jpg', x: M, y: 1.95 + ch + 0.3, w: cw, h: ch, sizing: { type: 'cover', w: cw, h: ch }, objectName: 'photo' });
}

/* 14 rights -------------------------------------------------------------------------- */
section('العضوية والأثر والختام');
{
  const s = content(false, '9 · ما لك وما عليك', 'حقوق وواجبات العضو الجديد');
  const cw = (CW - 0.4) / 2;
  const rights = ['المشاركة في اجتماعات الجمعية العمومية والتصويت على القرارات.', 'الترشح لعضوية اللجان والمهام في مختلف الأقسام التنفيذية.',
    'تقديم المقترحات والمبادرات لتطوير «ينابيع» و«منافع».', 'الاستفادة من البرامج التدريبية والفعاليات التي تنظمها الجمعية.'];
  const duties = ['الالتزام بأهداف الجمعية ونظامها الأساسي ومبادئها الأخلاقية.', 'المساهمة الفاعلة في تحقيق أهداف الجمعية ونشر رسالتها.',
    'سداد الاشتراكات السنوية المقررة وفق الأنظمة المعتمدة.', 'الحفاظ على سمعة الجمعية وممتلكاتها ومكتسباتها.'];
  card(s, W - M - cw, 1.95, cw, 4.75, [H('حقوق العضو', 24, C.accent1), ...rights.map(t => ({ t: '✔  ' + t, size: 18, after: 14 }))], { margin: [22, 24, 22, 24] });
  card(s, M, 1.95, cw, 4.75, [H('واجبات العضو', 24, '8A6216'), ...duties.map(t => ({ t: '◆  ' + t, size: 18, after: 14 }))], { margin: [22, 24, 22, 24] });
}

/* 15 impact -------------------------------------------------------------------------- */
{
  const s = content(true, '10 · النتائج التي نسعى إليها', 'قياس الأثر التنموي المتوقع');
  const im = [['الأثر الاقتصادي والتوظيف', 'خلق فرص عمل جديدة وتدريب الكوادر البشرية دعماً لخطط الدولة التنموية وللحد من البطالة.', C.accent4],
    ['أثر التكامل المؤسسي', 'تفعيل الشراكة بين الجمعيات التركية وجمعيات الجاليات بما يعظّم الاستفادة من الإمكانات ويمنع تكرار الجهود.', C.accent3],
    ['الأثر المجتمعي والقيمي', 'بناء أجيال متمسكة بالقيم، ونموذج عمل فاعل ومستدام يخدم كل أفراد المجتمع بأسلوب تكاملي.', C.accent4]];
  const cw = (CW - 0.6) / 3;
  im.forEach(([t, d, col], i) => card(s, W - M - cw - i * (cw + 0.3), 2.0, cw, 3.2, [H(t, 22, col), { t: d, size: 18 }], { dark: true, margin: [20, 20, 20, 20] }));
  s.addImage({ path: IMG + 'training.jpg', x: M, y: 5.4, w: CW, h: 1.3, sizing: { type: 'cover', w: CW, h: 1.3 }, transparency: 20, objectName: 'photo' });
}

/* 16 why join ------------------------------------------------------------------------ */
{
  const s = content(false, '12 · وما الذي يميزها عن غيرها', 'لماذا أنضم إلى جمعية «تكامل»؟');
  s.addText('وتتجسد قوة الجمعية في عشر ركائز إستراتيجية تجعل منها بيئة استثنائية للعطاء والأثر المستدام:',
    { x: M, y: 1.8, w: CW, h: 0.5, fontSize: 17, color: C.accent5, align: 'right', margin: 0, isTextBox: true, ...AR });
  const p = ['القيادة والحوكمة', 'التنوع والتكامل الدولي', 'الدور التنسيقي والشبكي', 'الشمولية ونطاق الأثر', 'الأمان المجتمعي والاقتصادي',
    'التحول الرقمي والذكاء الاصطناعي', 'الاستثمار في أجيال المستقبل', 'التجديد المؤسسي وتداول القيادة', 'التفرغ الإداري والتنفيذي', 'الاستدامة والاستقلالية المالية'];
  const cw = (CW - 4 * 0.22) / 5, ch = 2.0;
  p.forEach((t, i) => card(s, W - M - cw - (i % 5) * (cw + 0.22), 2.55 + Math.floor(i / 5) * (ch + 0.25), cw, ch,
    [H(String(i + 1), 28, i < 5 ? C.accent1 : '8A6216'), H(t, 16, C.text1)]));
}

/* 17 closing ------------------------------------------------------------------------- */
{
  const s = pres.addSlide({ masterName: 'COVER', sectionTitle: sec });
  s.addImage({ path: IMG + 'dome.jpg', x: 0, y: 0, w: W, h: 7.5, sizing: { type: 'cover', w: W, h: 7.5 }, transparency: 60, objectName: 'bg photo' });
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 7.5, fill: { color: C.text2, transparency: 25 }, line: { type: 'none' }, objectName: 'bg scrim' });
  s.addImage({ path: LOGO, x: W / 2 - 0.7, y: 1.1, w: 1.4, h: 1.37, objectName: 'logo' });
  s.addText('مرحباً بك مجدداً في رحلة العطاء والتكامل', { x: 1, y: 2.8, w: W - 2, h: 1.2, fontSize: 42, bold: true, color: C.background1, align: 'center', margin: 0, isTextBox: true, ...AR });
  s.addText('يداً بيد لنبني القيم ونحقق التنمية المستدامة', { x: 1, y: 4.1, w: W - 2, h: 0.7, fontSize: 24, bold: true, color: C.accent4, align: 'center', margin: 0, isTextBox: true, ...AR });
  s.addText('جمعية تكامل لبناء القيم والتنمية  |  إسطنبول – الجمهورية التركية', { x: 1, y: 5.0, w: W - 2, h: 0.5, fontSize: 16, color: C.accent6, align: 'center', margin: 0, isTextBox: true, ...AR });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote', OUT);
})();
