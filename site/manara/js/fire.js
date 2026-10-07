/* MANARA («منارة») — fire & smoke detection engine  →  window.ManaraFire
 * ==========================================================================================
 * Rule-based computer vision (colour models + flicker / motion analysis). No machine learning,
 * no libraries, no DOM: pure functions on RGBA frames, so it runs in the browser (classic
 * script, works from file://) and in Node (load with vm; it attaches to globalThis/self/window).
 *
 * FRAME   { data: Uint8ClampedArray|Uint8Array RGBA, width, height }   (ImageData-compatible)
 *
 * API
 *   ManaraFire.analyze(frame, opts?) → single-frame analysis
 *     { width, height,
 *       fireMask:  Uint8Array(width*height)   1 = fire-coloured pixel (YCbCr AND RGB/HSI rules below)
 *       smokeMask: Uint8Array(width*height)   1 = smoke-coloured pixel (greyish, mid brightness; colour only)
 *       fireRatio, smokeRatio                 fraction of the frame
 *       regions: [{x, y, w, h, area, kind:'fire'|'smoke', score, blocks}]
 *                                             connected components on a coarse block grid (8-neighbour,
 *                                             gaps of one block bridged), filtered by min area, sorted by
 *                                             area (desc). area = matching pixels inside; score 0..1 =
 *                                             density. Single-frame smoke regions are modest (score ≤ 0.5):
 *                                             grey walls look like smoke in a still frame — the detector
 *                                             replaces them with temporally confirmed ones.
 *       stats: { meanY, meanCb, meanCr,       frame means (BT.601 studio range, used by Çelik's rules)
 *                brightFire,                  fire pixels with Y ≥ 175 (flame core)
 *                fireCount, smokeCount,       pixel counts
 *                fireMeanY, otherMeanY,       mean Y of fire pixels / of all other pixels
 *                fireTexture, fireSmooth,     mean local gradient of fire pixels / share of flat fire pixels
 *                hotNearFire,                 white/pale-yellow pixels (R ≥ 230, G ≥ 190) within 2 px of fire
 *                fireEdge,                    share of fire pixels on the mask boundary (thin highlights: high)
 *                paleBlocks, plumeEdge,       share of pale-grey blocks / of pale-grey blocks bordering blue sky
 *                paleLow, plumeShade,         share of pale-grey blocks in the lowest quarter / brightness spread
 *                blueSky }                    (std of grey level) of the pale pixels bordering sky / blue-sky pixels
 *       grid: { size, gw, gh, fire, smoke, hot, px, y, edge, chroma, fireOn }   block grid (internal use)
 *       score }                               0..1 single-frame fire likelihood (= features(analysis).fire,
 *                                             the same cues scoreImage uses)
 *
 *   ManaraFire.createDetector(opts?) → { push(frame, tMs) → result, reset(), opts }
 *     result = { state: 'clear'|'suspect'|'fire'|'smoke',
 *                confidence,                  0..1 belief that a real fire (or, in 'smoke', real smoke) is present
 *                flicker,                     0..1 flame flicker over the last ~1.5 s
 *                growth,                      relative growth of the fire area per second (−1..1, + = growing)
 *                smoke,                       0..1 share of the frame with moving, softening grey haze (×10, capped)
 *                frame,                       the analyze() result (smoke regions = temporally confirmed ones)
 *                firstSuspectMs,              tMs when this episode first left 'clear' (null when clear)
 *                alertMs,                     tMs when this episode first reached 'fire' or 'smoke' (null otherwise)
 *                reasons: [...] }             short codes for the UI: 'colour', 'flicker', 'growth', 'static',
 *                                             'moving', 'smoke-motion', 'camera-motion'
 *     Temporal logic: flames change shape and brightness several times a second, so flicker = mean over the
 *     window of (a) the fire-mask toggling rate |M_t XOR M_t−1| / |M_t OR M_t−1| and (b) the frame-to-frame
 *     luminance change of fire blocks; both are discounted when the whole picture changes (camera motion),
 *     and when the fire-coloured area slides as a whole (net centroid displacement ≈ its path length, e.g. a
 *     red car driving by) — flames jitter in place.
 *     Hysteresis: 'fire' needs confirmFrames suspicious frames in a row (one miss costs two) AND flicker ≥
 *     flickerMin; a static fire-coloured object (red car, lamp) therefore stays at most 'suspect'. Leaving
 *     'fire' needs clearFrames calm frames. 'smoke' = grey blocks that differ from a slowly-updated background,
 *     change slowly, do not gain edges (smoke softens what is behind it), persisting smokeFrames frames while
 *     the hazy area drifts or grows. The camera should hover (the drone holds position to confirm).
 *     opts (all optional): sensitivity (0..1, 0.5), confirmFrames (8), clearFrames (10), smokeFrames (12),
 *     windowMs (1500), flickerMin (0.2), minFireRatio (0.0008), minSmokeRatio (0.01), plus analyze() opts.
 *
 *   ManaraFire.scoreImage(frame, opts?) → { label: 'fire'|'smoke'|'none', score, fire, smoke, features, analysis }
 *     For still images (no temporal information): colour rules + compactness / texture / flame-core cues and
 *     a "grey plume against blue sky" cue, see features(). fire, smoke = 0..1; label = 'fire' if fire ≥ 0.5,
 *     else 'smoke' if smoke ≥ 0.5, else 'none' (opts.fireThreshold / smokeThreshold). Pictures wider than
 *     opts.maxW (default 320 px) are downscaled first, so the thresholds do not depend on resolution. score = the winning label's score (for 'none': 1 − the larger of the two).
 *   ManaraFire.features(analysis) → named cues behind scoreImage (for an explainable UI)
 *   ManaraFire.downscale(frame, maxW) → frame no wider than maxW (box filter; returns the input if already small)
 *   ManaraFire.params(opts) → the thresholds actually used for a given sensitivity
 *
 *   analyze opts: sensitivity 0..1 (default 0.5; higher = more pixels accepted): tau = 55 − 30·s,
 *   R_T = 135 − 20·s, S_T = 65 − 10·s (all three = the papers' values at s = 0.5 and stay inside the
 *   papers' ranges), smoke grey tolerance alpha = 12 + 16·s; block (grid cell px, default ≈ min(w,h)/30, ≥ 4);
 *   minArea (px, default 0.04 % of the frame, ≥ 6). Individual thresholds can be overridden: tau, rT, sT.
 *
 * PER-PIXEL FIRE RULES — a pixel is fire-coloured only if it passes BOTH models:
 *   1) Çelik T., Demirel H. (2009) "Fire detection in video sequences using a generic color model",
 *      Fire Safety Journal 44(2):147–158, doi:10.1016/j.firesaf.2008.05.005. YCbCr (ITU-R BT.601):
 *        Y = 16 + 0.2568R + 0.5041G + 0.0979B, Cb = 128 − 0.1482R − 0.2910G + 0.4392B,
 *        Cr = 128 + 0.4392R − 0.3678G − 0.0714B
 *        Y > Cb,  Cr > Cb,  Y > Ymean,  Cb < Cbmean,  Cr > Crmean,  |Cb − Cr| ≥ tau  (tau = 40, picked by the
 *        authors from an ROC curve; means are over the whole frame). Their extra Cb–Cr polynomial-boundary
 *        rule is not used here.
 *   2) Chen T.-H., Wu P.-H., Chiou Y.-C. (2004) "An early fire-detection method based on image processing",
 *      Proc. IEEE ICIP 2004, pp. 1707–1710, doi:10.1109/ICIP.2004.1421401. RGB + HSI saturation:
 *        R > R_T,  R ≥ G > B,  S ≥ (255 − R)·S_T / R_T   with R_T ≈ 115–135 and S_T ≈ 55–65.
 *        S = 1 − 3·min(R,G,B)/(R+G+B) (HSI). We express S in percent (0–100), which matches S_T being the
 *        saturation of a dim flame pixel at R = R_T — our reading of the paper, stated openly.
 * SMOKE COLOUR (after the grey-pixel rule of the same group, Chen et al. 2004/2006 — R ≈ G ≈ B within a
 *   deviation α, intensity in a light-grey or dark-grey band): max(R,G,B) − min(R,G,B) ≤ alpha and
 *   80 ≤ (R+G+B)/3 ≤ 225. Thresholds here are our own tuning. Colour alone cannot tell smoke from fog,
 *   clouds or grey walls, which is why smoke is only confirmed by the temporal detector.
 *
 * LIMITATIONS (shown on the site): colour rules see sunsets, sodium street lamps, autumn leaves, flowers and
 * red paint as "fire-coloured"; the single-image cues reject some of these (smooth skies, thin highlights)
 * but not all. Their thresholds were hand-tuned on 32 photos; tools/manara/test-fire.mjs reports accuracy on
 * those AND on 18 photos never used to change the engine (the honest number: fire found in every test
 * fire photo, but about 1 in 4 non-fire photos raised a false fire alarm and single-photo smoke detection
 * mostly failed). Video needs a stable (hovering) camera. A real deployment would add a thermal camera
 * and a model trained on thousands of labelled images.
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  // Local aliases: in a Node vm context every global lookup is slow, and Math.abs runs per pixel.
  var M = Math, abs = M.abs, sqrt = M.sqrt, round = M.round, min = M.min, max = M.max, ceil = M.ceil, floor = M.floor;
  var F32 = Float32Array, U8 = Uint8Array, U8C = Uint8ClampedArray, U16 = Uint16Array, I32 = Int32Array;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sat01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ---------------------------------------------------------------- parameters
  function params(opts) {
    var o = opts || {};
    var s = clamp(o.sensitivity == null || isNaN(+o.sensitivity) ? 0.5 : +o.sensitivity, 0, 1);
    return {
      sensitivity: s,
      tau: o.tau != null ? +o.tau : 55 - 30 * s,     // Çelik & Demirel: |Cb − Cr| ≥ τ (τ = 40 at s = 0.5)
      rT: o.rT != null ? +o.rT : 135 - 20 * s,       // Chen et al.: R_T (125 at s = 0.5, range 115–135)
      sT: o.sT != null ? +o.sT : 65 - 10 * s,        // Chen et al.: S_T (60 at s = 0.5, range 55–65)
      coreY: 175,                                    // flame core: very bright fire pixels (studio-range Y)
      smokeAlpha: 12 + 16 * s,                       // grey: max − min ≤ alpha (20 at s = 0.5)
      smokeLo: 80, smokeHi: 225,                     // grey intensity band (dark grey … light grey)
      block: o.block ? clamp(o.block | 0, 2, 64) : 0,
      minArea: o.minArea != null ? +o.minArea : -1
    };
  }

  // Scratch buffers reused between calls (the colour planes never leave analyze()).
  var scratch = { n: 0, y: null, cb: null, cr: null };
  function planes(n) {
    if (scratch.n < n) { scratch.n = n; scratch.y = new F32(n); scratch.cb = new F32(n); scratch.cr = new F32(n); }
    return scratch;
  }

  // ---------------------------------------------------------------- regions on the block grid
  // count[b] = matching pixels in block b. A block is "on" if count ≥ max(minPx, frac·pixels).
  // 8-neighbour components, bridging gaps of one block (search radius 2).
  function components(count, px, gw, gh, frac, minPx) {
    var gn = gw * gh, on = new U8(gn), label = new I32(gn), comps = [], stack = [];
    for (var b = 0; b < gn; b++) on[b] = (px[b] > 0 && count[b] >= max(minPx, frac * px[b])) ? 1 : 0;
    for (var s = 0; s < gn; s++) {
      if (!on[s] || label[s]) continue;
      var id = comps.length + 1, c = { id: id, bx0: gw, by0: gh, bx1: -1, by1: -1, blocks: 0, count: 0, px: 0 };
      label[s] = id; stack.length = 0; stack.push(s);
      while (stack.length) {
        var k = stack.pop(), kx = k % gw, ky = (k - kx) / gw;
        c.blocks++; c.count += count[k]; c.px += px[k];
        if (kx < c.bx0) c.bx0 = kx; if (kx > c.bx1) c.bx1 = kx; if (ky < c.by0) c.by0 = ky; if (ky > c.by1) c.by1 = ky;
        for (var dy = -2; dy <= 2; dy++) {
          var ny = ky + dy; if (ny < 0 || ny >= gh) continue;
          for (var dx = -2; dx <= 2; dx++) {
            var nx = kx + dx; if (nx < 0 || nx >= gw) continue;
            var q = ny * gw + nx;
            if (on[q] && !label[q]) { label[q] = id; stack.push(q); }
          }
        }
      }
      comps.push(c);
    }
    return { comps: comps, label: label, on: on };
  }

  function toRegions(comps, B, w, h, kind, minArea, scoreScale) {
    var out = [];
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      if (c.count < minArea) continue;
      var x = c.bx0 * B, y = c.by0 * B;
      out.push({
        x: x, y: y, w: min(w, (c.bx1 + 1) * B) - x, h: min(h, (c.by1 + 1) * B) - y,
        area: c.count, kind: kind, blocks: c.blocks,
        score: round(sat01(c.count / max(1, c.px) * 1.6) * scoreScale * 1000) / 1000
      });
    }
    out.sort(function (a, b) { return b.area - a.area; });
    return out.slice(0, 16);
  }

  // ---------------------------------------------------------------- analyze
  function analyze(frame, opts) {
    var P = params(opts);
    var w = frame.width | 0, h = frame.height | 0, d = frame.data, n = w * h;
    if (n <= 0 || !d || d.length < n * 4) throw new Error('ManaraFire.analyze: frame needs {data: RGBA, width, height}');
    var pl = planes(n), Y = pl.y, CB = pl.cb, CR = pl.cr;
    var i, p, x, yy, r, g, b, k;

    // pass 1: YCbCr planes + frame means (Çelik's rules compare each pixel with the frame mean)
    var sy = 0, scb = 0, scr = 0;
    for (i = 0, p = 0; i < n; i++, p += 4) {
      r = d[p]; g = d[p + 1]; b = d[p + 2];
      var yv0 = 16 + 0.2568 * r + 0.5041 * g + 0.0979 * b;
      var cb0 = 128 - 0.1482 * r - 0.2910 * g + 0.4392 * b;
      var cr0 = 128 + 0.4392 * r - 0.3678 * g - 0.0714 * b;
      Y[i] = yv0; CB[i] = cb0; CR[i] = cr0; sy += yv0; scb += cb0; scr += cr0;
    }
    var mY = sy / n, mCb = scb / n, mCr = scr / n;

    // block grid
    var B = P.block || max(4, round(min(w, h) / 30));
    var gw = ceil(w / B), gh = ceil(h / B), gn = gw * gh;
    var gFire = new U16(gn), gSmoke = new U16(gn), gHot = new U16(gn), gPx = new U16(gn);
    var gPale = new U16(gn), gBlue = new U16(gn);
    var gY = new F32(gn), gEdge = new F32(gn), gChroma = new F32(gn);
    var bxOf = new U16(w);
    for (x = 0; x < w; x++) bxOf[x] = (x / B) | 0;

    var fireMask = new U8(n), smokeMask = new U8(n);
    var tau = P.tau, rT = P.rT, kS = P.sT / P.rT, coreY = P.coreY;
    var alpha = P.smokeAlpha, sLo = P.smokeLo * 3, sHi = P.smokeHi * 3;
    var fireCount = 0, bright = 0, smokeCount = 0, fireYSum = 0, texSum = 0, smooth = 0, blueSky = 0;

    // pass 2: per-pixel rules + block statistics
    for (yy = 0; yy < h; yy++) {
      var row = yy * w, gRow = ((yy / B) | 0) * gw;
      for (x = 0; x < w; x++) {
        i = row + x; p = i << 2;
        r = d[p]; g = d[p + 1]; b = d[p + 2];
        var bi = gRow + bxOf[x], yv = Y[i];
        gPx[bi]++; gY[bi] += yv;
        var e = 0;
        if (x > 0) e += abs(yv - Y[i - 1]);
        if (yy > 0) e += abs(yv - Y[i - w]);
        gEdge[bi] += e;
        var mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        var sum = r + g + b;
        gChroma[bi] += mx - mn;
        if (r >= 230 && g >= 190) gHot[bi]++;                          // near-saturated white / pale yellow
        if (b > r + 25 && b >= g && b > 100) { gBlue[bi]++; blueSky++; } // clear sky blue
        if (mx - mn <= 26 && sum >= 330 && sum <= 750) gPale[bi]++;     // pale grey / off-white (plume body)
        var cb = CB[i], cr = CR[i];
        // Çelik & Demirel 2009 (YCbCr)  AND  Chen et al. 2004 (RGB + HSI saturation in %)
        var sPct = 100 - 300 * mn / (sum || 1);
        if (yv > cb && cr > cb && yv > mY && cb < mCb && cr > mCr && cr - cb >= tau &&
            r > rT && r >= g && g > b && sPct >= (255 - r) * kS) {
          fireMask[i] = 1; fireCount++; gFire[bi]++; fireYSum += yv;
          if (yv >= coreY) bright++;
          var gx = (x > 0 && x < w - 1) ? abs(Y[i + 1] - Y[i - 1]) : 0;
          var gyv = (yy > 0 && yy < h - 1) ? abs(Y[i + w] - Y[i - w]) : 0;
          texSum += gx + gyv;
          if (gx + gyv < 3) smooth++;
        } else if (mx - mn <= alpha && sum >= sLo && sum <= sHi) {
          smokeMask[i] = 1; smokeCount++; gSmoke[bi]++;
        }
      }
    }
    for (k = 0; k < gn; k++) { var c0 = gPx[k] || 1; gY[k] /= c0; gEdge[k] /= c0; gChroma[k] /= c0; }

    // regions
    var minArea = P.minArea >= 0 ? P.minArea : max(6, n * 0.0004);
    var fc = components(gFire, gPx, gw, gh, 0.08, 2);
    var fireRegions = toRegions(fc.comps, B, w, h, 'fire', minArea, 1);
    var sc = components(gSmoke, gPx, gw, gh, 0.6, 4);
    var smokeRegions = toRegions(sc.comps.filter(function (c) { return c.blocks >= 4; }), B, w, h, 'smoke', max(minArea, n * 0.01), 0.5);

    // flame core: near-saturated white/pale-yellow pixels touching fire pixels (≤ 2 px away).
    // Only blocks next to fire blocks are scanned, so this stays cheap.
    var hotNear = 0;
    if (fireCount) {
      for (k = 0; k < gn; k++) {
        if (!gHot[k]) continue;
        var kx = k % gw, ky = (k - kx) / gw, near = false, dx, dy;
        for (dy = -1; dy <= 1 && !near; dy++) for (dx = -1; dx <= 1; dx++) {
          var nx = kx + dx, ny = ky + dy;
          if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && gFire[ny * gw + nx]) { near = true; break; }
        }
        if (!near) continue;
        var x0 = kx * B, y0 = ky * B, x1 = min(w, x0 + B), y1 = min(h, y0 + B);
        for (yy = y0; yy < y1; yy++) for (x = x0; x < x1; x++) {
          i = yy * w + x; p = i << 2;
          if (fireMask[i] || d[p] < 230 || d[p + 1] < 190) continue;
          var hit = false;
          for (dy = -2; dy <= 2 && !hit; dy++) {
            var py = yy + dy; if (py < 0 || py >= h) continue;
            for (dx = -2; dx <= 2; dx++) {
              var px2 = x + dx; if (px2 < 0 || px2 >= w) continue;
              if (fireMask[py * w + px2]) { hit = true; break; }
            }
          }
          if (hit) hotNear++;
        }
      }
    }

    // smoke plume cue: pale-grey blocks bordering clear-sky blocks, and how much pale grey lies on the ground
    var paleB = 0, plumeEdge = 0, paleLow = 0, low = floor(gh * 0.75), shN = 0, shS = 0, shSS = 0;
    for (k = 0; k < gn; k++) {
      var pk = gPx[k] || 1;
      if (gPale[k] < 0.6 * pk) continue;
      paleB++;
      var qx = k % gw, qy = (k - qx) / gw, sky = false;
      if (qy >= low) paleLow++;
      for (var ey = -1; ey <= 1 && !sky; ey++) for (var ex = -1; ex <= 1; ex++) {
        var mxb = qx + ex, myb = qy + ey;
        if (mxb >= 0 && myb >= 0 && mxb < gw && myb < gh) { var q = myb * gw + mxb; if (gBlue[q] >= 0.6 * (gPx[q] || 1)) { sky = true; break; } }
      }
      if (!sky) continue;
      plumeEdge++;
      // grey-level spread of the pale pixels here: smoke columns mix dense dark-grey cores and bright edges,
      // fair-weather clouds are evenly white
      for (yy = qy * B; yy < min(h, qy * B + B); yy++) for (x = qx * B; x < min(w, qx * B + B); x++) {
        p = (yy * w + x) << 2; r = d[p]; g = d[p + 1]; b = d[p + 2];
        var pmx = r > g ? (r > b ? r : b) : (g > b ? g : b), pmn = r < g ? (r < b ? r : b) : (g < b ? g : b), ps = r + g + b;
        if (pmx - pmn <= 26 && ps >= 330 && ps <= 750) { var pi = ps / 3; shN++; shS += pi; shSS += pi * pi; }
      }
    }

    var otherCount = n - fireCount, fcn = fireCount || 1;
    // compactness: fire pixels with a non-fire 4-neighbour (flames form solid bodies; on paint, glare and
    // lamps only thin highlights pass the rules)
    var edgePx = 0;
    if (fireCount) for (yy = 0; yy < h; yy++) for (x = 0, i = yy * w; x < w; x++, i++) {
      if (fireMask[i] && ((x > 0 && !fireMask[i - 1]) || (x < w - 1 && !fireMask[i + 1]) ||
                          (yy > 0 && !fireMask[i - w]) || (yy < h - 1 && !fireMask[i + w]))) edgePx++;
    }

    var a = {
      width: w, height: h,
      fireMask: fireMask, smokeMask: smokeMask,
      fireRatio: fireCount / n, smokeRatio: smokeCount / n,
      regions: fireRegions.concat(smokeRegions),
      stats: {
        meanY: mY, meanCb: mCb, meanCr: mCr, brightFire: bright,
        fireCount: fireCount, smokeCount: smokeCount,
        fireMeanY: fireCount ? fireYSum / fireCount : 0,
        otherMeanY: otherCount ? (sy - fireYSum) / otherCount : 0,
        fireTexture: fireCount ? texSum / fireCount : 0,
        fireSmooth: fireCount ? smooth / fireCount : 0,
        hotNearFire: hotNear,
        fireEdge: fireCount ? edgePx / fireCount : 0,
        paleBlocks: paleB / gn, plumeEdge: plumeEdge / gn, paleLow: paleB ? paleLow / paleB : 0,
        plumeShade: shN ? sqrt(max(0, shSS / shN - (shS / shN) * (shS / shN))) : 0,
        blueSky: blueSky / n
      },
      grid: { size: B, gw: gw, gh: gh, fire: gFire, smoke: gSmoke, hot: gHot, px: gPx, y: gY, edge: gEdge, chroma: gChroma, fireOn: fc.on },
      score: 0
    };
    a.score = round(features(a).fire * 1000) / 1000;
    return a;
  }

  // ---------------------------------------------------------------- still-image cues
  // Every cue is 0..1 and has a physical reason. Thresholds are hand-tuned at ≤ 320 px width (scoreImage
  // downscales larger pictures) — see LIMITATIONS.
  //   colour   enough fire-coloured pixels (≥ 0.15 % of the picture)          region  one coherent fire region
  //   compact  flames form solid bodies; on red paint, glare or lamps only thin highlights and edges pass the
  //            colour rules (share of fire pixels on the mask boundary > ~0.55 = thin structures)
  //   texture  flames are ragged; skies are smooth                            smoothSky  share of flat fire pixels
  //   wide     more than ~25 % of the picture "on fire" and smooth = a sky, not a fire
  //   core     flames are light sources: a white/pale-yellow core next to the orange rim (bonus, not required:
  //            well-exposed flame photos have no clipped core)
  //   glow     fire pixels much brighter than the rest of the picture (bonus)
  //   plume    pale-grey blocks bordering clear-blue-sky blocks (a smoke column against the sky)
  //   shade    those pale pixels span light AND dark grey (smoke) rather than an even white (fair-weather cloud)
  //   ground   share of that pale grey lying in the lowest quarter (roads, walls)   fog  pale grey almost everywhere
  // Known blind spots: autumn leaves, orange flowers and sodium-lit streets pass every fire cue; clouds with
  // dark grey bases against blue sky can pass the plume cues. Video (flicker, motion) is what separates them.
  function features(a) {
    var s = a.stats, n = a.width * a.height, fc = max(1, s.fireCount), top = null;
    for (var i = 0; i < a.regions.length; i++) if (a.regions[i].kind === 'fire') { top = a.regions[i]; break; }
    var f = {
      colour: sat01(a.fireRatio / 0.0015),
      region: top ? sat01(top.area / (n * 0.001)) : 0,
      compact: 1 - sat01((s.fireEdge - 0.55) / 0.15),
      texture: sat01((s.fireTexture - 6) / 14),
      smoothSky: sat01((s.fireSmooth - 0.25) / 0.5),
      wide: sat01((a.fireRatio - 0.25) / 0.35),
      core: 0.6 * sat01((s.hotNearFire / fc - 0.015) / 0.035) + 0.4 * sat01((s.brightFire / fc - 0.09) / 0.12),
      glow: sat01((s.fireMeanY - s.otherMeanY - 30) / 50),
      plume: sat01((s.plumeEdge - 0.03) / 0.04),
      shade: sat01((s.plumeShade - 18) / 12),
      ground: sat01((s.paleLow - 0.3) / 0.3),
      fog: sat01((s.paleBlocks - 0.5) / 0.3)
    };
    f.fire = sat01(f.colour * f.region * f.compact * (0.4 + 0.6 * f.texture) * (1 - 0.8 * f.smoothSky) *
                   (1 - 0.7 * f.wide * (1 - 0.5 * f.texture)) * (0.55 + 0.25 * f.core + 0.2 * f.glow));
    f.smoke = sat01(f.plume * f.shade * (1 - f.ground) * (1 - f.fog));
    return f;
  }

  function scoreImage(frame, opts) {
    var o = opts || {};
    var maxW = o.maxW || 320;
    var a = analyze(frame.width > maxW ? downscale(frame, maxW) : frame, o);
    var f = features(a);
    var fireT = o.fireThreshold != null ? o.fireThreshold : 0.5, smokeT = o.smokeThreshold != null ? o.smokeThreshold : 0.5;
    var label = 'none', score = 1 - max(f.fire, f.smoke);
    if (f.fire >= fireT) { label = 'fire'; score = f.fire; }
    else if (f.smoke >= smokeT) { label = 'smoke'; score = f.smoke; }
    var r3 = function (v) { return round(v * 1000) / 1000; };
    return { label: label, score: r3(score), fire: r3(f.fire), smoke: r3(f.smoke), features: f, analysis: a };
  }

  // ---------------------------------------------------------------- downscale (box filter)
  function downscale(frame, maxW) {
    var sw = frame.width | 0, sh = frame.height | 0;
    if (!maxW || sw <= maxW) return frame;
    var dw = maxW | 0, dh = max(1, round(sh * dw / sw)), s = frame.data;
    var out = new U8C(dw * dh * 4);
    var xs = new I32(dw + 1), ys = new I32(dh + 1), x, y;
    for (x = 0; x <= dw; x++) xs[x] = min(sw, round(x * sw / dw));
    for (y = 0; y <= dh; y++) ys[y] = min(sh, round(y * sh / dh));
    for (y = 0; y < dh; y++) {
      var y0 = ys[y], y1 = max(y0 + 1, ys[y + 1]);
      for (x = 0; x < dw; x++) {
        var x0 = xs[x], x1 = max(x0 + 1, xs[x + 1]), r = 0, g = 0, b = 0, al = 0, c = 0;
        for (var yy = y0; yy < y1; yy++) {
          var p = (yy * sw + x0) << 2;
          for (var xx = x0; xx < x1; xx++, p += 4) { r += s[p]; g += s[p + 1]; b += s[p + 2]; al += s[p + 3]; c++; }
        }
        var q = (y * dw + x) << 2;
        out[q] = r / c; out[q + 1] = g / c; out[q + 2] = b / c; out[q + 3] = al / c;
      }
    }
    return { data: out, width: dw, height: dh };
  }

  // ---------------------------------------------------------------- temporal detector
  function createDetector(opts) {
    var o = {};
    var src = opts || {};
    for (var key in src) if (Object.prototype.hasOwnProperty.call(src, key)) o[key] = src[key];
    var confirmFrames = o.confirmFrames || 8, clearFrames = o.clearFrames || 10, smokeFrames = o.smokeFrames || 12;
    var windowMs = o.windowMs || 1500, flickerMin = o.flickerMin != null ? o.flickerMin : 0.2;
    var minFireRatio = o.minFireRatio != null ? o.minFireRatio : 0.0008, minSmokeRatio = o.minSmokeRatio != null ? o.minSmokeRatio : 0.01;
    var S;

    function reset() {
      S = { w: 0, h: 0, gn: 0, prevMask: null, prevY: null, bgY: null, bgEdge: null, bgChroma: null, hist: [],
            fireRun: 0, smokeRun: 0, calmRun: 0, noFireRun: 0, staticRun: 0, state: 'clear',
            firstSuspectMs: null, alertMs: null, smokeSeenMs: null, lastT: null, frames: 0 };
    }
    reset();

    function push(frame, tMs) {
      var t = tMs != null && isFinite(tMs) ? +tMs : (S.lastT == null ? 0 : S.lastT + 66);
      S.lastT = t; S.frames++;
      var a = analyze(frame, o), G = a.grid, n = a.width * a.height, gn = G.gw * G.gh, k;
      if (a.width !== S.w || a.height !== S.h || gn !== S.gn) {           // new size: restart the temporal state
        reset();
        S.w = a.width; S.h = a.height; S.gn = gn; S.lastT = t; S.frames = 1;
      }

      // --- global change (camera motion / exposure jumps) on non-fire blocks
      var globalChange = 0, gcCount = 0;
      if (S.prevY) {
        for (k = 0; k < gn; k++) if (!G.fireOn[k]) { globalChange += abs(G.y[k] - S.prevY[k]); gcCount++; }
        globalChange = gcCount ? globalChange / gcCount : 0;
      }
      var steady = 1 - sat01((globalChange - 3) / 9);                     // 1 = still camera

      // --- flicker: fire-mask toggling + luminance change of fire blocks
      var flickFrame = null;
      if (S.prevMask) {
        var m0 = S.prevMask, m1 = a.fireMask, xr = 0, or = 0;
        for (var i = 0; i < n; i++) { var u = m0[i] | m1[i]; if (u) { or++; if (m0[i] !== m1[i]) xr++; } }
        var dY = 0, fb = 0;
        for (k = 0; k < gn; k++) if (G.fireOn[k]) { dY += abs(G.y[k] - S.prevY[k]); fb++; }
        dY = fb ? dY / fb : 0;
        if (or >= 12) {
          var toggle = xr / or;
          flickFrame = (0.6 * sat01((toggle - 0.06) / 0.25) + 0.4 * sat01((dY - 1.5) / 8)) * steady;
        } else flickFrame = 0;
      }

      // --- smoke: grey blocks that moved away from a slow background, change slowly, and got no sharper
      var activeN = 0, cx = 0, cy = 0, smokePx = new U16(gn);
      if (!S.bgY) { S.bgY = F32.from(G.y); S.bgEdge = F32.from(G.edge); S.bgChroma = F32.from(G.chroma); }
      else {
        var cameraMoving = steady < 0.5;
        for (k = 0; k < gn; k++) {
          var grey = G.smoke[k] / (G.px[k] || 1), change = abs(G.y[k] - S.bgY[k]);
          var slow = !S.prevY || abs(G.y[k] - S.prevY[k]) <= 20;
          var on = !cameraMoving && grey >= 0.5 && change >= 2.5 && slow && !G.fireOn[k] &&
                   G.edge[k] <= S.bgEdge[k] * 1.15 + 0.5 && G.chroma[k] <= S.bgChroma[k] + 4;
          if (on) { activeN++; cx += k % G.gw; cy += (k / G.gw) | 0; smokePx[k] = G.smoke[k]; }
          var rate = cameraMoving ? 0.3 : on ? 0.004 : 0.04;
          S.bgY[k] += (G.y[k] - S.bgY[k]) * rate; S.bgEdge[k] += (G.edge[k] - S.bgEdge[k]) * rate; S.bgChroma[k] += (G.chroma[k] - S.bgChroma[k]) * rate;
        }
      }
      var smokeShare = activeN / gn;
      if (activeN) { cx /= activeN; cy /= activeN; }

      // fire centroid (block grid, pixel units) — to tell a sliding fire-coloured object from flicker
      var fx = 0, fy = 0, fsum = 0;
      for (k = 0; k < gn; k++) if (G.fire[k]) { var fcnt = G.fire[k]; fsum += fcnt; fx += fcnt * (k % G.gw); fy += fcnt * ((k / G.gw) | 0); }
      if (fsum) { fx = (fx / fsum + 0.5) * G.size; fy = (fy / fsum + 0.5) * G.size; }

      // --- history window
      S.hist.push({ t: t, fireRatio: a.fireRatio, flick: flickFrame, smoke: smokeShare, cx: cx, cy: cy, fx: fx, fy: fy, fs: fsum });
      while (S.hist.length > 2 && (t - S.hist[0].t > windowMs || S.hist.length > 90)) S.hist.shift();
      var fs = 0, fsn = 0, H = S.hist, j;
      for (j = 0; j < H.length; j++) if (H[j].flick != null) { fs += H[j].flick; fsn++; }
      // translation check: flames jitter in place (net displacement ≪ path), objects slide (net ≈ path)
      var path = 0, size = 0, ns = 0, first = null, last = null, prevE = null;
      for (j = 0; j < H.length; j++) {
        var hj = H[j]; if (!hj.fs) { prevE = null; continue; }
        if (!first) first = hj; last = hj; size += sqrt(hj.fs); ns++;
        if (prevE) path += sqrt((hj.fx - prevE.fx) * (hj.fx - prevE.fx) + (hj.fy - prevE.fy) * (hj.fy - prevE.fy));
        prevE = hj;
      }
      var motion = 0;
      if (ns >= 3 && path > 0) {
        var net = sqrt((last.fx - first.fx) * (last.fx - first.fx) + (last.fy - first.fy) * (last.fy - first.fy));
        motion = sat01((net / (size / ns) - 0.3) / 0.4) * sat01((net / path - 0.5) / 0.3);
      }
      var flicker = (fsn ? fs / fsn : 0) * (1 - motion);
      // growth: least-squares slope of the fire ratio (per second) relative to its mean
      var growth = 0;
      if (H.length >= 3) {
        var mt = 0, mr = 0;
        for (j = 0; j < H.length; j++) { mt += H[j].t; mr += H[j].fireRatio; }
        mt /= H.length; mr /= H.length;
        var num = 0, den = 0;
        for (j = 0; j < H.length; j++) { num += (H[j].t - mt) * (H[j].fireRatio - mr); den += (H[j].t - mt) * (H[j].t - mt); }
        if (den > 0 && mr > 1e-5) growth = clamp((num / den) * 1000 / mr, -1, 1);
      }
      // smoke drifts or grows: compare with the oldest window entry that had smoke
      var smokeDynamic = false;
      for (j = 0; j < H.length - 1; j++) if (H[j].smoke > 0) {
        var h0 = H[j];
        smokeDynamic = activeN > 0 && (abs(cx - h0.cx) + abs(cy - h0.cy) >= 0.75 || abs(smokeShare - h0.smoke) >= 0.15 * max(smokeShare, h0.smoke));
        break;
      }

      // --- evidence counters
      var fireRegion = false;
      for (j = 0; j < a.regions.length; j++) if (a.regions[j].kind === 'fire') { fireRegion = true; break; }
      var suspicious = fireRegion && a.fireRatio >= minFireRatio;
      S.fireRun = suspicious ? S.fireRun + 1 : max(0, S.fireRun - 2);
      var smoky = smokeShare >= minSmokeRatio;
      S.smokeRun = smoky ? S.smokeRun + 1 : max(0, S.smokeRun - 2);
      if (smoky && smokeDynamic) S.smokeSeenMs = t;
      var smokeMoving = S.smokeSeenMs != null && t - S.smokeSeenMs <= windowMs * 2;
      S.calmRun = (!suspicious && !smoky) ? S.calmRun + 1 : 0;
      S.noFireRun = suspicious ? 0 : S.noFireRun + 1;
      S.staticRun = (suspicious && fsn >= 3 && flicker < flickerMin * 0.5) ? S.staticRun + 1 : 0;

      var fireOK = S.fireRun >= confirmFrames && fsn >= 2 && flicker >= flickerMin;
      var smokeOK = S.smokeRun >= smokeFrames && smokeMoving;
      var prev = S.state, next;
      if (prev === 'fire') {
        if (S.noFireRun >= clearFrames) next = smokeOK ? 'smoke' : S.smokeRun > 0 ? 'suspect' : 'clear';
        else if (S.staticRun >= clearFrames) next = 'suspect';
        else next = 'fire';
      } else if (fireOK) next = 'fire';
      else if (smokeOK) next = 'smoke';
      else if (prev === 'smoke' && S.calmRun < clearFrames) next = 'smoke';
      else if (suspicious || S.smokeRun >= ceil(smokeFrames / 3)) next = 'suspect';
      else if (prev === 'suspect' && S.calmRun < 3) next = 'suspect';
      else next = 'clear';
      S.state = next;
      if (next === 'clear') { S.firstSuspectMs = null; S.alertMs = null; }
      else {
        if (S.firstSuspectMs == null) S.firstSuspectMs = t;
        if ((next === 'fire' || next === 'smoke') && S.alertMs == null) S.alertMs = t;
      }

      // --- confidence (belief that the event is real)
      var runF = sat01(S.fireRun / confirmFrames), runS = sat01(S.smokeRun / smokeFrames), smokeLevel = sat01(smokeShare * 10);
      var confidence;
      if (next === 'fire') confidence = 0.55 + 0.2 * runF + 0.25 * sat01(flicker / 0.6) + 0.05 * max(0, growth);
      else if (next === 'smoke') confidence = 0.45 + 0.25 * runS + 0.3 * smokeLevel;
      else if (next === 'suspect') confidence = 0.15 + 0.25 * max(runF * (0.4 + 0.6 * sat01(flicker / flickerMin)), runS * 0.8);
      else confidence = 0.1 * max(a.score, runS);
      confidence = round(sat01(confidence) * 1000) / 1000;

      var reasons = [];
      if (suspicious) reasons.push('colour');
      if (flicker >= flickerMin) reasons.push('flicker');
      if (growth > 0.1 && suspicious) reasons.push('growth');
      if (suspicious && fsn >= 3 && flicker < flickerMin * 0.5) reasons.push('static');
      if (smoky && smokeMoving) reasons.push('smoke-motion');
      if (steady < 0.5) reasons.push('camera-motion');
      if (motion > 0.5 && suspicious) reasons.push('moving');

      // smoke regions in the returned frame = temporally active smoke blocks
      var sc = components(smokePx, G.px, G.gw, G.gh, 0, 1);
      var smokeRegions = toRegions(sc.comps.filter(function (c) { return c.blocks >= 3; }), G.size, a.width, a.height, 'smoke', n * 0.004, 1);
      a.regions = a.regions.filter(function (r) { return r.kind === 'fire'; }).concat(smokeRegions);

      S.prevMask = a.fireMask; S.prevY = G.y;
      return {
        state: next, confidence: confidence,
        flicker: round(flicker * 1000) / 1000, growth: round(growth * 1000) / 1000,
        smoke: round(smokeLevel * 1000) / 1000,
        frame: a, firstSuspectMs: S.firstSuspectMs, alertMs: S.alertMs, reasons: reasons
      };
    }

    return { push: push, reset: reset, opts: o };
  }

  var API = {
    VERSION: VERSION,
    params: params,
    analyze: analyze,
    features: features,
    scoreImage: scoreImage,
    downscale: downscale,
    createDetector: createDetector
  };
  root.ManaraFire = API;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
