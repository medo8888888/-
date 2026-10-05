"""«لعبة موسم القائد» — the decision-simulation panel of lab.html (tab #panel-season).

You are the regional guide («الموجّه الإقليمي») of a governorate in the first year of the programme and run a
12-week season. Each week a dilemma card drawn from the document's governance / risk / finance rules offers three
choices that move five meters. The BEST choice is always the one the document prescribes; after each choice the
game quotes the document sentence VERBATIM (pulled from content.py by anchor, rendered with core.t) and links to it.

Honesty: the characters, scenarios, effects, starting values and titles are invented for the simulation and are
labelled «تجريبي» in the UI; the rules, mechanisms and target numbers are the document's and carry their source.
Scenario data lives here (reviewable wording) and is embedded as <script type="application/json" id="season-data">.
"""
import json

from content import PLATFORM as P, QURAN as Q
from core import ic, link_for, plain, split_kicker, strip_colon, t
from lab_season_art import hero_scene, scene

DOCS = {'platform': P, 'quran': Q}
DOC_NAME = {'platform': 'الوثيقة التعريفية', 'quran': 'مبادرة «حفظ، فهم، تطبيق»'}
MK = ['part', 'disc', 'trust', 'fin', 'lead']  # order of every effect vector


# ------------------------------------------------------------------ verbatim quotes
def _top_of(doc, nid):
    for s in doc.sections:
        if s.id == nid or any(x.id == nid for x in s.subs):
            return s
    raise KeyError(nid)


def line(docname, nid, key):
    """The one source line of node `nid` containing `key` (exactly one, else the build fails)."""
    doc = DOCS[docname]
    hits = [ln for ln in doc.find(nid).lines() if key in ln]
    if len(hits) != 1:
        raise ValueError(f'{docname}/{nid}: key {key!r} matches {len(hits)} lines')
    return hits[0].replace(' | ', ' — ')


def quote(docname, nid, key, href=None):
    doc = DOCS[docname]
    top = _top_of(doc, nid)
    return {'h': t(line(docname, nid, key)),
            's': f'{t(DOC_NAME[docname])} · {t(strip_colon(top.title))}',
            'u': href or link_for(nid)}


def hint(docname, nid, phrase):
    doc = DOCS[docname]
    assert any(phrase in ln for ln in doc.find(nid).lines()), (nid, phrase)
    top = _top_of(doc, nid)
    return {'h': f'اقرأ في «{t(strip_colon(top.title))}» ما يخص «{t(phrase)}»', 'u': link_for(nid), 's': t(DOC_NAME[docname])}


# ------------------------------------------------------------------ meters (targets are the document's)
def meters():
    spec = [  # key, label, icon, target %, KPI number, colour token, short label (compact HUD)
        ('part', 'المشاركة', 'users', 80, 5, 'sky', 'المشاركة'),
        ('disc', 'الانضباط والتعاون', 'shield', 90, 2, 'leaf', 'الانضباط'),
        ('trust', 'ثقة الأسر', 'heart', 80, 3, 't7', 'ثقة الأسر'),
        ('fin', 'الاستدامة المالية', 'coins', 90, 7, 'sun', 'الاستدامة'),
        ('lead', 'روح القيادة', 'award', 100, 6, 't6', 'القيادة'),
    ]
    start = dict(part=34, disc=38, trust=40, fin=30, lead=24)
    out = []
    for k, label, icon, target, n, col, sh in spec:
        key = f'KPI {n} '
        out.append({'k': k, 'l': label, 'sh': sh, 'i': icon, 'tg': target, 'n': n, 'col': col, 's': start[k],
                    'kh': t(line('quran', 'kpis', key)), 'ku': f'quran.html#kpi{n}'})
    return out


