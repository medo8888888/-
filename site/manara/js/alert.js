/* MANARA («منارة») — Resident Phones (alert.html): the REACH + COUNT pillars  →  window.ManaraAlert
 * ==========================================================================================
 * What a resident's phone does when MANARA has PROVEN an incident and an operator approved it:
 *   REACH  a full-screen alert in the person's own language and format (picture cards for everyone, text, sound, vibration,
 *          opt-in strobe for Deaf users, voice for blind users, a night wake-up ladder that climbs until the person answers);
 *   COUNT  two huge buttons "I'm safe" / "I need help" (+ need chips) that go back to Mission Control on the bus ('citizen').
 * Two modes: WALL (four phones side by side: Ravi, Huda, Abu Salem, Lina + a switcher for the blind-resident voice flow and the
 * building-guard view) and PHONE (one phone, full screen, opened from a QR link: ?persona=ravi&lang=ml).
 *
 * SOURCES OF TRUTH (this file adds no new facts of its own)
 *   words / pictogram ids / vibration / flash / voice / ladder   window.MANARA_MSG   (js/messages.js)
 *   bus messages (alert, alert-update, alert-clear, dispatch ↔ citizen)  Manara.link   (docs/MANARA.md)
 *   stand-alone demo geometry (routes, distances, responders)   window.ManaraSim, when it is loaded (js/sim.js). Every number from it is SIM.
 *
 * HONESTY (same house rules as the rest of the site)
 *   - every alert carries an EXERCISE badge; responder times are SIM (fictional units); 999 stays the dispatcher;
 *   - the sound is MANARA's own low 520 Hz three-pulse tone (NFPA Research Foundation, S56), never the national alert tone (S36);
 *   - flashing light is opt-in, behind a photosensitivity warning, at most 3 flashes a second (WCAG 2.3.1, S57), and stays steady under
 *     prefers-reduced-motion;
 *   - six community languages are drafts (draft-needs-native-review) and are always shown WITH Arabic/English;
 *   - the optional "Nearby facilities" card is informational only (OpenStreetMap data, straight-line distance, one query after a consent tap,
 *     nothing stored, nothing sent anywhere except the lookup); it is NOT dispatch;
 *   - the live link reaches other tabs of the SAME browser (BroadcastChannel). A phone opened by QR runs the demo on its own; a real
 *     deployment would need a server and push notifications — not built.
 *
 * LAWS: classic script, no libraries, no fetch of local files (the one fetch is the optional OpenStreetMap lookup), no HTML-string injection at all
 * (DOM nodes and textContent only), logical CSS properties only (in alert.css), every string bilingual.
 *
 * PURE PART (runs in Node under `vm`, tested by tools/manara/test-alert.mjs): QR encoder, Overpass query + parser, route geometry,
 * compass words.  DOM PART: starts only when `document` exists.
 *
 * Public: window.ManaraAlert = { qr, overpass, geom, pictos, app (DOM only) }.
 * ========================================================================================== */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';

  /* ====================================================================================
   * 1. QR CODE ENCODER (ISO/IEC 18004, byte mode, versions 1–10, EC levels L/M/Q/H)
   *    Own small implementation so the page works offline with no library. Verified in tools/manara/test-alert.mjs by an
   *    independent JS decoder (format BCH, Reed–Solomon syndromes) and, when installed, by the zxing-cpp scanner library on rendered
   *    pictures. Max payload: 271 bytes (V10-L), 213 (V10-M).
   * ==================================================================================== */
  var QR = (function () {
    var EC = { L: { bits: 1, ord: 0 }, M: { bits: 0, ord: 1 }, Q: { bits: 3, ord: 2 }, H: { bits: 2, ord: 3 } };
    // version → level → [EC codewords per block, [[blocks, data codewords per block], …]]
    var TABLE = {
      1:  { L: [7,  [[1, 19]]],            M: [10, [[1, 16]]],            Q: [13, [[1, 13]]],            H: [17, [[1, 9]]] },
      2:  { L: [10, [[1, 34]]],            M: [16, [[1, 28]]],            Q: [22, [[1, 22]]],            H: [28, [[1, 16]]] },
      3:  { L: [15, [[1, 55]]],            M: [26, [[1, 44]]],            Q: [18, [[2, 17]]],            H: [22, [[2, 13]]] },
      4:  { L: [20, [[1, 80]]],            M: [18, [[2, 32]]],            Q: [26, [[2, 24]]],            H: [16, [[4, 9]]] },
      5:  { L: [26, [[1, 108]]],           M: [24, [[2, 43]]],            Q: [18, [[2, 15], [2, 16]]],   H: [22, [[2, 11], [2, 12]]] },
      6:  { L: [18, [[2, 68]]],            M: [16, [[4, 27]]],            Q: [24, [[4, 19]]],            H: [28, [[4, 15]]] },
      7:  { L: [20, [[2, 78]]],            M: [18, [[4, 31]]],            Q: [18, [[2, 14], [4, 15]]],   H: [26, [[4, 13], [1, 14]]] },
      8:  { L: [24, [[2, 97]]],            M: [22, [[2, 38], [2, 39]]],   Q: [22, [[4, 18], [2, 19]]],   H: [26, [[4, 14], [2, 15]]] },
      9:  { L: [30, [[2, 116]]],           M: [22, [[3, 36], [2, 37]]],   Q: [20, [[4, 16], [4, 17]]],   H: [24, [[4, 12], [4, 13]]] },
      10: { L: [18, [[2, 68], [2, 69]]],   M: [26, [[4, 43], [1, 44]]],   Q: [24, [[6, 19], [2, 20]]],   H: [28, [[6, 15], [2, 16]]] }
    };
    var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
    var MAX_V = 10;

    // GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
    var EXP = new Array(512), LOG = new Array(256);
    (function () {
      var x = 1;
      for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
      for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
    })();
    function gmul(a, b) { return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]; }
    function rsGenerator(deg) {
      var g = [1];
      for (var i = 0; i < deg; i++) {
        var next = new Array(g.length + 1), k;
        for (k = 0; k < next.length; k++) next[k] = 0;
        for (k = 0; k < g.length; k++) { next[k] ^= g[k]; next[k + 1] ^= gmul(g[k], EXP[i]); }
        g = next;
      }
      return g;                                           // highest power first, leading coefficient 1
    }
    function rsRemainder(data, deg) {
      var gen = rsGenerator(deg), rem = new Array(deg), i, j;
      for (i = 0; i < deg; i++) rem[i] = 0;
      for (i = 0; i < data.length; i++) {
        var factor = data[i] ^ rem[0];
        rem.shift(); rem.push(0);
        for (j = 0; j < deg; j++) rem[j] ^= gmul(gen[j + 1], factor);
      }
      return rem;
    }

    function utf8(text) {
      var out = [], s = String(text);
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { var d = s.charCodeAt(i + 1); if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; } }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return out;
    }
    function dataCodewords(v, lv) { var t = TABLE[v][lv], n = 0; t[1].forEach(function (g) { n += g[0] * g[1]; }); return n; }
    function capacityBytes(v, lv) { return Math.floor((dataCodewords(v, lv) * 8 - 4 - (v < 10 ? 8 : 16)) / 8); }

    function bit(x, i) { return ((x >>> i) & 1) === 1; }

    function encode(text, opts) {
      opts = opts || {};
      var bytes = utf8(text), level = EC[opts.ec] ? opts.ec : 'M', v, order = ['L', 'M', 'Q', 'H'];
      var minV = Math.max(1, opts.minVersion || 1);
      // smallest version that fits at the wanted level; if nothing fits, drop to weaker levels
      var tryLevels = order.slice(0, order.indexOf(level) + 1).reverse();
      var found = null;
      for (var li = 0; li < tryLevels.length && !found; li++) {
        for (v = minV; v <= MAX_V; v++) if (bytes.length <= capacityBytes(v, tryLevels[li])) { found = { v: v, lv: tryLevels[li] }; break; }
      }
      if (!found) return null;                              // too long for this small encoder
      v = found.v; level = found.lv;
      var nData = dataCodewords(v, level), bits = [];
      function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
      put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
      bytes.forEach(function (b) { put(b, 8); });
      put(0, Math.min(4, nData * 8 - bits.length));         // terminator
      while (bits.length % 8) bits.push(0);
      for (var pad = 0xEC; bits.length < nData * 8; pad ^= 0xEC ^ 0x11) put(pad, 8);
      var data = [];
      for (var i = 0; i < bits.length; i += 8) { var byte = 0; for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k]; data.push(byte); }

      // blocks + Reed–Solomon, then interleave
      var t = TABLE[v][level], ecLen = t[0], blocks = [], pos = 0;
      t[1].forEach(function (g) { for (var b = 0; b < g[0]; b++) { var d = data.slice(pos, pos + g[1]); pos += g[1]; blocks.push({ data: d, ec: rsRemainder(d, ecLen) }); } });
      var maxData = 0; blocks.forEach(function (b) { if (b.data.length > maxData) maxData = b.data.length; });
      var words = [];
      for (i = 0; i < maxData; i++) blocks.forEach(function (b) { if (i < b.data.length) words.push(b.data[i]); });
      for (i = 0; i < ecLen; i++) blocks.forEach(function (b) { words.push(b.ec[i]); });

      // matrix
      var size = 17 + 4 * v, mod = [], fn = [], y, x;
      for (y = 0; y < size; y++) { mod.push(new Array(size)); fn.push(new Array(size)); for (x = 0; x < size; x++) { mod[y][x] = false; fn[y][x] = false; } }
      function setFn(px, py, dark) { if (px >= 0 && px < size && py >= 0 && py < size) { mod[py][px] = dark; fn[py][px] = true; } }
      for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }          // timing
      function finder(cx, cy) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var dist = Math.max(Math.abs(dx), Math.abs(dy)); setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4); } }
      finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
      var ap = ALIGN[v];
      ap.forEach(function (ax, ia) {
        ap.forEach(function (ay, ib) {
          if ((ia === 0 && ib === 0) || (ia === 0 && ib === ap.length - 1) || (ia === ap.length - 1 && ib === 0)) return;
          for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        });
      });
      function drawFormat(mask) {
        var d = (EC[level].bits << 3) | mask, rem = d;
        for (var r = 0; r < 10; r++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        var fb = ((d << 10) | rem) ^ 0x5412, j;
        for (j = 0; j <= 5; j++) setFn(8, j, bit(fb, j));
        setFn(8, 7, bit(fb, 6)); setFn(8, 8, bit(fb, 7)); setFn(7, 8, bit(fb, 8));
        for (j = 9; j < 15; j++) setFn(14 - j, 8, bit(fb, j));
        for (j = 0; j < 8; j++) setFn(size - 1 - j, 8, bit(fb, j));
        for (j = 8; j < 15; j++) setFn(8, size - 15 + j, bit(fb, j));
        setFn(8, size - 8, true);                           // the always-dark module
      }
      drawFormat(0);                                         // reserve the format areas
      if (v >= 7) {
        var vrem = v;
        for (i = 0; i < 12; i++) vrem = (vrem << 1) ^ ((vrem >>> 11) * 0x1F25);
        var vb = (v << 12) | vrem;
        for (i = 0; i < 18; i++) { var a = size - 11 + (i % 3), b2 = Math.floor(i / 3); setFn(a, b2, bit(vb, i)); setFn(b2, a, bit(vb, i)); }
      }
      // codewords in the zig-zag order
      var total = words.length * 8, bi = 0;
      for (var right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (var vert = 0; vert < size; vert++) {
          for (var j2 = 0; j2 < 2; j2++) {
            var px = right - j2, upward = ((right + 1) & 2) === 0, py = upward ? size - 1 - vert : vert;
            if (!fn[py][px] && bi < total) { mod[py][px] = bit(words[bi >>> 3], 7 - (bi & 7)); bi++; }
          }
        }
      }
      function applyMask(mask) {
        for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
          var inv;
          switch (mask) {
            case 0: inv = (xx + yy) % 2 === 0; break;
            case 1: inv = yy % 2 === 0; break;
            case 2: inv = xx % 3 === 0; break;
            case 3: inv = (xx + yy) % 3 === 0; break;
            case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
            case 5: inv = (xx * yy) % 2 + (xx * yy) % 3 === 0; break;
            case 6: inv = ((xx * yy) % 2 + (xx * yy) % 3) % 2 === 0; break;
            default: inv = ((xx + yy) % 2 + (xx * yy) % 3) % 2 === 0;
          }
          if (!fn[yy][xx] && inv) mod[yy][xx] = !mod[yy][xx];
        }
      }
      function penalty() {
        var p = 0, yy, xx, run, k2, dark = 0;
        for (yy = 0; yy < size; yy++) {                       // N1 rows
          run = 1; for (xx = 1; xx < size; xx++) { if (mod[yy][xx] === mod[yy][xx - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
        }
        for (xx = 0; xx < size; xx++) {                        // N1 columns
          run = 1; for (yy = 1; yy < size; yy++) { if (mod[yy][xx] === mod[yy - 1][xx]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
        }
        for (yy = 0; yy < size - 1; yy++) for (xx = 0; xx < size - 1; xx++) { var c = mod[yy][xx]; if (c === mod[yy][xx + 1] && c === mod[yy + 1][xx] && c === mod[yy + 1][xx + 1]) p += 3; }   // N2
        var pat = [true, false, true, true, true, false, true];
        function finderLike(get) {                            // N3: 1:1:3:1:1 with four light modules on a side
          var n = 0;
          for (var s = 0; s + 7 <= size; s++) {
            var ok = true; for (k2 = 0; k2 < 7; k2++) if (get(s + k2) !== pat[k2]) { ok = false; break; }
            if (!ok) continue;
            var lightL = s >= 4, lightR = s + 7 + 4 <= size;
            for (k2 = 1; k2 <= 4 && lightL; k2++) if (get(s - k2)) lightL = false;
            for (k2 = 0; k2 < 4 && lightR; k2++) if (get(s + 7 + k2)) lightR = false;
            if (lightL || lightR) n++;
          }
          return n;
        }
        for (yy = 0; yy < size; yy++) p += 40 * finderLike(function (q) { return mod[yy][q]; });
        for (xx = 0; xx < size; xx++) p += 40 * finderLike(function (q) { return mod[q][xx]; });
        for (yy = 0; yy < size; yy++) for (xx = 0; xx < size; xx++) if (mod[yy][xx]) dark++;     // N4
        var kk = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1;
        return p + 10 * Math.max(0, kk);
      }
      var bestMask = 0, bestPen = Infinity;
      for (var m = 0; m < 8; m++) {
        applyMask(m); drawFormat(m);
        var pen = penalty();
        if (pen < bestPen) { bestPen = pen; bestMask = m; }
        applyMask(m);                                         // XOR again = undo
      }
      applyMask(bestMask); drawFormat(bestMask);
      return {
        version: v, ec: level, mask: bestMask, size: size, bytes: bytes.length,
        get: function (px, py) { return px >= 0 && py >= 0 && px < size && py < size && mod[py][px]; },
        rows: function () { return mod.map(function (r) { return r.map(function (c) { return c ? 1 : 0; }).join(''); }); }
      };
    }
    return { encode: encode, capacityBytes: capacityBytes, maxVersion: MAX_V, table: TABLE };
  })();

  /* ====================================================================================
   * 2. NEARBY FACILITIES — OpenStreetMap Overpass: one query, pure builder + pure parser
   *    Informational only (NOT dispatch): straight-line (haversine) distance, traffic unknown. No coordinates are shipped in this
   *    file; the phone's position exists only in memory for the one lookup.
   * ==================================================================================== */
  var OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  var FACILITY_KINDS = [
    { id: 'hospital', tag: 'hospital', ui: 'ui.nearby.hospital' },
    { id: 'police', tag: 'police', ui: 'ui.nearby.police' },
    { id: 'fire', tag: 'fire_station', ui: 'ui.nearby.fire' }
  ];
  function clampNum(n, lo, hi) { n = +n; return n < lo ? lo : n > hi ? hi : n; }
  function haversineM(lat1, lon1, lat2, lon2) {
    var R = 6371008.8, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function bearingDeg(lat1, lon1, lat2, lon2) {
    var rad = Math.PI / 180, p1 = lat1 * rad, p2 = lat2 * rad, dl = (lon2 - lon1) * rad;
    var y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }
  // The query string for Overpass QL: hospitals, police stations and fire stations around a point (nodes, ways and relations).
  // `out center;` = default "body" verbosity (tags + node coordinates) plus a centre point for ways and relations. NOT `out center tags;`:
  // the `tags` verbosity prints "only ids and tags … and not coordinates" (OSM wiki, Overpass QL), so every facility mapped as a node would
  // arrive without a position and be dropped.
  function buildOverpassQuery(lat, lon, radiusM) {
    lat = clampNum(lat, -90, 90); lon = clampNum(lon, -180, 180); radiusM = Math.round(clampNum(radiusM || 15000, 500, 50000));
    var around = '(around:' + radiusM + ',' + lat.toFixed(5) + ',' + lon.toFixed(5) + ')';
    return '[out:json][timeout:15];(' +
      FACILITY_KINDS.map(function (k) { return 'nwr["amenity"="' + k.tag + '"]' + around + ';'; }).join('') +
      ');out center;';
  }
  function osmPoint(el) {
    if (el && typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lon: el.lon };
    if (el && el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number') return { lat: el.center.lat, lon: el.center.lon };
    return null;
  }
  // Overpass JSON → { hospital, police, fire }: the nearest element of each kind by STRAIGHT-LINE distance, or null. Never throws on odd input.
  function parseOverpass(json, lat, lon) {
    var out = { hospital: null, police: null, fire: null, count: 0 };
    var els = json && Array.isArray(json.elements) ? json.elements : [];
    els.forEach(function (el) {
      if (!el || !el.tags || typeof el.tags !== 'object') return;
      var kind = null;
      FACILITY_KINDS.forEach(function (k) { if (el.tags.amenity === k.tag) kind = k.id; });
      if (!kind) return;
      var pt = osmPoint(el); if (!pt) return;
      var d = haversineM(lat, lon, pt.lat, pt.lon);
      if (!isFinite(d)) return;
      out.count++;
      var cur = out[kind];
      if (cur && cur.distM <= d) return;
      var t = el.tags;
      out[kind] = {
        kind: kind, type: el.type || null, id: el.id != null ? el.id : null, distM: Math.round(d), bearingDeg: Math.round(bearingDeg(lat, lon, pt.lat, pt.lon)),
        names: { ar: t['name:ar'] || null, en: t['name:en'] || null, name: t.name || null }, lat: pt.lat, lon: pt.lon,
        emergency: t.emergency || null, operator: t.operator || null
      };
    });
    return out;
  }
  function facilityName(f, lang) {
    if (!f) return '';
    var n = f.names || {};
    return (lang === 'ar' ? (n.ar || n.name || n.en) : (n.en || n.name || n.ar)) || '';
  }
  function formatDistance(distM, lang) {
    var d = Math.max(0, +distM || 0);
    var s = d < 1000 ? Math.round(d / 10) * 10 : (Math.round(d / 100) / 10);
    var txt = d < 1000 ? String(s) : String(s);
    return lang === 'ar' ? (d < 1000 ? txt + ' م' : txt + ' كم') : (d < 1000 ? txt + ' m' : txt + ' km');
  }

  /* ====================================================================================
   * 3. ROUTE GEOMETRY + COMPASS WORDS (pure). Grid cells: x east, y south (north-up), 1 cell = 5 m (docs/MANARA.md).
   * ==================================================================================== */
  var CELL_M = 5;
  var COMPASS = {
    ar: ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'],
    en: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  };
  function compassWord(deg, lang) {
    var i = Math.round((((+deg % 360) + 360) % 360) / 45) % 8;
    return COMPASS[lang === 'ar' ? 'ar' : 'en'][i];
  }
  function routeLengthM(route) {
    var len = 0;
    for (var i = 1; i < (route || []).length; i++) len += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    return len * CELL_M;
  }
  // the first real turn of a route, for the blind-resident voice line: { turn:'left'|'right'|'straight', stepsM } (metres to the turn)
  function firstTurn(route) {
    var pts = [];
    (route || []).forEach(function (p) { var l = pts[pts.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.25) pts.push(p); });
    if (pts.length < 3) return { turn: 'straight', meters: routeLengthM(pts) };
    var dist = 0;
    for (var i = 1; i < pts.length - 1; i++) {
      var a = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]], b = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
      dist += Math.hypot(a[0], a[1]);
      var cross = a[0] * b[1] - a[1] * b[0], dot = a[0] * b[0] + a[1] * b[1];
      var ang = Math.atan2(cross, dot) * 180 / Math.PI;
      if (Math.abs(ang) > 35) return { turn: ang > 0 ? 'right' : 'left', meters: dist * CELL_M };
    }
    return { turn: 'straight', meters: routeLengthM(pts) };
  }
  // heading of the route's first real leg, degrees clockwise from north (for the compass arrow)
  function routeHeading(route) {
    var pts = route || [];
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1];
      if (Math.hypot(dx, dy) > 0.6) return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    }
    return null;
  }

  /* ====================================================================================
   * 4. PICTOGRAM SET — one coherent family drawn in code (48×48 grid), keyed by the ids of MANARA_MSG.pictograms()
   *    Grammar (like road and safety signs, so it reads without words):
   *      triangle  = a HAZARD (hz-*)                         circle   = DO this (blue; amber/red tone for hazard-led actions)
   *      ring+slash= DO NOT do this (red)                    square   = SAFE place / help (green)
   *      octagon   = STOP                                     bare     = a status badge (st-*) or the drone light (dr-*)
   *    Glyph strokes use the ink token, frames use one tone token, so every card passes contrast in both themes.
   * ==================================================================================== */
  var PICT = {};
  var FRAME = {
    tri:  { s: 0.56, cy: 28.5, back: '<path class="pf-fill pf-t" d="M24 3.5 45 41.5H3z" stroke-width="3" stroke-linejoin="round"/>', front: '' },
    circ: { s: 0.64, cy: 24, back: '<circle class="pf-fill pf-t" cx="24" cy="24" r="21" stroke-width="3"/>', front: '' },
    ban:  { s: 0.54, cy: 24, back: '<circle class="pf-ban" cx="24" cy="24" r="21" fill="none" stroke-width="4"/>', front: '<path class="pf-ban" d="M9.2 38.8 38.8 9.2" stroke-width="4" stroke-linecap="round"/>' },
    sq:   { s: 0.68, cy: 24, back: '<rect class="pf-fill pf-t" x="3.5" y="3.5" width="41" height="41" rx="9" stroke-width="3"/>', front: '' },
    oct:  { s: 0.6,  cy: 24, back: '<path class="pf-fill pf-t" d="M16 3.5h16L44.5 16v16L32 44.5H16L3.5 32V16z" stroke-width="3" stroke-linejoin="round"/>', front: '' },
    none: { s: 1,    cy: 24, back: '', front: '' }
  };
  function pic(id, frame, tone, glyph, box) { PICT[id] = { f: frame, t: tone, g: glyph, box: box || 48 }; }
  function wave(y, x0) { x0 = x0 == null ? 5 : x0; return 'M' + x0 + ' ' + y + 'q4.5-4.5 9 0t9 0 9 0 9 0'; }
  function man(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="4"/><path d="M' + x + ' ' + (y + 5.5) + 'v13l-5.5 12M' + x + ' ' + (y + 18.5) + 'l5.5 12M' + (x - 7) + ' ' + (y + 9.5) + 'h14"/>'; }
  var FLAME = '<path d="M24 44c8 0 14-5.4 14-13.4 0-7.2-5.2-12-8.4-16.6-.8 3.6-2.6 6-5.6 7.2C25.2 14.6 22 8.6 17 4c.6 6.8-7 12.4-7 21.6C10 38 16 44 24 44z"/>';
  var STAIRS = '<path d="M6 40h10v-9h10v-9h10v-9h6"/>';
  var PHONE = '<rect x="14" y="5" width="20" height="38" rx="3.5"/><path d="M21 38h6"/>';
  var CAR = '<path d="M5 33l4-11h20l8 11h5v6H5z"/><circle cx="14" cy="39" r="3.2" class="pf-s"/><circle cx="35" cy="39" r="3.2" class="pf-s"/>';

  // --- hazards (triangle) ---
  pic('hz-fire', 'tri', 'danger', FLAME);
  pic('hz-smoke', 'tri', 'warn', '<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/><path d="M8 20.5q1.5 1.5 0 3M12 20.5q1.5 1.5 0 3M16 20.5q1.5 1.5 0 3"/>', 24);
  pic('hz-gas', 'tri', 'warn', '<path d="M18 21h12v19a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z"/><path d="M21 21v-3a3 3 0 0 1 6 0v3M20 13h8"/><path d="M36 20q-4 3 0 6t0 6M12 20q4 3 0 6t0 6"/>');
  pic('hz-water', 'tri', 'info', '<path d="M24 5v17M17 12l7-7 7 7"/><path d="' + wave(31) + '"/><path d="' + wave(39) + '"/>');
  pic('hz-dust', 'tri', 'warn', '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/><path d="M17 20h.01M20.5 18h.01M14 21.5h.01"/>', 24);
  pic('hz-heat', 'tri', 'brand', '<path d="M12 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/><circle cx="18.5" cy="8" r="2.4"/><path d="M18.5 2.6v1.2M18.5 12.2v1.2M13.1 8h1.2M22.7 8h1.2M15 4.5l.9.9M21.1 10.6l.9.9M15 11.5l.9-.9M21.1 5.4l.9-.9"/>', 24);
  pic('hz-sos', 'tri', 'danger', '<circle cx="19" cy="14" r="3.8"/><path d="M19 19.500v11l-5 11M19 30.500l5 11M19 24l-7-9M19 24l7-9"/><path d="M38 12v11M38 29h.01" stroke-width="5"/>');

  // --- actions: do this (circle) ---
  pic('act-exit', 'sq', 'safe', '<path d="M12 8h17v32H12z"/><path d="M23 24h17M34 18l6 6-6 6"/>');
  pic('act-walk', 'circ', 'info', '<circle cx="26" cy="8" r="3.8"/><path d="M26 14l-3 14M23 28l-6 14M23 28l8 6-1 8M25 17l-8 6M25 17l8 5"/>');
  pic('act-stairs', 'circ', 'info', STAIRS + '<path d="M10 20l22-12"/>');
  pic('act-low', 'circ', 'warn', '<path d="' + wave(10, 6) + '"/><circle cx="13" cy="27" r="3.6"/><path d="M17 30l15 4M20 31v10M32 34l-2 8M32 34l7 5v3"/>');
  pic('act-cover-face', 'circ', 'warn', '<circle cx="24" cy="24" r="14"/><path d="M18.5 18h.01M29.5 18h.01" stroke-width="4"/><path d="M11 27q4.3 3 8.5 0t8.5 0 8.5 0v7q-4.3 3-8.5 0t-8.5 0-8.5 0z"/>');
  pic('act-close-door', 'circ', 'info', '<path d="M12 8h18v32H12z"/><path d="M45 24H35M39 19l-5 5 5 5M25 24h.01"/>');
  pic('act-close-window', 'circ', 'info', '<path d="M11 7h26v34H11zM24 7v34M11 24h26"/><path d="M3 24h5M5.5 20.5l3 3.5-3 3.5M45 24h-5M42.5 20.5l-3 3.5 3 3.5"/>');
  pic('act-open-window', 'circ', 'info', '<path d="M10 7h28v34H10z"/><path d="M24 7l15-3.5v41L24 41z"/><path d="M30 24h.01"/>');
  pic('act-inside', 'circ', 'info', '<path d="M6 23L24 8l18 15M10 20v21h28V20"/><circle cx="24" cy="26" r="3"/><path d="M24 30v7M19.5 33h9"/>');
  pic('act-up', 'circ', 'info', '<path d="M24 40V9M12 21L24 9l12 12"/>');
  pic('act-high-ground', 'circ', 'info', '<path d="M4 40L19 14l8 14 5-8 12 20z"/><path d="M39 11V4M35.5 7.5L39 4l3.5 3.5"/>');
  pic('act-stay-upstairs', 'circ', 'info', '<path d="M11 5h26v38H11zM11 19h26M11 31h26"/><circle cx="24" cy="9.5" r="2.5" class="pf-s"/><path d="M24 12.5v4M20 14h8M24 38v-3M20.5 34.5l3.5 3.5 3.5-3.5"/>');
  pic('act-wind-cross', 'circ', 'warn', '<path d="M3 17h24M21 11l6 6-6 6"/><path d="M38 43V11M31 18l7-7 7 7"/>');
  pic('act-upwind', 'circ', 'warn', '<path d="M3 15h10M3 24h10M3 33h10"/><path d="M45 24H21M28 17l-7 7 7 7"/>');
  pic('act-mask', 'circ', 'info', '<circle cx="24" cy="23" r="13"/><path d="M18.5 17h.01M29.5 17h.01" stroke-width="4"/><path d="M14 24h20v6q-10 7-20 0z"/><path d="M14 26q-6 1-6 6M34 26q6 1 6 6M18 28h12"/>');
  pic('act-shade', 'circ', 'brand', '<path d="M6 25a18 15 0 0 1 36 0z"/><path d="M24 25v13a3 3 0 0 1-6 0M12 43h24"/>');
  pic('act-drink', 'circ', 'info', '<path d="M20 5h8M21 5v6l-4 5v24a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V16l-4-5V5M17 26h14"/>');
  pic('act-rest', 'circ', 'brand', '<circle cx="17" cy="11" r="4"/><path d="M17 17v14h16v11M17 22l9 5M9 36h8"/>');
  pic('act-wet-cloth', 'circ', 'info', '<path d="M9 11q5-3 10 0t10 0 10 0M9 11v19M39 11v19M9 30q5 3 10 0t10 0 10 0"/><path d="M24 33q-5 6 0 10 5-4 0-10z"/>');
  pic('act-call-999', 'circ', 'danger', '<path d="M22 16.920v3a2 2 0 0 1-2.180 2 19.790 19.790 0 0 1-8.630-3.070 19.5 19.5 0 0 1-6-6 19.790 19.790 0 0 1-3.070-8.670A2 2 0 0 1 4.110 2h3a2 2 0 0 1 2 1.720 12.840 12.840 0 0 0 .7 2.810 2 2 0 0 1-.45 2.110L8.090 9.910a16 16 0 0 0 6 6l1.270-1.270a2 2 0 0 1 2.110-.45 12.840 12.840 0 0 0 2.810.7A2 2 0 0 1 22 16.920z"/>', 24);
  pic('act-help-coming', 'sq', 'safe', '<circle cx="30" cy="11" r="4"/><path d="M30 16.5v12l-5 12M30 28.5l6 12M30 21l-7 6M30 21l7 6"/><path d="M5 17h10M2 25h13M5 33h10"/>');
  pic('act-stay-still', 'circ', 'info', '<circle cx="24" cy="10" r="4"/><path d="M24 15.5v14M24 29.5l-5 8M24 29.5l5 8M17 21h14"/><ellipse cx="24" cy="42" rx="13" ry="3.5" stroke-dasharray="3 3"/>');
  pic('act-unlock-door', 'sq', 'safe', '<path d="M6 5h18v38H6z"/><path d="M27 27h15v12H27z"/><path d="M30 27v-5a4.5 4.5 0 0 1 8.5-2"/>');
  pic('act-teacher', 'circ', 'info', '<circle cx="15" cy="9" r="4"/><path d="M15 14.5v14l-4 12M15 28.5l4 12M15 20l13 8"/><circle cx="32" cy="23" r="3.2"/><path d="M32 27v8l-3 7M32 35l3 7"/>');
  pic('act-refuge', 'sq', 'safe', '<circle cx="24" cy="9" r="4"/><path d="M24 14.5v11M17 19h14M5 26h38M10 26v14M18 26v14M26 26v14M34 26v14M42 26v14M4 40h40"/>');
  pic('act-assembly', 'sq', 'safe', '<path d="M12 43V7M12 7h21l-6 7 6 7H12"/><circle cx="29" cy="33" r="3"/><circle cx="38" cy="33" r="3"/><path d="M24 43q5-8 10 0M33 43q5-8 10 0"/>');
  pic('act-count', 'circ', 'info', '<circle cx="12" cy="13" r="3.5"/><circle cx="24" cy="13" r="3.5"/><circle cx="36" cy="13" r="3.5"/><path d="M6 27q6-9 12 0M18 27q6-9 12 0M30 27q6-9 12 0M16 38l5.5 5.5L33 32"/>');
  pic('act-check-in', 'circ', 'safe', PHONE + '<path d="M19 22l4 4 7-8"/>');
  pic('act-aed', 'sq', 'safe', '<path d="M24 41S7 31 7 19a8.5 8.5 0 0 1 17-3 8.5 8.5 0 0 1 17 3c0 12-17 22-17 22z"/><path d="M26 12l-8 14h7l-3 12 10-16h-7z" class="pf-s"/>');
  pic('act-recovery', 'circ', 'info', '<circle cx="11" cy="31" r="4"/><path d="M16 33h18M34 33l8-5M34 33l6 7M17 32l8-8M4 41h40"/>');
  pic('act-handrail', 'circ', 'info', '<path d="M5 36L40 11M11 32v9M19 26v15M27 21v20M35 15v26"/><circle cx="23" cy="23" r="3.5" class="pf-s"/>');
  pic('act-medicine', 'circ', 'info', '<g transform="rotate(-35 24 24)"><rect x="5" y="16" width="38" height="16" rx="8"/><path d="M24 16v16"/></g>');
  pic('act-knock', 'circ', 'info', '<path d="M5 6h19v36H5z"/><circle cx="32" cy="24" r="5"/><path d="M37 24h7M25 12l-2-4M32 8V3M39 12l2-4M25 36l-2 4M39 36l2 4"/>');
  pic('act-phone', 'circ', 'info', PHONE + '<path d="M38 13q4.5 4.5 0 9M42 10q7 7.5 0 15"/>');
  pic('act-fresh-air', 'circ', 'safe', '<path d="M26 5c10 6 12 16 0 27C14 21 16 11 26 5z"/><path d="M26 14v29M4 22h9M6 30h8"/>');
  pic('act-follow-arrows', 'sq', 'safe', '<path d="M8 12l10 12L8 36M19 12l10 12-10 12M30 12l10 12-10 12"/>');
  pic('act-keep-clear', 'circ', 'safe', '<path d="M12 43L19 7M36 43L29 7M24 38V13M18 19l6-6 6 6"/>');
  pic('act-stop-work', 'oct', 'danger', '<path d="M16 25V13a2.5 2.5 0 0 1 5 0v10M21 23V9a2.5 2.5 0 0 1 5 0v14M26 23V11a2.5 2.5 0 0 1 5 0v14M31 25V16a2.5 2.5 0 0 1 5 0v16c0 8-5 12-11 12h-1c-5 0-8-3-10-7l-5-8a2.5 2.5 0 0 1 4-3l3 4"/>');

  // --- actions: do NOT (ring + slash) ---
  pic('act-no-run', 'ban', 'danger', '<circle cx="28" cy="9" r="4"/><path d="M27 15l-5 12M22 27l-9 4M22 27l9 3-1 11M26 18H17M26 18l9 5"/>');
  pic('act-no-stairs', 'ban', 'danger', STAIRS + '<path d="M10 20l22-12"/>');
  pic('act-no-lift', 'ban', 'danger', '<path d="M11 6h26v36H11zM24 6v36"/><path d="M15 21l4-6 4 6zM25.5 27l4 6 4-6z"/>');
  pic('act-ac-off', 'ban', 'danger', '<path d="M6 11h36v14H6zM11 20h26M13 31v7M24 31v9M35 31v7"/>');
  pic('act-no-underpass', 'ban', 'danger', '<path d="M7 41V26a17 17 0 0 1 34 0v15M4 41h40"/><path d="M12 35q4-4 8 0t8 0 8 0"/>');
  pic('act-no-wade', 'ban', 'danger', '<circle cx="24" cy="8" r="4"/><path d="M24 13.5v14M17 18h14"/><path d="' + wave(30) + '"/><path d="' + wave(38) + '"/>');
  pic('act-no-drive-water', 'ban', 'danger', CAR + '<path d="' + wave(45) + '"/>');
  pic('act-no-low-ground', 'ban', 'danger', '<path d="M3 11l21 27L45 11"/><path d="M24 4v12M19 11l5 5 5-5"/>');
  pic('act-no-switch', 'ban', 'danger', '<path d="M13 5h22v38H13z"/><path d="M19 12h10v24H19z"/><path d="M24 17h.01" stroke-width="5"/>');
  pic('act-no-flame', 'ban', 'danger', FLAME);
  pic('act-no-phone-near', 'ban', 'danger', PHONE);

  // --- statuses (bare) ---
  pic('st-ok', 'none', 'safe', '<circle class="pf-fill pf-t" cx="24" cy="24" r="19" stroke-width="3"/><path class="pf-t" d="M14.5 25l7 7 12-14" stroke-width="4.5"/>');
  pic('st-no', 'none', 'danger', '<circle class="pf-fill pf-t" cx="24" cy="24" r="19" stroke-width="3"/><path class="pf-t" d="M16.5 16.5l15 15M31.5 16.5l-15 15" stroke-width="4.5"/>');
  pic('st-warn', 'none', 'warn', '<path class="pf-fill pf-t" d="M24 4 45 41H3z" stroke-width="3" stroke-linejoin="round"/><path d="M24 16v12M24 34h.01" stroke-width="4.5"/>');
  pic('st-clear', 'none', 'safe', '<path class="pf-fill pf-t" d="M24 4l16 6v13c0 10-7 17-16 21C15 40 8 33 8 23V10z" stroke-width="3" stroke-linejoin="round"/><path class="pf-t" d="M16 24l6 6 11-12" stroke-width="4.5"/>');
  pic('st-wait', 'none', 'info', '<path class="pf-t" d="M13 5h22M13 43h22M15 5c0 11 9 13 9 19s-9 8-9 19M33 5c0 11-9 13-9 19s9 8 9 19" stroke-width="3.5"/>');
  pic('st-info', 'none', 'info', '<circle class="pf-fill pf-t" cx="24" cy="24" r="19" stroke-width="3"/><path d="M24 22v12M24 14.5h.01" stroke-width="4.5"/>');
  pic('dr-light', 'none', 'safe', '<circle class="pf-fill pf-t" cx="24" cy="24" r="21" stroke-width="2.5"/><g transform="translate(9 9) scale(1.250)"><circle cx="5" cy="5" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M7.5 7.5l2.5 2.5M16.5 7.5L14 10M7.5 16.5l2.5-2.5M16.5 16.5L14 14"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.5"/><circle cx="12" cy="12" r="1.2" class="pf-ts"/></g>');

  // the full SVG markup of one pictogram (a static, authored string — safe to parse; the id only selects it)
  function pictoSVG(id) {
    var P = PICT[id] || PICT['st-info'], F = FRAME[P.f], k = P.box === 24 ? 2 : 1, c = P.box / 2;
    var sw = (P.f === 'none' ? 3 : 2.1 / F.s) / k;
    var tf = 'translate(24 ' + F.cy + ') scale(' + F.s + ')' + (k === 2 ? ' scale(2)' : '') + ' translate(-' + c + ' -' + c + ')';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="pf t-' + P.t + '" focusable="false" aria-hidden="true">' +
      F.back + '<g class="pf-g" transform="' + tf + '" stroke-width="' + sw.toFixed(2) + '">' + P.g + '</g>' + F.front + '</svg>';
  }


  /* ---- exported pure API ---- */
  var api = {
    version: VERSION,
    qr: { encode: QR.encode, capacityBytes: QR.capacityBytes, maxVersion: QR.maxVersion, table: QR.table },
    overpass: { url: OVERPASS_URL, query: buildOverpassQuery, parse: parseOverpass, haversineM: haversineM, bearingDeg: bearingDeg, name: facilityName, distance: formatDistance, kinds: FACILITY_KINDS.map(function (k) { return k.id; }) },
    geom: { routeLengthM: routeLengthM, firstTurn: firstTurn, routeHeading: routeHeading, compassWord: compassWord, CELL_M: CELL_M },
    pictos: { ids: function () { return Object.keys(PICT); }, has: function (id) { return !!PICT[id]; }, svg: pictoSVG, frameOf: function (id) { return PICT[id] ? PICT[id].f : null; } }
  };
  root.ManaraAlert = api;
  if (typeof document === 'undefined') return;                 // Node (tests): the pure part ends here

  /* ====================================================================================
   * 5. DOM RUNTIME — helpers, strings, settings
   * ==================================================================================== */
  var D = document, Mn = root.Manara, M = root.MANARA_MSG, S = root.ManaraSim;
  var reduceMQ = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };

  function h(tag, a, kids) {
    var el = D.createElement(tag), k;
    if (a) for (k in a) {
      var v = a[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'data') { for (var d in v) if (v[d] != null) el.setAttribute('data-' + d, v[d]); }
      else el.setAttribute(k, v === true ? '' : v);
    }
    (function add(list) {
      if (list == null || list === false) return;
      if (!Array.isArray(list)) list = [list];
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) add(c);
        else el.appendChild(typeof c === 'object' ? c : D.createTextNode(String(c)));
      });
    })(kids);
    return el;
  }
  function $(sel, r) { return (r || D).querySelector(sel); }
  function $$(sel, r) { return Array.prototype.slice.call((r || D).querySelectorAll(sel)); }
  function empty(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  // static, authored SVG markup → a DOM node (DOMParser, so this file never assigns markup strings to elements)
  function svgNode(markup) { var doc = new DOMParser().parseFromString(markup, 'image/svg+xml'); return D.importNode(doc.documentElement, true); }
  function icon(name, cls) { return svgNode(Mn.icon(name, cls).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')); }
  function picto(id) { return svgNode(pictoSVG(id)); }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, a, kids) {
    var el = D.createElementNS(SVGNS, tag), k;
    if (a) for (k in a) if (a[k] != null && a[k] !== false) el.setAttribute(k, a[k]);
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num1(n) { return Math.round(n * 10) / 10; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function now() { return Date.now(); }
  function chromeLang(l) { return l === 'ar' ? 'ar' : 'en'; }              // phone chrome speaks Arabic or English; the message itself is in the person's language
  function pickL(o, l) { if (o == null) return ''; if (typeof o === 'string') return o; return o[l] != null ? o[l] : (o.en != null ? o.en : o.ar); }
  function endSentence(t) { t = String(t == null ? '' : t).trim(); return !t || /[.!?؟…]$/.test(t) ? t : t + '.'; }       // join phrases into one paragraph without run-on sentences
  function fill(s, vars) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }

  /* ---- strings (Arabic: Modern Standard Arabic for a Gulf audience; English: plain) ---- */
  var STR = {
    'al.eyebrow': { ar: 'الوصول والعدّ', en: 'Reach + Count' },
    'al.lead': { ar: 'كل شخص يصله التنبيه بلغته وبالطريقة التي تناسبه، ثم يضغط «أنا بخير» أو «أحتاج مساعدة» ليُحصى. اللوحة التالية تعمل فورًا بلا إعداد.', en: 'Every person gets the alert in their own language and format, then taps “I’m safe” or “I need help” so they are counted. The wall below works at once, with no setup.' },
    'al.mode.wall': { ar: 'جدار الهواتف', en: 'Phone wall' },
    'al.mode.phone': { ar: 'هاتف واحد', en: 'One phone' },
    'al.mode.label': { ar: 'طريقة العرض', en: 'View' },
    'al.link.live': { ar: 'مباشر من غرفة العمليات', en: 'Live from Mission Control' },
    'al.link.demo': { ar: 'عرض تجريبي مستقل — بانتظار غرفة العمليات', en: 'Stand-alone demo — waiting for Mission Control' },
    'al.link.last': { ar: 'آخر رسالة قبل {s} ث', en: 'last message {s} s ago' },
    'al.link.bc': { ar: 'القناة المشتركة بين تبويبات المتصفح نفسه', en: 'shared channel between tabs of this browser' },
    'al.demo.title': { ar: 'تشغيل تجريبي', en: 'Demo trigger' },
    'al.demo.hint': { ar: 'اختر الخطر والمستوى ثم أرسل. التنبيه التجريبي يبقى في هذه الصفحة ولا يُرسَل إلى القناة المشتركة.', en: 'Pick a hazard and a level, then send. A demo alert stays on this page and is not sent on the shared channel.' },
    'al.demo.time': { ar: 'الوقت', en: 'Time of day' },
    'al.demo.night': { ar: 'ليل 04:00 — الجميع نيام', en: 'Night 04:00 — all asleep' },
    'al.demo.day': { ar: 'نهار 10:30 — الجميع مستيقظون', en: 'Day 10:30 — all awake' },
    'al.demo.send': { ar: 'أرسل تنبيهًا تجريبيًا', en: 'Send demo alert' },
    'al.demo.ladder': { ar: 'محاكاة سلّم الإيقاظ', en: 'Simulate wake-up ladder' },
    'al.demo.clear': { ar: 'أرسل «انتهى الخطر»', en: 'Send all-clear' },
    'al.demo.reset': { ar: 'إعادة تعيين الهواتف', en: 'Reset the phones' },
    'al.demo.speed': { ar: 'سرعة السلّم', en: 'Ladder speed' },
    'al.demo.speed1': { ar: 'حقيقية (30 ث لكل درجة)', en: 'Real (30 s per step)' },
    'al.demo.speed10': { ar: 'سريعة ×10 (للعرض)', en: 'Fast ×10 (for the demo)' },
    'al.demo.sim_note': { ar: 'المسارات وأزمنة وصول الوحدات من المحاكاة (SIM) والوحدات افتراضية.', en: 'Routes and responder times come from the simulation (SIM); the units are fictional.' },
    'al.lvl.watch': { ar: 'متابعة — كن مستعدًا', en: 'Watch — be ready' },
    'al.lvl.warning': { ar: 'ابقَ في مكانك (احتماء)', en: 'Stay in place (shelter)' },
    'al.lvl.evacuate': { ar: 'تحرّك الآن', en: 'Act now' },
    'al.set.title': { ar: 'إعدادات التنبيه وإمكانية الوصول', en: 'Alert settings and accessibility' },
    'al.set.enable': { ar: 'انقر لتفعيل التنبيهات', en: 'Tap to enable alerts' },
    'al.set.enabled': { ar: 'التنبيهات مفعّلة', en: 'Alerts are on' },
    'al.set.enable_note': { ar: 'المتصفح لا يسمح بالصوت والاهتزاز قبل أن تلمس الشاشة. نبدأ صامتين حتى تفعّلها.', en: 'Browsers allow sound and vibration only after you touch the screen. We stay silent until you enable them.' },
    'al.set.volume': { ar: 'مستوى الصوت', en: 'Volume' },
    'al.set.mute': { ar: 'كتم الصوت', en: 'Mute' },
    'al.set.test': { ar: 'جرّب الصوت', en: 'Test sound' },
    'al.set.vtest': { ar: 'جرّب الاهتزاز', en: 'Test vibration' },
    'al.set.vib_na': { ar: 'الاهتزاز غير مدعوم في هذا الجهاز أو المتصفح (مثل Safari على iPhone). نعرض نمطه على الشاشة بدلًا منه.', en: 'Vibration is not supported on this device or browser (for example Safari on iPhone). The pattern is drawn on screen instead.' },
    'al.set.vib_ok': { ar: 'هذا الجهاز يدعم الاهتزاز.', en: 'This device supports vibration.' },
    'al.set.big': { ar: 'نص كبير', en: 'Large text' },
    'al.set.hc': { ar: 'تباين عالٍ', en: 'High contrast' },
    'al.set.strobe_off': { ar: 'أوقف الضوء الوامض', en: 'Turn off the flashing light' },
    'al.set.strobe_state_off': { ar: 'الضوء الوامض مُعطَّل (الوضع الافتراضي)', en: 'Flashing light is off (the default)' },
    'al.set.strobe_state_on': { ar: 'الضوء الوامض مفعّل', en: 'Flashing light is on' },
    'al.set.langmode': { ar: 'لغة الهواتف', en: 'Phone language' },
    'al.set.lang_own': { ar: 'لغة كل شخص', en: "Each person's own" },
    'al.set.voice': { ar: 'القراءة الصوتية', en: 'Voice' },
    'al.set.voice_na': { ar: 'هذا المتصفح لا يدعم القراءة الصوتية. النص والصور والاهتزاز تحمل الرسالة.', en: 'This browser has no speech voice. Text, pictures and vibration carry the message.' },
    'al.set.audible': { ar: 'الصوت من:', en: 'Sound from:' },
    'al.p.noalert': { ar: 'لا يوجد تنبيه الآن', en: 'No alert right now' },
    'al.p.wait': { ar: 'بانتظار غرفة العمليات — أو اختر خطرًا لتجربته هنا', en: 'Waiting for Mission Control — or pick a hazard to try it here' },
    'al.p.ready': { ar: 'الهاتف جاهز. عند وصول تنبيه سيظهر هنا بلغتك.', en: 'This phone is ready. When an alert arrives it shows here, in your language.' },
    'al.p.try': { ar: 'جرّب خطرًا', en: 'Try a hazard' },
    'al.p.exercise': { ar: 'تمرين', en: 'EXERCISE' },
    'al.p.sim': { ar: 'محاكاة', en: 'SIM' },
    'al.p.gate': { ar: 'انقر لتفعيل التنبيهات', en: 'Tap to enable alerts' },
    'al.p.gate_sub': { ar: 'يحتاج المتصفح إلى لمسة منك قبل أن يسمح بالصوت والاهتزاز.', en: 'Your browser needs one tap from you before it allows sound and vibration.' },
    'al.p.hear': { ar: 'اسمع الصوت من هذا الهاتف', en: 'Play the sound from this phone' },
    'al.p.hearing': { ar: 'الصوت يصدر من هذا الهاتف', en: 'Sound plays from this phone' },
    'al.p.nosound': { ar: 'هذا الشخص لا يسمع: ضوء واهتزاز ونص بدل الصوت', en: 'This person cannot hear: light, vibration and text instead of sound' },
    'al.p.nolang': { ar: 'نعرض العربية لأن هذه الرسالة غير متاحة بلغتك.', en: 'Showing English because this message is not available in your language.' },
    'al.p.fmt': { ar: 'كيف ينبّه هذا الهاتف صاحبه', en: 'How this phone alerts its owner' },
    'al.fmt.sound': { ar: 'الصوت', en: 'Sound' },
    'al.fmt.vib': { ar: 'الاهتزاز', en: 'Vibration' },
    'al.fmt.light': { ar: 'الضوء', en: 'Light' },
    'al.fmt.voice': { ar: 'القراءة الصوتية', en: 'Voice' },
    'al.fmt.sound_on': { ar: 'نغمة منخفضة بثلاث نبضات', en: 'Low tone, three pulses' },
    'al.fmt.sound_off': { ar: 'بلا صوت', en: 'No sound' },
    'al.fmt.voice_auto': { ar: 'تلقائية', en: 'Reads automatically' },
    'al.fmt.voice_tap': { ar: 'عند الطلب', en: 'Reads on request' },
    'al.fmt.voice_off': { ar: 'غير مفعّلة', en: 'Off' },
    'al.lang.chips': { ar: 'لغة الرسالة', en: 'Message language' },
    'al.sources': { ar: 'المصادر', en: 'Sources' },
    'al.exercise_line': { ar: 'تمرين: ليس تحذيرًا رسميًا', en: 'Exercise: not an official warning' },
    'al.route.title': { ar: 'طريقك الآمن', en: 'Your safe route' },
    'al.route.stay': { ar: 'لا حاجة إلى التحرّك — ابقَ في مكانك.', en: 'No need to move — stay where you are.' },
    'al.route.na': { ar: 'لا يوجد مسار لهذا التنبيه (غير متاح لهذا المحفّز).', en: 'No route for this alert (N/A for this stimulus).' },
    'al.route.len': { ar: 'طول المسار: {m} م', en: 'Route length: {m} m' },
    'al.route.north': { ar: 'الشمال في الأعلى', en: 'North is up' },
    'al.route.you': { ar: 'أنت', en: 'You' },
    'al.route.hazard': { ar: 'الخطر', en: 'Hazard' },
    'al.route.dest': { ar: 'الوجهة', en: 'Destination' },
    'al.route.towards': { ar: 'باتجاه {dir}', en: 'towards the {dir}' },
    'al.route.wind_from': { ar: 'الريح من {dir}', en: 'wind from the {dir}' },
    'al.route.sim': { ar: 'مسار حيّ من المحاكاة (SIM)', en: 'Live route from the simulation (SIM)' },
    'al.compass.alt': { ar: 'بوصلة: الخطر باتجاه {dir}، والريح من {wind}', en: 'Compass: hazard towards the {dir}, wind from the {wind}' },
    'al.map.alt': { ar: 'خريطة مبسطة للمسار: من موقعك إلى {place}', en: 'Simple route map: from your position to {place}' },
    'al.resp.none': { ar: 'لا توجد جهات استجابة معتمدة بعد.', en: 'No approved responders yet.' },
    'al.resp.why': { ar: 'لماذا هذه الوحدة؟', en: 'Why this unit?' },
    'al.resp.why_hide': { ar: 'إخفاء السبب', en: 'Hide the reason' },
    'al.resp.fastest': { ar: 'نختار الأسرع وصولًا مع المرور (محاكى)، لا الأقرب مسافة.', en: 'We pick the fastest to arrive with (simulated) traffic, not the nearest by distance.' },
    'al.resp.hospital': { ar: 'مستشفى الوجهة', en: 'Destination hospital' },
    'al.drone.title': { ar: 'مسيّرة بضوء أخضر = صديقة', en: 'A drone with a GREEN light is a friend' },
    'al.drone.follow': { ar: 'اتبع الضوء الأخضر.', en: 'Follow the green light.' },
    'al.drone.licensed': { ar: 'مسيّرة تشغّلها جهة مرخّصة مثل الدفاع المدني (مفهوم).', en: 'A drone run by a licensed agency such as Civil Defence (a concept).' },
    'al.drone.show': { ar: 'ما هذه المسيّرة؟', en: 'What is this drone?' },
    'al.drone.hide': { ar: 'إخفاء', en: 'Hide' },
    'al.nb.straight': { ar: 'المسافة بخط مستقيم؛ حالة المرور غير معروفة بلا اتصال.', en: 'Straight-line distance. Traffic is not known here.' },
    'al.nb.label': { ar: 'للاطلاع فقط — ليس إرسالًا للمساعدة. اتصل بـ 999.', en: 'Informational, not dispatch — call 999.' },
    'al.nb.osm': { ar: '© مساهمو OpenStreetMap', en: '© OpenStreetMap contributors' },
    'al.nb.clear': { ar: 'امسح النتائج', en: 'Clear results' },
    'al.nb.unsupported': { ar: 'هذا المتصفح لا يدعم تحديد الموقع.', en: 'Location is not supported in this browser.' },
    'al.nb.call': { ar: 'اتصل بـ 999', en: 'Call 999' },
    'al.nb.call_warn': { ar: 'سيفتح هذا تطبيق الاتصال في هاتفك. اتصل فقط في طوارئ حقيقية — هذه الصفحة تمرين.', en: 'This opens your phone’s dialer. Call only in a real emergency — this page is an exercise.' },
    'al.nb.call_open': { ar: 'افتح الاتصال بـ 999', en: 'Open the dialer for 999' },
    'al.nb.cancel': { ar: 'إلغاء', en: 'Cancel' },
    'al.nb.here': { ar: 'بعيد {d} {dir}', en: '{d} away, {dir}' },
    'al.act.title': { ar: 'هل أنت بخير؟', en: 'Are you OK?' },
    'al.act.needs': { ar: 'احتياجاتي (اختياري)', en: 'My needs (optional)' },
    'al.act.safe_sub': { ar: 'تتحول غرفتك إلى الأخضر عند المشغّل', en: 'Your room turns green for the operator' },
    'al.act.help_sub': { ar: 'يصل طلبك إلى المشغّل مع غرفتك واحتياجاتك', en: 'The operator gets your room and needs' },
    'al.act.sent': { ar: 'أُرسل إلى غرفة العمليات', en: 'Sent to Mission Control' },
    'al.act.demo_sent': { ar: 'أُرسل (تجريبي)', en: 'Sent (demo)' },
    'al.act.room': { ar: 'الغرفة {r}', en: 'Room {r}' },
    'al.ladder.short0': { ar: 'إنذار الهاتف', en: 'Phone alarm' },
    'al.ladder.short1': { ar: 'أعلى صوتًا + ضوء', en: 'Louder + light' },
    'al.ladder.short2': { ar: 'الحارس عند بابك', en: 'Guard at your door' },
    'al.ladder.short3': { ar: 'الدفاع المدني', en: 'Civil Defence' },
    'al.ladder.climb': { ar: 'يتصاعد حتى تضغط «أنا مستيقظ».', en: 'Climbs until you tap “I’m awake”.' },
    'al.ladder.stopped': { ar: 'توقف السلّم عند الدرجة {n}', en: 'Ladder stopped at step {n}' },
    'al.ladder.fast': { ar: 'عرض سريع ×{n}: في الواقع كل درجة 30 ثانية.', en: 'Fast demo ×{n}: in real use each step is 30 seconds.' },
    'al.ladder.elapsed': { ar: 'منذ التنبيه', en: 'Since the alert' },
    'al.ladder.guardnote': { ar: 'عند الدرجة 3 يُرسَل إلى مكتب الحارس: {room}', en: 'At step 3 the guard desk is sent: {room}' },
    'al.ladder.mode_soft': { ar: 'نبّهنا النائم مرة واحدة بدون سلّم (مستوى لا يستدعي السلّم).', en: 'A sleeper is woken once, without the ladder (this level does not need it).' },
    'al.guard.title': { ar: 'قائمة الغرف — عرض الحارس', en: 'Room list — guard view' },
    'al.guard.sub': { ar: 'من الهواتف الأربعة في هذه الصفحة. الأولوية لمن يحتاج مساعدة أكثر.', en: 'From the four phones on this page. Those who need most help come first.' },
    'al.guard.none': { ar: 'لا يوجد تنبيه نشط.', en: 'No active alert.' },
    'al.guard.status.awake': { ar: 'استيقظ', en: 'Awake' },
    'al.guard.status.noreply': { ar: 'لم يردّ', en: 'No reply' },
    'al.guard.knock': { ar: 'اطرق الباب', en: 'Knock' },
    'al.blind.title': { ar: 'مسار القارئ الصوتي', en: 'Voice flow' },
    'al.blind.desc': { ar: 'يقرأ الهاتف التنبيه بصوت عالٍ ويرشد إلى كل منعطف ويهتز اهتزازًا قويًا. الأزرار كبيرة وتعمل مع قارئ الشاشة.', en: 'The phone reads the alert aloud, tells each turn and vibrates strongly. Buttons are large and work with a screen reader.' },
    'al.blind.script': { ar: 'ما يُقرأ بصوت عالٍ', en: 'What is read aloud' },
    'al.blind.repeat': { ar: 'أعد القراءة', en: 'Repeat' },
    'al.blind.stop': { ar: 'أوقف القراءة', en: 'Stop reading' },
    'al.blind.novoice': { ar: 'لا يوجد صوت لهذه اللغة في جهازك؛ النص والصور والاهتزاز تحمل الرسالة.', en: 'This device has no voice for this language; text, pictures and vibration carry the message.' },
    'al.blind.speaking': { ar: 'تتم القراءة الآن…', en: 'Reading aloud…' },
    'al.blind.turn_line': { ar: 'إرشاد الطريق', en: 'Route guidance' },
    'al.more.title': { ar: 'شخصان آخران', en: 'Two more people' },
    'al.more.lead': { ar: 'اختر شخصًا لترى مسار القارئ الصوتي أو عرض حارس المبنى.', en: 'Pick one to see the voice flow or the building guard’s view.' },
    'al.tag.asleep': { ar: 'ينام ليلًا', en: 'Asleep at night' },
    'al.tag.draft': { ar: 'لغة بمسودة', en: 'Draft language' },
    'al.cap.lang': { ar: 'لغته', en: 'Language' },
    'al.solo.try': { ar: 'جرّب خطرًا على هذا الهاتف', en: 'Try a hazard on this phone' },
    'al.solo.qr': { ar: 'رمز QR لهذا الهاتف', en: 'QR code for this phone' },
    'al.qr.title': { ar: 'افتح شخصًا على هاتفك', en: 'Open a person on your own phone' },
    'al.qr.lead': { ar: 'امسح الرمز بهاتفك لتفتح هاتف الشخص المختار بشاشة كاملة. يمكنك أن تبدأ بتنبيه تجريبي جاهز.', en: 'Scan the code with your phone to open the chosen person’s phone full screen. You can start with a demo alert already running.' },
    'al.qr.person': { ar: 'الشخص', en: 'Person' },
    'al.qr.lang': { ar: 'لغة التنبيه', en: 'Alert language' },
    'al.qr.base': { ar: 'عنوان الصفحة', en: 'Page address' },
    'al.qr.start': { ar: 'ابدأ بتنبيه تجريبي', en: 'Start with a demo alert' },
    'al.qr.copy': { ar: 'انسخ الرابط', en: 'Copy link' },
    'al.qr.copied': { ar: 'تم نسخ الرابط', en: 'Link copied' },
    'al.qr.download': { ar: 'حمّل صورة الرمز', en: 'Download the code' },
    'al.qr.alt': { ar: 'رمز QR لفتح هاتف {name}', en: 'QR code that opens {name}’s phone' },
    'al.qr.file': { ar: 'هذا العنوان يبدأ بـ file:// فلا يعمل إلا على هذا الجهاز. لتجربته على هاتفك: شغّل مجلد site على الشبكة نفسها (مثل python3 -m http.server 8765 داخل المجلد site) ثم اكتب عنوان الحاسوب في خانة «عنوان الصفحة»، مثل http://192.168.1.20:8765/manara/alert.html', en: 'This address starts with file:// so it only works on this device. To try it on your phone: serve the site folder on the same Wi-Fi (for example python3 -m http.server 8765 inside the site folder), then type the computer’s address in “Page address”, for example http://192.168.1.20:8765/manara/alert.html' },
    'al.qr.live': { ar: 'الهاتف المفتوح بالرمز يعمل عرضًا مستقلًا. الربط الحي مع غرفة العمليات يعمل بين تبويبات المتصفح نفسه فقط؛ الربط بين أجهزة مختلفة يحتاج خادمًا وإشعارات دفع، وهذا غير مبني.', en: 'A phone opened with this code runs the demo on its own. The live link to Mission Control works only between tabs of the same browser; linking different devices needs a server and push notifications, which are not built.' },
    'al.qr.long': { ar: 'الرابط أطول مما يدعمه المولّد الصغير ({n} بايت). اختصر العنوان.', en: 'The link is longer than this small generator supports ({n} bytes). Shorten the address.' },
    'al.qr.info': { ar: 'المولّد مكتوب بالشيفرة نفسها بلا مكتبات، وقد فُحص بقارئ مستقل.', en: 'The generator is written in this page’s own code with no library, and was checked with an independent reader.' },
    'al.pic.title': { ar: 'مفردات الصور', en: 'The picture vocabulary' },
    'al.pic.lead': { ar: '{n} رمزًا مرسومًا بالشيفرة. الصورة تحمل الرسالة لمن لا يقرأ اللغة: المثلث تحذير، والدائرة الزرقاء «افعل»، والدائرة الحمراء بخط مائل «لا تفعل»، والمربع الأخضر مكان آمن أو مساعدة.', en: '{n} pictograms drawn in code. A picture carries the message for people who do not read the language: a triangle warns, a blue circle says “do”, a red ring with a slash says “do not”, a green square is a safe place or help.' },
    'al.notes.title': { ar: 'حدود الصفحة وما نقوله بصدق', en: 'What this page can and cannot do' },
    'al.close': { ar: 'إغلاق', en: 'Close' },
    'al.menu': { ar: 'قائمة العرض', en: 'Demo menu' },
    'al.back': { ar: 'موقع منارة', en: 'MANARA site' },
    'al.persona': { ar: 'الشخص', en: 'Person' },
    'al.clock_sim': { ar: 'ساعة المحاكاة', en: 'Simulation clock' }
  };
  function T(key, vars) { return fill(Mn.s(key), vars); }                            // page language (Arabic / English)
  function PT(key, lang, vars) { var e = STR[key]; return fill(e ? (e[chromeLang(lang)] || e.en) : key, vars); }   // a phone's own chrome language
  function MT(id, lang, vars) { return M ? M.text(id, lang || Mn.lang(), vars) : ''; }   // MANARA_MSG phrase in a language (falls back to en → ar)
  Mn.strings(STR);

  /* ---- settings (per-viewer conveniences; never the strobe: it is opt-in every visit) ---- */
  var SET = {
    vol: 80, muted: false, big: false, hc: false, langMode: 'own',
    strobe: false,               // OFF by default, never persisted
    night: true, speed: 1,
    reduced: !!reduceMQ.matches
  };
  (function loadSettings() {
    var v = parseInt(Mn.store('manara-alert-vol'), 10); if (isFinite(v)) SET.vol = Math.max(0, Math.min(100, v));
    SET.muted = Mn.store('manara-alert-mute') === '1';
    SET.big = Mn.store('manara-alert-big') === '1';
    SET.hc = Mn.store('manara-alert-hc') === '1';
    var lm = Mn.store('manara-alert-langmode'); if (lm === 'ar' || lm === 'en') SET.langMode = lm;
  })();
  function saveSetting(k) {
    var map = { vol: 'manara-alert-vol', muted: 'manara-alert-mute', big: 'manara-alert-big', hc: 'manara-alert-hc', langMode: 'manara-alert-langmode' };
    if (!map[k]) return;
    var v = SET[k]; Mn.store(map[k], typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }

  /* ====================================================================================
   * 6. ACCESSIBLE FORMATS: sound (WebAudio), speech, vibration — each feature-detected, none starts before a user tap
   * ==================================================================================== */
  // MANARA's own alert sound. The wake-up tone is a low 520 Hz three-pulse tone (NFPA Research Foundation, S56); it is NOT the national
  // alert tone (S36). Events: [offset s, duration s, frequency Hz].
  var PROFILES = {
    wake:  { cycle: 2.6, wave: 'square', gain: 0.30, ev: [[0, 0.40, 520], [0.55, 0.40, 520], [1.10, 0.40, 520]] },
    wake2: { cycle: 1.9, wave: 'square', gain: 0.36, ev: [[0, 0.30, 520], [0.40, 0.30, 520], [0.80, 0.30, 520]], harm: 1040 },
    evac:  { cycle: 2.6, wave: 'square', gain: 0.28, ev: [[0, 0.40, 520], [0.55, 0.40, 520], [1.10, 0.40, 520]], max: 4 },
    warn:  { cycle: 2.4, wave: 'square', gain: 0.22, ev: [[0, 0.40, 520], [0.60, 0.40, 520]], max: 2 },
    info:  { cycle: 1.2, wave: 'sine',   gain: 0.20, ev: [[0, 0.50, 440]], max: 1 },
    calm:  { cycle: 2.0, wave: 'sine',   gain: 0.20, ev: [[0, 0.35, 440], [0.45, 0.45, 554]], max: 1 },
    clear: { cycle: 2.0, wave: 'sine',   gain: 0.22, ev: [[0, 0.30, 523], [0.35, 0.30, 659], [0.70, 0.55, 784]], max: 1 },
    ack:   { cycle: 1.0, wave: 'sine',   gain: 0.18, ev: [[0, 0.18, 660]], max: 1 },
    test:  { cycle: 2.0, wave: 'square', gain: 0.28, ev: [[0, 0.40, 520], [0.55, 0.40, 520], [1.10, 0.40, 520]], max: 1 }
  };
  var Aud = (function () {
    var ctx = null, master = null, enabled = false, want = null, running = null, timer = null, cycles = 0, ever = [];
    function Ctor() { return root.AudioContext || root.webkitAudioContext; }
    function level() { return SET.muted ? 0 : Math.pow(SET.vol / 100, 1.6) * 0.9; }
    function applyVol() { if (master && ctx) { try { master.gain.setTargetAtTime(level(), ctx.currentTime, 0.02); } catch (e) { master.gain.value = level(); } } }
    function enable() {
      var C = Ctor(); if (!C) return Promise.resolve(false);
      try {
        if (!ctx) { ctx = new C(); master = ctx.createGain(); master.gain.value = level(); master.connect(ctx.destination); }
        var p = ctx.resume ? ctx.resume() : null;
        enabled = true;
        return Promise.resolve(p).then(function () { return true; }, function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    }
    function pulse(t0, dur, freq, wave, gain, harm) {
      function osc(f, g, type) {
        var o = ctx.createOscillator(), e = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 3200;
        e.gain.setValueAtTime(0.0001, t0);
        e.gain.exponentialRampToValueAtTime(g, t0 + 0.02);
        e.gain.setValueAtTime(g, t0 + Math.max(0.03, dur - 0.05));
        e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(lp); lp.connect(e); e.connect(master);
        o.start(t0); o.stop(t0 + dur + 0.05);
      }
      osc(freq, gain, wave);
      if (harm) osc(harm, gain * 0.35, 'triangle');
    }
    function runCycle(P) {
      if (!ctx || !master) return;
      var t0 = ctx.currentTime + 0.03;
      P.ev.forEach(function (e) { pulse(t0 + e[0], e[1], e[2], P.wave, P.gain, P.harm); });
      cycles++;
    }
    function stopTimer() { if (timer) { clearTimeout(timer); timer = null; } running = null; }
    function play(name) {
      want = name || null;
      stopTimer();
      if (!name || !PROFILES[name]) return;
      if (ever.indexOf(name) < 0) ever.push(name);
      if (!enabled || SET.muted || !ctx) return;
      var P = PROFILES[name], n = 0; running = name; cycles = 0;
      (function loop() {
        if (running !== name) return;
        runCycle(P); n++;
        if (P.max && n >= P.max) { timer = setTimeout(function () { if (running === name) running = null; }, P.cycle * 1000); return; }
        if (n >= 400) { running = null; return; }                   // never ring forever (battery, neighbours)
        timer = setTimeout(loop, P.cycle * 1000);
      })();
    }
    function stop() { want = null; stopTimer(); }
    function reapply() { applyVol(); if (want && !running) play(want); if (SET.muted && running) { var w = want; stopTimer(); want = w; } }
    return {
      enable: enable, play: play, stop: stop, reapply: reapply, applyVol: applyVol,
      supported: function () { return !!Ctor(); },
      state: function () { return { supported: !!Ctor(), enabled: enabled, muted: SET.muted, volume: SET.vol, want: want, running: running, cycles: cycles, ctx: ctx ? ctx.state : 'none', ever: ever.slice() }; }
    };
  })();

  var Voice = (function () {
    var last = null, speaking = false, onEnd = null;
    function supported() { return !!(root.speechSynthesis && root.SpeechSynthesisUtterance); }
    function voices() { try { return root.speechSynthesis.getVoices() || []; } catch (e) { return []; } }
    function pick(tags) {
      var vs = voices(); if (!vs.length) return { voice: null, known: false };
      for (var i = 0; i < tags.length; i++) {
        var t = String(tags[i]).toLowerCase(), base = t.split('-')[0];
        var exact = vs.filter(function (v) { return String(v.lang).toLowerCase().replace('_', '-') === t; })[0];
        if (exact) return { voice: exact, known: true };
        if (t.indexOf('-') < 0) { var pre = vs.filter(function (v) { return String(v.lang).toLowerCase().replace('_', '-').split('-')[0] === base; })[0]; if (pre) return { voice: pre, known: true }; }
      }
      // region-less match on the language of the first tag
      var b0 = String(tags[0] || '').toLowerCase().split('-')[0];
      var any = vs.filter(function (v) { return String(v.lang).toLowerCase().replace('_', '-').split('-')[0] === b0; })[0];
      return any ? { voice: any, known: true } : { voice: null, known: true };
    }
    // speak(text, {lang:'ml-IN', fallback:['ml-IN','ml']}) → { ok, reason }
    function speak(text, spec, done) {
      spec = spec || {};
      var tags = (spec.fallback && spec.fallback.length ? spec.fallback : [spec.lang || 'en-GB']);
      last = { text: text, lang: spec.lang || tags[0], at: now(), ok: false, reason: null };
      if (!supported()) { last.reason = 'unsupported'; return { ok: false, reason: 'unsupported' }; }
      var p = pick(tags);
      if (p.known && !p.voice) { last.reason = 'no-voice'; return { ok: false, reason: 'no-voice' }; }
      try {
        root.speechSynthesis.cancel();
        var u = new root.SpeechSynthesisUtterance(text);
        u.lang = spec.lang || tags[0]; u.rate = spec.rate || 0.95; u.volume = SET.muted ? 0 : Math.max(0.2, SET.vol / 100);
        if (p.voice) u.voice = p.voice;
        u.onend = u.onerror = function () { speaking = false; if (done) done(); };
        speaking = true; last.ok = true;
        root.speechSynthesis.speak(u);
        return { ok: true };
      } catch (e) { last.reason = 'error'; speaking = false; return { ok: false, reason: 'error' }; }
    }
    function stop() { speaking = false; try { if (supported()) root.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    return { supported: supported, speak: speak, stop: stop, isSpeaking: function () { return speaking; }, last: function () { return last ? clone(last) : null; } };
  })();

  var Hap = (function () {
    var wanted = null, sent = null, count = 0;
    function supported() { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; }
    // Chrome blocks vibrate() before the first tap; we only call it after the page has been activated (the "Tap to enable alerts" tap)
    function allowed() { return !(navigator.userActivation && !navigator.userActivation.hasBeenActive); }
    // alerts stay silent AND still until the viewer taps "Tap to enable alerts" (force = the vibration test button, which is itself a tap)
    function buzz(pattern, force) {
      wanted = pattern ? pattern.slice() : null;
      if (!supported() || !pattern || !pattern.length || !allowed() || !(force || Aud.state().enabled)) return false;
      try { var ok = navigator.vibrate(pattern); if (ok) { sent = pattern.slice(); count++; } return !!ok; } catch (e) { return false; }
    }
    function stop() { try { if (supported()) navigator.vibrate(0); } catch (e) { /* ignore */ } }
    return { supported: supported, buzz: buzz, stop: stop, state: function () { return { supported: supported(), wanted: wanted, sent: sent, count: count }; } };
  })();

  /* Light: steady glow (never flashes) or, only if the viewer opted in AND reduced motion is off, a flash of at most 3 per second */
  function lightPlan(msg) {
    var f = msg && msg.flash;
    if (!f || f.kind === 'none') return { mode: 'off', token: null, id: 'none' };
    if (f.kind === 'steady') return { mode: 'steady', token: f.token, id: f.id };
    if (f.kind === 'flash') {
      if (SET.strobe && !SET.reduced) return { mode: 'flash', token: f.token, onMs: f.onMs, offMs: f.offMs, id: f.id };
      var fb = f.fallback ? M.flash(f.fallback) : null;
      return { mode: 'steady', token: fb ? fb.token : f.token, id: f.fallback || f.id, fallbackOf: f.id };
    }
    return { mode: 'steady', token: f.token, id: f.id };
  }

  /* ====================================================================================
   * 7. PEOPLE, ALERT NORMALISER, VIEW-MODEL (what a phone shows for one alert)
   * ==================================================================================== */
  var NEED_BUS = ['wheelchair', 'deaf', 'blind', 'elderly', 'child'];            // the 'needs' values of the bus 'citizen' message
  var PEOPLE = {}, PEOPLE_ORDER = ['ravi', 'huda', 'abu-salem', 'lina', 'yousef', 'guard'];
  function initPeople() {
    M.people().forEach(function (p) {
      var needs = [];
      [p.persona].concat(p.also || []).forEach(function (n) { if (NEED_BUS.indexOf(n) >= 0 && needs.indexOf(n) < 0) needs.push(n); });
      PEOPLE[p.id] = {
        id: p.id, simKey: p.simKey, name: p.name, role: p.role, persona: p.persona, also: p.also || [], lang: p.lang, room: p.room, story: p.story,
        tags: p.needs || [], needs: needs, resident: p.persona !== 'guard', cls: p.cls || null
      };
    });
  }
  var PERSONA_FLAGS = {};
  function initPersonaFlags() { M.personas().forEach(function (p) { PERSONA_FLAGS[p.id] = p; }); }

  function toNum(v, d) { v = typeof v === 'number' ? v : parseFloat(v); return isFinite(v) ? v : d; }
  function cleanText(o) {                                                // a {ar,en} object or a string from the bus → {ar,en} of plain strings
    if (o == null) return null;
    if (typeof o === 'string') return { ar: o, en: o };
    var out = {}; ['ar', 'en'].forEach(function (k) { if (typeof o[k] === 'string') out[k] = o[k].slice(0, 400); });
    if (!out.ar && !out.en) return null;
    if (!out.ar) out.ar = out.en; if (!out.en) out.en = out.ar;
    return out;
  }
  // a bus 'alert' / 'alert-update' message → a clean alert (or null). Nothing from the bus is trusted: numbers are clamped, strings are plain text.
  function normAlert(m) {
    if (!m || typeof m !== 'object') return null;
    var act = typeof m.action === 'string' ? M.byAction(m.action) : null;
    var hz = M.normalize.hazard(m.hazard) || (act && act.hazard);
    if (!hz) return null;
    var lv = M.normalize.level(m.level) || (act && act.level) || 'watch';
    var pts = [];
    (Array.isArray(m.route) ? m.route.slice(0, 400) : []).forEach(function (p) { if (Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1])) pts.push([+p[0], +p[1]]); });
    var pt = function (o) { return o && isFinite(+o.x) && isFinite(+o.y) ? { x: +o.x, y: +o.y } : null; };
    var safe = m.safe && pt(m.safe) ? { x: +m.safe.x, y: +m.safe.y, name: cleanText(m.safe.name) } : null;
    var wind = m.wind && isFinite(+m.wind.deg) ? { deg: ((+m.wind.deg % 360) + 360) % 360, speed: toNum(m.wind.speed, null) } : null;
    return {
      id: String(m.id == null ? 'A?' : m.id).slice(0, 40), hazard: hz, level: lv, action: typeof m.action === 'string' ? m.action : null,
      area: cleanText(m.area), at: pt(m.at) || pt(m.fire), wind: wind, you: pt(m.you), safe: safe, route: pts,
      distanceM: isFinite(+m.distanceM) ? Math.max(0, Math.round(+m.distanceM)) : null,
      bearingDeg: isFinite(+m.bearingDeg) ? ((+m.bearingDeg % 360) + 360) % 360 : null,
      etaMin: m.etaMin == null || !isFinite(+m.etaMin) ? null : Math.max(0, +m.etaMin),
      lang: typeof m.lang === 'string' ? M.normalize.lang(m.lang) : null, persona: typeof m.persona === 'string' ? m.persona : null,
      person: ['person', 'key', 'to', 'for'].map(function (k) { return typeof m[k] === 'string' ? m[k] : null; }).filter(Boolean)[0] || null,
      victim: typeof m.victim === 'string' ? m.victim : null, hour: isFinite(+m.hour) ? +m.hour : null,
      ts: isFinite(+m.ts) ? +m.ts : now(), demo: !!m.demo
    };
  }
  function normDispatch(m) {
    if (!m || typeof m !== 'object') return null;
    var units = (Array.isArray(m.units) ? m.units : []).slice(0, 8).map(function (u) {
      var kind = ['fire', 'ambulance', 'police', 'rescue', 'hazmat'].indexOf(u && u.kind) >= 0 ? u.kind : null;
      if (!kind) return null;
      return { kind: kind, name: cleanText(u.name), etaMin: isFinite(+u.etaMin) ? Math.max(0, +u.etaMin) : null, status: typeof u.status === 'string' ? u.status : 'dispatched', why: cleanText(u.why) };
    }).filter(Boolean);
    var hosp = m.hospital && isFinite(+m.hospital.etaMin) ? { name: cleanText(m.hospital.name), etaMin: +m.hospital.etaMin } : null;
    return { id: String(m.id || 'D?').slice(0, 40), units: units, hospital: hosp, state: typeof m.state === 'string' ? m.state : null, origin: m.origin === 'ordinary' ? 'ordinary' : 'manara', ts: isFinite(+m.ts) ? +m.ts : now() };
  }
  function ambulanceMin(disp) {
    var u = disp && disp.units.filter(function (x) { return x.kind === 'ambulance' && x.etaMin != null && x.status !== 'recommended'; })[0];
    return u ? Math.max(1, Math.round(u.etaMin)) : null;
  }

  // Which role does this phone play in this alert? self | victim | guard | volunteer | none
  function roleOf(phone, A) {
    var p = phone.p;
    if (A.hazard !== 'sos') return p.persona === 'guard' ? 'guard' : 'self';
    if (p.persona === 'guard') return 'guard';
    var victim = A.victim || (A.action === 'sos.victim' && A.person) || 'abu-salem';
    if (A.person === p.id && A.action === 'sos.volunteer') return 'volunteer';
    return p.id === victim ? 'victim' : 'none';
  }
  // the language this phone shows: the global override, else the person's own language
  function shownLang(phone) {
    if (phone.langPick) return phone.langPick;
    if (SET.langMode !== 'own') return SET.langMode;
    return phone.p.lang;
  }
  function turnVars(A) {
    var ft = A.route && A.route.length > 2 ? firstTurn(A.route) : null;
    return ft ? { turn: ft.turn, steps: Math.max(1, Math.round(ft.meters / 0.7)) } : null;
  }

  // The view-model: everything a phone needs to draw one alert. Never throws; returns { none:true } for a phone the alert is not for.
  function compose(phone) {
    var st = phone.st; if (!st) return null;
    var A = st.A, role = roleOf(phone, A);
    if (role === 'none') return { none: true, role: role, A: A };
    var level = st.allClear ? 'all-clear' : A.level;
    var p = phone.p, persona = role === 'guard' ? 'guard' : role === 'volunteer' ? 'volunteer' : p.persona;
    var asleep = !!(st.asleep && role !== 'guard' && role !== 'volunteer');
    var lang = shownLang(phone);
    var vars = {};
    var victimRoom = PEOPLE[A.victim || 'abu-salem'] ? PEOPLE[A.victim || 'abu-salem'].room : null;
    if (role === 'guard' && A.hazard === 'sos' && victimRoom) vars.room = victimRoom;
    if (role === 'victim') { var n = ambulanceMin(phone.disp || st.disp); if (n) vars.n = n; }
    var msg = M.get({ hazard: A.hazard, level: level, persona: persona, needs: persona === p.persona && p.also.length ? p.also : undefined, asleep: asleep, lang: lang, vars: vars, also: true });
    if (!msg) return { none: true, role: role, A: A, error: true };
    var served = msg.lang, dir = msg.dir;
    var V = {
      role: role, A: A, level: level, hazard: A.hazard, msg: msg, lang: served, dir: dir, asleep: asleep, tone: msg.tone,
      headline: msg.headline, lines: msg.lines, more: msg.more, pics: msg.pictograms, draft: msg.draft, fallback: msg.fallback, also: msg.also || null,
      formats: msg.formats, vib: msg.vibration, voice: msg.voice, wake: msg.wake, sources: msg.sources, id: msg.key
    };
    // the ladder only climbs for a sleeper at a level whose cell is a ladder (evacuate for fire, smoke, gas, flood)
    V.ladder = !!(asleep && msg.wake && msg.wake.mode === 'ladder' && msg.wake.appliesToThisPerson && level === 'evacuate' && msg.wake.steps && msg.wake.steps.length === 4);
    V.softWake = !!(asleep && msg.wake && msg.wake.appliesToThisPerson && !V.ladder && (level === 'evacuate' || level === 'warning'));
    // blind-resident route guidance (turn + steps from the live route), spoken after the main script
    V.guide = null;
    if (V.voice && (PERSONA_FLAGS[persona] && persona === 'blind' || (p.also || []).indexOf('blind') >= 0)) {
      var tv = turnVars(A);
      if (tv && A.safe && A.safe.name && level === 'evacuate') {
        var g = M.text('v.blind.turn', served, { turn: tv.turn, steps: tv.steps, exit: A.safe.name });
        if (g) { V.guide = g; V.voice = Object.assign({}, V.voice, { text: V.voice.text + '. ' + g.replace(/\s+/g, ' ') }); }
      }
    }
    return V;
  }

  /* ====================================================================================
   * 8. ROUTE MAP + COMPASS (SVG drawn from the bus route; north-up; every colour is a token via CSS classes)
   * ==================================================================================== */
  function flameMini(x, y, s) {
    return sv('path', { class: 'rm-flame', transform: 'translate(' + (x - 12 * s) + ' ' + (y - 12 * s) + ') scale(' + s + ')', d: 'M12 22c4 0 7-2.7 7-6.7 0-3.6-2.6-6-4.2-8.3-.4 1.8-1.3 3-2.8 3.6C12.6 7.3 11 4.3 8.5 2c.3 3.4-3.5 6.2-3.5 10.8C5 19 8 22 12 22z' });
  }
  function routeMap(A, lang) {
    var W = 260, H = 150, P = 20, pl = chromeLang(lang);
    var pts = A.route.slice();
    var bag = pts.slice();
    if (A.you) bag.push([A.you.x, A.you.y]);
    if (A.safe) bag.push([A.safe.x, A.safe.y]);
    var hdist = A.at && A.you ? Math.hypot(A.at.x - A.you.x, A.at.y - A.you.y) : null;
    var hazNear = hdist != null && hdist > 5 && hdist <= 34;      // closer than ~25 m is usually the same building: a flat plan cannot show floors, so no marker
    if (A.at && (hazNear || !bag.length)) bag.push([A.at.x, A.at.y]);
    if (!bag.length) return null;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    bag.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    var spanX = Math.max(x1 - x0, 9), spanY = Math.max(y1 - y0, 6);
    var sc = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var X = function (x) { return num1(W / 2 + (x - cx) * sc); }, Y = function (y) { return num1(H / 2 + (y - cy) * sc); };
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rm', role: 'img', 'aria-label': fill(PT('al.map.alt', lang), { place: A.safe && A.safe.name ? pickL(A.safe.name, pl) : '—' }), focusable: 'false' });
    svg.appendChild(sv('rect', { class: 'rm-bg', x: 0, y: 0, width: W, height: H, rx: 12 }));
    // 25 m grid (5 cells)
    var gx0 = Math.floor((cx - W / 2 / sc) / 5) * 5, gy0 = Math.floor((cy - H / 2 / sc) / 5) * 5;
    for (var gx = gx0; gx < cx + W / 2 / sc; gx += 5) svg.appendChild(sv('line', { class: 'rm-grid', x1: X(gx), y1: 0, x2: X(gx), y2: H }));
    for (var gy = gy0; gy < cy + H / 2 / sc; gy += 5) svg.appendChild(sv('line', { class: 'rm-grid', x1: 0, y1: Y(gy), x2: W, y2: Y(gy) }));
    // hazard
    if (A.at && hazNear) {
      svg.appendChild(sv('circle', { class: 'rm-halo', cx: X(A.at.x), cy: Y(A.at.y), r: Math.min(26, Math.max(11, 2 * sc)) }));
      svg.appendChild(flameMini(X(A.at.x), Y(A.at.y), 1));
    }
    // route: line + direction chevrons
    if (pts.length > 1) {
      svg.appendChild(sv('polyline', { class: 'rm-route', points: pts.map(function (q) { return X(q[0]) + ',' + Y(q[1]); }).join(' ') }));
      var acc = 0, next = 22;
      for (var i = 1; i < pts.length; i++) {
        var ax = X(pts[i - 1][0]), ay = Y(pts[i - 1][1]), bx = X(pts[i][0]), by = Y(pts[i][1]), L = Math.hypot(bx - ax, by - ay);
        while (acc + L >= next && L > 0) {
          var t = (next - acc) / L, mx = ax + (bx - ax) * t, my = ay + (by - ay) * t, ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
          svg.appendChild(sv('path', { class: 'rm-chev', d: 'M-4 -4L3 0L-4 4z', transform: 'translate(' + num1(mx) + ' ' + num1(my) + ') rotate(' + num1(ang) + ')' }));
          next += 34;
        }
        acc += L;
      }
    }
    var lbl = function (x, y, text, cls, anchor) { var el = sv('text', { class: 'rm-t ' + cls, x: num1(x), y: num1(Math.max(12, Math.min(H - 5, y))), 'text-anchor': anchor || 'middle' }); el.textContent = text; return el; };
    // destination
    if (A.safe) {
      var sx = X(A.safe.x), sy = Y(A.safe.y);
      svg.appendChild(sv('circle', { class: 'rm-dest', cx: sx, cy: sy, r: 7 }));
      svg.appendChild(sv('path', { class: 'rm-destk', d: 'M' + (sx - 3) + ' ' + sy + 'l2.5 3 4.5-6', fill: 'none' }));
      var youBelow = A.you && A.you.y > A.safe.y;
      svg.appendChild(lbl(Math.max(34, Math.min(W - 34, sx)), youBelow ? sy - 13 : sy + 21, PT('al.route.dest', lang), 'rm-dl'));
    }
    // you
    var yp = A.you || (pts.length ? { x: pts[0][0], y: pts[0][1] } : null);
    if (yp) {
      var yx = X(yp.x), yy = Y(yp.y);
      svg.appendChild(sv('circle', { class: 'rm-you-r', cx: yx, cy: yy, r: 10 }));
      svg.appendChild(sv('circle', { class: 'rm-you', cx: yx, cy: yy, r: 5 }));
      var destAbove = A.safe && A.safe.y < yp.y;
      svg.appendChild(lbl(Math.max(24, Math.min(W - 24, yx)), destAbove ? yy + 23 : yy - 14, PT('al.route.you', lang), 'rm-yl'));
    }
    // scale bar (25 m = 5 cells) and north
    var bar = 5 * sc;
    svg.appendChild(sv('line', { class: 'rm-scale', x1: 12, y1: H - 12, x2: num1(12 + bar), y2: H - 12 }));
    var sl = lbl(12 + bar / 2, H - 16, '25 m', 'rm-sl'); sl.setAttribute('direction', 'ltr'); sl.setAttribute('style', 'unicode-bidi:isolate'); svg.appendChild(sl);
    svg.appendChild(sv('path', { class: 'rm-north', d: 'M' + (W - 16) + ' 30V12M' + (W - 21) + ' 17L' + (W - 16) + ' 11L' + (W - 11) + ' 17' }));
    svg.appendChild(lbl(W - 16, 42, lang === 'ar' ? 'ش' : 'N', 'rm-nl'));
    return svg;
  }
  function compassSVG(A, lang) {
    var pl = chromeLang(lang), C = 60, R = 42;
    var svg = sv('svg', { viewBox: '0 0 120 120', class: 'cp', role: 'img', focusable: 'false', 'aria-label': '' });
    var pos = function (deg, r) { var a = deg * Math.PI / 180; return [num1(C + r * Math.sin(a)), num1(C - r * Math.cos(a))]; };
    svg.appendChild(sv('circle', { class: 'cp-ring', cx: C, cy: C, r: R }));
    for (var d = 0; d < 360; d += 45) { var a = pos(d, R), b = pos(d, R - (d % 90 === 0 ? 7 : 4)); svg.appendChild(sv('line', { class: 'cp-tick', x1: a[0], y1: a[1], x2: b[0], y2: b[1] })); }
    var letters = pl === 'ar' ? ['ش', 'ق', 'ج', 'غ'] : ['N', 'E', 'S', 'W'];
    [0, 90, 180, 270].forEach(function (deg, i) { var p = pos(deg, R + 11); var t = sv('text', { class: 'cp-t' + (i === 0 ? ' cp-n' : ''), x: p[0], y: p[1] + 4, 'text-anchor': 'middle' }); t.textContent = letters[i]; svg.appendChild(t); });
    var heading = A.route && A.route.length > 1 ? routeHeading(A.route) : null;
    if (heading != null) {
      var tip = pos(heading, R - 10), tail = pos(heading + 180, 8), l1 = pos(heading + 150, 14), l2 = pos(heading - 150, 14);
      svg.appendChild(sv('path', { class: 'cp-go', d: 'M' + tail[0] + ' ' + tail[1] + 'L' + tip[0] + ' ' + tip[1] }));
      svg.appendChild(sv('path', { class: 'cp-goh', d: 'M' + tip[0] + ' ' + tip[1] + 'L' + (num1(tip[0] + (l1[0] - C) * 0.55)) + ' ' + (num1(tip[1] + (l1[1] - C) * 0.55)) + 'L' + (num1(tip[0] + (l2[0] - C) * 0.55)) + ' ' + (num1(tip[1] + (l2[1] - C) * 0.55)) + 'z' }));
    }
    if (A.bearingDeg != null) {
      var hp = pos(A.bearingDeg, R);
      svg.appendChild(sv('circle', { class: 'cp-haz', cx: hp[0], cy: hp[1], r: 7 }));
      var ex = sv('text', { class: 'cp-hz', x: hp[0], y: hp[1] + 3.5, 'text-anchor': 'middle' }); ex.textContent = '!'; svg.appendChild(ex);
    }
    if (A.wind) {
      var wp = pos(A.wind.deg, R + 2), wi = pos(A.wind.deg, R - 14);
      svg.appendChild(sv('path', { class: 'cp-wind', d: 'M' + wp[0] + ' ' + wp[1] + 'L' + wi[0] + ' ' + wi[1] }));
      var h1 = pos(A.wind.deg + 18, R - 8), h2 = pos(A.wind.deg - 18, R - 8);
      svg.appendChild(sv('path', { class: 'cp-wind', d: 'M' + wi[0] + ' ' + wi[1] + 'L' + h1[0] + ' ' + h1[1] + 'M' + wi[0] + ' ' + wi[1] + 'L' + h2[0] + ' ' + h2[1] }));
    }
    var dirTxt = A.bearingDeg != null ? compassWord(A.bearingDeg, pl) : '', windTxt = A.wind ? compassWord(A.wind.deg, pl) : '';
    svg.setAttribute('aria-label', A.bearingDeg != null ? fill(PT('al.compass.alt', lang), { dir: dirTxt, wind: windTxt || '—' }) : (windTxt ? fill(PT('al.route.wind_from', lang), { dir: windTxt }) : ''));
    return svg;
  }

  /* ====================================================================================
   * 9. THE PHONE — state, DOM shell, and one builder per card
   * ==================================================================================== */
  var App = { mode: 'wall', phones: {}, solo: 'ravi', audible: 'ravi', live: { last: 0, count: 0, via: '' }, demo: null, nb: { state: 'idle', data: null, err: null, at: 0 }, seq: 0 };
  var KIND_ICON = { fire: 'fire', ambulance: 'heart', police: 'shield', rescue: 'users', hazmat: 'alert' };

  function Phone(p) {
    this.p = p; this.id = p.id; this.st = null; this.disp = null; this.V = null;
    this.checkin = null; this.needsSel = p.needs.slice(); this.langPick = null;
    this.ui = { more: false, also: null, why: false, drone: false, needs: false, call: false, vibShake: false };
    this.lad = { on: false, t0: 0, step: 0, stopped: null, shown: -1 };
    this.light = { timer: null, lit: false, plan: null };
    this.resp = {}; this.el = {}; this.bootAt = now();
    this.voiceState = 'idle';
    this.pressing = false; this.pressAt = 0; this.dirty = false;            // a finger / key is down on this phone: do not rebuild its screen under it
    this.dispSig = null;
  }
  function isBigText(phone) { var f = PERSONA_FLAGS[phone.p.persona] || {}; return SET.big || !!f.largeText || phone.p.also.some(function (x) { return (PERSONA_FLAGS[x] || {}).largeText; }); }

  function phoneShell(phone) {
    var p = phone.p, e = phone.el;
    var name = pickL(p.name, Mn.lang());
    e.status = h('div', { class: 'p-status', 'aria-hidden': 'true' }, [
      e.clock = h('span', { class: 'p-clock num', text: '--:--' }),
      e.ex = h('span', { class: 'p-ex', text: '' }),
      e.ind = h('span', { class: 'p-ind' })
    ]);
    e.scroll = h('div', { class: 'p-scroll', tabindex: '0', role: 'region' });
    e.actions = h('div', { class: 'p-actions' });
    e.flash = h('div', { class: 'p-flash', 'aria-hidden': 'true' });
    e.screen = h('div', { class: 'p-screen' }, [e.status, e.scroll, e.actions, e.flash]);
    e.phone = h('div', { class: 'phone', role: 'group' }, [h('span', { class: 'p-notch', 'aria-hidden': 'true' }), e.screen]);
    e.cap = h('header', { class: 'pcap' });
    e.story = h('p', { class: 'pstory' });
    e.root = h('article', { class: 'pcell', data: { phone: p.id, state: 'idle' } }, [e.cap, e.phone, e.story]);
    // A tap is down → the screen must not be rebuilt until it is up, or the button under the finger vanishes and the tap is lost
    // (Mission Control repeats its alert about every 2 s). Released in releasePress(); a watchdog in ladderTick() covers lost events.
    var hold = function () { phone.pressing = true; phone.pressAt = now(); };
    e.root.addEventListener('pointerdown', hold, true);
    e.root.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') hold(); }, true);
    renderCaption(phone);
  }
  function personTags(p, ml) {                                         // language (+ draft flag) and needs of one person, as tag nodes
    var L = M.languages().filter(function (x) { return x.id === p.lang; })[0];
    var tags = [h('span', { class: 'tag cool', text: (L ? L.name.native : p.lang) + (L && L.name.en !== L.name.native ? ' · ' + L.name.en : '') })];
    if (L && L.draft) tags.push(h('span', { class: 'tag warn', text: T('al.tag.draft') }));
    (p.tags || []).forEach(function (t) {
      if (t === 'asleep-at-night') tags.push(h('span', { class: 'tag', text: T('al.tag.asleep') }));
      else if (M.has('hc.need.' + t)) tags.push(h('span', { class: 'tag', text: MT('hc.need.' + t, ml) }));
    });
    return tags;
  }
  function renderCaption(phone) {
    var p = phone.p, e = phone.el, ml = Mn.lang();
    empty(e.cap);
    e.cap.appendChild(h('div', { class: 'pcap-t' }, [h('h3', { text: pickL(p.name, ml) }), h('span', { class: 'pcap-r', text: pickL(p.role, ml) + (p.room ? ' · ' + T('al.act.room', { r: p.room }) : '') })]));
    e.cap.appendChild(h('div', { class: 'chips pcap-tags' }, personTags(p, ml)));
    e.story.textContent = pickL(p.story, ml);
    e.phone.setAttribute('aria-label', fill(ml === 'ar' ? 'هاتف {n}' : "{n}'s phone", { n: pickL(p.name, ml) }));
  }

  /* ---------- small builders ---------- */
  function card(cls, title, kids, attrs) {
    return h('section', Object.assign({ class: 'al-card ' + cls }, attrs || {}), [title ? h('h3', { class: 'al-card-h', text: title }) : null].concat(kids));
  }
  function langTag(V) { return { lang: V.lang, dir: V.dir }; }
  function tonePic(id) { return h('span', { class: 'ico-pic' }, [picto(id)]); }

  function buildHead(phone, V) {
    var A = V.A, pl = chromeLang(V.lang);
    var hz = M.hazards().filter(function (x) { return x.id === V.hazard; })[0];
    var lvl = M.levels().filter(function (x) { return x.id === V.level; })[0];
    var lvName = V.level === 'warning' ? (pl === 'ar' ? 'ابقَ في مكانك' : 'Stay in place') : (lvl ? lvl.name[pl] : '');
    return h('div', { class: 'al-head tone-' + V.tone, data: { tone: V.tone } }, [
      h('div', { class: 'al-head-top' }, [
        h('span', { class: 'al-hz' }, [picto(hz ? hz.pic : 'st-warn')]),
        h('div', { class: 'al-tags' }, [
          h('span', { class: 'tag ' + (V.tone === 'safe' ? 'safe' : V.tone === 'info' ? 'info' : V.tone === 'warn' ? 'warn' : 'danger'), text: lvName }),
          h('span', { class: 'tag cool', text: (hz ? hz.name[pl] : '') }),
          h('span', { class: 'tag info al-extag', title: MT('ui.alert.exercise', pl), text: PT('al.p.exercise', pl) }),
          A.demo ? h('span', { class: 'tag', title: MT('ui.alert.sim', pl), text: PT('al.p.sim', pl) }) : null
        ])
      ]),
      h('h2', Object.assign({ class: 'al-title', id: 'ttl-' + phone.id }, langTag(V)), [V.headline]),
      h('p', { class: 'al-sub' }, [
        A.area ? h('span', {}, [MT('ui.alert.area', pl) + ': ' + pickL(A.area, pl)]) : null
      ])
    ]);
  }
  function buildExBar(V) {
    var pl = chromeLang(V.lang);
    return h('div', { class: 'al-exbar', role: 'note' }, [h('b', { text: PT('al.p.exercise', V.lang) }), h('span', { text: MT('ui.alert.exercise', pl) })]);
  }
  function buildDraftBanner(V) {
    var pl = chromeLang(V.lang);
    return h('div', { class: 'al-draft', role: 'note' }, [
      h('b', { lang: 'ar', dir: 'rtl', text: MT('ui.alert.draft', 'ar') }),
      h('b', { lang: 'en', dir: 'ltr', text: MT('ui.alert.draft', 'en') }),
      h('span', { text: MT('ui.alert.draft_note', pl) })
    ]);
  }
  function buildPics(V) {
    var pl = chromeLang(V.lang);
    return h('ul', { class: 'pics', role: 'list', 'aria-label': pl === 'ar' ? 'بطاقات مصوّرة' : 'Picture cards' }, V.pics.map(function (x) {
      return h('li', { class: 'pic' }, [h('span', { class: 'pic-svg' }, [picto(x.id)]), h('span', { class: 'pic-cap', text: x.label })]);
    }));
  }
  function buildLines(phone, V) {
    var pl = chromeLang(V.lang), ls = V.lines, kids = [];
    var ol = h('ol', Object.assign({ class: 'al-lines' }, langTag(V)), ls.map(function (t) { return h('li', { lang: V.lang, dir: V.dir, text: t }); }));
    kids.push(ol);
    var tools = [];
    if (V.more.length) {
      tools.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-expanded': phone.ui.more ? 'true' : 'false', data: { fid: 'more', act: 'more' },
        text: MT(phone.ui.more ? 'ui.alert.less' : 'ui.alert.more', pl) }));
    }
    if (V.voice && Voice.supported()) {
      tools.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', data: { fid: 'read', act: 'read' }, 'aria-pressed': phone.voiceState === 'speaking' ? 'true' : 'false' },
        [icon('speaker'), h('span', { text: MT(phone.voiceState === 'speaking' ? 'ui.alert.stop_voice' : 'ui.alert.read_aloud', pl) })]));
    }
    if (tools.length) kids.push(h('div', { class: 'al-tools' }, tools));
    if (phone.ui.more && V.more.length) kids.push(h('ul', Object.assign({ class: 'al-more' }, langTag(V)), V.more.map(function (t) { return h('li', { lang: V.lang, dir: V.dir, text: t }); })));
    if (V.voice && !Voice.supported()) kids.push(h('p', { class: 'al-note', text: PT('al.set.voice_na', V.lang) }));
    if (phone.voiceNote) kids.push(h('p', { class: 'al-note', role: 'status', text: phone.voiceNote }));
    return h('div', { class: 'al-body' }, kids);
  }
  function buildLangBar(phone, V) {
    var pl = chromeLang(V.lang), own = phone.p.lang, opts = [];
    if (own !== 'ar' && own !== 'en') opts.push(own);
    opts.push('ar'); opts.push('en');
    var shown = V.lang, kids = [];
    kids.push(h('div', { class: 'chips al-langs', role: 'group', 'aria-label': PT('al.lang.chips', V.lang) }, opts.map(function (l) {
      var info = M.languages().filter(function (x) { return x.id === l; })[0];
      return h('button', { class: 'chip', type: 'button', 'aria-pressed': shown === l ? 'true' : 'false', data: { fid: 'lang-' + l, act: 'lang', v: l }, text: info ? info.name.native : l });
    })));
    if (V.fallback) kids.push(h('p', { class: 'al-note', text: PT('al.p.nolang', V.lang) }));
    // a draft language is ALWAYS shown with Arabic and English (the pictures carry the same message)
    var alsoOpen = V.draft ? (phone.ui.also !== false) : (phone.ui.also === true);
    if (V.also && (V.draft || phone.ui.also != null)) {
      var also = h('div', { class: 'al-also', 'aria-label': MT('ui.alert.also', pl) }, [h('h4', { text: MT('ui.alert.also', pl) })]);
      ['ar', 'en'].forEach(function (l) {
        var x = V.also[l]; if (!x) return;
        also.appendChild(h('div', { class: 'al-also-l', lang: l, dir: l === 'ar' ? 'rtl' : 'ltr' }, [
          h('b', { text: x.headline }), h('ul', {}, x.lines.map(function (t) { return h('li', { text: t }); }))
        ]));
      });
      if (alsoOpen || V.draft) kids.push(also);
    }
    return h('div', { class: 'al-langbar' }, kids);
  }
  function buildFormats(phone, V) {
    var pl = chromeLang(V.lang), f = V.formats, plan = lightPlan(V.msg), kids = [];
    var hasSound = f.indexOf('sound') >= 0;
    var cell = function (k, label, val, cls) { return h('li', { class: 'fmt ' + (cls || '') }, [h('span', { class: 'fmt-k', text: label }), h('span', { class: 'fmt-v', text: val })]); };
    var vib = M.vibration(V.vib.id), vibName = vib ? vib.name[pl] : '';
    var lightName = plan.mode === 'off' ? PT('al.fmt.voice_off', V.lang) : (M.flash(plan.id) ? M.flash(plan.id).name[pl] : plan.id);
    var voiceMode = !V.voice ? PT('al.fmt.voice_off', V.lang) : (V.voice.auto ? PT('al.fmt.voice_auto', V.lang) : PT('al.fmt.voice_tap', V.lang));
    var strip = h('span', { class: 'hap', 'aria-hidden': 'true' }, V.vib.pattern.map(function (ms, i) { return h('i', { class: i % 2 === 0 ? 'on' : 'off', style: 'flex-grow:' + ms }); }));
    var list = h('ul', { class: 'al-fmt-l' }, [
      cell('sound', PT('al.fmt.sound', V.lang), hasSound ? PT('al.fmt.sound_on', V.lang) : PT('al.fmt.sound_off', V.lang), hasSound ? '' : 'na'),
      h('li', { class: 'fmt' }, [h('span', { class: 'fmt-k', text: PT('al.fmt.vib', V.lang) }), h('span', { class: 'fmt-v', text: vibName }), strip]),
      cell('light', PT('al.fmt.light', V.lang), lightName, plan.mode === 'off' ? 'na' : ''),
      cell('voice', PT('al.fmt.voice', V.lang), voiceMode, V.voice ? '' : 'na')
    ]);
    kids.push(list);
    if (!hasSound) kids.push(h('p', { class: 'al-note', text: PT('al.p.nosound', V.lang) }));
    if (App.mode === 'wall' && (hasSound || V.voice)) {
      kids.push(App.audible === phone.id
        ? h('p', { class: 'al-note hearing', text: PT('al.p.hearing', V.lang) })
        : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', data: { fid: 'hear', act: 'hear' } }, [icon('speaker'), h('span', { text: PT('al.p.hear', V.lang) })]));
    }
    if (V.msg.flash && V.msg.flash.kind === 'flash') kids.push(h('p', { class: 'al-note', text: SET.reduced ? MT('ui.alert.reduced_motion', pl) : (SET.strobe ? PT('al.set.strobe_state_on', V.lang) : PT('al.set.strobe_state_off', V.lang)) }));
    return card('al-formats', PT('al.p.fmt', V.lang), kids);
  }
  function buildResponders(phone, V) {
    var pl = chromeLang(V.lang), d = phone.disp;
    var rows = [];
    if (d) {
      d.units.forEach(function (u) {
        if (u.status === 'recommended') return;                                    // a resident never sees an unapproved recommendation
        var mins = u.etaMin != null ? Math.max(1, Math.round(u.etaMin)) : undefined, rec = phone.resp[u.kind] || (phone.resp[u.kind] = { min: mins, at: 0 });
        if (mins != null && rec.min != null && mins > rec.min) rec.at = now();
        rec.min = mins;
        var line = M.dispatch.resident({ kind: u.kind, state: u.status, n: mins, lang: V.lang, update: rec.at && now() - rec.at < 30000 });
        if (line) rows.push({ u: u, line: line });
      });
    }
    var kids = [];
    if (!rows.length) kids.push(h('p', { class: 'al-note', text: PT('al.resp.none', V.lang) }));
    rows.forEach(function (r, i) {
      kids.push(h('div', { class: 'resp-row', data: { kind: r.u.kind } }, [
        h('span', { class: 'resp-ico' }, [icon(KIND_ICON[r.u.kind] || 'alert')]),
        h('div', { class: 'resp-t' }, [
          h('b', Object.assign({}, langTag(V), { text: r.line })),
          r.u.name ? h('small', { text: pickL(r.u.name, pl) }) : null
        ]),
        h('span', { class: 'tag cool', text: PT('al.p.sim', V.lang) })
      ]));
    });
    if (d && d.hospital && (V.hazard === 'heat' || V.hazard === 'sos') && V.role !== 'guard') {
      kids.push(h('div', { class: 'resp-row', data: { kind: 'hospital' } }, [
        h('span', { class: 'resp-ico' }, [icon('pin')]),
        h('div', { class: 'resp-t' }, [h('b', { text: PT('al.resp.hospital', V.lang) + ': ' + pickL(d.hospital.name, pl) + ' · ' + M.fmtMinutes(d.hospital.etaMin, pl) })]),
        h('span', { class: 'tag cool', text: PT('al.p.sim', V.lang) })
      ]));
    }
    var whyRows = rows.filter(function (r) { return r.u.why; });
    if (whyRows.length) {
      kids.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-expanded': phone.ui.why ? 'true' : 'false', data: { fid: 'why', act: 'why' }, text: phone.ui.why ? PT('al.resp.why_hide', V.lang) : PT('al.resp.why', V.lang) }));
      if (phone.ui.why) {
        kids.push(h('div', { class: 'resp-why' }, [h('p', { text: PT('al.resp.fastest', V.lang) })].concat(whyRows.map(function (r) { return h('p', { class: 'resp-why-l' }, [h('b', { text: M.dispatch.unit(r.u.kind, pl) + ': ' }), pickL(r.u.why, pl)]); }))));
      }
    }
    if (V.hazard === 'sos' && V.role === 'victim') kids.push(h('p', { class: 'al-note', text: MT('r.stay', V.lang) }));
    kids.push(h('p', { class: 'al-note small', text: MT('ui.alert.responders_sim', pl) + ' ' + MT('r.999', pl) }));
    return card('al-resp', MT('ui.alert.responders', pl), kids, { 'aria-live': 'polite', data: { section: 'responders' } });
  }
  function buildRoute(phone, V) {
    var A = V.A, lang = V.lang, pl = chromeLang(lang), kids = [];
    var geo = A.you || A.route.length || A.bearingDeg != null || A.wind;
    var moving = V.level === 'evacuate' && A.route.length > 1;
    if (!geo) return card('al-route', MT('ui.alert.route', pl), [h('p', { class: 'al-note', text: MT('ui.alert.na', pl) })]);
    if (moving) {
      var map = routeMap(A, lang);
      if (map) kids.push(h('div', { class: 'rt-map' }, [map]));
      if (A.safe && A.safe.name) kids.push(h('p', { class: 'rt-to' }, [icon('route'), h('b', { text: MT('ui.alert.route_to', pl, { place: pickL(A.safe.name, pl) }) })]));
      kids.push(h('p', { class: 'al-note small', text: fill(PT('al.route.len', lang), { m: Math.round(routeLengthM(A.route)) }) + ' · ' + PT('al.route.north', lang) + ' · ' + PT('al.route.sim', lang) }));
    } else if (V.level === 'evacuate' || V.level === 'warning' || V.level === 'watch') {
      kids.push(h('p', { class: 'rt-stay' }, [icon('pin'), h('b', { text: MT('ui.alert.no_route', pl) })]));
    }
    if (A.bearingDeg != null || A.wind) {
      var meta = h('div', { class: 'rt-meta' });
      if (A.distanceM != null && A.bearingDeg != null) meta.appendChild(h('p', {}, [h('b', { text: MT('ui.alert.distance', pl, { m: A.distanceM }) }), ' ', fill(PT('al.route.towards', lang), { dir: compassWord(A.bearingDeg, pl) })]));
      if (A.wind) meta.appendChild(h('p', { class: 'muted' }, [MT('ui.alert.wind', pl) + ': ' + fill(PT('al.route.wind_from', lang), { dir: compassWord(A.wind.deg, pl) }) + (A.wind.speed != null ? ' · ' + A.wind.speed + (pl === 'ar' ? ' م/ث' : ' m/s') : '')]));
      if (A.etaMin != null && V.hazard === 'dust') meta.appendChild(h('p', { class: 'rt-eta' }, [icon('clock'), h('b', { text: MT('ui.alert.eta_front', pl, { mins: A.etaMin }) })]));
      kids.push(h('div', { class: 'rt-cp' }, [h('div', { class: 'cp-wrap' }, [compassSVG(A, lang)]), meta]));
    }
    return card('al-route', MT('ui.alert.route', pl), kids);
  }
  function buildDrone(phone, V) {
    var pl = chromeLang(V.lang), dr = M.drone(pl), open = phone.ui.drone;
    var kids = [
      h('div', { class: 'dr-top' }, [
        h('span', { class: 'dr-ico', 'aria-hidden': 'true' }, [picto('dr-light'), h('i', { class: 'dr-flash' })]),
        h('div', {}, [h('b', { text: PT('al.drone.title', V.lang) }), h('p', { text: PT('al.drone.follow', V.lang) + ' ' + PT('al.drone.licensed', V.lang) })])
      ]),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-expanded': open ? 'true' : 'false', data: { fid: 'drone', act: 'drone' }, text: open ? PT('al.drone.hide', V.lang) : PT('al.drone.show', V.lang) })
    ];
    if (open) kids.push(h('div', { class: 'dr-more' }, [h('p', { text: dr.description }), h('p', { text: dr.meaning }), h('p', { class: 'al-note small', text: dr.note + ' ' + dr.safe })]));
    return card('al-drone', null, kids);
  }
  function buildLadder(phone, V) {
    var pl = chromeLang(V.lang), steps = V.wake.steps, L = phone.lad, kids = [];
    var cur = Math.max(0, Math.min(3, L.step | 0));
    var ol = h('ol', { class: 'lad-steps' }, steps.map(function (s, i) {
      var st = L.stopped != null && i > L.stopStep ? 'off' : i < cur ? 'done' : i === cur ? (L.stopped ? 'stop' : 'now') : 'next';
      return h('li', { class: 'lad-s is-' + st, 'aria-current': i === cur && !L.stopped ? 'step' : null, data: { step: i } }, [
        h('span', { class: 'lad-t num', text: '+' + s.tSec + (pl === 'ar' ? ' ث' : ' s') }),
        h('span', { class: 'lad-l', text: PT('al.ladder.short' + i, V.lang) })
      ]);
    }));
    kids.push(ol);
    var s = steps[cur] || steps[0];
    kids.push(h('div', Object.assign({ class: 'lad-now' }, langTag(V)), [h('b', { text: s.title }), h('p', { text: L.stopped ? MT('x.ladder.stop', V.lang) : s.text })]));
    if (cur >= 2 && s.guardText && !L.stopped) kids.push(h('p', { class: 'al-note small', text: MT('x.ladder.2.g', pl) }));
    kids.push(h('p', { class: 'lad-meta' }, [
      h('span', { class: 'lad-el' }, [PT('al.ladder.elapsed', V.lang) + ' ', h('b', { class: 'num lad-clock', text: Mn.clock(L.elapsed || 0) })]),
      ' · ',
      h('span', { text: L.stopped ? fill(PT('al.ladder.stopped', V.lang), { n: L.stopStep }) : PT('al.ladder.climb', V.lang) })
    ]));
    if (SET.speed !== 1) kids.push(h('p', { class: 'al-note small', text: fill(PT('al.ladder.fast', V.lang), { n: SET.speed }) }));
    return card('al-ladder ' + (L.stopped ? 'is-stopped' : 'is-live'), MT('ui.alert.ladder', pl), kids, { data: { section: 'ladder', step: cur } });
  }
  function buildGate(phone, V) {
    return h('div', { class: 'al-gate', role: 'group' }, [
      h('button', { class: 'btn btn-primary act-gate', type: 'button', data: { fid: 'gate', act: 'enable' } }, [icon('bell'), h('span', { text: PT('al.p.gate', V.lang) })]),
      h('p', { text: PT('al.p.gate_sub', V.lang) })
    ]);
  }
  function buildVoiceCard(phone, V) {                                   // the blind-resident voice flow: the script, big Repeat / Stop, honest voice status
    var pl = chromeLang(V.lang), speaking = phone.voiceState === 'speaking';
    var kids = [
      h('p', { class: 'al-note', text: PT('al.blind.desc', V.lang) }),
      h('h4', { text: PT('al.blind.script', V.lang) }),
      h('blockquote', Object.assign({ class: 'bl-script' }, langTag(V)), [V.voice.text]),
      h('div', { class: 'bl-btns' }, [
        h('button', { class: 'btn btn-cool act-big', type: 'button', data: { fid: 'repeat', act: 'read' } }, [icon('speaker'), h('span', { text: PT(speaking ? 'al.blind.stop' : 'al.blind.repeat', V.lang) })])
      ])
    ];
    kids.push(h('p', { class: 'al-note', role: 'status', text: speaking ? PT('al.blind.speaking', V.lang) : (phone.voiceNote || '') }));
    return card('al-voice', PT('al.blind.title', V.lang), kids);
  }
  function buildGuard(phone, V) {                                       // the building-guard view: the room list from the phones on this page
    var pl = chromeLang(V.lang), rows = [];
    Object.keys(App.phones).forEach(function (id) {
      var q = App.phones[id]; if (!q.p.resident || q.p.id === 'yousef') return;
      var status = q.checkin === 'safe' ? 'safe' : q.checkin === 'help' ? 'help' : (q.lad.stopped || (q.st && !q.lad.on)) && q.st ? 'awake' : 'wait';
      var needsScore = (q.p.needs.indexOf('wheelchair') >= 0 ? 4 : 0) + (q.p.needs.indexOf('deaf') >= 0 ? 3 : 0) + (q.p.needs.indexOf('blind') >= 0 ? 3 : 0) + (q.p.needs.indexOf('child') >= 0 ? 2 : 0) + (q.p.needs.indexOf('elderly') >= 0 ? 1 : 0);
      var order = status === 'help' ? 0 : status === 'safe' ? 9 : 5 - needsScore / 10;
      rows.push({ q: q, status: status, order: order - needsScore * 0.01 });
    });
    rows.sort(function (a, b) { return a.order - b.order; });
    var label = { safe: MT('c.status.safe', pl), help: MT('c.status.help', pl), awake: PT('al.guard.status.awake', V.lang), wait: PT('al.guard.status.noreply', V.lang) };
    var list = h('ul', { class: 'gd-list' }, rows.map(function (r) {
      return h('li', { class: 'gd-row is-' + r.status, data: { room: r.q.p.room, status: r.status } }, [
        h('b', { class: 'num gd-room', text: r.q.p.room || '' }),
        h('span', { class: 'gd-n', text: pickL(r.q.p.name, pl) }),
        h('span', { class: 'gd-need' }, r.q.p.needs.map(function (n) { return h('span', { class: 'tag', text: MT('hc.need.' + n, pl) }); })),
        h('span', { class: 'tag ' + (r.status === 'safe' ? 'safe' : r.status === 'help' ? 'danger' : r.status === 'awake' ? 'info' : 'warn'), text: label[r.status] })
      ]);
    }));
    var kids = [h('p', { class: 'al-note', text: PT('al.guard.sub', V.lang) }), list];
    var anyStep2 = rows.some(function (r) { return r.q.lad.on && !r.q.lad.stopped && r.q.lad.step >= 2; });
    if (anyStep2) kids.push(h('p', { class: 'al-note', role: 'status', text: MT('x.ladder.2.g', pl) }));
    return card('al-guard', PT('al.guard.title', V.lang), kids, { 'aria-live': 'polite' });
  }
  function buildNearby(phone, V) {
    var pl = chromeLang(V.lang), nb = App.nb, kids = [];
    kids.push(h('p', { text: MT('ui.nearby.intro', pl) }));
    kids.push(h('p', { class: 'al-note small', text: MT('ui.nearby.consent', pl) }));
    if (nb.state === 'idle' || nb.state === 'error' || nb.state === 'denied' || nb.state === 'offline' || nb.state === 'unsupported') {
      kids.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', data: { fid: 'nb-go', act: 'nearby' } }, [icon('pin'), h('span', { text: MT('ui.nearby.button', pl) })]));
    }
    if (nb.state === 'loading') kids.push(h('p', { class: 'al-note', role: 'status', 'aria-busy': 'true', text: MT('ui.nearby.loading', pl) }));
    if (nb.state === 'offline') kids.push(h('p', { class: 'al-note warn', role: 'status', text: MT('ui.nearby.offline', pl) }));
    if (nb.state === 'denied') kids.push(h('p', { class: 'al-note warn', role: 'status', text: MT('ui.nearby.denied', pl) }));
    if (nb.state === 'unsupported') kids.push(h('p', { class: 'al-note warn', role: 'status', text: PT('al.nb.unsupported', V.lang) }));
    if (nb.state === 'error') kids.push(h('p', { class: 'al-note warn', role: 'status', text: MT('ui.nearby.failed', pl) }));
    if (nb.state === 'done' && nb.data) {
      var list = h('ul', { class: 'nb-list' }, FACILITY_KINDS.map(function (k) {
        var f = nb.data[k.id];
        return h('li', { class: 'nb-row', data: { kind: k.id } }, [
          h('span', { class: 'nb-k', text: MT(k.ui, pl) }),
          f ? h('span', { class: 'nb-v' }, [h('b', { text: facilityName(f, pl) || '—' }), h('small', { text: fill(PT('al.nb.here', V.lang), { d: formatDistance(f.distM, pl), dir: compassWord(f.bearingDeg, pl) }) })])
            : h('span', { class: 'nb-v muted', text: MT('ui.nearby.none', pl, { km: 15 }) })
        ]);
      }));
      kids.push(list);
      kids.push(h('p', { class: 'al-note small', text: PT('al.nb.straight', V.lang) + ' ' + MT('ui.nearby.incomplete', pl) }));
      kids.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', data: { fid: 'nb-clear', act: 'nearby-clear' }, text: PT('al.nb.clear', V.lang) }));
    }
    // tap-to-call 999 is a two-step action: this is an exercise page and a stray tap must not dial the emergency number
    if (nb.state === 'done' || phone.ui.call) {
      if (!phone.ui.call) kids.push(h('button', { class: 'btn btn-danger btn-sm', type: 'button', data: { fid: 'call', act: 'call' } }, [icon('phone'), h('span', { text: PT('al.nb.call', V.lang) })]));
      else kids.push(h('div', { class: 'nb-call', role: 'group' }, [
        h('p', { text: PT('al.nb.call_warn', V.lang) }),
        h('a', { class: 'btn btn-danger btn-sm', href: 'tel:999', data: { fid: 'call-open' }, text: PT('al.nb.call_open', V.lang) }),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', data: { fid: 'call-cancel', act: 'call-cancel' }, text: PT('al.nb.cancel', V.lang) })
      ]));
    }
    kids.push(h('p', { class: 'nb-label' }, [h('b', { text: PT('al.nb.label', V.lang) })]));
    kids.push(h('p', { class: 'al-note small' }, [h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener noreferrer', text: PT('al.nb.osm', V.lang) }), ' · ' + MT('ui.nearby.not_dispatch', pl)]));
    return card('al-nb', MT('ui.nearby.title', pl), kids, { data: { section: 'nearby', state: nb.state } });
  }
  function buildSources(V) {
    var pl = chromeLang(V.lang), kids = [];
    if (V.sources && V.sources.length) kids.push(h('p', { class: 'al-src' }, [h('b', { text: PT('al.sources', V.lang) + ': ' }), V.sources.map(function (s) { return s.id + ' ' + s.label; }).join(' · ')]));
    kids.push(h('p', { class: 'al-src', text: endSentence(MT('ui.alert.exercise', pl)) + ' ' + endSentence(MT('ui.alert.tone_note', pl)) + ' ' + endSentence(MT('ui.alert.reviewed', pl)) }));
    return h('div', { class: 'al-srcs' }, kids);
  }

  /* ---------- the check-in bar: two huge buttons ("I'm safe" / "I need help"), "I'm awake" for the ladder, need chips ---------- */
  function bigLabel(id, own) {
    var seen = {}, sub = [];
    ['ar', 'en'].forEach(function (l) { if (l !== own && !seen[l]) { seen[l] = 1; sub.push(MT(id, l)); } });
    return { main: MT(id, own), sub: sub.join(' · ') };
  }
  function buildActions(phone, V) {
    var box = phone.el.actions, L = V.lang, pl = chromeLang(L);
    empty(box);
    box.setAttribute('lang', L); box.setAttribute('dir', V.dir);
    if (V.role === 'guard') { box.hidden = true; return; }
    box.hidden = false;
    var mk = function (cls, id, act, sub) {
      var b = bigLabel(id, L);
      return h('button', { class: 'act-big ' + cls, type: 'button', data: { fid: act, act: act } }, [h('span', { class: 'act-main', text: b.main }), h('span', { class: 'act-sub', text: sub || b.sub })]);
    };
    if (V.level === 'all-clear') {
      box.appendChild(h('button', { class: 'act-big act-ok', type: 'button', data: { fid: 'dismiss', act: 'dismiss' } }, [h('span', { class: 'act-main', text: MT('c.got_it', L) }), h('span', { class: 'act-sub', text: MT('h.' + V.hazard + '.clear', L) })]));
      return;
    }
    if (phone.checkin === 'safe') {
      box.appendChild(h('div', { class: 'act-done is-safe', role: 'status' }, [h('span', { class: 'act-tick' }, [picto('st-ok')]), h('div', {}, [h('b', { text: MT('c.counted', L) }), h('small', { text: T('al.act.safe_sub') })]),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', data: { fid: 'undo', act: 'undo' }, text: MT('c.undo', L) })]));
      return;
    }
    if (phone.checkin === 'help') {
      box.appendChild(h('div', { class: 'act-done is-help', role: 'status' }, [h('span', { class: 'act-tick' }, [picto('act-help-coming')]), h('div', {}, [h('b', { text: MT('c.help_sent', L) })]),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', data: { fid: 'undo', act: 'undo' }, text: MT('c.undo', L) })]));
      return;
    }
    // a sleeper's first job is to wake up: "I'm awake" leads, "I need help" stays reachable, "I'm safe" comes once the ladder has stopped
    if (V.ladder && phone.lad.on && !phone.lad.stopped) {
      box.appendChild(mk('act-awake', 'c.awake', 'awake'));
      box.appendChild(mk('act-help act-help-solo', 'c.help', 'help'));
      return;
    }
    // need chips (optional, collapsed)
    var sel = phone.needsSel;
    var needsBtn = h('button', { class: 'act-needs-t', type: 'button', 'aria-expanded': phone.ui.needs ? 'true' : 'false', data: { fid: 'needs', act: 'needs' } }, [
      h('span', { text: PT('al.act.needs', L) + (sel.length ? ': ' + sel.map(function (n) { return MT('hc.need.' + n, L); }).join(', ') : '') })]);
    box.appendChild(needsBtn);
    if (phone.ui.needs) box.appendChild(h('div', { class: 'chips act-needs', role: 'group', 'aria-label': PT('al.act.needs', L) }, NEED_BUS.map(function (n) {
      return h('button', { class: 'chip', type: 'button', 'aria-pressed': sel.indexOf(n) >= 0 ? 'true' : 'false', data: { fid: 'need-' + n, act: 'need', v: n }, text: MT('hc.need.' + n, L) });
    })));
    // long labels (Malayalam, Nepali, …) get full-width buttons; short ones sit side by side
    var stack = L !== 'ar' && L !== 'en' || Math.max(MT('c.safe', L).length, MT('c.help', L).length) > 15;
    box.appendChild(h('div', { class: 'act-pair' + (stack ? ' is-stack' : '') }, [mk('act-safe', 'c.safe', 'safe'), mk('act-help', 'c.help', 'help')]));
  }

  /* ---------- the idle screen ---------- */
  function buildIdle(phone) {
    var lang = Mn.lang(), pl = lang, dir = lang === 'ar' ? 'rtl' : 'ltr';       // an idle phone has no alert yet: it shows the page's language
    var kids = [h('div', { class: 'idle', lang: lang, dir: dir }, [
      h('span', { class: 'idle-logo', 'aria-hidden': 'true' }, [svgNode(Mn.logo(54).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))]),
      h('h2', { text: PT('al.p.noalert', lang) }),
      h('p', { text: PT('al.p.ready', lang) }),
      h('p', { class: 'idle-wait', text: PT('al.p.wait', lang) })
    ])];
    var tries = h('div', { class: 'idle-try' }, [h('b', { text: PT('al.p.try', lang) })]);
    var row = h('div', { class: 'chips' });
    ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'].forEach(function (hz) {
      var info = M.hazards().filter(function (x) { return x.id === hz; })[0];
      row.appendChild(h('button', { class: 'chip', type: 'button', data: { fid: 'try-' + hz, act: 'try', v: hz } }, [icon(info.icon), h('span', { text: info.name[pl] })]));
    });
    tries.appendChild(row); kids.push(tries);
    return kids;
  }

  /* ---------- render one phone ---------- */
  function renderPhone(phone) {
    if (phone.pressing) { phone.dirty = true; return; }                       // flushed by releasePress()
    var e = phone.el, sc = e.scroll, keep = sc.scrollTop, ae = D.activeElement, fid = null;
    if (ae && e.root.contains(ae)) fid = ae.getAttribute('data-fid');
    var V = phone.st ? compose(phone) : null;
    phone.V = V && !V.none ? V : null;
    var lang = V && !V.none ? V.lang : Mn.lang();
    var dir = V && !V.none ? V.dir : (lang === 'ar' ? 'rtl' : 'ltr');
    var name = pickL(phone.p.name, Mn.lang());
    sc.setAttribute('aria-label', fill(Mn.lang() === 'ar' ? 'شاشة هاتف {n}' : "{n}'s phone screen", { n: name }));
    e.screen.setAttribute('lang', lang); e.screen.setAttribute('dir', dir);
    e.screen.classList.toggle('big', isBigText(phone)); e.screen.classList.toggle('hc', SET.hc);
    e.root.classList.toggle('is-audible', App.audible === phone.id);
    empty(sc);
    e.ex.textContent = ''; e.ex.hidden = true;
    if (!V || V.none) {
      var idleKids = buildIdle(phone);
      if (V && V.none) {
        idleKids[0].insertBefore(h('p', { class: 'idle-wait', role: 'status', text: Mn.lang() === 'ar' ? 'هذا الخطر لا يخصّ هذا الهاتف: نداء النجدة يصل المتطوعين المدرَّبين القريبين وحارس المبنى فقط.' : 'This alert is not for this phone: an SOS goes only to nearby trained volunteers and the building guard.' }), idleKids[0].children[3]);
      }
      idleKids.forEach(function (k) { sc.appendChild(k); });
      e.root.setAttribute('data-state', 'idle'); e.screen.className = 'p-screen' + (isBigText(phone) ? ' big' : '') + (SET.hc ? ' hc' : '');
      empty(e.actions); e.actions.hidden = true;
      phone.light.plan = null; applyLight(phone);
      e.ind.textContent = '';
      sc.scrollTop = 0;
      return;
    }
    var st = V.level === 'all-clear' ? 'clear' : phone.checkin === 'safe' ? 'safe' : phone.checkin === 'help' ? 'help' : 'alert';
    e.root.setAttribute('data-state', st);
    e.screen.className = 'p-screen tone-' + V.tone + (isBigText(phone) ? ' big' : '') + (SET.hc ? ' hc' : '') + (V.role === 'guard' ? ' is-guard' : '') + (V.voice && phone.p.persona === 'blind' ? ' is-voice' : '');
    e.ex.hidden = true;
    var sec = [];
    if (needsGate(phone, V)) sec.push(buildGate(phone, V));
    sec.push(buildHead(phone, V));
    if (V.draft) sec.push(buildDraftBanner(V));
    if (V.role === 'guard') {
      sec.push(buildPics(V)); sec.push(buildLines(phone, V)); sec.push(buildGuard(phone, V));
    } else {
      sec.push(buildPics(V)); sec.push(buildLines(phone, V));
      if (V.voice && phone.p.persona === 'blind') sec.push(buildVoiceCard(phone, V));
      sec.push(buildLangBar(phone, V));
      if (V.ladder) { e.ladderBox = buildLadder(phone, V); sec.push(e.ladderBox); } else if (V.softWake) sec.push(h('p', { class: 'al-note', text: PT('al.ladder.mode_soft', V.lang) }));
      if (V.level !== 'all-clear') { sec.push(buildRoute(phone, V)); sec.push(buildResponders(phone, V)); }
      sec.push(buildFormats(phone, V));
      if (V.level !== 'all-clear') { sec.push(buildDrone(phone, V)); sec.push(buildNearby(phone, V)); }
    }
    sec.push(buildSources(V));
    sec.forEach(function (n) { sc.appendChild(n); });
    buildActions(phone, V);
    renderIndicators(phone, V);
    sc.scrollTop = keep;
    if (fid) { var back = $('[data-fid="' + fid + '"]', e.root); if (back) { try { back.focus({ preventScroll: true }); } catch (x) { back.focus(); } } }
    phone.light.plan = lightPlan(V.msg); applyLight(phone, V);
  }
  function needsGate(phone, V) {
    if (V.level === 'all-clear' || V.role === 'guard') return false;
    if (Aud.state().enabled) return false;
    if (App.audible !== phone.id) return false;
    return V.formats.indexOf('sound') >= 0 || V.formats.indexOf('vibration') >= 0 || !!(V.voice && V.voice.auto);
  }
  function renderIndicators(phone, V) {
    var e = phone.el, f = V.formats, ind = e.ind;
    empty(ind);
    var item = function (name, on) { return h('span', { class: 'ind' + (on ? ' on' : '') }, [icon(name)]); };
    ind.appendChild(item('speaker', f.indexOf('sound') >= 0 && App.audible === phone.id && !SET.muted));
    ind.appendChild(item('phone', V.vib.pattern.length > 0));
    ind.appendChild(item('sun', lightPlan(V.msg).mode !== 'off'));
  }
  function updateClocks() {
    var t = new Date();
    Object.keys(App.phones).forEach(function (id) {
      var phone = App.phones[id], el = phone.el.clock; if (!el) return;
      var txt;
      if (phone.st && phone.st.demo) {
        var base = (phone.st.asleep ? 4 : 10.5) * 3600, sec = Math.floor((now() - phone.st.startedAt) / 1000) + base;
        txt = pad2(Math.floor(sec / 3600) % 24) + ':' + pad2(Math.floor(sec / 60) % 60);
        el.title = T('al.clock_sim');
      } else { txt = pad2(t.getHours()) + ':' + pad2(t.getMinutes()); el.title = ''; }
      if (el.textContent !== txt) el.textContent = txt;
    });
  }

  /* ====================================================================================
   * 10. LIGHT, LADDER, AUDIO SYNC, CHECK-IN
   * ==================================================================================== */
  var LADDER_STEP = (M && M.ladderSpec && M.ladderSpec().stepSec) || 30;
  function say(text, urgent) {                                       // screen-reader announcements: assertive for new alerts, polite for the rest
    var live = $(urgent ? '#al-live' : '#al-status'); if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 30);
  }
  function applyLight(phone) {
    var e = phone.el, L = phone.light, plan = L.plan, f = e.flash;
    if (L.timer) { clearInterval(L.timer); L.timer = null; }
    L.lit = false; f.className = 'p-flash'; f.setAttribute('data-mode', 'off');
    if (!plan || plan.mode === 'off') return;
    f.style.setProperty('--fl', 'var(' + (plan.token || '--danger') + ')');
    var strong = phone.lad.on && !phone.lad.stopped && phone.lad.step >= 1;
    if (plan.mode === 'steady') { f.className = 'p-flash is-steady' + (strong ? ' is-strong' : ''); f.setAttribute('data-mode', 'steady'); return; }
    // a flash exists only when the viewer opted in and reduced motion is off; never faster than 3 per second (WCAG 2.3.1, S57)
    var on = Math.max(60, plan.onMs || 150), off = Math.max(60, plan.offMs || 250), period = Math.max(334, on + off);
    f.className = 'p-flash is-flash'; f.setAttribute('data-mode', 'flash');
    var pulse = function () { f.classList.add('lit'); L.lit = true; setTimeout(function () { f.classList.remove('lit'); L.lit = false; }, on); };
    pulse(); L.timer = setInterval(pulse, period);
  }
  function refreshLights() { Object.keys(App.phones).forEach(function (id) { var ph = App.phones[id]; ph.light.plan = ph.V ? lightPlan(ph.V.msg) : null; applyLight(ph); if (ph.V) renderIndicators(ph, ph.V); }); }

  function releasePress(delay) {                                              // the finger / key is up (the click, if any, has already run): flush a held-back screen
    setTimeout(function () {
      Object.keys(App.phones).forEach(function (id) {
        var ph = App.phones[id]; if (!ph.pressing) return;
        ph.pressing = false;
        if (ph.dirty) { ph.dirty = false; renderPhone(ph); }
      });
    }, delay == null ? 80 : delay);
  }
  function startLadder(phone) { var L = phone.lad; L.on = true; L.t0 = now(); L.step = 0; L.stopped = null; L.stopStep = 0; L.elapsed = 0; }
  function stopLadder(phone, why) { var L = phone.lad; if (!L.on || L.stopped) return; L.stopped = why; L.stopStep = L.step; }
  function ladderTick() {
    var changed = false;
    Object.keys(App.phones).forEach(function (id) { var ph = App.phones[id]; if (ph.pressing && now() - ph.pressAt > 2500) { ph.pressing = false; if (ph.dirty) { ph.dirty = false; renderPhone(ph); } } });   // watchdog: an event was lost
    Object.keys(App.phones).forEach(function (id) {
      var phone = App.phones[id], L = phone.lad;
      if (!L.on || L.stopped || !phone.V || !phone.V.ladder) return;
      var el = Math.max(0, (now() - L.t0) / 1000 * SET.speed); if (!isFinite(el)) el = 0;
      L.elapsed = el;
      var clk = $('.lad-clock', phone.el.root); if (clk) clk.textContent = Mn.clock(el);
      var step = Math.max(0, Math.min(3, Math.floor(el / LADDER_STEP)));
      if (el > 15 * 60) { stopLadder(phone, 'timeout'); changed = true; renderPhone(phone); return; }
      if (step !== L.step) { L.step = step; changed = true; renderPhone(phone); announceStep(phone, step); }
    });
    if (changed) { syncAudio(); refreshGuard(); }
  }
  function announceStep(phone, step) {
    var V = phone.V; if (!V || !V.wake.steps[step]) return;
    var s = V.wake.steps[step];
    say(pickL(phone.p.name, Mn.lang()) + ': ' + s.title + '. ' + s.text, false);
    if (App.audible === phone.id) Hap.buzz(s.vibration.pattern);
    shake(phone, s.vibration.pattern);
  }
  function refreshGuard() { var g = App.phones.guard; if (g && g.st && g.V) renderPhone(g); }
  function shake(phone, pattern) {                                      // a visible stand-in for vibration on a desktop; off under reduced motion
    if (SET.reduced || !pattern || !pattern.length) return;
    var total = pattern.reduce(function (a, b) { return a + b; }, 0);
    phone.el.phone.classList.add('is-vib');
    clearTimeout(phone.shakeT);
    phone.shakeT = setTimeout(function () { phone.el.phone.classList.remove('is-vib'); }, Math.min(total, 3000));
  }

  var lastAudioKey = '', lastVoiceKey = '';
  function desiredAudio() {
    var phone = App.phones[App.audible]; if (!phone || !phone.V || !phone.st) return null;
    var V = phone.V;
    if (V.level === 'all-clear') return 'clear';
    if (phone.checkin) return null;                                       // answered: the alerts stop
    if (V.formats.indexOf('sound') < 0) return null;
    if (V.ladder && phone.lad.on) return phone.lad.stopped ? null : (phone.lad.step === 0 ? 'wake' : 'wake2');
    if (phone.awakeAck) return null;
    if (V.hazard === 'sos' && V.level === 'evacuate') return V.role === 'victim' ? 'calm' : 'evac';
    return V.level === 'evacuate' ? 'evac' : V.level === 'warning' ? 'warn' : 'info';
  }
  function syncAudio(force) {
    var phone = App.phones[App.audible], want = desiredAudio();
    var key = want && phone && phone.st ? phone.id + '|' + phone.st.A.id + '|' + want + '|' + (phone.st.allClear ? 1 : 0) : '';
    if (!force && key === lastAudioKey) return;
    lastAudioKey = key;
    if (!want) { Aud.stop(); return; }
    Aud.play(want);
    var V = phone.V;
    if (key !== '' && V) {
      var wake = V.ladder && phone.lad.on ? V.wake.steps[Math.min(3, phone.lad.step)] : null;
      Hap.buzz(wake ? wake.vibration.pattern : V.vib.pattern);
      shake(phone, wake ? wake.vibration.pattern : V.vib.pattern);
      // a voice that reads on its own (blind, child, worker) starts after the first tone, only once the viewer has enabled alerts
      var vk = phone.id + '|' + phone.st.A.id + '|' + phone.st.A.level;
      if (V.voice && V.voice.auto && Aud.state().enabled && vk !== lastVoiceKey && V.level !== 'all-clear') {
        lastVoiceKey = vk;
        setTimeout(function () { if (phone.V && phone.V.voice && !phone.checkin) speakPhone(phone, true); }, V.ladder ? 3200 : 2600);
      }
    }
  }
  function speakPhone(phone, auto) {
    var V = phone.V; if (!V || !V.voice) return;
    if (phone.voiceState === 'speaking') { Voice.stop(); phone.voiceState = 'idle'; renderPhone(phone); return; }
    var r = Voice.speak(V.voice.text, V.voice, function () { phone.voiceState = 'idle'; renderPhone(phone); });
    if (r.ok) { phone.voiceState = 'speaking'; phone.voiceNote = ''; }
    else { phone.voiceState = 'idle'; phone.voiceNote = r.reason === 'no-voice' ? PT('al.blind.novoice', V.lang) : PT('al.set.voice_na', V.lang); }
    renderPhone(phone);
  }

  var CHECK_TXT = { ack: { ar: 'أنا مستيقظ', en: "I'm awake" }, safe: { ar: 'أنا بأمان', en: "I'm safe" }, help: { ar: 'أحتاج مساعدة', en: 'I need help' } };
  function sendCitizen(phone, status) {
    var m = { type: 'citizen', id: phone.st ? phone.st.A.id : 'none', status: status, needs: phone.needsSel.slice(), lang: phone.p.lang, room: phone.p.room || '' };
    if (phone.st && phone.st.demo) m.demo = true;                           // a demo alert never counts in a real headcount
    Mn.link.send(m);
    return m;
  }
  function checkin(phone, status) {
    if (!phone.st) return;
    if (status === 'ack') { phone.awakeAck = true; stopLadder(phone, 'awake'); }
    else if (status === 'safe') { phone.checkin = 'safe'; stopLadder(phone, 'safe'); }
    else if (status === 'help') { phone.checkin = 'help'; stopLadder(phone, 'help'); }
    var m = sendCitizen(phone, status);
    Mn.toast({ ar: T('al.act.sent') + ': ' + CHECK_TXT[status].ar + (phone.st.demo ? ' (' + (STR['al.p.sim'].ar) + ')' : '') + ' — ' + pickL(phone.p.name, 'ar'), en: T('al.act.sent') + ': ' + CHECK_TXT[status].en + (phone.st.demo ? ' (SIM)' : '') + ' — ' + pickL(phone.p.name, 'en') }, status === 'help' ? 'danger' : 'safe');
    renderPhone(phone); syncAudio(); refreshGuard();
    say(pickL(phone.p.name, Mn.lang()) + ': ' + CHECK_TXT[status][Mn.lang()], false);
    return m;
  }

  /* ====================================================================================
   * 11. NEARBY FACILITIES — consent tap → one geolocation fix → one Overpass query → parse → show. Nothing is stored.
   * ==================================================================================== */
  function nearbyGo() {
    var nb = App.nb;
    if (nb.state === 'loading') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { nb.state = 'offline'; rerenderAlerts(); return; }
    if (!navigator.geolocation) { nb.state = 'unsupported'; rerenderAlerts(); return; }
    nb.state = 'loading'; nb.data = null; rerenderAlerts();
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 14000);
      var body = 'data=' + encodeURIComponent(buildOverpassQuery(lat, lon, 15000));
      fetch(OVERPASS_URL, { method: 'POST', body: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl ? ctl.signal : undefined,
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', mode: 'cors' })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (json) { clearTimeout(timer); nb.data = parseOverpass(json, lat, lon); nb.state = 'done'; nb.at = now(); rerenderAlerts(); say(MT('ui.nearby.title', Mn.lang()), false); },
          function () { clearTimeout(timer); nb.state = navigator.onLine === false ? 'offline' : 'error'; rerenderAlerts(); });
      // the position is not kept anywhere: `lat` and `lon` live only in this closure until the lookup ends
    }, function (err) { nb.state = err && err.code === 1 ? 'denied' : 'error'; rerenderAlerts(); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  }
  function nearbyClear() { App.nb.state = 'idle'; App.nb.data = null; rerenderAlerts(); }
  function rerenderAlerts() { Object.keys(App.phones).forEach(function (id) { if (App.phones[id].st) renderPhone(App.phones[id]); }); }

  /* ====================================================================================
   * 12. DELIVERING ALERTS TO PHONES (bus + stand-alone demo)
   * ==================================================================================== */
  function isNight(A) { if (A.hour != null) return A.hour < 6 || A.hour >= 22; return SET.night; }
  function sigOf(o) { return JSON.stringify(o, function (k, v) { return k === 'ts' ? undefined : v; }); }       // content signature without the time of sending
  function deliver(phone, A) {
    var isNew = !phone.st || phone.st.A.id !== A.id, prev = phone.st && phone.st.A, sig = sigOf(A);
    if (!isNew && phone.st.sig === sig && !phone.st.allClear) return phone;      // an unchanged repeat from Mission Control: nothing to rebuild
    if (isNew) {
      phone.checkin = null; phone.awakeAck = false; phone.resp = {}; phone.voiceNote = ''; phone.voiceState = 'idle';
      phone.lad = { on: false, t0: 0, step: 0, stopped: null, shown: -1, elapsed: 0, stopStep: 0 };
      phone.ui.more = false; phone.ui.why = false; phone.ui.drone = false; phone.ui.call = false; phone.ui.also = null;
      phone.needsSel = phone.p.needs.slice();
      phone.st = { A: A, startedAt: now(), asleep: !!(phone.p.resident && isNight(A)), demo: A.demo, allClear: false, ts: A.ts, sig: sig };
    } else {
      var escalated = prev && A.level !== prev.level;
      phone.st.A = A; phone.st.allClear = false; phone.st.sig = sig;
      if (escalated) { phone.checkin = null; phone.awakeAck = false; phone.lad = { on: false, t0: 0, step: 0, stopped: null, shown: -1, elapsed: 0, stopStep: 0 }; }
    }
    renderPhone(phone);
    if (phone.V && phone.V.ladder && !phone.lad.on) { startLadder(phone); renderPhone(phone); }
    if (isNew && phone.V && App.mode && (App.mode === 'phone' ? App.solo === phone.id : true)) {
      if (App.mode === 'phone' || App.audible === phone.id || phone.p.id === 'ravi') say(pickL(phone.p.name, Mn.lang()) + ': ' + phone.V.headline + '. ' + phone.V.lines.join(' '), true);
    }
    return phone;
  }
  function clearAlertOn(phone, id) {
    if (!phone.st || (id && phone.st.A.id !== id)) return;
    phone.st.allClear = true; stopLadder(phone, 'clear'); phone.checkin = null;
    renderPhone(phone);
  }
  function resetPhones() {
    Object.keys(App.phones).forEach(function (id) {
      var ph = App.phones[id];
      ph.st = null; ph.V = null; ph.checkin = null; ph.awakeAck = false; ph.disp = null; ph.dispSig = null; ph.pressing = false; ph.dirty = false; ph.resp = {}; ph.voiceNote = ''; ph.voiceState = 'idle';
      ph.lad = { on: false, t0: 0, step: 0, stopped: null, shown: -1, elapsed: 0, stopStep: 0 };
      ph.ui = { more: false, also: null, why: false, drone: false, needs: false, call: false };
      renderPhone(ph);
    });
    Voice.stop(); Aud.stop(); lastAudioKey = ''; lastVoiceKey = '';
    App.nb = { state: 'idle', data: null, err: null, at: 0 };
    stopDemoSim();
    syncAudio(true);
  }
  function setDispatch(d) {
    var sig = sigOf(d);
    Object.keys(App.phones).forEach(function (id) { var ph = App.phones[id]; if (ph.dispSig === sig) return; ph.dispSig = sig; ph.disp = d; if (ph.st) renderPhone(ph); });
  }

  // ---- bus routing: a message with a person key goes to that phone; otherwise every phone gets the hazard + level, and the personal
  //      geometry (position, route, destination) goes to the phone that best matches the message's persona and language ----
  function geometryOwner(A) {
    var best = null, bs = -1;
    ['ravi', 'huda', 'abu-salem', 'lina'].forEach(function (id) {
      var ph = App.phones[id], p = ph.p, s = 0;
      if (A.lang && A.lang === p.lang) s += 2;
      if (A.persona === 'wheelchair' || A.persona === 'elderly') s += p.id === 'abu-salem' ? 2 : 0;
      else if (A.persona === 'child') s += p.id === 'lina' ? 2 : 0;
      else s += (p.id === 'ravi' || p.id === 'huda') ? 1 : 0;
      if (s > bs) { bs = s; best = ph; }
    });
    return best;
  }
  function stripGeometry(A) { var c = Object.assign({}, A); c.you = null; c.route = []; c.safe = null; c.distanceM = null; c.bearingDeg = null; return c; }
  function routeAlert(A) {
    var ids = Object.keys(App.phones);
    if (A.person) {
      var target = ids.filter(function (id) { var p = App.phones[id].p; return id === A.person || p.simKey === A.person || p.room === A.person; })[0];
      if (target) deliver(App.phones[target], A);
      return;
    }
    var owner = geometryOwner(A);
    ids.forEach(function (id) { deliver(App.phones[id], App.phones[id] === owner ? A : stripGeometry(A)); });
  }
  function onBus(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'alert' || m.type === 'alert-update') {
      var A = normAlert(m); if (!A) return;
      App.live.last = now(); App.live.count++; App.live.via = m.from || '';
      if (App.demo && App.demo.id !== A.id) stopDemoSim();
      routeAlert(A); updateLive();
    } else if (m.type === 'alert-clear') {
      App.live.last = now(); App.live.count++;
      Object.keys(App.phones).forEach(function (id) { clearAlertOn(App.phones[id], m.id != null ? String(m.id) : null); });
      syncAudio(); updateLive();
    } else if (m.type === 'dispatch') {
      var d = normDispatch(m); if (!d) return;
      App.live.last = now(); App.live.count++;
      setDispatch(d); updateLive();
    }
  }

  /* ====================================================================================
   * 13. STAND-ALONE DEMO — hazard × level, with geometry and responder times from ManaraSim (all SIM), local to this page
   * ==================================================================================== */
  var PRESET = { fire: 'fire-night', smoke: 'fire-night', gas: 'gas-night', flood: 'flood-day', dust: 'dust-day', heat: 'heat-day', sos: 'sos-day' };
  function buildSim(hazard) {
    if (!S || !S.create || !PRESET[hazard]) return null;
    try {
      var sim = S.create({ preset: PRESET[hazard], seed: 7 }), n = 0;
      while (!sim.alert && n < 4000) { S.step(sim, 1); n++; }
      return sim.alert ? sim : null;
    } catch (err) { return null; }
  }
  function simAlerts(sim) {
    var out = {};
    ['ravi', 'huda', 'abu-salem', 'lina'].forEach(function (k) { try { var a = S.busAlert(sim, k); if (a) out[k] = a; } catch (e) { /* ignore */ } });
    return out;
  }
  function stopDemoSim() { if (App.demo && App.demo.timer) clearInterval(App.demo.timer); App.demo = null; }
  function demoAlertFor(p, hazard, level, sa, id, night) {
    var base = sa && (sa[p.simKey] || sa.huda || sa['abu-salem']) || { type: 'alert' };
    var m = Object.assign({}, base, { type: 'alert', id: id, hazard: hazard, level: level, person: p.id, demo: true, lang: p.lang, hour: night ? 4 : 10.5,
      area: base.area || { ar: 'الحيّ التجريبي (محاكاة)', en: 'Demo district (simulation)' } });
    if (hazard === 'sos') m.action = p.id === 'abu-salem' ? 'sos.victim' : null;
    else delete m.action;
    var A = normAlert(m);
    if (!A) return null;
    A.victim = 'abu-salem';
    if (level !== 'evacuate') { A.route = []; A.safe = null; }                      // told to stay: no route
    else if (hazard === 'fire' && (p.persona === 'wheelchair') && A.safe) A.safe.name = { ar: M.pictogram('act-refuge', 'ar'), en: M.pictogram('act-refuge', 'en') };
    return A;
  }
  function demoStart(hazard, level, o) {
    o = o || {};
    if (!M.normalize.hazard(hazard)) return false;
    stopDemoSim(); lastAudioKey = ''; lastVoiceKey = '';
    var night = o.night != null ? !!o.night : SET.night;
    SET.night = night;
    var id = 'demo-' + hazard + '-' + (++App.seq), lv = M.normalize.level(level) || 'evacuate';
    var sim = buildSim(hazard), sa = sim ? simAlerts(sim) : null;
    Object.keys(App.phones).forEach(function (pid) {
      var ph = App.phones[pid], A = demoAlertFor(ph.p, hazard, lv, sa, id, night);
      if (A) deliver(ph, A);
    });
    var disp = sim && S.busDispatch ? normDispatch(S.busDispatch(sim)) : null;
    setDispatch(disp);
    if (sim) {
      App.demo = { id: id, sim: sim, hazard: hazard, level: lv, timer: null, ticks: 0 };
      App.demo.timer = setInterval(demoTick, 1000);
    }
    syncAudio(true);
    return true;
  }
  function demoTick() {
    var d = App.demo; if (!d || !d.sim) return;
    try {
      if (!d.sim.done) S.step(d.sim, 1);
      d.ticks++;
      if (d.ticks % 3 !== 0) return;
      var nd = S.busDispatch(d.sim);
      if (nd) { var norm = normDispatch(nd), prev = JSON.stringify(App.phones.ravi.disp && App.phones.ravi.disp.units.map(function (u) { return [u.kind, Math.round(u.etaMin || 0), u.status]; })); if (JSON.stringify(norm.units.map(function (u) { return [u.kind, Math.round(u.etaMin || 0), u.status]; })) !== prev) setDispatch(norm); }
    } catch (err) { stopDemoSim(); }
  }
  function demoClear() {
    var ids = Object.keys(App.phones), any = ids.some(function (id) { return App.phones[id].st; });
    if (!any) return;
    ids.forEach(function (id) { clearAlertOn(App.phones[id], null); });
    stopDemoSim(); syncAudio(true); Mn.toast({ ar: 'أُرسل «انتهى الخطر» إلى الهواتف', en: 'All-clear sent to the phones' }, 'safe');
  }

  /* ====================================================================================
   * 14. PAGE: modes (wall / one phone), controls, QR card, pictogram grid, live link
   * ==================================================================================== */
  var WALL_IDS = ['ravi', 'huda', 'abu-salem', 'lina'], MORE_IDS = ['yousef', 'guard'];
  function mount(id, where) { var ph = App.phones[id]; if (ph && where && ph.el.root.parentNode !== where) where.appendChild(ph.el.root); }
  function setMode(mode, personId) {
    App.mode = mode === 'phone' ? 'phone' : 'wall';
    if (personId && PEOPLE[personId]) App.solo = personId;
    var body = D.body;
    body.classList.toggle('m-wall', App.mode === 'wall'); body.classList.toggle('m-phone', App.mode === 'phone');
    var store = $('#al-store');
    Object.keys(App.phones).forEach(function (id) { mount(id, store); });
    if (App.mode === 'wall') {
      WALL_IDS.forEach(function (id) { mount(id, $('#wall')); });
      mount(App.more, $('#more-phone'));
      if (App.audible === 'ravi' || !App.phones[App.audible]) App.audible = 'ravi';
    } else {
      mount(App.solo, $('#solo-phone'));
      App.audible = App.solo;
    }
    $$('#al-modes [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === App.mode ? 'true' : 'false'); });
    $('#wall-sec').hidden = App.mode !== 'wall'; $('#more').hidden = App.mode !== 'wall'; $('#solo').hidden = App.mode !== 'phone';
    renderSoloInfo(); renderMoreInfo(); renderPickers();
    lastAudioKey = ''; rerenderAll(); syncAudio(true);
  }
  function renderPickers() {
    var sp = $('#solo-pick'); if (sp) { empty(sp); PEOPLE_ORDER.forEach(function (id) {
      var p = PEOPLE[id];
      sp.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': App.solo === id ? 'true' : 'false', data: { solo: id }, text: pickL(p.name, Mn.lang()) }));
    }); }
    var mp = $('#more-pick'); if (mp) { empty(mp); MORE_IDS.forEach(function (id) {
      var p = PEOPLE[id];
      mp.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': App.more === id ? 'true' : 'false', data: { more: id }, text: pickL(p.name, Mn.lang()) + ' — ' + (id === 'yousef' ? (Mn.lang() === 'ar' ? 'كفيف' : 'blind') : (Mn.lang() === 'ar' ? 'حارس المبنى' : 'building guard')) }));
    }); }
  }
  function renderSoloInfo() {
    var box = $('#solo-info'); if (!box) return; empty(box);
    var p = PEOPLE[App.solo], ml = Mn.lang(); if (!p) return;
    box.appendChild(h('h3', { text: pickL(p.name, ml) + ' — ' + pickL(p.role, ml) + (p.room ? ' · ' + T('al.act.room', { r: p.room }) : '') }));
    box.appendChild(h('div', { class: 'chips' }, personTags(p, ml)));
    box.appendChild(h('p', { text: pickL(p.story, ml) }));
    if (p.id === 'yousef') box.appendChild(h('p', { class: 'note', text: T('al.blind.desc') }));
    if (p.id === 'guard') box.appendChild(h('p', { class: 'note', text: T('al.guard.sub') }));
    // try every hazard on this one phone (stand-alone demo, same as the demo bar), and jump to the QR code for it
    var tries = h('div', { class: 'solo-try' }, [h('b', { text: T('al.solo.try') })]);
    var row = h('div', { class: 'chips' });
    ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'].forEach(function (hz) {
      var info = M.hazards().filter(function (x) { return x.id === hz; })[0];
      row.appendChild(h('button', { class: 'chip', type: 'button', data: { try: hz } }, [icon(info.icon), h('span', { text: info.name[ml] })]));
    });
    tries.appendChild(row);
    tries.appendChild(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', data: { soloqr: '1' } }, [icon('external'), h('span', { text: T('al.solo.qr') })]));
    box.appendChild(tries);
    box.appendChild(h('p', { class: 'muted small', text: T('al.qr.live') }));
  }
  function renderMoreInfo() {
    var box = $('#more-info'); if (!box) return; empty(box);
    var p = PEOPLE[App.more], ml = Mn.lang(); if (!p) return;
    box.appendChild(h('h3', { text: pickL(p.name, ml) + ' — ' + pickL(p.role, ml) }));
    box.appendChild(h('p', { text: pickL(p.story, ml) }));
    if (p.id === 'yousef') {
      box.appendChild(h('div', { class: 'note' }, [h('b', { text: T('al.blind.title') + '. ' }), T('al.blind.desc')]));
      box.appendChild(h('p', { class: 'muted small', text: Voice.supported() ? '' : T('al.set.voice_na') }));
    } else {
      box.appendChild(h('div', { class: 'note' }, [h('b', { text: T('al.guard.title') + '. ' }), T('al.guard.sub')]));
    }
  }
  function rerenderAll() {
    Object.keys(App.phones).forEach(function (id) { renderCaption(App.phones[id]); renderPhone(App.phones[id]); });
    updateClocks();
  }

  function updateLive() {
    var box = $('#al-link'); if (!box) return;
    var age = App.live.last ? Math.max(0, Math.round((now() - App.live.last) / 1000)) : null, live = age != null && age < 600;
    var txt = live ? T('al.link.live') + ' · ' + T('al.link.last', { s: age }) : T('al.link.demo');
    var dot = $('.dot', box), t = $('.al-link-t', box);
    if (t && t.textContent !== txt) t.textContent = txt;
    if (dot) dot.className = 'dot' + (live ? ' live' : '');
    box.setAttribute('data-live', live ? '1' : '0');
    box.title = T('al.link.bc');
  }

  function fillSelect(sel, items, value) {
    var cur = value != null ? value : sel.value;
    empty(sel); items.forEach(function (it) { sel.appendChild(h('option', { value: it[0], text: it[1] })); });
    if (cur != null && items.some(function (it) { return it[0] === cur; })) sel.value = cur;
  }
  function fillControls() {
    var ml = Mn.lang();
    fillSelect($('#demo-hazard'), ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'].map(function (id) { var x = M.hazards().filter(function (y) { return y.id === id; })[0]; return [id, x.long[ml]]; }));
    fillSelect($('#demo-level'), [['evacuate', T('al.lvl.evacuate')], ['warning', T('al.lvl.warning')], ['watch', T('al.lvl.watch')]]);
    fillSelect($('#demo-time'), [['night', T('al.demo.night')], ['day', T('al.demo.day')]], SET.night ? 'night' : 'day');
    fillSelect($('#demo-speed'), [['1', T('al.demo.speed1')], ['10', T('al.demo.speed10')]], String(SET.speed));
    // QR card
    fillSelect($('#qr-person'), PEOPLE_ORDER.map(function (id) { return [id, pickL(PEOPLE[id].name, ml) + ' — ' + pickL(PEOPLE[id].role, ml)]; }));
    var langs = [['own', T('al.set.lang_own')]].concat(M.languages().map(function (l) { return [l.id, l.name.native + (l.name.en !== l.name.native ? ' · ' + l.name.en : '') + (l.draft ? ' (' + T('al.tag.draft') + ')' : '')]; }));
    fillSelect($('#qr-lang'), langs);
    var lm = $('#set-langmode'); if (lm) { empty(lm); [['own', T('al.set.lang_own')], ['ar', 'العربية'], ['en', 'English']].forEach(function (x) {
      lm.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': SET.langMode === x[0] ? 'true' : 'false', data: { lm: x[0] }, text: x[1] }));
    }); }
  }
  function syncControls() {
    var st = Aud.state();
    var en = $('#set-enable'); if (en) { en.setAttribute('aria-pressed', st.enabled ? 'true' : 'false'); en.querySelector('span').textContent = st.enabled ? T('al.set.enabled') : T('al.set.enable'); en.classList.toggle('btn-primary', !st.enabled); en.classList.toggle('btn-ghost', st.enabled); }
    var note = $('#set-enable-note'); if (note) note.textContent = st.supported ? T('al.set.enable_note') : (Mn.lang() === 'ar' ? 'هذا المتصفح لا يدعم WebAudio: لن يصدر صوت.' : 'This browser has no WebAudio: no sound will play.');
    var vol = $('#set-vol'); if (vol && vol.value !== String(SET.vol)) vol.value = SET.vol;
    var vo = $('#set-vol-out'); if (vo) vo.textContent = SET.vol + '%';
    var mu = $('#set-mute'); if (mu) mu.checked = SET.muted;
    var big = $('#set-big'); if (big) big.checked = SET.big;
    var hc = $('#set-hc'); if (hc) hc.checked = SET.hc;
    var vn = $('#set-vib-note'); if (vn) vn.textContent = Hap.supported() ? T('al.set.vib_ok') : T('al.set.vib_na');
    var sb = $('#set-strobe'), ss = $('#set-strobe-state');
    if (sb) {
      sb.disabled = SET.reduced; sb.setAttribute('aria-pressed', SET.strobe ? 'true' : 'false');
      sb.querySelector('span').textContent = SET.strobe ? T('al.set.strobe_off') : MT('ui.alert.strobe_on', Mn.lang());
      sb.classList.toggle('btn-danger', SET.strobe);
    }
    if (ss) ss.textContent = SET.reduced ? MT('ui.alert.reduced_motion', Mn.lang()) : (SET.strobe ? T('al.set.strobe_state_on') : T('al.set.strobe_state_off'));
    var ab = $('#set-audible'); if (ab) { var ph = App.phones[App.audible]; ab.textContent = ph ? pickL(ph.p.name, Mn.lang()) : ''; }
    $$('#set-langmode [data-lm]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lm') === SET.langMode ? 'true' : 'false'); });
    var speed = $('#demo-speed'); if (speed && speed.value !== String(SET.speed)) speed.value = String(SET.speed);
    var tm = $('#demo-time'); if (tm) tm.value = SET.night ? 'night' : 'day';
    D.documentElement.setAttribute('data-strobe', SET.strobe ? 'on' : 'off');
  }
  function enableAlerts() {
    return Aud.enable().then(function (ok) {
      syncControls();
      if (desiredAudio()) { syncAudio(true); } else if (ok) Aud.play('ack');
      rerenderAlerts();
      return ok;
    });
  }

  /* ---- QR card ---- */
  function qrLink() {
    var base = ($('#qr-base').value || '').trim().split('#')[0].split('?')[0];
    var person = $('#qr-person').value, langSel = $('#qr-lang').value, lang = langSel === 'own' ? (PEOPLE[person] ? PEOPLE[person].lang : 'ar') : langSel;
    var q = ['persona=' + encodeURIComponent(person), 'lang=' + encodeURIComponent(lang)];
    if ($('#qr-start').checked) q.push('hazard=fire', 'level=evacuate', 'asleep=1');
    return base + '?' + q.join('&');
  }
  function drawQR() {
    var link = qrLink(), cv = $('#qr-canvas'), msg = $('#qr-msg'), out = $('#qr-link'), open = $('#qr-open');
    out.textContent = link; open.setAttribute('href', link);
    var q = QR.encode(link, { ec: 'M' });
    var file = /^file:/i.test(link);
    empty(msg);
    if (file) msg.appendChild(h('p', { class: 'note warn', text: T('al.qr.file') }));
    msg.appendChild(h('p', { class: 'muted small', text: T('al.qr.live') }));
    var ctx = cv.getContext && cv.getContext('2d');
    if (!q || !ctx) {
      cv.hidden = true;
      msg.insertBefore(h('p', { class: 'note danger', text: fill(T('al.qr.long'), { n: new TextEncoder().encode(link).length }) }), msg.firstChild);
      cv.setAttribute('data-ok', '0'); return;
    }
    cv.hidden = false;
    var quiet = 4, n = q.size + quiet * 2, scale = Math.max(3, Math.floor(260 / n)), dpr = Math.max(1, Math.round(root.devicePixelRatio || 1));
    cv.width = n * scale * dpr; cv.height = n * scale * dpr; cv.style.width = n * scale + 'px'; cv.style.height = n * scale + 'px';
    // a QR code must stay dark-on-light in every theme (scanners expect it), so these two colours are fixed on purpose
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#000000';
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.get(x, y)) ctx.fillRect((x + quiet) * scale * dpr, (y + quiet) * scale * dpr, scale * dpr, scale * dpr);
    cv.setAttribute('data-ok', '1'); cv.setAttribute('data-version', q.version); cv.setAttribute('data-ec', q.ec); cv.setAttribute('data-size', q.size);
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', fill(T('al.qr.alt'), { name: pickL((PEOPLE[$('#qr-person').value] || { name: { ar: '', en: '' } }).name, Mn.lang()) }));
    msg.appendChild(h('p', { class: 'muted small', text: 'QR v' + q.version + '-' + q.ec + ' · ' + q.bytes + ' B · ' + T('al.qr.info') }));
  }
  function copyLink() {
    var link = qrLink(), done = function () { Mn.toast({ ar: STR['al.qr.copied'].ar, en: STR['al.qr.copied'].en }, 'safe'); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(link).then(done, function () { selectLink(); }); return; } } catch (e) { /* fall through */ }
    selectLink();
  }
  function selectLink() { try { var r = D.createRange(); r.selectNodeContents($('#qr-link')); var s = root.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* ignore */ } }
  function downloadQR() {
    var cv = $('#qr-canvas'); if (!cv || cv.getAttribute('data-ok') !== '1') return;
    try { cv.toBlob(function (b) { if (!b) return; var a = h('a', { href: URL.createObjectURL(b), download: 'manara-phone-' + $('#qr-person').value + '.png' }); D.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }); } catch (e) { /* ignore */ }
  }

  /* ---- pictogram grid ---- */
  function renderPicGrid() {
    var g = $('#pic-grid'); if (!g) return; empty(g);
    var ml = Mn.lang(), all = M.pictograms();
    $('#pic-lead').textContent = fill(T('al.pic.lead'), { n: all.length });
    ['hazard', 'action', 'status', 'drone'].forEach(function (cat) {
      all.filter(function (x) { return x.cat === cat; }).forEach(function (x) {
        g.appendChild(h('li', { class: 'pg-i', data: { id: x.id, frame: PICT[x.id] ? PICT[x.id].f : '' } }, [h('span', { class: 'pg-svg' }, [picto(x.id)]), h('span', { class: 'pg-l', text: pickL(x.name, ml) }), h('code', { text: x.id })]));
      });
    });
  }

  /* ---- events ---- */
  function onAct(ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-act]') : null; if (!btn) return;
    var cell = btn.closest('[data-phone]'), phone = cell ? App.phones[cell.getAttribute('data-phone')] : null; if (!phone) return;
    var act = btn.getAttribute('data-act'), v = btn.getAttribute('data-v');
    phone.pressing = false; phone.dirty = false;                              // the click is the end of the press: this handler renders what it needs
    switch (act) {
      case 'enable': enableAlerts(); break;
      case 'safe': checkin(phone, 'safe'); break;
      case 'help': checkin(phone, 'help'); break;
      case 'awake': checkin(phone, 'ack'); break;
      case 'undo': phone.checkin = null; sendCitizen(phone, 'ack'); renderPhone(phone); syncAudio(); refreshGuard(); break;
      case 'dismiss': phone.st = null; phone.V = null; phone.checkin = null; renderPhone(phone); syncAudio(true); break;
      case 'need': { var i = phone.needsSel.indexOf(v); if (i >= 0) phone.needsSel.splice(i, 1); else phone.needsSel.push(v); renderPhone(phone); break; }
      case 'needs': phone.ui.needs = !phone.ui.needs; renderPhone(phone); break;
      case 'more': phone.ui.more = !phone.ui.more; renderPhone(phone); break;
      case 'why': phone.ui.why = !phone.ui.why; renderPhone(phone); break;
      case 'drone': phone.ui.drone = !phone.ui.drone; renderPhone(phone); break;
      case 'lang': phone.langPick = v; phone.ui.also = phone.ui.also === true ? true : null; renderPhone(phone); break;
      case 'read': speakPhone(phone, false); break;
      case 'try': demoStart(v, 'evacuate', { night: v === 'fire' || v === 'gas' }); syncControls(); break;
      case 'hear': App.audible = phone.id; lastAudioKey = ''; Object.keys(App.phones).forEach(function (id) { renderPhone(App.phones[id]); }); syncControls(); if (Aud.state().enabled) syncAudio(true); else enableAlerts(); break;
      case 'nearby': nearbyGo(); break;
      case 'nearby-clear': nearbyClear(); break;
      case 'call': phone.ui.call = true; renderPhone(phone); break;
      case 'call-cancel': phone.ui.call = false; renderPhone(phone); break;
    }
  }
  function bindControls() {
    var wrap = $('#al-root'); wrap.addEventListener('click', onAct);
    $('#demo-send').addEventListener('click', function () { demoStart($('#demo-hazard').value, $('#demo-level').value, { night: $('#demo-time').value === 'night' }); syncControls(); });
    $('#demo-ladder').addEventListener('click', function () {
      SET.speed = 10; SET.night = true; $('#demo-hazard').value = 'fire'; $('#demo-level').value = 'evacuate';
      demoStart('fire', 'evacuate', { night: true }); syncControls();
      var w = $('#wall'); if (w && App.mode === 'wall') w.scrollIntoView({ block: 'start', behavior: SET.reduced ? 'auto' : 'smooth' });
    });
    $('#demo-clear').addEventListener('click', demoClear);
    $('#demo-reset').addEventListener('click', function () { resetPhones(); syncControls(); });
    $('#demo-hazard').addEventListener('change', function () { var night = this.value === 'fire' || this.value === 'gas'; SET.night = night; $('#demo-time').value = night ? 'night' : 'day'; });
    $('#demo-time').addEventListener('change', function () { SET.night = this.value === 'night'; });
    $('#demo-speed').addEventListener('change', function () {
      var ns = parseInt(this.value, 10) || 1;
      Object.keys(App.phones).forEach(function (id) { var L = App.phones[id].lad; if (L.on && !L.stopped) L.t0 = now() - (L.elapsed || 0) / ns * 1000; });
      SET.speed = ns; rerenderAlerts();
    });
    $('#set-enable').addEventListener('click', enableAlerts);
    $('#set-vol').addEventListener('input', function () { SET.vol = parseInt(this.value, 10) || 0; saveSetting('vol'); Aud.applyVol(); syncControls(); });
    $('#set-mute').addEventListener('change', function () { SET.muted = this.checked; saveSetting('muted'); Aud.reapply(); if (SET.muted) Voice.stop(); syncControls(); Object.keys(App.phones).forEach(function (id) { if (App.phones[id].V) renderIndicators(App.phones[id], App.phones[id].V); }); });
    $('#set-test').addEventListener('click', function () { Aud.enable().then(function () { syncControls(); Aud.play('test'); setTimeout(function () { syncAudio(true); }, 2700); rerenderAlerts(); }); });
    $('#set-vtest').addEventListener('click', function () { Hap.buzz([200, 100, 200, 100, 400], true); syncControls(); });
    $('#set-big').addEventListener('change', function () { SET.big = this.checked; saveSetting('big'); rerenderAll(); });
    $('#set-hc').addEventListener('change', function () { SET.hc = this.checked; saveSetting('hc'); rerenderAll(); });
    $('#set-strobe').addEventListener('click', function () { if (SET.reduced) return; SET.strobe = !SET.strobe; syncControls(); refreshLights(); rerenderAlerts(); });
    $('#set-langmode').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-lm]'); if (!b) return;
      SET.langMode = b.getAttribute('data-lm'); saveSetting('langMode');
      Object.keys(App.phones).forEach(function (id) { App.phones[id].langPick = null; });
      syncControls(); rerenderAll();
    });
    $('#al-modes').addEventListener('click', function (ev) { var b = ev.target.closest('[data-mode]'); if (b) { setMode(b.getAttribute('data-mode')); syncControls(); } });
    $('#solo-pick').addEventListener('click', function (ev) { var b = ev.target.closest('[data-solo]'); if (!b) return; App.solo = b.getAttribute('data-solo'); Mn.store('manara-alert-persona', App.solo); setMode('phone'); try { history.replaceState(null, '', '?persona=' + encodeURIComponent(App.solo) + '&mode=phone'); } catch (e) { /* file:// quirks */ } syncControls(); });
    $('#solo-info').addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-try],[data-soloqr]') : null; if (!t) return;
      if (t.hasAttribute('data-try')) { var hz = t.getAttribute('data-try'); demoStart(hz, 'evacuate', { night: hz === 'fire' || hz === 'gas' }); syncControls(); }
      else { $('#qr-person').value = App.solo; drawQR(); $('#qr').scrollIntoView({ block: 'start', behavior: SET.reduced ? 'auto' : 'smooth' }); }
    });
    $('#more-pick').addEventListener('click', function (ev) { var b = ev.target.closest('[data-more]'); if (!b) return; App.more = b.getAttribute('data-more'); setMode('wall'); syncControls(); });
    ['qr-person', 'qr-lang', 'qr-base', 'qr-start'].forEach(function (id) { $('#' + id).addEventListener('input', drawQR); $('#' + id).addEventListener('change', drawQR); });
    $('#qr-copy').addEventListener('click', copyLink);
    $('#qr-dl').addEventListener('click', downloadQR);
  }

  /* ====================================================================================
   * 15. BOOT
   * ==================================================================================== */
  var started = false;
  function start() {
    if (started) return; started = true;
    var wall = $('#wall');
    if (!M || !Mn || !wall) { var p = $('#al-root'); if (p) p.appendChild(h('p', { class: 'note danger', text: 'MANARA_MSG / core.js did not load.' })); return; }
    Mn.strings(M.strings()); Mn.applyI18n(D);
    initPeople(); initPersonaFlags();
    PEOPLE_ORDER.forEach(function (id) { if (!PEOPLE[id]) return; var ph = new Phone(PEOPLE[id]); App.phones[id] = ph; phoneShell(ph); });
    App.more = 'yousef';
    var q = new URLSearchParams(location.search), qp = q.get('persona'), ql = q.get('lang'), qm = q.get('mode');
    D.body.classList.toggle('m-qr', !!(qp && PEOPLE[qp]));          // opened from a QR link: the phone is the whole page on a small screen
    var lastP = Mn.store('manara-alert-persona');
    if (qp && PEOPLE[qp]) { App.solo = qp; if (ql && M.languages().some(function (l) { return l.id === ql; })) App.phones[qp].langPick = ql === PEOPLE[qp].lang ? null : ql; }
    else if (lastP && PEOPLE[lastP]) App.solo = lastP;
    var narrow = root.matchMedia && root.matchMedia('(max-width: 899px)').matches;
    var mode = qm === 'wall' || qm === 'phone' ? qm : (qp && PEOPLE[qp] ? 'phone' : narrow ? 'phone' : 'wall');
    fillControls(); bindControls(); renderPicGrid();
    $('#qr-base').value = location.href.split('#')[0].split('?')[0];
    drawQR();
    setMode(mode); syncControls(); updateLive(); updateClocks();
    reduceMQ.addEventListener && reduceMQ.addEventListener('change', function () { SET.reduced = !!reduceMQ.matches; if (SET.reduced) SET.strobe = false; syncControls(); refreshLights(); rerenderAlerts(); });
    root.addEventListener('langchange', function () { fillControls(); syncControls(); renderPicGrid(); renderPickers(); renderSoloInfo(); renderMoreInfo(); drawQR(); rerenderAll(); updateLive(); });
    // the bus: live alerts from Mission Control (another tab of this browser)
    Mn.link.on(onBus);
    var last = Mn.link.last('alert'), lastClear = Mn.link.last('alert-clear'), lastD = Mn.link.last('dispatch');
    if (last && last.type && now() - (last.ts || 0) < 3600000 && !(lastClear && (lastClear.ts || 0) >= (last.ts || 0) && String(lastClear.id) === String(last.id))) {
      onBus(last); App.live.last = last.ts || now();
      if (lastD && now() - (lastD.ts || 0) < 3600000) onBus(lastD);
      App.live.last = last.ts || now(); updateLive();
    }
    ['pointerup', 'pointercancel', 'keyup', 'blur'].forEach(function (t) { root.addEventListener(t, function () { releasePress(); }, true); });
    setInterval(ladderTick, 250);
    setInterval(updateClocks, 15000);
    setInterval(updateLive, 1000);
    var hz = q.get('hazard');
    if (hz && M.normalize.hazard(hz)) { demoStart(M.normalize.hazard(hz), q.get('level') || 'evacuate', { night: q.get('asleep') !== '0' }); syncControls(); }
    D.documentElement.setAttribute('data-alert-ready', '1');
    root.__alertReady = true;
  }
  api.app = App;
  api.debug = {
    audio: function () { return Aud.state(); }, haptics: function () { return Hap.state(); }, voice: function () { return Voice.last(); },
    settings: function () { return clone(SET); },
    phone: function (id) { var ph = App.phones[id]; return ph ? { id: id, checkin: ph.checkin, ladder: clone(ph.lad), asleep: ph.st ? ph.st.asleep : null, alert: ph.st ? { id: ph.st.A.id, level: ph.st.A.level, hazard: ph.st.A.hazard } : null, light: ph.light.plan, key: ph.V ? ph.V.id : null, lang: ph.V ? ph.V.lang : null } : null; },
    demo: function (hz, lv, o) { return demoStart(hz, lv, o); }, reset: resetPhones, ladderStep: LADDER_STEP
  };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
