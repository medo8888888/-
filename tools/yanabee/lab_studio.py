"""«ستوديو الفريق» — the playable prototype of the Yanabee app (panel #panel-studio of lab.html).

Build time: everything the Studio quotes from the documents (team names, 'طبيعة العمل', supervising bodies,
role wording, rules, KPI sentences and their target numbers) is read from content.py and embedded as JSON
(<script type="application/json" id="studio-data">). Every sentence shown from the documents is built with
core.t(), so it is verbatim. The "simulation layer" (challenge steps, points, rival teams, survey questions,
microcopy) is written here and is always marked «تجريبي» in the UI. Asserts below fail the build if a challenge
claims a fragment that is not really in the document it points to.

Runtime: js/studio.js + css/studio.css (classic script, no libraries, works from file://).
"""
import json
import re

from content import PLATFORM as P, QURAN as Q
from core import ICONS, TEAMS, ic, link_for, paren, plain, short, strip_colon, t

TIDS = list(TEAMS)
TEAM = {tid: P['s2'][tid] for tid in TIDS}
BODIES, NATURE = 0, 1                      # positions of the items inside every team (see page_teams)

# ---------------------------------------------------------------------------------------------
# Simulation layer: weekly field challenges derived from each team's own 'طبيعة العمل'.
#   f   fragment (verbatim from the document node `src`)      src 'nature' = the team's own sentence
#   t   title (ours)   l  difficulty 1..3   s  3 steps (ours)   p  proof kind   d  the digital version (crisis)
# ---------------------------------------------------------------------------------------------
PTS = {1: 25, 2: 32, 3: 40}
CH = {
    't1': [
        ('مدارسة القرآن الكريم وتطبيقه', 'nature', 'حلقة مدارسة وتطبيق', 1,
         ['اختاروا آية وقيمة من مقطع الأسبوع', 'ناقشوها عشر دقائق واستخرجوا سلوكاً واحداً تطبقونه', 'طبّقوه وسجّلوا موقفاً حقيقياً واحداً'], 'photo',
         'لعبة مطابقة تفاعلية: اربطوا الآية بالقيمة المستنبطة منها'),
        ('مبادرات أخلاقية وسلوكية ميدانية', 'nature', 'مبادرة أخلاقية صغيرة', 2,
         ['حدّدوا سلوكاً مألوفاً يحتاج إصلاحاً حولكم', 'صمّموا مبادرة من ثلاث خطوات تعالجه', 'نفّذوها ووثّقوها بصورة'], 'photo',
         'سيناريو تفاعلي: موقف سلوكي أمامك، اختر التصرف الأنسب واكتب القيمة التي يستند إليها'),
        ('السلوكيات الخاطئة في البيئة المحيطة', 'nature', 'جولة رصد وحلّ', 3,
         ['جولة رصد في محيط المدرسة أو الحيّ بإذن مسبق', 'سجّلوا ثلاثة سلوكيات خاطئة وأسبابها دون تصوير وجوه', 'اقترحوا حلاً وقدّموه لمسؤول الجودة والسلوك'], 'video',
         'تصنيف تفاعلي: رتّبوا سلوكيات من مواقف مكتوبة بحسب أثرها واقترحوا حلاً لكل منها'),
        ('التعاون مع الجيران', 'a4', 'خدمة جار', 2,
         ['اسألوا جاراً عن حاجة صغيرة يمكنكم تلبيتها', 'وزّعوا المهمة بين أعضاء الفريق', 'نفّذوها وخذوا كلمة شكر مكتوبة'], 'photo',
         'بطاقة شكر رقمية: صمّموا بطاقة تعاون لجار وأرسلوها عبر مجموعة الأسرة'),
    ],
    't2': [
        ('معسكرات', 'nature', 'معسكر نهاري مصغّر', 3,
         ['جهّزوا قائمة معدات وخطة يوم بتصريح مسبق', 'انصبوا ركن المعسكر ووزّعوا المهام بالتناوب', 'قيّموا الانضباط في ختام اليوم'], 'video',
         'مهمة تخطيط تفاعلية: وزّعوا المعدات والمهام ضمن وقت محدّد'),
        ('انضباط ميداني', 'nature', 'اختبار الانضباط', 1,
         ['اتفقوا على إشارات الفريق', 'نفّذوا تمرين طابور وإشارات', 'سجّلوا نسبة الالتزام'], 'photo',
         'لعبة إشارات: تعرّف على الإشارة واستجب بالتسلسل الصحيح'),
        ('غرس الاعتماد على الذات', 'nature', 'يوم الاعتماد على الذات', 2,
         ['يختار كل عضو مهمة ينجزها بنفسه', 'وثّقوا الحالة قبل وبعد', 'تبادلوا ما تعلمتموه'], 'photo',
         'قائمة مهام ذاتية: أنجز كل عضو مهمته وأرسلها للفريق'),
        ('مهارات خدمة البيئة', 'nature', 'مهارة لخدمة المكان', 2,
         ['اختاروا مهارة تخدم بيئة المكان', 'تدرّبوا عليها معاً', 'طبّقوها في موقع حقيقي'], 'photo',
         'تدريب مصوّر: شاهدوا شرح المهارة ثم أجيبوا عن أسئلة التطبيق'),
        ('الإغاثة الخدمية', 'nature', 'تمرين إغاثة خدمية', 3,
         ['وزّعوا الأدوار في سيناريو إغاثة', 'نفّذوا التمرين بزمن محدّد', 'دوّنوا الدروس المستفادة'], 'video',
         'محاكاة إغاثة: اتخذوا قرارات الأولويات في سيناريو يتغيّر كل دقيقة'),
    ],
    't3': [
        ('ألعاب بقوانين خاصة', 'nature', 'ابتكروا قانوناً جديداً', 2,
         ['ابتكروا قانوناً يفرض التمرير للجميع', 'جرّبوه في مباراة مصغّرة', 'دوّنوا القانون وملاحظات التجربة'], 'video',
         'تصميم قانون على اللوحة التفاعلية ثم محاكاة أثره على نتيجة مباراة'),
        ('التنسيق الجماعي', 'nature', 'سلسلة التمريرات الصامتة', 1,
         ['حدّدوا إشارات بدل الكلام', 'أنجزوا عشر تمريرات متتالية', 'كرّروا ثلاث مرات وسجّلوا الأفضل'], 'video',
         'لعبة ذاكرة حركات: أعيدوا تسلسل الحركات الجماعية بالترتيب'),
        ('التكتيك المشترك', 'nature', 'لوحة التكتيك', 2,
         ['ارسموا خطة بدور لكل لاعب', 'طبّقوها ثلاث مرات', 'عدّلوها بحسب النتيجة'], 'photo',
         'لوحة تكتيك رقمية: حرّكوا اللاعبين لحل ثلاثة مواقف'),
        ('ضبط النفس عند الفوز أو الخسارة', 't3', 'ميثاق الروح الرياضية', 1,
         ['اكتبوا ميثاقاً من ثلاث نقاط', 'طبّقوه في مباراة', 'يروي كل لاعب موقف ضبط نفس'], 'photo',
         'اختبار مواقف: اختر الرد الرياضي في خمسة مواقف فوز وخسارة'),
    ],
    't4': [
        ('البرمجة والتكنولوجيا', 'nature', 'ساعة برمجة جماعية', 1,
         ['اختاروا مشكلة صغيرة من يوميات الفريق', 'اكتبوا خطوات الحل على الورق', 'برمجوا النموذج الأول'], 'photo',
         'أحجية برمجية تفاعلية: رتّبوا الكتل لحل المشكلة نفسها'),
        ('ابتكار تطبيقات', 'nature', 'نموذج تطبيق أولي', 3,
         ['ارسموا شاشات التطبيق الثلاث', 'اربطوها في نموذج قابل للنقر', 'سجّلوا عرضاً قصيراً للنموذج'], 'video',
         'ورشة تصميم رقمية: أنتجوا نموذجاً أولياً على المنصة وشاركوه'),
        ('حلول تكنولوجية تخدم قضايا المجتمع المحلي', 'nature', 'حلّ ذكي لمشكلة محلية', 2,
         ['حدّدوا مشكلة خدمية في حيّكم', 'جرّبوا حلاً بالبيانات أو الأتمتة', 'اعرضوه على مختص أو جار'], 'photo',
         'تحليل حالة: اقرأوا بيانات مشكلة محلية واقترحوا حلاً تقنياً'),
        ('التفكير البرمجي والتحليلي', 't4', 'لغز تحليلي', 1,
         ['حلّوا ثلاثة ألغاز منطقية', 'فسّروا طريقة التفكير لزملائكم', 'سجّلوا الوقت'], 'photo',
         'سباق ألغاز على المنصة بزمن محدّد'),
    ],
    't5': [
        ('إعادة التدوير', 'nature', 'ركن فرز وتدوير', 1,
         ['صنّفوا نفايات الفريق إلى ثلاثة أنواع', 'جهّزوا حاويات واضحة العلامات', 'سلّموا المفروزات لجهة تدوير'], 'photo',
         'لعبة فرز تفاعلية: ضعوا كل عنصر في الحاوية الصحيحة'),
        ('التشجير', 'nature', 'زراعة شتلات', 2,
         ['اختاروا موقعاً بإذن مسبق', 'اشتروا الشتلات وأدوات الزراعة', 'ازرعوا ووثّقوا مع الفاتورة'], 'invoice',
         'مزرعة افتراضية: خطّطوا موقع الشتلات وفق التربة والمياه'),
        ('ترشيد الطاقة', 'nature', 'تدقيق الطاقة في البيت', 1,
         ['مرّوا على مصابيح وأجهزة البيت', 'سجّلوا ثلاثة مواضع هدر', 'عالجوا موضعاً واحداً على الأقل'], 'photo',
         'حاسبة استهلاك تفاعلية: اكتشفوا مواضع الهدر في بيت افتراضي'),
        ('نشر التوعية الصحية', 'nature', 'ملصق وجلسة توعية', 2,
         ['اختاروا عادة صحية واحدة', 'صمّموا ملصقاً بسيطاً', 'قدّموا جلسة خمس دقائق لزملاء'], 'photo',
         'ملصق رقمي: صمّموه على المنصة وشاركوه في مجموعة الصف'),
        ('قوافل صحية', 'nature', 'دعم قافلة صحية', 3,
         ['تواصلوا مع جهة منظمة للقافلة', 'نظّموا مهام الاستقبال والإرشاد', 'وثّقوا عدد المستفيدين'], 'video',
         'قافلة افتراضية: أديروا طابور المستفيدين وجدول الخدمات'),
        ('مواجهة التغير المناخي', 'nature', 'عهد المناخ الأسري', 2,
         ['اكتبوا ثلاثة التزامات مناخية للأسرة', 'علّقوها في مكان ظاهر', 'تابعوها يومياً أسبوعاً'], 'photo',
         'عدّاد البصمة الكربونية: قارنوا خيارات يومية وغيّروا خياراً واحداً'),
    ],
    't6': [
        ('إنتاج محتوى قيم وتوعوي', 'nature', 'منشور قيمي مصوّر', 1,
         ['اختاروا قيمة وفكرة واحدة', 'اكتبوا نصاً قصيراً وصمّموا صورة', 'راجعوه مع مسؤول الجودة قبل النشر'], 'photo',
         'استوديو رقمي: ركّبوا المنشور داخل قالب جاهز'),
        ('أدوات الذكاء الاصطناعي', 'nature', 'ذكاء اصطناعي بمسؤولية', 2,
         ['استخدموا أداة ذكاء اصطناعي لاقتراح أفكار', 'تحقّقوا من صحة كل معلومة', 'اذكروا ما عدّلتموه بأنفسكم'], 'photo',
         'اختبار صحة: ميّزوا بين مخرجات صحيحة وأخرى مضلّلة'),
        ('صناعة الإعلام الهادف', 'nature', 'فيديو هادف ٦٠ ثانية', 3,
         ['اكتبوا سيناريو من ثلاثة مشاهد', 'صوّروا ومنتجوا الفيديو', 'اعرضوه على فريق آخر واجمعوا رأيهم'], 'video',
         'مونتاج تفاعلي: رتّبوا لقطات جاهزة لقصة قصيرة هادفة'),
        ('ينشر الهوية الوطنية والدينية', 'nature', 'حكاية معلم وطني', 2,
         ['اختاروا معلماً أو حكاية من بلدكم', 'اجمعوا ثلاث معلومات موثوقة', 'اصنعوا بطاقة تعريف مصوّرة'], 'photo',
         'جولة افتراضية: ابنوا بطاقة تعريف لمعلم من صور وأوصاف'),
        ('للشائعات', 't6', 'فاحص الشائعات', 1,
         ['اجمعوا ثلاث رسائل متداولة', 'تحقّقوا من مصدر كل رسالة', 'اصنعوا بطاقة «صحيح أم مضلّل»'], 'photo',
         'لعبة محقّق: افحصوا خمس رسائل واحكموا عليها'),
    ],
    't7': [
        ('احتياجات الجمعيات التطوعية', 'nature', 'حصر احتياج جمعية', 1,
         ['تواصلوا مع جمعية قريبة', 'اسألوا عن احتياج واحد واضح', 'لخّصوه في بطاقة تحدٍّ'], 'photo',
         'استمارة رقمية: املأوا بطاقة احتياج جمعية افتراضية'),
        ('الأسر المتعففة', 'nature', 'رسالة مودة لأسرة', 1,
         ['اكتبوا رسالة تقدير باحترام', 'جهّزوا مع الجمعية طريقة إيصال تحفظ الخصوصية', 'سلّموها عبر الجهة المختصة'], 'photo',
         'كتابة رسالة تقدير رقمية تُرسل عبر الجمعية الشريكة'),
        ('الحملات الإغاثية', 'nature', 'حملة جمع مساعدات', 3,
         ['حدّدوا هدف الحملة ومدتها', 'اجمعوا التبرعات العينية وسجّلوها', 'سلّموها لجهة معتمدة مع الإيصال'], 'invoice',
         'حملة رقمية: أديروا هدف تبرعات افتراضياً ووزّعوا الأدوار'),
        ('المساعدات', 'nature', 'تجهيز سلة مساعدة', 2,
         ['حدّدوا محتويات السلة والميزانية', 'اشتروا وجهّزوا السلة', 'سلّموها عبر جهة معتمدة'], 'invoice',
         'ميزانية السلة: وازنوا الاحتياجات والتكلفة على لوحة تفاعلية'),
        ('الأنشطة التكافلية الميدانية', 'nature', 'زيارة تكافلية', 2,
         ['خطّطوا لزيارة مع الجمعية', 'نفّذوا نشاطاً تكافلياً خلالها', 'اكتبوا انطباع الفريق'], 'photo',
         'مقابلة افتراضية: تعلّموا آداب الزيارة التكافلية عبر مواقف قصيرة'),
    ],
}