# ------------------------------------------------------------------ scenarios
# choice = (label, effects[part,disc,trust,fin,lead], character's reaction, quality 2/1/0, extras)
# quality 2 = what the document prescribes, 1 = acceptable but costly, 0 = the trap.
SCN = [
    dict(id='sup', tag='إعداد القادة', c='t4', scene='crowd', mood='day', who=('نادر', 'مسؤول التسجيل في المحافظة'), look='man', top='t2', early=True,
         title='أربعون فريقاً وثلاثة مشرفين',
         text='سجّلت أربعون فريقاً جديداً في أسبوع واحد، وليس عندك إلا ثلاثة مشرفين. يسألك نادر: «من سيقود كل هذه الفرق؟»',
         ch=[('درّب طلاب الجامعة والثانوية ليقودوا فرق المراحل الأدنى، تحت إشراف موجّه إقليمي واحد لعدة فرق.', [8, 4, 3, 3, 14],
              'انطلقت الفرق الأربعون في أسبوعها الأول، وكل قائد شاب يتعلّم القيادة وهو يمارسها.', 2, {'lights': 'peer'}),
             ('وظّف مشرفين متفرغين جدداً لكل فريق.', [6, 3, 0, -12, -2],
              'الفرق تعمل، لكن ميزانية الموسم تتآكل وستضيق عند أول توسّع.', 1, {}),
             ('اقبل خمسة عشر فريقاً الآن وأجّل الباقين.', [-9, 0, -5, 2, -3],
              'هدأ الضغط، لكن عشرات الأسر تنتظر وتتساءل: لماذا لا نشارك؟', 0, {})],
         doc=[('platform', 's5', 'مواجهة ندرة المشرفين')], hint=('platform', 's5', 'منظومة إعداد القادة ورعايتهم')),

    dict(id='flood', tag='إدارة المخاطر', c='t5', scene='flood', mood='storm', who=('سلمى', 'قائدة فريق الصحة والبيئة'), look='girl', top='t5',
         title='الأمطار تقطع الطرق',
         text='أمطار غزيرة قطعت الطرق قبل اليوم الميداني الكبير، والفرق جاهزة ومتحمسة. تسألك سلمى: «هل نلغي كل شيء؟»',
         ch=[('حوّل النشاط فوراً إلى تحدٍّ رقمي تفاعلي عبر المنصة.', [7, 3, 3, 3, 5],
              'في ساعة واحدة صار اليوم الميداني تحدياً رقمياً، والفرق تتنافس من بيوتها بحماس.', 2, {}),
             ('أجّل اليوم الميداني إلى الشهر القادم.', [-7, -3, -2, 2, 0],
              'لا خطر على أحد، لكن الحماس بردَ وانفضّ بعض الأعضاء.', 1, {}),
             ('اترك الفرق تدبّر أمرها بنفسها.', [-12, -8, -6, 0, -3],
              'ضاع الأسبوع بلا نشاط، وبعض الفرق تساءلت أين الإدارة.', 0, {})],
         doc=[('platform', 's7', 'الأزمات والظروف الطارئة')], hint=('platform', 's7', 'خطة إدارة المخاطر')),

    dict(id='village', tag='إدارة المخاطر', c='t2', scene='village', mood='dusk', who=('الحاج عبد الله', 'وجيه قرية'), look='elder', top='t2', skin=2,
         title='قرية محافظة تريد لبناتها مكاناً',
         text='وجهاء قرية محافظة يريدون لبناتهم أن يشاركن، ويشترطون ما يناسب عاداتهم. يقول الحاج عبد الله: «ما الذي تضمنونه لنا؟»',
         ch=[('وفّر مشرفات إناثاً بالكامل وحدّد أوقاتاً تناسب الضوابط المجتمعية.', [8, 3, 8, 3, 5],
              'اطمأنّ الأهالي، وسجّلت القرية فرقاً من البنات خلال أيام.', 2, {}),
             ('اعتمد جدولاً مختلطاً واحداً لكل القرى بلا استثناء.', [3, -3, -10, 0, 0],
              'جاء بعضهن، لكن ثقة القرية اهتزّت وانسحبت أسر كثيرة.', 1, {}),
             ('تجاوز القرية وركّز على المدن الآن.', [-6, 0, -4, 0, 0],
              'بقيت القرية بلا نشاط، وانتشر انطباع أن المشروع لا يشبههم.', 0, {})],
         doc=[('platform', 's7', 'المناطق المحافظة')], hint=('platform', 's7', 'المناطق المحافظة')),

    dict(id='parents', tag='التسويق والترويج', c='t7', scene='parents', mood='day', who=('أم ريم', 'ولية أمر'), look='woman', top='t7', early=True,
         title='«هل سيزيد التطبيق وقت الشاشات؟»',
         text='تتوالى رسائل القلق في مجموعات الأهالي، وتقول أم ريم: «ابنتي تجلس أمام الجوال أصلاً، فهل ستزيدون الطين بلة؟»',
         ch=[('أرسل رسائل طمأنة عبر مجالس الأمناء ومجموعات التواصل تُبرز الأثر التربوي وتقليل أوقات الشاشات.', [3, 2, 10, 3, 0],
              'هدأت المجموعات، وبدأ الأهالي يرون في التطبيق وسيلة لا عدواً.', 2, {}),
             ('اشترِ إعلانات مدفوعة مكثفة تعلو على الأصوات القلقة.', [5, 0, -3, -8, 0],
              'ارتفع عدد المسجلين قليلاً، لكن القلق لم يُجَب عنه، والإنفاق كبير.', 1, {}),
             ('تجاهل الرسائل، فالنتائج ستتكلم لاحقاً.', [-3, 0, -9, 0, 0],
              'تضخّم القلق في غيابك، وتحدّث أحدهم عن «تطبيق يسرق وقت أبنائنا».', 0, {})],
         doc=[('platform', 's4', 'توجيه رسائل طمأنة')], hint=('platform', 's4', 'الأسرة وأولياء الأمور')),

    dict(id='photo', tag='الحماية القانونية', c='t6', scene='photo', mood='day', who=('ليث', 'المسؤول الإعلامي في فريق'), look='boy', top='t6', trig=True,
         title='صور الأطفال ووجوههم',
         text='رفع الفريق صور التحدي، وفيها وجوه أطفال واضحة، ويريد ليث نشرها كلها على الصفحة العامة: «التفاعل سيكون ممتازاً!»',
         ch=[('طبّق معايير صارمة لحماية بيانات الأطفال وصورهم وفق قوانين حماية البيانات الشخصية، وانشر ما تسمح به.', [2, 3, 8, 3, 4],
              'احتفظت الصور المرفوعة بقيمتها دون أن يُكشف وجه طفل بلا ضابط، وشعر الأهالي بالأمان.', 2, {}),
             ('احذف كل الصور وامنع الرفع نهائياً.', [-8, -3, 2, 0, -4],
              'لا خطر، لكن الفرق فقدت وسيلة توثيق إنجازها، وفتر حماس المسؤولين الإعلاميين.', 1, {}),
             ('انشرها كلها، فالتفاعل أهم.', [8, -2, -12, 0, 0],
              'قفز التفاعل في ليلة واحدة... وسيصلك ما يُقلق بعد أيام.', 0, {'follow': 'f_photo'})],
         doc=[('platform', 's7', 'حماية البيانات')], hint=('platform', 's7', 'حماية البيانات')),

    dict(id='f_photo', follow=True, tag='نتيجة قرارك', c='t3', scene='photo_alert', mood='alert', who=('أبو سليم', 'والد غاضب'), look='man', top='t3', skin=2,
         title='بلاغ بعد تسريب صورة',
         text='وصلك بلاغ: صورة طفل من التحدي انتشرت خارج المنصة، ووالده يقول بغضب: «لم يسألني أحد!»',
         ch=[('اعتذر فوراً، واسحب الصور، وفعّل معايير حماية بيانات الأطفال وفق القانون.', [-2, 3, 7, 3, 2],
              'خفّ غضب الأب حين رأى إجراءً حقيقياً، وبقيت الأسر تراقب عن كثب.', 2, {}),
             ('انتظر حتى تهدأ الضجة من تلقاء نفسها.', [-4, -2, -10, 0, 0],
              'لم تهدأ؛ تناقل الناس الواقعة ووُصف المشروع بالإهمال.', 1, {}),
             ('حمّل الفريق الذي رفع الصور كامل المسؤولية.', [-3, -6, -8, 0, -8],
              'تجمّد الفريق، وانسحب قادته الشباب خوفاً من اللوم.', 0, {})],
         doc=[('platform', 's7', 'حماية البيانات')], hint=('platform', 's7', 'حماية البيانات')),

    dict(id='money', tag='الحوكمة المالية', c='sun', scene='money', mood='day', who=('كريم', 'قائد فريق شاب'), look='boy', top='t3', trig=True,
         title='«سأحضر الفواتير لاحقاً»',
         text='يطلب كريم صرف مبلغ لمشروع في الحي، ويقول: «ثق بي، سأحضر الفواتير والتصوير بعد الانتهاء».',
         ch=[('اربط التسوية الرقمية بالفيديو أو الفواتير بإنجاز التحدي، عبر عهدة إلكترونية مسبقة الدفع.', [2, 4, 3, 12, 4],
              'نُفّذ المشروع وصُوّر وسُوّيت الفواتير في التطبيق، وصار كريم نموذجاً لغيره.', 2, {}),
             ('وافق هذه المرة فقط، فهو قائد موثوق.', [4, -4, -2, -8, 0],
              'تم المشروع، لكن بقيت الفواتير ناقصة وشاعت فكرة أن الاستثناءات ممكنة.', 0, {'follow': 'f_audit'}),
             ('اصرف نقداً بلا أوراق لتسريع العمل.', [6, -8, -5, -14, -3],
              'سار العمل بسرعة، لكن لا أثر مالياً يمكن تتبعه.', 0, {'follow': 'f_audit'})],
         doc=[('platform', 's6', 'الحوكمة المالية')], hint=('platform', 's6', 'الحوكمة المالية')),

    dict(id='f_audit', follow=True, tag='نتيجة قرارك', c='t3', scene='money_alert', mood='alert', who=('رنا', 'مراجعة الحسابات'), look='woman', top='t4',
         title='ثغرة في الحسابات',
         text='كشفت المراجعة مصروفات بلا فواتير في أحد الفرق، والمجلس الأعلى يسأل: «كيف صُرفت هذه المبالغ؟» تنظر إليك رنا بجدية.',
         ch=[('فعّل الربط الشرطي: لا تسوية للمصروفات إلا بالفيديو أو الفواتير، واعتمد العهدة الإلكترونية للمستويات الميدانية.', [0, 4, 3, 10, 2],
              'عادت الثقة بالأرقام، وصارت كل مصروفات الفرق مسجلة ومربوطة بإنجازها.', 2, {}),
             ('اعتبرها حادثة فردية وتجاوزها.', [0, -3, -4, -8, 0],
              'ستتكرر الثغرة ما دامت القاعدة غائبة، والمجلس لاحظ ذلك.', 1, {}),
             ('اطلب من الفرق دفع الفرق من جيوبها.', [-8, -4, -9, 4, -4],
              'استعادت الميزانية جزءاً من مالها، وخسر المشروع ثقة الأسر والشباب.', 0, {})],
         doc=[('platform', 's6', 'الحوكمة المالية')], hint=('platform', 's6', 'الحوكمة المالية')),

    dict(id='centre', tag='التكامل بلا تكرار', c='t3', scene='centre', mood='day', who=('جابر', 'مدير مركز شباب'), look='man', top='t3', skin=2, early=True,
         title='مركز الشباب يخشى المنافسة',
         text='يقول جابر بقلق: «مشروعكم سيسحب روّاد مركزنا ويكرر ما نفعله منذ سنوات، فلماذا نتعاون؟»',
         ch=[('اجعل المركز مستضيفاً ميدانياً للألعاب والتحديات، فيزيد إقباله ونشاطه.', [8, 3, 3, 6, 2],
              'امتلأ المركز بالفرق في المساء، وصار جابر أول من يدافع عن المشروع.', 2, {}),
             ('أنشئ مقرات خاصة بالمشروع تنافس المراكز القائمة.', [3, -4, -2, -10, 0],
              'انتقل بعض الشباب، لكن الميزانية استنزفت وتوترت العلاقة مع المراكز.', 0, {}),
             ('تجاهل اعتراضه ومضِ في خطتك.', [-4, -3, -2, 0, 0],
              'بقيت الفعاليات بعيدة عن المركز، وتشكّل معسكر منتقدين.', 1, {})],
         doc=[('platform', 's8', 'مراكز الشباب والأندية')], hint=('platform', 's8', 'منصة استيعابية وتكاملية')),

    dict(id='assoc', tag='التكامل بلا تكرار', c='t7', scene='assoc', mood='day', who=('منى', 'متطوعة في جمعية'), look='woman', top='t7', early=True,
         title='جمعية تعرض مشروعها',
         text='تعرض منى مشروع جمعيتها لتوزيع سلال غذائية على أسر متعففة، وتقول: «ينقصنا شباب ينفّذون».',
         ch=[('أدرج مشروعها تحدياً ميدانياً تنفّذه فرق المشروع.', [7, 4, 5, 5, 4],
              'تنافست الفرق على تنفيذ المشروع، وحصلت الجمعية على طاقات شابة بلا مقابل.', 2, {}),
             ('اعتذر، فمشروعكم لا شأن له بالجمعيات.', [-4, 0, -2, 0, 0],
              'ضاعت فرصة تجمع التنفيذ الشبابي بحاجة حقيقية.', 1, {}),
             ('اقبل بشرط أن تدير الجمعية الفرق وتموّلها كلها.', [3, -4, -3, 4, -6],
              'صار الفريق تابعاً لجهة واحدة وضاع استقلال قراره.', 0, {})],
         doc=[('platform', 's8', 'الجمعيات التطوعية')], hint=('platform', 's8', 'الجمعيات التطوعية')),

    dict(id='party', tag='الحياد الوطني', c='t4', scene='party', mood='dusk', who=('سامر', 'مشرف شاب'), look='boy', top='t4',
         title='منشورات حزبية في الفريق',
         text='لاحظ سامر شخصاً يوزع منشورات حزبية على أعضاء فريق ويدعوهم إلى اجتماع سياسي، ويسألك: «هل نتركهم؟»',
         ch=[('طبّق الحظر التام لأي نشاط حزبي داخل الفرق لضمان الوطنية والحياد التربوي.', [0, 7, 8, 3, 4],
              'اطمأنّ الأهالي من كل التوجهات إلى أن الفريق مكان آمن للجميع.', 2, {}),
             ('اسمح بصمت ما دام لا يزعج أحداً.', [2, -8, -12, 0, -3],
              'انقسم الفريق إلى معسكرين وغادرت أسر عديدة.', 0, {}),
             ('فاوضه: يدعم الفرق مقابل حضوره.', [4, -6, -10, 5, -5],
              'وصل دعمٌ سريع، لكن بثمن الحياد الذي يقوم عليه المشروع.', 0, {})],
         doc=[('platform', 's8', 'الأحزاب والسياسة')], hint=('platform', 's8', 'الأحزاب والسياسة')),

    dict(id='csr', tag='الحوكمة المالية', c='sun', scene='csr', mood='day', who=('فيصل', 'ممثل شركة اتصالات'), look='official', top='t4',
         title='منحة سخية بشرط',
         text='تعرض شركة اتصالات منحة سخية، ويقترح فيصل: «نكتب نحن محتوى التحديات ونضع إعلاناتنا بين الأسئلة».',
         ch=[('اقبلها شراكةَ مسؤولية مجتمعية، وتُعلن الشركة شريكاً في بناء القيم دون أن تتحكم بمحتوى التحديات.', [3, 2, 3, 14, 0],
              'وصلت المنحة ورُفع اسم الشركة شريكاً، وبقي المحتوى بيد الفريق.', 2, {}),
             ('ارفض المنحة كلياً.', [-3, 0, 0, -12, 0],
              'بقيت الميزانية ضيقة وتأخّرت أنشطة كانت ستتحقق.', 1, {}),
             ('دَع الشركة تدير المحتوى مقابل المال.', [4, -6, -9, 10, -4],
              'تحول بعض التحديات إلى إعلانات، وشكّك الأهالي في الأهداف.', 0, {})],
         doc=[('platform', 's6', '30%'), ('quran', 'a9', 'الشراكات المجتمعية والمؤسسية')], hint=('platform', 's6', 'مصادر التمويل')),

    dict(id='border', tag='الشمول والعدالة المكانية', c='t1', scene='border', mood='dusk', who=('سالم', 'معلم من محافظة حدودية'), look='man', top='t1', skin=2,
         title='محافظة حدودية لم يصلها أحد',
         text='يتصل بك سالم من محافظة حدودية بعيدة: «هل المشروع للعواصم فقط؟ أولادنا ينتظرون منذ شهور».',
         ch=[('أرسل قوافل متنقلة تصل المحافظات الحدودية والقرى والمناطق النائية.', [8, 3, 5, 0, 4],
              'وصلت القافلة وهتف الأولاد، وتحولت القرية إلى ساحة تحديات.', 2, {}),
             ('اكتفِ بعواصم المحافظات حالياً.', [3, 0, -6, 4, 0],
              'وفّرت الجهد والمال، وتعمّق الشعور بالتهميش في الأطراف.', 1, {}),
             ('انتظر حتى تتوفر ميزانية فائضة.', [-4, 0, -5, 2, 0],
              'مرّت الأشهر ولم تأتِ الميزانية الفائضة.', 0, {})],
         doc=[('platform', 's3', 'العدالة المكانية')], hint=('platform', 's3', 'العدالة المكانية والتوزيع الجغرافي')),

    dict(id='disability', tag='الشمول والدمج', c='t6', scene='disability', mood='day', who=('أ. هدى', 'معلمة'), look='woman', top='t6',
         title='طالبة لا تجد مكاناً',
         text='طالبة من ذوي الإعاقة الحركية تريد الانضمام، لكن فريقاً اعتذر لأن المكان غير مهيأ. تسألك أ. هدى: «ماذا أقول لها؟»',
         ch=[('خصّص مساراً مجهزاً لفرق تشمل ذوي الإعاقة لتعزيز الدمج وعدم التهميش.', [5, 5, 7, 1, 4],
              'انضمت إلى فريق مختلط في مسار مجهّز، وصارت قصتها مثلاً يُحتذى.', 2, {}),
             ('أنشئ فريقاً منفصلاً لذوي الإعاقة وحدهم.', [1, -3, -3, -2, 0],
              'وُجد مكان، لكن الفكرة الأصلية، أن يشارك الجميع معاً، ضاعت.', 1, {}),
             ('تجاهل الطلب، فالحالة فردية.', [-6, -5, -9, 0, -2],
              'انتشرت القصة وشعر الأهالي بأن المشروع لا يتسع للجميع.', 0, {})],
         doc=[('platform', 's3', 'دمج ذوي الاحتياجات الخاصة')], hint=('platform', 's3', 'دمج ذوي الاحتياجات الخاصة')),

    dict(id='isolation', tag='الدعم النفسي', c='t7', scene='isolation', mood='night', who=('أ. وفاء', 'معلمة'), look='woman', top='t1', trig=True,
         title='رامي لا يخرج من غرفته',
         text='انسحب رامي من الفريق، ويقضي لياليه أمام الشاشة. تقلق أ. وفاء: «أظنها عزلة شديدة وإدماناً رقمياً، فماذا نفعل؟»',
         ch=[('حوّل حالته إلى وحدة الاستشارات والسلوك: أخصائيون معتمدون وموديولات السلامة الرقمية.', [2, 3, 7, 2, 2],
              'بدأ رامي جلساته مع أخصائي، وعاد تدريجياً إلى فريقه.', 2, {}),
             ('عاقبه بحرمانه من الفريق والمسابقات.', [-4, -4, -6, 0, -3],
              'ازداد انعزالاً، وعتبت عليك أسرته.', 0, {'follow': 'f_isol'}),
             ('اتركه، فالأمر سيمرّ مع الوقت.', [-5, -3, -5, 0, 0],
              'مرّت الأسابيع وازداد بعده عن زملائه.', 0, {'follow': 'f_isol'})],
         doc=[('platform', 's3', 'وحدة الاستشارات والسلوك')], hint=('platform', 's3', 'وحدة الاستشارات والسلوك')),

    dict(id='f_isol', follow=True, tag='نتيجة قرارك', c='t3', scene='isolation_alert', mood='dusk', who=('أم رامي', 'والدة طالب'), look='woman', top='t7',
         title='الأسرة تسحب ابنها',
         text='تقول أم رامي بغضب: «لن أسمح له بالعودة!» وتحكي لجاراتها عن تجربتها السيئة مع المشروع.',
         ch=[('اعرض عليها وحدة الاستشارات والسلوك مع أخصائيين معتمدين وموديولات السلامة الرقمية.', [3, 3, 8, 3, 2],
              'استمعت إليك لأول مرة، ووافقت على جلسة تعريفية لابنها.', 2, {}),
             ('دعها، فكل أسرة حرة في قرارها.', [-3, -2, -8, 0, 0],
              'انتهت العلاقة، وتناقل الجيران الحكاية.', 1, {}),
             ('أرسل إليها إنذاراً رسمياً بغياب ابنها.', [-4, -4, -11, 0, 0],
              'اشتدّ الغضب وانتشر في مجموعات الأهالي.', 0, {})],
         doc=[('platform', 's3', 'وحدة الاستشارات والسلوك')], hint=('platform', 's3', 'وحدة الاستشارات والسلوك')),

    dict(id='burnout', tag='إعداد القادة', c='t2', scene='burnout', mood='dusk', who=('خالد', 'قائد فريق شاب'), look='boy', top='t2', skin=2, trig=True,
         title='القائد المتعب',
         text='يقود خالد ثلاثة فرق إلى جانب دراسته، ويقول بصوت منهك: «لم أعد أستطيع... لكنكم لا تجدون غيري».',
         ch=[('داور القيادة شهرياً بين الأعضاء، وضمّ القادة إلى برنامج إعداد وتأهيل قادة الفرق الموهوبين.', [2, 3, 2, 1, 17],
              'تناوب القادة على المهام، وتحمّس صف جديد من القادة الصغار.', 2, {'lights': 'peer'}),
             ('اعتمد عليه وحده، فهو الأفضل.', [4, -3, -2, 0, -10],
              'استمر الأداء أسبوعاً، ثم بدأت العلامات: تأخر وتعب ونفاد صبر.', 0, {'follow': 'f_burn'}),
             ('ألغِ دور القادة الشباب وعُد إلى المشرفين.', [-6, -2, 0, -9, -8],
              'ارتفعت التكلفة وخسرت المشروع روحه الشبابية.', 1, {})],
         doc=[('quran', 'a3', 'يداور هذا الدور شهرياً'), ('platform', 's5', 'برنامج إعداد وتأهيل قادة الفرق الموهوبين')], hint=('platform', 's5', 'منظومة إعداد القادة ورعايتهم')),

    dict(id='f_burn', follow=True, tag='نتيجة قرارك', c='t3', scene='burnout_alert', mood='alert', who=('هبة', 'عضوة في فريق'), look='girl', top='t3',
         title='القائد النجم ينسحب',
         text='انسحب خالد فجأة، وانهارت الفرق الثلاثة التي كان يقودها. تقول هبة: «لم نعرف ماذا نفعل بدونه».',
         ch=[('فعّل المداورة الشهرية وأعدّ صفاً ثانياً من القادة.', [3, 3, 3, 3, 12],
              'تسلّم قادة جدد ما كان يقوم به شخص واحد، ونجا الموسم.', 2, {'lights': 'peer'}),
             ('اطلب من خالد العودة فوراً.', [-3, -3, -3, 0, -6],
              'عاد منهكاً، وبقي أصل المشكلة دون حل.', 1, {}),
             ('ادمج الفرق الثلاثة في فريق واحد كبير.', [-8, -5, -3, 3, -4],
              'ضاعت روح الفرق الصغيرة التي تتنافس بشغف.', 0, {})],
         doc=[('quran', 'a7', 'تأهيل صف ثاني من القادة'), ('quran', 'a3', 'يداور هذا الدور شهرياً')], hint=('quran', 'a7', 'تأهيل صف ثاني من القادة')),

    dict(id='idea', tag='الابتكار والملكية الفكرية', c='t4', scene='idea', mood='day', who=('آدم', 'عضو فريق العلوم والتكنولوجيا'), look='boy', top='t4',
         title='فكرة تطبيق لامعة',
         text='ابتكر فريق آدم تطبيقاً لتنظيم القوافل، وتتصل جهة تعرض شراءه فوراً بمبلغ زهيد. يسأل آدم: «نبيع؟»',
         ch=[('احمِ حقوق الاختراع وانقل الفكرة إلى حاضنات الأعمال الوطنية.', [3, 2, 3, 6, 10],
              'سُجّلت الفكرة بحقوقها، ووجد الفريق من يرعاها ويطوّرها.', 2, {}),
             ('اتركها للفريق وحده بلا ترتيب.', [0, 0, -2, 0, -4],
              'حمل الفريق الفكرة وحده، ثم ضاع الحماس مع الأسابيع.', 1, {}),
             ('بِع الفكرة بسرعة واستفد من المال.', [0, -3, -6, 5, -8],
              'دخل المال سريعاً، وفقد الفريق ثمرة ابتكاره.', 0, {})],
         doc=[('platform', 's7', 'حاضنة الابتكار والملكية الفكرية')], hint=('platform', 's7', 'حاضنة الابتكار والملكية الفكرية')),

    dict(id='rivalry', tag='روح الفريق', c='t3', scene='rivalry', mood='dusk', who=('ماهر', 'مشرف رياضي'), look='man', top='t3',
         title='تعصّب بين منطقتين',
         text='بعد خسارة مباراة، تتبادل فرق منطقتين الشتائم في التعليقات، ويقول ماهر: «التعصب يشتعل... فماذا تقرّر؟»',
         ch=[('ابنِ مسار المنافسة حصراً على «روح الفريق» ضمن دوري وطني موحّد.', [5, 8, 4, 3, 4],
              'تحولت المنافسة إلى تحدي أفضل روح، وتبادل الفريقان الشكر.', 2, {}),
             ('تجاهل الأمر، فهي منافسة بريئة.', [-2, -8, -6, 0, 0],
              'اتسعت الدائرة وانضم إليها أعضاء من فرق أخرى.', 0, {}),
             ('امنع المباريات بين المنطقتين.', [-8, -2, -3, 0, 0],
              'هدأ النقاش وانطفأت حماسة المنافسة معه.', 1, {})],
         doc=[('platform', 's1', 'بناء مسارات منافسة')], hint=('platform', 's1', 'الهدف الاستراتيجي')),

    dict(id='scouts', tag='التكامل بلا تكرار', c='t2', scene='scouts', mood='dusk', who=('أبو علي', 'قائد كشفي قديم'), look='scout', top='t2', skin=2, early=True,
         title='قادة الكشافة يعرضون خبرتهم',
         text='يعرض أبو علي وزملاؤه خبرة سنوات في المعسكرات والانضباط الميداني، ويقول بعض موظفيك: «سيزاحموننا».',
         ch=[('استعن بقادة الكشافة مدربين وموجهين معتمدين.', [4, 4, 3, 3, 11],
              'اكتسبت الفرق انضباطاً ميدانياً، وانتشر الفكر الكشفي بين الشباب.', 2, {'lights': 'peer'}),
             ('تجاهل عرضهم.', [-2, 0, 0, 0, -3],
              'مرّت الخبرة من أمامك دون أن تستفيد منها.', 1, {}),
             ('استبدل بهم موجهين جدداً.', [-3, -2, -3, -8, -3],
              'كلّفك ذلك مالاً ووقتاً وخسرت من يعرف الميدان.', 0, {})],
         doc=[('platform', 's8', 'فرق الكشافة')], hint=('platform', 's8', 'فرق الكشافة')),

    dict(id='council', tag='قياس الأثر', c='t1', scene='council', mood='day', who=('ممثل المجلس الأعلى', 'مكتب المحافظ'), look='official', top='t1',
         title='المجلس الأعلى يطلب الأرقام',
         text='يطلب المجلس الأعلى بوضوح: «أثبتوا لنا أن المشروع يعمل، فبماذا ستجيبون؟»',
         ch=[('قدّم مؤشر الأثر: مؤشرات كمية، وبطاقة تقييم دورية يعبئها ولي الأمر والمعلم والمشرف.', [3, 3, 6, 8, 6],
              'رأى المجلس أرقاماً وسلوكاً، وأقرّ دعماً يسهّل عقبات الربط بين الجهات.', 2, {}),
             ('اعرض أرقاماً لامعة فقط: متابعون ولقطات حفلات.', [4, 0, -4, -6, 0],
              'أعجبتهم الصورة، لكن لم يجدوا شيئاً يُقاس.', 1, {}),
             ('أخفِ التفاصيل حتى تكتمل النتائج.', [-4, -2, -6, -8, 0],
              'قلّ دعم المجلس، وتأخرت قرارات تسهيل الربط.', 0, {})],
         doc=[('platform', 'impact', 'مؤشرات كمية'), ('platform', 'impact', 'مؤشرات كيفية وسلوكية')], hint=('platform', 's9', 'قياس الأثر')),

    dict(id='halqa', tag='فريق القرآن والقيم', c='t1', scene='halqa', mood='day', who=('أ. يوسف', 'معلم حلقة'), look='man', top='t1',
         title='ضعاف الحفظ يتأخرون',
         text='في حلقة أ. يوسف يتقدّم بعض الطلاب بسرعة ويتأخر آخرون، وبدأ الضعاف يشعرون بالحرج. يسألك: «كيف نُبقي الجميع معاً؟»',
         ch=[('طبّق نظام «الرفيق القرآني»: يرافق الطالب المتميز زميله في الحفظ والمراجعة.', [3, 7, 4, 3, 7],
              'ارتبط الطلاب بزمالة صادقة، وتحسّن الضعفاء بدعم رفاقهم.', 2, {}),
             ('اجمع الضعفاء في مجموعة منفصلة.', [-4, -4, -3, 0, 0],
              'صار التصنيف وصمة، وفقد المتميزون فرصة الأخوّة.', 1, {}),
             ('ارفع مقدار الحفظ على الجميع.', [-6, -6, -6, 0, -2],
              'ازداد التسرّب وقلّ الإتقان.', 0, {})],
         doc=[('quran', 'a3', 'الرفيق القرآني'), ('quran', 'kpis', 'KPI 8 ', 'quran.html#kpi8')], hint=('quran', 'a3', 'الرفيق القرآني')),
]

