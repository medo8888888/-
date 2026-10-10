/* MANARA («منارة») — the NATIONAL MAP renderer  →  window.NatMap          (js/mission-national-map.js)
 * ==========================================================================================
 * A canvas-2D map of the whole of Qatar for Mission Control's national view. It draws REAL geography from the bundled OpenStreetMap snapshot
 * (data/qatar-geo.js, qatar-facilities.js, qatar-roads.js — "Contains data © OpenStreetMap contributors, ODbL 1.0") and, on top of it, SIMULATED content
 * handed over by the controller (js/mission-national.js): congestion, hazard fields, units, incidents, routes.  It owns no simulation state.
 *
 * Classic script (no modules, no fetch).  Colours come from the design tokens (getComputedStyle) and are re-read on 'themechange' by the controller
 * (NatMap.setColors()).  Every label is bilingual (the controller passes the language); Arabic labels use direction = rtl.
 *
 * PERFORMANCE DESIGN (60 fps while panning / zooming)
 *   - The two heavy layers are drawn into OFFSCREEN CACHES larger than the screen (a 30 % margin on every side): BASE (water, land, municipalities,
 *     status tints, borders) and ROADS (the road network by class with a level of detail per zoom level, or coloured by congestion).  Every frame
 *     blits the caches with one affine transform; they are re-rendered only when the camera has left the cache (or after ~110 ms of calm following a zoom).
 *   - Roads are never drawn from Path2D objects: per cache render the edges are culled against the cache rectangle, grouped by class / congestion bucket
 *     and stroked once per group.  The static geometry is projected once (Float32Array) at start-up.
 *   - Per frame only vector overlays are drawn: hazard-field image (47 × 85 cells scaled up), places, facilities (clustered at national zoom), units,
 *     incidents, routes, labels with collision handling.
 *
 * COORDINATES   world = metres on a fixed equirectangular projection around lon 51.2 / lat 25.3 (x east, y north); screen = CSS pixels, y down.
 *               view = { cx, cy (world metres of the screen centre), s (pixels per metre) };  ppk = s * 1000 (pixels per km).
 *
 * PUBLIC API   var map = NatMap.create({ canvas, geo, fac, roads, lang: () => 'ar'|'en', reduced: () => bool });
 *   map.resize(w, h, dpr)  map.setColors()  map.fit()  map.flyTo({lon, lat, ppk} | {bbox}, ms)  map.zoomAt(x, y, factor)  map.panBy(dx, dy)
 *   map.toLL(x, y) → [lon, lat]   map.toScreen(lon, lat) → [x, y]   map.view()  map.ppk()  map.hit(x, y) → hit | null   map.hits
 *   map.scene   (the controller assigns the fields documented at SCENE below)   map.dirty = true   map.frame(ts) → true when it drew
 *   map.invalidate('base' | 'roads' | 'all')   map.stats   map.visibleFacilityCount()   NatMap.proj (toX, toY, toLon, toLat, MLAT)
 * SCENE  { layers:{traffic, hazard:'off'|'heat'|'dust'|'rain', fac:{hospital,police,fire,ambulance}, units, munis, places, tunnels, closures},
 *          cong:Float32Array|null, congKey, closedEdges:[{edge}], jamEdges:[{edge, factor}], fields:{grid,land,wbgt,pm10,rain}|null, fieldsKey,
 *          muniLevel:{id: level}, units:[{id,kind,lon,lat,state,assigned,busy,name}], incidents:[{id,hazard,lon,lat,radiusM,status,plan,cordonM,place}],
 *          selInc, sel:{type,id}|null, hover:{type,id}|null, example:{…}|null, tunnels:[{edge,lon,lat,depthCm,closed,name}], rainCells:[…], dust:{on,…} }
 * ========================================================================================== */