# Weekly «المهمة السلوكية والقيمية» — the value word must occur in the documents (checked below).
VALUES = [
    ('التعاون', 'طبّق قيمة «التعاون» في بيتك: ساعد أحد أفراد أسرتك دون أن يطلب منك، واكتب موقفاً واحداً.'),
    ('بر الوالدين', 'جسّد «بر الوالدين» بعمل واحد كل يوم هذا الأسبوع، ثم اكتب أثره على أسرتك.'),
    ('الصبر', 'تدرّب على «الصبر» في موقف يزعجك، ثم صف ما فعلته وما شعرت به.'),
    ('التكافل الاجتماعي', 'اختر عملاً صغيراً من «التكافل الاجتماعي» وانفذه، واكتب من استفاد منه.'),
    ('الشكر والقناعة', 'مارس «الشكر والقناعة»: دوّن كل مساء نعمة واحدة تشكر عليها.'),
    ('ضبط النفس', 'في موقف غضب أو منافسة، جرّب «ضبط النفس» ثم اكتب كيف تصرفت.'),
    ('التعاطف والإيثار', 'قدّم شيئاً تحبه لغيرك تعبيراً عن «التعاطف والإيثار»، واكتب شعورك.'),
    ('الاعتماد على الذات', 'أنجز مهمة منزلية كاملة بنفسك تطبيقاً لقيمة «الاعتماد على الذات».'),
]