# ------------------------------------------------------------------ unlocks: a new tool every 3 weeks
UNLOCKS = [
    dict(id='app', week=3, icon='smartphone', name='التشغيل الرقمي الموحد',
         sub='تطبيق «ينابيع» يسجّل الفرق ويسند التحديات ويرصد النقاط', fx=[7, 3, 0, 0, 0], lights='teams',
         doc=('platform', 's5', 'التشغيل الرقمي الموحد')),
    dict(id='wallet', week=6, icon='coins', name='العهدة الإلكترونية المسبقة الدفع',
         sub='تمويل المستويات الميدانية مرتبط بتسوية رقمية للمصروفات', fx=[0, 2, 3, 7, 0], lights='wallet',
         doc=('platform', 's6', 'الحوكمة المالية')),
    dict(id='leaders', week=9, icon='award', name='برنامج إعداد القادة',
         sub='منح تدريبية ورعاية لقادة الفرق الموهوبين', fx=[0, 3, 0, 0, 10], lights='peer',
         doc=('platform', 's5', 'إطلاق "برنامج إعداد وتأهيل قادة الفرق الموهوبين"')),
    dict(id='impact', week=12, icon='chart', name='مؤشر قياس الأثر',
         sub='بطاقة تقييم المجلس الأعلى: كمية وكيفية', fx=[0, 0, 0, 0, 0], lights='impact',
         doc=('platform', 'impact', 'مؤشرات كمية')),
]