(function (root) {
  'use strict';
  var Mth = Math, PI = Mth.PI, TAU = PI * 2, isFin = isFinite;
  var EARTH_R = 6371008.8, M_LAT = PI * EARTH_R / 180, LAT0 = 25.3, LON0 = 51.2, K_LON = M_LAT * Mth.cos(LAT0 * PI / 180);
  function toX(lon) { return (lon - LON0) * K_LON; }
  function toY(lat) { return (lat - LAT0) * M_LAT; }
  function toLon(x) { return LON0 + x / K_LON; }
  function toLat(y) { return LAT0 + y / M_LAT; }
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  /* ---------------------------------------------------------------- colours */
  var TOKS = ['bg', 'bg-2', 'surface', 'surface-2', 'surface-3', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'head', 'brand', 'accent', 'safe', 'warn', 'danger', 'info', 'fire-1', 'fire-2', 'fire-3'];
  var colorCtx = (function () { var c = root.document.createElement('canvas'); c.width = c.height = 1; return c.getContext('2d'); })();
  function parseColor(v) {
    v = (v || '').trim(); if (!v) return [128, 128, 128];
    colorCtx.fillStyle = '#808080'; colorCtx.fillStyle = v;
    var s = colorCtx.fillStyle;
    if (s.charAt(0) === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s); return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')'; }
  function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

  /* ---------------------------------------------------------------- vocabulary */
  var KIND_PRIO = { city: 0, town: 1, 'municipality-centre': 2, airport: 2, industrial: 2, port: 2, island: 3, village: 3, education: 3, suburb: 4, quarter: 5, neighbourhood: 5, hamlet: 5, locality: 5 };
  var PRIO_PPK = [0, 0, 3.4, 6.5, 15, 34];                       // pixels per km from which a place of that priority is labelled
  var CLS_MIN_PPK = [0, 0, 0, 5, 12, 40];                        // motorway, trunk, primary, secondary, tertiary, local
  var CLS_W = [2.1, 1.9, 1.55, 1.1, 0.85, 0.6];                  // base width in px (before the zoom factor)
  var HZ_TOK = { fire: 'fire-3', gas: 'warn', flood: 'info', dust: 'warn', heat: 'brand', sos: 'danger' };
  var KIND_TOK = { fire: 'fire-3', rescue: 'brand', ambulance: 'danger', police: 'info', hospital: 'danger' };
  var STATE_TOK = { recommended: 'accent', approved: 'brand', dispatched: 'brand', 'en-route': 'brand', 'on-scene': 'safe', cleared: 'muted' };

  /* ---------------------------------------------------------------- small drawing helpers (screen space) */
  function rrect(ctx, x, y, w, h, r) {
    r = Mth.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function flamePath(ctx, s) {
    ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.bezierCurveTo(s * 0.7, -s * 0.2, s * 0.6, s * 0.6, 0, s * 0.72); ctx.bezierCurveTo(-s * 0.6, s * 0.6, -s * 0.7, -s * 0.05, -s * 0.18, -s * 0.34); ctx.bezierCurveTo(-s * 0.16, -s * 0.5, -s * 0.05, -s * 0.62, 0, -s * 0.8); ctx.closePath();
  }
  function crossPath(ctx, s, t) { ctx.beginPath(); ctx.rect(-t, -s, 2 * t, 2 * s); ctx.rect(-s, -t, 2 * s, 2 * t); }
  // a small white glyph for each hazard, centred on (0,0), fitting a circle of radius ~s
  function hazardGlyph(ctx, hz, s) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = Mth.max(1.5, s * 0.17);
    switch (hz) {
      case 'fire': flamePath(ctx, s * 0.62); ctx.fill(); break;
      case 'gas': ctx.beginPath(); ctx.arc(-s * 0.3, s * 0.1, s * 0.3, 0, TAU); ctx.arc(s * 0.12, -s * 0.12, s * 0.34, 0, TAU); ctx.arc(s * 0.28, s * 0.22, s * 0.26, 0, TAU); ctx.fill(); break;
      case 'flood': for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.55, i * s * 0.34); ctx.quadraticCurveTo(-s * 0.28, i * s * 0.34 - s * 0.2, 0, i * s * 0.34); ctx.quadraticCurveTo(s * 0.28, i * s * 0.34 + s * 0.2, s * 0.55, i * s * 0.34); ctx.stroke(); } break;
      case 'dust': ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.28); ctx.lineTo(s * 0.25, -s * 0.28); ctx.arc(s * 0.25, -s * 0.46, s * 0.18, Mth.PI / 2, -Mth.PI / 2, true); ctx.moveTo(-s * 0.55, s * 0.02); ctx.lineTo(s * 0.5, s * 0.02); ctx.moveTo(-s * 0.55, s * 0.32); ctx.lineTo(s * 0.1, s * 0.32); ctx.stroke(); break;
      case 'heat': ctx.beginPath(); ctx.moveTo(0, s * 0.35); ctx.lineTo(0, -s * 0.5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, s * 0.4, s * 0.3, 0, TAU); ctx.fill(); break;
      default: crossPath(ctx, s * 0.55, s * 0.17); ctx.fill();            // sos: a plus sign
    }
    ctx.restore();
  }

  /* ====================================================================================
   * create
   * ==================================================================================== */
  function create(o) {
    var cvs = o.canvas, ctx = cvs.getContext('2d'), G = o.roads, GEO = o.geo, FAC = o.fac;
    var lang = o.lang || function () { return 'en'; }, reduced = o.reduced || function () { return false; };
    var R = { scene: { layers: { traffic: true, hazard: 'off', fac: { hospital: true, police: true, fire: true, ambulance: true }, units: true, munis: true, places: true, tunnels: true, closures: true } }, hits: [], dirty: true, stats: { frames: 0, cacheRenders: 0, lastCacheMs: 0, lastFrameMs: 0 } };
    var W = 800, H = 600, dpr = 1, col = {}, font = 'system-ui, sans-serif', mono = 'monospace';
    var view = { cx: 0, cy: 0, s: 0.004 }, fitView = { cx: 0, cy: 0, s: 0.004 }, minS = 0.002, maxS = 0.6;
    var lastViewChange = 0, anim = null, themeVer = 1;

    /* ---------- static geometry (projected once) ---------- */
    var landPath = new Path2D();
    function addRing(p, ring) {
      for (var i = 0; i < ring.length; i++) { var x = toX(ring[i][0]), y = toY(ring[i][1]); if (i) p.lineTo(x, y); else p.moveTo(x, y); }
      p.closePath();
    }
    GEO.outline.rings.forEach(function (r) { addRing(landPath, r); });
    (GEO.outline.holes || []).forEach(function (r) { addRing(landPath, r); });
    var munis = GEO.municipalities.map(function (m) {
      var p = new Path2D(); m.polygons.forEach(function (poly) { poly.forEach(function (ring) { addRing(p, ring); }); });
      return { id: m.id, name: m.name, path: p, x: toX(m.centre[0]), y: toY(m.centre[1]), lon: m.centre[0], lat: m.centre[1] };
    });
    var places = GEO.places.map(function (p) { return { id: p.id, name: p.name, kind: p.kind, prio: KIND_PRIO[p.kind] == null ? 5 : KIND_PRIO[p.kind], x: toX(p.lon), y: toY(p.lat), lon: p.lon, lat: p.lat, muni: p.muni }; });
    var facs = FAC.map(function (f) { return { id: f.id, kind: f.kind, name: f.name, ed: f.ed, caps: f.caps || null, muni: f.muni, x: toX(f.lon), y: toY(f.lat), lon: f.lon, lat: f.lat, type: f.facilityType, flags: f.flags || [], role: f.role || null }; });
    var NN = G.n, E = G.e, nx = new Float32Array(NN), ny = new Float32Array(NN), i;
    for (i = 0; i < NN; i++) { nx[i] = toX(G.lon[i]); ny[i] = toY(G.lat[i]); }
    var SP = G.shapeLon.length, sx = new Float32Array(SP), sy = new Float32Array(SP);
    for (i = 0; i < SP; i++) { sx[i] = toX(G.shapeLon[i]); sy[i] = toY(G.shapeLat[i]); }
    var bx0 = new Float32Array(E), bx1 = new Float32Array(E), by0 = new Float32Array(E), by1 = new Float32Array(E), eMid = new Float32Array(E * 2);
    (function () {
      for (var e = 0; e < E; e++) {
        var a = G.eFrom[e], b = G.eTo[e], x0 = nx[a], x1 = x0, y0 = ny[a], y1 = y0, k, xx, yy;
        for (k = G.shapeStart[e]; k < G.shapeStart[e + 1]; k++) { xx = sx[k]; yy = sy[k]; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
        xx = nx[b]; yy = ny[b]; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
        bx0[e] = x0; bx1[e] = x1; by0[e] = y0; by1[e] = y1; eMid[2 * e] = (x0 + x1) / 2; eMid[2 * e + 1] = (y0 + y1) / 2;
      }
    })();
    var lists = []; for (i = 0; i < 6; i++) lists.push(new Int32Array(E));
    var listN = [0, 0, 0, 0, 0, 0];
    var bbox = GEO.bbox, wx0 = toX(bbox.lonMin), wx1 = toX(bbox.lonMax), wy0 = toY(bbox.latMin), wy1 = toY(bbox.latMax);

    /* ---------- colours ---------- */
    function setColors() {
      var cs = root.getComputedStyle(root.document.documentElement);
      TOKS.forEach(function (t) { col[t] = parseColor(cs.getPropertyValue('--' + t)); });
      var bf = root.getComputedStyle(root.document.body).fontFamily; if (bf) font = bf;
      var mf = cs.getPropertyValue('--font-m'); if (mf) mono = mf;
      col.dark = root.document.documentElement.dataset.theme === 'dark';
      themeVer++; R.dirty = true;
    }
    function C(n) { return col[n] || [128, 128, 128]; }

    /* ---------- camera ---------- */
    function computeFit() {
      var bw = (wx1 - wx0) * 1.1, bh = (wy1 - wy0) * 1.08;
      var s = Mth.min(W / bw, H / bh);
      fitView = { cx: (wx0 + wx1) / 2, cy: (wy0 + wy1) / 2, s: s };
      minS = s * 0.8; maxS = 0.5;
    }
    function resize(w, h, d) {
      w = Mth.max(120, w | 0); h = Mth.max(120, h | 0); d = clamp(d || 1, 1, 2);
      var first = !R.sized;
      if (w === W && h === H && d === dpr && R.sized) return;
      var prevFit = fitView.s, atFit = first || Mth.abs(view.s / prevFit - 1) < 0.02;
      W = w; H = h; dpr = d; R.sized = true;
      cvs.width = Mth.round(W * dpr); cvs.height = Mth.round(H * dpr); cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
      computeFit();
      if (atFit) { view = { cx: fitView.cx, cy: fitView.cy, s: fitView.s }; } else { view.s = clamp(view.s, minS, maxS); }
      caches.base.key = caches.roads.key = ''; R.dirty = true; ctx = cvs.getContext('2d');
    }
    function viewChanged() { lastViewChange = now(); R.dirty = true; R.calmPending = true; if (R.onView) R.onView(); }
    function clampView() {
      view.s = clamp(view.s, minS, maxS);
      var hw = W / 2 / view.s, hh = H / 2 / view.s;
      view.cx = clamp(view.cx, wx0 - hw * 0.5, wx1 + hw * 0.5); view.cy = clamp(view.cy, wy0 - hh * 0.5, wy1 + hh * 0.5);
    }
    function fit() { view = { cx: fitView.cx, cy: fitView.cy, s: fitView.s }; anim = null; viewChanged(); }
    function zoomAt(x, y, f) {
      var s1 = clamp(view.s * f, minS, maxS); f = s1 / view.s; if (f === 1) return;
      var wx = view.cx + (x - W / 2) / view.s, wy = view.cy - (y - H / 2) / view.s;
      view.s = s1; view.cx = wx - (x - W / 2) / s1; view.cy = wy + (y - H / 2) / s1;
      clampView(); anim = null; viewChanged();
    }
    function panBy(dx, dy) { view.cx -= dx / view.s; view.cy += dy / view.s; clampView(); anim = null; viewChanged(); }
    function setView(lon, lat, ppk) { view.cx = toX(lon); view.cy = toY(lat); if (ppk) view.s = ppk / 1000; clampView(); viewChanged(); }
    function boundsView(b, pad) {                         // b = {lonMin, latMin, lonMax, latMax} (or world metres via b.wx0…), pad = px
      pad = pad == null ? 50 : pad;
      var x0 = toX(b.lonMin), x1 = toX(b.lonMax), y0 = toY(b.latMin), y1 = toY(b.latMax);
      var s = Mth.min((W - 2 * pad) / Mth.max(1, x1 - x0), (H - 2 * pad) / Mth.max(1, y1 - y0));
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: clamp(s, minS, maxS) };
    }
    function flyTo(t, ms) {
      var tv = t.bbox ? boundsView(t.bbox, t.pad) : { cx: toX(t.lon), cy: toY(t.lat), s: clamp((t.ppk || 40) / 1000, minS, maxS) };
      if (!ms || reduced() || !R.sized) { view = { cx: tv.cx, cy: tv.cy, s: tv.s }; clampView(); anim = null; viewChanged(); return; }
      anim = { t0: now(), ms: ms, a: { cx: view.cx, cy: view.cy, s: view.s }, b: tv }; R.dirty = true;
    }
    function stepAnim(ts) {
      if (!anim) return;
      var k = clamp((now() - anim.t0) / anim.ms, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Mth.pow(-2 * k + 2, 2) / 2;
      var ls = Mth.exp(lerp(Mth.log(anim.a.s), Mth.log(anim.b.s), e));
      view.s = ls; view.cx = lerp(anim.a.cx, anim.b.cx, e); view.cy = lerp(anim.a.cy, anim.b.cy, e); clampView();
      lastViewChange = now(); R.dirty = true; R.calmPending = true; if (R.onView) R.onView();
      if (k >= 1) anim = null;
    }
    function toLL(x, y) { return [toLon(view.cx + (x - W / 2) / view.s), toLat(view.cy - (y - H / 2) / view.s)]; }
    function sx_(wx) { return (wx - view.cx) * view.s + W / 2; }
    function sy_(wy) { return (view.cy - wy) * view.s + H / 2; }
    function toScreen(lon, lat) { return [sx_(toX(lon)), sy_(toY(lat))]; }

    /* ---------- caches ---------- */
    var caches = { base: mkCache(), roads: mkCache() };
    function mkCache() { var c = root.document.createElement('canvas'); return { cvs: c, ctx: c.getContext('2d'), key: '', cx: 0, cy: 0, s: 1, mx: 0, my: 0, cw: 0, ch: 0 }; }
    function cacheSetup(ca) {
      ca.mx = Mth.round(W * 0.3); ca.my = Mth.round(H * 0.3); ca.cw = W + 2 * ca.mx; ca.ch = H + 2 * ca.my;
      var pw = Mth.round(ca.cw * dpr), ph = Mth.round(ca.ch * dpr);
      if (ca.cvs.width !== pw || ca.cvs.height !== ph) { ca.cvs.width = pw; ca.cvs.height = ph; }
      ca.cx = view.cx; ca.cy = view.cy; ca.s = view.s;
      var c = ca.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, ca.cvs.width, ca.cvs.height);
    }
    // sets the world→cache-pixel transform on ca.ctx (y flipped); returns the world rectangle the cache covers
    function worldTransform(ca) {
      var c = ca.ctx, s = ca.s;
      c.setTransform(dpr * s, 0, 0, -dpr * s, dpr * (W / 2 + ca.mx - ca.cx * s), dpr * (H / 2 + ca.my + ca.cy * s));
      return { x0: ca.cx - (W / 2 + ca.mx) / s, x1: ca.cx + (W / 2 + ca.mx) / s, y0: ca.cy - (H / 2 + ca.my) / s, y1: ca.cy + (H / 2 + ca.my) / s };
    }
    function levelColor(l) { return l === 'danger' ? C('danger') : l === 'warning' ? C('warn') : l === 'watch' ? C('accent') : null; }

    function renderBase() {
      var ca = caches.base, t0 = now(); cacheSetup(ca);
      var c = ca.ctx, s = ca.s, sc = R.scene, dark = col.dark;
      worldTransform(ca);
      var water = mixc(C('bg-2'), C('info'), dark ? 0.14 : 0.1), land = mixc(C('surface-2'), C('bg'), dark ? 0.35 : 0.1);
      c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = rgba(water); c.fillRect(0, 0, ca.cw, ca.ch); c.restore();
      // faint graticule on the sea (every 0.25 degrees) gives the empty water some structure without any claim
      c.save(); c.lineWidth = 1 / s; c.strokeStyle = rgba(C('line'), dark ? 0.35 : 0.5); c.beginPath();
      var wr = { x0: ca.cx - (W / 2 + ca.mx) / s, x1: ca.cx + (W / 2 + ca.mx) / s, y0: ca.cy - (H / 2 + ca.my) / s, y1: ca.cy + (H / 2 + ca.my) / s }, g;
      for (g = Mth.ceil(toLon(wr.x0) * 4) / 4; toX(g) < wr.x1; g += 0.25) { c.moveTo(toX(g), wr.y0); c.lineTo(toX(g), wr.y1); }
      for (g = Mth.ceil(toLat(wr.y0) * 4) / 4; toY(g) < wr.y1; g += 0.25) { c.moveTo(wr.x0, toY(g)); c.lineTo(wr.x1, toY(g)); }
      c.stroke(); c.restore();
      c.fillStyle = rgba(land); c.fill(landPath, 'evenodd');
      // municipality status tint (SIM): warning = amber, danger = red
      if (sc.layers.munis && sc.muniLevel) {
        munis.forEach(function (m) { var lc = levelColor(sc.muniLevel[m.id]); if (lc) { c.fillStyle = rgba(lc, dark ? 0.16 : 0.15); c.fill(m.path, 'evenodd'); } });
      }
      // borders
      c.lineJoin = 'round';
      c.lineWidth = 1.1 / s; c.setLineDash([6 / s, 5 / s]); c.strokeStyle = rgba(C('ink-2'), dark ? 0.5 : 0.45);
      munis.forEach(function (m) { c.stroke(m.path); });
      c.setLineDash([]);
      c.lineWidth = 1.6 / s; c.strokeStyle = rgba(C('ink-2'), 0.85); c.stroke(landPath);
      ca.key = baseKey(); R.stats.cacheRenders++; R.stats.lastCacheMs = now() - t0;
    }
    function baseKey() { var sc = R.scene, k = [themeVer, W, H, dpr, sc.layers.munis ? 1 : 0]; if (sc.layers.munis && sc.muniLevel) for (var id in sc.muniLevel) k.push(id + sc.muniLevel[id]); return k.join('|'); }

    var BUCKET_N = 6;
    function bucketOf(c) { return c <= 0.0001 ? 5 : c >= 0.85 ? 0 : c >= 0.65 ? 1 : c >= 0.45 ? 2 : c >= 0.28 ? 3 : 4; }
    function bucketColor(b) {
      switch (b) {
        case 0: return C('safe'); case 1: return mixc(C('safe'), C('warn'), 0.5); case 2: return C('warn');
        case 3: return mixc(C('warn'), C('danger'), 0.55); case 4: return C('danger'); default: return mixc(C('danger'), C('ink'), 0.45);
      }
    }
    function zf(ppk) { return clamp(0.55 + 0.3 * Mth.log(Mth.max(ppk, 2) / 4) / Mth.LN2, 0.55, 3.3); }
    function renderRoads() {
      var ca = caches.roads, t0 = now(); cacheSetup(ca);
      var c = ca.ctx, s = ca.s, ppk = s * 1000, sc = R.scene, traffic = !!(sc.layers.traffic && sc.cong), cong = sc.cong, dark = col.dark;
      var wr = worldTransform(ca), inv = 1 / s, k, e, cls, n;
      for (cls = 0; cls < 6; cls++) listN[cls] = 0;
      var flags = G.eFlags, ecls = G.eCls, vis;
      for (e = 0; e < E; e++) {
        if (bx1[e] < wr.x0 || bx0[e] > wr.x1 || by1[e] < wr.y0 || by0[e] > wr.y1) continue;
        if (flags[e] & 256) continue;                                  // virtual connectors are an assumption, never drawn as roads
        cls = ecls[e]; if (cls > 5) cls = 5;
        if (ppk < CLS_MIN_PPK[cls] || ((flags[e] & 32) && ppk < CLS_MIN_PPK[cls] + 9)) continue;
        lists[cls][listN[cls]++] = e;
      }
      var zfac = zf(ppk), a, b;
      function trace(list, cnt, filter, bucketIdx) {
        for (var q = 0; q < cnt; q++) {
          var ee = list[q];
          if (filter === 1 && !(flags[ee] & 1)) continue;
          if (filter === 2 && (flags[ee] & 1)) continue;
          if (bucketIdx != null && bucketOf(cong[ee]) !== bucketIdx) continue;
          a = G.eFrom[ee]; b = G.eTo[ee]; c.moveTo(nx[a], ny[a]);
          for (k = G.shapeStart[ee]; k < G.shapeStart[ee + 1]; k++) c.lineTo(sx[k], sy[k]);
          c.lineTo(nx[b], ny[b]);
        }
      }
      c.lineCap = 'round'; c.lineJoin = 'round';
      var neutral = mixc(C('surface-3'), C('ink'), dark ? 0.34 : 0.36), neutralMajor = mixc(neutral, C('head'), dark ? 0.22 : 0.18);
      for (cls = 5; cls >= 0; cls--) {
        n = listN[cls]; if (!n) continue;
        var w = CLS_W[cls] * zfac * inv;
        // neutral casing / fill (always drawn, so the network is visible with the traffic layer off and under the colours)
        c.setLineDash([]); c.lineWidth = w; c.strokeStyle = rgba(cls < 3 ? neutralMajor : neutral, traffic ? 0.55 : 0.95);
        c.beginPath(); trace(lists[cls], n, 2); c.stroke();
        c.setLineDash([5 * inv * 1.5, 3.5 * inv * 1.5]); c.lineWidth = w; c.strokeStyle = rgba(neutralMajor, 0.95);        // tunnels / underpasses: dashed
        c.beginPath(); trace(lists[cls], n, 1); c.stroke(); c.setLineDash([]);
        if (traffic) {
          var tw = w + 0.5 * inv;
          for (var bk = 0; bk < BUCKET_N; bk++) {
            c.lineWidth = bk === 5 ? tw + 0.6 * inv : tw; c.strokeStyle = rgba(bucketColor(bk), bk === 5 ? 1 : 0.92);
            if (bk === 5) c.setLineDash([4 * inv * 1.4, 3 * inv * 1.4]);
            c.beginPath(); trace(lists[cls], n, 0, bk); c.stroke();
            if (bk === 5) c.setLineDash([]);
          }
        }
      }
      ca.key = roadsKey(); R.stats.cacheRenders++; R.stats.lastCacheMs = now() - t0;
    }
    function roadsKey() { var sc = R.scene; return [themeVer, W, H, dpr, sc.layers.traffic ? 1 : 0, sc.congKey || 0].join('|'); }

    function blit(ca) {
      var r = view.s / ca.s;
      var x0 = r * (-ca.mx - W / 2) + W / 2 + (ca.cx - view.cx) * view.s, y0 = r * (-ca.my - H / 2) + H / 2 + (view.cy - ca.cy) * view.s;
      if (Mth.abs(r - 1) < 1e-6) { x0 = Mth.round(x0 * dpr) / dpr; y0 = Mth.round(y0 * dpr) / dpr; ctx.imageSmoothingEnabled = false; } else { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
      ctx.drawImage(ca.cvs, x0, y0, r * ca.cw, r * ca.ch);
    }
    function covers(ca) {
      var r = view.s / ca.s; if (r < 0.55 || r > 1.9) return false;
      var x0 = r * (-ca.mx - W / 2) + W / 2 + (ca.cx - view.cx) * view.s, y0 = r * (-ca.my - H / 2) + H / 2 + (view.cy - ca.cy) * view.s;
      return x0 <= 1 && y0 <= 1 && x0 + r * ca.cw >= W - 1 && y0 + r * ca.ch >= H - 1;
    }
    function ensureCaches() {
      var calm = now() - lastViewChange > 110, ca, need;
      ca = caches.base; need = ca.key !== baseKey() || !covers(ca) || (calm && (Mth.abs(view.s / ca.s - 1) > 0.02 || Mth.abs(view.cx - ca.cx) * view.s > 2 || Mth.abs(view.cy - ca.cy) * view.s > 2) && ca.key !== ''); if (need || ca.key === '') renderBase();
      ca = caches.roads; need = ca.key !== roadsKey() || !covers(ca) || (calm && (Mth.abs(view.s / ca.s - 1) > 0.02 || Mth.abs(view.cx - ca.cx) * view.s > 2 || Mth.abs(view.cy - ca.cy) * view.s > 2)); if (need || ca.key === '') renderRoads();
    }
    function invalidate(what) { if (what === 'base' || what === 'all') caches.base.key = ''; if (what === 'roads' || what === 'all') caches.roads.key = ''; R.dirty = true; }

    /* ---------- hazard fields (a small canvas per field, scaled up with smoothing) ---------- */
    var fieldCvs = root.document.createElement('canvas'), fieldCtx = fieldCvs.getContext('2d'), fieldKey = '';
    function heatRGB(w) {          // WBGT estimate (°C): cool → warn (28, OSHA light work, S52) → stop (32.1, S19) → deep
      if (w < 24) return [mixc(C('accent'), C('safe'), 0.4), 0.05];
      if (w < 28) return [mixc(C('safe'), C('warn'), (w - 24) / 4 * 0.7), 0.16 + (w - 24) * 0.02];
      if (w < 32.1) return [mixc(C('warn'), C('brand'), (w - 28) / 4.1), 0.28 + (w - 28) * 0.03];
      return [mixc(C('danger'), C('fire-3'), clamp((w - 32.1) / 4, 0, 1)), 0.46 + clamp((w - 32.1) / 6, 0, 0.2)];
    }
    function dustRGB(p) {          // PM10 µg/m³: 150 warn (S31), 255 danger / 425 critical (EPA bands, S49)
      if (p < 60) return [C('warn'), 0];
      if (p < 150) return [mixc(C('warn'), C('brand'), 0.2), 0.12 + (p - 60) / 90 * 0.14];
      if (p < 255) return [mixc(C('brand'), C('warn'), 0.2), 0.3 + (p - 150) / 105 * 0.12];
      if (p < 425) return [mixc(C('brand'), C('danger'), 0.4), 0.45 + (p - 255) / 170 * 0.1];
      return [mixc(C('danger'), C('ink'), 0.3), 0.6];
    }
    function rainRGB(r) {
      if (r < 0.3) return [C('info'), 0];
      return [mixc(C('info'), C('accent'), clamp(r / 60, 0, 0.6)), clamp(0.18 + r / 80, 0.18, 0.7)];
    }
    function paintField(sc) {
      var F = sc.fields, mode = sc.layers.hazard; if (!F || mode === 'off') return false;
      var g = F.grid, key = [mode, sc.fieldsKey, themeVer].join('|');
      if (key === fieldKey) return true;
      fieldKey = key;
      if (fieldCvs.width !== g.nx || fieldCvs.height !== g.ny) { fieldCvs.width = g.nx; fieldCvs.height = g.ny; }
      var img = fieldCtx.createImageData(g.nx, g.ny), d = img.data, arr = mode === 'heat' ? F.wbgt : mode === 'dust' ? F.pm10 : F.rain, fn = mode === 'heat' ? heatRGB : mode === 'dust' ? dustRGB : rainRGB, ix, iy, v, o2, p, cc;
      for (iy = 0; iy < g.ny; iy++) for (ix = 0; ix < g.nx; ix++) {
        cc = iy * g.nx + ix; if (!F.land[cc]) continue;
        v = arr[cc]; o2 = fn(v); p = ((g.ny - 1 - iy) * g.nx + ix) * 4;               // image rows run north → south
        d[p] = o2[0][0]; d[p + 1] = o2[0][1]; d[p + 2] = o2[0][2]; d[p + 3] = clamp(o2[1], 0, 1) * 255;
      }
      fieldCtx.putImageData(img, 0, 0); return true;
    }
    function drawField(sc) {
      if (!paintField(sc)) return;
      var g = sc.fields.grid, x0 = sx_(toX(g.lon0)), x1 = sx_(toX(g.lon0 + g.nx * g.d)), y0 = sy_(toY(g.lat0 + g.ny * g.d)), y1 = sy_(toY(g.lat0));
      ctx.save();
      ctx.setTransform(dpr * view.s, 0, 0, -dpr * view.s, dpr * (W / 2 - view.cx * view.s), dpr * (H / 2 + view.cy * view.s)); ctx.clip(landPath, 'evenodd');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(fieldCvs, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    }

    /* ---------- labels with collision handling ---------- */
    var LQ = [], occupied = [];
    function occupy(x0, y0, x1, y1) { occupied.push([x0, y0, x1, y1]); }
    function hitsOcc(r) { for (var i = 0; i < occupied.length; i++) { var p = occupied[i]; if (r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]) return true; } return false; }
    function label(text, x, y, o) {                                     // o: {color, size, weight, prio, dy, halo, anchor}
      if (!text) return; LQ.push({ s: text, x: x, y: y, o: o, n: LQ.length });
    }
    function flushLabels() {
      LQ.sort(function (a, b) { return (b.o.prio || 0) - (a.o.prio || 0) || a.n - b.n; });
      var dir = lang() === 'ar' ? 'rtl' : 'ltr';
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.direction = dir; ctx.lineJoin = 'round';
      var placed = 0, halo = rgba(C('bg'), col.dark ? 0.82 : 0.86);
      for (var i = 0; i < LQ.length && placed < 140; i++) {
        var L = LQ[i], o = L.o, size = o.size || 11;
        ctx.font = (o.weight || 500) + ' ' + size + 'px ' + font;
        var tw = ctx.measureText(L.s).width, x = clamp(L.x, tw / 2 + 4, Mth.max(tw / 2 + 4, W - tw / 2 - 4)), tries = o.noShift ? [0] : [0, -(size + 4), size + 4], ok = false, y, r;
        for (var t = 0; t < tries.length && !ok; t++) {
          y = L.y + (o.dy || 0) + tries[t]; r = [x - tw / 2 - 2, y - size / 2 - 1, x + tw / 2 + 2, y + size / 2 + 1];
          if (y < size || y > H - size) continue;
          if (!hitsOcc(r)) ok = true;
        }
        if (!ok) continue;
        occupy(r[0], r[1], r[2], r[3]); placed++;
        if (o.halo !== false) { ctx.lineWidth = 3.4; ctx.strokeStyle = o.haloColor || halo; ctx.strokeText(L.s, x, y); }
        ctx.fillStyle = o.color; ctx.fillText(L.s, x, y);
      }
      LQ.length = 0;
    }
    function nm(o) { return lang() === 'ar' ? (o.ar || o.en || '') : (o.en || o.ar || ''); }

    /* ---------- icons ---------- */
    function facIcon(f, x, y, sz, big) {
      var surf = rgba(C('surface')), kind = f.kind, edYes = f.ed === 'yes';
      ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
      if (kind === 'hospital' || kind === 'clinic-ed') {
        var col1 = C('danger'), solid = edYes;
        rrect(ctx, -sz, -sz, 2 * sz, 2 * sz, sz * 0.3);
        if (solid) { ctx.fillStyle = rgba(col1); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = surf; ctx.stroke(); crossPath(ctx, sz * 0.62, sz * 0.21); ctx.fillStyle = '#fff'; ctx.fill(); }
        else { ctx.fillStyle = surf; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = rgba(mixc(col1, C('muted'), 0.45)); ctx.stroke(); crossPath(ctx, sz * 0.58, sz * 0.19); ctx.fillStyle = rgba(mixc(col1, C('muted'), 0.45)); ctx.fill(); }
        if (big && edYes) { ctx.font = '700 ' + Mth.max(8, sz * 0.78) + 'px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; var tw = ctx.measureText('ED').width + 6; rrect(ctx, -tw / 2, sz + 1, tw, sz * 0.95, 3); ctx.fillStyle = rgba(C('danger')); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText('ED', 0, sz + 1 + sz * 0.5); }
      } else if (kind === 'fire') {
        ctx.beginPath(); ctx.arc(0, 0, sz, 0, TAU); ctx.fillStyle = rgba(C('fire-3')); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = surf; ctx.stroke(); flamePath(ctx, sz * 0.62); ctx.fillStyle = '#fff'; ctx.fill();
      } else if (kind === 'police') {
        ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.9, -sz * 0.62); ctx.lineTo(sz * 0.8, sz * 0.2); ctx.quadraticCurveTo(sz * 0.5, sz * 0.78, 0, sz); ctx.quadraticCurveTo(-sz * 0.5, sz * 0.78, -sz * 0.8, sz * 0.2); ctx.lineTo(-sz * 0.9, -sz * 0.62); ctx.closePath();
        ctx.fillStyle = rgba(C('info')); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = surf; ctx.stroke(); ctx.beginPath(); ctx.arc(0, -sz * 0.05, sz * 0.28, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      } else {   // ambulance point
        rrect(ctx, -sz * 1.15, -sz * 0.72, sz * 2.3, sz * 1.44, sz * 0.3); ctx.fillStyle = surf; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C('danger')); ctx.stroke();
        ctx.save(); ctx.translate(-sz * 0.18, 0); crossPath(ctx, sz * 0.44, sz * 0.15); ctx.fillStyle = rgba(C('danger')); ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(sz * 0.72, -sz * 0.5, sz * 0.17, 0, TAU); ctx.fillStyle = rgba(C('info')); ctx.fill();
      }
      ctx.restore();
    }
    function unitIcon(kind, x, y, sz, state, dim) {
      var tok = KIND_TOK[kind] || 'ink', surf = rgba(C('surface')), colr = rgba(C(tok));
      ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round'; if (dim) ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(0, 0, sz * 1.5, 0, TAU); ctx.fillStyle = rgba(C('bg'), 0.7); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, sz * 1.5, 0, TAU); ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(C(state === 'on-scene' ? 'safe' : state === 'returning' ? 'muted' : state === 'turnout' ? 'warn' : 'brand')); ctx.stroke();
      if (kind === 'fire' || kind === 'rescue') { ctx.beginPath(); if (kind === 'rescue') { for (var i = 0; i < 6; i++) { var a = i * 1.0472 + 0.5236; ctx.lineTo(Mth.cos(a) * sz, Mth.sin(a) * sz); } ctx.closePath(); } else ctx.arc(0, 0, sz, 0, TAU); ctx.fillStyle = colr; ctx.fill(); if (kind === 'fire') { flamePath(ctx, sz * 0.62); ctx.fillStyle = '#fff'; ctx.fill(); } else { ctx.beginPath(); ctx.arc(0, 0, sz * 0.42, 0, TAU); ctx.lineWidth = 1.8; ctx.strokeStyle = '#fff'; ctx.stroke(); } }
      else if (kind === 'police') { ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.9, -sz * 0.6); ctx.lineTo(sz * 0.8, sz * 0.2); ctx.quadraticCurveTo(sz * 0.5, sz * 0.78, 0, sz); ctx.quadraticCurveTo(-sz * 0.5, sz * 0.78, -sz * 0.8, sz * 0.2); ctx.lineTo(-sz * 0.9, -sz * 0.6); ctx.closePath(); ctx.fillStyle = colr; ctx.fill(); ctx.beginPath(); ctx.arc(0, -sz * 0.05, sz * 0.26, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
      else { rrect(ctx, -sz * 1.05, -sz * 0.7, sz * 2.1, sz * 1.4, sz * 0.3); ctx.fillStyle = surf; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = colr; ctx.stroke(); ctx.save(); ctx.translate(-sz * 0.12, 0); crossPath(ctx, sz * 0.42, sz * 0.14); ctx.fillStyle = colr; ctx.fill(); ctx.restore(); ctx.beginPath(); ctx.arc(sz * 0.68, -sz * 0.46, sz * 0.16, 0, TAU); ctx.fillStyle = rgba(C('info')); ctx.fill(); }
      ctx.restore();
    }

    /* ---------- one frame ---------- */
    function pushHit(h) { R.hits.push(h); }
    function polyScreen(route, fn) { for (var i = 0; i < route.length; i++) { var x = sx_(toX(route[i][0])), y = sy_(toY(route[i][1])); fn(x, y, i); } }
    function strokeRoute(route, colorStr, w, dash, dashOff, alpha) {
      if (!route || route.length < 2) return;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = colorStr; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.setLineDash(dash || []); ctx.lineDashOffset = dashOff || 0; ctx.beginPath();
      polyScreen(route, function (x, y, i) { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore();
    }
    function routeEnd(route) { return route && route.length ? route[route.length - 1] : null; }

    function drawMuniNames(ppk) {
      if (ppk > 13) return;
      var fade = clamp((13 - ppk) / 4, 0, 1);
      munis.forEach(function (m) {
        var x = sx_(m.x), y = sy_(m.y); if (x < -80 || x > W + 80 || y < -20 || y > H + 20) return;
        label(lang() === 'en' ? nm(m.name).toUpperCase() : nm(m.name), x, y, { color: rgba(C('ink-2'), 0.62 * fade + 0.1), size: clamp(10 + ppk * 0.35, 10, 15), weight: 700, prio: 1, halo: true, noShift: true });
      });
    }
    function drawPlaces(ppk) {
      if (!R.scene.layers.places) return;
      var vis = [], i, p, x, y, lim;
      for (i = 0; i < places.length; i++) {
        p = places[i]; if (ppk < PRIO_PPK[p.prio]) continue;
        x = sx_(p.x); y = sy_(p.y); if (x < -40 || x > W + 40 || y < -20 || y > H + 20) continue;
        vis.push([p, x, y]);
      }
      for (i = 0; i < vis.length; i++) {
        p = vis[i][0]; x = vis[i][1]; y = vis[i][2];
        var rad = p.prio === 0 ? 3.6 : p.prio === 1 ? 3 : p.prio <= 3 ? 2.4 : 1.9;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fillStyle = rgba(C('head'), 0.85); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(C('bg'), 0.9); ctx.stroke();
        occupy(x - rad - 1, y - rad - 1, x + rad + 1, y + rad + 1);
        label(nm(p.name), x, y, { color: rgba(C(p.prio <= 1 ? 'head' : 'ink-2')), size: p.prio === 0 ? 13.5 : p.prio === 1 ? 12 : p.prio <= 3 ? 11 : 10.5, weight: p.prio <= 1 ? 700 : 500, prio: 20 - p.prio * 3, dy: -(rad + 8) });
      }
    }
    function drawTunnels(ppk) {
      var sc = R.scene, T = sc.tunnels; if (!T || !sc.layers.tunnels) return;
      for (var i = 0; i < T.length; i++) {
        var t = T[i], wet = t.depthCm > 0.5 || t.closed; if (!wet && ppk < 30) continue;
        var x = sx_(toX(t.lon)), y = sy_(toY(t.lat)); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        var rr = wet ? 8 : 5;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fillStyle = rgba(wet ? C('info') : C('surface'), wet ? 0.95 : 0.9); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rgba(t.closed ? C('danger') : C('info')); ctx.stroke();
        if (wet) { ctx.font = '700 9.5px ' + mono; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.fillStyle = '#fff'; ctx.fillText(String(Mth.round(t.depthCm)), x, y + 0.5); }
        ctx.restore();
        pushHit({ type: 'tunnel', id: String(t.edge), x: x, y: y, r: rr + 4, prio: 3 });
        occupy(x - rr, y - rr, x + rr, y + rr);
      }
    }
    function drawClosures(ppk) {
      var sc = R.scene, i, e, x, y;
      if (sc.layers.closures === false) return;
      var cl = sc.closedEdges || [], jm = sc.jamEdges || [];
      for (i = 0; i < cl.length; i++) {
        e = cl[i].edge; x = sx_(eMid[2 * e]); y = sy_(eMid[2 * e + 1]); if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.fillStyle = rgba(C('danger')); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 3.2, y - 3.2); ctx.lineTo(x + 3.2, y + 3.2); ctx.moveTo(x + 3.2, y - 3.2); ctx.lineTo(x - 3.2, y + 3.2); ctx.stroke(); ctx.restore();
        pushHit({ type: 'road', id: String(e), x: x, y: y, r: 10, prio: 2 }); occupy(x - 8, y - 8, x + 8, y + 8);
      }
      for (i = 0; i < jm.length; i++) {
        e = jm[i].edge; x = sx_(eMid[2 * e]); y = sy_(eMid[2 * e + 1]); if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.fillStyle = rgba(C('warn')); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C('surface')); ctx.stroke(); ctx.fillStyle = rgba(C('bg')); ctx.font = '800 11px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.fillText('!', x, y + 0.5); ctx.restore();
        pushHit({ type: 'road', id: String(e), x: x, y: y, r: 10, prio: 2 }); occupy(x - 8, y - 8, x + 8, y + 8);
      }
    }
    function drawFacilities(ppk, ts) {
      var sc = R.scene, L = sc.layers.fac, vis = [], i, f, x, y, sz;
      for (i = 0; i < facs.length; i++) {
        f = facs[i]; if (!L[f.kind === 'clinic-ed' ? 'hospital' : f.kind]) continue;
        x = sx_(f.x); y = sy_(f.y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        vis.push([f, x, y]);
      }
      R.visFac = vis.length;
      var cluster = ppk < 20;
      if (cluster) {
        var cell = ppk < 8 ? 34 : 30, map = {}, keys = [];
        for (i = 0; i < vis.length; i++) { var k = ((vis[i][1] / cell) | 0) + ',' + ((vis[i][2] / cell) | 0); if (!map[k]) { map[k] = { items: [], x: 0, y: 0 }; keys.push(k); } var cl = map[k]; cl.items.push(vis[i][0]); cl.x += vis[i][1]; cl.y += vis[i][2]; }
        for (i = 0; i < keys.length; i++) {
          var c = map[keys[i]], n = c.items.length; x = c.x / n; y = c.y / n;
          if (n === 1) { f = c.items[0]; sz = 7.5; facIcon(f, x, y, sz, false); pushHit({ type: 'facility', id: f.id, x: x, y: y, r: 11, prio: 4 }); occupy(x - sz - 1, y - sz - 1, x + sz + 1, y + sz + 1); continue; }
          var counts = { hospital: 0, police: 0, fire: 0, ambulance: 0 }; c.items.forEach(function (it) { counts[it.kind === 'clinic-ed' ? 'hospital' : it.kind]++; });
          var dom = 'hospital', best = -1; for (var kk in counts) if (counts[kk] > best) { best = counts[kk]; dom = kk; }
          var rad = n < 5 ? 11 : n < 15 ? 13.5 : 16;
          ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fillStyle = rgba(C('surface'), 0.96); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = rgba(C(dom === 'police' ? 'info' : dom === 'fire' ? 'fire-3' : 'danger')); ctx.stroke();
          ctx.font = '700 ' + (n < 100 ? 11.5 : 10) + 'px ' + mono; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.fillStyle = rgba(C('head')); ctx.fillText(String(n), x, y + 0.5); ctx.restore();
          pushHit({ type: 'cluster', id: keys[i], x: x, y: y, r: rad + 2, prio: 4, n: n, items: c.items.map(function (it) { return it.id; }) });
          occupy(x - rad, y - rad, x + rad, y + rad);
        }
      } else {
        sz = ppk < 60 ? 8 : 9.5;
        vis.sort(function (a, b) { return a[2] - b[2]; });
        for (i = 0; i < vis.length; i++) {
          f = vis[i][0]; x = vis[i][1]; y = vis[i][2];
          facIcon(f, x, y, sz, ppk >= 40);
          pushHit({ type: 'facility', id: f.id, x: x, y: y, r: sz + 4, prio: 4 });
          occupy(x - sz - 1, y - sz - 1, x + sz + 1, y + sz + (f.ed === 'yes' && ppk >= 40 ? sz + 2 : 1));
          if (ppk >= 34) { var nmx = nm(f.name) || (lang() === 'ar' ? 'منشأة بلا اسم في OSM' : 'Unnamed in OSM'); label(nmx.replace(/\s*\(.*\)$/, ''), x, y, { color: rgba(C('ink-2')), size: 10.5, weight: 600, prio: 6, dy: sz + (f.ed === 'yes' && ppk >= 40 ? 22 : 10) }); }
        }
      }
    }
    function drawIncidents(ts, animate) {
      var sc = R.scene, inc = sc.incidents || [], i, k;
      // plan routes first (under the markers)
      for (i = 0; i < inc.length; i++) {
        var it = inc[i], pl = it.plan, selected = sc.selInc === it.id;
        if (!pl) continue;
        (pl.units || []).forEach(function (u, ui) {
          if (!u.route || u.route.length < 2 || u.state === 'cleared') return;
          var tok = KIND_TOK[u.kind] || 'brand', pending = u.state === 'recommended' || u.state === 'approved';
          var colorStr = rgba(C(tok), selected ? 0.95 : 0.55), w = selected ? 3.6 : 2.2;
          strokeRoute(u.route, rgba(C('bg'), selected ? 0.8 : 0.5), w + 2.4, null, 0, 1);
          strokeRoute(u.route, colorStr, w, pending ? [3, 7] : [10, 7], animate && !pending ? -ts / 1000 * 30 : 0, 1);
        });
        if (pl.hospital && pl.hospital.route && pl.hospital.route.length > 1 && selected) strokeRoute(pl.hospital.route, rgba(C('safe'), 0.85), 3, [2, 7], 0, 1);
      }
    }
    function drawIncidentMarkers(ts, animate) {
      var sc = R.scene, inc = sc.incidents || [];
      for (var i = 0; i < inc.length; i++) {
        var it = inc[i], x = sx_(toX(it.lon)), y = sy_(toY(it.lat)); if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
        var selected = sc.selInc === it.id, tok = HZ_TOK[it.hazard] || 'danger', c1 = C(tok), cleared = it.status === 'cleared' || it.status === 'cancelled';
        var rpx = it.radiusM * view.s;
        ctx.save();
        if (cleared) ctx.globalAlpha = 0.55;
        if (rpx > 14) { ctx.beginPath(); ctx.arc(x, y, rpx, 0, TAU); ctx.fillStyle = rgba(c1, 0.14); ctx.fill(); ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.strokeStyle = rgba(c1, 0.8); ctx.stroke(); ctx.setLineDash([]); }
        if (it.cordonM) { var cr = it.cordonM * view.s; if (cr > 10) { ctx.beginPath(); ctx.arc(x, y, cr, 0, TAU); ctx.lineWidth = 2; ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(C('info'), 0.9); ctx.stroke(); ctx.setLineDash([]); } }
        var pulse = animate && !cleared ? (ts / 1000 * 0.9) % 1 : 0.35, pr = 15 + pulse * 15;
        if (!cleared) { ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = rgba(c1, (1 - pulse) * 0.7); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fillStyle = rgba(c1); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(C('surface')); ctx.stroke();
        ctx.translate(x, y); hazardGlyph(ctx, it.hazard, 10); ctx.translate(-x, -y);
        var st = it.plan ? it.plan.state : 'recommended', bc = C(STATE_TOK[st] || 'accent');
        ctx.beginPath(); ctx.arc(x + 11, y + 11, 5.5, 0, TAU); ctx.fillStyle = rgba(bc); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C('surface')); ctx.stroke();
        if (selected) { ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.lineWidth = 2.6; ctx.strokeStyle = rgba(C('head')); ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }
        ctx.restore();
        pushHit({ type: 'incident', id: it.id, x: x, y: y, r: 20, prio: 9 });
        occupy(x - 18, y - 18, x + 18, y + 18);
        label(it.id, x, y, { color: rgba(C('head')), size: 11.5, weight: 800, prio: 90, dy: -27 });
      }
    }
    function drawUnits(ts, animate) {
      var sc = R.scene; if (!sc.layers.units) return;
      var us = sc.units || [], i, shown = {}, sel = sc.selInc, assigned = {};
      var inc = (sc.incidents || []).filter(function (q) { return q.id === sel; })[0];
      if (inc && inc.plan) (inc.plan.units || []).forEach(function (u) { if (u.unitId) assigned[u.unitId] = u; });
      for (i = 0; i < us.length; i++) {
        var u = us[i], active = u.state && u.state !== 'idle', inPlan = !!assigned[u.id];
        if (!active && !inPlan) continue;
        var x = sx_(toX(u.lon)), y = sy_(toY(u.lat)); if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
        // a unit that has not left its station yet is shown as a ring around the station icon (recommended units) — drawn small
        var pend = !active && inPlan;
        if (pend) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.lineWidth = 2.4; ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(C(KIND_TOK[u.kind] || 'brand'), 0.95); ctx.stroke(); ctx.restore(); pushHit({ type: 'unit', id: u.id, x: x, y: y, r: 14, prio: 6 }); continue; }
        unitIcon(u.kind, x, y, 7.5, u.state, u.busy && u.state === 'idle');
        pushHit({ type: 'unit', id: u.id, x: x, y: y, r: 14, prio: 7 });
        occupy(x - 12, y - 12, x + 12, y + 12);
        var pu = assigned[u.id];
        if (pu && pu.etaSec != null && pu.state !== 'on-scene' && pu.state !== 'cleared') { var m = Mth.floor(pu.etaSec / 60), s2 = Mth.round(pu.etaSec % 60); label(m + ':' + (s2 < 10 ? '0' : '') + s2, x, y, { color: rgba(C('head')), size: 11, weight: 700, prio: 60, dy: 20 }); }
      }
    }
    function drawExample(ts, animate) {
      var ex = R.scene.example; if (!ex) return;
      var near = ex.nearest, fast = ex.fastest;
      if (near && near.route) { strokeRoute(near.route, rgba(C('bg'), 0.8), 6, null, 0, 1); strokeRoute(near.route, rgba(C('muted')), 3.4, [8, 7], 0, 1); }
      if (fast && fast.route) { strokeRoute(fast.route, rgba(C('bg'), 0.85), 8, null, 0, 1); strokeRoute(fast.route, rgba(C('accent')), 4.6, animate ? [12, 7] : null, animate ? -ts / 1000 * 40 : 0, 1); }
      var ix = sx_(toX(ex.incident.lon)), iy = sy_(toY(ex.incident.lat));
      [[near, 'muted', ex.nearLabel], [fast, 'accent', ex.fastLabel]].forEach(function (q) {
        var u = q[0]; if (!u || !u.base) return;
        var x = sx_(toX(u.base.lon)), y = sy_(toY(u.base.lat));
        ctx.save(); ctx.setLineDash([2, 5]); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C(q[1]), 0.9); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ix, iy); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fillStyle = rgba(C('surface')); ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = rgba(C(q[1])); ctx.stroke(); ctx.translate(x, y); flamePath(ctx, 8); ctx.fillStyle = rgba(C(q[1] === 'accent' ? 'fire-3' : 'muted')); ctx.fill(); ctx.restore();
        occupy(x - 17, y - 17, x + 17, y + 17);
        if (q[2]) label(q[2], x, y, { color: rgba(C(q[1] === 'accent' ? 'accent' : 'ink-2')), size: 11.5, weight: 700, prio: 85, dy: 27 });
      });
      ctx.save(); ctx.beginPath(); ctx.arc(ix, iy, 13, 0, TAU); ctx.fillStyle = rgba(C('fire-3')); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(C('surface')); ctx.stroke(); ctx.translate(ix, iy); hazardGlyph(ctx, 'fire', 9); ctx.restore();
      occupy(ix - 16, iy - 16, ix + 16, iy + 16);
    }
    function drawRainCells(ppk) {
      var sc = R.scene, rc = sc.rainCells; if (!rc || sc.layers.hazard !== 'rain') return;
      rc.forEach(function (c) {
        var x = sx_(toX(c.lon)), y = sy_(toY(c.lat)), rr = c.radiusKm * ppk;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.lineWidth = 1.8; ctx.setLineDash([6, 5]); ctx.strokeStyle = rgba(C('info'), 0.9); ctx.stroke(); ctx.restore();
        label(Mth.round(c.mmHr) + (lang() === 'ar' ? ' مم/س' : ' mm/h'), x, y, { color: rgba(C('info')), size: 11, weight: 700, prio: 30 });
      });
    }
    function drawDustFront(ppk) {
      var sc = R.scene, d = sc.dust; if (!d || !d.on || sc.layers.hazard !== 'dust' || d.frontKm == null) return;
      // the front: a line perpendicular to the wind direction, frontKm along the wind axis from the start position given by the engine
      if (!d.front) return;
      ctx.save(); ctx.lineWidth = 2.4; ctx.setLineDash([10, 6]); ctx.strokeStyle = rgba(C('brand')); ctx.beginPath();
      polyScreen(d.front, function (x, y, i) { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore();
    }

    function frame(ts) {
      var t0 = now();
      if (!R.sized) return false;
      if (anim) stepAnim(ts);
      if (R.calmPending && now() - lastViewChange > 110) { R.calmPending = false; R.dirty = true; }
      var sc = R.scene, animating = !reduced() && (sc.animate !== false) && !!sc.animating;
      if (!R.dirty && !animating) return false;
      R.dirty = false;
      ensureCaches();
      R.hits.length = 0; occupied.length = 0; LQ.length = 0;
      var ppk = view.s * 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.setLineDash([]);
      ctx.fillStyle = rgba(mixc(C('bg-2'), C('info'), col.dark ? 0.14 : 0.1)); ctx.fillRect(0, 0, W, H);
      blit(caches.base);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawField(sc);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      blit(caches.roads);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRainCells(ppk); drawDustFront(ppk);
      drawClosures(ppk);
      drawTunnels(ppk);
      drawIncidents(ts, animating);
      drawFacilities(ppk, ts);
      drawUnits(ts, animating);
      drawIncidentMarkers(ts, animating);
      drawExample(ts, animating);
      drawMuniNames(ppk);
      drawPlaces(ppk);
      // selection / hover rings
      [sc.hover, sc.sel].forEach(function (q, qi) {
        if (!q) return; var h = null; for (var i = R.hits.length - 1; i >= 0; i--) if (R.hits[i].type === q.type && R.hits[i].id === q.id) { h = R.hits[i]; break; }
        if (!h || q.type === 'incident') return;
        ctx.save(); ctx.lineWidth = qi ? 2.6 : 2; ctx.strokeStyle = rgba(C('head'), qi ? 1 : 0.7); ctx.setLineDash(qi ? [4, 3] : []); ctx.beginPath(); ctx.arc(h.x, h.y, (h.r || 12) + 2, 0, TAU); ctx.stroke(); ctx.restore();
      });
      flushLabels();
      R.stats.frames++; R.stats.lastFrameMs = now() - t0;
      if (animating) R.dirty = true;
      return true;
    }

    function hit(x, y) {
      var best = null, bestScore = 1e9;
      for (var i = R.hits.length - 1; i >= 0; i--) {
        var h = R.hits[i], d = Mth.hypot(x - h.x, y - h.y); if (d > (h.r || 10)) continue;
        var score = d - (h.prio || 0) * 3; if (score < bestScore) { bestScore = score; best = h; }
      }
      return best;
    }

    R.resize = resize; R.setColors = setColors; R.fit = fit; R.flyTo = flyTo; R.zoomAt = zoomAt; R.panBy = panBy; R.setView = setView; R.toLL = toLL; R.toScreen = toScreen;
    R.view = function () { return { cx: view.cx, cy: view.cy, s: view.s, center: [toLon(view.cx), toLat(view.cy)], ppk: view.s * 1000 }; };
    R.ppk = function () { return view.s * 1000; }; R.fitPpk = function () { return fitView.s * 1000; };
    R.hit = hit; R.frame = frame; R.invalidate = invalidate;
    R.visibleFacilityCount = function () { return R.visFac || 0; };
    R.facilities = facs; R.places = places; R.munis = munis;
    R.edgeMid = function (e) { return [toLon(eMid[2 * e]), toLat(eMid[2 * e + 1])]; };
    R.isAnimating = function () { return !!anim; };
    R.size = function () { return { w: W, h: H, dpr: dpr }; };
    R.bounds = function () { var a = toLL(0, H), b = toLL(W, 0); return { lonMin: a[0], latMin: a[1], lonMax: b[0], latMax: b[1] }; };
    R.fitBounds = function (b, pad, ms) { var t = boundsView(b, pad); flyTo({ lon: toLon(t.cx), lat: toLat(t.cy), ppk: t.s * 1000 }, ms); };
    setColors();
    return R;
  }

  root.NatMap = { create: create, proj: { toX: toX, toY: toY, toLon: toLon, toLat: toLat, MLAT: M_LAT, KLON: K_LON }, VERSION: '1.0.0' };
})(typeof globalThis !== 'undefined' ? globalThis : window);