NAMES = ['نبع', 'غيمة', 'صقر', 'سنابل', 'نجمة', 'بحر', 'ندى', 'فجر', 'سهم', 'واحة', 'غدير', 'زهرة', 'رعد', 'ضياء',
         'سحاب', 'قمر', 'جود', 'همّة', 'ريم', 'تلال']
TEAM_NAMES = {
    't1': ['رواد الهدى', 'سكينة', 'نور البيان'], 't2': ['حماة الدرب', 'نسور الميدان', 'خيمة النور'],
    't3': ['أسود الملعب', 'الخطة ب', 'صقور التمريرة'], 't4': ['بُناة الشيفرة', 'عقول الغد', 'نبض البرمجة'],
    't5': ['حرّاس الخضرة', 'قطرة وغصن', 'جيل أخضر'], 't6': ['صدى الحقيقة', 'عدسة الوعي', 'كلمة هادفة'],
    't7': ['يدٌ بيد', 'غيث الخير', 'سلة الود'],
}
RIVALS = ['نجوم الفجر', 'بُناة الغد', 'غيث الوادي', 'شعلة المبادرة', 'سحاب الهمة', 'حماة التلال', 'رواد الأفق', 'واحة الأمل']
PURPOSES = ['مستلزمات التنفيذ', 'نقل ومواصلات', 'طباعة وتوثيق', 'أدوات وخامات', 'ضيافة بسيطة للمشاركين']
SURVEY = [
    ('هل لاحظتم هذا الأسبوع تطبيق ابنكم للقيمة المطلوبة داخل البيت؟', ['نعم، بوضوح', 'أحياناً', 'لم يظهر بعد']),
    ('هل تحسّن الحوار بينكم بعد نشاط الفريق؟', ['تحسّن كثيراً', 'تحسّن قليلاً', 'كما كان']),
    ('كيف كان وقت الشاشة عند ابنكم هذا الأسبوع؟', ['أقل بوضوح', 'أقل قليلاً', 'كما هو']),
]