# score -> title (the invented ladder; the last title echoes «وسام ينابيع الوطن» of the document's year 3)
TITLES = [
    (0, 'مشرف مبتدئ', 'بدأت الرحلة، وما زالت أمامك قواعد كثيرة في الوثيقة تنتظر أن تُطبّقها.'),
    (45, 'منسّق ميداني', 'تعلّمت من الميدان، وبقيت فجوات بينك وبين أهداف الوثيقة.'),
    (60, 'موجّه واعد', 'قرارات جيدة كثيرة، وتحتاج مزيداً من الاتساق مع القواعد.'),
    (75, 'موجّه إقليمي', 'أدرت موسمك بوعي، واقتربت من أهداف الوثيقة في معظم المؤشرات.'),
    (88, 'قائد فرق ملهم', 'موسم قوي: معظم المؤشرات عند أهداف الوثيقة أو بجوارها.'),
    (96, 'قائد ينابيع الوطن', 'موسم نموذجي، مؤشراته عند أهداف الوثيقة أو قريبة منها. اللقب من لعبتنا نحن، ويستلهم «وسام ينابيع الوطن» الذي تذكره الوثيقة في العام الثالث.'),
]


def build_data():
    ms = meters()
    scns = []
    for i, s in enumerate(SCN):
        who = s['who']
        label = f'{who[0]}، {who[1]}: مشهد تخيلي لسيناريو «{s["title"]}»'
        sv = scene(s['id'], s['scene'], s['mood'], s['look'], s['top'], plain(label), s.get('skin', 1))
        docs = []
        for d in s['doc']:
            docs.append(quote(d[0], d[1], d[2], d[3] if len(d) > 3 else None))
        scns.append({
            'id': s['id'], 'follow': bool(s.get('follow')), 'trig': bool(s.get('trig')), 'early': bool(s.get('early')),
            'title': s['title'], 'tag': s['tag'], 'c': s['c'], 'mood': s['mood'], 'svg': sv,
            'who': {'n': who[0], 'r': who[1]}, 'text': t(s['text']),
            'ch': [{'l': t(c[0]), 'fx': c[1], 'say': t(c[2]), 'q': c[3], 'lights': c[4].get('lights', ''), 'follow': c[4].get('follow', '')} for c in s['ch']],
            'docs': docs, 'hint': hint(*s['hint']),
        })
    unl = []
    for u in UNLOCKS:
        d = quote(*u['doc'])
        unl.append({'id': u['id'], 'week': u['week'], 'icon': ic(u['icon']), 'name': t(u['name']), 'sub': t(u['sub']), 'fx': u['fx'], 'lights': u['lights'], 'doc': d})
    return {
        'v': 1, 'weeks': 12, 'keys': MK, 'meters': ms, 'scn': scns, 'unlocks': unl,
        'titles': [{'min': a, 't': b, 'd': c} for a, b, c in TITLES],
        'phase': quote('platform', 'phases', 'التأسيس (العام 1)'),
        'hintCost': 3,
        'icons': {n: ic(n) for n in ('arrow-left', 'check', 'x', 'alert', 'quote', 'lightbulb', 'star', 'repeat', 'printer', 'award', 'file-text',
                                     'sparkles', 'chart', 'users', 'shield', 'heart', 'coins', 'lock', 'target', 'image', 'map')},
        'flow': [t(line('platform', 's6', '60%')), t(line('platform', 's6', '30%')), t(line('platform', 's6', '10%'))],
    }


