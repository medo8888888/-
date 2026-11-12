// tournament-engine: the pure tournament engine of «مشروع ينابيع» (window.YTour; module.exports for node tests).
// Contract: docs/YANABEE_APP.md "Tournament engine". Rules: content/yanabee/competition.txt (c-format fm-football / fm-chess,
// c-league lg2 forfeits, lg4 unregistered player, lg6 points 3/1/0 and the tie-break order: goal difference, goals scored,
// head-to-head, fewer red then yellow cards, then a public draw).
//
// Pure functions only: no DOM, no storage, no network, no clock. Every mutator returns a NEW state and never touches its
// input. A mutator first runs normalize() on the input (so legacy / partial / decoded states are fine) and, after the change,
// removes everything that no longer agrees with the state (later results that depended on a changed result, tie decisions
// whose tie set changed). Errors are `Error` objects with a short English code as message (and `.code`):
//   bad_state bad_team duplicate_team duplicate_name too_many_teams need_12_teams no_groups bad_groups unknown_team
//   same_team bad_group bad_score bad_cards bad_text bad_result final_not_ready not_in_final bad_kind bad_side bad_scope
//   not_tied bad_order no_draw_needed bad_rng bad_ids bad_pairs bad_stage bad_index bad_winner r1_incomplete
//   rr_unavailable rr_incomplete rr_unresolved bad_share
// Classic script (IIFE), ES2017, works from file://.
(function () {
  'use strict';

  var VERSION = 1;
  var SCOPES = ['g0', 'g1', 'g2', 'final'];
  var GROUP_NAMES = ['أ', 'ب', 'ج'];
  var FORFEIT_KINDS = ['absent', 'late', 'withdraw', 'withdraw_during', 'unregistered'];
  // goals given to the other side by each administrative result (competition.txt lg2 / lg4, revised Nov 2026):
  // late > 10 min 0 – 2, absent 0 – 3, withdrawal before 0 – 2, withdrawal during 0 – 3, unregistered player 3 – 0
  var FORFEIT_GOALS = { late: 2, absent: 3, withdraw: 2, withdraw_during: 3, unregistered: 3 };
  // the kinds that carry «إنذار أول بالخروج من المسابقة» (lg2); a second one goes to the committee (exclusion row)
  var WARNING_KINDS = ['absent', 'withdraw', 'withdraw_during'];
  var MAX_SCORE = 999;
  var MAX_TEAMS = 12;
  var TOTAL_FOOTBALL = 21; // 3 groups x 6 + final round 3
  var TOTAL_CHESS = 13;    // 6 + 3 + 3 + 1

  /* ------------------------------------------------------------------ helpers */
  function fail(code) { var e = new Error(code); e.code = code; throw e; }
  function isStr(v) { return typeof v === 'string'; }
  function isCount(v, max) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0 && v <= (max === undefined ? MAX_SCORE : max);
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function newMap() { return Object.create(null); }
  function pairKey(a, b) { return [String(a), String(b)].sort().join('|'); }
  function cleanId(v) {
    if (typeof v === 'number' && isFinite(v)) v = String(v);
    if (!isStr(v)) return null;
    v = v.trim();
    if (!v || v.length > 40 || v.indexOf('|') >= 0) return null;
    return v;
  }
  function cleanText(v, max) { return isStr(v) ? v.trim().slice(0, max) : ''; }
  function idMap(teams) { var m = newMap(); teams.forEach(function (t) { m[t.id] = 1; }); return m; }
  function canon(x) {
    if (x === undefined) x = null;
    if (x === null || typeof x !== 'object') return JSON.stringify(x);
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    return '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(x[k]); }).join(',') + '}';
  }
  function unique(a) { var m = newMap(); for (var i = 0; i < a.length; i++) { if (m[a[i]]) return false; m[a[i]] = 1; } return true; }
  function sameSet(a, b) { return a.length === b.length && unique(a) && unique(b) && a.slice().sort().join('|') === b.slice().sort().join('|'); }
  function rngFn(rng) {
    if (rng === undefined || rng === null) return Math.random;
    if (typeof rng !== 'function') fail('bad_rng');
    return rng;
  }
  function rnd(f) { var r = f(); if (typeof r !== 'number' || !(r >= 0 && r < 1)) fail('bad_rng'); return r; }
  function shuffle(list, rng) {
    var f = rngFn(rng), a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd(f) * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* tie-decision runs: fb.order[scope] is a flat list of ids; several decisions in one scope are separated by null */
  function runsOf(order) {
    var runs = [], cur = [];
    (Array.isArray(order) ? order : []).forEach(function (v) {
      if (v === null) { if (cur.length) runs.push(cur); cur = []; } else if (isStr(v)) cur.push(v);
    });
    if (cur.length) runs.push(cur);
    return runs;
  }
  function serializeRuns(runs) {
    var out = [];
    runs.forEach(function (r, i) { if (i) out.push(null); r.forEach(function (id) { out.push(id); }); });
    return out;
  }
  function findRun(runs, ids) {
    for (var i = 0; i < runs.length; i++) if (sameSet(runs[i], ids)) return runs[i];
    return null;
  }

  /* ------------------------------------------------------------------ state */
  // fb.sched[pairKey] = { date, time }: when a fixture is planned (kept apart from the result, which can carry its own date/time)
  function newFb() { return { res: {}, order: {}, sched: {} }; }

  function emptyState() {
    return {
      v: VERSION, updated: '', teams: [], groups: null,
      fb: newFb(),
      chess: { r1: [], r2: [], rr: { res: {}, order: null }, final: { w: null } }
    };
  }

  function cleanTeams(raw) {
    var out = [], seen = newMap();
    (Array.isArray(raw) ? raw : []).forEach(function (t, i) {
      if (out.length >= MAX_TEAMS || t === null || t === undefined) return;
      var id, name, chess;
      if (isStr(t)) { id = 't' + (i + 1); name = t; } else if (typeof t === 'object') { id = cleanId(t.id); name = t.name; chess = t.chess; } else return;
      name = cleanText(name, 60);
      if (!id || !name || seen[id]) return;
      seen[id] = 1;
      var team = { id: id, name: name };
      chess = cleanText(chess, 60);
      if (chess) team.chess = chess;
      out.push(team);
    });
    return out;
  }

  function groupsShapeOk(groups, ids, count) {
    if (!Array.isArray(groups) || groups.length !== 3) return false;
    var seen = newMap(), n = 0;
    for (var g = 0; g < 3; g++) {
      if (!Array.isArray(groups[g]) || groups[g].length !== 4) return false;
      for (var i = 0; i < 4; i++) {
        var id = groups[g][i];
        if (!isStr(id) || !ids[id] || seen[id]) return false;
        seen[id] = 1; n++;
      }
    }
    return n === 12 && count === 12;
  }
  function groupsOk(st) { return groupsShapeOk(st.groups, idMap(st.teams), st.teams.length); }

  function cleanResult(r, ids) {
    if (!r || typeof r !== 'object') return null;
    var a = cleanId(r.a), b = cleanId(r.b);
    if (!a || !b || a === b || !ids[a] || !ids[b]) return null;
    if (!isCount(r.sa) || !isCount(r.sb)) return null;
    var ca = isCount(r.ca) ? r.ca : 0, cb = isCount(r.cb) ? r.cb : 0;
    var out = {
      a: a, b: b, sa: r.sa, sb: r.sb, ca: ca, cb: cb,
      date: cleanText(r.date, 40), time: cleanText(r.time, 40), note: cleanText(r.note, 200)
    };
    if (isCount(r.ra) && r.ra > 0) out.ra = Math.min(r.ra, ca);
    if (isCount(r.rb) && r.rb > 0) out.rb = Math.min(r.rb, cb);
    if (isStr(r.adm) && FORFEIT_KINDS.indexOf(r.adm) >= 0) {
      var fault = cleanId(r.fault);
      if (fault === a || fault === b) { out.adm = r.adm; out.fault = fault; }
    }
    return out;
  }
  function listOf(x) {
    if (!x || typeof x !== 'object') return [];
    return Array.isArray(x) ? x : Object.keys(x).map(function (k) { return x[k]; });
  }
  function cleanResMap(raw, ids) {
    var out = {};
    listOf(raw).forEach(function (r) {
      var c = cleanResult(r, ids);
      if (c) out[pairKey(c.a, c.b)] = c;
    });
    return out;
  }
  function cleanOrderMap(raw, ids) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    SCOPES.forEach(function (scope) {
      var arr = raw[scope];
      if (!Array.isArray(arr)) return;
      var seen = newMap(), runs = [], cur = [];
      arr.forEach(function (v) {
        if (v === null) { if (cur.length) runs.push(cur); cur = []; return; }
        var id = cleanId(v);
        if (id && ids[id] && !seen[id]) { seen[id] = 1; cur.push(id); }
      });
      if (cur.length) runs.push(cur);
      runs = runs.filter(function (r) { return r.length > 1; });
      if (runs.length) out[scope] = serializeRuns(runs);
    });
    return out;
  }
  function cleanPairList(raw, ids, max) {
    var out = [];
    (Array.isArray(raw) ? raw : []).forEach(function (p) {
      if (out.length >= max || !p || typeof p !== 'object') return;
      var a, b, w;
      if (Array.isArray(p)) { a = cleanId(p[0]); b = cleanId(p[1]); w = p[2]; } else { a = cleanId(p.a); b = cleanId(p.b); w = p.w; }
      if (!a || !b || a === b || !ids[a] || !ids[b]) return;
      w = cleanId(w);
      out.push({ a: a, b: b, w: (w === a || w === b) ? w : null });
    });
    return out;
  }
  function cleanChess(raw, ids) {
    var out = emptyState().chess;
    if (!raw || typeof raw !== 'object') return out;
    out.r1 = cleanPairList(raw.r1, ids, 6);
    out.r2 = cleanPairList(raw.r2, ids, 3);
    var rr = raw.rr && typeof raw.rr === 'object' ? raw.rr : {};
    listOf(rr.res).forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var a = cleanId(r.a), b = cleanId(r.b), w = cleanId(r.w);
      if (!a || !b || a === b || !ids[a] || !ids[b] || (w !== a && w !== b)) return;
      out.rr.res[pairKey(a, b)] = { a: a, b: b, w: w };
    });
    if (Array.isArray(rr.order)) {
      var ord = [];
      rr.order.forEach(function (v) { var id = cleanId(v); if (id && ids[id] && ord.indexOf(id) < 0) ord.push(id); });
      out.rr.order = ord.length > 1 ? ord : null;
    }
    var w = raw.final && typeof raw.final === 'object' ? cleanId(raw.final.w) : null;
    out.final.w = w && ids[w] ? w : null;
    return out;
  }

  function cleanSchedMap(raw, ids) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (k) {
      var parts = k.split('|'), v = raw[k];
      if (parts.length !== 2 || !ids[parts[0]] || !ids[parts[1]] || parts[0] === parts[1] || pairKey(parts[0], parts[1]) !== k) return;
      if (!v || typeof v !== 'object') return;
      var date = cleanText(v.date, 40), time = cleanText(v.time, 40);
      if (date || time) out[k] = { date: date, time: time };
    });
    return out;
  }

  // Tolerant: anything in, a valid and self-consistent v1 state out (unknown ids dropped, stale later results removed).
  function normalize(input, raw) {
    var src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    var st = emptyState();
    st.updated = isStr(src.updated) ? src.updated.slice(0, 40) : '';
    st.teams = cleanTeams(src.teams);
    var ids = idMap(st.teams);
    st.groups = groupsShapeOk(src.groups, ids, st.teams.length) ? src.groups.map(function (g) { return g.slice(); }) : null;
    var fb = src.fb && typeof src.fb === 'object' ? src.fb : {};
    st.fb.res = cleanResMap(fb.res, ids);
    st.fb.order = cleanOrderMap(fb.order, ids);
    st.fb.sched = cleanSchedMap(fb.sched, ids);
    st.chess = cleanChess(src.chess, ids);
    return raw ? st : reconcile(st, true, true);
  }
  // mutators start from the cleaned-up input and clean up again once, after their change (settle)
  function prep(s) { return normalize(s, true); }
  function settle(st) { return reconcile(st, true, true); }

  /* ------------------------------------------------------------------ round robin */
  // rounds of [a,b] pairs (circle method). 4 ids -> 3 rounds x 2 matches; 3 ids -> 3 rounds x 1 match (one rests each round).
  function roundRobin(ids) {
    if (!Array.isArray(ids) || ids.length < 2 || !ids.every(isStr) || !unique(ids)) fail('bad_ids');
    var arr = ids.slice();
    if (arr.length % 2) arr.push(null);
    var m = arr.length, rounds = [];
    for (var r = 0; r < m - 1; r++) {
      var round = [];
      for (var i = 0; i < m / 2; i++) {
        var x = arr[i], y = arr[m - 1 - i];
        if (x !== null && y !== null) round.push([x, y]);
      }
      rounds.push(round);
      arr = [arr[0], arr[m - 1]].concat(arr.slice(1, m - 1));
    }
    return rounds;
  }

  /* ------------------------------------------------------------------ the football table (lg6) */
  // Cards: ca/cb = all cards of the team in that match; ra/rb (optional) = how many of them are red. lg6 «الأقل بطاقات
  // حمراء فصفراء» is read as: fewer red cards first, then fewer yellow cards (cards - reds), like league-table.js.
  function cardsStep(C) {
    var sorted = C.slice().sort(function (x, y) { return x.reds - y.reds || (x.cards - x.reds) - (y.cards - y.reds) || x.i - y.i; });
    var tiers = [];
    sorted.forEach(function (r) {
      var t = tiers[tiers.length - 1];
      if (t && t.rows[0].reds === r.reds && (t.rows[0].cards - t.rows[0].reds) === (r.cards - r.reds)) t.rows.push(r);
      else tiers.push({ rows: [r], flag: null, sep: 'cards' });
    });
    tiers.forEach(function (t, ti) {
      t.flag = t.rows.length > 1 ? 'draw' : null;
      if (ti === tiers.length - 1) t.sep = null;
    });
    return tiers;
  }
  // head-to-head among the tied teams (their matches against each other only); re-applied to every smaller tie that is left
  function resolveCluster(C, ms) {
    var set = newMap();
    C.forEach(function (r) { set[r.id] = 1; });
    var inner = ms.filter(function (m) { return set[m.a] && set[m.b]; });
    var need = C.length * (C.length - 1) / 2;
    if (inner.length === need) {
      var mini = newMap();
      C.forEach(function (r) { mini[r.id] = 0; });
      inner.forEach(function (m) {
        if (m.sa > m.sb) mini[m.a] += 3; else if (m.sb > m.sa) mini[m.b] += 3; else { mini[m.a] += 1; mini[m.b] += 1; }
      });
      var sorted = C.slice().sort(function (x, y) { return mini[y.id] - mini[x.id] || x.i - y.i; });
      var parts = [];
      sorted.forEach(function (r) {
        var p = parts[parts.length - 1];
        if (p && mini[p[0].id] === mini[r.id]) p.push(r); else parts.push([r]);
      });
      if (parts.length > 1) {
        var out = [];
        parts.forEach(function (p, pi) {
          var sub = p.length === 1 ? [{ rows: p, flag: null, sep: null }] : resolveCluster(p, ms);
          sub[sub.length - 1].sep = pi < parts.length - 1 ? 'h2h' : null;
          out = out.concat(sub);
        });
        return out;
      }
      // the head-to-head does not separate them: all draws -> go on to the cards; any other mix (a cycle) -> the committee
      if (!inner.every(function (m) { return m.sa === m.sb; })) return [{ rows: C, flag: 'committee', sep: null }];
    }
    return cardsStep(C);
  }

  // -> { rows, complete, played, total, clusters:[{ids, flag, decided}] }; flags exist only once every pair has played.
  function rankTable(ids, results, order) {
    var n = ids.length, idx = newMap(), by = newMap();
    var rows = ids.map(function (id, i) {
      idx[id] = i;
      var r = { id: id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, cards: 0, reds: 0, rank: 0, flag: null, decided: false, tied: false, tieWith: null, notes: [], i: i };
      by[id] = r;
      return r;
    });
    var ms = [], seen = newMap();
    listOf(results).forEach(function (r) {
      if (!r || !isStr(r.a) || !isStr(r.b) || idx[r.a] === undefined || idx[r.b] === undefined || r.a === r.b) return;
      if (!isCount(r.sa) || !isCount(r.sb)) return;
      var k = pairKey(r.a, r.b);
      if (seen[k]) return;
      seen[k] = 1;
      ms.push(r);
      var A = by[r.a], B = by[r.b];
      A.p++; B.p++;
      A.gf += r.sa; A.ga += r.sb; B.gf += r.sb; B.ga += r.sa;
      var ca = isCount(r.ca) ? r.ca : 0, cb = isCount(r.cb) ? r.cb : 0;
      A.cards += ca; B.cards += cb;
      A.reds += Math.min(isCount(r.ra) ? r.ra : 0, ca); B.reds += Math.min(isCount(r.rb) ? r.rb : 0, cb);
      if (r.sa > r.sb) { A.w++; B.l++; A.pts += 3; } else if (r.sb > r.sa) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; }
    });
    rows.forEach(function (r) { r.gd = r.gf - r.ga; });
    var total = n * (n - 1) / 2;
    var complete = n >= 2 && ms.length === total;
    var sorted = rows.slice().sort(function (x, y) { return y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.i - y.i; });
    var tiers = [], cluster = [];
    var flush = function () {
      if (!cluster.length) return;
      if (cluster.length === 1) tiers.push({ rows: cluster, flag: null, sep: null });
      else tiers = tiers.concat(resolveCluster(cluster, ms));
      cluster = [];
    };
    sorted.forEach(function (r) {
      var c = cluster[0];
      if (c && (c.pts !== r.pts || c.gd !== r.gd || c.gf !== r.gf)) flush();
      cluster.push(r);
    });
    flush();

    var runs = runsOf(order), out = [], clusters = [], pos = 0;
    tiers.forEach(function (t) {
      var members = t.rows, tie = members.length > 1;
      var flag = tie && complete ? t.flag : null, decided = false;
      var setIds = members.map(function (r) { return r.id; });
      if (flag) {
        var run = findRun(runs, setIds);
        if (run) { members = run.map(function (id) { return by[id]; }); flag = null; decided = true; }
      }
      members.forEach(function (r, i) {
        r.flag = flag; r.decided = decided; r.tied = tie && !decided;
        r.tieWith = tie && (flag || decided) ? setIds.slice().sort() : null;
        r.rank = r.tied ? pos + 1 : pos + 1 + i;
        out.push(r);
      });
      if (tie && (flag || decided)) clusters.push({ ids: members.map(function (r) { return r.id; }), flag: flag, decided: decided });
      members[members.length - 1]._sep = t.sep;
      pos += members.length;
    });
    // why each neighbour pair was separated, and what is still open
    for (var i = 0; i + 1 < out.length; i++) {
      var a = out[i], b = out[i + 1];
      if (a.pts !== b.pts) continue;
      var step = a.gd !== b.gd ? 'gd' : a.gf !== b.gf ? 'gf' : (a._sep || null);
      if (step) { a.notes.push({ step: step, vs: [b.id] }); b.notes.push({ step: step, vs: [a.id] }); }
    }
    out.forEach(function (r) {
      if (r.flag) r.notes.push({ step: 'tie', flag: r.flag, with: r.tieWith.slice() });
      else if (r.decided) r.notes.push({ step: 'decision', with: r.tieWith.slice() });
      delete r._sep; delete r.i;
    });
    return { rows: out, complete: complete, played: ms.length, total: total, clusters: clusters };
  }

  // public: table(ids, results, {order}) -> rows. `results` = the fb.res object (or an array of results).
  function table(ids, results, opts) {
    if (!Array.isArray(ids) || !ids.every(isStr) || !unique(ids)) fail('bad_ids');
    return rankTable(ids, results, opts && opts.order).rows;
  }

  function pruneRuns(ids, results, order) {
    var runs = runsOf(order);
    if (!runs.length) return null;
    var keep = [];
    rankTable(ids, results, null).clusters.forEach(function (c) {
      var run = findRun(runs, c.ids);
      if (run) keep.push(run);
    });
    return keep.length ? serializeRuns(keep) : null;
  }
  function putOrder(order, scope, arr) { if (arr && arr.length) order[scope] = arr; else delete order[scope]; }

  /* ------------------------------------------------------------------ football model */
  function fbCore(st) {
    var out = { drawn: false, tables: [], firsts: [null, null, null], qualifiers: null, finalTable: null };
    if (!groupsOk(st)) return out;
    out.drawn = true;
    for (var g = 0; g < 3; g++) {
      var t = rankTable(st.groups[g], st.fb.res, st.fb.order['g' + g]);
      out.tables.push(t);
      out.firsts[g] = t.complete && t.rows[0].flag === null ? t.rows[0].id : null;
    }
    if (out.firsts.every(function (f) { return f !== null; })) {
      out.qualifiers = out.firsts.slice();
      out.finalTable = rankTable(out.qualifiers, st.fb.res, st.fb.order.final);
    }
    return out;
  }

  // Keeps the football part consistent: results only between group mates (or between teams that can still be
  // qualifiers), tie decisions only for ties that exist right now.
  function reconcileFb(st) {
    if (!groupsOk(st)) { st.groups = null; st.fb = newFb(); return; }
    var res = st.fb.res, order = st.fb.order, gof = newMap();
    st.groups.forEach(function (g, gi) { g.forEach(function (id) { gof[id] = gi; }); });
    Object.keys(res).forEach(function (k) {
      var r = res[k];
      if (!r || gof[r.a] === undefined || gof[r.b] === undefined || r.a === r.b || pairKey(r.a, r.b) !== k) delete res[k];
    });
    var firsts = [];
    for (var g = 0; g < 3; g++) {
      var scope = 'g' + g;
      putOrder(order, scope, pruneRuns(st.groups[g], res, order[scope]));
      var t = rankTable(st.groups[g], res, order[scope]);
      firsts[g] = t.complete && t.rows[0].flag === null ? t.rows[0].id : null;
    }
    // a final-round result needs both teams to still be possible qualifiers
    Object.keys(res).forEach(function (k) {
      var r = res[k], ga = gof[r.a], gb = gof[r.b];
      if (ga === gb) return;
      if ((firsts[ga] !== null && firsts[ga] !== r.a) || (firsts[gb] !== null && firsts[gb] !== r.b)) delete res[k];
    });
    var q = firsts.every(function (f) { return f !== null; }) ? firsts : null;
    putOrder(order, 'final', q ? pruneRuns(q, res, order.final) : null);
    var sched = st.fb.sched || (st.fb.sched = {});
    Object.keys(sched).forEach(function (k) {
      var ab = k.split('|'), ga = gof[ab[0]], gb = gof[ab[1]];
      if (ga === undefined || gb === undefined) { delete sched[k]; return; }
      if (ga !== gb && !(q && q.indexOf(ab[0]) >= 0 && q.indexOf(ab[1]) >= 0)) delete sched[k];
    });
    Object.keys(order).forEach(function (k) { if (SCOPES.indexOf(k) < 0) delete order[k]; });
  }

  function orient(res, a, b) {
    if (!res) return { sa: null, sb: null };
    return res.a === a ? { sa: res.sa, sb: res.sb } : { sa: res.sb, sb: res.sa };
  }
  function roundsOf(ids, results, sched) {
    return roundRobin(ids).map(function (matches, ri) {
      return {
        round: ri + 1,
        matches: matches.map(function (m) {
          var key = pairKey(m[0], m[1]), res = results[key] ? Object.assign({}, results[key]) : null, o = orient(res, m[0], m[1]);
          var sc = sched && sched[key] ? { date: sched[key].date, time: sched[key].time } : null;
          return { key: key, a: m[0], b: m[1], res: res, sa: o.sa, sb: o.sb, sched: sc };
        })
      };
    });
  }
  function podiumOf(t) {
    if (!t || !t.complete || t.rows.some(function (r) { return r.flag !== null; })) return null;
    return t.rows.map(function (r) { return r.id; });
  }

  function footballOf(st) {
    var core = fbCore(st);
    var out = { drawn: core.drawn, groups: [], qualified: core.firsts.slice(), qualifiers: core.qualifiers ? core.qualifiers.slice() : null, final: null, podium: null, played: 0, total: TOTAL_FOOTBALL, pending: [] };
    if (!core.drawn) return out;
    core.tables.forEach(function (t, g) {
      var ids = st.groups[g];
      out.groups.push({
        index: g, name: GROUP_NAMES[g], teams: ids.slice(), rounds: roundsOf(ids, st.fb.res, st.fb.sched), table: t.rows,
        complete: t.complete, played: t.played, total: t.total, first: core.firsts[g], ties: clone(t.clusters)
      });
      out.played += t.played;
      if (core.firsts[g] === null) out.pending.push({ scope: 'g' + g, reason: t.complete ? 'tie' : 'incomplete' });
    });
    if (core.qualifiers) {
      var f = core.finalTable;
      out.final = {
        teams: core.qualifiers.slice(), rounds: roundsOf(core.qualifiers, st.fb.res, st.fb.sched), table: f.rows,
        complete: f.complete, played: f.played, total: f.total, ties: clone(f.clusters)
      };
      out.played += f.played;
      out.podium = podiumOf(f);
      if (!out.podium) out.pending.push({ scope: 'final', reason: f.complete ? 'tie' : 'incomplete' });
    }
    return out;
  }

  function football(s) { return footballOf(normalize(s)); }

  /* ------------------------------------------------------------------ chess model */
  // round robin of the 3 round-2 winners: only a winner per match (no draws); standings by wins.
  function rrAnalysis(W, res, order) {
    var idx = newMap(), by = newMap();
    var rows = W.map(function (id, i) {
      idx[id] = i;
      var r = { id: id, p: 0, w: 0, l: 0, rank: 0, flag: null, decided: false, tied: false, tieWith: null, i: i };
      by[id] = r;
      return r;
    });
    var played = 0;
    Object.keys(res || {}).forEach(function (k) {
      var r = res[k];
      if (!r || idx[r.a] === undefined || idx[r.b] === undefined || r.a === r.b || (r.w !== r.a && r.w !== r.b)) return;
      played++;
      var loser = r.w === r.a ? r.b : r.a;
      by[r.w].p++; by[r.w].w++; by[loser].p++; by[loser].l++;
    });
    var total = W.length * (W.length - 1) / 2, complete = played === total;
    var sorted = rows.slice().sort(function (x, y) { return y.w - x.w || x.i - y.i; });
    var tiers = [];
    sorted.forEach(function (r) {
      var t = tiers[tiers.length - 1];
      if (t && t[0].w === r.w) t.push(r); else tiers.push([r]);
    });
    var out = [], clusters = [], pos = 0;
    tiers.forEach(function (t) {
      var tie = t.length > 1, flag = tie && complete ? 'committee' : null, decided = false;
      var setIds = t.map(function (r) { return r.id; });
      if (flag && Array.isArray(order) && sameSet(order, setIds)) {
        t = order.map(function (id) { return by[id]; }); flag = null; decided = true;
      }
      t.forEach(function (r, i) {
        r.flag = flag; r.decided = decided; r.tied = tie && !decided;
        r.tieWith = tie && (flag || decided) ? setIds.slice().sort() : null;
        r.rank = r.tied ? pos + 1 : pos + 1 + i;
        delete r.i;
        out.push(r);
      });
      if (tie && (flag || decided)) clusters.push({ ids: t.map(function (r) { return r.id; }), flag: flag, decided: decided });
      pos += t.length;
    });
    var resolved = complete && out.every(function (r) { return r.flag === null; });
    return {
      rows: out, complete: complete, played: played, total: total, clusters: clusters,
      tied: complete && !resolved,
      top2: resolved ? [out[0].id, out[1].id] : null,
      third: resolved ? out[2].id : null
    };
  }

  function reconcileChess(st) {
    var c = st.chess, ids = idMap(st.teams);
    // round 1: six pairs over the 12 teams, each exactly once -- otherwise nothing of the bracket stands
    var ok = c.r1.length === 6 && st.teams.length === 12;
    if (ok) {
      var seen = newMap();
      c.r1.forEach(function (p) { seen[p.a] = 1; seen[p.b] = 1; });
      ok = Object.keys(seen).length === 12;
    }
    if (!ok) c.r1 = [];
    var pool = newMap();
    c.r1.forEach(function (p) { if (p.w) pool[p.w] = 1; });
    // round 2: only pairs of round-1 winners, each winner once
    var used = newMap(), r2 = [];
    c.r2.forEach(function (p) {
      if (r2.length < 3 && pool[p.a] && pool[p.b] && !used[p.a] && !used[p.b]) { used[p.a] = 1; used[p.b] = 1; r2.push(p); }
    });
    c.r2 = r2;
    var W = r2.length === 3 && r2.every(function (p) { return p.w; }) ? r2.map(function (p) { return p.w; }) : null;
    // round robin of the three winners
    if (!W) {
      c.rr = { res: {}, order: null };
    } else {
      var inW = newMap();
      W.forEach(function (id) { inW[id] = 1; });
      var res = {};
      Object.keys(c.rr.res).forEach(function (k) {
        var r = c.rr.res[k];
        if (r && inW[r.a] && inW[r.b] && r.a !== r.b && (r.w === r.a || r.w === r.b) && pairKey(r.a, r.b) === k) res[k] = r;
      });
      c.rr.res = res;
      var base = rrAnalysis(W, res, null);
      c.rr.order = base.clusters.length && Array.isArray(c.rr.order) && sameSet(c.rr.order, base.clusters[0].ids) ? c.rr.order.slice() : null;
    }
    var an = W ? rrAnalysis(W, c.rr.res, c.rr.order) : null;
    if (!an || !an.top2 || (c.final.w !== an.top2[0] && c.final.w !== an.top2[1])) c.final.w = null;
    if (c.final.w !== null && !ids[c.final.w]) c.final.w = null;
  }

  function reconcile(st, doFb, doChess) {
    if (doFb) reconcileFb(st);
    if (doChess) reconcileChess(st);
    return st;
  }

  function chessOf(st) {
    var c = st.chess;
    var r1 = c.r1.map(function (p, i) { return { index: i, a: p.a, b: p.b, w: p.w }; });
    var r1Winners = r1.filter(function (p) { return p.w; }).map(function (p) { return p.w; });
    var r1Complete = r1.length === 6 && r1Winners.length === 6;
    var r2 = c.r2.map(function (p, i) { return { index: i, a: p.a, b: p.b, w: p.w }; });
    var r2Winners = r2.filter(function (p) { return p.w; }).map(function (p) { return p.w; });
    var r2Complete = r2.length === 3 && r2Winners.length === 3;
    var inR2 = newMap();
    r2.forEach(function (p) { inR2[p.a] = 1; inR2[p.b] = 1; });
    var rr = { teams: [], matches: [], table: [], complete: false, played: 0, total: 3, tied: false, top2: null, third: null, order: null, ties: [] };
    var final = null, podium = null, an = null;
    if (r2Complete) {
      var W = r2Winners;
      an = rrAnalysis(W, c.rr.res, c.rr.order);
      rr.teams = W.slice();
      roundRobin(W).forEach(function (round, ri) {
        round.forEach(function (m) {
          var key = pairKey(m[0], m[1]), r = c.rr.res[key];
          rr.matches.push({ round: ri + 1, key: key, a: m[0], b: m[1], w: r ? r.w : null });
        });
      });
      rr.table = an.rows; rr.complete = an.complete; rr.played = an.played; rr.tied = an.tied;
      rr.top2 = an.top2; rr.third = an.third; rr.order = c.rr.order ? c.rr.order.slice() : null; rr.ties = clone(an.clusters);
      if (an.top2) {
        final = { a: an.top2[0], b: an.top2[1], w: c.final.w };
        if (c.final.w) podium = [c.final.w, c.final.w === an.top2[0] ? an.top2[1] : an.top2[0], an.third];
      }
    }
    var played = r1Winners.length + r2Winners.length + rr.played + (final && final.w ? 1 : 0);
    return {
      r1: { matches: r1, complete: r1Complete, winners: r1Winners, played: r1Winners.length, total: 6 },
      r2: {
        matches: r2, complete: r2Complete, winners: r2Winners, played: r2Winners.length, total: 3,
        pool: r1Complete ? r1Winners.slice() : [],
        free: r1Complete ? r1Winners.filter(function (id) { return !inR2[id]; }) : []
      },
      rr: rr, final: final, podium: podium, played: played, total: TOTAL_CHESS
    };
  }

  function chess(s) { return chessOf(normalize(s)); }

  /* ------------------------------------------------------------------ mutators: teams and groups */
  function requireTeam(st, id) {
    if (!isStr(id) || !idMap(st.teams)[id]) fail('unknown_team');
  }

  function setTeams(s, teams) {
    var st = prep(s);
    if (!Array.isArray(teams)) fail('bad_team');
    if (teams.length > MAX_TEAMS) fail('too_many_teams');
    var out = [], ids = newMap(), names = newMap();
    teams.forEach(function (t) {
      if (!t || typeof t !== 'object') fail('bad_team');
      var id = cleanId(t.id), name = cleanText(t.name, 60);
      if (!id || !name || !isStr(t.id) || !isStr(t.name)) fail('bad_team');
      if (t.chess !== undefined && t.chess !== null && !isStr(t.chess)) fail('bad_team');
      if (ids[id]) fail('duplicate_team');
      var nk = name.toLowerCase().replace(/\s+/g, ' ');
      if (names[nk]) fail('duplicate_name');
      ids[id] = 1; names[nk] = 1;
      var team = { id: id, name: name }, chessLabel = cleanText(t.chess, 60);
      if (chessLabel) team.chess = chessLabel;
      out.push(team);
    });
    st.teams = out;
    if (!groupsShapeOk(st.groups, ids, out.length)) st.groups = null;
    st.chess = cleanChess(st.chess, ids);
    return settle(st);
  }

  function setGroups(s, groups) {
    var st = prep(s);
    if (!groupsShapeOk(groups, idMap(st.teams), st.teams.length)) fail('bad_groups');
    st.groups = groups.map(function (g) { return g.slice(); });
    st.fb = newFb();
    return settle(st);
  }

  function drawGroups(s, rng) {
    var st = prep(s);
    if (st.teams.length !== MAX_TEAMS) fail('need_12_teams');
    var ids = shuffle(st.teams.map(function (t) { return t.id; }), rng);
    st.groups = [ids.slice(0, 4), ids.slice(4, 8), ids.slice(8, 12)];
    st.fb = newFb();
    return settle(st);
  }

  function groupsValid(s) { return groupsOk(normalize(s)); }

  // Moves a team to another group and keeps 4/4/4 by sending one team of that group back (default: its last team; or `swapWith`).
  function moveTeam(s, teamId, groupIndex, swapWith) {
    var st = prep(s);
    if (!st.groups) fail('no_groups');
    requireTeam(st, teamId);
    if (!isCount(groupIndex, 2)) fail('bad_group');
    var from = -1;
    st.groups.forEach(function (g, gi) { if (g.indexOf(teamId) >= 0) from = gi; });
    if (from === groupIndex) return settle(st);
    var target = st.groups[groupIndex], other;
    if (swapWith === undefined || swapWith === null) other = target[target.length - 1];
    else { if (target.indexOf(swapWith) < 0) fail('unknown_team'); other = swapWith; }
    st.groups[from][st.groups[from].indexOf(teamId)] = other;
    target[target.indexOf(other)] = teamId;
    // the groups changed: every result between teams of different groups (old final-round results included) is void
    var gof = newMap();
    st.groups.forEach(function (g, gi) { g.forEach(function (id) { gof[id] = gi; }); });
    Object.keys(st.fb.res).forEach(function (k) { var r = st.fb.res[k]; if (gof[r.a] !== gof[r.b]) delete st.fb.res[k]; });
    return settle(st);
  }

  /* ------------------------------------------------------------------ mutators: football results */
  function textField(v) {
    if (v === undefined || v === null) return '';
    if (!isStr(v) || v.length > 200) fail('bad_text');
    return v.trim();
  }

  function putResult(st, input, extra) {
    requireTeam(st, input.a); requireTeam(st, input.b);
    if (input.a === input.b) fail('same_team');
    if (!groupsOk(st)) fail('no_groups');
    if (!isCount(input.sa) || !isCount(input.sb)) fail('bad_score');
    var ca = input.ca === undefined || input.ca === null ? 0 : input.ca, cb = input.cb === undefined || input.cb === null ? 0 : input.cb;
    if (!isCount(ca) || !isCount(cb)) fail('bad_cards');
    var ra = input.ra === undefined || input.ra === null ? 0 : input.ra, rb = input.rb === undefined || input.rb === null ? 0 : input.rb;
    if (!isCount(ra) || !isCount(rb) || ra > ca || rb > cb) fail('bad_cards');
    var res = {
      a: input.a, b: input.b, sa: input.sa, sb: input.sb, ca: ca, cb: cb,
      date: textField(input.date), time: textField(input.time), note: textField(input.note)
    };
    if (ra) res.ra = ra;
    if (rb) res.rb = rb;
    if (extra) { res.adm = extra.adm; res.fault = extra.fault; }
    // a result between two groups is a final-round result: both teams must be the (known) qualifiers
    var gof = newMap();
    st.groups.forEach(function (g, gi) { g.forEach(function (id) { gof[id] = gi; }); });
    if (gof[res.a] !== gof[res.b]) {
      var q = fbCore(st).qualifiers;
      if (!q) fail('final_not_ready');
      if (q.indexOf(res.a) < 0 || q.indexOf(res.b) < 0) fail('not_in_final');
    }
    st.fb.res[pairKey(res.a, res.b)] = res;
    return settle(st);
  }

  // setResult(s, {a, b, sa, sb, ca?, cb?, ra?, rb?, date?, time?, note?}): sa = goals of a, ca = cards of a, ra = reds of a (<= ca)
  function setResult(s, input) {
    var st = prep(s);
    if (!input || typeof input !== 'object') fail('bad_result');
    return putResult(st, input, null);
  }

  function clearResult(s, a, b) {
    var st = prep(s);
    requireTeam(st, a); requireTeam(st, b);
    if (a === b) fail('same_team');
    delete st.fb.res[pairKey(a, b)];
    return settle(st);
  }

  // Administrative result (lg2 / lg4): the side at fault scores 0, the other side FORFEIT_GOALS[kind].
  // (lg2 also allows keeping the current score when a team withdraws during the match and the score is bigger:
  // that is an ordinary result entered with setResult.)
  function adminResult(s, a, b, kind, sideAtFault, opts) {
    var st = prep(s);
    if (FORFEIT_KINDS.indexOf(kind) < 0) fail('bad_kind');
    requireTeam(st, a); requireTeam(st, b);
    if (a === b) fail('same_team');
    if (sideAtFault !== a && sideAtFault !== b) fail('bad_side');
    var o = opts && typeof opts === 'object' ? opts : {};
    return putResult(st, {
      a: a, b: b, sa: sideAtFault === a ? 0 : FORFEIT_GOALS[kind], sb: sideAtFault === b ? 0 : FORFEIT_GOALS[kind], ca: 0, cb: 0,
      date: o.date, time: o.time, note: o.note
    }, { adm: kind, fault: sideAtFault });
  }

  /* ------------------------------------------------------------------ mutators: tie decisions */
  function scopeIds(st, scope) {
    if (SCOPES.indexOf(scope) < 0) fail('bad_scope');
    if (!groupsOk(st)) fail('no_groups');
    if (scope === 'final') {
      var q = fbCore(st).qualifiers;
      if (!q) fail('final_not_ready');
      return q;
    }
    return st.groups[+scope.slice(1)];
  }

  // The committee's (or the draw's) order for ONE tied set of a scope: `ids` must be exactly the tied teams.
  function setOrder(s, scope, ids) {
    var st = prep(s), tableIds = scopeIds(st, scope);
    if (!Array.isArray(ids) || !ids.every(isStr) || !unique(ids) || ids.length < 2) fail('bad_order');
    ids.forEach(function (id) { requireTeam(st, id); });
    var t = rankTable(tableIds, st.fb.res, st.fb.order[scope]), hit = null;
    t.clusters.forEach(function (c) { if (sameSet(c.ids, ids)) hit = c; });
    if (!hit) fail('not_tied');
    var runs = runsOf(st.fb.order[scope]).filter(function (r) { return !sameSet(r, ids); });
    runs.push(ids.slice());
    st.fb.order[scope] = serializeRuns(runs);
    return settle(st);
  }

  // Plans a fixture (date/time before it is played). Both empty = remove the plan. Same group, or two known qualifiers.
  function setSchedule(s, a, b, when) {
    var st = prep(s);
    requireTeam(st, a); requireTeam(st, b);
    if (a === b) fail('same_team');
    if (!groupsOk(st)) fail('no_groups');
    var w = when && typeof when === 'object' ? when : {};
    var date = textField(w.date), time = textField(w.time);
    var gof = newMap();
    st.groups.forEach(function (g, gi) { g.forEach(function (id) { gof[id] = gi; }); });
    if (gof[a] !== gof[b]) {
      var q = fbCore(st).qualifiers;
      if (!q) fail('final_not_ready');
      if (q.indexOf(a) < 0 || q.indexOf(b) < 0) fail('not_in_final');
    }
    var k = pairKey(a, b);
    if (date || time) st.fb.sched[k] = { date: date, time: time };
    else delete st.fb.sched[k];
    return settle(st);
  }

  // Takes back a committee/draw decision: of one tied set (`ids`) or of the whole scope (no ids).
  function clearOrder(s, scope, ids) {
    var st = prep(s);
    scopeIds(st, scope);
    var runs = runsOf(st.fb.order[scope]);
    if (ids === undefined || ids === null) runs = [];
    else {
      if (!Array.isArray(ids) || !ids.every(isStr)) fail('bad_order');
      runs = runs.filter(function (r) { return !sameSet(r, ids); });
    }
    if (runs.length) st.fb.order[scope] = serializeRuns(runs);
    else delete st.fb.order[scope];
    return settle(st);
  }

  // Random order (قرعة) for every tie of the scope that only the draw is left to settle; stored like setOrder.
  function draw(s, scope, rng) {
    var f = rngFn(rng), st = prep(s), tableIds = scopeIds(st, scope);
    var t = rankTable(tableIds, st.fb.res, st.fb.order[scope]);
    var todo = t.clusters.filter(function (c) { return c.flag === 'draw'; });
    if (!todo.length) fail('no_draw_needed');
    var runs = runsOf(st.fb.order[scope]);
    todo.forEach(function (c) { runs.push(shuffle(c.ids, f)); });
    st.fb.order[scope] = serializeRuns(runs);
    return settle(st);
  }

  /* ------------------------------------------------------------------ chess mutators */
  function drawPairs(ids, rng) {
    if (!Array.isArray(ids) || ids.length < 2 || ids.length % 2 || !ids.every(isStr) || !unique(ids)) fail('bad_ids');
    var sh = shuffle(ids, rng), out = [];
    for (var i = 0; i < sh.length; i += 2) out.push({ a: sh[i], b: sh[i + 1] });
    return out;
  }

  function cleanPairsInput(st, pairs, count) {
    if (!Array.isArray(pairs) || pairs.length !== count) fail('bad_pairs');
    var out = [], used = newMap();
    pairs.forEach(function (p) {
      var a, b;
      if (Array.isArray(p)) { a = p[0]; b = p[1]; } else if (p && typeof p === 'object') { a = p.a; b = p.b; } else fail('bad_pairs');
      if (!isStr(a) || !isStr(b)) fail('bad_pairs');
      requireTeam(st, a); requireTeam(st, b);
      if (a === b || used[a] || used[b]) fail('bad_pairs');
      used[a] = 1; used[b] = 1;
      out.push({ a: a, b: b, w: null });
    });
    return { pairs: out, used: used };
  }
  function carryWinners(newPairs, oldPairs) {
    var old = newMap();
    oldPairs.forEach(function (p) { old[pairKey(p.a, p.b)] = p.w; });
    newPairs.forEach(function (p) { var w = old[pairKey(p.a, p.b)]; if (w) p.w = w; });
  }

  // r1: 6 pairs over all 12 teams. r2: 3 pairs over exactly the 6 round-1 winners. Pairs that already exist keep their winner.
  function setChessPairs(s, stage, pairs) {
    var st = prep(s);
    if (stage !== 'r1' && stage !== 'r2') fail('bad_stage');
    if (stage === 'r1') {
      if (st.teams.length !== MAX_TEAMS) fail('need_12_teams');
      var r = cleanPairsInput(st, pairs, 6);
      if (Object.keys(r.used).length !== 12) fail('bad_pairs');
      carryWinners(r.pairs, st.chess.r1);
      st.chess.r1 = r.pairs;
    } else {
      var an = chessOf(st);
      if (!an.r1.complete) fail('r1_incomplete');
      var r2 = cleanPairsInput(st, pairs, 3);
      if (!sameSet(Object.keys(r2.used), an.r1.winners)) fail('bad_pairs');
      carryWinners(r2.pairs, st.chess.r2);
      st.chess.r2 = r2.pairs;
    }
    return settle(st);
  }

  // Sets (or with id === null clears) the winner of pair `index` of r1 / r2. Whatever depended on the old winner is removed.
  function setChessWinner(s, stage, index, id) {
    var st = prep(s);
    if (stage !== 'r1' && stage !== 'r2') fail('bad_stage');
    var list = st.chess[stage];
    if (!isCount(index, 1000) || index >= list.length) fail('bad_index');
    var p = list[index];
    if (id !== null && id !== p.a && id !== p.b) fail('bad_winner');
    p.w = id;
    return settle(st);
  }

  function rrTeams(st) {
    var m = chessOf(st);
    if (!m.r2.complete) fail('rr_unavailable');
    return m;
  }

  function setChessRR(s, a, b, w) {
    var st = prep(s), m = rrTeams(st);
    requireTeam(st, a); requireTeam(st, b);
    if (a === b) fail('same_team');
    if (m.rr.teams.indexOf(a) < 0 || m.rr.teams.indexOf(b) < 0) fail('rr_unavailable');
    if (w !== null && w !== a && w !== b) fail('bad_winner');
    var key = pairKey(a, b);
    if (w === null) delete st.chess.rr.res[key]; else st.chess.rr.res[key] = { a: a, b: b, w: w };
    return settle(st);
  }

  function setChessFinal(s, w) {
    var st = prep(s), m = rrTeams(st);
    if (!m.rr.top2) fail('rr_unresolved');
    if (w !== null && w !== m.rr.top2[0] && w !== m.rr.top2[1]) fail('bad_winner');
    st.chess.final.w = w;
    return settle(st);
  }

  // The committee's order for a tied round robin (1-1-1): `ids` = the three teams, best first.
  function setChessOrder(s, ids) {
    var st = prep(s), m = rrTeams(st);
    if (!Array.isArray(ids) || !ids.every(isStr) || !unique(ids)) fail('bad_order');
    ids.forEach(function (id) { requireTeam(st, id); });
    if (!m.rr.ties.length) fail(m.rr.complete ? 'not_tied' : 'rr_incomplete');
    if (!sameSet(ids, m.rr.ties[0].ids)) fail('not_tied');
    st.chess.rr.order = ids.slice();
    return settle(st);
  }

  /* ------------------------------------------------------------------ views */
  function teamName(st, id) {
    for (var i = 0; i < st.teams.length; i++) if (st.teams[i].id === id) return st.teams[i].name;
    return '';
  }
  function outcome(gf, ga) { return gf > ga ? 'W' : gf < ga ? 'L' : 'D'; }

  // Everything one team needs to see. Status values are keys (the UI words them):
  //   football.status: not_drawn | group | tie (group finished, first place still undecided and the team is in that tie)
  //                    | qualified | final | first | second | third | out
  //   chess.stage: none | r1 | r2 | rr | final | first | second | third | out (outAt: r1 | r2)
  // «إنذار أول بالخروج من المسابقة» (lg2): administrative results of the warning kinds where the team was at fault.
  // 1 = first warning; 2 or more = «تكرار غياب الفريق أو الانسحاب مرتين» → the committee decides (never automatic).
  function warnings(s, teamId) {
    var st = normalize(s), n = 0;
    Object.keys(st.fb.res).forEach(function (k) { var r = st.fb.res[k]; if (r && r.adm && r.fault === teamId && WARNING_KINDS.indexOf(r.adm) >= 0) n++; });
    return n;
  }

  function teamView(s, teamId) {
    var st = normalize(s);
    requireTeam(st, teamId);
    var fb = footballOf(st), ch = chessOf(st);
    var view = {
      id: teamId, name: teamName(st, teamId), group: null, groupName: null, groupComplete: false,
      position: null, row: null, matches: [], next: null, status: 'not_drawn', podium: null, chess: null
    };
    if (fb.drawn) {
      var gi = -1;
      st.groups.forEach(function (g, i) { if (g.indexOf(teamId) >= 0) gi = i; });
      var G = fb.groups[gi];
      view.group = gi; view.groupName = G.name; view.groupComplete = G.complete;
      G.table.forEach(function (r) { if (r.id === teamId) { view.row = r; view.position = r.rank; } });
      var push = function (round, stage) {
        round.matches.forEach(function (m) {
          if (m.a !== teamId && m.b !== teamId) return;
          var mine = m.a === teamId, res = m.res, played = !!res;
          var gf = played ? (mine ? m.sa : m.sb) : null, ga = played ? (mine ? m.sb : m.sa) : null;
          view.matches.push({
            stage: stage, round: round.round, key: m.key, opponent: mine ? m.b : m.a, played: played,
            result: played ? { gf: gf, ga: ga, outcome: outcome(gf, ga), adm: res.adm || null } : null,
            date: (res && res.date) || (m.sched && m.sched.date) || '', time: (res && res.time) || (m.sched && m.sched.time) || '', note: res ? res.note : ''
          });
        });
      };
      G.rounds.forEach(function (r) { push(r, 'group'); });
      var inFinal = fb.final && fb.final.teams.indexOf(teamId) >= 0;
      if (inFinal) fb.final.rounds.forEach(function (r) { push(r, 'final'); });
      view.next = view.matches.filter(function (m) { return !m.played; })[0] || null;
      if (fb.podium && fb.podium.indexOf(teamId) >= 0) {
        view.podium = fb.podium.indexOf(teamId) + 1;
        view.status = ['first', 'second', 'third'][view.podium - 1];
      } else if (inFinal) {
        view.status = 'final';
      } else if (!G.complete) {
        view.status = 'group';
      } else if (G.first === teamId) {
        view.status = 'qualified';
      } else if (G.first !== null) {
        view.status = 'out';
      } else {
        view.status = view.row && view.row.rank === 1 ? 'tie' : 'out';
      }
    }
    view.chess = chessView(ch, teamId);
    return view;
  }

  function chessView(ch, teamId) {
    var out = { stage: 'none', outAt: null, podium: null, matches: [], next: null };
    var note = function (round, a, b, w) {
      if (a !== teamId && b !== teamId) return;
      var m = { round: round, opponent: a === teamId ? b : a, won: w ? w === teamId : null };
      out.matches.push(m);
    };
    var p1 = ch.r1.matches.filter(function (p) { return p.a === teamId || p.b === teamId; })[0];
    if (!p1) return out;
    note('r1', p1.a, p1.b, p1.w);
    out.stage = 'r1';
    if (p1.w !== teamId) { if (p1.w) { out.stage = 'out'; out.outAt = 'r1'; } return finish(out); }
    out.stage = 'r2';
    var p2 = ch.r2.matches.filter(function (p) { return p.a === teamId || p.b === teamId; })[0];
    if (!p2) return finish(out);
    note('r2', p2.a, p2.b, p2.w);
    if (p2.w !== teamId) { if (p2.w) { out.stage = 'out'; out.outAt = 'r2'; } return finish(out); }
    out.stage = 'rr';
    ch.rr.matches.forEach(function (m) { note('rr', m.a, m.b, m.w); });
    if (!ch.rr.top2) return finish(out);
    if (ch.rr.third === teamId) { out.stage = 'third'; out.podium = 3; return finish(out); }
    out.stage = 'final';
    if (ch.final) {
      note('final', ch.final.a, ch.final.b, ch.final.w);
      if (ch.final.w) { out.stage = ch.final.w === teamId ? 'first' : 'second'; out.podium = ch.final.w === teamId ? 1 : 2; }
    }
    return finish(out);
  }
  function finish(out) {
    out.next = out.matches.filter(function (m) { return m.won === null; })[0] || null;
    return out;
  }

  function stageInfo(m) { return { done: !!m.complete, played: m.played, total: m.total }; }

  function overview(s) {
    var st = normalize(s), fb = footballOf(st), ch = chessOf(st);
    var gPlayed = 0, gDone = fb.drawn;
    fb.groups.forEach(function (g) { gPlayed += g.played; if (g.first === null) gDone = false; });
    var fbPhase = !fb.drawn ? 'draw' : !gDone ? 'groups' : !fb.podium ? 'final' : 'done';
    var chPhase = !ch.r1.matches.length ? 'setup' : !ch.r1.complete ? 'r1' : !ch.r2.complete ? 'r2' : !ch.rr.top2 ? 'rr' : !ch.podium ? 'final' : 'done';
    return {
      teams: st.teams.length, drawn: fb.drawn,
      football: {
        phase: fbPhase,
        groups: { done: gDone, played: gPlayed, total: 18 },
        final: { done: !!fb.podium, played: fb.final ? fb.final.played : 0, total: 3 },
        played: fb.played, total: fb.total, podium: fb.podium, pending: fb.pending
      },
      chess: {
        phase: chPhase,
        r1: stageInfo(ch.r1), r2: stageInfo(ch.r2),
        rr: { done: !!ch.rr.top2, played: ch.rr.played, total: 3, tied: ch.rr.tied },
        final: { done: !!ch.podium, played: ch.final && ch.final.w ? 1 : 0, total: 1 },
        played: ch.played, total: ch.total, podium: ch.podium
      },
      podiums: { football: fb.podium, chess: ch.podium },
      done: !!(fb.podium && ch.podium)
    };
  }

  /* ------------------------------------------------------------------ share link: base64url(UTF-8 JSON) */
  function utf8ToB64(str) {
    if (typeof TextEncoder === 'function' && typeof btoa === 'function') {
      var bytes = new TextEncoder().encode(str), bin = '';
      for (var i = 0; i < bytes.length; i += 4096) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
      return btoa(bin);
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    fail('bad_share');
  }
  function b64ToUtf8(b64) {
    if (typeof TextDecoder === 'function' && typeof atob === 'function') {
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    fail('bad_share');
  }

  // encode(s, {public: true}) drops the chess player labels (they are for managers and leaders only).
  function encode(s, opts) {
    var st = normalize(s);
    if (opts && opts.public) st.teams.forEach(function (t) { delete t.chess; });
    return utf8ToB64(JSON.stringify(st)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(str) {
    if (!isStr(str)) fail('bad_share');
    var t = str.trim().replace(/^#/, '').replace(/^v=/, '');
    if (!t || t.length > 400000 || !/^[A-Za-z0-9_\-+\/]+={0,2}$/.test(t) || t.replace(/=+$/, '').length % 4 === 1) fail('bad_share');
    var b64 = t.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    while (b64.length % 4) b64 += '=';
    var data;
    try { data = JSON.parse(b64ToUtf8(b64)); } catch (e) { fail('bad_share'); }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.v !== VERSION) fail('bad_share');
    return normalize(data);
  }

  /* ------------------------------------------------------------------ validate / stamp */
  function projPairs(list) {
    return (Array.isArray(list) ? list : []).map(function (p) { return p ? [p.a, p.b, p.w === undefined ? null : p.w] : null; });
  }
  function projRes(r) { return r ? [r.a, r.b, r.sa, r.sb, r.ca === undefined ? 0 : r.ca, r.cb === undefined ? 0 : r.cb] : null; }

  // -> [problem codes]; [] = the state is valid and consistent (everything normalize() would remove or fix is reported).
  function validate(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return ['bad_state'];
    var out = [];
    if (s.v !== VERSION) out.push('bad_version');
    var n = normalize(s);
    if (!Array.isArray(s.teams)) out.push('bad_teams');
    else {
      if (s.teams.length > MAX_TEAMS) out.push('too_many_teams');
      var rawT = s.teams.map(function (t) { return t && typeof t === 'object' ? [t.id, t.name] : null; });
      if (canon(rawT) !== canon(n.teams.map(function (t) { return [t.id, t.name]; }))) out.push('bad_teams');
      var names = newMap();
      n.teams.forEach(function (t) {
        var k = t.name.toLowerCase().replace(/\s+/g, ' ');
        if (names[k] && out.indexOf('duplicate_name') < 0) out.push('duplicate_name');
        names[k] = 1;
      });
    }
    if (s.groups !== undefined && s.groups !== null && canon(s.groups) !== canon(n.groups)) out.push('bad_groups');
    var fb = s.fb && typeof s.fb === 'object' ? s.fb : {};
    Object.keys(fb.res && typeof fb.res === 'object' ? fb.res : {}).forEach(function (k) {
      var r = fb.res[k], m = n.fb.res[k];
      if (!m) out.push('stale_result:' + k);
      else if (canon(projRes(r)) !== canon(projRes(m))) out.push('bad_result:' + k);
    });
    Object.keys(fb.order && typeof fb.order === 'object' ? fb.order : {}).forEach(function (k) {
      if (canon(fb.order[k]) !== canon(n.fb.order[k])) out.push('stale_order:' + k);
    });
    Object.keys(fb.sched && typeof fb.sched === 'object' && !Array.isArray(fb.sched) ? fb.sched : {}).forEach(function (k) {
      if (!n.fb.sched[k] || canon(fb.sched[k]) !== canon(n.fb.sched[k])) out.push('stale_sched:' + k);
    });
    var c = s.chess && typeof s.chess === 'object' ? s.chess : {}, nc = n.chess;
    if (canon(projPairs(c.r1)) !== canon(projPairs(nc.r1))) out.push('chess_r1');
    if (canon(projPairs(c.r2)) !== canon(projPairs(nc.r2))) out.push('chess_r2');
    var rr = c.rr && typeof c.rr === 'object' ? c.rr : {};
    var rawRes = listOf(rr.res).map(function (r) { return r ? [pairKey(r.a, r.b), r.w] : null; }).sort();
    var cleanRes = Object.keys(nc.rr.res).map(function (k) { return [k, nc.rr.res[k].w]; }).sort();
    if (canon(rawRes) !== canon(cleanRes)) out.push('chess_rr');
    if (canon(rr.order === undefined ? null : rr.order) !== canon(nc.rr.order)) out.push('chess_order');
    if (canon(c.final && c.final.w !== undefined ? c.final.w : null) !== canon(nc.final.w)) out.push('chess_final');
    return out;
  }

  // The `updated` timestamp is the caller's job (the engine never reads the clock): stamp(s, new Date().toISOString()).
  function stamp(s, iso) {
    var st = normalize(s);
    st.updated = isStr(iso) ? iso.slice(0, 40) : '';
    return st;
  }

  var api = {
    VERSION: VERSION, SCOPES: SCOPES.slice(), GROUP_NAMES: GROUP_NAMES.slice(),
    emptyState: emptyState, normalize: normalize, validate: validate, stamp: stamp, pairKey: pairKey,
    setTeams: setTeams, drawGroups: drawGroups, setGroups: setGroups, moveTeam: moveTeam, groupsValid: groupsValid,
    roundRobin: roundRobin, table: table, football: football,
    setResult: setResult, clearResult: clearResult, adminResult: adminResult, warnings: warnings, FORFEIT_GOALS: FORFEIT_GOALS, setOrder: setOrder, clearOrder: clearOrder, setSchedule: setSchedule, draw: draw,
    chess: chess, drawPairs: drawPairs, setChessPairs: setChessPairs, setChessWinner: setChessWinner,
    setChessRR: setChessRR, setChessFinal: setChessFinal, setChessOrder: setChessOrder,
    teamView: teamView, overview: overview, encode: encode, decode: decode
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.YTour = api;
})();