# Icons for the script (core.ICONS plus a few Lucide paths (ISC) that core does not carry).
LOCAL_ICONS = {
    'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    'crown': '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    'unlock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    'wallet': '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    'dice': '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M8 8h.01"/><path d="M16 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>',
    'refresh': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    'stop': '<rect width="14" height="14" x="5" y="5" rx="2"/>',
    'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
    'medal': '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/>',
    'pencil': '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'external': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
}
USED_ICONS = ['users', 'user', 'star', 'shield', 'lock', 'coins', 'award', 'check', 'x', 'mic', 'bell', 'message', 'smartphone',
              'image', 'video', 'file-text', 'flag', 'heart', 'sparkles', 'repeat', 'clock', 'calendar', 'target', 'gauge',
              'chart', 'leaf', 'alert', 'landmark', 'arrow-left', 'trash', 'send', 'map', 'eye', 'droplet', 'trophy',
              'handshake', 'lightbulb', 'book-open', 'home', 'cap', 'scale', 'lock', 'tv'] + list(TEAMS.values())
ICONSET = {k: ICONS[k] for k in dict.fromkeys(USED_ICONS)}
ICONSET.update(LOCAL_ICONS)


# ---------------------------------------------------------------------------------------------
def node_text(src, tid):
    """All the text of the document node a fragment claims to come from."""
    if src in ('nature', tid):
        return ' '.join(i.text for i in TEAM[tid].items)
    return ' '.join(Q.find(src).lines())