def meter_rows(ms):
    rows = ''
    for m in ms:
        rows += f'''
<li class="ss-m" data-m="{m['k']}" style="--mc:var(--{m['col']})">
  <span class="ss-m-ic" aria-hidden="true">{ic(m['i'])}</span>
  <div class="ss-m-b">
    <div class="ss-m-top"><b>{m['l']}</b><span class="ss-m-v"><output data-v>{m['s']}</output>%</span></div>
    <div class="ss-bar" role="progressbar" aria-label="{m['l']}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="{m['s']}">
      <i class="ss-fill" style="width:{m['s']}%"></i><i class="ss-ghost"></i><span class="ss-tick" style="inset-inline-start:{m['tg']}%"><em>{m['tg']}%</em></span>
    </div>
    <div class="ss-m-foot"><span>الهدف {m['tg']}%</span><a class="ss-kpi" href="{m['ku']}">KPI {m['n']}</a></div>
  </div>
  <span class="ss-pop" aria-hidden="true"></span>
</li>'''
    return rows


def hud(ms):
    cells = ''.join(
        f'<li class="ss-h" data-m="{m["k"]}" style="--mc:var(--{m["col"]})" title="{m["l"]} — الهدف {m["tg"]}%"><span class="ss-h-ic" aria-hidden="true">{ic(m["i"])}</span>'
        f'<span class="ss-h-n"><output data-v>{m["s"]}</output></span><span class="ss-h-l">{m["sh"]}</span>'
        f'<i class="ss-h-bar"><i class="ss-fill" style="width:{m["s"]}%"></i><span class="ss-tick" style="inset-inline-start:{m["tg"]}%"></span></i><span class="ss-pop" aria-hidden="true"></span></li>'
        for m in ms)
    return f'<ul class="ss-hud" aria-label="مؤشراتك الآن">{cells}</ul>'


