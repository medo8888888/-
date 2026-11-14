/* MANARA («منارة») — Safety guide (guide.html).
   Classic script, no libraries, works from file://. All text is authored here as {ar,en}; the DOM is built with
   createElement/textContent only (no innerHTML). Advice is GENERAL and widely accepted; Qatar-specific numbers and
   rules carry "confirm with the authority". Contract: manara/docs/MANARA.md. */
(function () {
  'use strict';
  var M = window.Manara, L = M.L;
  function T(ar, en) { return { ar: ar, en: en }; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function $(s) { return document.getElementById(s); }

  /* ------------------------------------------------------------ references (real pages, checked Oct 2026) */
  var REFS = [
    { u: 'https://www.nfpa.org/education-and-research/home-fire-safety/escape-planning', n: T('NFPA — خطة الهروب من الحريق المنزلي', 'NFPA — Home fire escape planning') },
    { u: 'https://thepeninsulaqatar.com/article/24/05/2017/Civil-Defence-cautions-on-fire-accidents', n: T('The Peninsula (24 مايو 2017) — تحذيرات الدفاع المدني من الحرائق', 'The Peninsula, 24 May 2017 — Civil Defence cautions on fire accidents') },
    { u: 'https://www.qatar-tribune.com/article/66909/NATION/Civil-Defence-gives-summer-safety-tips', n: T('Qatar Tribune (25 مايو 2017) — نصائح الدفاع المدني: الغاز', 'Qatar Tribune, 25 May 2017 — Civil Defence summer safety tips (gas)') },
    { u: 'https://www.cdc.gov/carbon-monoxide/about/index.html', n: T('CDC — أول أكسيد الكربون', 'CDC — About carbon monoxide') },
    { u: 'https://www.weather.gov/safety/flood-during', n: T('US National Weather Service — أثناء الفيضان («استدر ولا تغرق»)', 'US National Weather Service — Flood safety during a flood ("Turn Around, Don\'t Drown")') },
    { u: 'https://redcross.org/about-us/news-and-events/news/2024/flood-watches-warnings-up-across-the-south-follow-these-safety-steps.html', n: T('الصليب الأحمر الأمريكي — خطوات السلامة عند الفيضان', 'American Red Cross — Flood safety steps') },
    { u: 'https://thepeninsulaqatar.com/article/19/10/2024/helpline-numbers-to-contact-during-heavy-rains-in-qatar', n: T('The Peninsula (19 أكتوبر 2024) — أرقام الخطوط الساخنة في الأمطار', 'The Peninsula, 19 Oct 2024 — Helpline numbers during heavy rain') },
    { u: 'https://thepeninsulaqatar.com/article/21/10/2018/Civic-authorities-in-action-after-heavy-rains', n: T('The Peninsula (21 أكتوبر 2018) — أمطار أكتوبر 2018 وغمر الأنفاق', 'The Peninsula, 21 Oct 2018 — heavy rain and flooded underpasses') },
    { u: 'https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health', n: T('WHO — تغيّر المناخ والحرارة والصحة', 'WHO — Climate change: heat and health') },
    { u: 'https://www.cdc.gov/disasters/extremeheat/pdf/Heat_Related_Illness.pdf', n: T('CDC — الأمراض المرتبطة بالحرارة', 'CDC — Heat-related illness') },
    { u: 'https://www.qatar-tribune.com/article/236943/front/midday-outdoor-work-ban-to-come-into-force-from-today-mol', n: T('Qatar Tribune (1 يونيو 2026) — حظر العمل في الهواء الطلق وقت الظهيرة', 'Qatar Tribune, 1 Jun 2026 — midday outdoor work ban') },
    { u: 'https://www.who.int/publications/i/item/9789240034228', n: T('WHO — الإرشادات العالمية لجودة الهواء 2021', 'WHO — Global air quality guidelines 2021') },
    { u: 'https://www.gulf-times.com/article/732466/qatar/moi-highlights-emergency-services-separate-system-for-the-deaf-and-early-warning-alert', n: T('Gulf Times — وزارة الداخلية: الرقم 992 للصمّ ونظام الإنذار المبكر', 'Gulf Times — MoI: 992 for Deaf callers and the early-warning system') },
    { u: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12906069/', n: T('Resuscitation Plus 2025 — سجلّ قطر الوطني للسكتة القلبية خارج المستشفى', 'Resuscitation Plus 2025 — Qatar national out-of-hospital cardiac arrest registry') },
    { u: 'https://thepeninsulaqatar.com/article/06/11/2023/moi-launches-public-warning-system-for-managing-emergencies', n: T('The Peninsula (6 نوفمبر 2023) — نظام الإنذار العام لوزارة الداخلية', 'The Peninsula, 6 Nov 2023 — MoI public warning system') }
  ];

  /* ------------------------------------------------------------ hazards */
  var HZ = [
    { id: 'fire', icon: 'fire', sc: '--danger', name: T('حريق ودخان', 'Fire and smoke'),
      call: T('اتصل بـ 999 من خارج المبنى وقل: رقم المبنى والشارع والمنطقة.', 'Call 999 from outside the building and say: building, street and zone.'),
      can: [T('لهب ودخان في الصورة بقواعد ألوان وحركة (رؤية حاسوبية بقواعد بسيطة، وليست ذكاءً اصطناعيًا).', 'Flame and smoke in the picture, using colour and motion rules (rule-based computer vision, not "AI").'),
            T('بقعة ساخنة بالكاميرا الحرارية (تباين حراري).', 'A hot spot on the thermal camera (thermal contrast).'),
            T('الروبوت داخل المبنى يبحث عن أشخاص بالحرارة والصوت.', 'The indoor robot searches for people by heat and sound.')],
      cannot: [T('لا تشمّ ولا تعرف سبب الحريق ولا تحلّ محلّ جهاز إنذار معتمد.', 'It cannot smell, does not know the cause, and does not replace a certified fire alarm.'),
               T('قد تُخطئ: بخار الطبخ أو شمس منعكسة قد تبدو كدخان. لذلك يلزم مفتاحان وموافقة مشغّل.', 'It can be wrong: cooking steam or a sun glint can look like smoke. That is why two keys and an operator are needed.'),
               T('الدخان الكثيف يحجب الكاميرا، والروبوت لا يكسر باب مقفلًا.', 'Thick smoke blinds a camera, and the robot never breaks a locked door.')],
      steps: [T('اخرج فورًا ولا تجمع أغراضك.', 'Get out now. Do not collect belongings.'),
              T('ابقَ منخفضًا تحت الدخان، وأغلق الأبواب خلفك.', 'Stay low under the smoke and close doors behind you.'),
              T('استعمل الدرج لا المصعد، وتوجّه إلى نقطة التجمّع المتفق عليها.', 'Use the stairs, not the lift, and go to your agreed meeting point.'),
              T('اتصل بـ 999 من الخارج، وأخبرهم إن كان أحد ما زال في الداخل.', 'Call 999 from outside and tell them if anyone is still inside.'),
              T('إن حُوصرت: أغلق الباب، سدّ الفتحات بقماش مبلّل، وأشِر من النافذة.', 'If trapped: shut the door, seal gaps with a wet cloth, and signal from a window.')],
      dont: [T('لا تعد إلى الداخل لأي سبب.', 'Do not go back inside for any reason.'),
             T('لا تلمس باب ساخنًا ولا تفتحه.', 'Do not open a hot door.'),
             T('لا تستعمل المصعد، ولا تختبئ تحت السرير أو في خزانة.', 'Do not use the lift, and do not hide under a bed or in a cupboard.')],
      who: T('الدفاع المدني (عبر 999). منارة تُرسل بطاقة تسليم فقط.', 'Civil Defence (via 999). MANARA only sends a hand-off card.'), refs: [1, 2] },
    { id: 'gas', icon: 'wind', sc: '--warn', name: T('تسرّب غاز', 'Gas leak'),
      call: T('اخرج أولًا، ثم اتصل بـ 999 من مكان آمن بعيد عن التسرّب.', 'Leave first, then call 999 from a safe place away from the leak.'),
      can: [T('مستشعرات غاز رخيصة في «الحارس» تعطي مؤشرًا فقط، وليست أجهزة معتمدة.', 'Low-cost gas sensors in the "sentinel" give an indication only; they are not certified instruments.'),
            T('قراءة CO أو غاز قرب الروبوت في المبنى (محاكاة).', 'A CO or gas reading near the robot inside the building (simulation).')],
      cannot: [T('الدرون لا «يرى» الغاز: لا كاميرا عادية تكشفه.', 'The drone cannot "see" gas: an ordinary camera does not show it.'),
               T('لا تعرف نوع الغاز ولا تركيزه بدقة، وقد تتأخر الحساسات أو تخطئ.', 'It does not know the exact gas or concentration, and sensors can lag or err.'),
               T('أول أكسيد الكربون بلا لون ولا رائحة، فلا تنتظر أن تشمّه [4].', 'Carbon monoxide has no colour or smell, so do not wait to smell it [4].')],
      steps: [T('افتح الأبواب والنوافذ فورًا إن كان ذلك آمنًا [3].', 'Open doors and windows at once if it is safe [3].'),
              T('أغلق أسطوانة الغاز إن وصلتَ إليها دون خطر.', 'Close the gas cylinder if you can reach it without risk.'),
              T('اخرج بالجميع، وابتعد عن المبنى مع اتجاه الريح الجانبي.', 'Take everyone out and move away from the building, crosswind.'),
              T('اتصل بـ 999 من الخارج.', 'Call 999 from outside.'),
              T('مَن شعر بصداع أو دوار أو غثيان فليتنفّس هواءً نقيًا ويطلب مساعدة طبية [4].', 'Anyone with headache, dizziness or nausea should get fresh air and medical help [4].')],
      dont: [T('لا تشغّل مفتاح كهرباء أو شفّاط هواء أو إضاءة داخل المكان [3].', 'Do not switch on lights, an exhaust fan or any switch inside [3].'),
             T('لا تُشعل عود ثقاب أو ولّاعة ولا تدخّن.', 'Do not strike a match or lighter, and do not smoke.'),
             T('لا تستعمل الهاتف داخل منطقة التسرّب؛ اتصل من الخارج.', 'Do not use a phone inside the leak area; call from outside.')],
      who: T('الدفاع المدني (999). ولشركة الغاز المزوّدة: أكِّد الرقم مع الجهة.', 'Civil Defence (999). For your gas supplier: confirm the number with the authority.'), refs: [3, 4] },
    { id: 'flood', icon: 'route', sc: '--info', name: T('سيول وأمطار غزيرة', 'Flood and heavy rain'),
      call: T('اتصل بـ 999 عند خطر على الحياة. للأمور غير العاجلة: أكِّد أرقام البلدية وأشغال من الجهة [7].', 'Call 999 when life is at risk. For non-urgent issues: confirm the Municipality and Ashghal numbers with the authority [7].'),
      can: [T('ارتفاع الماء فوق حدّ (مستشعر مسافة تجريبي) أو في الصورة.', 'Water rising past a mark (a prototype distance sensor) or in the picture.'),
            T('الدرون يرى الطرق المغمورة من الأعلى ويقترح طريقًا آخر للوحدات (محاكاة).', 'The drone can see flooded roads from above and suggest another route for units (simulation).')],
      cannot: [T('لا تعرف عمق الماء بدقة ولا قوّة التيار.', 'It cannot tell exact depth or current strength.'),
               T('لا تتنبأ بالمطر؛ المرجع هو إنذارات الأرصاد والدولة.', 'It does not forecast rain; official weather warnings are the reference.'),
               T('في المطر الشديد قد تتعذّر الطيران والكاميرا.', 'In heavy rain flying and the camera may not work.')],
      steps: [T('انتقل إلى طابق أعلى أو مكان مرتفع، وابقَ هناك [6].', 'Move to a higher floor or higher ground and stay there [6].'),
              T('ابتعد عن فتحات الصرف المكشوفة ومصادر الكهرباء [7].', 'Stay away from open drainage and electrical sources [7].'),
              T('إن اضطررت للقيادة وصادفت طريقًا مغمورًا فاستدر وخذ طريقًا آخر [5].', 'If you must drive and meet a flooded road, turn around and take another [5].'),
              T('أغلق الكهرباء الرئيسية إن دخل الماء المنزل وكان الوصول إليها آمنًا.', 'Switch off the mains if water enters and you can reach it safely.'),
              T('اتبع تعليمات الإخلاء الرسمية ولا تعد حتى يُعلَن الأمان [6].', 'Follow official evacuation instructions and do not return until it is declared safe [6].')],
      dont: [T('لا تمشِ ولا تسبح ولا تقد في مياه جارية [5][6].', 'Do not walk, swim or drive through moving water [5][6].'),
             T('لا تدخل الأنفاق والمنخفضات: غُمرت أنفاق في أكتوبر 2018 [8].', 'Do not enter underpasses or low areas: several flooded in October 2018 [8].'),
             T('لا تلمس عمودًا أو سلكًا كهربائيًا أو أي شيء متصل بالكهرباء وأنت في الماء.', 'Do not touch a pole, cable or anything electrical while in water.')],
      who: T('999 عند الخطر على الحياة؛ البلدية وأشغال وكهرماء للمشكلات الأخرى (أكِّد الأرقام).', '999 for danger to life; the Municipality, Ashghal and Kahramaa for other problems (confirm the numbers).'), refs: [5, 6, 7, 8] },
    { id: 'dust', icon: 'smoke', sc: '--warn', name: T('عاصفة غبار', 'Dust storm'),
      call: T('اتصل بـ 999 إن صعُب التنفّس أو ضاع شخص في الرؤية المنعدمة.', 'Call 999 if someone cannot breathe or is lost in near-zero visibility.'),
      can: [T('حساس جسيمات (PM) تجريبي يعطي قراءة تقريبية قرب «الحارس».', 'A prototype particle (PM) sensor gives a rough reading near the sentinel.'),
            T('الكاميرا تلاحظ هبوط الرؤية.', 'The camera notices falling visibility.')],
      cannot: [T('لا يقيس الحساس الرخيص مثل محطة رصد رسمية.', 'A low-cost sensor is not an official monitoring station.'),
               T('الدرون لا يطير في الغبار الكثيف أو الرياح القوية.', 'The drone does not fly in thick dust or strong wind.'),
               T('لا تعرف متى تنتهي العاصفة؛ المرجع هو الأرصاد.', 'It cannot know when the storm ends; the weather service is the reference.')],
      steps: [T('ادخل مبنى مغلقًا وأغلق النوافذ والأبواب.', 'Go into a closed building and close windows and doors.'),
              T('إن اضطررت للخروج فغطِّ الأنف والفم بكمّامة أو قماش مبلّل واحمِ العينين.', 'If you must go out, cover nose and mouth with a mask or damp cloth and protect your eyes.'),
              T('أبقِ الأطفال وكبار السن ومرضى الربو والرئة داخلًا.', 'Keep children, older people and people with asthma or lung disease indoors.'),
              T('قدّم الماء، وأخفض النشاط البدني.', 'Drink water and reduce physical effort.'),
              T('أكِّد مع الجهة المختصة حدود جودة الهواء المعتمدة في قطر قبل الاعتماد على أي رقم.', 'Confirm with the authority the air-quality limits used in Qatar before relying on any number.')],
      dont: [T('لا تقد بسرعة إن كانت الرؤية ضعيفة؛ توقّف في مكان آمن بعيدًا عن الطريق.', 'Do not drive fast in poor visibility; stop somewhere safe off the road.'),
             T('لا تمارس رياضة في الخارج.', 'Do not exercise outside.'),
             T('لا تفرك عينيك إن دخلهما الغبار؛ اغسلهما بماء نظيف.', 'Do not rub dust-filled eyes; rinse them with clean water.')],
      who: T('999 للطوارئ الطبية أو الحوادث. المعلومة العامة: الأرصاد وجهات البيئة (أكِّد).', '999 for medical emergencies or crashes. General information: the weather and environment authorities (confirm).'), refs: [12] },
    { id: 'heat', icon: 'thermo', sc: '--brand', name: T('حرّ شديد', 'Extreme heat'),
      call: T('اتصل بـ 999 فورًا إن ظهر على أحدهم ارتباك أو إغماء أو حرارة جسم مرتفعة جدًا [10].', 'Call 999 at once if someone is confused, faints or has a very high body temperature [10].'),
      can: [T('حرارة الهواء والرطوبة تُقدَّر منها حرارة «الكرة الرطبة» (WBGT) كمؤشر للإجهاد الحراري.', 'Air temperature and humidity give an estimated wet-bulb globe temperature (WBGT) as a heat-stress index.'),
            T('الكاميرا الحرارية قد ترى شخصًا ساقطًا، لكنها أضعف كثيرًا في الحرّ (انظر المعجم: تباين حراري).', 'A thermal camera may spot a person who has fallen, but it is much weaker in the heat (see glossary: thermal contrast).')],
      cannot: [T('لا تشخّص ضربة الشمس ولا تقيس حرارة جسم أحد.', 'It does not diagnose heat stroke or measure anyone\'s body temperature.'),
               T('الرقم التقديري ليس قياسًا رسميًا.', 'The estimated number is not an official measurement.')],
      steps: [T('ابقَ في الظل أو في مكان مبرَّد، واشرب الماء بانتظام [9].', 'Stay in shade or a cool place and drink water regularly [9].'),
              T('ارتدِ ملابس خفيفة فضفاضة، وبلّل الجلد.', 'Wear light, loose clothes and dampen your skin.'),
              T('تفقّد كبار السن ومن يعيش وحده والأطفال والعمال [9].', 'Check on older people, people living alone, children and workers [9].'),
              T('عند علامات ضربة الشمس: برّد الجسم بسرعة (ماء، مروحة، ظل) وانتظر الإسعاف [10].', 'At signs of heat stroke: cool the body fast (water, fan, shade) and wait for the ambulance [10].'),
              T('للعمال: يحظر قرار وزاري العمل في الهواء الطلق في ساعات الظهيرة صيفًا؛ أكِّد الساعات والتواريخ الحالية [11].', 'For workers: a ministerial decision bans outdoor work at midday in summer; confirm the current hours and dates [11].')],
      dont: [T('لا تترك طفلًا أو حيوانًا في سيارة متوقفة، ولو لدقائق [9].', 'Never leave a child or animal in a parked car, even for minutes [9].'),
             T('لا تعمل أو تتمرّن في الشمس وقت الظهيرة.', 'Do not work or exercise in the midday sun.'),
             T('لا تعطِ سوائل لشخص فاقد الوعي.', 'Do not give drinks to an unconscious person.')],
      who: T('999 لضربة الشمس. وللشكاوى المهنية: وزارة العمل (أكِّد).', '999 for heat stroke. For workplace complaints: the Ministry of Labour (confirm).'), refs: [9, 10, 11] },
    { id: 'help', icon: 'heart', sc: '--safe', name: T('شخص يحتاج مساعدة (حالة طبية)', 'Someone needs help (medical)'),
      call: T('اتصل بـ 999 مبكرًا، وابقَ على الخط، واتبع تعليمات المُرسِل.', 'Call 999 early, stay on the line and follow the dispatcher.'),
      can: [T('الدرون يصل أحيانًا قبل أول وحدة أرضية ويُري غرفة العمليات المكان (محاكاة).', 'The drone can sometimes arrive before the first ground unit and show the control room the scene (simulation).'),
            T('الروبوت في المبنى قد يعثر على شخص ساكن بالحرارة والصوت.', 'The indoor robot may find a still person by heat and sound.')],
      cannot: [T('لا تشخّص مرضًا ولا تعرف إن كان أحدهم يتنفّس.', 'It cannot diagnose or tell whether someone is breathing.'),
               T('لا تُجري إنعاشًا ولا تحمل جهاز صدمات. الإنسان في الموقع هو الأهم.', 'It cannot do CPR or carry a defibrillator. The person on the spot matters most.'),
               T('شخص ساكن قد يكون نائمًا؛ تخمين الحالة تقدير بقواعد، وليس تشخيصًا.', 'A still person may just be asleep; any guess is a rule-based estimate, not a diagnosis.')],
      steps: [T('تأكّد أن المكان آمن لك أولًا.', 'Check the place is safe for you first.'),
              T('اتصل بـ 999 وقل أين أنت وما حدث. إن كان المصاب أصمّ فالرقم 992 قناة مخصصة (أكِّد) [13].', 'Call 999 and say where you are and what happened. For a Deaf caller 992 is a dedicated channel (confirm) [13].'),
              T('ابقَ مع المصاب وطمئنه، وراقب تنفّسه.', 'Stay with the person, reassure them and watch their breathing.'),
              T('إن لم يستجب ولا يتنفّس فاتبع تعليمات المُرسِل، وابدأ الإنعاش إن كنت مدرَّبًا.', 'If they do not respond and are not breathing, follow the dispatcher and start CPR if you are trained.'),
              T('أرسل أحدًا ليفتح الباب للإسعاف ويُشير إلى الموقع.', 'Send someone to open the door for the ambulance and point to the spot.')],
      dont: [T('لا تحرّك مصابًا بإصابة محتملة في الرقبة أو الظهر إلا لخطر مباشر.', 'Do not move someone with a possible neck or back injury unless in immediate danger.'),
             T('لا تعطِ طعامًا أو شرابًا لمن هو شبه واعٍ.', 'Do not give food or drink to someone barely conscious.'),
             T('لا تترك المصاب وحده، ولا تُنهِ المكالمة قبل المُرسِل.', 'Do not leave the person alone, and do not end the call before the dispatcher.')],
      who: T('الإسعاف عبر 999 (مؤسسة حمد الطبية). منارة لا تتصل بدلًا منك.', 'The ambulance service via 999 (Hamad Medical Corporation). MANARA does not call for you.'), refs: [13, 14] }
  ];

  /* ------------------------------------------------------------ glossary */
  var GL = [
    { t: T('المفتاحان (two keys)', 'Two keys'), d: T('لا يتحوّل «اشتباه» إلى «مؤكَّد» بمستشعر واحد. يلزم دليلان مستقلان (مثلًا حرارة وصورة)، ثم يوافق إنسان في غرفة العمليات قبل الإنذار العام. إنذار الموقع المحلي لا ينتظر.', 'One sensor can never turn a SUSPECT into a CONFIRMED event. It takes two independent proofs (for example heat and a camera picture), then a human in the control room approves the public alert. The local alarm never waits.') },
    { t: T('الدليل قبل الذعر (proof before panic)', 'Proof before panic'), d: T('نتحقق قبل أن نوقظ حيًّا كاملًا. هذا يقلّل الإنذارات الكاذبة التي تُتعب الناس وغرفة 999، لكنه لا يلغيها.', 'We verify before waking a whole neighbourhood. This reduces false alarms that tire people and the 999 control room, but it does not remove them.') },
    { t: T('آخر مئة متر (last 100 metres)', 'Last 100 metres'), d: T('المسافة بين وصول البلاغ وخروج كل شخص بأمان: من يستيقظ، وأي باب مفتوح، ومن بقي في الداخل. هنا تحاول منارة أن تساعد، والدفاع المدني يتولى الإطفاء والإنقاذ.', 'The gap between the report and everyone being out safely: who wakes, which door is open, who is still inside. MANARA tries to help here; Civil Defence does the firefighting and rescue.') },
    { t: T('الوقت المقدّر للوصول (ETA)', 'ETA'), d: T('الدقائق المتوقعة لوصول وحدة إلى الموقع. في العرض نحسبه على مرور محاكى (SIM)، وليس على مواقع مركبات حقيقية. قد تكون الوحدة الأبعد مسافةً هي الأسرع.', 'The expected minutes for a unit to reach the scene. In the demo it is computed on simulated traffic (SIM), not on real vehicle positions. The farther unit can be the faster one.') },
    { t: T('محاكاة (SIM)', 'SIM (simulated)'), d: T('كل رقم أو مشهد معنون SIM جاء من برنامج محاكاة صنعناه بافتراضات معلنة. هو اختبار للفكرة وليس دليلًا على أثر حقيقي، وسيُقاس لاحقًا في تجربة فعلية بموافقة الجهات.', 'Any number or scene labelled SIM came from a simulation we built with stated assumptions. It tests the idea; it is not proof of real impact, and it must be measured later in a real trial with the authorities.') },
    { t: T('التباين الحراري (thermal contrast)', 'Thermal contrast'), d: T('الفرق بين حرارة جسم (شخص أو نار) وحرارة ما حوله. الكاميرا الحرارية ترى الفرق لا الحرارة المطلقة؛ في صيف قطر الحارّ تقترب حرارة الغرفة من حرارة الجسم فيقلّ التباين ويصعب رؤية الأشخاص.', 'The difference between an object\'s temperature (a person or a fire) and its surroundings. A thermal camera sees the difference, not absolute heat; in Qatar\'s hot summer the room warms toward body temperature, the contrast shrinks and people are harder to see.') },
    { t: T('رؤية حاسوبية بقواعد (rule-based)', 'Rule-based computer vision'), d: T('كاميرا + قواعد مكتوبة (ألوان، وميض، نمو المنطقة). ليست تعلّمًا عميقًا ولا ذكاءً يفهم المشهد؛ ولهذا نذكر حدودها بصراحة.', 'A camera plus written rules (colours, flicker, region growth). It is not deep learning and does not understand the scene, which is why we state its limits openly.') },
    { t: T('999 هو المُرسِل', '999 stays the dispatcher'), d: T('منارة لا ترسل الفرق ولا تقرر نيابةً عن الدولة. تُحضّر بطاقة تسليم للبشر في غرفة العمليات، والتكامل الحقيقي يحتاج اتفاقًا مع الجهة.', 'MANARA does not dispatch crews or decide for the state. It prepares a hand-off card for the humans in the control room; real integration needs an agreement with the authority.') }
  ];

  /* ------------------------------------------------------------ family plan */
  var CHECKS = [
    T('نعرف مخرجين من كل غرفة ومن البيت.', 'We know two ways out of every room and of the home.'),
    T('اتفقنا على نقطة تجمّع خارج المبنى.', 'We agreed a meeting point outside the building.'),
    T('نختبر جهاز إنذار الدخان كل شهر ونبدّل بطاريته.', 'We test the smoke alarm every month and change its battery.'),
    T('ندرّب الجميع على الخروج ليلًا في الظلام.', 'We practise getting out at night, in the dark.'),
    T('نعرف أين صمام أو أسطوانة الغاز وكيف نغلقها.', 'We know where the gas valve or cylinder is and how to close it.'),
    T('نحفظ رقم 999 وعنواننا (المبنى والشارع والمنطقة).', 'We know 999 and our address (building, street, zone).'),
    T('لدينا حقيبة صغيرة: ماء، أدوية، شاحن، مصباح، أوراق.', 'We keep a small kit: water, medicines, charger, torch, papers.'),
    T('رتّبنا مساعدة لمن لا يسمع أو لا يمشي أو لا يفهم لغة التنبيه.', 'We arranged help for anyone who cannot hear, walk or understand the alert language.'),
    T('نعرف أين ندخل في السيول والغبار والحرّ (مكان مرتفع، مغلق، مبرَّد).', 'We know where to go in flood, dust and heat (high, closed, cool).'),
    T('لا نعود إلى مبنى محترق أو مغمور حتى تُعلن الجهة الأمان.', 'We never return to a burning or flooded building until the authority says it is safe.')
  ];
  var FIELDS = ['members', 'address', 'meet1', 'meet2', 'contact', 'needs'];
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }

  /* ------------------------------------------------------------ render */
  var selected = null;
  function refLine(refs) {
    return L(T('المراجع: ', 'References: ')) + refs.map(function (n) { return '[' + n + ']'; }).join(' ');
  }
  function list(items, cls) { var u = el('ul', 'l' + (cls ? ' ' + cls : '')); items.forEach(function (x) { u.appendChild(el('li', null, L(x))); }); return u; }

  function renderPicker() {
    var box = $('pk-btns');
    box.textContent = '';
    HZ.forEach(function (h) {
      var b = el('button', 'pk-btn'); b.type = 'button'; b.setAttribute('data-hz', h.id);
      b.setAttribute('aria-pressed', selected === h.id ? 'true' : 'false'); b.style.setProperty('--sc', 'var(' + h.sc + ')');
      b.insertAdjacentHTML('afterbegin', M.icon(h.icon));
      b.appendChild(el('span', null, L(h.name)));
      b.addEventListener('click', function () { select(h.id, true); });
      box.appendChild(b);
    });
    renderOut();
  }
  function renderOut() {
    var out = $('pk-out'); out.textContent = '';
    var h = HZ.filter(function (x) { return x.id === selected; })[0];
    if (!h) { out.style.removeProperty('--sc'); out.appendChild(el('p', 'pk-empty', L(T('اختر الخطر من الأزرار أعلاه لترى ما تفعله الآن.', 'Choose a hazard above to see what to do now.')))); return; }
    out.style.setProperty('--sc', 'var(' + h.sc + ')');
    out.appendChild(el('h3', null, L(h.name)));
    var c = el('div', 'pk-call'); c.appendChild(el('span', 'gd-999 num', '999')); c.appendChild(el('span', null, L(h.call))); out.appendChild(c);
    var ol = el('ol', 'pk-steps'); h.steps.forEach(function (s) { ol.appendChild(el('li', null, L(s))); }); out.appendChild(ol);
    var d = el('div', 'pk-dont'); d.appendChild(el('h4', null, L(T('لا تفعل', 'Do NOT')))); d.appendChild(list(h.dont)); out.appendChild(d);
    out.appendChild(el('p', 'pk-more muted', L(T('إرشادات عامة، وليست بديلًا عن تعليمات الدفاع المدني. ', 'General advice, not a replacement for Civil Defence instructions. ')) + refLine(h.refs)));
  }
  function select(id, focus) {
    selected = id;
    Array.prototype.forEach.call($('pk-btns').children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-hz') === id ? 'true' : 'false'); });
    renderOut();
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// may refuse */ }
    if (focus) { var o = $('pk-out'); if (o.scrollIntoView) o.scrollIntoView({ block: 'nearest', behavior: M.reduce ? 'auto' : 'smooth' }); }
  }

  function renderCards() {
    var g = $('hz-grid'); g.textContent = '';
    HZ.forEach(function (h) {
      var a = el('article', 'card hz'); a.id = 'hz-' + h.id; a.style.setProperty('--sc', 'var(' + h.sc + ')');
      var t = el('h3'); t.insertAdjacentHTML('afterbegin', M.icon(h.icon)); t.appendChild(el('span', null, L(h.name))); a.appendChild(t);
      var s = el('div', 'hz-sense');
      var c1 = el('div'); c1.appendChild(el('h4', null, L(T('ما تستطيع منارة استشعاره', 'What MANARA can sense')))); c1.appendChild(list(h.can)); s.appendChild(c1);
      var c2 = el('div'); c2.appendChild(el('h4', null, L(T('ما لا تستطيعه', 'What it cannot do')))); c2.appendChild(list(h.cannot, 'no')); s.appendChild(c2);
      a.appendChild(s);
      var d = el('div'); d.appendChild(el('h4', null, L(T('ماذا يفعل السكان', 'What residents should do')))); d.appendChild(list(h.steps)); a.appendChild(d);
      var n = el('div'); n.appendChild(el('h4', null, L(T('ما لا يفعلونه', 'What NOT to do')))); n.appendChild(list(h.dont, 'no')); a.appendChild(n);
      var w = el('p', 'hz-who'); w.appendChild(el('span', 'tag danger', L(T('من يُستدعى', 'Who is called')))); w.appendChild(el('span', null, L(h.who))); a.appendChild(w);
      a.appendChild(el('p', 'hz-refs', refLine(h.refs)));
      g.appendChild(a);
    });
  }

  function renderGlossary() {
    var g = $('gl'); var open = {};
    Array.prototype.forEach.call(g.children, function (d, i) { open[i] = d.open; });
    g.textContent = '';
    GL.forEach(function (x, i) {
      var d = el('details'); if (open[i]) d.open = true;
      d.appendChild(el('summary', null, L(x.t))); d.appendChild(el('p', null, L(x.d))); g.appendChild(d);
    });
  }

  function renderChecks() {
    var box = $('fp-check'); var saved = {};
    Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) { saved[i.getAttribute('data-k')] = i.checked; });
    box.textContent = '';
    CHECKS.forEach(function (c, i) {
      var lab = el('label'), inp = el('input'); inp.type = 'checkbox'; inp.setAttribute('data-k', 'c' + i);
      inp.checked = saved['c' + i] != null ? saved['c' + i] : sget('manara-guide-c' + i) === '1';
      inp.addEventListener('change', function () { sset('manara-guide-c' + i, inp.checked ? '1' : '0'); });
      lab.appendChild(inp); lab.appendChild(el('span', null, L(c))); box.appendChild(lab);
    });
  }

  function renderRefs() {
    var o = $('refs-list'); o.textContent = '';
    REFS.forEach(function (r) {
      var li = el('li'), d = el('div');
      d.appendChild(el('div', null, L(r.n)));
      var a = el('a', null, r.u); a.href = r.u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('dir', 'ltr');
      d.appendChild(a); li.appendChild(d); o.appendChild(li);
    });
  }

  function bindFields() {
    FIELDS.forEach(function (f) {
      var n = document.querySelector('[data-fp="' + f + '"]'); if (!n) return;
      var v = sget('manara-guide-' + f); if (v != null) n.value = v;
      n.addEventListener('input', function () { sset('manara-guide-' + f, n.value); });
    });
    $('fp-print').addEventListener('click', function () { window.print(); });
    $('fp-clear').addEventListener('click', function () {
      FIELDS.forEach(function (f) { var n = document.querySelector('[data-fp="' + f + '"]'); if (n) { n.value = ''; sset('manara-guide-' + f, ''); } });
      Array.prototype.forEach.call($('fp-check').querySelectorAll('input'), function (i) { i.checked = false; sset('manara-guide-' + i.getAttribute('data-k'), '0'); });
    });
  }

  function init() {
    var h = (location.hash || '').replace('#', '');
    if (HZ.some(function (x) { return x.id === h; })) selected = h;
    renderPicker(); renderCards(); renderGlossary(); renderChecks(); renderRefs(); bindFields();
    window.addEventListener('langchange', function () { renderPicker(); renderCards(); renderGlossary(); renderChecks(); renderRefs(); });
    window.__guideReady = true;
  }
  if (window.__manaraReady) init(); else window.addEventListener('DOMContentLoaded', init);
  /* Manara.core boots on DOMContentLoaded too (it registered first), so by the time init runs the shell exists. */
  window.GUIDE = { HZ: HZ, REFS: REFS, select: select };
})();