def mark_nature(text, frags):
    """The team's 'طبيعة العمل' (verbatim) with each derived fragment wrapped as <mark data-c=index>."""
    spans = []
    for idx, f in frags:
        pos = text.find(f)
        assert pos >= 0, (f, text)
        spans.append((pos, pos + len(f), idx))
    spans.sort()
    for a, b in zip(spans, spans[1:]):
        assert a[1] <= b[0], f'overlapping fragments {a} {b}'
    out, cur = '', 0
    for s, e, idx in spans:
        out += t(text[cur:s]) + f'<mark data-n="{idx + 1}">{t(text[s:e])}</mark>'
        cur = e
    return out + t(text[cur:])


def chips_of(text):
    parts = [p.strip() for p in text.split(' / ')]
    if parts and parts[-1].endswith('.'):
        parts[-1] = parts[-1][:-1]
    return parts


def teams_data():
    out = []
    for tid in TIDS:
        node = TEAM[tid]
        nat, bod = node.items[NATURE], node.items[BODIES]
        chal, frags = [], []
        for k, (f, src, title, lvl, steps, proof, dig) in enumerate(CH[tid]):
            assert f in node_text(src, tid), f'{tid}: fragment {f!r} not found in {src}'
            assert len(steps) == 3
            chal.append({'id': f'{tid}-{k}', 'f': f, 'src': link_for(tid) if src in ('nature', tid) else link_for(src),
                         'own': src == 'nature', 't': title, 'l': lvl, 'pts': PTS[lvl], 's': steps, 'p': proof, 'd': dig})
            if src == 'nature':
                frags.append((k, f))
        out.append({
            'id': tid, 'short': short(node.title), 'paren': paren(node.title), 'ic': TEAMS[tid],
            'photo': f'assets/photos/team-{tid}.jpg',
            'natLabel': strip_colon(nat.label), 'nat': mark_nature(nat.body, frags), 'natPlain': plain(nat.body),
            'bodLabel': strip_colon(bod.label), 'bodies': [t(c) for c in chips_of(bod.body)],
            'chal': chal, 'names': TEAM_NAMES[tid],
        })
    return out


