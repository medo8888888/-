/* MANARA («منارة») — "Ask MANARA / اسأل منارة": an OFFLINE, rule-based, explainable chatbot.   → window.Manara.chat
   NOT a language model and not AI: it normalises the question, scores it against an authored knowledge base (js/chatbot-kb.js, data only) and shows the
   closest written answer with its source and the reasons it was chosen. A question that matches nothing is answered with "I do not know" and the closest topics.
   Classic script, no libraries, no network, no innerHTML (every string reaches the page through textContent). Works from file://.
   Contract and the optional back-end hook: manara/docs/MANARA.md, section "Ask MANARA".

   1 normalise   Arabic: strip tashkeel + tatweel, unify alef / ya / ta-marbuta / hamza forms, Arabic-Indic digits, collapse stretched letters; light stemming of ال/و/ب prefixes and plural / pronoun suffixes.
                 English: lower-case, drop apostrophes, stop-words, a light stemmer (plural, -ing, -ed, -ly, final e), a few irregulars.   Synonym table (KB) expands words to a canonical form.
   2 match       every keyword / phrase of every entry is compared with the question words: exact stem 1.0, same word family 0.8, typo (Damerau-Levenshtein 1–2) 0.65 / 0.55; phrases need their words
                 close together and in order; weights come from the KB (^n) and from rarity (idf). Sample questions add a Dice-overlap bonus. Score = sum with diminishing returns × coverage of the question words.
   3 decide      confident → answer · unsure → "closest topic" + alternatives · nothing → "I do not know" + closest topics (never a guess).
   4 emergency   words of a real emergency (fire, smoke, gas, help, حريق, نجدة, إسعاف …) FIRST show a banner "demo prototype — call 999 now", before any answer; no typing animation, no back-end call. */