def map_svg():
    cols = ['t1', 't2', 't3', 't4', 't5', 't6', 't7']
    team_x = [48 + i * 37 for i in range(7)]
    edges = [('council', 'guide', 160, 52, 160, 82)]
    parts = []
    # edges first (behind nodes)
    def edge(a, b, x1, y1, x2, y2, cls=''):
        parts.append(f'<path class="me {cls}" data-a="{a}" data-b="{b}" d="M{x1} {y1} L{x2} {y2}"/>')
    edge('council', 'guide', 160, 50, 160, 76)
    for px in (80, 160, 240):
        edge('guide', 'peer', 160, 100, px, 126)
    for i, x in enumerate(team_x):
        px = 80 if i < 2 else (160 if i < 5 else 240)
        edge('peer', 'teams', px, 150, x, 184)
    edge('council', 'impact', 112, 28, 62, 28, 'dash')
    edge('guide', 'wallet', 208, 88, 262, 88, 'dash')
    parts.append('<rect class="mn app" data-n="teams" x="22" y="172" width="276" height="50" rx="16"/>')
    for i, (x, c) in enumerate(zip(team_x, cols)):
        parts.append(f'<g class="mn tm" data-n="teams" style="--d:{i*70}ms"><circle cx="{x}" cy="198" r="13" style="fill:var(--{c})"/><circle cx="{x}" cy="198" r="5" fill="#fff" opacity=".85"/></g>')
    parts.append('<g class="mn" data-n="council"><rect x="112" y="8" width="96" height="40" rx="14"/><text x="160" y="33" text-anchor="middle">المجلس الأعلى</text></g>')
    parts.append('<g class="mn" data-n="guide"><rect x="112" y="76" width="96" height="40" rx="14"/><text x="160" y="101" text-anchor="middle">الموجّه الإقليمي</text></g>')
    for px in (80, 160, 240):
        parts.append(f'<g class="mn pr" data-n="peer"><circle cx="{px}" cy="138" r="16"/><path d="M{px-7} 142 q7 -14 14 0 M{px-3} 132 a3 3 0 1 0 .1 0" fill="none"/></g>')
    parts.append('<text class="cap" data-n="peer" x="160" y="167" text-anchor="middle">قادة الأقران</text>')
    parts.append('<g class="mn" data-n="impact"><circle cx="40" cy="28" r="20"/><path d="M28 28 q12 -14 24 0 q-12 14 -24 0 M40 28 h.01" fill="none"/></g>')
    parts.append('<g class="mn" data-n="wallet"><circle cx="284" cy="88" r="20"/><path d="M274 84 h20 M274 92 h20 M278 78 h12" fill="none"/></g>')
    parts.append('<text class="cap2" x="160" y="236" text-anchor="middle" data-n="teams">الفرق السبعة · تطبيق «ينابيع»</text>')
    return ('<svg class="ss-map" viewBox="0 0 320 244" role="img" aria-label="خريطة المنظومة: المجلس الأعلى ثم الموجّه الإقليمي ثم قادة الأقران ثم الفرق" focusable="false">'
            + ''.join(parts) + '</svg>')