def doc_quotes():
    """Verbatim document sentences the Studio shows next to its rules (key -> {h: html, s: link})."""
    a3 = Q['a3'].items
    team_item = a3[0]                       # تكوين الفريق (6 - 10 طلاب)
    roles = {c.label: c for c in team_item.children}
    lead = roles['قائد الفريق']
    buddy = next(i for i in a3 if 'الرفيق القرآني' in i.text)
    league = next(i for i in a3 if 'الدوري القيمي' in i.text)
    periodic = Q['a10']['periodic'].items
    annual = Q['a10']['annual'].items
    s5_digital = next(i for i in P['s5'].items if i.label.startswith('التشغيل الرقمي'))
    s6_gov = next(i for i in P['s6'].items if i.label.startswith('الحوكمة المالية'))
    s7 = P['s7'].items
    risk = next(i for i in s7 if i.label.startswith('خطة إدارة المخاطر'))
    privacy = next(i for i in s7 if i.label.startswith('حماية البيانات'))
    a5 = Q['a5'].items
    tracker = next(i for i in a5 if 'Behavioral Tracker' in i.text)
    comms = next(i for i in a5 if i.label.startswith('مساحة التواصل'))
    ind = next(i for i in Q['a4'].items if i.label.startswith('استمارة التطبيق'))
    politics = next(r for r in P['s8'].table if r[0].startswith('الأحزاب'))
    size_p = P['s2'].paras[0]
    initiatives = next(i for i in Q['a4'].items if i.label.startswith('المبادرات المجتمعية'))

    def it(i, label=True):
        return {'l': t(strip_colon(i.label)) if i.label else '', 'b': t(i.body), 'h': t(i.text)}
    return {
        'run': it(s5_digital),
        'size_p': {'h': t(size_p)},
        'teamForm': it(team_item),
        'roleLead': it(lead), 'roleQuality': it(roles['مسؤول الجودة والسلوك']), 'roleMedia': it(roles['المسؤول التقني والإعلامي']),
        'buddy': it(buddy), 'league': it(league),
        'shield': it(periodic[0]), 'medal': it(periodic[1]),
        'cert': it(annual[2]), 'trips': it(annual[0]), 'fund': it(annual[1]),
        'gov': it(s6_gov),
        'crisis': it(risk.children[0]), 'conservative': it(risk.children[1]),
        'privacy': it(privacy),
        'tracker': it(tracker), 'comms': it(comms),
        'individual': it(ind), 'initiatives': it(initiatives),
        'politics': {'l': t(politics[0]), 'b': t(politics[1])},
        'buddyStrength': {'h': t(Q['a1'].items[1].text)},
    }


def kpi_data():
    kp = Q['a11']['kpis'].items
    out = {}
    spec = {2: '90', 3: '80', 4: '1', 5: '80', 6: '100', 8: '30'}
    for n, target in spec.items():
        it = kp[n - 1]
        assert it.label.startswith(f'KPI {n} ')
        if n == 4:
            assert 'واحدة' in it.body
        else:
            assert re.search(rf'(?<!\d){target}%', it.body), (n, it.body)
        out[str(n)] = {'n': n, 'name': paren(it.label), 'h': t(it.body), 'target': int(target), 'href': f'quran.html#kpi{n}'}
    return out