(function () {
  'use strict';
  var KB = window.MANARA_CHAT_KB, M = window.Manara;
  if (!KB || !M || (M.chat && M.chat.version)) return;
  var doc = document;

  /* ====================================================================================================================================================
     1. NORMALISATION
     ==================================================================================================================================================== */
  var AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g;
  function normalize(s) {
    s = String(s == null ? '' : s).toLowerCase();
    s = s.replace(AR_MARKS, '').replace(/ـ/g, '')                                   // tashkeel, tatweel
      .replace(/[آأإٱ]/g, 'ا')                                  // آ أ إ ٱ → ا
      .replace(/ى/g, 'ي').replace(/ی/g, 'ي').replace(/ک/g, 'ك')   // ى → ي, Persian ya / kaf
      .replace(/ة/g, 'ه')                                                      // ة → ه
      .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')  // ؤ → و, ئ → ي, lone hamza dropped
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); })
      .replace(/['’`´]/g, '');                                                 // don't → dont
    return s.replace(/(.)\1{2,}/g, function (m, c) { return /[a-z]/.test(c) ? c + c : c; });   // stretched letters: حريييق → حريق, fiiire → fiire
  }
  function tokenize(norm) { return (norm.match(/[\p{L}\p{N}]+/gu) || []); }
  function isAr(t) { return /[؀-ۿ]/.test(t); }

  var STOP = {};
  ('a an the is are was were be been am do does did done have has had i me my mine we us our you your he she it its they them their to of in on at for and or if what whats how hows when where why who whom which can could should would will shall may might there this that these those with about as by from so please tell give show explain also just any some more most very much many into out up down than then too yes ok okay im ive id youre dont doesnt cant wont isnt arent wasnt thats theres whos lets get got want wat wht hw wich pls plz u ur r hi hey can you ' +
    'في من علي الي عن هل ما ماذا كيف لماذا ليش شلون ايش وش شنو شو لي له لها هو هي هذا هذه ذلك تلك انا نحن انت انتم انتي لو اذا ان او كل مع عند عندي عندنا بعد قبل التي الذي الذين كان كانت يكون تكون هناك هنا ثم لكن بس يا اي ايه ممكن سمحت اريد ابغي ابي بغيت وين متي كم طيب يعني بدي').split(/\s+/).forEach(function (w) { if (w) STOP[normalize(w)] = 1; });

  var IRR = { people: 'person', persons: 'person', men: 'man', women: 'woman', children: 'child', feet: 'foot', lives: 'life', ran: 'run', went: 'go', gone: 'go', saw: 'see', seen: 'see', fell: 'fall', fallen: 'fall', burnt: 'burn', knew: 'know', won: 'win', paid: 'pay', sent: 'send', built: 'build', bought: 'buy', flew: 'fly', flown: 'fly', fled: 'flee', better: 'good', best: 'good' };
  function stemEn(w) {
    if (IRR[w]) return IRR[w];
    if (w.length <= 3 || /\d/.test(w)) return w;
    if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
    else if (/(sses|shes|ches|xes|zes)$/.test(w)) w = w.slice(0, -2);
    else if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    if (/ing$/.test(w) && w.length > 5) { w = w.slice(0, -3); if (/(.)\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1); }
    else if (/ed$/.test(w) && w.length > 4) { w = w.slice(0, -2); if (/(.)\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1); if (/i$/.test(w)) w = w.slice(0, -1) + 'y'; }
    else if (/ly$/.test(w) && w.length > 5) w = w.slice(0, -2);
    if (/e$/.test(w) && w.length > 3) w = w.slice(0, -1);
    return w;
  }
  var AR_PRE = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال'];       // وال فال بال كال لل ال
  var AR_SUF = ['هما', 'كما', 'تين', 'ات', 'ان', 'ين', 'ون', 'ها', 'هم', 'هن', 'كم', 'نا', 'اء', 'ه', 'ي'];   // هما كما تين ات ان ين ون ها هم هن كم نا اء ه ي
  function stemAr(w) {
    if (w.length < 4 || /\d/.test(w)) return w;
    for (var i = 0; i < AR_PRE.length; i++) if (w.indexOf(AR_PRE[i]) === 0 && w.length - AR_PRE[i].length >= 3) { w = w.slice(AR_PRE[i].length); break; }
    if (w.length >= 5 && w.charAt(0) === 'و') w = w.slice(1);                      // و (and) before a long word
    for (var j = 0; j < AR_SUF.length; j++) if (w.length - AR_SUF[j].length >= 3 && w.slice(-AR_SUF[j].length) === AR_SUF[j]) { w = w.slice(0, -AR_SUF[j].length); break; }
    return w;
  }
  function stem(t) { return isAr(t) ? stemAr(t) : (/^[a-z]+$/.test(t) ? stemEn(t) : t); }

  /* synonyms: every variant → the canonical word (the first of its group); the question keeps both forms */
  var SYN = {};
  (KB.syn ? [].concat((KB.syn.en || []), (KB.syn.ar || [])) : []).forEach(function (g) {
    var canon = normalize(g[0]);
    g.forEach(function (w) { SYN[stem(normalize(w))] = stem(canon); });
  });

  /* ---------- edit distance (optimal string alignment: a swap of two letters costs 1) ---------- */
  function osa(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var p2 = null, p1 = [], i, j;
    for (j = 0; j <= lb; j++) p1[j] = j;
    for (i = 1; i <= la; i++) {
      var cur = [i], rowMin = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost);
        if (p2 && i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) v = Math.min(v, p2[j - 2] + 1);
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      p2 = p1; p1 = cur;
    }
    return p1[lb];
  }
  function commonPrefix(a, b) { var n = Math.min(a.length, b.length), i = 0; while (i < n && a.charAt(i) === b.charAt(i)) i++; return i; }
  var qcache = {};
  /* how well does a question word (stem) match a keyword word (stem)?  1 exact · .8 same family · .65 / .55 typo · 0 no */
  function tokQ(q, k) {
    if (q === k) return 1;
    var key = q + '|' + k; if (qcache[key] !== undefined) return qcache[key];
    var lq = q.length, lk = k.length, r = 0;
    if (lq >= 3 && lk >= 3 && !/^\d+$/.test(q) && !/^\d+$/.test(k) && !/\d/.test(q + k)) {
      var cp = commonPrefix(q, k);
      if (cp >= 5 && cp >= 0.72 * Math.min(lq, lk) && Math.abs(lq - lk) <= 4) r = 0.8;
      else if (q.charAt(0) === k.charAt(0)) {
        var maxd = lq >= 8 ? 2 : (lq >= 4 ? 1 : 0);
        if (maxd) { var d = osa(q, k, maxd); if (d <= maxd) r = d === 1 ? 0.65 : 0.55; }
      }
    }
    qcache[key] = r; return r;
  }

  /* ====================================================================================================================================================
     2. INDEX (built once from the knowledge base)
     ==================================================================================================================================================== */
  var ENT = KB.entries, BY_ID = {}, IDX = [], DF = {}, N = ENT.length;
  function wordsOf(str) {            // normalised, stemmed content words of a text (stop-words removed; a text made only of stop-words, like "who are you", keeps them)
    var out = [], raw = tokenize(normalize(str));
    for (var i = 0; i < raw.length; i++) { var t = raw[i]; if (STOP[t] || (t.length < 2 && !/\d/.test(t))) continue; out.push(stem(t)); }
    if (!out.length) raw.forEach(function (t) { if (t.length >= 2) out.push(stem(t)); });
    return out;
  }
  function parseKw(str) {
    var terms = [];
    String(str || '').split(',').forEach(function (part) {
      part = part.trim(); if (!part) return;
      var neg = false, w = 1;
      if (part.charAt(0) === '!') { neg = true; part = part.slice(1); }
      var m = /\^([\d.]+)$/.exec(part); if (m) { w = parseFloat(m[1]); part = part.slice(0, m.index); }
      var toks = wordsOf(part); if (!toks.length) return;
      terms.push({ toks: toks, w: w, neg: neg, raw: part.trim() });
    });
    return terms;
  }
  ENT.forEach(function (e, i) {
    BY_ID[e.id] = e;
    var terms = parseKw(e.k.ar).concat(parseKw(e.k.en)), seen = {};
    terms.forEach(function (t) { t.toks.forEach(function (s) { seen[s] = 1; }); });
    var samples = [];
    ['ar', 'en'].forEach(function (l) { [e.q[l]].concat((e.s && e.s[l]) || []).forEach(function (x) { var w = wordsOf(x); if (w.length) samples.push(w); }); });
    IDX.push({ e: e, i: i, terms: terms, stems: seen, samples: samples });
    Object.keys(seen).forEach(function (s) { DF[s] = (DF[s] || 0) + 1; });
  });
  var KNOWN = {};                        // every word the knowledge base contains anywhere (keywords, questions, answers): a question word outside it is evidence the question is about something else
  ENT.forEach(function (e) { ['ar', 'en'].forEach(function (l) { [e.a[l], e.q[l], e.m && e.m[l]].concat((e.s && e.s[l]) || []).forEach(function (x) { if (x) wordsOf(x).forEach(function (s) { KNOWN[s] = 1; }); }); }); });
  IDX.forEach(function (ix) { Object.keys(ix.stems).forEach(function (s) { KNOWN[s] = 1; }); });
  function isKnown(tok) { return !!(KNOWN[tok.s] || (tok.alt && KNOWN[tok.alt])); }
  var IDF_DEN = Math.log((N + 1) / 1.5);
  function idf(s) { var df = DF[s] || 1; return 0.5 + Math.log((N + 1) / (df + 0.5)) / IDF_DEN; }
  var BASE = [0, 2.0, 3.6, 5.0, 6.0];

  /* the words the question must lose points for: out of scope for the project */
  var OUT = {};
  [].concat((KB.scopeOut && KB.scopeOut.en) || [], (KB.scopeOut && KB.scopeOut.ar) || []).forEach(function (w) { var ws = wordsOf(w); if (ws.length === 1) OUT[ws[0]] = 1; });

  /* ====================================================================================================================================================
     3. ANALYSE + MATCH
     ==================================================================================================================================================== */
  function detectLang(text, fallback) {
    var ar = (text.match(/[؀-ۿ]/g) || []).length, la = (text.match(/[A-Za-z]/g) || []).length;
    if (ar && ar >= la * 0.3) return 'ar';
    if (la >= 2) return 'en';
    return fallback === 'en' ? 'en' : 'ar';
  }
  function analyse(text) {
    var norm = normalize(text), raw = tokenize(norm), content = [];
    function push(t, i) { var s = stem(t), alt = SYN[s] && SYN[s] !== s ? SYN[s] : null; content.push({ t: t, s: s, alt: alt, i: i }); }
    raw.forEach(function (t, i) { if (STOP[t] || (t.length < 2 && !/\d/.test(t))) return; push(t, i); });
    if (!content.length) raw.forEach(function (t, i) { if (t.length >= 2) push(t, i); });          // "who are you": only stop-words, so they are the question
    return { text: text, norm: norm, raw: raw, joined: raw.join(' '), content: content };
  }
  function qOf(tok, k) {                                // best quality of a question word against a keyword stem (the synonym form counts too)
    var a = tokQ(tok.s, k); if (tok.alt) { var b = tokQ(tok.alt, k) * 0.95; if (b > a) a = b; }
    return a;
  }
  function scoreEntry(ix, an, ctx) {
    var content = an.content, parts = [], hit = {}, k, j;
    var neg = false;
    ix.terms.forEach(function (term) {
      var L = term.toks.length, sum = 0, got = 0, pos = [], used = {};
      for (k = 0; k < L; k++) {
        var best = 0, bj = -1;
        for (j = 0; j < content.length; j++) { if (used[j]) continue; var q = qOf(content[j], term.toks[k]); if (q > best) { best = q; bj = j; } }
        if (bj >= 0 && best > 0) { used[bj] = 1; sum += best; got++; pos.push(bj); }
      }
      if (!got) return;
      var avgQ = sum / got, order = 1;
      if (L > 1) {
        if (got === L) {
          var sorted = pos.slice().sort(function (a, b) { return a - b; });
          var inOrder = pos.every(function (p, n) { return !n || p > pos[n - 1]; });
          var span = sorted[sorted.length - 1] - sorted[0];
          order = inOrder ? (span <= L + 1 ? 1 : 0.8) : (span <= L + 1 ? 0.85 : 0.65);
        } else if (L >= 3 && got >= Math.ceil(L / 2)) order = 0.4 * got / L;
        else return;
      }
      if (term.neg) { if (avgQ >= 0.8 && got === L) neg = true; return; }
      var iv = 0; term.toks.forEach(function (s) { iv += idf(s); }); iv /= L;
      var pts = BASE[Math.min(L, 4)] * term.w * iv * avgQ * order;
      var how = avgQ >= 0.99 ? 'exact' : (avgQ >= 0.78 ? 'family' : 'typo');
      parts.push({ raw: term.raw, pts: pts, how: how, pos: pos });
      pos.forEach(function (p) { hit[p] = 1; });
    });
    parts.sort(function (a, b) { return b.pts - a.pts; });
    var total = 0; parts.forEach(function (p, n) { total += p.pts * Math.pow(0.7, n); });
    var sample = 0;
    if (content.length) ix.samples.forEach(function (sw) {
      var inter = 0, used2 = {};
      content.forEach(function (tok, jj) { for (var m = 0; m < sw.length; m++) if (!used2[m] && qOf(tok, sw[m]) >= 0.8) { used2[m] = 1; inter++; hit[jj] = 1; break; } });
      var dice = 2 * inter / (content.length + sw.length);
      if (inter >= 2 || (inter >= 1 && sw.length <= 2 && content.length <= 2)) sample = Math.max(sample, 9 * dice);
    });
    var mW = 0, uW = 0;                  // coverage: matched words count 1, unmatched words the KB knows 0.5, unmatched words it has never seen 1.5
    content.forEach(function (tok, jj) { if (hit[jj]) mW += 1; else uW += isKnown(tok) ? 0.5 : 1.5; });
    var coverage = content.length ? mW / (mW + uW) : 0;
    var score = (total + sample) * (0.5 + 0.5 * coverage);
    if (neg) score *= 0.4;
    var pen = 0; content.forEach(function (tok) { if ((OUT[tok.s] || (tok.alt && OUT[tok.alt])) && !ix.stems[tok.s] && pen < 2) { score *= 0.55; pen++; } });
    var outOfScope = pen > 0;
    var mode = ctx.mode, aud = ix.e.aud;
    score *= aud === 'both' ? 1 : (aud === mode ? 1.12 : 0.9);
    if (ctx.last && content.length <= 3) {
      if (ctx.lastF && ctx.lastF.indexOf(ix.e.id) >= 0) score *= 1.25;
    }
    return { e: ix.e, score: score, coverage: coverage, parts: parts, sample: sample, out: outOfScope };
  }
  function rank(an, ctx) {
    var out = IDX.map(function (ix) { return scoreEntry(ix, an, ctx); });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  /* thresholds (tuned against tools/test-chatbot.mjs: 25+ questions that must land, unrelated ones that must be refused) */
  var T_MIN = 8, T_SURE = 11, T_COVER = 0.5;

  /* ====================================================================================================================================================
     4. EMERGENCY OVERRIDE
     ==================================================================================================================================================== */
  function compileList(arr) { return (arr || []).map(function (x) { var w = wordsOf(x); var rawT = tokenize(normalize(x.replace(/^\^/, ''))); return { raw: rawT, stems: w, start: /^\^/.test(x) }; }); }
  var EM = {};
  ['strong', 'hazard', 'solo', 'urgent', 'info', 'system'].forEach(function (k) {
    var src = KB.emerg[k] || {};
    EM[k] = compileList((src.en || []).concat(src.ar || []));
  });
  function hasSeq(arr, seq) {                             // seq appears in arr as consecutive items
    if (!seq.length) return false;
    for (var i = 0; i + seq.length <= arr.length; i++) { var ok = true; for (var j = 0; j < seq.length; j++) if (arr[i + j] !== seq[j]) { ok = false; break; } if (ok) return true; }
    return false;
  }
  function stemHit(an, item) {                            // an item's stems appear in the question words (typos allowed for longer words)
    if (!item.stems.length) return false;
    var pos = -1;
    for (var k = 0; k < item.stems.length; k++) {
      var found = -1;
      for (var j = 0; j < an.content.length; j++) {
        var q = qOf(an.content[j], item.stems[k]);
        if (q >= 0.99 || (q >= 0.8 && !isAr(item.stems[k])) || (q >= 0.65 && !isAr(item.stems[k]) && item.stems[k].length >= 5)) { found = j; break; }   // typos only in Latin words: اسعار is not a typo of اسعاف
      }
      if (found < 0 || found < pos) return false;
      pos = found;
    }
    return true;
  }
  function emergency(an, mode) {
    var strong = EM.strong.some(function (it) { return hasSeq(an.raw, it.raw); });
    if (strong) return { is: true, why: 'strong' };
    var hazard = EM.hazard.some(function (it) { return stemHit(an, it); });
    var short = an.content.length <= 2;
    var solo = short && EM.solo.some(function (it) { return it.raw.length === 1 && an.raw.indexOf(it.raw[0]) >= 0; });   // a lone danger word: "fire", "حريق", "help" (not "helped")
    if (!hazard && !solo) return { is: false };
    if (EM.urgent.some(function (it) { return hasSeq(an.raw, it.raw); })) return { is: true, why: 'urgent' };
    if (EM.system.some(function (it) { return stemHit(an, it); })) return { is: false };          // a question about the project's own parts ("fire detector")
    var info = EM.info.some(function (it) { var p = it.raw.join(' '); return an.joined === p || an.joined.indexOf(p + ' ') === 0; });
    if (info) return { is: false };                                                                // "what is…", "how does…": a definition, not an emergency
    if (solo) return { is: true, why: 'short' };
    return mode === 'res' ? { is: true, why: 'resident' } : { is: false };
  }

  /* ====================================================================================================================================================
     5. ANSWERING (pure, synchronous) + the optional back-end hook
     ==================================================================================================================================================== */
  var MORE_WORDS = {};
  'more details detail elaborate expand continue further تفاصيل المزيد زياده كمل وضح اشرح اكثر'.split(/\s+/).forEach(function (w) { MORE_WORDS[stem(normalize(w))] = 1; });
  function isMore(an) { return an.content.length > 0 && an.content.length <= 3 && an.content.every(function (t) { return MORE_WORDS[t.s]; }); }

  function mkCtx(o) { o = o || {}; return { mode: o.mode === 'jud' ? 'jud' : 'res', lang: o.lang === 'en' ? 'en' : (o.lang === 'ar' ? 'ar' : M.lang()), last: o.last || null, lastF: o.last && BY_ID[o.last] ? BY_ID[o.last].f : null }; }

  function ask(text, o) {
    text = String(text == null ? '' : text).trim().slice(0, 400);
    var ctx = mkCtx(o), an = analyse(text);
    var res = { q: text, mode: ctx.mode, lang: detectLang(text, ctx.lang), kind: 'unknown', entry: null, score: 0, conf: 'none', matched: [], alts: [], coverage: 0, emergency: { is: false }, confirm: false, ranking: null };
    if (!text) return res;
    res.emergency = emergency(an, ctx.mode);
    if (isMore(an) && ctx.last && BY_ID[ctx.last]) {
      res.kind = 'more'; res.entry = BY_ID[ctx.last]; res.conf = 'high'; res.alts = (res.entry.f || []).slice(0, 3).map(function (id) { return { id: id, score: 0 }; });
      return res;
    }
    var r = rank(an, ctx), best = r[0], second = r[1];
    res.ranking = r.slice(0, 5).map(function (x) { return { id: x.e.id, score: +x.score.toFixed(2), coverage: +x.coverage.toFixed(2) }; });
    res.score = best ? best.score : 0; res.coverage = best ? best.coverage : 0;
    var em = res.emergency.is, minS = em ? 4 : T_MIN, minC = em ? 0 : (best && best.score >= T_SURE * 1.4 ? 0 : (best && best.score >= T_SURE ? 0.35 : T_COVER));           // in an emergency the closest hazard advice is better than nothing
    var sure = best && best.score >= minS && best.coverage >= minC && !(em && best.e.aud === 'jud') && (!best.out || best.score >= T_SURE);   // a question about something outside the project needs a clear match
    if (sure) {
      res.entry = best.e; res.confirm = !!best.e.c;
      var close = second && second.e !== best.e && second.score > best.score * 0.85;
      res.kind = (best.score >= T_SURE && !close) ? 'answer' : 'closest';
      res.conf = best.score >= T_SURE * 1.5 ? 'high' : (res.kind === 'answer' ? 'medium' : 'low');
      res.matched = best.parts.slice(0, 6).map(function (p) { return { kw: p.raw, how: p.how }; });
      res.alts = r.slice(1, 4).filter(function (x) { return x.score >= T_MIN * 0.5; }).map(function (x) { return { id: x.e.id, score: x.score }; });
    } else {
      res.kind = 'unknown';
      res.alts = r.slice(0, 3).filter(function (x) { return x.score > 1.2; }).map(function (x) { return { id: x.e.id, score: x.score }; });
    }
    if (res.emergency.is && res.kind === 'unknown') { res.kind = 'closest'; res.entry = BY_ID['res-help']; res.conf = 'low'; res.confirm = true; res.fallback = true; }
    return res;
  }

  /* ---------- the optional back-end hook: Manara.chat.setBackend(async fn(question, context) → text). Default none; never called for emergencies; never auto-network ---------- */
  var backend = null, BACKEND_MS = 8000;
  function setBackend(fn) {
    if (fn != null && typeof fn !== 'function') throw new TypeError('Manara.chat.setBackend(fn): fn must be a function (question, context) returning text or a Promise of text, or null to remove it');
    backend = fn || null;
    window.dispatchEvent(new CustomEvent('manara-chat-backend', { detail: !!backend }));
  }
  function respond(text, o, history) {
    var r = ask(text, o);
    if (!(r.kind === 'unknown' && backend && !r.emergency.is)) return Promise.resolve(r);
    var context = { lang: r.lang, mode: r.mode, history: (history || []).slice(-6), candidates: r.alts.map(function (a) { return { id: a.id, title: BY_ID[a.id].q, score: +a.score.toFixed(2) }; }), source: 'manara-chat/1' };
    var timer, timeout = new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error('timeout')); }, BACKEND_MS); });
    var call = new Promise(function (res) { res(backend(text, context)); });
    return Promise.race([call, timeout]).then(function (out) {
      clearTimeout(timer);
      var s = out == null ? '' : String(out).trim();
      if (!s) { r.backendNote = 'empty'; return r; }
      r.kind = 'backend'; r.backendText = s.slice(0, 4000); return r;
    }, function (err) { clearTimeout(timer); r.backendNote = err && err.message === 'timeout' ? 'timeout' : 'error'; return r; });
  }

  /* ====================================================================================================================================================
     6. TEXT HELPERS (answers are plain text with a little markup: paragraphs, "- " bullets, "1. " lists, **bold**)
     ==================================================================================================================================================== */
  function resolveDyn(s) {
    var tc = window.MANARA_TEST_COUNTS;
    return s.replace(/\{\{(tests\.(?:total|failed|generated))(?:\|([^}]*))?\}\}/g, function (m, key, fb) {
      var v = tc ? tc[key.slice(6)] : null;
      return v == null || v === '' ? (fb || '') : String(v);
    });
  }
  function pick(obj, lang) { return obj ? (obj[lang] != null ? obj[lang] : obj.en) : ''; }
  function el(tag, cls, txt) { var n = doc.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function bi(tag, obj, cls) {                         // a node holding both languages (CSS shows one: data-l, or the message language data-ml)
    var n = el(tag, cls);
    ['ar', 'en'].forEach(function (l) { var s = el('span', null, obj[l]); s.setAttribute('data-l', l); n.appendChild(s); });
    return n;
  }
  function inline(parent, s) {
    var re = /\*\*(.+?)\*\*/g, last = 0, m;
    while ((m = re.exec(s))) { if (m.index > last) parent.appendChild(doc.createTextNode(s.slice(last, m.index))); parent.appendChild(el('strong', null, m[1])); last = m.index + m[0].length; }
    if (last < s.length) parent.appendChild(doc.createTextNode(s.slice(last)));
  }
  function rich(container, text) {                      // text → DOM (no innerHTML)
    var paras = String(text).split(/\n\s*\n/);
    paras.forEach(function (p) {
      var lines = p.split('\n'), list = null, kind = null;
      lines.forEach(function (ln) {
        var b = /^\s*-\s+(.*)$/.exec(ln), n = /^\s*\d+\.\s+(.*)$/.exec(ln);
        if (b || n) {
          var k = b ? 'ul' : 'ol';
          if (!list || kind !== k) { list = el(k, 'mc-list'); kind = k; container.appendChild(list); }
          var li = el('li'); inline(li, (b || n)[1]); list.appendChild(li);
        } else {
          list = null; kind = null;
          if (ln.trim()) { var para = el('p'); inline(para, ln.trim()); container.appendChild(para); }
        }
      });
    });
  }
  function plain(text) { return String(text).replace(/\*\*/g, '').replace(/^\s*-\s+/gm, '• ').replace(/\n{3,}/g, '\n\n'); }

  /* ====================================================================================================================================================
     7. UI (one component, used by chat.html and by the floating panel)
     ==================================================================================================================================================== */
  var S = {
    title: { ar: 'اسأل منارة', en: 'Ask MANARA' },
    iAm: { ar: 'أنا:', en: 'I am:' },
    res: { ar: 'ساكن', en: 'Resident' },
    jud: { ar: 'حَكَم أو زائر', en: 'Judge or visitor' },
    resHint: { ar: 'نصائح السلامة للمنزل والعمل.', en: 'Safety advice for home and work.' },
    judHint: { ar: 'كيف تعمل منارة وأرقام المحاكاة وحدودها.', en: 'How MANARA works, the SIM numbers and its limits.' },
    strip: { ar: 'ليست ذكاءً اصطناعيًا ولا نموذجًا لغويًا: بحث بقواعد في إجابات مكتوبة سلفًا، ويعمل دون إنترنت. هذا نموذج تجريبي — وفي الخطر اتصل بـ 999.', en: 'Not an AI model and not a language model: a rule-based search over answers written in advance, working offline. This is a demo prototype. In danger, call 999.' },
    backendOn: { ar: 'متصل بخلفية خارجية اختيارية', en: 'Optional external back-end connected' },
    placeholder: { ar: 'اكتب سؤالك…', en: 'Type your question…' },
    label: { ar: 'سؤالك', en: 'Your question' },
    send: { ar: 'إرسال', en: 'Send' },
    exp: { ar: 'تصدير المحادثة', en: 'Export conversation' },
    clr: { ar: 'مسح المحادثة', en: 'Clear conversation' },
    cleared: { ar: 'تم مسح المحادثة.', en: 'Conversation cleared.' },
    exported: { ar: 'تم تنزيل المحادثة كملف نصي.', en: 'The conversation was downloaded as a text file.' },
    log: { ar: 'المحادثة', en: 'Conversation' },
    chips: { ar: 'أسئلة مقترحة', en: 'Suggested questions' },
    chipsStart: { ar: 'جرّب:', en: 'Try:' },
    chipsRel: { ar: 'قد تسأل أيضًا:', en: 'You may also ask:' },
    chipsClose: { ar: 'أقرب المواضيع:', en: 'Closest topics:' },
    you: { ar: 'أنت', en: 'You' },
    bot: { ar: 'منارة', en: 'MANARA' },
    seePage: { ar: 'انظر صفحة:', en: 'See page:' },
    why: { ar: 'لماذا هذا الجواب؟', en: 'Why this answer?' },
    helpful: { ar: 'مفيد', en: 'Helpful' },
    notHelpful: { ar: 'غير مفيد', en: 'Not helpful' },
    wasHelpful: { ar: 'هل كانت الإجابة مفيدة؟', en: 'Was this helpful?' },
    thanksFb: { ar: 'شكرًا. تقييمك محفوظ في ذاكرة هذه الصفحة فقط ولا يُرسل إلى أي مكان.', en: 'Thanks. Your rating is kept in this page\'s memory only and is sent nowhere.' },
    sorryFb: { ar: 'آسف لذلك. جرّب صياغة أخرى أو أحد المواضيع القريبة، أو افتح الصفحة المذكورة.', en: 'Sorry about that. Try rephrasing, one of the related topics, or open the page cited.' },
    close: { ar: 'إغلاق', en: 'Close' },
    switched: { ar: 'تم التبديل إلى وضع:', en: 'Switched to mode:' },
    banner1: { ar: 'هذا نموذج تجريبي — اتصل بـ 999 الآن', en: 'This is a demo prototype — call 999 now' },
    call: { ar: 'اتصل بـ 999', en: 'Call 999' },
    welcome: { ar: 'أهلًا! أنا «اسأل منارة». أجيب من قاعدة معرفة مكتوبة: نصائح السلامة للسكان، وكيف يعمل المشروع وأرقامه للحكام والزوار. اختر وضعك ثم اسأل أو اضغط أحد الأسئلة.', en: 'Welcome! I am "Ask MANARA". I answer from a written knowledge base: safety advice for residents, and how the project works and its numbers for judges and visitors. Pick your mode, then ask or tap a question.' },
    unknownT: { ar: 'لا أعرف الإجابة عن هذا. أنا لست نموذجًا لغويًا، فلن أخمّن: أجيب فقط مما هو مكتوب في ملاحظاتي.', en: 'I do not know the answer to that. I am not a language model, so I will not guess: I only answer from what is written in my notes.' },
    unknownC: { ar: 'إن كان سؤالك عن لائحة أو غرامة أو رقم رسمي فأكِّده مع الجهة المختصة. وفي خطر حقيقي اتصل بـ 999.', en: 'If your question is about a regulation, a fine or an official number, confirm it with the authority. In real danger call 999.' },
    unknownS: { ar: 'جرّب صياغة أخرى، أو اختر من أقرب المواضيع أدناه.', en: 'Try rephrasing, or pick one of the closest topics below.' },
    closestT: { ar: 'لست متأكدًا تمامًا؛ هذا أقرب موضوع عندي:', en: 'I am not fully sure; this is the closest topic I have:' },
    confirmT: { ar: 'أكِّد هذه المعلومة مع الجهة المختصة قبل الاعتماد عليها.', en: 'Confirm this with the competent authority before relying on it.' },
    otherMode: { ar: 'هذا موضوع من وضع «حَكَم أو زائر».', en: 'This is a topic from the "Judge or visitor" mode.' },
    otherModeR: { ar: 'هذا موضوع من وضع «ساكن».', en: 'This is a topic from the "Resident" mode.' },
    moreNone: { ar: 'هذا كل ما كتبته عن هذا الموضوع. هذه مواضيع قريبة:', en: 'That is everything I have written on this topic. Related topics:' },
    backendTag: { ar: 'جواب من الخلفية الخارجية المتصلة — ليس من قاعدة معرفة منارة ولم يُتحقق منه.', en: 'Answer from the connected external back-end — not from MANARA\'s knowledge base and not checked.' },
    backendFail: { ar: 'تعذّر الوصول إلى الخلفية الخارجية، فهذا جوابي المحلي:', en: 'The external back-end could not be reached, so here is my local answer:' },
    topic: { ar: 'الموضوع', en: 'Topic' },
    conf: { ar: 'الثقة', en: 'Confidence' },
    matched: { ar: 'كلمات طابقت', en: 'Matched words' },
    source: { ar: 'مصدر الحقائق', en: 'Facts come from' },
    considered: { ar: 'مواضيع أخرى نُظر فيها', en: 'Other topics considered' },
    confHigh: { ar: 'عالية', en: 'high' }, confMed: { ar: 'متوسطة', en: 'medium' }, confLow: { ar: 'منخفضة (أقرب موضوع)', en: 'low (closest topic)' },
    fuzzy: { ar: 'مع تسامح إملائي', en: 'typo-tolerant' },
    sorryEmpty: { ar: 'اكتب سؤالًا أولًا.', en: 'Type a question first.' },
    helpTitle: { ar: 'اسأل منارة — نافذة محادثة', en: 'Ask MANARA — chat window' }
  };
  function t(k) { return M.L(S[k]); }
  var uid = 0;

  function icon(name) {                                  // static SVG from core.js, parsed (no innerHTML)
    try { var d = new DOMParser().parseFromString(M.icon(name), 'text/html'); var n = d.body.firstChild; return n ? doc.importNode(n, true) : null; } catch (e) { return null; }
  }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  function createChat(container, opts) {
    opts = opts || {};
    var id = ++uid, root = el('div', 'mc' + (opts.panel ? ' mc-in-panel' : ''));
    var mode = (M.store('manara-chat-mode') === 'jud') ? 'jud' : 'res';
    var history = [], fb = [], lastId = null, busy = null, typing = null, thinkTimer = 0, asked = [], askedAt = -1, started = false;

    /* header: mode switch + tools */
    var head = el('div', 'mc-head');
    var modeBox = el('div', 'mc-mode'); modeBox.setAttribute('role', 'group'); modeBox.setAttribute('aria-labelledby', 'mc-iam-' + id);
    var iam = el('span', 'mc-iam'); iam.id = 'mc-iam-' + id; iam.setAttribute('data-lbl', 'iAm');
    var bRes = el('button', 'chip mc-seg'), bJud = el('button', 'chip mc-seg');
    bRes.type = bJud.type = 'button'; bRes.setAttribute('data-lbl', 'res'); bJud.setAttribute('data-lbl', 'jud'); bRes.setAttribute('data-mode', 'res'); bJud.setAttribute('data-mode', 'jud');
    modeBox.appendChild(iam); modeBox.appendChild(bRes); modeBox.appendChild(bJud);
    var tools = el('div', 'mc-tools');
    var bExp = el('button', 'icon-btn mc-tool'), bClr = el('button', 'icon-btn mc-tool');
    bExp.type = bClr.type = 'button'; bExp.setAttribute('data-lbl-attr', 'aria-label:exp;title:exp'); bClr.setAttribute('data-lbl-attr', 'aria-label:clr;title:clr');
    bExp.setAttribute('data-act', 'export'); bClr.setAttribute('data-act', 'clear');
    var ie = icon('download'), ic = icon('reset'); if (ie) bExp.appendChild(ie); if (ic) bClr.appendChild(ic);
    tools.appendChild(bExp); tools.appendChild(bClr);
    head.appendChild(modeBox); head.appendChild(tools);

    var hint = el('p', 'mc-hint'); hint.setAttribute('data-hint', '1');
    var strip = el('p', 'mc-strip'); strip.setAttribute('data-lbl', 'strip');
    var beTag = el('span', 'tag cool mc-be'); beTag.setAttribute('data-lbl', 'backendOn'); beTag.hidden = true;

    /* the log */
    var log = el('div', 'mc-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-relevant', 'additions'); log.setAttribute('tabindex', '0'); log.setAttribute('data-lbl-attr', 'aria-label:log');
    var status = el('p', 'sr-only'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');

    /* chips + form */
    var chipsBox = el('div', 'mc-chipbox'); var chipsL = el('span', 'mc-chips-l'); var chips = el('div', 'chips mc-chips scroll-x'); chips.setAttribute('role', 'group'); chips.setAttribute('data-lbl-attr', 'aria-label:chips');
    chipsBox.appendChild(chipsL); chipsBox.appendChild(chips);
    var form = el('form', 'mc-form'); form.setAttribute('autocomplete', 'off');
    var lab = el('label', 'sr-only'); lab.htmlFor = 'mc-q-' + id; lab.setAttribute('data-lbl', 'label');
    var inp = el('input', 'input mc-input'); inp.id = 'mc-q-' + id; inp.type = 'text'; inp.maxLength = 300; inp.setAttribute('dir', 'auto'); inp.setAttribute('enterkeyhint', 'send'); inp.setAttribute('autocomplete', 'off'); inp.setAttribute('data-lbl-attr', 'placeholder:placeholder');
    var send = el('button', 'btn btn-primary mc-send'); send.type = 'submit';
    var sIc = icon('nav'); if (sIc) send.appendChild(sIc); var sTx = el('span'); sTx.setAttribute('data-lbl', 'send'); send.appendChild(sTx);
    form.appendChild(lab); form.appendChild(inp); form.appendChild(send);

    root.appendChild(head); root.appendChild(hint); root.appendChild(strip); root.appendChild(beTag); root.appendChild(log); root.appendChild(status); root.appendChild(chipsBox); root.appendChild(form);
    container.appendChild(root);

    /* ---------- labels ---------- */
    function labels() {
      [].forEach.call(root.querySelectorAll('[data-lbl]'), function (n) { n.textContent = t(n.getAttribute('data-lbl')); });
      [].forEach.call(root.querySelectorAll('[data-lbl-attr]'), function (n) { n.getAttribute('data-lbl-attr').split(';').forEach(function (p) { var kv = p.split(':'); if (kv.length === 2) n.setAttribute(kv[0], t(kv[1])); }); });
      hint.textContent = t(mode === 'jud' ? 'judHint' : 'resHint');
      bRes.setAttribute('aria-pressed', mode === 'res' ? 'true' : 'false'); bJud.setAttribute('aria-pressed', mode === 'jud' ? 'true' : 'false');
      root.setAttribute('data-mode', mode);
    }
    function say(msg) { status.textContent = ''; setTimeout(function () { status.textContent = msg; }, 30); }

    /* ---------- messages ---------- */
    function nearBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 90; }
    function stick(force) { if (force || nearBottom()) log.scrollTop = log.scrollHeight; }
    function add(node) { var nb = nearBottom(); log.appendChild(node); if (nb) stick(true); return node; }
    function userMsg(text) {
      var m = el('div', 'mc-msg mc-user'); m.setAttribute('data-role', 'user');
      var who = el('span', 'sr-only', t('you') + ': '); var b = el('div', 'mc-bubble', text); b.setAttribute('dir', 'auto');
      m.appendChild(who); m.appendChild(b); add(m); stick(true); return m;
    }
    function botShell(lang, entryId) {
      var m = el('div', 'mc-msg mc-bot'); m.setAttribute('data-role', 'bot'); m.setAttribute('data-ml', lang); if (entryId) m.setAttribute('data-id', entryId);
      var av = el('div', 'mc-av'); av.setAttribute('aria-hidden', 'true'); var lg = M.logo ? M.logo(28) : ''; if (lg) { try { var pn = new DOMParser().parseFromString(lg, 'text/html').body.firstChild; if (pn) av.appendChild(doc.importNode(pn, true)); } catch (e) { /* no logo */ } }
      var col = el('div', 'mc-col'); var who = el('span', 'sr-only', (lang === 'ar' ? S.bot.ar : S.bot.en) + ': ');
      col.appendChild(who); m.appendChild(av); m.appendChild(col); return { m: m, col: col };
    }
    function banner() {
      var m = el('div', 'mc-msg mc-emerg'); m.setAttribute('role', 'alert'); m.setAttribute('data-role', 'emergency');
      var box = el('div', 'mc-emerg-box');
      var a = el('strong', 'mc-emerg-ar', S.banner1.ar), e = el('strong', 'mc-emerg-en', S.banner1.en);
      a.setAttribute('lang', 'ar'); a.setAttribute('dir', 'rtl'); e.setAttribute('lang', 'en'); e.setAttribute('dir', 'ltr');
      var call = el('a', 'mc-call'); call.href = 'tel:999'; var cs = bi('span', S.call); call.appendChild(cs);
      box.appendChild(a); box.appendChild(e); box.appendChild(call); m.appendChild(box); add(m); stick(true); return m;
    }
    function dots() {
      var m = el('div', 'mc-msg mc-bot mc-typing'); m.setAttribute('aria-hidden', 'true');
      var av = el('div', 'mc-av'); var b = el('div', 'mc-bubble'); for (var i = 0; i < 3; i++) b.appendChild(el('i'));
      m.appendChild(av); m.appendChild(b); add(m); stick(true); return m;
    }
    function pageLink(src) {
      var p = src.split('#')[0], lbl = KB.pages[p]; if (!lbl) return null;
      var a = el('a', 'mc-link'); a.href = src; a.appendChild(bi('span', lbl)); return a;
    }
    function meta(res, entry, lang) {
      var box = el('div', 'mc-meta');
      if (entry && entry.src && entry.src.length) {
        var row = el('p', 'mc-src'); row.appendChild(bi('span', S.seePage, 'mc-src-l')); row.appendChild(doc.createTextNode(' '));
        entry.src.forEach(function (s, i) { var a = pageLink(s); if (a) { if (i) row.appendChild(doc.createTextNode(' · ')); row.appendChild(a); } });
        box.appendChild(row);
      }
      if (entry) {
        var det = el('details', 'mc-why'); var sm = el('summary'); sm.appendChild(bi('span', S.why)); det.appendChild(sm);
        var ul = el('ul', 'mc-list');
        var li = el('li'); li.appendChild(bi('b', S.topic)); li.appendChild(doc.createTextNode(': ')); li.appendChild(bi('span', entry.q)); ul.appendChild(li);
        li = el('li'); li.appendChild(bi('b', S.conf)); li.appendChild(doc.createTextNode(': ')); li.appendChild(bi('span', res.conf === 'high' ? S.confHigh : (res.conf === 'medium' ? S.confMed : S.confLow))); li.appendChild(doc.createTextNode(' (' + res.score.toFixed(1) + ')')); ul.appendChild(li);
        if (res.matched && res.matched.length) {
          li = el('li'); li.appendChild(bi('b', S.matched)); li.appendChild(doc.createTextNode(': '));
          li.appendChild(doc.createTextNode(res.matched.map(function (x) { return x.kw + (x.how === 'typo' ? ' (≈)' : ''); }).join(' · '))); ul.appendChild(li);
        }
        if (entry.doc) { li = el('li'); li.appendChild(bi('b', S.source)); li.appendChild(doc.createTextNode(': ' + entry.doc)); ul.appendChild(li); }
        if (res.alts && res.alts.length) {
          li = el('li'); li.appendChild(bi('b', S.considered)); li.appendChild(doc.createTextNode(': '));
          res.alts.forEach(function (a, i) { if (i) li.appendChild(doc.createTextNode(' · ')); li.appendChild(bi('span', BY_ID[a.id].q)); }); ul.appendChild(li);
        }
        det.appendChild(ul); box.appendChild(det);
        var f = el('div', 'mc-fb'); f.appendChild(bi('span', S.wasHelpful, 'mc-fb-q'));
        var up = el('button', 'chip mc-fb-b'), dn = el('button', 'chip mc-fb-b'); up.type = dn.type = 'button';
        up.appendChild(bi('span', S.helpful)); dn.appendChild(bi('span', S.notHelpful)); up.setAttribute('data-v', '1'); dn.setAttribute('data-v', '-1');
        up.setAttribute('aria-pressed', 'false'); dn.setAttribute('aria-pressed', 'false');
        function rate(v, btn) {
          fb.push({ id: entry.id, q: res.q, v: v, at: new Date().toISOString() });
          up.setAttribute('aria-pressed', v > 0 ? 'true' : 'false'); dn.setAttribute('aria-pressed', v < 0 ? 'true' : 'false'); up.disabled = dn.disabled = true;
          var th = bi('span', v > 0 ? S.thanksFb : S.sorryFb, 'mc-fb-t'); f.appendChild(th); say(pick(v > 0 ? S.thanksFb : S.sorryFb, lang));
        }
        up.addEventListener('click', function () { rate(1, up); }); dn.addEventListener('click', function () { rate(-1, dn); });
        f.appendChild(up); f.appendChild(dn); box.appendChild(f);
      }
      return box;
    }
    var chipState = { key: 'chipsStart', ids: [] };
    function setChips(labelKey, ids, lang) {
      chipState = { key: labelKey, ids: ids.slice() };
      chips.textContent = ''; chipsL.textContent = t(labelKey); chipsBox.hidden = !ids.length;
      ids.forEach(function (eid) {
        var e = BY_ID[eid]; if (!e) return;
        var b = el('button', 'chip mc-chip', pick(e.q, lang)); b.type = 'button'; b.setAttribute('data-id', eid); b.setAttribute('lang', lang); b.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        b.addEventListener('click', function () { submit(pick(e.q, lang)); });
        chips.appendChild(b);
      });
      chipsBox.setAttribute('data-kind', labelKey);
    }
    function starters() { setChips('chipsStart', (KB.starters[mode] || []).slice(), M.lang()); }

    /* ---------- typing animation (instant when the user prefers reduced motion) ---------- */
    function typeInto(node, done) {
      var w = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT), nodes = [], full = [], n, total = 0;
      while ((n = w.nextNode())) { nodes.push(n); full.push(n.nodeValue); total += n.nodeValue.length; n.nodeValue = ''; }
      var cps = Math.max(70, total / 2.4), t0 = performance.now(), shown = 0, raf = 0, ended = false;
      function paint(upto) { var left = upto; for (var i = 0; i < nodes.length; i++) { var take = Math.min(left, full[i].length); nodes[i].nodeValue = full[i].slice(0, take); left -= take; } }
      function end() { if (ended) return; ended = true; cancelAnimationFrame(raf); paint(total); done(); }
      function frame(now) { if (ended) return; shown = Math.floor((now - t0) / 1000 * cps); if (shown >= total) return end(); paint(shown); stick(); raf = requestAnimationFrame(frame); }
      raf = requestAnimationFrame(frame);
      return { finish: end };
    }
    function finishNow() {
      if (thinkTimer) { clearTimeout(thinkTimer); thinkTimer = 0; var f = busy; busy = null; if (f) f(true); }
      if (typing) { var t0 = typing; typing = null; t0.finish(); }
    }

    /* ---------- one answer ---------- */
    function renderBody(res) {
      var lang = res.lang, entry = res.entry, body = el('div', 'mc-bubble mc-ans'); body.setAttribute('lang', lang); body.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      var chipsAfter = [], key = 'chipsRel';
      if (res.kind === 'unknown') {
        var p = el('p'); p.textContent = pick(S.unknownT, lang); body.appendChild(p);
        p = el('p'); p.textContent = pick(S.unknownC, lang); body.appendChild(p);
        p = el('p'); p.textContent = pick(S.unknownS, lang); body.appendChild(p);
        chipsAfter = res.alts.map(function (a) { return a.id; }); key = 'chipsClose';
        if (!chipsAfter.length) { chipsAfter = (KB.starters[mode] || []).slice(0, 4); key = 'chipsStart'; }
      } else if (res.kind === 'backend') {
        var tg = el('p', 'mc-be-note'); tg.textContent = pick(S.backendTag, lang); body.appendChild(tg);
        var bt = el('div', 'mc-be-text'); String(res.backendText).split(/\n+/).forEach(function (ln) { if (ln.trim()) bt.appendChild(el('p', null, ln.trim())); }); body.appendChild(bt);
        chipsAfter = (res.alts || []).map(function (a) { return a.id; }); key = 'chipsClose';
        if (!chipsAfter.length) { chipsAfter = (KB.starters[mode] || []).slice(0, 4); key = 'chipsStart'; }
      } else {
        if (res.backendNote) { var bf = el('p', 'mc-be-note'); bf.textContent = pick(S.backendFail, lang); body.appendChild(bf); }
        if (res.kind === 'closest') { var cn = el('p', 'mc-note'); cn.textContent = pick(S.closestT, lang); body.appendChild(cn); }
        if (res.kind === 'more') {
          if (entry.m) rich(body, resolveDyn(pick(entry.m, lang)));
          else { var mn = el('p'); mn.textContent = pick(S.moreNone, lang); body.appendChild(mn); }
        } else rich(body, resolveDyn(pick(entry.a, lang)));
        if (entry.aud !== 'both' && entry.aud !== mode && res.kind !== 'more') { var om = el('p', 'mc-note mc-note-soft'); om.textContent = pick(entry.aud === 'jud' ? S.otherMode : S.otherModeR, lang); body.appendChild(om); }
        if (res.confirm && res.kind !== 'more') { var cf = el('p', 'mc-note mc-note-warn'); cf.textContent = pick(S.confirmT, lang); body.appendChild(cf); }
        chipsAfter = (entry.f || []).slice(0, 3);
        (res.alts || []).forEach(function (a) { if (chipsAfter.indexOf(a.id) < 0 && chipsAfter.length < 4 && res.kind === 'closest') chipsAfter.push(a.id); });
        chipsAfter = chipsAfter.filter(function (x) { return x !== entry.id; });
        if (res.kind === 'closest') key = 'chipsClose';
      }
      return { body: body, chips: chipsAfter, key: key };
    }
    function showAnswer(res, instant) {
      var parts = renderBody(res), sh = botShell(res.lang, res.entry && res.entry.id), plainText = parts.body.textContent;
      sh.m.setAttribute('data-kind', res.kind);
      var animate = !instant && !reduced() && !res.emergency.is;
      var m = sh.m, col = sh.col, entry = res.entry;
      function finish() {
        m.setAttribute('data-done', '1'); col.removeAttribute('aria-busy');
        parts.body.removeAttribute('aria-hidden'); var sr = col.querySelector('.mc-sr'); if (sr) sr.remove();
        col.appendChild(meta(res, res.kind === 'backend' || res.kind === 'unknown' ? null : entry, res.lang));
        if (entry && res.kind !== 'unknown' && res.kind !== 'backend') lastId = entry.id;
        setChips(parts.key, parts.chips, res.lang); stick(true); typing = null;
        history.push({ role: 'bot', text: plainText.slice(0, 600), id: entry ? entry.id : null });
        log.setAttribute('data-count', String(log.querySelectorAll('.mc-msg[data-role=bot][data-done]').length));
      }
      col.appendChild(parts.body);
      if (animate) {
        parts.body.setAttribute('aria-hidden', 'true'); col.setAttribute('aria-busy', 'true');
        var sr = el('div', 'sr-only mc-sr', plainText); col.appendChild(sr);
        add(m); typing = typeInto(parts.body, finish);
      } else { add(m); finish(); }
      return m;
    }

    /* ---------- submit ---------- */
    function submit(text) {
      text = String(text == null ? inp.value : text).replace(/\s+/g, ' ').trim();
      if (!text) { say(t('sorryEmpty')); inp.focus(); return null; }
      finishNow();
      inp.value = ''; asked.push(text); askedAt = asked.length;
      userMsg(text); history.push({ role: 'user', text: text });
      started = true;
      var opts2 = { mode: mode, lang: M.lang(), last: lastId };
      var quick = ask(text, opts2);
      if (quick.emergency.is) banner();
      var dotsEl = (quick.emergency.is || reduced()) ? null : dots();
      var delay = (quick.emergency.is || reduced()) ? 0 : 520;
      var settled = false;
      function go(res, instantFlag) {
        if (settled) return; settled = true; busy = null;
        if (dotsEl) dotsEl.remove();
        showAnswer(res, quick.emergency.is || instantFlag);
      }
      if (backend && quick.kind === 'unknown' && !quick.emergency.is) {
        // the back-end may take a while: keep the dots until it answers (or fails)
        busy = function () { /* a new question while waiting: the late answer is dropped */ settled = true; if (dotsEl) dotsEl.remove(); };
        respond(text, opts2, history).then(function (res) { if (settled) return; go(res, false); });
        return quick;
      }
      if (!delay) { go(quick, true); return quick; }
      busy = function (skip) { go(quick, true); };
      thinkTimer = setTimeout(function () { thinkTimer = 0; go(quick, false); }, delay);
      return quick;
    }

    /* ---------- tools ---------- */
    function exportText() {
      var lines = [t('title') + ' · MANARA', '', M.L({ ar: 'ليست ذكاءً اصطناعيًا ولا نموذجًا لغويًا: بحث بقواعد في إجابات مكتوبة. نموذج تجريبي — في الخطر اتصل بـ 999.', en: 'Not an AI model and not a language model: rule-based search over written answers. Demo prototype — in danger call 999.' }),
        M.L({ ar: 'الوضع: ', en: 'Mode: ' }) + t(mode) + ' · ' + new Date().toISOString(), ''];
      [].forEach.call(log.querySelectorAll('.mc-msg'), function (m) {
        var role = m.getAttribute('data-role');
        if (role === 'user') lines.push(S.you.en + ' / ' + S.you.ar + ': ' + m.querySelector('.mc-bubble').textContent);
        else if (role === 'emergency') lines.push('!!! ' + S.banner1.ar + ' / ' + S.banner1.en);
        else if (role === 'bot' && m.getAttribute('data-done')) {
          var ans = m.querySelector('.mc-ans'); var ml = m.getAttribute('data-ml');
          lines.push('MANARA: ' + (ans ? ans.innerText || ans.textContent : ''));
          var srcs = [].map.call(m.querySelectorAll('.mc-link'), function (a) { return a.getAttribute('href'); }); if (srcs.length) lines.push('  → ' + srcs.join(', '));
        } else if (role === 'system') lines.push('— ' + m.textContent);
        lines.push('');
      });
      if (fb.length) { lines.push('— ' + M.L({ ar: 'التقييمات (في ذاكرة الصفحة فقط)', en: 'Ratings (kept in page memory only)' }) + ' —'); fb.forEach(function (f) { lines.push((f.v > 0 ? '+1 ' : '-1 ') + f.id + ' · ' + f.q); }); }
      return lines.join('\n');
    }
    function doExport() {
      var txt = exportText(), name = 'ask-manara-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.txt';
      try {
        var blob = new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' }), url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = name; doc.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000); say(t('exported'));
      } catch (e) { say('export failed'); }
      return txt;
    }
    function clear(silent) {
      finishNow(); log.textContent = ''; history = []; fb = []; lastId = null; started = false;
      welcome(); starters(); if (!silent) say(t('cleared')); inp.focus();
    }
    function welcome() {
      var sh = botShell('ar', null); sh.m.removeAttribute('data-ml'); sh.m.setAttribute('data-kind', 'welcome'); sh.m.setAttribute('data-done', '1');
      var b = el('div', 'mc-bubble mc-ans'); var p = el('p'); p.appendChild(bi('span', S.welcome)); b.appendChild(p); sh.col.appendChild(b); add(sh.m);
    }
    function setMode(m2, silent) {
      m2 = m2 === 'jud' ? 'jud' : 'res'; if (m2 === mode) return;
      mode = m2; M.store('manara-chat-mode', mode); labels();
      if (!silent && started) { var sy = el('div', 'mc-msg mc-sys'); sy.setAttribute('data-role', 'system'); sy.textContent = t('switched') + ' ' + t(mode); add(sy); say(t('switched') + ' ' + t(mode)); }
      starters();
    }

    /* ---------- events ---------- */
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' && asked.length && (inp.value === '' || askedAt < asked.length)) { askedAt = Math.max(0, askedAt - 1); inp.value = asked[askedAt] || ''; e.preventDefault(); }
      else if (e.key === 'ArrowDown' && askedAt < asked.length) { askedAt = Math.min(asked.length, askedAt + 1); inp.value = asked[askedAt] || ''; e.preventDefault(); }
    });
    bRes.addEventListener('click', function () { setMode('res'); }); bJud.addEventListener('click', function () { setMode('jud'); });
    bExp.addEventListener('click', doExport); bClr.addEventListener('click', function () { clear(); });
    log.addEventListener('click', function (e) { if (typing && e.target.closest && e.target.closest('.mc-ans')) finishNow(); });   // a click on a typing answer completes it
    function onLang() { labels(); setChips(chipState.key, chipState.ids, M.lang()); }
    function onBackend(e) { beTag.hidden = !e.detail; }
    window.addEventListener('langchange', onLang); window.addEventListener('manara-chat-backend', onBackend);
    beTag.hidden = !backend;
    labels(); welcome(); starters();

    return {
      el: root, input: inp, ask: submit, clear: clear, setMode: setMode, mode: function () { return mode; }, exportText: exportText, download: doExport, feedback: function () { return fb.slice(); },
      focus: function () { inp.focus(); }, history: function () { return history.slice(); },
      destroy: function () { window.removeEventListener('langchange', onLang); window.removeEventListener('manara-chat-backend', onBackend); root.remove(); }
    };
  }

  /* ====================================================================================================================================================
     8. THE FLOATING PANEL (opened from the launcher button that core.js adds to every page)
     ==================================================================================================================================================== */
  var panel = null, panelChat = null, opener = null, onKey = null;
  function buildPanel() {
    panel = el('div', 'mc-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('tabindex', '-1'); panel.hidden = true; panel.id = 'mc-panel';
    var top = el('div', 'mc-ptop'); var h = el('h2', 'mc-ptitle'); h.id = 'mc-ptitle'; var tt = bi('span', S.title); h.appendChild(tt);
    var x = el('button', 'icon-btn mc-pclose'); x.type = 'button'; var xi = icon('x'); if (xi) x.appendChild(xi);
    function lb() { x.setAttribute('aria-label', t('close')); x.title = t('close'); panel.setAttribute('aria-labelledby', 'mc-ptitle'); }
    lb(); window.addEventListener('langchange', lb);
    x.addEventListener('click', function () { closePanel(true); });
    top.appendChild(h); top.appendChild(x); panel.appendChild(top);
    var body = el('div', 'mc-pbody'); panel.appendChild(body); doc.body.appendChild(panel);
    panelChat = createChat(body, { panel: true });
  }
  function openPanel(btn) {
    if (!panel) buildPanel();
    opener = btn || opener; panel.hidden = false; if (opener) opener.setAttribute('aria-expanded', 'true'); doc.documentElement.setAttribute('data-chat-open', '1');
    onKey = onKey || function (e) { if (e.key === 'Escape' && panel && !panel.hidden) { e.preventDefault(); closePanel(true); } };
    doc.addEventListener('keydown', onKey);
    setTimeout(function () { if (panelChat) panelChat.focus(); }, 30);
  }
  function closePanel(restore) {
    if (!panel || panel.hidden) return;
    panel.hidden = true; if (opener) opener.setAttribute('aria-expanded', 'false'); doc.documentElement.removeAttribute('data-chat-open');
    doc.removeEventListener('keydown', onKey);
    if (restore && opener) opener.focus();
  }
  function togglePanel(btn) { if (panel && !panel.hidden) closePanel(true); else openPanel(btn); }

  /* ====================================================================================================================================================
     9. PUBLIC API  →  Manara.chat
     ==================================================================================================================================================== */
  M.chat = {
    version: '1',
    ask: ask,                                         // (question, {mode:'res'|'jud', lang, last}) → result (synchronous, local only, never calls the back-end)
    respond: respond,                                 // same, but asks the optional back-end when the local answer is "unknown" → Promise<result>
    setBackend: setBackend,                           // (async fn(question, context) → text | null)
    hasBackend: function () { return !!backend; },
    normalize: normalize, tokens: function (s) { return wordsOf(s); }, stem: stem,
    entries: function () { return ENT.map(function (e) { return e.id; }); },
    entry: function (id) { return BY_ID[id] || null; },
    kb: KB,
    mount: function (node, o) { return createChat(node, o); },
    openPanel: openPanel, closePanel: function () { closePanel(true); }, toggle: togglePanel, isOpen: function () { return !!panel && !panel.hidden; },
    thresholds: { min: T_MIN, sure: T_SURE, cover: T_COVER }
  };
  /* chat.html: the full-page chat mounts itself into [data-chat-mount]; [data-chat-topics] lists every topic as a button */
  function buildTopics(box, inst) {
    var groups = [['res', { ar: 'للسكان', en: 'For residents' }], ['jud', { ar: 'للحكام والزوار', en: 'For judges and visitors' }], ['both', { ar: 'للجميع', en: 'For everyone' }]];
    function draw() {
      box.textContent = '';
      groups.forEach(function (g) {
        var h = el('h3', 'mc-topics-h'); h.appendChild(bi('span', g[1])); box.appendChild(h);
        var row = el('div', 'chips');
        ENT.filter(function (e) { return e.aud === g[0]; }).forEach(function (e) {
          var b = el('button', 'chip mc-chip', M.L(e.q)); b.type = 'button'; b.setAttribute('data-id', e.id);
          b.addEventListener('click', function () { if (g[0] !== 'both') inst.setMode(g[0], true); inst.ask(M.L(e.q)); inst.focus(); });
          row.appendChild(b);
        });
        box.appendChild(row);
      });
    }
    draw(); window.addEventListener('langchange', draw);
  }
  function pageMount() {
    var host = doc.querySelector('[data-chat-mount]'); if (!host || host.firstChild) return;
    var inst = createChat(host, {}); M.chat.page = inst;
    var tb = doc.querySelector('[data-chat-topics]'); if (tb) buildTopics(tb, inst);
  }
  pageMount();
  if (!window.MANARA_TEST_COUNTS) {                   // the optional "automated checks" figure comes from the generated counts file (pages that do not load it get it here)
    var s = doc.createElement('script'); s.src = 'data/test-counts.js'; doc.head.appendChild(s);
  }
  window.dispatchEvent(new CustomEvent('manara-chat-ready'));
})();
