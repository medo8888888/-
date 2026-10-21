/* MANARA («منارة») — "Ask MANARA" knowledge base. DATA ONLY: js/chatbot.js reads window.MANARA_CHAT_KB and nothing else here runs.
   Every entry is bilingual (ar + en), names the pages that explain it (src: "see page" links), the project document it was written from (doc)
   and the follow-up questions to offer (f). Facts come from manara/docs/*.md and the pages (pitch Q&A, safety guide, rollout plan, build guide);
   nothing is invented, and tools/test-chatbot.mjs checks that every number in an answer is found in those sources.
   The chatbot is NOT a language model: it matches a question to these written answers. A question that matches nothing is answered with
   "I do not know", never with a guess. Contract: manara/docs/MANARA.md, section "Ask MANARA".
   Entry fields:  id · aud 'res' (resident) | 'jud' (judge/visitor) | 'both' · q {ar,en}: the question this entry answers (chip label, topic title)
                  s {ar:[],en:[]}: more ways to ask it · k {ar,en}: keywords "a, b c, d^2" (comma list, ^n = weight, a phrase = words in order, "!x" = counts against)
                  a {ar,en}: the answer (paragraphs after a blank line, "- " bullets, **bold**; {{tests.total|fallback}} is read from data/test-counts.js)
                  m {ar,en}: optional "more detail" · src: pages to cite · doc: where the facts come from · f: follow-up entry ids · c: 1 = add "confirm with the authority" */