def sources():
    src = {'teams': 'teams.html', 's5': link_for('s5'), 's6': link_for('s6'), 's7': link_for('s7'), 's8': link_for('s8')}
    for tid in TIDS:
        src[tid] = link_for(tid)
    for n in ('a1', 'a2', 'a3', 'a4', 'a5', 'a10', 'a11'):
        src[n] = link_for(n)
    for n in range(1, 10):
        src[f'kpi{n}'] = f'quran.html#kpi{n}'
    return src


def values_data():
    alltext = ' '.join(Q.source_lines + P.source_lines)
    out = []
    for v, task in VALUES:
        assert v in alltext, f'value {v!r} not in documents'
        out.append({'v': v, 'task': task})
    return out


def data():
    return {
        'teams': teams_data(), 'q': doc_quotes(), 'kpi': kpi_data(), 'src': sources(), 'values': values_data(),
        'icons': ICONSET, 'nicks': NAMES, 'rivals': RIVALS, 'purposes': PURPOSES,
        'survey': [{'q': q, 'o': o} for q, o in SURVEY],
        'sizes': {'platform': [5, 7], 't1': [5, 6, 7, 8, 9, 10]},
        'weeks': 8, 'month': 4,
    }


def dumps(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    return s.replace('</', '<\\/').replace('<!--', '<\\!--')


STEPS = [  # key, label, icon (UI chrome)
    ('found', 'تأسيس الفريق', 'users'), ('chal', 'تحدي الأسبوع', 'flag'), ('score', 'النقاط والدوري', 'trophy'),
    ('wallet', 'العهدة الإلكترونية', 'wallet'), ('family', 'ركن الأسرة', 'home'), ('impact', 'لوحة الأثر', 'gauge'),
]


def _icon(name):
    from core import svg
    return svg(ICONSET[name]) if name in ICONSET else ic(name)


def section():
    run = doc_quotes()['run']
    steps = ''.join(
        f'<button type="button" class="sd-step-b" data-act="go" data-i="{k}" aria-current="{"step" if i == 0 else "false"}">'
        f'<span class="sd-step-n" aria-hidden="true">{i + 1}</span><span class="sd-step-i" aria-hidden="true">{_icon(ic_)}</span>'
        f'<span class="sd-step-l">{lab}</span></button>'
        for i, (k, lab, ic_) in enumerate(STEPS))
    return f'''
<div class="sd" id="studio" data-studio>
  <header class="sd-intro">
    <div class="sd-intro-t">
      <span class="kicker">{ic('smartphone')}تطبيق «ينابيع» — نموذج للتجربة</span>
      <h2>ستوديو الفريق</h2>
      <p class="sd-lead">ابنِ فريقك، واستلم تحدي الأسبوع، وارفع إثباتك، وتابع نقاطك وعهدتك وأثرك — كما يعمل التطبيق الموحد الذي تصفه الوثيقة.</p>
    </div>
    <blockquote class="sd-rule"><span class="sd-rule-k">{ic('landmark')}من الوثيقة</span><p>{run['h']}</p>
      <a class="sd-src" href="{link_for('s5')}" target="_blank" rel="noopener">التشغيل والحوكمة</a></blockquote>
  </header>
  <div class="sd-layout">
    <aside class="sd-phone" aria-label="شاشة تطبيق ينابيع (محاكاة)">
      <div class="sd-phone-frame">
        <div class="sd-phone-notch" aria-hidden="true"></div>
        <div class="sd-appbar" id="sd-appbar"></div>
        <div class="sd-screen" id="sd-screen"></div>
      </div>
    </aside>
    <div class="sd-main">
      <nav class="sd-steps" aria-label="خطوات الستوديو">{steps}</nav>
      <div class="sd-stage" id="sd-stage" tabindex="-1"></div>
      <noscript><p class="sd-noscript">يحتاج الستوديو إلى تفعيل JavaScript، ولا يرسل أي بيانات إلى أي خادم.</p></noscript>
      <div class="sd-foot"><button type="button" class="sd-reset" data-act="reset">{_icon('refresh')}ابدأ من جديد</button>
        <span class="sd-foot-n">تُحفظ تجربتك في متصفحك فقط.</span></div>
    </div>
  </div>
  <div class="sr-only" id="sd-live" aria-live="polite" aria-atomic="true"></div>
  <script type="application/json" id="studio-data">{dumps(data())}</script>
</div>'''