def section():
    d = build_data()
    ms = d['meters']
    data = json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    tools = ''.join(
        f'<li class="ss-tool" data-tool="{u["id"]}"><span class="ss-tool-ic">{u["icon"]}</span><span class="ss-tool-t"><b>{u["name"]}</b>'
        f'<small>{"يُفتح في نهاية الأسبوع " + str(u["week"])}</small></span><span class="ss-tool-s" aria-hidden="true"></span></li>' for u in d['unlocks'])
    flow = ''.join(f'<li>{x}</li>' for x in d['flow'])
    return f'''
<div class="ss" id="season" data-ss>
  <header class="ss-head">
    <div class="ss-head-t"><h2>موسم القائد</h2><span class="ss-badge">لعبة تجريبية</span></div>
    <p class="ss-head-s">كن الموجّه الإقليمي لمحافظتك في العام الأول، وأدِر اثني عشر أسبوعاً من القرارات. القواعد والأهداف من الوثيقة، والسيناريوهات والأرقام التوضيحية من تصميمنا.</p>
    <button type="button" class="btn btn-ghost ss-new" data-ss-new hidden>{ic('repeat')}<span>ابدأ موسماً جديداً</span></button>
  </header>
  <noscript><p class="ss-nojs">تحتاج لعبة الموسم إلى تفعيل JavaScript لتعمل.</p></noscript>
  <div class="ss-grid">
    <div class="ss-main">
      <section class="ss-screen ss-start" data-screen="start" aria-labelledby="ss-start-h">
        <div class="ss-hero">
          <div class="ss-scene" data-mood="day">{hero_scene('hero')}</div>
          <div class="ss-hero-t">
            <span class="ss-chip">{ic('compass')}أنت الموجّه الإقليمي</span>
            <h3 id="ss-start-h">اثنا عشر أسبوعاً تصنع موسمك</h3>
            <p>كل أسبوع معضلة جديدة من قواعد المشروع. اختر، ثم اقرأ ما تقوله الوثيقة، وراقب المؤشرات الخمسة وهي تتحرك نحو أهدافها.</p>
          </div>
        </div>
        <ol class="ss-how">
          <li>{ic('target')}<b>اختر</b><span>ثلاثة قرارات لكل معضلة. أحدها يتبع الوثيقة.</span></li>
          <li>{ic('quote')}<b>اقرأ</b><span>بعد كل قرار بطاقة «الوثيقة تقول» بنصّها وبرابطها.</span></li>
          <li>{ic('sparkles')}<b>افتح الأدوات</b><span>كل ثلاثة أسابيع تُفتح أداة جديدة تضيء خريطة المنظومة.</span></li>
        </ol>
        <blockquote class="ss-phase"><span class="ss-phase-k">{ic('flag')}أنت في مرحلة</span><p data-stage></p><a data-stage-a href="#">اقرأها في الوثيقة</a></blockquote>
        <div class="btns ss-start-b"><button type="button" class="btn btn-primary" data-ss-start>{ic('flag')}<span>ابدأ الموسم</span></button></div>
        <p class="ss-fine">لعبة تجريبية: الأسماء والمواقف والآثار والأرقام الداخلية من تصميمنا لتجربة الفكرة، وليست وقائع عن المشروع.</p>
      </section>

      <section class="ss-screen ss-play" data-screen="play" hidden aria-label="أسبوع الموسم">
        {hud(ms)}
        <div class="ss-weeks" role="group" aria-label="أسابيع الموسم"><ol data-weeks></ol><span class="ss-wk" data-wk></span></div>
        <article class="ss-card" id="ss-card" tabindex="-1" aria-live="off"></article>
        <div class="ss-fb" id="ss-fb" hidden></div>
      </section>

      <section class="ss-screen ss-report" data-screen="report" hidden aria-label="تقرير الموسم"></section>
    </div>

    <aside class="ss-side" aria-label="لوحة المؤشرات والخريطة">
      <section class="ss-panel ss-meters" aria-labelledby="ss-meters-h">
        <h3 id="ss-meters-h">مؤشرات موسمك <small>تجريبية، ٠–١٠٠</small></h3>
        <ul>{meter_rows(ms)}</ul>
        <p class="ss-note">الخط الرأسي في كل مؤشر هو الهدف من الوثيقة. أقرب مؤشرات الوثيقة مذكور تحت كل مؤشر.</p>
      </section>
      <section class="ss-panel ss-mapbox" aria-labelledby="ss-map-h">
        <h3 id="ss-map-h">خريطة المنظومة</h3>
        {map_svg()}
        <ol class="ss-tools">{tools}</ol>
      </section>
      <section class="ss-panel ss-flow" aria-labelledby="ss-flow-h">
        <h3 id="ss-flow-h">تمويل الموسم <small>نسب الوثيقة</small></h3>
        <div class="ss-flow-bar" role="img" aria-label="شريط تمويل الموسم: ستون بالمئة وثلاثون بالمئة وعشرة بالمئة">
          <div class="seg s60"><i></i><b>60%</b></div><div class="seg s30"><i></i><b>30%</b></div><div class="seg s10"><i></i><b>10%</b></div>
          <span class="ss-flow-tick" style="inset-inline-start:90%"><em>90%</em></span>
        </div>
        <p class="ss-flow-cov">المغطّى من تكاليف الموسم: <b data-cov>30</b>% <span>(الهدف 90%، KPI 7)</span></p>
        <ul class="ss-flow-l">{flow}</ul>
      </section>
    </aside>
  </div>
  <div class="ss-unlock" hidden></div>
  <div class="sr-only" id="ss-live" aria-live="polite" role="status"></div>
  <script type="application/json" id="season-data">{data}</script>
</div>'''
