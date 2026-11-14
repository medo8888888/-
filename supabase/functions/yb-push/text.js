// The words of a phone notification, made from a yb_notifications row (kind + data). Short on purpose: the full
// text, any note and the times are in the account's «الإشعارات» (the server clock is UTC, so no hours here).
// Mirrors noteText() in site/yanabee/js/account.js.
const STATUS = { draft: 'مسودة', submitted: 'قيد المراجعة', returned: 'مطلوب تعديل', approved: 'معتمد', rejected: 'مرفوض' };
const clip = (s, n = 60) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

export function pushMessage(kind, data) {
  const d = data && typeof data === 'object' ? data : {};
  const team = !d.team_name ? 'فريقك' : /^فريق\s/.test(String(d.team_name)) ? clip(d.team_name, 40) : `فريق ${clip(d.team_name, 40)}`;
  const T = {
    team_status: () => `تغيّرت حالة ${team}: ${STATUS[d.to] || ''}`,
    team_submitted: () => `${team} أرسل طلب التسجيل، وهو بانتظار المراجعة.`,
    team_approved: () => `اعتُمد ${team} في المسابقة.`,
    team_fee: () => (d.fee === 'waived' ? `أعفت الإدارة ${team} من الرسوم.` : `سُجّل سداد رسوم ${team}.`),
    team_seated: () => `خلا مكان، فانتقل ${team} من الاحتياط إلى الفرق المشاركة.`,
    result_pending: () => 'نتيجة مباراة بانتظار اعتمادك.',
    result_approved: () => 'اعتُمدت نتيجة مباراة لفريقك.',
    result_returned: () => 'أعادت الإدارة نتيجة مباراة للمراجعة.',
    judge_assigned: () => 'اختارتك الإدارة حكمًا. افتح «التحكيم» في حسابك.',
    results_published: () => 'أُعلنت النتائج النهائية للمسابقة.',
    announcement: () => `إعلان جديد: ${clip(d.title)}`,
    chat_report: () => 'بلاغ جديد في غرفة القادة.',
    chat_muted: () => 'أوقفت الإدارة مشاركتك مؤقتًا، ويمكنك القراءة.',
    post_pending: () => 'خبر جديد من قائد فريق ينتظر موافقتك.',
    post_reviewed: () => (d.action === 'publish' ? 'نُشر خبرك وصار يراه الجميع.' : d.action === 'reject' ? 'أعاد المشرف خبرك للتعديل.' : 'أخفى المشرف خبرك.'),
    comment_new: () => 'تعليق جديد على خبرك.',
    comment_report: () => 'بلاغ جديد عن تعليق في الأخبار.',
    team_leader_new: () => `صرت قائد ${team}.`,
    team_leader_left: () => 'سُلّمت قيادة فريقك لشخص آخر.',
    submission_new: () => `${team} أرسل عملًا للمراجعة.`,
    submission_reviewed: () => (d.status === 'accepted' ? 'قُبل عمل فريقك في المشاريع والمبادرات.' : d.status === 'returned' ? 'أُعيد عمل فريقك للتعديل.' : 'لم يُقبل عمل فريقك.'),
    submission_featured: () => (d.show ? 'صار عمل فريقك معروضًا في الصفحة الرئيسية.' : 'أُخفي عمل فريقك من الصفحة الرئيسية.'),
    event_new: () => `موعد جديد: ${clip(d.title)}`,
    event_changed: () => `تغيّر موعد: ${clip(d.title)}`,
    event_cancelled: () => `أُلغي موعد: ${clip(d.title)}`,
    invite_new: () => `دعاك ${team} للانضمام إليه.`,
    invite_waiting: () => `دعوة ${team} تنتظر ردّك.`,
    invite_answer: () => (d.accepted ? `انضم ${clip(d.first_name, 20) || 'لاعب'} إلى فريقك.` : `اعتذر ${clip(d.first_name, 20) || 'لاعب'} عن دعوتك.`),
    seek_approved: () => 'وافق ولي أمرك، وأصبحت في قائمة الباحثين عن فريق.',
  };
  const body = (T[kind] || (() => 'لديك إشعار جديد.'))();
  return { title: 'ينابيع', body, url: 'account.html', tag: 'yb-' + String(kind || 'note').replace(/[^a-z_]/g, '').slice(0, 30) };
}