window.MANARA_CHAT_KB = {
  version: 1,
  updated: '2026-10-21',

  /* page titles for the "see page" links (same wording as the navigation) */
  pages: {
    'index.html': { ar: 'الرئيسية', en: 'Home' },
    'control.html': { ar: 'غرفة التحكم', en: 'Control Room' },
    'mission.html': { ar: 'غرفة العمليات', en: 'Mission Control' },
    'detect.html': { ar: 'مختبر الأدلة', en: 'Evidence Lab' },
    'alert.html': { ar: 'هواتف السكان', en: 'Resident Phones' },
    'robot.html': { ar: 'مختبر الروبوت', en: 'Robot Lab' },
    'build.html': { ar: 'بناء النموذج', en: 'Build It' },
    'pitch.html': { ar: 'العرض التقديمي', en: 'Pitch' },
    'report.html': { ar: 'التقرير العلمي', en: 'Report' },
    'poster.html': { ar: 'لوحة العرض', en: 'Display Board' },
    'guide.html': { ar: 'دليل الأمان', en: 'Safety Guide' },
    'plan.html': { ar: 'خطة التطبيق', en: 'Rollout Plan' }
  },

  /* the two audiences: starter questions shown on an empty chat */
  starters: {
    res: ['res-fire', 'res-gas', 'res-flood', 'res-heat', 'res-help', 'res-alerts'],
    jud: ['jud-what', 'jud-pipeline', 'jud-drone-numbers', 'jud-detector', 'jud-sim-vs-real', 'jud-limits']
  },

  /* emergency override (read by the engine; matched on normalised words). strong = a plea for help, on its own is enough;
     hazard = a danger word: it counts when the message is urgent or very short, or (resident mode) is not a question about the project;
     solo = words that count when the message is only a few words long. */
  emerg: {
    strong: {
      en: ['help me', 'help us', 'send help', 'need help', 'we need help', 'save me', 'not breathing', 'unconscious', 'heart attack', 'cardiac arrest', 'choking', 'drowning', 'trapped', 'on fire', 'caught fire', 'is burning', 'are burning'],
      ar: ['نجدة', 'ساعدوني', 'ساعدني', 'الحقوني', 'انقذوني', 'أنقذني', 'استغاثة', 'لا يتنفس', 'فاقد الوعي', 'مغمى عليه', 'أزمة قلبية', 'سكتة قلبية', 'محاصرين', 'عالقين', 'الحقوا', 'يحترق', 'تحترق', 'احترق', 'شبّ حريق']
    },
    hazard: {
      en: ['fire', 'smoke', 'burning', 'flame', 'gas', 'gas leak', 'flood', 'flooding', 'flash flood', 'dust storm', 'sandstorm', 'heat stroke', 'heatstroke', 'carbon monoxide', 'ambulance', 'sos', 'emergency', 'collapsed', 'explosion', 'needs help', 'someone needs help'],
      ar: ['حريق', 'نار', 'دخان', 'لهب', 'غاز', 'سيل', 'سيول', 'فيضان', 'غرق', 'عاصفة', 'غبار', 'عجاج', 'ضربة شمس', 'إسعاف', 'طوارئ', 'انفجار', 'اختناق', 'يحتاج مساعدة', 'أول أكسيد الكربون']
    },
    solo: {
      en: ['help', 'fire', 'smoke', 'gas', 'flood', 'sos', 'ambulance', 'emergency'],
      ar: ['نجدة', 'حريق', 'نار', 'دخان', 'غاز', 'سيول', 'إسعاف', 'طوارئ', 'مساعدة']
    },
    urgent: {
      en: ['now', 'urgent', 'urgently', 'quickly', 'hurry', 'right now', 'there is', 'there s', 'theres', 'my house', 'my home', 'my flat', 'my apartment', 'my building', 'my kitchen', 'my car', 'my room', 'my office', 'our house', 'our building', 'i smell', 'i can smell', 'i see', 'we see', 'caught', 'burning', 'need'],
      ar: ['الآن', 'حالا', 'بسرعة', 'فورا', 'عاجل', 'عندي', 'عندنا', 'يوجد', 'موجود', 'فيه', 'بيتي', 'بيتنا', 'شقتي', 'مطبخي', 'عمارتنا', 'مبنانا', 'أشم', 'اشمّ', 'شميت', 'احترق', 'يحترق', 'تحترق', 'شب', 'محتاج', 'نحتاج', 'أرسلوا', 'اتصلوا']
    },
    info: {   /* a question about the project or a definition: not an emergency by itself */
      en: ['^what is', '^what are', '^what does', '^what do', '^how does', '^how do you', '^how accurate', '^how reliable', '^how fast', '^how many', '^how much', '^why does', '^why do', '^why is', '^define', '^explain', '^tell me about', '^who', '^where can i see', '^can i see', '^are you', '^do you', '^does it', '^does manara'],
      ar: ['^ما هو', '^ما هي', '^ما معنى', '^ما دقة', '^ماذا تفعل', '^كيف يعمل', '^كيف تعمل', '^كيف تكتشف', '^كيف يكتشف', '^اشرح', '^عرّف', '^هل', '^كم', '^لماذا', '^ليش', '^من هو', '^من هي']
    },
    system: {
      en: ['manara', 'detector', 'detection', 'sensor', 'sentinel', 'drone', 'robot', 'simulation', 'simulated', 'accuracy', 'algorithm', 'pipeline', 'dashboard', 'control room', 'prototype', 'project', 'hand off', 'handoff', 'dispatch', 'osm'],
      ar: ['منارة', 'كاشف', 'الكشف', 'مستشعر', 'حساس', 'حارس', 'مسيرة', 'مسيّرة', 'درون', 'روبوت', 'محاكاة', 'دقة', 'خوارزمية', 'مشروع', 'نموذج', 'غرفة التحكم', 'غرفة العمليات']
    }
  },

  /* words from outside the project's scope: an entry that does not itself mention them loses points when the question does */
  scopeOut: {
    en: ['exchange', 'gold', 'airplane', 'airplanes', 'moon', 'french', 'spanish', 'german', 'chinese', 'russian', 'dubai', 'abu dhabi', 'sharjah', 'saudi', 'riyadh', 'kuwait', 'bahrain', 'oman', 'egypt', 'london', 'paris', 'america', 'usa', 'france', 'germany', 'china', 'japan', 'weather', 'football', 'soccer', 'recipe', 'bitcoin', 'stock', 'movie', 'joke', 'poem', 'song', 'capital', 'president', 'prime minister', 'election', 'price of'],
    ar: ['صرف', 'ذهب', 'القمر', 'فرنسي', 'إسباني', 'ألماني', 'صيني', 'روسي', 'دبي', 'أبوظبي', 'الشارقة', 'السعودية', 'الرياض', 'الكويت', 'البحرين', 'مصر', 'لندن', 'باريس', 'أمريكا', 'فرنسا', 'ألمانيا', 'الصين', 'اليابان', 'الطقس', 'كرة القدم', 'وصفة', 'بيتكوين', 'أسهم', 'فيلم', 'نكتة', 'قصيدة', 'أغنية', 'عاصمة', 'رئيس', 'انتخابات', 'سعر']
  },

  /* synonyms: each group maps every variant to its first word (the question keeps both forms, so a keyword may use either) */
  syn: {
    en: [['fire', 'blaze', 'inferno', 'flames', 'ablaze', 'wildfire'], ['flood', 'inundation', 'deluge', 'floodwater', 'waterlogging'], ['help', 'assist', 'assistance', 'aid', 'rescue'],
         ['hurt', 'injured', 'wounded', 'injury'], ['phone', 'mobile', 'smartphone', 'cellphone', 'iphone', 'android'], ['cost', 'price', 'pricing', 'expensive', 'budget'],
         ['drone', 'uav', 'quadcopter', 'uas'], ['law', 'legislation', 'statute'], ['smell', 'odor', 'odour', 'scent', 'stink'], ['accuracy', 'precision', 'reliability', 'correctness'], ['lift', 'elevator'], ['weak', 'weakness', 'weaknesses'],
         ['wrong', 'mistake', 'error', 'incorrect'], ['alarm', 'siren', 'buzzer'], ['danger', 'hazard', 'threat'], ['fastest', 'quickest'], ['nearest', 'closest'], ['worker', 'labourer', 'laborer', 'employee']],
    ar: [['حريق', 'حرق', 'حرائق', 'النيران', 'نيران', 'لهيب', 'اشتعال'], ['مسيرة', 'درون', 'مسيرات'], ['هاتف', 'جوال', 'موبايل', 'تلفون', 'الجوال'], ['سعر', 'تكلفة', 'ثمن', 'كلفة', 'تكاليف'],
         ['خطر', 'خطير', 'خطورة'], ['عامل', 'عمال', 'موظف'], ['صفارة', 'انذار', 'جرس'], ['اصابة', 'اصيب', 'جريح', 'مصاب']]
  },

  entries: [

    /* ====================================================================== RESIDENTS ====================================================================== */

    { id: 'res-fire', aud: 'res',
      q: { ar: 'ماذا أفعل عند حريق أو دخان؟', en: 'What do I do in a fire or smoke?' },
      s: { ar: ['شب حريق في بيتنا ماذا أفعل', 'رأيت دخانا في المبنى', 'كيف أهرب من حريق'], en: ['there is a fire what should i do', 'i see smoke in the building', 'how do i escape a fire', 'fire safety'] },
      k: { ar: 'حريق^3, حرائق, دخان^3, نار, احتراق^2, يحترق^3, تحترق^3, احترق^3, لهب, شب حريق^2, اخلاء, هروب, مخرج, مخرج طوارئ, ماذا افعل عند حريق^2, انذار الدخان, الحريق, حريقه',
           en: 'fire^3, fires, smoke^3, lift^2, elevator^2, burning, flame, on fire, house fire, building fire, evacuate, evacuation, escape, fire exit, smoke alarm, what to do in a fire^2, caught fire, fire safety' },
      a: { ar: `اخرج فورًا واتصل بـ **999** من خارج المبنى، ولا تجمع أغراضك.
- ابقَ منخفضًا تحت الدخان، وأغلق الأبواب خلفك (إغلاق الأبواب يُبطئ الحريق).
- استعمل الدرج لا المصعد، وتوجّه إلى نقطة التجمّع المتفق عليها.
- أخبر 999 إن كان أحد ما زال في الداخل، ولا تعد إلى المبنى.
- إن حُوصرت: أغلق الباب، وسدّ الفتحات بقماش مبلّل، وأشِر من النافذة.

وعلى الجيران في اتجاه الريح أن يحتموا: يغلقون النوافذ ويُطفئون تكييف الهواء الذي يسحب هواءً من الخارج.`,
           en: `Get out now and call **999** from outside the building. Do not collect belongings.
- Stay low under the smoke and close doors behind you (closing doors slows the fire).
- Use the stairs, not the lift, and go to your agreed meeting point.
- Tell 999 if anyone is still inside, and do not go back in.
- If you are trapped: shut the door, seal the gaps with a wet cloth and signal from a window.

Neighbours downwind of a fire should shelter: close the windows and switch off fresh-air air-conditioning.` },
      src: ['guide.html#hazards', 'alert.html'], doc: 'docs/MANARA-HAZARDS.md §4; js/guide.js', f: ['res-fire-fight', 'res-alerts', 'res-fire-extra'], c: 1 },

    { id: 'res-fire-fight', aud: 'res',
      q: { ar: 'كيف أُطفئ الحريق؟', en: 'How do I put out a fire?' },
      s: { ar: ['شلون اطفي الحريق', 'كيف اطفي النار', 'هل أطفئ الحريق بنفسي', 'هل أستعمل الماء على النار'], en: ['how do i put out the fire', 'can i use water on a fire', 'should i fight the fire myself', 'how to extinguish a fire'] },
      k: { ar: 'اطفي^2, اطفاء^2, اطفئ^2, طفايه^2, اخماد, اخمد, شلون اطفي^3, اكافح الحريق, اطفي النار^2, اطفي الحريق^3, مكافحه',
           en: 'put out^3, extinguish^3, extinguisher^2, fight fire, fight a fire, hose, water on fire, stop the fire, kill the fire, fire fighting^2, firefighting' },
      a: { ar: `ليست لديّ تعليمات لإطفاء الحريق، ولن أخترع شيئًا. النصيحة التي لديّ: **اخرج واتصل بـ 999**.

إطفاء الحرائق عمل الدفاع المدني، ومنارة نفسها لا تطفئ الحرائق: هي تساعد الناس على الخروج وتتأكد أن الجميع خرجوا. وإن كان أحد ما زال في الداخل فأخبر 999، ولا تعد إلى المبنى.`,
           en: `I do not have instructions for fighting a fire, so I will not make any up. The advice I have is: **get out and call 999**.

Putting fires out is the work of Civil Defence, and MANARA does not fight fires either: it helps people get out and be counted. If anyone is still inside, tell 999 and do not go back in.` },
      src: ['guide.html#hazards'], doc: 'docs/MANARA-HAZARDS.md §4 (Civil Defence advice: evacuate and call 999)', f: ['res-fire', 'res-numbers', 'jud-what'] },

    { id: 'res-fire-extra', aud: 'res',
      q: { ar: 'ماذا أفعل إن حوصرت بالدخان؟', en: 'What if I am trapped by smoke?' },
      s: { ar: ['محاصر في الغرفة والدخان يدخل', 'الباب ساخن'], en: ['i am stuck in a room with smoke', 'the door is hot', 'stuck and cannot get out'] },
      k: { ar: 'حوصرت^2, محاصر^2, عالق^2, باب ساخن^2, اغلق الباب, قماش مبلل, اشر من النافذه, محبوس',
           en: 'trapped^2, stuck^2, hot door^2, shut the door, wet cloth, signal from a window, cannot get out, blocked exit' },
      a: { ar: `إن حُوصرت: أغلق الباب، وسدّ الفتحات بقماش مبلّل، وأشِر من النافذة، واتصل بـ **999** وأخبرهم أين أنت.

لا تلمس بابًا ساخنًا ولا تفتحه، ولا تختبئ تحت السرير أو في خزانة، ولا تستعمل المصعد.`,
           en: `If you are trapped: shut the door, seal the gaps with a wet cloth, signal from a window, and call **999** and tell them where you are.

Do not open a hot door, do not hide under a bed or in a cupboard, and do not use the lift.` },
      src: ['guide.html#hazards'], doc: 'js/guide.js (fire card); docs/MANARA-HAZARDS.md §4', f: ['res-fire', 'res-access', 'res-numbers'], c: 1 },

    { id: 'res-gas', aud: 'res',
      q: { ar: 'ماذا أفعل عند تسرّب غاز؟', en: 'What do I do in a gas leak?' },
      s: { ar: ['ريحة غاز في المطبخ', 'الغاز يسرب', 'أشم رائحة غاز', 'تسرب غاز في البيت'], en: ['i smell gas', 'gas is leaking', 'smell of gas in the kitchen', 'gas smell what to do', 'gass leek'] },
      k: { ar: 'غاز^2, تسرب غاز^3, يسرب^2, تسرب^2, ريحه غاز^3, رايحه غاز^3, اسطوانه, اسطوانه الغاز, غاز البترول, غاز الطبخ, اشم غاز^2, الغاز, سلندر',
           en: 'gas^2, gas leak^3, leak^2, leaking^2, smell gas^3, smell of gas^3, lpg^2, cylinder, gas cylinder, propane, cooking gas, h2s, methane, gass^2, leek' },
      a: { ar: `لا تشغّل أو تُطفئ أي مفتاح، ولا تُشعل أي لهب.
- افتح الأبواب والنوافذ إن كان ذلك آمنًا (نصيحة الدفاع المدني).
- لا تشغّل إضاءة ولا شفّاط هواء ولا أي مفتاح داخل المكان.
- أغلق أسطوانة الغاز إن وصلتَ إليها دون خطر.
- اخرج بالجميع وابتعد عن المبنى بعرض اتجاه الريح.
- اتصل بـ **999** من الخارج، لا من داخل منطقة التسرّب.

غاز البترول المسال أثقل من الهواء فيتجمّع في الأقبية والمصارف والأماكن المنخفضة، فابتعد عنها. وغياب الرائحة لا يعني الأمان.`,
           en: `Do not switch anything on or off, and use no flame.
- Open doors and windows if it is safe (Civil Defence advice).
- Do not use lights, an exhaust fan or any switch inside.
- Close the gas cylinder only if you can reach it without risk.
- Take everyone out and move away from the building, across the wind.
- Call **999** from outside, not from inside the leak area.

LPG is heavier than air and pools in cellars, drains and low ground, so keep away from them. No smell does not mean it is safe.` },
      src: ['guide.html#hazards', 'alert.html'], doc: 'docs/MANARA-HAZARDS.md §5; js/guide.js', f: ['res-co', 'res-numbers', 'res-alerts'], c: 1 },

    { id: 'res-co', aud: 'res',
      q: { ar: 'ماذا عن أول أكسيد الكربون؟', en: 'What about carbon monoxide (CO)?' },
      s: { ar: ['صداع ودوار في الغرفة', 'تسمم بأول أكسيد الكربون'], en: ['headache and dizzy at home', 'co poisoning'] },
      k: { ar: 'اول اكسيد الكربون^3, اكسيد الكربون^2, co^2, صداع^2, دوار^2, غثيان, بلا رائحه, بدون رائحه, تسمم',
           en: 'carbon monoxide^3, co^2, headache^2, dizziness^2, dizzy^2, nausea, no smell, odourless, odorless, poisoning' },
      a: { ar: `أول أكسيد الكربون بلا لون ولا رائحة، فلا تنتظر أن تشمّه. اخرج إلى الهواء النقي فورًا، واتصل بـ **999**، ولا تعد إلى الداخل.

من شعر بصداع أو دوار أو غثيان فليتنفّس هواءً نقيًا ويطلب مساعدة طبية. وحسّاسات الغاز الرخيصة عندنا مؤشر فقط، وليست جهاز كشف معتمدًا.`,
           en: `Carbon monoxide has no colour and no smell, so do not wait to smell it. Get fresh air at once, call **999** and do not go back inside.

Anyone with a headache, dizziness or nausea should get fresh air and medical help. The low-cost gas sensors in our prototype give an indication only; they are not a certified detector.` },
      src: ['guide.html#hazards'], doc: 'docs/MANARA-HAZARDS.md §5 (CO); js/guide.js', f: ['res-gas', 'res-numbers', 'jud-sensors-trust'], c: 1 },

    { id: 'res-flood', aud: 'res',
      q: { ar: 'ماذا أفعل عند سيول أو أمطار غزيرة؟', en: 'What do I do in a flood or heavy rain?' },
      s: { ar: ['الميه دخلت البيت', 'غرق الشارع بالمطر', 'سيول في الحي', 'ارتفع الماء'], en: ['water is rising', 'my street is flooding', 'flash flood what to do', 'heavy rain safety', 'flod'] },
      k: { ar: 'ماء دخل البيت^4, سيول^3, سيل^2, فيضان^2, امطار, مطر^2, امطار غزيره^2, الميه^2, المي, غرق^2, غمر, ارتفاع الماء^2, مرتفع, ارض مرتفعه, طابق علوي',
           en: 'water coming into^4, water in the house^4, into our house^3, flood^3, flooding^3, flash flood^3, flod^2, heavy rain^2, rain^2, water rising^2, waterlogged, higher ground^2, upper floor, drain, storm water, turn around' },
      a: { ar: `انتقل إلى طابق أعلى أو مكان مرتفع وابقَ هناك.
- ابتعد عن فتحات الصرف المكشوفة ومصادر الكهرباء.
- لا تمشِ ولا تسبح ولا تقد في مياه جارية، بل استدر.
- تجنّب الأنفاق والأماكن المنخفضة: غُمرت عدة أنفاق في أكتوبر 2018.
- إن دخل الماء المنزل وكان الوصول إلى الكهرباء الرئيسية آمنًا فأطفئها.
- اتبع تعليمات الإخلاء الرسمية ولا تعد حتى يُعلَن الأمان.

اتصل بـ **999** عند الخطر على الحياة. وللمشكلات الأخرى نشرت الأخبار أرقام البلدية (184) وأشغال (188) وكهرماء (991 عند انقطاع الكهرباء)؛ الأرقام قد تتغيّر، فأكِّدها مع الجهة المختصة.`,
           en: `Move to a higher floor or higher ground and stay there.
- Stay away from open drains and electrical sources.
- Do not walk, swim or drive through moving water: turn around.
- Avoid underpasses and low areas: several flooded in October 2018.
- If water enters the home and you can reach the mains safely, switch it off.
- Follow official evacuation instructions and do not go back until it is declared safe.

Call **999** when life is at risk. For other problems the news listed the Municipality (184), Ashghal (188) and Kahramaa (991 for a power cut). Numbers can change, so confirm them with the authority.` },
      src: ['guide.html#hazards', 'alert.html'], doc: 'docs/MANARA-HAZARDS.md §6; js/guide.js', f: ['res-flood-drive', 'res-numbers', 'res-alerts'], c: 1 },

    { id: 'res-flood-drive', aud: 'res',
      q: { ar: 'هل أقود عبر مياه السيول أو النفق؟', en: 'Can I drive through flood water or an underpass?' },
      s: { ar: ['أعبر النفق بالسيارة والماء فيه', 'قيادة السيارة في المطر'], en: ['can i drive through water', 'the underpass is flooded', 'driving in flood'] },
      k: { ar: 'قيادة في السيول^5, اقود^2, سياره^2, قيادة^2, نفق^3, انفاق^2, عبور^2, اعبر, مياه جاريه^2',
           en: 'driving in flood^5, drive in flood^5, drive^2, driving^2, car^2, underpass^4, tunnel^3, cross^2, moving water^2, vehicle' },
      a: { ar: `لا. لا تمشِ ولا تسبح ولا تقد في مياه جارية؛ استدر وخذ طريقًا آخر.

بحسب إرشاد هيئة الأرصاد الأمريكية (وليس قطر): نحو 15 سم (6 بوصات) من الماء الجاري قد تُسقط شخصًا، ونحو 30 سم (12 بوصة) قد تطفو بها سيارة. والنفق هو المكان الذي يتجمّع فيه الماء: غُمرت أنفاق في الدوحة بعد أمطار أكتوبر 2018.`,
           en: `No. Do not walk, swim or drive through moving water: turn around and take another road.

According to US National Weather Service guidance (not Qatar): about 15 cm (6 inches) of moving water can knock a person off their feet, and about 30 cm (12 inches) can float a car. The underpass is where water collects: several tunnels in Doha flooded after the October 2018 rain.` },
      src: ['guide.html#hazards'], doc: 'docs/MANARA-HAZARDS.md §6 (S55, S28)', f: ['res-flood', 'res-numbers', 'jud-hazards'], c: 1 },

    { id: 'res-dust', aud: 'res',
      q: { ar: 'ماذا أفعل في عاصفة غبار؟', en: 'What do I do in a dust storm?' },
      s: { ar: ['عجاج كثيف اليوم', 'غبار في الجو والربو'], en: ['dust storm coming', 'sandstorm what to do', 'asthma and dust'] },
      k: { ar: 'غبار^3, عاصفه غباريه^3, عاصفه رمليه^2, عجاج^3, طوز, تراب, ربو^2, كمامه^2, رؤيه ضعيفه, pm10',
           en: 'dust^3, dust storm^3, sandstorm^3, sand storm^3, haze, asthma^2, mask^2, poor visibility, pm10, dusty' },
      a: { ar: `ادخل مبنى مغلقًا وأغلق النوافذ والأبواب.
- إن اضطررت للخروج فغطِّ الأنف والفم بكمّامة أو قماش مبلّل واحمِ عينيك.
- أبقِ الأطفال وكبار السن ومرضى الربو والرئة في الداخل.
- اشرب الماء وخفّف الجهد البدني.
- لا تقد بسرعة إن كانت الرؤية ضعيفة؛ توقّف في مكان آمن بعيدًا عن الطريق.
- لا تفرك عينيك إن دخلهما الغبار؛ اغسلهما بماء نظيف.

اتصل بـ **999** إن صعُب التنفّس على أحد. وحدود جودة الهواء المعتمدة في قطر أكِّدها مع الجهة المختصة قبل الاعتماد على أي رقم.`,
           en: `Go into a closed building and close the windows and doors.
- If you must go out, cover your nose and mouth with a mask or damp cloth and protect your eyes.
- Keep children, older people and people with asthma or lung disease indoors.
- Drink water and reduce physical effort.
- Do not drive fast in poor visibility: stop somewhere safe, off the road.
- Do not rub dust-filled eyes; rinse them with clean water.

Call **999** if someone cannot breathe. Confirm the air-quality limits used in Qatar with the authority before relying on any number.` },
      src: ['guide.html#hazards', 'alert.html'], doc: 'docs/MANARA-HAZARDS.md §7; js/guide.js', f: ['res-numbers', 'res-alerts', 'jud-thresholds'], c: 1 },

    { id: 'res-heat', aud: 'res',
      q: { ar: 'ماذا أفعل في الحرّ الشديد؟', en: 'What do I do in extreme heat?' },
      s: { ar: ['الجو حار مرة', 'العمل في الشمس صيفا', 'متى يمنع العمل وقت الظهيرة'], en: ['it is very hot outside', 'working in the sun in summer', 'midday work ban', 'heat wave advice'] },
      k: { ar: 'الجو حار^4, حار مره^3, حر^3, حراره^2, حرارة شديده^2, الحر الشديد^3, اجهاد حراري^3, شمس, ظل, ماء, عمال^2, عامل, حظر العمل^3, منع العمل^3, ظهيره^3, wbgt^2, صيف',
           en: 'heat^3, hot^2, extreme heat^3, heat wave^2, heat stress^3, sun, shade, water, worker^2, workers^2, midday^3, work ban^3, wbgt^2, summer' },
      a: { ar: `ابقَ في الظل أو في مكان مبرَّد، واشرب الماء بانتظام.
- ارتدِ ملابس خفيفة فضفاضة، وبلّل جلدك.
- تفقّد كبار السن ومن يعيش وحده والأطفال والعمال.
- لا تترك طفلًا أو حيوانًا في سيارة متوقفة، ولو لدقائق.
- لا تعمل أو تتمرّن في الشمس وقت الظهيرة.

للعمال: ذكرت الأخبار حظر العمل في الهواء الطلق من 10:00 إلى 15:30 بين 1 يونيو و15 سبتمبر، ووجوب إيقاف كل عمل إذا تجاوزت قراءة WBGT المقيسة 32.1 °م. أكِّد الساعات والتواريخ الحالية مع الجهة المختصة. واتصل بـ **999** فورًا إن ظهر على أحدهم ارتباك أو إغماء.`,
           en: `Stay in shade or a cool place and drink water regularly.
- Wear light, loose clothes and dampen your skin.
- Check on older people, people living alone, children and workers.
- Never leave a child or animal in a parked car, even for minutes.
- Do not work or exercise in the midday sun.

For workers: the news reported a ban on outdoor work from 10:00 to 15:30 between 1 June and 15 September, and that all work must stop if the measured WBGT exceeds 32.1 °C. Confirm the current hours and dates with the authority. Call **999** at once if someone is confused or faints.` },
      src: ['guide.html#hazards', 'alert.html'], doc: 'docs/MANARA-HAZARDS.md §8; js/guide.js', f: ['res-heatstroke', 'jud-wbgt', 'res-numbers'], c: 1 },

    { id: 'res-heatstroke', aud: 'res',
      q: { ar: 'كيف أعرف ضربة الشمس وماذا أفعل؟', en: 'How do I spot heat stroke, and what do I do?' },
      s: { ar: ['شخص أُغمي عليه من الحر', 'جلد ساخن وارتباك'], en: ['someone fainted in the heat', 'hot skin and confusion', 'sunstroke'] },
      k: { ar: 'ضربه شمس^3, ضربه الشمس^3, اغماء^2, ارتباك^2, جلد ساخن^2, سقط من الحر, انهاك حراري',
           en: 'heat stroke^3, heatstroke^3, sunstroke^3, fainted^2, faint^2, confusion^2, hot skin^2, passed out, collapsed from heat' },
      a: { ar: `من العلامات: جلد ساخن وارتباك وإغماء. اتصل بـ **999**، وبرّد الجسم بسرعة (ماء أو مروحة أو ظل)، ولا تعطِ المصاب شيئًا يشربه، ولا سيما إن كان فاقد الوعي.

منارة لا تقيس حرارة جسم أي شخص ولا تشخّص ضربة الشمس. وصياغة الإسعاف الأولي هذه يجب مطابقتها مع إرشادات مؤسسة حمد الطبية والدفاع المدني قبل الاعتماد عليها.`,
           en: `Signs include hot skin, confusion and passing out. Call **999**, cool the body fast (water, a fan or shade), and give the person nothing to drink, especially if unconscious.

MANARA cannot measure anyone's body temperature and does not diagnose heat stroke. This first-aid wording should be checked against Hamad Medical Corporation and Civil Defence guidance before you rely on it.` },
      src: ['guide.html#hazards'], doc: 'docs/MANARA-HAZARDS.md §8–§9 (CDC wording); js/guide.js', f: ['res-help', 'res-heat', 'res-medical-limit'], c: 1 },

    { id: 'res-help', aud: 'res',
      q: { ar: 'شخص يحتاج مساعدة، ماذا أفعل؟', en: 'Someone needs help. What do I do?' },
      s: { ar: ['شخص سقط ولا يتحرك', 'أحتاج إسعافا', 'مريض في البيت'], en: ['someone collapsed', 'i need an ambulance', 'a person is hurt', 'sos'] },
      k: { ar: 'مساعده^2, يحتاج مساعده^3, نجده^2, اسعاف^3, ابي اسعاف^3, رجل سقط^3, استغاثه^2, سقط^2, مصاب^2, مريض, طوارئ^2, لا يتحرك, لا يستجيب',
           en: 'help^2, needs help^3, need help^3, ambulance^3, fell down^3, man fell^3, fall^2, sos^2, collapsed^2, hurt^2, injured^2, unconscious^2, emergency^2, medical emergency^2, person fell' },
      a: { ar: `تأكّد أن المكان آمن لك أولًا، ثم اتصل بـ **999** وقل أين أنت وما حدث.
- ابقَ مع المصاب وطمئنه، وراقب تنفّسه.
- إن لم يستجب ولا يتنفّس فاتبع تعليمات المُرسِل، وابدأ الإنعاش إن كنت مدرَّبًا.
- أرسل أحدًا ليفتح الباب للإسعاف ويُشير إلى الموقع.
- لا تترك المصاب وحده، ولا تُنهِ المكالمة قبل المُرسِل.

للمتصل الأصمّ قناة مخصصة هي 992 (أكِّدها مع الجهة). ومنارة لا تتصل بدلًا منك ولا تشخّص: هي نموذج تجريبي.`,
           en: `Check the place is safe for you first, then call **999** and say where you are and what happened.
- Stay with the person, reassure them and watch their breathing.
- If they do not respond and are not breathing, follow the dispatcher and start CPR if you are trained.
- Send someone to open the door for the ambulance and point to the spot.
- Do not leave the person alone, and do not end the call before the dispatcher.

A Deaf caller has a dedicated channel on 992 (confirm it with the authority). MANARA does not call for you and does not diagnose: it is a demo prototype.` },
      src: ['guide.html#hazards', 'alert.html'], doc: 'js/guide.js (help card); docs/MANARA-HAZARDS.md §9', f: ['res-medical-limit', 'res-numbers', 'res-checkin'], c: 1 },

    { id: 'res-medical-limit', aud: 'res',
      q: { ar: 'هل تعطيني نصيحة طبية؟', en: 'Can you give medical advice?' },
      s: { ar: ['كيف أعالج جرحا', 'ماذا أفعل لمريض السكري', 'كيف أوقف النزيف'], en: ['how do i treat a wound', 'what should i take for pain', 'how do i stop bleeding', 'cpr steps'] },
      k: { ar: 'طبي^2, نصيحه طبيه^3, دواء^2, علاج^2, طبيب^2, جرح^2, نزيف^2, كسر^2, سكري^2, اعراض^2, انعاش^2, حبوب, مرض',
           en: 'medical^2, medical advice^3, medicine^2, doctor^2, treat^2, treatment^2, cure, symptom^2, bleeding^2, wound^2, bandage, fracture^2, diabetes^2, pain^2, cpr^2, pills, illness' },
      a: { ar: `لا. منارة ليست جهازًا طبيًا ولا أقدّم نصائح علاجية. في الحالة الطبية الطارئة اتصل بـ **999** (خدمة الإسعاف ترسل سيارات الإسعاف) واتبع تعليمات المُرسِل.

الإسعاف الأولي الوحيد في ملاحظاتي هو خطوات ضربة الشمس، وهي بحاجة إلى مطابقة مع الجهات الصحية.`,
           en: `No. MANARA is not a medical device and I do not give treatment advice. In a medical emergency call **999** (the ambulance service dispatches ambulances) and follow the dispatcher's instructions.

The only first-aid wording in my notes is the heat-stroke steps, and those need checking against the health authorities.` },
      src: ['guide.html#hazards'], doc: 'docs/MANARA-HAZARDS.md §9 (not a medical device)', f: ['res-help', 'res-heatstroke', 'res-numbers'], c: 1 },

    { id: 'res-alerts', aud: 'res',
      q: { ar: 'كيف تصلني التنبيهات؟', en: 'How do alerts reach me?' },
      s: { ar: ['كيف أعرف أن هناك خطرا', 'كيف ينبهني التطبيق', 'متى يصلني الإنذار'], en: ['how will i be warned', 'how do i get the warning', 'will i get a notification'] },
      k: { ar: 'اعرف ان في خطر^4, تنبيه^2, تنبيهات^2, انذار^2, اشعار, يصلني^3, كيف تصلني^3, هاتف^2, رساله^2, تحذير, صفاره, حارس, نبهني',
           en: 'know there is danger^4, how do i know^3, alert^2, alerts^2, warning^2, warn^2, notification, reach me^3, phone^2, message^2, siren, guard, how will i be warned^3, notify' },
      a: { ar: `في التصميم يكون التنبيه موجَّهًا وشخصيًا:
- **موجَّه:** للمبنى أو الكتلة السكنية لا للمدينة كلها.
- **شخصي:** بلغتك وبصيغة تناسبك: صوت أو اهتزاز أو نص أو بطاقة مصورة، وصوت للمكفوفين، ووميض اختياري للصمّ.
- **سلّم الإيقاظ الليلي:** رسالة عند اللحظة صفر ثم تتكرر بعد 30 و60 و90 ثانية حتى تؤكد أنك مستيقظ.
- **ليس الهاتف وحده:** صفّارة المبنى وأسهم المخارج والحارس، ولجهاز المعلمة للتلاميذ.

لا يخرج أي تنبيه عام قبل أن يتفق مفتاحان مستقلان ويوافق إنسان. افتح صفحة «هواتف السكان» لتراه. وهذا عرض تجريبي: لا يصل أي تنبيه حقيقي إلى أحد.`,
           en: `In the design, the alert is targeted and personal:
- **Targeted:** the building or the block, not the whole city.
- **Personal:** your language and a format that suits you: sound, vibration, text, a picture card, voice for blind residents, an optional strobe for Deaf residents.
- **Night wake-up ladder:** a message at T+0, then again after 30, 60 and 90 seconds until you confirm you are awake.
- **Not only phones:** the building siren, exit arrows, the guard and, for pupils, the teacher's tablet.

Nothing public goes out until two independent keys agree and a human approves. Open Resident Phones to see it. This is a demo: no real alert is sent to anyone.` },
      src: ['alert.html', 'mission.html', 'guide.html'], doc: 'docs/MANARA-SPEC.md (Reach); docs/MANARA.md (wake-up ladder); pitch Q&A H4', f: ['res-wake', 'res-nophone', 'res-languages'] },

    { id: 'res-wake', aud: 'res',
      q: { ar: 'كيف توقظني منارة وأنا نائم؟', en: 'How does MANARA wake me at night?' },
      s: { ar: ['ماذا لو لم أسمع الإنذار', 'نوم ثقيل', 'ما صوت التنبيه'], en: ['what if i sleep through the alarm', 'a heavy sleeper', 'what sound does the alert make', 'wake up ladder'] },
      k: { ar: 'نائم^3, لم اسمع^3, ما اسمع^3, اسمع الانذار^3, نوم^2, ايقاظ^3, يوقظ^2, سلم الايقاظ^3, الليل^2, ليلا, صوت, نغمه, 520, اهتزاز^2',
           en: 'asleep^3, did not hear^3, cannot hear the alarm^3, sleep^2, sleeping^2, wake^3, wake up^3, waking^2, ladder^2, night^2, sound^2, tone^2, 520 hz^2, vibration^2, sleep through the alarm^3' },
      a: { ar: `في الليل تستعمل منارة «سلّم إيقاظ»: رسالة عند اللحظة صفر ثم تتكرر بعد 30 و60 و90 ثانية، ويتوقف السلّم عندما تؤكد أنك مستيقظ. وعند 60 ثانية تصل الحارسَ قائمة أولويات ليطرق الأبواب.

أما الصوت: ذكر بحث نشرته مؤسسة NFPA (2020) أن نغمة منخفضة التردد 520 هرتز بنمط ثلاث نبضات كانت الأكثر فاعلية لإيقاظ ضعاف السمع. ومكبرات الهواتف الصغيرة تعيد 520 هرتز بضعف، فنقرنها باهتزاز قوي ووميض اختياري للصمّ. ولا نقلّد نغمة الإنذار الوطني، فقد حذّرت وزارة الداخلية من عواقب قانونية.`,
           en: `At night MANARA uses a wake-up ladder: a message at T+0, then again after 30, 60 and 90 seconds, and the ladder stops when you confirm you are awake. At 60 seconds the guard gets a priority list and knocks on doors.

The sound: research reported by the NFPA (2020) found that a low-frequency 520 Hz tone in a three-pulse pattern was the most effective at waking hard-of-hearing people. Small phone speakers reproduce 520 Hz poorly, so we pair it with strong vibration and, for Deaf residents, an optional strobe. We never imitate the national alert tone: the Ministry of Interior warned of legal consequences.` },
      src: ['alert.html', 'guide.html'], doc: 'docs/MANARA-HAZARDS.md §3 (S56, S36); docs/MANARA.md; pitch Q&A H4', f: ['res-access', 'res-alerts', 'res-nophone'] },

    { id: 'res-nophone', aud: 'res',
      q: { ar: 'ماذا لو لا أملك هاتفًا؟', en: 'What if I have no phone?' },
      s: { ar: ['هاتفي مغلق', 'لا يوجد هاتف عندي', 'من ليس لديه هاتف'], en: ['my phone is off', 'i do not have a smartphone', 'people without phones'] },
      k: { ar: 'بدون هاتف^3, لا املك هاتف^3, لا هاتف^3, بلا هاتف^3, هاتفي مغلق^2, لا جوال, ليس عندي جوال',
           en: 'no phone^3, without a phone^3, without phone^3, phone is off^2, no smartphone^3, do not have a phone^3, offline check in' },
      a: { ar: `عدة طبقات لا تحتاج هاتفًا: صفّارة المبنى وأسهم المخارج الذكية، والحارس (يرسل له سلّم الإيقاظ قائمة أولويات بعد 60 ثانية ويطرق الأبواب)، وجهاز المعلمة للتلاميذ، ونقطة تسجيل الحضور دون إنترنت «MANARA-SAFE».

لم نقِس نسبة من تصلهم كل طبقة. وفي المحاكاة نسبة من لديهم صفحة الهاتف افتراض قابل للتعديل (85% افتراضيًا)، وهو افتراض لا قياس.`,
           en: `Several layers need no phone: the building siren and smart exit arrows, the guard (the wake-up ladder sends the guard a priority list at 60 seconds and the guard knocks on doors), the teacher's tablet for pupils, and the offline check-in point MANARA-SAFE.

We have not measured what share of people each layer reaches. In the simulation the share who have the phone page is an adjustable assumption (85% by default), not a measurement.` },
      src: ['alert.html', 'build.html'], doc: 'pitch Q&A H4; docs/MANARA-SPEC.md (Count)', f: ['res-checkin', 'res-wake', 'res-children'] },

    { id: 'res-languages', aud: 'res',
      q: { ar: 'بأي لغات تصلني الرسائل؟', en: 'Which languages do the messages use?' },
      s: { ar: ['هل توجد رسائل بالمالايالامية', 'اللغات المدعومة', 'لغة العمال'], en: ['do you support malayalam', 'what languages are supported', 'languages for workers', 'is it translated'] },
      k: { ar: 'لغه^3, لغات^3, ترجمه^3, عربي, انجليزي, مالايالام^3, نيبال^3, بنغال^3, اردو^3, تاغالوغ^3, هندي^3, نسخه^2, سنهال, تاميل, عامل اجنبي',
           en: 'language^3, languages^3, translation^3, translated^2, translate^2, arabic, english, malayalam^3, nepali^3, bengali^3, urdu^3, tagalog^3, hindi^3, version^2, sinhala, tamil, sinhalese' },
      a: { ar: `العربية والإنجليزية كاملتان. أما اللغات الست (المالايالامية والنيبالية والبنغالية والأردية والتاغالوغية والهندية) فمسودات مكتوب عليها «تحتاج مراجعة متحدث أصلي» حتى يوقّع عليها مراجع.

اخترناها لأن أكبر الجاليات بحسب تقديرات السفارات 2015–2017 (وليست أرقامًا رسمية) من الهند ونيبال وبنغلاديش والفلبين وباكستان؛ وجالية سريلانكا (السنهالية والتاميلية) خارج المجموعة حاليًا. والبطاقات المصورة تحمل الرسالة الأساسية للجميع، ولا نستخدم ترجمة آلية حيّة أبدًا.`,
           en: `Arabic and English are complete. The six community languages (Malayalam, Nepali, Bengali, Urdu, Tagalog and Hindi) are drafts marked "needs native-speaker review" until a reviewer signs off.

We chose them because the largest communities in the 2015–2017 embassy estimates (not official figures) come from India, Nepal, Bangladesh, the Philippines and Pakistan; the Sri Lankan community (Sinhala and Tamil) is not covered yet. Picture cards carry the core message for everyone, and we never use live machine translation.` },
      src: ['alert.html', 'report.html'], doc: 'pitch Q&A H5; docs/MANARA-HAZARDS.md §3', f: ['res-access', 'res-alerts', 'jud-limits'] },

    { id: 'res-access', aud: 'res',
      q: { ar: 'ماذا عن الصمّ والمكفوفين ومستخدمي الكراسي المتحركة؟', en: 'What about Deaf, blind and wheelchair users?' },
      s: { ar: ['رسائل للصم', 'للمكفوفين رسالة صوتية', 'كرسي متحرك وإرشاد الخروج', 'كبار السن'], en: ['messages for deaf residents', 'voice message for blind people', 'wheelchair and stairs', 'elderly residents', 'disabled'] },
      k: { ar: 'يعرف المخرج^3, اصم^3, صم^3, مكفوف^3, كفيف^3, ضرير, اعاقه^2, كرسي متحرك^3, مقعد متحرك^3, عكاز, كبار السن^2, مسن^2, وميض^2, اهتزاز, بطاقه مصوره^2, حساسيه ضوئيه^2',
           en: 'deaf^3, blind^3, wheelchair^3, disabled^2, disability^2, mobility^2, elderly^2, older people^2, stairs^2, strobe^2, flashing^2, seizure^2, picture card^2, accessibility^2, hearing' },
      a: { ar: `- **الصمّ:** اهتزاز قوي ونص ورموز، مع وميض اختياري. الوميض مغلق افتراضيًا ومعه تحذير من الحساسية الضوئية، ولا يتجاوز ثلاث وميضات في الثانية (معيار WCAG 2.3.1).
- **المكفوفون:** رسالة صوتية بخطوات واضحة.
- **مستخدمو الكراسي المتحركة:** لا يُقال لهم أبدًا «استعمل الدرج»؛ توجّههم الرسالة إلى الشرفة الآمنة أو تطلب منهم البقاء، ويُرسَل موقعهم إلى الدفاع المدني (في المحاكاة).
- **الأطفال:** بطاقة مصورة و«اتبع معلمك».

وللصمّ قناة إلى غرفة العمليات عبر الرقم 992 (أكِّده مع الجهة). وخطتنا مراجعة هذه الرسائل مع صمّ ومكفوفين — مخطَّطة لم تتم.`,
           en: `- **Deaf residents:** strong vibration, text and pictograms, with an optional strobe. The strobe is off by default, comes with a photosensitivity warning and never flashes more than three times a second (WCAG 2.3.1).
- **Blind residents:** a voice message with clear steps.
- **Wheelchair users:** never told "use the stairs"; the message sends them to the refuge balcony or asks them to stay, and their location goes to Civil Defence (in the simulation).
- **Children:** a picture card and "follow your teacher".

Deaf callers also have a channel to the control room through 992 (confirm with the authority). We plan to review these messages with Deaf and blind users: planned, not done.` },
      src: ['alert.html', 'guide.html'], doc: 'pitch Q&A H6; docs/MANARA-HAZARDS.md §3; docs/MANARA-SPEC.md (personas)', f: ['res-languages', 'res-children', 'res-wake'], c: 1 },

    { id: 'res-children', aud: 'res',
      q: { ar: 'ماذا عن الأطفال في المدرسة؟', en: 'What about children at school?' },
      s: { ar: ['تلاميذ المدرسة والحريق', 'جهاز المعلمة'], en: ['pupils and fire drill', 'teacher tablet', 'kids at school'] },
      k: { ar: 'اطفال^3, طفل^3, تلاميذ^3, طلاب^2, مدرسه^3, معلم^2, معلمه^2, صف',
           en: 'children^3, child^3, kids^3, pupils^3, students^2, school^3, teacher^2, class, classroom' },
      a: { ar: `لا نعتمد على هاتف الطفل: يُحصى التلاميذ على جهاز المعلمة، وتخبرهم بطاقة مصورة بأن يتبعوا معلمهم، وتصل رسالة إلى هاتف الأم.

وأي تجربة مع تلاميذ حقيقيين تحتاج شراكة مع المدرسة وموافقة أولياء الأمور وموافقة الأخلاقيات؛ وكل ما في العرض افتراضي.`,
           en: `We do not rely on the child's phone: pupils are counted on the teacher's tablet, a picture card tells them to follow their teacher, and a message goes to the mother's phone.

Any trial with real pupils needs a school partnership, parental consent and ethics approval; everything in the demo is fictional.` },
      src: ['alert.html', 'mission.html'], doc: 'pitch Q&A H7', f: ['res-access', 'res-checkin', 'jud-human-tests'] },

    { id: 'res-privacy', aud: 'both',
      q: { ar: 'ماذا عن خصوصيتي؟ هل تتتبعونني؟', en: 'What about my privacy? Do you track me?' },
      s: { ar: ['هل تصورون الناس', 'من يرى بياناتي', 'هل تحفظون موقعي'], en: ['are you filming people', 'who sees my data', 'do you store my location', 'data protection'] },
      k: { ar: 'تسجلون^3, تسجلون موقعي^4, خصوصيه^3, خصوصيتي^3, تتبع^3, تتبعون^3, بيانات^2, موقعي^2, موقع^2, تصوير^2, تصورون^2, حمايه البيانات^3, سجل الاحتياجات, اسماء, كاميره^2',
           en: 'privacy^3, track^3, tracking^3, data^2, location^2, filming^2, filmed^2, camera^2, data protection^3, personal data^3, names^2, register^2, gdpr' },
      a: { ar: `منارة لا تتتبّعك.
- تسجيل الحضور يرسل رقم الغرفة والحالة (بخير / أحتاج مساعدة) فقط، دون أسماء.
- سجلّ الاحتياجات بالموافقة الطوعية، ويبقى على بوابة المبنى، ولا يُرسَل إلى الجهة المختصة إلا أثناء حادث موثَّق.
- لا نحفظ مواقع الهواتف ولا نرسلها إلى أي مكان. وبطاقة «أقرب المنشآت» الاختيارية في صفحة الهاتف لا تطلب موقعك إلا بموافقتك.
- حسّاس الحرارة 32×24 بكسل: يُظهر جسمًا دافئًا لكنه لا يعرّف وجهًا.
- النموذج الأولي بلا خادم ولا يرسل شيئًا إلى الإنترنت. وهذه المحادثة كذلك: رسائلك تبقى في ذاكرة هذه الصفحة فقط.

وفي مبنى حقيقي تحتاج أي كاميرا إلى موافقة المالك ولافتات ومراجعة قانونية، ولم نُجرِ ذلك بعد.`,
           en: `MANARA does not track you.
- Check-in sends a room number and a status (safe / I need help) only: no names.
- The needs register is opt-in, stays on the building gateway and goes to the authority only during a verified incident.
- We do not store phone locations or send them anywhere. The optional "nearby facilities" card on the phone page asks for your location only with your consent.
- The thermal sensor is 32×24 pixels: it shows a warm body but cannot identify a face.
- The prototype has no server and sends nothing to the internet. This chat is the same: your messages stay in this page's memory only.

In a real building any camera needs the owner's consent, signage and a legal review, and we have not done that yet.` },
      src: ['alert.html', 'report.html'], doc: 'pitch Q&A H1, H2, N8', f: ['res-drone-sees', 'jud-sim-vs-real', 'res-checkin'], c: 1 },

    { id: 'res-checkin', aud: 'res',
      q: { ar: 'كيف أسجّل أنني بخير؟', en: 'How do I check in as safe?' },
      s: { ar: ['زر أنا بخير', 'كيف يعرفون أنني خرجت', 'العدّ والإحصاء'], en: ['i am safe button', 'how do they know i got out', 'headcount', 'check in point'] },
      k: { ar: 'خرجت^3, كيف يعرفون اني خرجت^5, انا بخير^3, بخير^2, تسجيل الحضور^3, تسجيل^2, احتاج مساعده^2, عد^2, احصاء^2, حصر, نقطه التجمع^2, تجمع, MANARA-SAFE^3, نقطه تسجيل',
           en: 'i got out^4, know i got out^4, got out^3, how do they know^2, i am safe^3, safe^2, check in^3, checkin^3, check-in^3, headcount^3, head count^3, count^2, counted^2, assembly point^2, meeting point, manara safe^3, register' },
      a: { ar: `بعد التنبيه يمكنك الضغط على «أنا بخير» أو «أحتاج مساعدة» في صفحة الهاتف. يُرسَل رقم الغرفة والحالة فقط.

وهناك طرق أخرى للإحصاء: نقطة تسجيل الحضور دون إنترنت «MANARA-SAFE» (نقطة وايفاي تعمل بلا إنترنت)، وجهاز المعلمة، والحارس. وترى غرفة العمليات عدًّا حيًّا مقابل السجلّ: بخير، يحتاج مساعدة، غير محسوب. وكل السكان في العرض افتراضيون.`,
           en: `After an alert you can tap "I'm safe" or "I need help" on the phone page. It sends only a room number and a status.

Other ways to be counted: the offline check-in point MANARA-SAFE (a Wi-Fi access point that works without internet), the teacher's class tablet, or the guard. The control room sees a live headcount against the register: safe, needs help, unaccounted. Every resident in the demo is fictional.` },
      src: ['alert.html', 'mission.html'], doc: 'docs/MANARA-SPEC.md (Count); pitch Q&A H1, H4', f: ['jud-count', 'res-nophone', 'res-privacy'] },

    { id: 'res-numbers', aud: 'both',
      q: { ar: 'ما أرقام الطوارئ؟', en: 'What are the emergency numbers?' },
      s: { ar: ['رقم الدفاع المدني', 'رقم الإسعاف', 'رقم الطوارئ في قطر', 'رقم البلدية'], en: ['what is the civil defence number', 'ambulance number', 'emergency number in qatar', 'call 999', 'number for the municipality'] },
      k: { ar: 'رقم الاسعاف^5, رقم الدفاع المدني^5, رقم^3, ارقام^3, ارقام الطوارئ^3, الخط الساخن^2, 999^3, 992^2, 184, 188, 991, هاتف الطوارئ^2, اتصل^1',
           en: 'ambulance number^5, civil defence number^5, number^3, numbers^3, emergency number^3, hotline^2, helpline^2, 999^3, 992^2, 184, 188, 991, phone number^2, call^1, who do i call^2' },
      a: { ar: `**999** هو رقم الطوارئ في قطر، وهو من يرسل الفرق. وللمتصل الأصمّ قناة مخصصة لدى وزارة الداخلية على 992.

وفي الأمطار الغزيرة نشرت الأخبار أرقام البلدية (184) وأشغال (188) وكهرماء (991 عند انقطاع الكهرباء). الأرقام قد تتغيّر، فأكِّدها مع الجهة المختصة. ومنارة لا تتصل بـ 999 نيابةً عنك أبدًا.`,
           en: `**999** is Qatar's emergency number, and it is the one that dispatches crews. For Deaf callers the Ministry of Interior has a dedicated channel on 992.

In heavy rain the news listed the Municipality (184), Ashghal (188) and Kahramaa (991 for a power cut). Numbers can change, so confirm them with the authority. MANARA never calls 999 for you.` },
      src: ['guide.html#family', 'guide.html#hazards'], doc: 'docs/MANARA-HAZARDS.md §6, §9 (S71, S27); js/guide.js', f: ['res-help', 'res-fire', 'jud-dispatch'], c: 1 },

    { id: 'res-demo-status', aud: 'both',
      q: { ar: 'هل هذا نظام إنذار حقيقي؟', en: 'Is this a real alert system?' },
      s: { ar: ['هل ستتصل منارة بالدفاع المدني', 'هل يعمل في بيتي الآن', 'هل هو رسمي'], en: ['will manara call civil defence', 'can i use it in my home now', 'is it official', 'is this real'] },
      k: { ar: 'اعتمد عليه^4, اعتمد^3, تتصل منارة^4, ستتصل^4, حقيقي^3, رسمي^3, حقيقيه^2, يعمل في بيتي^2, يتصل بالدفاع المدني^2, معتمد^2, تجريبي^2, نموذج اولي^2, طلاب',
           en: 'rely on^4, rely^3, trust^2, real^3, official^3, certified^2, use it at home^2, call civil defence^2, prototype^2, demo^2, student project^2, is it real^3, actually work' },
      a: { ar: `لا. منارة نموذج أولي طلابي لمسابقة، ومحاكاة. ليست خدمة رسمية، وغير معتمدة، ولا تحلّ محل أي جهاز إنذار أو جهة، ولا ترسل تنبيهًا حقيقيًا إلى أحد.

ومنارة لا تتصل بـ 999 ولا بالدفاع المدني نيابةً عنك. عند الخطر اتصل دائمًا بـ **999** واتبع إرشادات الدفاع المدني.`,
           en: `No. MANARA is a student prototype for a competition, plus a simulation. It is not an official service, it is not certified, it replaces no alarm and no authority, and it sends no real alert to anyone.

MANARA does not call 999 or Civil Defence for you. In danger always call **999** and follow Civil Defence advice.` },
      src: ['guide.html', 'report.html'], doc: 'guide.html (footer note); docs/MANARA-SPEC.md; pitch Q&A W4, B9', f: ['res-numbers', 'jud-what', 'jud-limits'] },

    { id: 'res-false-alarm', aud: 'both',
      q: { ar: 'هل قد تُرسل إنذارات كاذبة؟', en: 'Could it send false alarms?' },
      s: { ar: ['إرهاق الإنذارات', 'ماذا لو أخطأ الحساس', 'إنذار خاطئ'], en: ['alert fatigue', 'what if the sensor is wrong', 'will people ignore alerts'] },
      k: { ar: 'انذار كاذب^3, انذارات كاذبه^3, كاذب^2, خاطئ^2, اخطاء^2, ارهاق الانذارات^3, تجاهل^2, خطا, !مسيره',
           en: 'false alarm^3, false alarms^3, false alert^3, false^2, wrong^2, alert fatigue^3, cry wolf^2, ignore alerts^2, mistake, !drone, !patrols' },
      a: { ar: `نعم، هذا خطر حقيقي. نخفّفه بثلاثة أمور: مفتاحان مستقلان وموافقة إنسان قبل أي تنبيه عام؛ ومناطق مستهدفة (المبنى أو الكتلة لا المدينة)؛ وثلاثة مستويات (مراقبة، احتماء، إخلاء) فتكون أغلب التنبيهات هادئة.

وداخل المبنى لا تنتظر الصفّارة المحلية وأسهم المخارج، كأي جهاز إنذار. أما ما لم نفعله فقياس معدل الإنذارات الكاذبة على مدى أسابيع في مبنى حقيقي.`,
           en: `Yes, it is a real risk. We reduce it three ways: two independent keys and a human before any public alert; targeted zones (the building or block, not the city); and three levels (watch, shelter, evacuate), so most alerts are calm.

Inside the building the local siren and exit arrows do not wait, like any fire alarm. What we have not done is measure the false-alarm rate over weeks in a real building.` },
      src: ['detect.html', 'mission.html'], doc: 'pitch Q&A P3, P6', f: ['jud-prove', 'jud-detector', 'jud-drone-false-alarms'] },

    { id: 'res-drone-sees', aud: 'both',
      q: { ar: 'ماذا ترى المسيّرة؟', en: 'What does the drone see?' },
      s: { ar: ['هل تصور المسيرة بيتي', 'كاميرا المسيرة والخصوصية', 'هل تتعرف على الوجوه'], en: ['does the drone film my home', 'drone camera and privacy', 'face recognition', 'what can the drone see'] },
      k: { ar: 'طائره بدون طيار^3, مسيره^2, درون^2, ماذا ترى^3, ترى^2, كاميره المسيره^3, وجوه^2, تعرف على الوجوه^3, تصوير, حراري^2',
           en: 'drone^2, drones^2, what does the drone see^3, see^2, drone camera^3, faces^2, face recognition^3, thermal^2, filming, aerial' },
      a: { ar: `في عرضنا لا يُصوَّر أحد: تغذية المسيّرة مشهد جوي **مولَّد بالحاسوب** وموسوم SIM. وفي نشر حقيقي تشغّلها جهة مرخَّصة.

تصميمنا يحدّ من الضرر: لا تُقلع المسيّرة إلا لإنذار أو لمسار دورية مكلَّف، وتبدأ بالمنظر الحراري، ولا نملك التعرّف على الوجوه، ولا يُحفظ تسجيل إلا بضغطة المشغّل، ومدة الحفظ قرار الجهة لا قرارنا. والكاميرا العادية لا ترى الغاز، والدخان الكثيف أو الغبار يحجبانها. ولم نُجرِ مراجعة قانونية.`,
           en: `In our demo nobody is filmed: the drone feed is an aerial scene **generated by the computer** and labelled SIM. In a real deployment a licensed agency would operate it.

Our design limits harm: the drone launches only for an alert or an assigned patrol route, starts with the thermal view, we have no face recognition, a recording is kept only when the operator presses record, and how long it is kept is the agency's decision, not ours. An ordinary camera does not show gas, and thick smoke or dust blinds it. We have done no legal review.` },
      src: ['control.html', 'detect.html', 'guide.html'], doc: 'pitch Q&A R5; js/guide.js (glossary); docs/MANARA.md (drone scene)', f: ['jud-aviation', 'res-privacy', 'jud-drone-numbers'], c: 1 },

    { id: 'res-earthquake', aud: 'both',
      q: { ar: 'ماذا عن الزلازل؟', en: 'What about earthquakes?' },
      s: { ar: ['هل في زلزال', 'هزة أرضية'], en: ['earthquake advice', 'tremor', 'seismic risk'] },
      k: { ar: 'زلزال^3, زلازل^3, هزه ارضيه^3, هزات^2, زلزله^3', en: 'earthquake^3, earthquakes^3, tremor^3, seismic^3, quake^3' },
      a: { ar: `ليس في منارة سيناريو للزلازل. وصفت إدارة الأرصاد قطر بأنها بلد منخفض الخطر للزلازل (2013)، فلم نبنِ له سيناريو. وليست لديّ نصائح للزلازل؛ عند الخطر اتصل بـ **999** واتبع تعليمات الدفاع المدني.`,
           en: `MANARA has no earthquake scenario. Qatar's Meteorology Department described Qatar as a low-risk country for earthquakes (2013), so we did not build one. I have no earthquake advice; in danger call **999** and follow Civil Defence instructions.` },
      src: ['pitch.html'], doc: 'pitch Q&A W8; docs/MANARA-HAZARDS.md §10', f: ['jud-hazards', 'res-numbers', 'confirm-authority'], c: 1 },

    /* ====================================================================== JUDGES AND VISITORS ====================================================================== */

    { id: 'jud-what', aud: 'jud',
      q: { ar: 'ما هي منارة؟', en: 'What is MANARA?' },
      s: { ar: ['عرّفني بالمشروع', 'ما فكرة المشروع', 'ما معنى منارة', 'ما المشكلة التي تحلها'], en: ['tell me about the project', 'what is the idea', 'what problem does it solve', 'what does manara mean', 'explain manara', 'wat is manra'] },
      k: { ar: 'منارة^3, مشروع^1, فكره^2, ما هي منارة^3, عرفني^2, مشكله, المئه متر^2, اخر مئه متر^3, نبذه',
           en: 'manara^3, manra^2, project^1, idea^2, what is manara^3, last 100 metres^3, last 100 meters^3, lighthouse^2, problem, overview^2, about the project^2, summary^2' },
      a: { ar: `منارة («المنارة» = Lighthouse) نموذج أولي طلابي لـ **«آخر مئة متر»** في أي طارئ: أن يستيقظ كل شخص قرب الخطر، ويفهم ماذا يفعل **لهذا الخطر** بلغته وبصيغته، ويسلك طريقًا آمنًا فعلًا الآن، ويُحصى؛ وأن يصل المساعدةُ بسرعة إلى من يحتاجها.

مسار واحد يغطي ستة أخطار: حريق ودخان، تسرّب غاز، سيول، عاصفة غبار، حرّ شديد، وشخص يحتاج مساعدة. ومنارة لا تكافح الحرائق ولا تحلّ محل 999 أو الدفاع المدني أو نظام الإنذار الوطني. شعارها: لا نائمَ يُنسى، ولا أحدَ يُترك خلفنا. وهي مفهوم بنموذج أولي محاكى، وليست منتجًا معتمدًا.`,
           en: `MANARA (Arabic «منارة», "lighthouse") is a student prototype for **the last 100 metres** of an emergency: making sure every person near a danger is woken, understands what to do **for this hazard** in their own language and format, takes a route that is really safe now, and is counted, and that anyone who needs help is reached fast.

One pipeline covers six hazards: fire and smoke, gas leak, flood, dust storm, extreme heat, and someone who needs help. MANARA does not fight fires and does not replace 999, Civil Defence or the national warning system. Its slogan: no one left asleep, no one left behind. It is a concept with a simulated prototype, not a certified product.` },
      src: ['index.html', 'pitch.html'], doc: 'docs/MANARA-SPEC.md (Identity, The problem)', f: ['jud-pipeline', 'jud-hazards', 'jud-different'] },

    { id: 'jud-pipeline', aud: 'jud',
      q: { ar: 'كيف تعمل منارة؟ (من الرصد إلى التسليم)', en: 'How does MANARA work? (Sense to Hand off)' },
      s: { ar: ['ما خطوات النظام', 'اشرح المسار', 'ما هي المراحل الست'], en: ['what are the steps', 'explain the pipeline', 'how does it work', 'six steps', 'sense prove reach guide count hand off'] },
      k: { ar: 'كيف تعمل^3, كيف يعمل^3, مسار^2, خطوات^2, مراحل^2, ارصد^2, اتحقق^2, ابلغ, ارشد, اعد, اسلم, بنيه, معماريه^2',
           en: 'how does it work^3, how it works^3, pipeline^3, steps^2, stages^2, sense^2, prove^2, reach^2, guide^2, count^2, hand off^2, architecture^2, workflow^2, flow' },
      a: { ar: `**أرصد ← أتحقق ← أُبلغ ← أُرشد ← أعُدّ ← أُسلّم**
1. **الرصد:** «حرّاس» ثابتة رخيصة (ESP32 مع بضعة حسّاسات) تراقب على مدار الساعة؛ وإنذارها المحلي لا ينتظر شبكة ولا مسيّرة ولا إنسانًا.
2. **التحقق:** مفتاحان مستقلان ثم «مفتاح الإنسان» (المشغّل يعتمد) قبل أي تنبيه عام.
3. **الإبلاغ:** مناطق موجَّهة ورسالة شخصية بلغة كل شخص وصيغته.
4. **الإرشاد:** مسار يحسب أن المخرج مفتوح فعلًا، ويُعاد فورًا عند تغيّر مخرج.
5. **العدّ:** «أنا بخير» و«أحتاج مساعدة» وعدّ حيّ مقابل السجلّ.
6. **التسليم:** بطاقة موثّقة للدفاع المدني والإسعاف مع توصية بأسرع وحدة.

النظام نفسه يخدم الأخطار الستة: منصة واحدة لا ستة أجهزة.`,
           en: `**Sense → Prove → Reach → Guide → Count → Hand off**
1. **Sense:** fixed, cheap "sentinels" (an ESP32 with a few sensors) watch 24/7; their local alarm never waits for a network, a drone or a person.
2. **Prove:** two independent keys, then the human key (an operator approves) before any public alert.
3. **Reach:** targeted zones and a personal message in each person's language and format.
4. **Guide:** a route that knows which exits are really open, and re-routes at once when an exit changes.
5. **Count:** "I'm safe" and "I need help", and a live headcount against the register.
6. **Hand off:** a verified card for Civil Defence and the ambulance service, with a fastest-unit recommendation.

The same code serves all six hazards: one platform, not six gadgets.` },
      src: ['index.html', 'mission.html', 'pitch.html'], doc: 'docs/MANARA-SPEC.md (One pipeline, six hazard playbooks)', f: ['jud-prove', 'jud-guide', 'jud-handoff'] },

    { id: 'jud-sense', aud: 'both',
      q: { ar: 'ما «الحارس» والمستشعرات التي يستعملها؟', en: 'What is the sentinel and which sensors does it use?' },
      s: { ar: ['ما الحساسات المستخدمة', 'ما هو الحارس', 'لوحة ESP32'], en: ['which sensors do you use', 'what is the sentinel', 'esp32 board', 'what hardware'] },
      k: { ar: 'الحارس^3, حارس^2, حساسات^3, مستشعرات^3, esp32^3, mlx90640^2, mq-2, حراري^2, كاميره حراريه^2, عتاد^2, لوحه, جهاز',
           en: 'sentinel^3, sensors^3, sensor^2, esp32^3, mlx90640^2, mq-2^2, thermal camera^2, hardware^2, board^2, device, components, parts' },
      a: { ar: `«الحارس» لوحة ESP32 رخيصة ثابتة مع مستشعرات قليلة: كاميرا حرارية MLX90640 بدقة 32×24 بكسل، ومستشعرات غاز من نوع MQ، ومستشعر حرارة ورطوبة، وللسيول مستشعر مسافة بالموجات فوق الصوتية، وللغبار PMS5003 (اختياري). وتراقب على مدار الساعة، وإنذارها المحلي لا ينتظر شبكة ولا مسيّرة ولا إنسانًا.

وهي قطع رخيصة لها حدود: مستشعرات MQ تتأثر بعدة غازات وتنجرف مع الحرارة والرطوبة، فنكتب «استرشادي» على قراءات ppm، ومنارة لا تحلّ محل جهاز إنذار أو كاشف غاز معتمد.`,
           en: `The sentinel is a cheap fixed ESP32 board with a few sensors: an MLX90640 thermal camera (32×24 pixels), MQ-type gas sensors, a temperature and humidity sensor, an ultrasonic distance sensor for flood depth and, optionally, a PMS5003 dust sensor. It watches 24/7, and its local alarm never waits for a network, a drone or a person.

These are cheap parts with real limits: MQ sensors respond to several gases and drift with temperature and humidity, so we label ppm values "indicative", and MANARA never replaces a certified fire alarm or gas detector.` },
      src: ['build.html', 'detect.html'], doc: 'docs/MANARA-HAZARDS.md §2, §4–§8; pitch Q&A P5', f: ['jud-sensors-trust', 'jud-prove', 'jud-offline'] },

    { id: 'jud-prove', aud: 'both',
      q: { ar: 'لماذا مفتاحان وموافقة إنسان؟ (الدليل قبل الذعر)', en: 'Why two keys and a human? (Proof before panic)' },
      s: { ar: ['من يقرر إرسال التنبيه', 'لماذا ننتظر الإنسان', 'مفتاح الإنسان'], en: ['who decides to alert', 'why wait for a human', 'what are the two keys', 'human approval'] },
      k: { ar: 'حساس واحد^4, مفتاحان^3, من يقرر^4, يقرر ارسال^4, مفتاح^2, الدليل قبل الذعر^3, اعتماد^2, موافقه^2, مشغل^2, تحقق^2, اتحقق, اشتباه^2, مؤكد^2',
           en: 'one sensor^4, single sensor^4, trigger^2, alone^2, two keys^3, who decides^4, decides to alert^4, key^2, keys^2, proof before panic^3, approve^2, approval^2, operator^2, verify^2, verification^2, suspect^2, confirmed^2, human in the loop^2' },
      a: { ar: `حسّاس واحد لا يتجاوز أبدًا مرحلة **«اشتباه»**. للتأكيد يلزم دليلان **مستقلان** (مبدأ فيزيائي مختلف أو مكان مختلف أو مصدر رسمي)، ثم يضغط المشغّل «اعتماد» قبل أي تنبيه عام. وسبب ذلك أن تنبيهًا عامًا كاذبًا يعلّم الناس تجاهل التنبيه الحقيقي التالي.

داخل المبنى لا شيء ينتظر: الصفّارة المحلية وأسهم المخارج تعمل فورًا كأي جهاز إنذار. ولم نقِس زمن مشغّل حقيقي؛ في العرض يعتمد مشغّل محاكى بعد زمن افتراضي قابل للتعديل (20 ثانية).`,
           en: `One sensor can never go beyond **SUSPECT**. To confirm, two **independent** keys must agree (a different physical principle, a different place, or an official source), and then an operator presses Approve before any public alert. The reason: a false public alert teaches people to ignore the next real one.

Inside the building nothing waits: the local siren and exit arrows fire at once, like any fire alarm. We have not measured a real operator's time; in the demo a simulated operator approves after an adjustable assumption (20 seconds).` },
      src: ['mission.html', 'detect.html'], doc: 'docs/MANARA-HAZARDS.md §0–§1; pitch Q&A P3', f: ['jud-detector', 'res-false-alarm', 'jud-reach'] },

    { id: 'jud-reach', aud: 'jud',
      q: { ar: 'كيف تصل الرسالة إلى كل شخص (الإبلاغ)؟', en: 'How does the message reach each person (Reach)?' },
      s: { ar: ['رسالة شخصية', 'لغة وصيغة كل شخص', 'الفرق بين البث والرسالة الشخصية'], en: ['personal message', 'language and format for each person', 'difference from a broadcast', 'cell broadcast'] },
      k: { ar: 'لغه مختلفه^3, ابلاغ^2, رساله شخصيه^3, لغه وصيغه^3, كل شخص^3, الرساله العامه^4, بث^3, رساله نصيه^2, مناطق^2, موجه^2, الانذار الوطني^3, نظام التحذير^2, cap^2',
           en: 'different language^4, language for each^4, reach^2, personal message^3, format for each person^4, each person^3, broadcast^3, cell broadcast^3, sms^2, text message^2, zones^2, targeted^2, national warning^3, warning system^2, cap^2' },
      a: { ar: `البثّ رسالة واحدة بصيغة واحدة لكل من في المنطقة، وهو مفيد وسنسلّم رسالتنا إلى مثل هذه القنوات عبر صيغة CAP القياسية. لكنه لا يستطيع أن يصعد مع النائم حتى يستجيب، ولا أن يوقظ الأصمّ باهتزاز وبطاقة مصورة، ولا أن يخاطب قارئ المالايالامية بلغته، ولا أن يعرف أن مخرجًا أُقفل للتوّ، ولا أن يعدّ من خرج.

فالبثّ للمنطقة، ومنارة للشخص، و999 للاستجابة. ولم نختبر الإرسال عبر شبكة بثّ حقيقية.`,
           en: `A broadcast is one message in one format for everyone in an area. It is useful, and MANARA is designed to hand its message to such channels through the standard CAP format. But it cannot keep climbing until a sleeper responds, wake a Deaf resident with vibration and a picture card, speak to a Malayalam reader in their language, know that an exit just locked, or count who got out.

So: broadcast for the area, MANARA for the person, 999 for the response. We have not tested over a real broadcast network.` },
      src: ['alert.html', 'mission.html'], doc: 'pitch Q&A W1, W3', f: ['res-alerts', 'jud-different', 'jud-handoff'] },

    { id: 'jud-guide', aud: 'jud',
      q: { ar: 'كيف يحسب النظام الطريق الآمن (الإرشاد)؟', en: 'How does it work out the safe route (Guide)?' },
      s: { ar: ['صدق المخارج', 'ما معنى exit truth', 'إعادة التوجيه'], en: ['exit truth', 'which exit is open', 'rerouting', 'how is the route chosen'] },
      k: { ar: 'ارشاد^2, طريق^2, مسار آمن^2, المخرج^2, مخارج^2, اعاده توجيه^3, dijkstra^2, ديكسترا^2, مفتوح^2, مقفل^2',
           en: 'guide^2, route^2, safe route^3, exit^2, exits^2, exit truth^3, reroute^3, re-route^3, rerouting^3, dijkstra^2, open^2, locked^2' },
      a: { ar: `المسار يُحسب بخوارزمية ديكسترا متعددة المصادر انطلاقًا من **الأهداف الآمنة لهذا الخطر** (نقاط التجمع في الحريق، أرض مرتفعة في السيول…) مع منع أو تكلفة عالية لخلايا النار والدخان المتوقع.

كل مخرج له حالة: مفتوح أو دخان أو نار أو مقفل («صدق المخارج»). وحين تتغير الحالة يُعاد التوجيه فورًا، ولا تصل رسالة جديدة إلا لمن تأثر بالتغيير. وللمقعد المتحرك لا يُقترح درج أبدًا.`,
           en: `The route is computed with multi-source Dijkstra from the **safe targets of this hazard** (assembly points for fire, higher ground for flood…), with fire cells and forecast smoke blocked or made costly.

Each exit has a state: OPEN, SMOKE, FIRE or LOCKED ("exit truth"). When a state changes the route is recomputed at once, and only the people affected by the change get a new message. A wheelchair user is never sent to stairs.` },
      src: ['mission.html', 'alert.html'], doc: 'docs/MANARA-SPEC.md (Guide); docs/MANARA.md (Engines)', f: ['jud-count', 'jud-pipeline', 'res-access'] },

    { id: 'jud-count', aud: 'jud',
      q: { ar: 'كيف يُحصى من خرج (العدّ)؟', en: 'How is everyone counted (Count)?' },
      s: { ar: ['غير محسوب', 'السجل والحضور'], en: ['unaccounted people', 'register and headcount'] },
      k: { ar: 'من خرج^3, عد^2, احصاء^2, حضور, سجل, غير محسوب^3, مفقود, headcount^2',
           en: 'who got out^4, how do you count^4, count^2, counted, unaccounted^3, register^2, headcount^3, accounted for, missing people' },
      a: { ar: `بعد التنبيه يسجّل الناس «أنا بخير» أو «أحتاج مساعدة» من هواتفهم أو من لوحة المكان أو من نقطة «MANARA-SAFE» دون إنترنت أو من جهاز المعلمة. وتقارنها غرفة العمليات بسجلّ المقيمين: **بخير / يحتاج مساعدة / غير محسوب**، لكل غرفة.

إن وجد الروبوت (في المحاكاة) مقيمًا لم يسجّل حضوره فهو خانة منفصلة «تم تحديد مكانه»، ولا يُحسب «بخير».`,
           en: `After an alert people check in as "I'm safe" or "I need help" from their phones, a booth tablet, the offline MANARA-SAFE point or the teacher's tablet. The control room compares this with the register of residents: **safe / needs help / unaccounted**, room by room.

If the robot (in the simulation) finds a resident who has not checked in, that is a separate bucket, "located", and is not counted as safe.` },
      src: ['mission.html', 'robot.html'], doc: 'docs/MANARA-SPEC.md (Count); docs/MANARA.md (Headcount)', f: ['jud-handoff', 'jud-robot', 'res-checkin'] },

    { id: 'jud-handoff', aud: 'jud',
      q: { ar: 'ما بطاقة التسليم للدفاع المدني؟', en: 'What is the hand-off card for Civil Defence?' },
      s: { ar: ['ماذا يتلقى الدفاع المدني', 'ما هو CAP', 'حزمة موثقة'], en: ['what does civil defence receive', 'what is cap', 'verified package', 'hand off'] },
      k: { ar: 'بطاقه التسليم^3, تسليم^3, حزمه^2, موثقه^2, cap^2, الدفاع المدني^2, تصدير, oasis',
           en: 'hand-off^3, handoff^3, hand off^3, handover, package^2, verified package^3, card^2, cap^3, oasis^2, export^2, civil defence^2' },
      a: { ar: `بعد التأكيد والاعتماد تُعدّ منارة **حزمة موثّقة**: ماذا حدث، وأين، وحالة المخارج والطرق، ومن بلا حساب وأين، ومن يحتاج مساعدة وأي مساعدة (كرسي متحرك، أصمّ، كفيف، طفل، مسنّ)، مع توصية بأسرع وحدة. وتُصدَّر بصيغة OASIS CAP 1.2 بحالة «تمرين» (Exercise) لتحملها أنظمة الإنذار الوطنية يومًا ما.

999 يبقى المُرسِل: منارة لا تتصل بهم ولا تحلّ محلهم، والربط الحقيقي يحتاج اتفاقًا مع الجهة، ولا ندّعي أن شيئًا منه تم.`,
           en: `After confirmation and approval MANARA prepares a **verified package**: what happened, where, exit and road states, who is unaccounted and where, who needs help and what help (wheelchair, Deaf, blind, child, elderly), with a fastest-unit recommendation. It is exported as OASIS CAP 1.2 with status "Exercise", so national alert systems could carry it one day.

999 stays the dispatcher: MANARA does not call them or replace them, a real link needs an agreement with the authority, and we do not claim any has been made.` },
      src: ['mission.html', 'pitch.html'], doc: 'docs/MANARA-SPEC.md (Hand off); docs/MANARA.md (Engines); pitch Q&A D4', f: ['jud-routing', 'jud-dispatch', 'jud-different'] },

    { id: 'jud-hazards', aud: 'jud',
      q: { ar: 'لماذا هذه الأخطار الستة؟', en: 'Why these six hazards?' },
      s: { ar: ['ما الأخطار التي تغطيها', 'لماذا اخترتم هذه الأخطار'], en: ['which hazards do you cover', 'why did you choose these hazards', 'six hazards'] },
      k: { ar: 'الاخطار^3, ستة اخطار^3, ست^2, خطر^2, لماذا هذه^2, سيناريو',
           en: 'hazards^3, six hazards^3, six^2, why these^3, hazard^2, scenarios^2, which hazards^3' },
      a: { ar: `لأن «آخر مئة متر» هي المشكلة نفسها في كلها: أن يستيقظ الناس ويفهموا ويتحركوا في الاتجاه الصحيح ويُعدّوا. واخترنا ما له سجلّ في قطر: سيول أكتوبر 2018 (84 ملم في أبو هامور)، وعاصفة أبريل 2015 الغبارية (PM10 فوق 7,000)، وحرّ الصيف وقواعد وزارة العمل، وتسرّب الغاز، والحريق، وحالات الاستغاثة في المنازل.

أما الزلازل فقد وصفت إدارة الأرصاد قطر بأنها منخفضة الخطر (2013) فلم نبنِ لها سيناريو. وبعض هذه الأخطار محاكاة (السيول والغبار) ونقولها.`,
           en: `Because the last 100 metres is the same problem in all of them: people must wake, understand, move the right way and be counted. We chose hazards with a Qatar record: the October 2018 floods (84 mm in Abu Hamour), the April 2015 dust storm (PM10 above 7,000), summer heat and the Ministry of Labour rules, gas leaks, fires, and emergencies at home.

Qatar's Meteorology Department called Qatar a low-risk country for earthquakes (2013), so we built no scenario for them. Some hazards are simulated (flood, dust), and we say so.` },
      src: ['pitch.html', 'guide.html'], doc: 'pitch Q&A W8', f: ['res-earthquake', 'jud-pipeline', 'jud-sim-vs-real'] },

    { id: 'jud-different', aud: 'jud',
      q: { ar: 'ما الجديد مقارنة بما هو موجود؟', en: 'What is new compared with what already exists?' },
      s: { ar: ['أليس لدى قطر نظام تحذير', 'هل تستبدلون 999', 'ما الفرق عن إنذارات المباني', 'هل أنتم الأوائل'], en: ['does qatar already have a national warning', 'do you replace 999', 'how is it different from building alarms', 'are you the first', 'what makes it different'] },
      k: { ar: 'الجديد^3, الفرق^3, موجود اصلا^2, يستبدل^2, تستبدلون^3, بديل^2, نظام التحذير الوطني^3, انذارات المباني^3, الاوائل, ما الفرق^3, منافس',
           en: 'new^2, different^3, difference^3, already exist^3, replace^3, replacing^3, national warning^3, building alarms^3, novelty^3, first^2, competitors^2, compared with^2, unique^2' },
      a: { ar: `لا ندّعي السبق، فأجزاء الفكرة موجودة. ادعاؤنا أضيق: مسار واحد مفتوح يعمل دون إنترنت ويجمع (1) رفض التنبيه على حسّاس واحد، (2) رسالة تتكيّف مع كل شخص: لغته وصيغته وقدرته، (3) إعادة توجيه فورية حين يتغيّر مخرج، (4) عدّ من خرج، (5) تسليم حزمة موثّقة مع توصية بأسرع وحدة — لستة أخطار لا لخطر واحد.

ولا نستبدل أحدًا: 999 يبقى المُرسِل، والدفاع المدني يكافح الحريق، ونظام التحذير العام التابع لوزارة الداخلية يخاطب الجميع. إنذارات المباني تُخبر غرفة العمليات؛ ومنارة تُخبر كل شخص بما يفعل. ولم نُجرِ تجربة ميدانية بعد.`,
           en: `We do not claim to be first: parts of this idea exist. Our claim is narrower: one open pipeline that works offline and combines (1) refusing to alert on a single sensor, (2) a message that adapts to each person (language, format, ability), (3) instant re-routing when an exit changes, (4) a headcount, and (5) a verified package with a fastest-unit recommendation, for six hazards, not one.

We replace no one: 999 stays the dispatcher, Civil Defence fights the fire, and the Ministry of Interior's public warning system speaks to everyone. Building alarms tell the control room; MANARA tells each person what to do. We have not done a field trial yet.` },
      src: ['pitch.html', 'report.html'], doc: 'pitch Q&A W1, W2, W4, W6', f: ['jud-reach', 'jud-drone-vs-others', 'jud-limits'] },

    { id: 'jud-drone-vs-others', aud: 'jud',
      q: { ar: 'كيف تختلف عن مشاريع المسيّرات والكاميرات الأخرى؟', en: 'How is it different from other drone projects and CCTV?' },
      s: { ar: ['ماذا عن مسيرة آيسف', 'لماذا لا نكتفي بكاميرات المراقبة', 'لماذا مسيرة أصلا'], en: ['what about the isef drone', 'why not just use cctv', 'why a drone at all', 'cameras instead of drones'] },
      k: { ar: 'طائره بدون طيار^3, كاميرات بدل المسيرات^4, كاميرات المراقبة^3, cctv^3, آيسف^3, isef^3, مشروع مسيره^2, مسيرات الدفاع المدني^2, لماذا مسيره^3, لماذا مسيره اصلا^3',
           en: 'cctv^3, cameras instead of drones^4, cameras^3, surveillance cameras^3, isef^3, h2s drone^3, why a drone^3, other drone projects^3, civil defence drones^2, drone project^2' },
      a: { ar: `**كاميرات المراقبة** ثابتة وتغطي أماكنها فقط وتحتاج من يشاهدها. المسيّرة تأتي بمنظور من الخارج ومن الأعلى وبصورة حرارية إلى حيث لا كاميرا. ونحن لا نستبدل الكاميرات: أي تغذية كاميرا يمكن أن تكون مصدرًا في غرفة التحكم وتمرّ بالمفاتيح نفسها. وللمسيّرة حدودها: المدى وحرارة الأرض وتصريح الطيران.

**مشاريع المسيّرات الأخرى:** نحترم مشروع آيسف 2025 لكشف كبريتيد الهيدروجين (المعلن عنوانه وجائزته فقط، ولم نطّلع على تصميمه)، وللدفاع المدني مسيّرات إطفاء أصلًا. ومنارة ليست مشروع مسيّرة: المنتج هو المستشعر الثابت، والمسيّرة اختيارية وتتبع جهة مرخَّصة. لو كشفت مسيّرة تسرّبًا فمنارة هي التي تخبر الناس إلى أين يمشون.`,
           en: `**CCTV** is fixed, sees only where it is installed and needs someone watching. A drone brings a view from outside and above, with a thermal image, to where there is no camera. We do not replace cameras: any camera feed can be a source in the control room and goes through the same keys. A drone has limits too: range, ground heat and flight permission.

**Other drone projects:** we respect the 2025 ISEF H2S-leak drone (only its title and award are public; we have not seen its design), and Civil Defence already has firefighting drones. MANARA is not a drone project: the fixed sentinel is the product, and the drone is optional and belongs to a licensed agency. If a drone found a leak, MANARA is what tells people which way to walk.` },
      src: ['pitch.html', 'control.html'], doc: 'pitch Q&A W5, R1, R10', f: ['jud-drone-numbers', 'jud-aviation', 'jud-different'] },

    { id: 'jud-drone-numbers', aud: 'jud',
      q: { ar: 'متى تصل المسيّرة قبل الوحدة الأرضية؟ (أرقام المحاكاة)', en: 'How often does the drone beat the ground units? (SIM numbers)' },
      s: { ar: ['كم نسبة وصول المسيرة أولا', 'ما أرقام المحاكاة الوطنية', 'الحوادث خارج المدى', '90% و244 ثانية'], en: ['how fast does the drone arrive', 'national simulation results', 'incidents out of range', '244 seconds versus 440', 'drone before ground unit'] },
      k: { ar: 'نسبه وصول المسيره^5, وصول المسيره^4, اولا^2, قبل اول وحده ارضيه^3, 90^2, 244^3, 440^3, 33^2, خارج المدى^3, خارج مدى^3, ارقام^2, نتائج المحاكاه^2, محاكاه^2, وسيط^2, 150 حادث^2',
           en: 'before the first ground unit^3, ground unit^3, 90%^2, 244^3, 440^3, 33%^2, out of range^3, simulation results^3, numbers^2, median^2, seed 7^2, 150 incidents^2, drone first^3, results^2' },
      a: { ar: `في المحاكاة (SIM، البذرة 7، 150 حادثًا) تكون المسيّرة في الموقع قبل أول وحدة أرضية في **90%** من الحوادث التي تستطيع الوصول إليها: الوسيط **244 ث** مقابل **440.5 ث**.

ونحو **33%** من الحوادث خارج مدى كل المسيّرات، فلا مسيّرة لها؛ وهذه تعمل فيها الوحدات الأرضية والحارس والهواتف دون مسيّرة. هذه نتائج محاكاة بافتراضات قابلة للتعديل: فحص لآلية العمل لا برهان على أثر حقيقي.`,
           en: `In the simulation (SIM, seed 7, 150 incidents) a drone is on station before the first ground unit in **90%** of the incidents it can reach: median **244 s** against **440.5 s**.

About **33%** of incidents are out of range of every drone, so they get none; there the ground units, the sentinel and the phones work without a drone. These are simulation results under adjustable assumptions: a mechanism check, not proof of real impact.` },
      m: { ar: `التفاصيل: تنطلق المسيّرات من مواقع المحطات والمستشفيات في بيانات OpenStreetMap، وعدد المسيّرات والمدى افتراضات قابلة للتغيير في غرفة التحكم. وفي محاكاة كاملة لـ 24 حادثًا (15 من 19) كانت النسبة 79% والوسيط 265 ث للمسيّرة مقابل 645 ث لأول وحدة أرضية. جرّب النتائج بنفسك في غرفة العمليات.`,
           en: `Details: drones launch from the station and hospital positions in the OpenStreetMap data, and the number of drones and their range are assumptions you can change in the control room. In a full simulation of 24 seeded incidents (15 of 19) the share was 79%, median 265 s for the drone against 645 s for the first ground unit. Run it yourself in Mission Control.` },
      src: ['mission.html', 'control.html', 'pitch.html'], doc: 'docs/MANARA.md (Simulated results the tests print); pitch Q&A R10, R7', f: ['jud-drone-range', 'jud-thermal', 'jud-sim-vs-real'] },

    { id: 'jud-drone-range', aud: 'jud',
      q: { ar: 'ما مدى المسيّرة وبطاريتها؟', en: 'What is the drone range and battery?' },
      s: { ar: ['كم كيلومترا تطير', 'البطارية في الحر', 'ماذا عن الحوادث البعيدة'], en: ['how far can it fly', 'battery in the heat', 'what about far away incidents'] },
      k: { ar: 'مدى^3, بطاريه^3, كيلومتر^2, كم^2, تطير^2, الحر^2, زمن الوصول^2, ثلث الحوادث',
           en: 'range^3, battery^3, kilometres^2, km^2, how far^3, fly^2, heat wave^2, endurance^3, sortie^2, coverage^2' },
      a: { ar: `كلها افتراضات قابلة للتعديل وليست قياسات: بمدى البطارية الافتراضي تصل المسيّرة نحو 13 كم في يناير 03:00 و11 كم في يوليو 14:00 و8.3 كم في موجة حر، والمهمة النموذجية تصل خلال 235–268 ثانية وتستهلك 35–52% من البطارية.

وتنطلق المسيّرات من مواقع المحطات والمستشفيات في بيانات OpenStreetMap، فتبقى نحو 33% من الحوادث خارج المدى. لذلك لا نقول «تغطية كل قطر»: الأرقام تُظهر الفجوة. وفي المحاكاة نخفّض تحمّل البطارية فوق 40 °م.`,
           en: `All of these are adjustable assumptions, not measurements: with the default battery the drone reaches about 13 km in January at 03:00, 11 km in July at 14:00 and 8.3 km in a heat wave, and a typical sortie arrives in 235–268 s using 35–52% of the battery.

Drones launch from the station and hospital positions in the OpenStreetMap data, so about 33% of incidents are out of range. That is why we do not say "coverage of all Qatar": the numbers show the gap. In the simulation battery endurance is derated above 40 °C.` },
      src: ['control.html', 'pitch.html'], doc: 'docs/MANARA.md (Range and flight); pitch Q&A R3, R7', f: ['jud-drone-numbers', 'jud-thermal', 'jud-scale'] },

    { id: 'jud-thermal', aud: 'jud',
      q: { ar: 'لماذا تضعف الكاميرا الحرارية في حرّ الظهيرة؟', en: 'Why is the thermal camera weak in midday heat?' },
      s: { ar: ['مفتاح الحرارة للأشخاص', '2% و70%', 'هل ترى الحرارية الأشخاص في الصيف'], en: ['thermal people key', '2% versus 70%', 'can thermal see people in summer', 'hot ground and thermal contrast'] },
      k: { ar: 'حراري^2, الحراريه^2, تباين حراري^3, ظهيره^2, 13:00^3, 02:00^2, يوليو^2, مستلقي^2, ارض حاره^3, 70^2',
           en: 'thermal^2, thermal key^3, thermal contrast^3, midday^2, 13:00^3, 02:00^2, july^2, lying down^2, hot ground^3, people key^3, 70^2' },
      a: { ar: `في المحاكاة ينجح مفتاح الحرارة لشخص مستلقٍ على الأرض في **2%** من المحاولات عند 13:00 في يوليو (أرض حارّة وتباين ضعيف) مقابل **70%** عند 02:00.

نعرض هذا لأنه الحدّ الصادق: في حرّ صيف قطر تقترب حرارة الأرض من حرارة الجسم فيقلّ التباين الحراري ويصعب رؤية الأشخاص. و«الحارس» الثابت يعمل بلا مسيّرة، والمسيّرة اختيارية. هذا افتراض محاكى (SIM) لا قياس حقيقي.`,
           en: `In the simulation the thermal key for a person lying on the ground succeeds **2%** of the time at 13:00 in July (hot ground, little contrast) against **70%** at 02:00.

We show it because it is the honest limit: in Qatar's summer heat the ground warms toward body temperature, the thermal contrast shrinks and people are harder to see. The fixed sentinel works without the drone, and the drone is optional. This is a simulated (SIM) figure, not a measurement.` },
      src: ['control.html', 'guide.html', 'plan.html'], doc: 'docs/MANARA.md (People on thermal); pitch Q&A R8; js/guide.js (glossary)', f: ['jud-drone-numbers', 'jud-robot', 'jud-limits'] },

    { id: 'jud-detector', aud: 'jud',
      q: { ar: 'ما دقة كاشف الحريق؟', en: 'How accurate is the fire detector?' },
      s: { ar: ['كم نسبة صحة الكاشف', '66.7%', 'ما معدل الخطأ', 'مختبر الخدع'], en: ['what is the detector accuracy', '66.7%', 'error rate of the detector', 'decoy lab', 'held out photos'] },
      k: { ar: 'معدل الخطا^4, معدل خطا^4, دقه^3, دقه الكاشف^3, الكاشف^2, كاشف^2, 66.7^3, صور محجوزه^3, مختبر الخدع^3, خدع^2, 12 من 18^3, عينه صغيره^2',
           en: 'accuracy^3, accurate^3, detector^2, detector accuracy^3, 66.7^3, held-out^3, held out^3, decoy^3, decoy lab^3, 12 of 18^3, small sample^2, precision, acuracy^3, detecter^2' },
      a: { ar: `يصيب كاشفنا **66.7%** على صور محجوزة لم يُضبط عليها (12 من 18): وجد صور النار الست كلها، لكنه أخطأ في 3 من 12 صور بلا نار، ولم يجد دخانًا في صور الدخان الثلاث. هي عيّنة صغيرة فلا نعمّمها.

ولهذا لا تطلق رؤيته وحدها أي تنبيه عام: نحتاج مفتاحًا ثانيًا مستقلًا (حرارة أو دخان) ثم إنسانًا. وفي اختبار المسار الحي لم تصل 14 من 14 تجربة خداع (قميص أحمر، سيارة، وشاح، LED، كشّاف، جدار، مصباح وامض) إلى «نار»، لكنها مشاهد مولَّدة بالشيفرة لا لقطات حقيقية. ولم نقِس معدل الإنذارات الكاذبة في مبنى حقيقي.`,
           en: `Our detector is right **66.7%** of the time on held-out photos it was not tuned on (12 of 18): it found all six fire photos, but was wrong on 3 of 12 fire-free photos and missed the smoke in all three smoke photos. That is a small sample, so we do not generalise it.

This is why its vision alone never triggers a public alert: we need a second independent key (heat or smoke), then a human. In the live-pipeline test 14 of 14 decoy trials (red shirt, car, scarf, LED, flashlight, wall, flickering lamp) never reached FIRE, but those scenes are generated in code, not real footage. We have not measured a false-alarm rate in a real building.` },
      src: ['detect.html', 'report.html'], doc: 'pitch Q&A P2; docs/MANARA-HAZARDS.md §4', f: ['jud-not-ai', 'jud-prove', 'jud-real-fires'] },

    { id: 'jud-not-ai', aud: 'jud',
      q: { ar: 'هل كاشف الحريق «ذكاء اصطناعي»؟', en: 'Is the fire detector "AI"?' },
      s: { ar: ['هل تستخدمون التعلم العميق', 'كيف يكتشف الحريق', 'رؤية حاسوبية بقواعد'], en: ['do you use deep learning', 'how does it detect fire', 'rule-based computer vision', 'machine learning'] },
      k: { ar: 'الكاشف ذكاء^5, ذكاء^2, اصطناعي^2, الكاشف^2, تعلم عميق^3, تعلم الي^2, بقواعد^3, رؤيه حاسوبيه^3, كيف يكتشف^2, كيف يكتشف الحريق^3, الوان^2, وميض^2',
           en: 'detector ai^5, ai^2, detector^2, artificial intelligence^2, deep learning^3, machine learning^3, rule-based^3, rule based^3, computer vision^3, how does it detect^3, colour models^2, flicker^2, neural^2, model^2' },
      a: { ar: `لا. هو **رؤية حاسوبية بقواعد**: نماذج لون وحركة وتذبذب وطبقات تحقق (شكل، استمرار، فيتو حراري). دقته على صور اختبار لم يرها أثناء الضبط 66.7% فقط ونقول ذلك، ويرفض كاشف الفيديو الأجسام الحمراء الثابتة.

وهو لا يقرر وحده: لا بد من مفتاحين مستقلين ثم موافقة بشرية قبل أي تنبيه عام. وقد نجرّب نموذجًا متعلمًا لاحقًا ونقيسه في «مختبر الخدع» بالشروط نفسها.

وبالمثل هذه المحادثة ليست نموذجًا لغويًا: تطابق سؤالك مع إجابات مكتوبة.`,
           en: `No. It is **rule-based computer vision**: colour models, motion, flicker and verification layers (shape, persistence, a thermal veto). Its accuracy on held-out still images is only 66.7% and we say so, and the video detector rejects static red objects.

It never decides alone: two independent keys, then a human approval, before any public alert. We may try a learned model later and score it in the Decoy Lab on equal terms.

In the same way this chat is not a language model: it matches your question to written answers.` },
      src: ['detect.html', 'report.html'], doc: 'pitch Q&A P1; docs/MANARA.md (ManaraFire)', f: ['jud-detector', 'jud-ai-use', 'about-bot'] },

    { id: 'jud-robot', aud: 'jud',
      q: { ar: 'ماذا أظهرت مقارنة الروبوت (A/B)؟', en: 'What did the robot A/B comparison show?' },
      s: { ar: ['هل ينقذ الروبوت أحدا', '5 من 8 بذور', 'المستخدم على المقعد المتحرك', 'هل يتسلق الدرج'], en: ['does the robot save anyone', '5 of 8 seeds', 'wheelchair user found first', 'can the robot climb stairs', 'rescue robot results'] },
      k: { ar: 'روبوت^3, الروبوت^3, a/b^2, مقارنه^2, بذور^3, 5 من 8^3, 8 بذور^3, مقعد متحرك^2, كرسي متحرك^2, درج^2, ينقذ^2, مكنسه^2',
           en: 'robot^3, rescue robot^3, a/b^2, ab^2, comparison^2, seeds^3, 5 of 8^3, 8 seeds^3, wheelchair^2, stairs^2, save^2, vacuum^2, robot lab^2' },
      a: { ar: `لا نقول «ينقذ». على بذور 1–8 في المحاكاة (SIM، نفس العالم مع الروبوت وبدونه) الزمن الإجمالي للعثور على السكان يكاد لا يتغير (متوسط الوسيط 346 ث بلا الروبوت و344 ث معه) لأن منارة تحصي معظم الناس أصلًا عبر هواتفهم.

لكن الروبوت وجد المستخدم على المقعد المتحرك أولًا في **5 بذور من 8**، وسبقته الفرق في 3. وهي تعتمد على افتراضات ظاهرة: العجلات لا تتسلق إلى الطابق الثالث، وفي غرفة 34 °م لا تجد الكاميرا الحرارية تباينًا، والكشف احتمال بذرة.

والروبوت مفهوم ونموذج محاكى: لم يُبنَ روبوت إنقاذ ولا يتحرك قبل موافقة قائد الحادث، ورجال الإطفاء هم من يقرر. افتح «مختبر الروبوت» وشغّل القياس بنفسك.`,
           en: `We do not say "saves". Over seeds 1–8 in the simulation (SIM, the same world with and without the robot) the overall time to locate residents barely changes (mean of the medians 346 s without the robot, 344 s with it) because MANARA already counts most people through their phones.

But the robot found the wheelchair user first in **5 of 8 seeds**, and the crews were first in 3. It depends on visible assumptions: wheels cannot reach the third floor, in a 34 °C room the thermal camera finds no contrast, and detection is a seeded probability.

The robot is a concept and a simulated prototype: no rescue robot has been built, it does not move before the incident commander approves, and firefighters decide. Open the Robot Lab and run the measurement yourself.` },
      src: ['robot.html', 'pitch.html'], doc: 'pitch Q&A R11, R12; docs/MANARA.md (The rescue robot)', f: ['jud-thermal', 'jud-count', 'jud-liability'] },

    { id: 'jud-sim-vs-real', aud: 'both',
      q: { ar: 'ما الحقيقي وما المحاكى في المشروع؟', en: 'What is real and what is simulated?' },
      s: { ar: ['ما الحقيقي في العرض', 'ما المحاكاة SIM', 'هل كل شيء محاكى'], en: ['what is real in the demo', 'what does sim mean', 'real or fake', 'is everything simulated'] },
      k: { ar: 'الحقيقي في العرض^5, حقيقي^3, محاكى^3, محاكاه^3, sim^3, افتراضي^2, وهمي^2, فعلا^2, ما الحقيقي^3',
           en: 'real in the demo^5, real and simulated^5, real^3, simulated^3, simulation^3, sim^3, fictional^2, fake^2, actually^2, what is real^3, mechanism check^3, proof^2' },
      a: { ar: `**حقيقي:** بيانات OpenStreetMap (لقطة 8 أكتوبر 2026) والخرائط والطرق، والشيفرة والاختبارات الآلية، وكاشف الصور على صور حقيقية، وحدود الحسّاسات من صحائفها، والمعايير والأرقام المنسوبة إلى مصادرها.

**محاكى (SIM):** المرور، ومواقع الوحدات والمستشفيات وسعتها في العرض، والسكان، وتحليق المسيّرة، والروبوت، وزمن المشغّل. وكل رقم منها يحمل «SIM» وهو «فحص لآلية العمل لا برهان على أثر».

**لم يحدث:** حرائق حقيقية، أو تجارب على أشخاص، أو أي تحليق فعلي، أو تجربة ميدانية، أو اعتماد، أو مراجعة قانونية. لا لهب ولا غاز قابل للاشتعال في القاعة؛ نستعمل بدائل آمنة (كوب ساخن، مجفف شعر) ومحاكاة.`,
           en: `**Real:** the OpenStreetMap data (snapshot 8 October 2026) for maps and roads, the code and automated tests, the image detector run on real photos, sensor limits taken from their datasheets, and the standards and figures attributed to their sources.

**Simulated (SIM):** traffic, the positions and capacity of units and hospitals in the demo, residents, drone flights, the robot, and operator timing. Every such number is marked SIM and is "a mechanism check, not proof of impact".

**Not done:** real fires, tests with people, any real flight, a field trial, certification, or a legal review. No flames or flammable gas are allowed in the hall; we use safe stand-ins (a hot mug, a hair dryer) and a simulation.` },
      src: ['report.html', 'mission.html', 'pitch.html'], doc: 'pitch Q&A P4, P7, N2, B9; docs/MANARA.md (Laws)', f: ['jud-limits', 'jud-ab-honest', 'jud-traffic'] },

    { id: 'jud-ab-honest', aud: 'jud',
      q: { ar: 'أليست المحاكاة مصمَّمة لتنجح؟', en: 'Is your simulation rigged to make MANARA win?' },
      s: { ar: ['هل المحاكاة دليل على الأثر', 'لماذا تظهر منارة أفضل', 'البذرة نفسها'], en: ['does the simulation prove impact', 'why does manara look better', 'same seed two worlds', 'ordinary alarm versus manara'] },
      k: { ar: 'لا تثبت^4, تثبت^3, مصممه لتنجح^3, تنجح^2, دليل على الاثر^4, تظهر منارة افضل^4, افضل^2, برهان^2, اثبات^2, الانذار العادي^3, نفس البذره^3, صفاره المبنى^2, 14 ثانيه^2, 39 ثانيه^2, مقايضه',
           en: 'not able to prove^4, cannot prove^4, prove^3, rigged^3, look better^4, looks better^4, better^2, prove impact^3, ordinary alarm^3, same seed^3, building siren^2, 14 seconds^2, 39 seconds^2, trade-off^2, biased^2, cherry picked^2, fair^2' },
      a: { ar: `لا يمكنها إثبات الأثر ونكتب ذلك في كل صفحة: SIM فحص للآلية فقط. تُشغّل البذرة نفسها في عالمين (إنذار عادي مقابل منارة)، وكل افتراض شريط قابل للتعديل.

والنتائج تختلف باختلاف السيناريو والبذرة: في الحريق الليلي والغاز والاستغاثة فرق واضح، وفي الغبار وحريق المدرسة صغير، وفي الحرّ يتغير باختلاف البذرة. ونعرض مقايضة محرجة: صفّارة المبنى تُسمع بعد 14 ثانية في العالمين، أما أول رسالة شخصية من منارة فتصل بعد 39 ثانية لأنها تتحقق أولًا.`,
           en: `It cannot prove impact, and we say so on every page: SIM is a mechanism check only. It runs the same seed in two worlds (ordinary alarm vs MANARA), and every assumption is an adjustable slider.

Results differ by scenario and seed: the night fire, gas and SOS runs show a clear gap, dust and the school fire a small one, and heat changes with the seed. We also show an awkward trade-off: the building siren is heard after 14 seconds in both worlds, while MANARA's first personal message arrives after 39 seconds because it verifies first.` },
      src: ['mission.html', 'pitch.html'], doc: 'pitch Q&A P7', f: ['jud-sim-vs-real', 'jud-limits', 'jud-drone-numbers'] },

    { id: 'jud-limits', aud: 'both',
      q: { ar: 'ما أكبر حدود المشروع؟', en: 'What are the biggest limitations?' },
      s: { ar: ['ما نقاط الضعف', 'ما الذي لا تستطيع منارة فعله', 'حدود المشروع الصادقة'], en: ['what are the weak spots', 'what can manara not do', 'honest limits', 'drawbacks'] },
      k: { ar: 'نقاط ضعف^4, حدود^3, لا تستطيع منارة^4, ما لا تستطيع^4, قيود^3, نقاط الضعف^3, عيوب^3, مشاكل^2, لا تستطيع^2, صادق^2, ضعف^2',
           en: 'weak points^4, weak point^4, limitations^3, limits^3, not do^5, cannot do^5, weaknesses^3, weak spots^3, drawbacks^3, problems^2, cannot^2, honest^2, shortcomings^2, risks^2' },
      a: { ar: `عيّنات الاختبار صغيرة، وكاشف الصور يصيب 66.7% فقط؛ والحسّاسات رخيصة وقراءاتها استرشادية؛ والمرور والسكان والمحطات في المحاكاة افتراضية؛ والمسيّرة والروبوت مفهوم؛ واللغات الست مسودات؛ ولم نجرّب على حرائق حقيقية ولا على أشخاص؛ والمشروع غير معتمد ولا يحلّ محل أي جهاز أو جهة.

ومن الحدود أيضًا: لا توقيع تشفيري للرسائل بعد، ولم نختبر انقطاع الكهرباء، ولم نقِس معدل الإنذارات الكاذبة في مبنى حقيقي. ونحب أن نسمع أين ترون نقاط ضعف أخرى.`,
           en: `The test samples are small and the image detector is right only 66.7%; the sensors are cheap and their readings indicative; traffic, residents and stations in the simulation are fictional; the drone and the robot are concepts; the six community languages are drafts; we have not tested on real fires or on people; and the project is not certified and replaces no device or body.

Also: there is no cryptographic message signing yet, we have not tested a power outage, and we have not measured the false-alarm rate in a real building. We would like to hear where you see other weak spots.` },
      src: ['report.html', 'pitch.html'], doc: 'pitch Q&A B9, B7, B8', f: ['jud-sim-vs-real', 'jud-next', 'jud-security'] },

    { id: 'jud-aviation', aud: 'jud',
      q: { ar: 'ماذا تشترط قواعد الطيران والتصاريح للمسيّرة؟', en: 'What do the aviation rules and permits require?' },
      s: { ar: ['هل الطيران قانوني', 'هل نحتاج تصريح هيئة الطيران المدني', 'ما عقوبة تشغيل مسيرة بلا ترخيص', 'القانون رقم 10 لسنة 2026'], en: ['is it legal to fly', 'do you need a permit from the civil aviation authority', 'fine for flying a drone without a license', 'law number 10 of 2026', 'gcaa'] },
      k: { ar: 'قانون^3, الطيران^3, طيران^2, تصريح^3, ترخيص^3, تراخيص^2, هيئه الطيران المدني^3, gcaa^3, عقوبه^2, غرامه^3, تسجيل^2, مسيره^1, الامارات^2, 2026^2',
           en: 'law^3, aviation^3, permit^3, license^3, licence^3, civil aviation^3, qcaa^2, gcaa^3, penalty^2, fine^3, register^2, registration^2, legal^3, uae^2, regulations^3, drone law^3' },
      a: { ar: `بحسب القانون رقم 10 لسنة 2026 (ذا بينينسولا ومرحبا) تنظّم هيئة الطيران المدني القطرية الطائرات دون طيار، ويجب تسجيل كل طائرة، ويحتاج الأفراد والشركات والجهات الحكومية إلى تراخيص أو تصاريح؛ وبعض المخالفات عقوبتها حتى 7 سنوات وغرامة 300,000 ريال. وكانت اللوائح التنفيذية لا تزال مقبلة عندما قرأنا الخبر.

لم نقرأ فئات التصاريح ولا حدود الارتفاع ولا مناطق المنع فلا نذكرها: أي تصريح ينطبق **يجب تأكيده مع الجهة**. وGCAA هي الهيئة العامة للطيران المدني في الإمارات، ومشروعنا عن قطر فلا نقول شيئًا عن قواعد الإمارات.

عمليًا: المسيّرة مفهوم لجهة مرخَّصة مثل الدفاع المدني، ولم نُطِر أي شيء، ولا شيفرة في حقيبتنا تقود مسيّرة.`,
           en: `Under Law No. 10 of 2026 (The Peninsula, Marhaba) the Qatar Civil Aviation Authority regulates unmanned aircraft, every drone must be registered, and individuals, companies and government entities need licences or permits; some offences carry up to 7 years and QAR 300,000. The executive regulations were still to come when we read the news.

We have not read the permit categories, height limits or no-fly zones, so we do not state them: which permit applies **must be confirmed with the authority**. The GCAA is the UAE's General Civil Aviation Authority; our project is about Qatar, so we say nothing about UAE rules.

In practice: the drone is a concept for a licensed agency such as Civil Defence, we flew nothing, and no code in our kit flies a drone.` },
      src: ['plan.html', 'pitch.html'], doc: 'pitch Q&A R2, R4; plan.html', f: ['res-drone-sees', 'jud-liability', 'confirm-authority'], c: 1 },

    { id: 'jud-drone-false-alarms', aud: 'jud',
      q: { ar: 'كم إنذارًا كاذبًا قد تسبّب المسيّرة؟', en: 'How many false alarms could the drone cause?' },
      s: { ar: ['المسيرة تصرخ ذئب', '233 إنذارا', '96.6%'], en: ['drone cries wolf', '233 false alerts', '96.6%', 'false alerts from patrols'] },
      k: { ar: 'انذارات كاذبه^2, انذار كاذب مسيره^4, تسبب المسيره^4, اندارات كاذبه^1, دوريات^3, 233^3, 96.6^3, ذئب^3, اخطاء المسيره^3',
           en: 'false alerts^3, false alarms^2, drone^1, patrols^3, 233^3, 96.6^3, cry wolf^3, drone false alarms^3, dismissed^2' },
      a: { ar: `لا نعرف المعدل الحقيقي، فلم نُطِر شيئًا. في يوم محاكى رفعنا فيه افتراض الإنذار الكاذب إلى 3 كل ساعة (افتراض لا قياس) صدر **233** إنذارًا كاذبًا من دوريات المسيّرات، أسقط المشغّل **96.6%** منها بالدليل (لا مفتاحين، جسم ساخن، دليل غائب)، وأُرسلت وحدات خطأً في 8، فوجدت الموقع خاليًا وسُجّلت «إنذار كاذب في الموقع»: ثمن الخطأ ظاهر.

وهذا فحص لآلية الفرز وليس نسبة حقيقية. ولا يصل الناسَ أي إنذار عام قبل مفتاحين و«اعتماد» إنسان.`,
           en: `We do not know the real rate: we flew nothing. In a simulated day where we raised the false-alert assumption to 3 per hour (an assumption, not a measurement) the patrols raised **233** false alerts, the operator dismissed **96.6%** of them on evidence (no two keys, a hot object, no evidence), and units were sent in error for 8, found nothing, and were logged as "false alarm on scene": the cost of an error is visible.

That tests the triage mechanism; it is not a real rate. And no public alert reaches people before two keys and a human Approve.` },
      src: ['control.html', 'pitch.html'], doc: 'docs/MANARA.md (False alarms); pitch Q&A R6', f: ['res-false-alarm', 'jud-prove', 'jud-drone-numbers'] },

    { id: 'jud-liability', aud: 'jud',
      q: { ar: 'مَن المسؤول قانونيًا إذا أخطأت المسيّرة أو الروبوت؟', en: 'Who is liable if the drone or the robot makes a mistake?' },
      s: { ar: ['المسؤولية القانونية', 'من يتحمل الخطأ', 'التأمين'], en: ['legal liability', 'who is responsible for a mistake', 'insurance'] },
      k: { ar: 'مسؤول^3, مسؤوليه^3, قانونيا^3, يتحمل^3, خطا^2, تامين^2, محامي^2', en: 'liable^3, liability^3, responsible^3, responsibility^3, legal^2, legally^3, mistake^2, insurance^2, lawyer^2, blame^2' },
      a: { ar: `نحن طلاب ومنارة مفهوم ونموذج محاكى غير معتمد، ولا نطلب من أحد الاعتماد عليها. التصميم يُبقي الإنسان في الحلقة: لا شيء عام يُرسل دون «اعتماد» مشغّل، ولا ينزل الروبوت إلا بموافقة قائد الحادث، ورجال الإطفاء هم من يقرّر، و999 يبقى المرسِل.

فتبقى المسؤولية على الجهة المرخَّصة المشغّلة وفق لوائحها. أما من يتحمل المسؤولية القانونية في نشر حقيقي فسؤال للمحامين وللجهة المختصة، ولا ندّعي مراجعة له.`,
           en: `We are students and MANARA is a concept and a simulated prototype that is not certified; we are not asking anyone to rely on it. The design keeps a human in the loop: nothing public is sent without an operator's Approve, the robot deploys only with the incident commander's approval, firefighters decide, and 999 stays the dispatcher.

So responsibility stays with the licensed operating agency under its own rules. Who is legally liable in a real deployment is a question for lawyers and the competent authority, and we claim no review of it.` },
      src: ['plan.html', 'pitch.html'], doc: 'pitch Q&A R9; plan.html (risks)', f: ['jud-aviation', 'jud-rollout', 'confirm-authority'], c: 1 },

    { id: 'jud-cost', aud: 'jud',
      q: { ar: 'كم التكلفة؟ ومَن يدفع؟', en: 'How much does it cost, and who pays?' },
      s: { ar: ['سعر القطع', 'كم تكلف المسيرة والروبوت', 'تكلفة النموذج'], en: ['price of the parts', 'how much do the drone and robot cost', 'cost of the prototype', 'budget'] },
      k: { ar: 'تكلفه^3, كلفه^3, سعر^3, اسعار^2, دولار^2, ميزانيه^2, يدفع^3, تمويل^2, ثمن, قطع^2',
           en: 'cost^3, costs^3, price^3, prices^2, dollars^2, budget^3, who pays^3, funding^2, parts^2, expensive^2, how much^3' },
      a: { ar: `قائمة القطع في صفحة البناء بتقديرات بالدولار؛ أغلى قطعة الكاميرا الحرارية بـ 74.95 دولارًا (Adafruit، أكتوبر 2026) ومعظم الباقي بضعة دولارات، والشحن والجمارك إلى قطر غير مشمولين. المرحلة 4 (عربة تجريبية وحمولة على الطاولة) نحو US$ 79–204، فيصير إجمالي المراحل الأربع نحو US$ 174–474 (تقدير يحتاج تحقّقًا من الموردين).

هذه تكلفة نموذج أولي. أما منتج معتمد ومركَّب ومُصان، ومسيّرة مشغَّلة حقيقية أو روبوت إنقاذ حقيقي، فلم نسعّرها ولن نذكر رقمًا. ومَن يدفع: مشغّل المبنى أو صاحب العمل (سكن العمال ملزَم أصلًا بإنذارات)، والتمويل والتشغيل يُتفق عليهما مع الجهات.`,
           en: `The parts list on the Build page gives US-dollar estimates; the biggest single part is the thermal camera at US$ 74.95 (Adafruit, October 2026), most of the rest are a few dollars, and shipping and customs to Qatar are not included. Tier 4 (a bench rover and a bench payload) is about US$ 79–204, so all four tiers come to about US$ 174–474 (an estimate that needs checking with suppliers).

That is a prototype's cost. A certified, installed and maintained product, and a real operated drone or rescue robot, we have not priced, so we will not quote a number. Who pays: the building operator or employer (workers' accommodation must already have alarms by law); funding and operation are for agreement with the authorities.` },
      src: ['build.html', 'plan.html'], doc: 'pitch Q&A B3, R13; plan.html (Cost)', f: ['jud-rollout', 'jud-scale', 'jud-sensors-trust'], c: 1 },

    { id: 'jud-scale', aud: 'jud',
      q: { ar: 'هل يتوسّع إلى مدينة أو إلى دول الخليج؟', en: 'Does it scale to a city or the Gulf?' },
      s: { ar: ['هل يتسع لقطر كلها', 'التوسع خارج قطر', 'اختبارات الحمل'], en: ['does it scale to all of qatar', 'expand to other gulf countries', 'load tests', 'scalability'] },
      k: { ar: 'اختبارات الحمل^4, يتوسع^3, توسع^3, يتسع^2, مدينه^2, الخليج^3, دول الخليج^3, قطر كلها^2, حمل^2, scalability^3',
           en: 'load tests^4, scale^3, scales^3, scalability^3, scaling^3, city^2, gulf^3, gcc^3, all of qatar^2, expand^2, load^2, growth^2' },
      a: { ar: `بنيةً نعم، فعليًا لم نختبر. اليوم مبنى واحد؛ والمسار نفسه لكل منطقة. وفي المحاكاة نشغّل كتلة حيّ واحدة (96×64 خلية) فيها نحو 120 مقيمًا ومدرسة وموقع عمل. التوسع إلى مدينة يحتاج اختبارات حمل وتصميم بوابة لكل مبنى وتكاملًا مع أنظمة الجهة.

وللتوسع إلى دولة خليجية يلزم: حدودها، ومقارنة منشآتها بقوائمها الرسمية، وملف مرور مختلف وعطلة نهاية أسبوع مختلفة، وعتبات الحرارة والغبار وقوانينها ولغاتها. والروبوت يحتاج خريطة لكل مبنى، وعندنا نموذج واحد لمبنى سكني (53 عقدة). نقول إنه مصمَّم ليتّسع، ولم نختبر ذلك إلا في قطر.`,
           en: `In design yes; in practice we have not tested it. Today it is one building; the pipeline is the same per zone. In the simulation we run one district block (96×64 cells) with about 120 residents, a school and a worksite. Scaling to a city needs load tests, a gateway design per building and integration with the authority's systems.

Extending to another Gulf state needs: its boundary, a check of its facilities against its official lists, a different traffic profile and weekend, and that state's heat and dust thresholds, laws and languages. The robot needs a plan of each building, and we have one model of a residential building (53 nodes). We say it is designed to scale, and we have tested only Qatar.` },
      src: ['pitch.html', 'plan.html'], doc: 'pitch Q&A B4, N7, R14', f: ['jud-rollout', 'jud-osm', 'jud-limits'] },

    { id: 'jud-routing', aud: 'jud',
      q: { ar: 'كيف تختار منارة أسرع وحدة استجابة؟', en: 'How does MANARA pick the fastest responder?' },
      s: { ar: ['لماذا الأسرع لا الأقرب', 'خوارزمية الإرسال', 'كيف تحسبون زمن الوصول', 'dijkstra على الطرق'], en: ['why fastest not nearest', 'dispatch algorithm', 'how do you compute the eta', 'which unit responds', 'dijkstra on roads'] },
      k: { ar: 'خوارزميه الارسال^4, اسرع^3, الاسرع^3, اقرب^2, الاقرب^2, زمن الوصول^3, eta^3, ديكسترا^3, خوارزميه^3, ازدحام^2, مرور^2, اختيار الوحده^3, اقرب جهه استجابه^3',
           en: 'dispatch algorithm^4, fastest^3, nearest^2, closest^2, eta^3, arrival time^3, dijkstra^3, algorithm^3, congestion^2, traffic^2, which unit^3, responder^3, routing^3, fastest unit^3, speedy' },
      a: { ar: `بمن يصل **أسرع** بحسب الازدحام، لا بمن هو أقرب على الخريطة. لكل نوع وحدة (إطفاء/إنقاذ، إسعاف، شرطة) نأخذ كل محطة ونحسب زمن الطريق بخوارزمية ديكسترا على شبكة الطرق من OpenStreetMap: زمن كل طريق = الطول ÷ (السرعة الحرة × الازدحام)، ونحذف الطرق المغلقة، ونتجاوز الوحدات المشغولة، ونختار أقل زمن وصول.

ونعرض صاحب المركز الثاني والمسافة ليرى المشغّل السبب (مثلًا «المحطة ب أبعد بنحو كيلومتر لكنها أسرع بـ 47 ثانية بسبب ازدحام الذروة» — SIM). والمرور في العرض **محاكى**، والمحطات افتراضية، و**999 هو من يرسل فعلًا**.`,
           en: `By who gets there **fastest** given traffic, not who is closest on the map. For each unit type (fire/rescue, ambulance, police) we take every station and compute road travel time with Dijkstra over the OpenStreetMap road graph: each road's time is length ÷ (free-flow speed × congestion); closed roads are removed, busy units skipped, and the smallest ETA wins.

We show the runner-up and the distance so the operator sees why (for example "Station B is about a kilometre farther but 47 seconds faster because of rush-hour traffic": SIM). The traffic in the demo is **simulated**, the stations are fictional, and **999 is what really dispatches**.` },
      m: { ar: `يُعاد حساب زمن الوصول كل ثانية، وتُعيد الوحدات في الطريق توجيه نفسها حول الازدحام الجديد، وتُحذف الطرق المغلقة (سيول، حريق، طوق). وإذا صار مركز أبعد أسرع بهامش واضح، أو أصبحت الوحدة المختارة مشغولة، تعيد منارة الإرسال تلقائيًا وتخبر المشغّل بالسبب. جرّبوا في غرفة العمليات: انقروا طريقًا لتزحموه أو تغلقوه.`,
           en: `Estimated arrival is recomputed every second, en-route units re-route around new jams, and closed roads (flood, fire, cordon) are removed from the graph. If a farther station becomes faster by a clear margin, or the chosen unit becomes busy, MANARA re-dispatches automatically and tells the operator why. Try it in Mission Control: click a road to jam or close it.` },
      src: ['mission.html', 'control.html', 'pitch.html'], doc: 'pitch Q&A D1, D2; docs/MANARA-SPEC.md (Nearest-responder dispatch)', f: ['jud-fastest-vs-nearest', 'jud-traffic', 'jud-dispatch'] },

    { id: 'jud-fastest-vs-nearest', aud: 'jud',
      q: { ar: 'ما الفرق الفعلي بين «الأسرع» و«الأقرب» في المحاكاة؟', en: 'What is the real gap between fastest and nearest?' },
      s: { ar: ['64.7%', 'كم ثانية توفرون', 'الوسيط واحد'], en: ['64.7%', 'how many seconds do you save', 'the median is the same', 'nearest versus fastest numbers'] },
      k: { ar: 'مقارنه بالاقرب^5, كم ثانيه^4, 64.7^3, 31.1^3, 1133^3, 1071^3, 63 ثانيه^3, توفير^2, الذيل^2, الفرق الفعلي^3, الاسرع مقابل الاقرب^3',
           en: 'compared to the nearest^5, compared with the nearest^5, how many seconds^4, 64.7^3, 31.1^3, 1,133^3, 1,071^3, 63 seconds^3, saving^2, tail^2, actual difference^3, fastest versus nearest^3, farther but faster^3' },
      a: { ar: `نتيجة صريحة: على 150 حادثًا محاكى (البذرة 7، الأحد 07:30، حريق وغاز وسيول واستغاثة) يختلف اختيار الوحدة الأولى عن الأقرب في **64.7%** من الحوادث، وفي **31.1%** من اختيارات الوحدات يكون المختار أبعد لكنه أسرع.

متوسط زمن وصول أول وحدة 1,133 ثانية للأقرب مقابل 1,071 لمنارة (توفير 63 ثانية)، والمئين التسعون 2,480 مقابل 2,333؛ لكن **الوسيط واحد** (725.5 ثانية) في الحالتين. أي أن الفائدة تتركز في الذيل وفي مواقع بعيدة عن الطرق. وهي محاكاة (SIM) فحص للآلية لا برهان على الأثر، وتتغير مع البذرة والساعة والمرور.`,
           en: `An honest result: on 150 simulated incidents (seed 7, Sunday 07:30, fire, gas, flood and SOS) the first unit chosen differs from the nearest in **64.7%** of incidents, and in **31.1%** of unit choices the one chosen is farther but faster.

The mean arrival time of the first unit is 1,133 seconds for the nearest against 1,071 for MANARA (a saving of 63 seconds), and the 90th percentile 2,480 against 2,333; but the **median is the same** (725.5 seconds) in both. So the benefit is concentrated in the tail and in places far from roads. It is a simulation (SIM), a mechanism check, not proof of impact, and it changes with the seed, the hour and the traffic.` },
      src: ['mission.html', 'report.html'], doc: 'pitch Q&A N13', f: ['jud-routing', 'jud-traffic', 'jud-sim-vs-real'] },

    { id: 'jud-traffic', aud: 'jud',
      q: { ar: 'هل المرور حقيقي؟ وهل الأزمنة واقعية؟', en: 'Is the traffic real? Are the times realistic?' },
      s: { ar: ['من أين المرور', 'هل المرور حقيقي', 'كيف تعرفون أن الأزمنة واقعية', 'مزود مرور حي'], en: ['is the traffic real', 'where does the traffic come from', 'how do you know the times are realistic', 'live traffic provider', 'why not google maps'] },
      k: { ar: 'المرور^4, مرور^4, حقيقي^1, واقعيه^3, ازمنه^2, خرائط جوجل^3, google maps^3, مزود مرور^2, الذروه^2',
           en: 'traffic^4, is the traffic real^5, realistic^3, times^2, google maps^3, live traffic^3, congestion^2, rush hour^2, peaks^2, why not google^3' },
      a: { ar: `لا. المرور محاكى ويُكتب عليه SIM في كل مكان: زمن كل مقطع = الطول ÷ (السرعة الحرة × الازدحام)، وأشكال الذروة افتراضات. والسرعات الحرة من وسم maxspeed في OSM حيث وُجد (نحو 36% من المقاطع) وإلا فافتراض موسوم بحسب صنف الطريق.

ولا نعرف بعد إن كانت الأزمنة واقعية: ما فعلناه فحوص سلامة فقط. وسنقارن الأزمنة المحاكاة بتطبيق ملاحة عند ساعات ثابتة على 10 مسارات على الأقل ونبلّغ عن الخطأ مهما كان. وفي النشر الحقيقي يأتي زمن الوصول من مزوّد مرور حيّ أو من بيانات الجهة. ولا نستخدم خرائط Google لأن العرض يجب أن يعمل دون إنترنت ولأننا نحتاج الشبكة نفسها لنغيّر تكلفتها ونحاكي.`,
           en: `No. The traffic is simulated and says SIM everywhere: each segment's time = length ÷ (free-flow speed × congestion), and the peak shapes are assumptions. Free-flow speeds come from OSM's maxspeed tag where it exists (about 36% of segments) and otherwise from a labelled class default.

We do not know yet whether the times are realistic: what we did are sanity checks only. We will compare simulated times with a navigation app at fixed hours on at least 10 routes and report the error whatever it is. In a real deployment the arrival time should come from a live traffic provider or the authority's data. We do not use Google Maps because the demo must work with no internet and because we need the network itself to change its costs and simulate.` },
      src: ['mission.html', 'report.html'], doc: 'pitch Q&A N2, N9, N12, D3', f: ['jud-routing', 'jud-osm', 'jud-offline'] },

    { id: 'jud-dispatch', aud: 'jud',
      q: { ar: 'مَن يرسل الوحدات فعلًا؟ وكيف يُختار المستشفى؟', en: 'Who actually dispatches, and how is the hospital chosen?' },
      s: { ar: ['هل تتصلون بـ 999', 'حالات التوصية', 'قدرة المستشفى'], en: ['who sends the ambulance', 'dispatch states', 'hospital capability', 'which hospital'] },
      k: { ar: 'يرسل^3, ارسال^2, مرسل^2, 999^2, مستشفى^3, حاله^1, حالات التوصيه^3, cad^2, مؤسسه حمد^2, اقرب مستشفى^3',
           en: 'sends the ambulance^5, who sends^4, dispatch^3, dispatches^3, dispatcher^3, 999^2, hospital^3, hospitals^3, states^1, recommended^2, cad^2, hamad^2, which hospital^3' },
      a: { ar: `**999** هو من يرسل: غرفة عمليات وزارة الداخلية ترسل الدفاع المدني، وخدمة الإسعاف في مؤسسة حمد ترسل الإسعاف. منارة لا تتصل بهم ولا تحلّ محلهم؛ تُعدّ حزمة موثّقة وتوصي بوحدة. وللتوصية حالات: مقترحة ← معتمدة ← مُرسلة ← في الطريق ← في الموقع ← أُنهيت، لكل منها وقتها.

والمستشفى: الأقرب ليس دائمًا الأفضل، فنستخدم علامات القدرة (قسم طوارئ 24 ساعة، مركز صدمات من المستوى الأول، طوارئ أطفال) مع افتراض سعة موسوم، ثم نختار الأسرع بين من يناسب. مستشفيات العرض افتراضية، وفي الواقع يقرر المسعفون الوجهة. والربط الحقيقي بنظام الإرسال يحتاج اتفاقًا، ولا ندّعي أنه تم.`,
           en: `**999** dispatches: the Ministry of Interior's control room dispatches Civil Defence, and HMC's ambulance service dispatches ambulances. MANARA does not call them or replace them; it prepares a verified package and recommends a unit. A recommendation moves through states: recommended, approved, dispatched, en route, on scene, cleared, each timestamped.

Hospital: the nearest is not always best, so we use capability flags (24-hour emergency department, Level I trauma centre, paediatric emergency) plus a labelled capacity assumption, then pick the fastest among those that fit. The demo hospitals are fictional, and in reality the paramedics decide the destination. A real link to a dispatch system needs an agreement, and we do not claim it exists.` },
      src: ['mission.html', 'pitch.html'], doc: 'pitch Q&A D4, D5', f: ['jud-routing', 'jud-handoff', 'res-numbers'], c: 1 },

    { id: 'jud-osm', aud: 'jud',
      q: { ar: 'من أين بيانات الخريطة؟ وما مدى اكتمالها؟', en: 'Where does the map data come from, and how complete is it?' },
      s: { ar: ['ما هو OpenStreetMap', 'رخصة ODbL', 'من يملك البيانات'], en: ['what is openstreetmap', 'odbl licence', 'who owns the data', 'map data completeness'] },
      k: { ar: 'لقطه الخريطه^5, من يملك البيانات^4, خريطه^3, خرائط^2, بيانات الخريطه^3, openstreetmap^3, osm^3, odbl^3, رخصه^2, منشات^2, مراكز اطفاء^2, اكتمال^3',
           en: 'map snapshot^5, snapshot^4, who owns the data^4, ownership^3, map^3, map data^3, openstreetmap^3, osm^3, odbl^3, licence^2, license^2, facilities^2, fire stations^2, completeness^3, attribution^2, data source^3' },
      a: { ar: `من OpenStreetMap: لقطة بتاريخ 8 أكتوبر 2026 يبنيها سكربت في المستودع إلى ثلاثة ملفات: حدود قطر، و138 منشأة (72 مستشفى، و21 مركز إطفاء، و41 مركز شرطة، و3 نقاط إسعاف…)، وشبكة طرق رئيسية طولها 6,116 كم. البيانات © مساهمو OpenStreetMap برخصة ODbL 1.0، ونُبقي نص النسب في كل صفحة ترسم الخريطة.

قارنّا المنشآت بقوائم رسمية وجدناها: ما ينقص موسوم «مفقود» ولا نخترع له إحداثيات (21 مركز إطفاء في الخريطة مقابل 23 مركزًا رسميًا للدفاع المدني). هذه فجوات في البيانات لا ادعاءات عن الخدمة الحقيقية. وفي نشر حقيقي تتقدم بيانات الجهة.`,
           en: `From OpenStreetMap: a snapshot dated 8 October 2026 that a script in the repository turns into three files: the outline of Qatar, 138 facilities (72 hospitals, 21 fire stations, 41 police posts, 3 ambulance points…) and a major-road network of 6,116 km. The data is © OpenStreetMap contributors under the ODbL 1.0 licence, and we keep the attribution text on every page that draws the map.

We checked the facilities against the official lists we could find: anything missing is marked MISSING and we invent no coordinates (21 fire stations on the map against 23 official Civil Defence centres). These are gaps in the data, not claims about the real service. In a real deployment the authority's own data would take precedence.` },
      src: ['mission.html', 'report.html'], doc: 'pitch Q&A N1, N4, N5', f: ['jud-traffic', 'jud-offline', 'jud-routing'] },

    { id: 'jud-offline', aud: 'both',
      q: { ar: 'هل يعمل دون إنترنت أو دون كهرباء أو شبكة؟', en: 'Does it work without internet, network or power?' },
      s: { ar: ['وماذا لو انقطعت الشبكة', 'يعمل في وضع الطيران', 'وماذا لو انقطعت الكهرباء'], en: ['what if the network is down', 'works in airplane mode', 'what if the power fails', 'offline'] },
      k: { ar: 'دون انترنت^3, بدون انترنت^3, اوفلاين^3, offline^3, الشبكه^3, انقطاع^3, كهرباء^3, بطاريه^1, وضع الطيران^3, file^1',
           en: 'offline^3, without internet^3, no internet^3, network down^3, network^2, power^3, power cut^3, power failure^3, outage^3, airplane mode^3, battery backup^2' },
      a: { ar: `**الشبكة:** إنذار الحارس وأسهم المخارج يعملان على اللوحة نفسها دون شبكة. وتسجيل الحضور يعمل عبر نقطة وايفاي دون إنترنت «MANARA-SAFE». وتنتظر حزمة التسليم في طابور حتى تعود الشبكة. وعرضنا كله ملفات تعمل من المجلد (file://) دون خادم ودون مكتبات ودون طلبات شبكة؛ وهذه المحادثة كذلك. ما يتعطل دون شبكة: تنبيهات الهواتف خارج الوايفاي المحلي والربط بالجهة (وهو غير موجود أصلًا).

**الكهرباء:** الحارس الحقيقي يحتاج بطارية احتياطية وإنذارًا عند فقد التيار. لوحة العرض تعمل من USB ولم نختبر سلوكها عند الانقطاع، ونضع ذلك ضمن حدودنا.`,
           en: `**Network:** the sentinel's alarm and exit arrows run on the board itself, no network needed. Check-in works through an offline Wi-Fi access point, MANARA-SAFE. The hand-off package waits in a queue until a link returns. Our whole demo is local files that run straight from the folder (file://) with no server, no libraries and no network requests, and so does this chat. What fails without a network: phone alerts beyond the local Wi-Fi, and the link to the authority (which does not exist yet anyway).

**Power:** a real sentinel needs a battery backup and a power-loss alert. The booth board runs from USB power and we have not tested its behaviour in an outage; we list it among our limits.` },
      src: ['build.html', 'index.html'], doc: 'pitch Q&A B6, B7, N10', f: ['jud-sense', 'jud-security', 'jud-limits'] },

    { id: 'jud-sensors-trust', aud: 'jud',
      q: { ar: 'هل يمكن الاعتماد على الحسّاسات الرخيصة؟', en: 'Can the cheap sensors be trusted?' },
      s: { ar: ['حساسات MQ', 'معايرة الحساسات', 'من يصيّن الحساسات'], en: ['mq sensors', 'sensor calibration', 'who maintains the sensors', 'sensor drift'] },
      k: { ar: 'حساسات الغاز^4, يصين^3, رخيصه^3, موثوقه^3, الاعتماد^2, mq^3, معايره^3, صيانه^3, انجراف^3, استرشادي^3, تسخين^2, يعطل^2',
           en: 'gas sensors^4, sensors accurate^4, accurate enough^3, maintain^3, maintains^3, cheap^3, trusted^3, trust^3, reliable^3, mq^3, calibration^3, maintenance^3, drift^3, indicative^3, burn-in^2, fails^2, broken sensor^2' },
      a: { ar: `ليست موثوقة وحدها. حسّاسات MQ حسّاسة لغازات متعددة وتنجرف مع الحرارة والرطوبة، وتطلب صحائف بياناتها تسخينًا لا يقل عن 48 ساعة؛ وتسخين الدقائق الثلاث على الطاولة يعطي قراءات استرشادية فقط. لهذا يحتاج كل إنذار إلى مفتاحين مستقلين، ونكتب «استرشادي» على قراءات ppm، ومنارة مكمِّلة: لا تحلّ محل جهاز إنذار حريق أو كاشف غاز معتمد.

والصيانة الحقيقية عمل حقيقي: تُرسل الحسّاسات نبضًا دوريًا ونفحص «الحسّاس العالق»، لكن حسّاسات الغاز تحتاج معايرة واستبدالًا، والبطاريات تشيخ أسرع في الحرارة. لم نُجرِ اختبارًا طويل الأمد.`,
           en: `Not on their own. MQ-type gas sensors respond to several gases and drift with temperature and humidity, and their datasheets ask for at least 48 hours of burn-in; the three-minute warm-up at the booth gives indicative readings only. That is why every alarm needs two independent keys, why we label ppm values "indicative", and why MANARA is a complement: it never replaces a certified fire alarm or gas detector.

Real maintenance is real work: sentinels report a heartbeat and we check for a stuck sensor, but gas sensors need calibration and replacement, and batteries age faster in heat. We have not run a long-term test.` },
      src: ['build.html', 'detect.html'], doc: 'pitch Q&A P5, B5', f: ['jud-thresholds', 'jud-security', 'jud-sense'] },

    { id: 'jud-thresholds', aud: 'jud',
      q: { ar: 'من أين عتبات الغاز والغبار والحرارة؟', en: 'Where do the gas, dust and heat thresholds come from?' },
      s: { ar: ['هل العتبات آمنة', 'ما حد WBGT', 'حدود الغبار PM10'], en: ['are the thresholds safe', 'what is the wbgt limit', 'pm10 limits', 'ppm limits'] },
      k: { ar: 'عتبات^3, عتبه^3, حدود^2, ppm^3, pm10^3, wbgt^3, 32.1^3, niosh^2, osha^2, منظمه الصحه^2, معايير^2',
           en: 'thresholds^3, threshold^3, limits^2, ppm^3, pm10^3, wbgt^3, 32.1^3, niosh^2, osha^2, epa^2, who^2, standards^3, guidance^2' },
      a: { ar: `مأخوذة من إرشادات دولية للبالغين الأصحاء (NIOSH وOSHA ووكالة حماية البيئة الأمريكية ومنظمة الصحة العالمية) ومن قانون قطر للحرارة، وكل رقم يظهر مع مصدره. من الأمثلة: الحرارة — يجب إيقاف كل عمل عند WBGT مقيس فوق 32.1 °م (قطر)؛ الغبار — تحذير عند PM10 قدره 150 ميكروغرام/م³ (المعيار اليومي في قطر)؛ أول أكسيد الكربون — تحذير عند 35 ppm.

وقد يتضرر الأطفال وكبار السن والمرضى عند مستويات أقل. نكتب على الشاشة «إرشاد دولي»، ومنارة غير معتمدة ولا تحلّ محل جهاز معتمد. وقيمة WBGT من مستشعر حرارة ورطوبة تقدير نكتبه على الشاشة.`,
           en: `They come from international guidance for healthy adults (NIOSH, OSHA, the US EPA, WHO) and from Qatar's heat rules, and every number is shown with its source. Examples: heat — all work must stop at a measured WBGT above 32.1 °C (Qatar); dust — warn at PM10 of 150 µg/m³ (Qatar's 24-hour standard); carbon monoxide — warn at 35 ppm.

Children, older people and sick people can be harmed at lower levels. The screen says "international guidance", and MANARA is not certified and does not replace a certified device. A WBGT from a temperature and humidity sensor is an estimate, and the screen says so.` },
      src: ['detect.html', 'report.html'], doc: 'pitch Q&A P9; docs/MANARA-HAZARDS.md §5, §7, §8', f: ['jud-wbgt', 'jud-sensors-trust', 'res-heat'], c: 1 },

    { id: 'jud-wbgt', aud: 'jud',
      q: { ar: 'ماذا تضيف منارة إلى حظر العمل وقت الظهيرة؟', en: 'What does MANARA add to the midday work ban?' },
      s: { ar: ['ماذا تضيف منارة إلى المنع', 'دراسة منظمة العمل الدولية'], en: ['what does manara add to the ban', 'ilo study', 'nudge not enforcement'] },
      k: { ar: 'ماذا تضيف منارة^4, تضيف منارة^4, حظر العمل^2, المنع^2, عمال^2, وزاره العمل^2, منظمه العمل الدوليه^3, ilo^3, تنظيم الوتيره^2, تذكير^2',
           en: 'what does manara add^4, manara add^4, work ban^2, midday ban^2, workers^2, ministry of labour^2, ilo^3, self-pace^2, nudge^3, enforcement^2, wbgt estimate^3' },
      a: { ar: `المنع جدول زمني (10:00–15:30 من 1 يونيو إلى 15 سبتمبر)، وحدّ 32.1 °م يتطلب قياسًا في موقع العمل. منارة تحوّل القياس إلى رسالة شخصية «توقف واذهب إلى الظل» بلغة العامل، وتحصي من وصل إلى مكان التبريد.

ووجدت دراسة منظمة العمل الدولية 2019 أن العمال الذين يستطيعون تنظيم وتيرتهم وأخذ الاستراحة كانوا أقل عرضة للإجهاد الحراري، فنصمّم تذكيرًا لا إجبارًا. وقيمة WBGT من مستشعر حرارة ورطوبة **تقدير** نكتبه على الشاشة؛ الرقم القانوني يحتاج مقياسًا بكرة سوداء. ومنارة لا تُنفّذ القانون ولا تعتمد صاحب عمل.`,
           en: `The ban is a schedule (10:00–15:30 from 1 June to 15 September), and the 32.1 °C limit needs a measurement at the workplace. MANARA turns a measurement into a personal "stop and go to shade" message in the worker's language and counts who reached the cooling shelter.

The ILO study (2019) found workers who could self-pace and rest had lower heat strain, so we design a nudge, not enforcement. A WBGT from a temperature and humidity sensor is an **estimate** and the screen says so; the legal figure needs a black-globe thermometer. MANARA does not enforce the law or certify an employer.` },
      src: ['alert.html', 'guide.html'], doc: 'pitch Q&A P8; docs/MANARA-HAZARDS.md §8', f: ['res-heat', 'jud-thresholds', 'jud-hazards'], c: 1 },

    { id: 'jud-security', aud: 'jud',
      q: { ar: 'وماذا لو اختُرق حسّاس أو أُرسل تنبيه مزوَّر؟', en: 'What if a sensor is hacked or a fake alert is sent?' },
      s: { ar: ['الأمان السيبراني', 'التوقيع التشفيري'], en: ['cyber security', 'message signing', 'hacking risk'] },
      k: { ar: 'اختراق^3, مخترق^3, مزور^3, تزوير^3, امن^2, تشفير^3, توقيع^3, هجوم^2', en: 'hacked^3, hack^3, hacking^3, fake alert^3, forged^3, security^3, cyber^3, encryption^3, signing^3, attack^2, spoof^2' },
      a: { ar: `خطر حقيقي. في النموذج الأولي يحدّ من الضرر وجود مفتاحين مستقلين وموافقة إنسان، لكن لا يوجد بعد توقيع تشفيري للرسائل ولا ضبط وصول، وسيكونان لازمين قبل أي نشر حقيقي. ندرجه ضمن حدودنا.`,
           en: `A real risk. In the prototype, two independent keys and a human approval limit the damage, but there is no cryptographic message signing or access control yet, and both would be required before any real deployment. We list it among our limitations.` },
      src: ['report.html', 'pitch.html'], doc: 'pitch Q&A B8', f: ['jud-limits', 'jud-prove', 'jud-next'] },

    { id: 'jud-human-tests', aud: 'jud',
      q: { ar: 'هل اختبرتم الرسائل على أشخاص؟ وماذا عن الأخلاقيات؟', en: 'Have you tested the messages on people? What about ethics?' },
      s: { ar: ['موافقة مستنيرة', 'تجارب على البشر', 'اختبار الفهم'], en: ['informed consent', 'human subject tests', 'comprehension test'] },
      k: { ar: 'اختبار على اشخاص^3, اخلاقيات^3, موافقه مستنيره^3, تجارب على البشر^3, اختبار الفهم^3, مشاركين^2, ethics^3',
           en: 'tested on people^3, human subjects^3, ethics^3, informed consent^3, comprehension test^3, participants^2, user testing^3, user study^3' },
      a: { ar: `لم نُجرِ أي اختبار على أشخاص بعد. خطتنا: اختبار فهم مع بالغين أولًا، بموافقة مستنيرة ودون بيانات شخصية، وبعد نيل موافقة أخلاقيات المدرسة، ونعلن النتائج حتى لو لم تساعد البطاقات المصورة. وإلى ذلك الحين الأشخاص في العرض شخصيات افتراضية.

وأي تجربة مع تلاميذ حقيقيين تحتاج شراكة مع المدرسة وموافقة أولياء الأمور وموافقة الأخلاقيات.`,
           en: `We have not run any test with people yet. Our plan: a comprehension test with adults first, with informed consent and no personal data, after school ethics approval, and we will report the results even if the picture cards do not help. Until then the people in the demo are fictional personas.

Any trial with real pupils needs a school partnership, parental consent and ethics approval.` },
      src: ['report.html', 'pitch.html'], doc: 'pitch Q&A H3, H7', f: ['jud-next', 'res-children', 'jud-limits'] },

    { id: 'jud-real-fires', aud: 'jud',
      q: { ar: 'هل جُرِّب المشروع على حرائق حقيقية؟', en: 'Has it been tested on real fires?' },
      s: { ar: ['كيف تعرضون الحريق في القاعة', 'اختبار اللهب'], en: ['how do you demo fire in the hall', 'flame testing', 'safe demo'] },
      k: { ar: 'حرائق حقيقيه^4, اختبار اللهب^4, اللهب^3, عرض امن^4, لهب^2, تجربه ميدانيه^3, القاعه^2, بدائل امنه^3, كوب ساخن^3, مجفف شعر^3, عرض امن^2',
           en: 'real fires^4, tested on real fires^5, flame testing^4, safe demo^4, flame^3, field trial^3, hall^2, safe stand-ins^3, hot mug^3, hair dryer^3, booth safe^2, live fire^3' },
      a: { ar: `لا — ونقولها. لا يُسمح بلهب ولا غاز قابل للاشتعال ولا دخان حقيقي في القاعة، فنستعمل بدائل آمنة: كوب ساخن، وبخار معقّم، ومجفّف شعر، وكوب ماء، ومحاكاة موسومة SIM. اختُبر الكاشف على صور ومقاطع لا على حرائق مبانٍ حقيقية.

واختبار اللهب الحقيقي يحتاج مختبرًا خاضعًا للإشراف وموافقة السلامة في المدرسة أو الدفاع المدني، وهو في خطواتنا التالية. وادعاءاتنا محصورة فيما قسناه.`,
           en: `No, and we say so. No flames, flammable gas or real smoke are allowed in the hall, so we use safe stand-ins: a hot mug, sanitiser vapour, a hair dryer, a cup of water, and a simulation marked SIM. The detector was tested on photos and clips, not on real building fires.

Real-flame testing needs a supervised lab and safety approval from the school or Civil Defence, and it is in our next steps. Our claims are limited to what we measured.` },
      src: ['detect.html', 'build.html'], doc: 'pitch Q&A P4', f: ['jud-detector', 'jud-next', 'jud-sim-vs-real'] },

    { id: 'jud-next', aud: 'jud',
      q: { ar: 'ما خطوتكم التالية وماذا تحتاجون؟', en: 'What is your next step and what do you need?' },
      s: { ar: ['ما الخطوات القادمة', 'ماذا تطلبون من الحكام', 'خارطة الطريق'], en: ['what are the next steps', 'what do you need from the judges', 'roadmap'] },
      k: { ar: 'الخطوه التاليه^3, الخطوات القادمه^3, تحتاجون^3, تطلبون^3, خارطه الطريق^2, مستقبل^2, ماذا بعد^3, تمرين^2',
           en: 'next step^3, next steps^3, what do you need^3, roadmap^2, future^2, what next^3, drill^2, plans^2, ask from us^2' },
      a: { ar: `أولًا مراجعة اللغات من متحدثين أصليين؛ ثانيًا معايرة الحسّاسات وجدول لزمن الاستجابة؛ ثالثًا اختبار الفهم بموافقة أخلاقية؛ رابعًا تمرين في مبنى واحد مع حارسه ومراجعة الدفاع المدني.

ونطلب منكم: توجيهًا وتصريحًا لتمرين آمن، ومراجعين للغات ومن الصمّ والمكفوفين، وإرشادًا لنيل موافقة الأخلاقيات.`,
           en: `First native-speaker review of the languages; second sensor calibration and a latency table; third the comprehension test with ethics approval; fourth a drill in one building with its guard and a Civil Defence review.

We ask you for guidance and permission for a safe drill, reviewers for the languages and Deaf and blind reviewers, and advice on getting ethics approval.` },
      src: ['plan.html', 'pitch.html'], doc: 'pitch Q&A B10', f: ['jud-rollout', 'jud-human-tests', 'jud-limits'] },

    { id: 'jud-rollout', aud: 'jud',
      q: { ar: 'ما خطة الانتقال من النموذج إلى حيّ حقيقي؟', en: 'What is the plan to move from prototype to a real district?' },
      s: { ar: ['المراحل الثلاث', 'من يجب أن يوافق', 'مؤشرات القياس'], en: ['the three phases', 'who must approve', 'what will you measure', 'rollout plan', 'pilot'] },
      k: { ar: 'خطه التطبيق^3, خطه الانتقال^4, حي حقيقي^4, من النموذج^3, الانتقال^3, خطه^2, المراحل^3, بوابه قرار^3, التجربه^2, حي واحد^3, الموافقه^2, مؤشرات^3, ظلي^3, تجربه حي^3',
           en: 'rollout^3, rollout plan^3, plan^3, move from prototype^4, real district^4, prototype to a real district^5, deployment^3, phases^3, gate^2, pilot^3, one district^3, approvals^2, indicators^3, shadow mode^3, kpis^3' },
      a: { ar: `ثلاث مراحل بينها بوابات قرار، والمدد تقديرية: **(1) نموذج المدرسة** (الآن): محاكاة كاملة وصفحات العرض ودليل البناء، وحارس وعربة مختبر على الطاولة دون لهب ودون طيران قرب الناس. **(2) تجربة في حيّ واحد بعد موافقة الجهات:** تشغيل «ظلّي» تنبّه فيه منارة غرفة العمليات ولا ترسل شيئًا للعامة، ودرون يشغّله مشغّل مرخَّص فقط. **(3) التوسّع** بعد نتائج المرحلة 2، مع بقاء 999 هو المُرسِل.

ونقيس فعليًا: زمن الدرون قبل أول وحدة أرضية، والحوادث خارج المدى، ومن وُجد في التمارين، ومعدّل الإنذارات الكاذبة، وزمن قرار المشغّل. وأرقام SIM الحالية ستُستبدل بقياس فعلي. ولم نتحدث مع أي جهة بعد.`,
           en: `Three phases with decision gates between them, and the durations are estimates: **(1) The school model** (now): a full simulation, the demo pages and the build guide, and a sentinel and bench rover on the table with no flame and no flying near people. **(2) A one-district trial after the authorities approve:** "shadow" operation where MANARA alerts the control room and sends nothing to the public, and a drone flown only by a licensed operator. **(3) Expansion** after the phase 2 results, with 999 staying the dispatcher.

What we will actually measure: drone time before the first ground unit, incidents out of range, who is found in drills, the false-alarm rate and the operator's decision time. The current SIM numbers will be replaced by measurement. We have not yet spoken to any authority.` },
      src: ['plan.html'], doc: 'plan.html (roadmap, approvals, indicators)', f: ['jud-cost', 'jud-next', 'jud-liability'] },

    { id: 'jud-tests', aud: 'jud',
      q: { ar: 'كيف اختبرتم المشروع؟ وكم اختبارًا آليًا؟', en: 'How was it tested, and how many automated checks are there?' },
      s: { ar: ['كم عدد الاختبارات', 'هل الاختبارات تعمل', 'اختبارات آلية'], en: ['how many tests', 'do the tests pass', 'automated tests', 'test suites'] },
      k: { ar: 'اختبار^3, اختبارات^3, فحص^2, فحوص^2, اختبارات آليه^3, كم اختبار^3, نجحت^2, تغطيه^2, !حمل',
           en: 'test^3, tests^3, testing^3, automated tests^3, checks^2, how many tests^3, pass^2, suites^3, coverage^2, quality^2, !load' },
      a: { ar: `للمشروع مجموعات اختبار آلية لكل وحدة: المحرك والمحاكاة والكاشف والرسائل والبيانات والخريطة الوطنية والمسيّرة وصفحات المتصفح. آخر تشغيل مسجَّل في ملف الأعداد ({{tests.generated|التاريخ غير متاح}}) أعطى **{{tests.total|العدد غير متاح}}** فحصًا ناجحًا، والفاشل منها: {{tests.failed|غير متاح}}.

وهذه اختباراتنا نحن، وليست إثباتًا لأثر حقيقي: تتحقق من أن الشيفرة تفعل ما كتبناه، لا من أن ما كتبناه يكفي في الواقع. شغّلها بنفسك: bash manara/tools/run-all.sh.`,
           en: `The project has automated test suites for each module: the engine, the simulation, the detector, the messages, the data, the national map, the drone and the browser pages. The last run recorded in the counts file ({{tests.generated|date unavailable}}) gave **{{tests.total|count unavailable}}** passing checks, and failing: {{tests.failed|unavailable}}.

These are our own tests, not proof of real impact: they check that the code does what we wrote, not that what we wrote is enough in reality. Run them yourself: bash manara/tools/run-all.sh.` },
      src: ['report.html', 'pitch.html'], doc: 'data/test-counts.js (generated by tools/update-counts.mjs); tools/run-all.sh', f: ['jud-sim-vs-real', 'jud-limits', 'jud-team'] },

    { id: 'jud-team', aud: 'jud',
      q: { ar: 'مَن بنى المشروع؟ وماذا اشتريتم وبنيتم؟', en: 'Who built it, and what was built or bought?' },
      s: { ar: ['من بنى المشروع', 'اسم الطالب والمدرسة', 'من ساعدكم', 'من المرشد'], en: ['who built this project', 'who made this project', 'student name and school', 'who helped you', 'who is the mentor', 'team'] },
      k: { ar: 'فريق^3, من بنى^4, من صنع^4, من بنى المشروع^5, الطالب^3, طالب^2, مدرسه^2, المرشد^3, مشرف^2, ساعدني^2, اشتريت^3, بنيت^3, اسماء^2',
           en: 'team^3, who built^4, made^3, who made^4, student^3, school^2, mentor^3, supervisor^2, helped^2, bought^3, built^2, names^2, author^3' },
      a: { ar: `أسماء الفريق لا تُخزَّن هنا ولا أخترعها: هي **خانات تنتظر أن يملأها الفريق** في لوحة العرض والتقرير. الاسم: {{STUDENT_NAME}} — المدرسة: {{SCHOOL_NAME}} — الصف: {{GRADE_CLASS}} — المرشد: {{MENTOR_NAME}} — ساعدني: {{HELPED_BY}}.

وما بُني وما اشتُري: ما بناه الطالب {{BUILT_BY_STUDENT}}، وما اشتراه أو أعاد استخدامه {{BOUGHT_OR_REUSED}}. وجدول «بنيت / اشتريت / ساعدني» في التقرير هو المرجع.`,
           en: `Team names are not stored here and I will not invent them: they are **fields waiting for the team to fill in** on the Display Board and in the report. Name: {{STUDENT_NAME}} · School: {{SCHOOL_NAME}} · Class: {{GRADE_CLASS}} · Mentor: {{MENTOR_NAME}} · Helped by: {{HELPED_BY}}.

What was built and what was bought: built by the student {{BUILT_BY_STUDENT}}; bought or reused {{BOUGHT_OR_REUSED}}. The "built / bought / helped by" table in the report is the reference.` },
      src: ['poster.html', 'report.html'], doc: 'poster.html (team fields); report.html (ownership table)', f: ['jud-ai-use', 'jud-tests', 'jud-what'] },

    { id: 'jud-ai-use', aud: 'jud',
      q: { ar: 'هل استخدمتم أدوات ذكاء اصطناعي في المشروع؟', en: 'Did you use AI tools on this project?' },
      s: { ar: ['هل كتب الذكاء الاصطناعي الشيفرة', 'الإفصاح عن الأدوات'], en: ['did ai write the code', 'tool disclosure', 'chatgpt used'] },
      k: { ar: 'كتب الذكاء الاصطناعي الشيفره^5, استخدمتم ذكاء^3, ادوات ذكاء^3, افصاح^3, كتب الشيفره^2, ادوات^2, مساعده^2',
           en: 'chatgpt used^4, did you use chatgpt^5, did you use ai^3, ai tools^3, disclosure^3, wrote the code^3, tools used^3, ai help^3, chatgpt^3, copilot^2, claude^2, assistance^2' },
      a: { ar: `نعم، ونذكر ذلك صراحةً. ساعدتنا أدوات ذكاء اصطناعي في صياغة أجزاء من الشيفرة والنصوص ومسودات الترجمة؛ أما القرارات، والاختبارات، والتحقق من كل رقم ومصدره، ومراجعة اللغتين العربية والإنجليزية، فعمل الفريق (من راجع: {{HELPED_BY}}). الأدوات المستخدمة: {{AI_TOOLS_USED}}. وكل ذلك مدرج في جدول «بنيت / اشتريت / ساعدني» بالتقرير، واللغات الست مسودات.

وهذه المحادثة نفسها ليست نموذجًا لغويًا: هي بحث في إجابات كتبناها وفق مصادر المشروع.`,
           en: `Yes, and we say so openly. AI tools helped draft parts of the code, the text and the draft translations; the decisions, the testing, checking every number against its source, and reviewing the Arabic and English were the team's work (reviewed by: {{HELPED_BY}}). Tools used: {{AI_TOOLS_USED}}. All of it is listed in the report's "built / bought / helped by" table, and the six community languages are drafts.

This chat itself is not a language model: it searches answers we wrote from the project's sources.` },
      src: ['report.html', 'poster.html'], doc: 'pitch Q&A B1, B2; poster.html (team fields)', f: ['jud-team', 'jud-not-ai', 'about-bot'] },

    { id: 'jud-demo-tour', aud: 'jud',
      q: { ar: 'أين أرى كل جزء في العرض؟', en: 'Where can I see each part in the demo?' },
      s: { ar: ['ما صفحات الموقع', 'أي صفحة تعرض الكاشف', 'أين الروبوت', 'جولة في المشروع'], en: ['what pages are there', 'which page shows the detector', 'where is the robot', 'tour of the project', 'site map'] },
      k: { ar: 'اين^2, صفحات^3, صفحه^3, جوله^3, ارى^2, العرض^2, تجربه^2, رابط^2, اين الكاشف^3, اين الروبوت^3',
           en: 'where^2, pages^3, page^2, tour^3, see^2, demo^3, try^2, link^2, site map^3, where is the detector^3, where is the robot^3, navigate^2' },
      a: { ar: `- **الرئيسية:** القصة كلها من الخطر إلى الروبوت.
- **غرفة التحكم:** تغذيات المسيّرات (عادية وحرارية) وقائمة الإنذارات.
- **غرفة العمليات:** مبنى بتوأم رقمي — تحقق واعتماد وتنبيه وعدّ وتسليم، والإرسال الوطني.
- **مختبر الأدلة:** كاشف الحريق وطبقاته و«مختبر الخدع».
- **هواتف السكان:** كيف تبدو التنبيهات على الهاتف.
- **مختبر الروبوت:** روبوت البحث داخل المبنى (محاكاة).
- **بناء النموذج:** القطع والتوصيل والاختبارات.
- **العرض التقديمي · التقرير · لوحة العرض:** الشرائح، والتقرير العلمي، واللوحة للطباعة.
- **دليل الأمان · خطة التطبيق:** ما يفعله السكان، وطريق الانتقال إلى الواقع.`,
           en: `- **Home:** the whole story from danger to robot.
- **Control Room:** drone feeds (ordinary and thermal) and the alert queue.
- **Mission Control:** a building twin: verify, approve, alert, count and hand off, plus national dispatch.
- **Evidence Lab:** the fire detector, its layers and the Decoy Lab.
- **Resident Phones:** what the alerts look like on a phone.
- **Robot Lab:** the indoor search robot (simulation).
- **Build It:** parts, wiring and tests.
- **Pitch · Report · Display Board:** the slides, the scientific report and the printable board.
- **Safety Guide · Rollout Plan:** what residents do, and the path to the real world.` },
      src: ['index.html', 'control.html', 'mission.html', 'detect.html', 'alert.html', 'robot.html', 'build.html', 'pitch.html', 'report.html', 'poster.html', 'guide.html', 'plan.html'], doc: 'docs/MANARA.md (page list)', f: ['jud-what', 'jud-pipeline', 'jud-sim-vs-real'] },

    /* ====================================================================== ABOUT THE CHAT ====================================================================== */

    { id: 'about-bot', aud: 'both',
      q: { ar: 'من أنت؟ وكيف تجيب؟', en: 'Who are you, and how do you answer?' },
      s: { ar: ['هل أنت ذكاء اصطناعي', 'هل أنت إنسان', 'كيف تعمل المحادثة', 'ماذا تستطيع أن تفعل', 'ساعدني'], en: ['are you an ai', 'are you a human', 'how does this chat work', 'what can you do', 'are you chatgpt', 'how to use'] },
      k: { ar: 'ذكاء اصطناعي^3, من انت^3, انت^2, بوت^3, روبوت محادثه^3, محادثه^3, شات^3, هل انت ذكاء^3, كيف تجيب^3, ماذا تستطيع^3, كيف استخدم^3, اسال منارة^3, مساعد',
           en: 'how does this chat work^5, this chat^4, are you an ai^4, who are you^3, you^1, bot^3, chatbot^3, chat^2, are you an ai^3, are you chatgpt^3, language model^3, how do you answer^3, what can you do^3, how to use^3, ask manara^3, assistant^2' },
      a: { ar: `أنا «اسأل منارة»: **لست ذكاءً اصطناعيًا ولا نموذجًا لغويًا**. أنا بحث بقواعد في قاعدة معرفة كتبها فريق منارة من وثائق المشروع وصفحاته. أطبّع سؤالك (أحذف التشكيل والتطويل وأوحّد أشكال الألف والياء والتاء المربوطة، وأبسّط الكلمات الإنجليزية)، وأطابق كلماته وعباراته ومرادفاتها مع الإجابات المكتوبة وأتحمّل بعض الأخطاء الإملائية، ثم أعرض أقرب إجابة مع مصدرها وسبب اختيارها.

ما لا أعرفه أقوله ولا أخمّنه، وأعرض أقرب المواضيع. وأي سؤال عن لائحة أو رقم ليس عندي أقول فيه: أكِّد مع الجهة المختصة. وإن بدا أن هناك خطرًا حقيقيًا فأبدأ بتنبيه: **هذا نموذج تجريبي — اتصل بـ 999**. أعمل دون إنترنت، ورسائلك لا تغادر هذه الصفحة. يمكنك التبديل بين وضع «ساكن» ووضع «حكم/زائر» من الأعلى.`,
           en: `I am "Ask MANARA": **not an AI model and not a language model**. I am a rule-based search over a knowledge base that the MANARA team wrote from the project's documents and pages. I normalise your question (Arabic: strip diacritics and tatweel, unify alef, ya and ta marbuta; English: light stemming), match its words, phrases and synonyms against the written answers, tolerate some typos, and show the closest answer with its source and why it was chosen.

What I do not know I say, and I do not guess: I show the closest topics. For any regulation or number I do not have I say: confirm with the authority. If a message looks like a real danger I start with a banner: **this is a demo prototype — call 999**. I work offline, and your messages never leave this page. Use the switch at the top to change between Resident and Judge / Visitor mode.` },
      src: ['report.html'], doc: 'docs/MANARA.md ("Ask MANARA")', f: ['jud-what', 'res-demo-status', 'confirm-authority'] },

    { id: 'greet', aud: 'both',
      q: { ar: 'مرحبًا', en: 'Hello' },
      s: { ar: ['السلام عليكم', 'أهلا', 'صباح الخير', 'مساء الخير', 'هلا'], en: ['hi', 'hey', 'good morning', 'good evening', 'salam'] },
      k: { ar: 'مرحبا^3, هلا بك^3, اهلا^3, السلام عليكم^3, هلا^3, صباح الخير^3, مساء الخير^3, هاي^3', en: 'hello^3, marhaba^3, merhaba^3, hala^3, hi^3, hey^3, good morning^3, good evening^3, salam^3, greetings^3, hiya^3' },
      a: { ar: `أهلًا بك! أنا «اسأل منارة»، أجيب من قاعدة معرفة مكتوبة عن السلامة (للسكان) وعن المشروع وأرقامه (للحكام والزوار). اختر وضعك من الأعلى أو اضغط على أحد الأسئلة المقترحة. وفي خطر حقيقي اتصل بـ **999**.`,
           en: `Welcome! I am "Ask MANARA". I answer from a written knowledge base about safety (for residents) and about the project and its numbers (for judges and visitors). Pick your mode at the top or tap one of the suggested questions. In real danger, call **999**.` },
      src: ['index.html'], doc: 'docs/MANARA.md ("Ask MANARA")', f: ['res-fire', 'jud-what', 'about-bot'] },

    { id: 'thanks', aud: 'both',
      q: { ar: 'شكرًا', en: 'Thank you' },
      s: { ar: ['شكرا لك', 'يعطيك العافية', 'مع السلامة', 'وداعا'], en: ['thanks', 'thanks a lot', 'bye', 'goodbye', 'cheers'] },
      k: { ar: 'جزيلا^3, شكرا^3, يعطيك العافيه^3, الله يعطيك العافيه^3, مع السلامه^3, وداعا^3, تسلم^3, ممتاز^2', en: 'thanks^3, thank you^3, thank^3, bye^3, goodbye^3, cheers^3, great^2, perfect^2, nice^2' },
      a: { ar: `العفو! يمكنك تقييم الإجابة بـ«مفيد» أو «غير مفيد» (يبقى تقييمك في ذاكرة هذه الصفحة فقط)، أو تصدير المحادثة. وتذكّر: في الخطر اتصل بـ **999**.`,
           en: `You are welcome! You can rate an answer "helpful" or "not helpful" (your rating stays in this page's memory only), or export the conversation. And remember: in danger, call **999**.` },
      src: ['index.html'], doc: 'docs/MANARA.md ("Ask MANARA")', f: ['res-fire', 'jud-what', 'about-bot'] },

    { id: 'confirm-authority', aud: 'both',
      q: { ar: 'سؤال عن لائحة أو غرامة أو رقم غير موجود عندك؟', en: 'A regulation, fine or number you do not have?' },
      s: { ar: ['ما غرامة القانون', 'ما اللوائح الرسمية', 'ما الرقم الرسمي'], en: ['what is the official fine', 'what do the regulations say', 'what is the official number', 'what is the law'] },
      k: { ar: 'لائحه^3, لوائح^3, غرامه^2, قانون^2, تشريع^3, رسمي^2, الرقم الرسمي^3, قانوني^2, مخالفه^3, تعليمات^2, وزاره^2',
           en: 'regulation^3, regulations^3, fine^2, law^2, legislation^3, official^2, official number^3, legal^2, offence^3, rules^2, ministry^2, decree^3' },
      a: { ar: `أجيب فقط عمّا هو مكتوب في قاعدة معرفتي، وهي مبنية من وثائق المشروع وصفحاته. للوائح والغرامات والتصاريح والأرقام الرسمية (أرقام الخطوط الساخنة، ساعات حظر العمل، حدود جودة الهواء، فئات تصاريح الطيران…) **لا أخمّن: أكِّدها مع الجهة المختصة** قبل الاعتماد عليها، فقد تتغيّر.

وفي خطر على الحياة لا تنتظر: اتصل بـ **999**.`,
           en: `I only answer what is written in my knowledge base, which is built from the project's documents and pages. For regulations, fines, permits and official numbers (helpline numbers, work-ban hours, air-quality limits, drone permit categories…) **I do not guess: confirm them with the competent authority** before relying on them, because they can change.

If life is at risk, do not wait: call **999**.` },
      src: ['guide.html#refs', 'plan.html'], doc: 'docs/MANARA-HAZARDS.md §0 (confirm with the authority); js/guide.js', f: ['res-numbers', 'jud-aviation', 'about-bot'], c: 1 }
  ]
};
