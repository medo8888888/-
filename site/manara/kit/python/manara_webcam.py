#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MANARA («منارة») — fire-colour + flicker detector for a laptop webcam or a video file.

WHAT THIS IS (and is not)
  The same idea as the browser engine site/manara/js/fire.js, written with numpy only:
    C1 colour    a pixel is "fire-coloured" only if it passes BOTH a YCbCr rule
                 (Celik & Demirel 2009, Fire Safety Journal 44(2):147-158) AND an RGB/HSI rule
                 (Chen, Wu & Chiou 2004, IEEE ICIP, pp.1707-1710)
    C3 flicker   flames change shape and brightness several times a second while staying in
                 place; a red scarf, a lamp or a red car does not
    C5 persistence the evidence must hold for several frames in a row
  It is RULE-BASED computer vision (colour models + flicker analysis). It is NOT machine
  learning and NOT "AI". It is a simplified port: it has no smoke detector, no texture/shape
  layer and no thermal veto. Nobody has measured its accuracy, so this file makes no accuracy
  claim (the browser engine's honest held-out result on still images is 66.7 %, see the
  Evidence Lab page). Colour rules also see sunsets, orange lamps, sodium street lights and
  red paint. NEVER use this as a fire alarm. One camera is one key: in MANARA it can only ever
  raise SUSPECT; the second key (thermal / gas) and a human decide.

WHAT YOU NEED
  Required : Python 3.8+ and numpy              (pip install numpy)
  Optional : opencv-python  -> --camera N and --video FILE and --show
             Pillow         -> nothing here needs it
  Without OpenCV it still runs:  --demo,  --selftest,  --raw (frames piped from ffmpeg),  --ppm DIR

EXAMPLES
  python manara_webcam.py --selftest                  # 4 synthetic scenes, prints PASS/FAIL, no hardware
  python manara_webcam.py --demo [--fast]             # same scenes in real time, with a live status line
  python manara_webcam.py --camera 0 --show           # laptop webcam (needs opencv-python)
  python manara_webcam.py --video clip.mp4            # a video file (needs opencv-python)
  ffmpeg -i clip.mp4 -vf scale=320:240 -f rawvideo -pix_fmt rgb24 - | python manara_webcam.py --raw 320x240 --fps 15
  python manara_webcam.py --camera 0 --jsonl events.jsonl   # one line per state change

SAFETY: filming a real flame is outside this kit. Test with the hot mug, a phone playing a
fire video, and the decoys listed on the Evidence Lab page. No open flame at the booth.
"""
from __future__ import print_function

import argparse
import collections
import json
import os
import sys
import time

import numpy as np

# Thresholds = the values js/fire.js uses at sensitivity 0.5 (Celik tau = 40; Chen R_T = 125, S_T = 60).
TAU = 40.0
R_T = 125.0
S_T = 60.0
MIN_FIRE_RATIO = 0.0008      # share of the frame that must be fire-coloured to count as "suspicious"
MAX_WIDTH = 320              # frames wider than this are subsampled first, so thresholds do not depend on resolution


def _sat(v):
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else float(v))


def _shrink(rgb, max_w=MAX_WIDTH):
    h, w = rgb.shape[:2]
    k = max(1, int(np.ceil(w / float(max_w))))
    return rgb[::k, ::k, :3] if k > 1 else rgb[..., :3]


def _luma_and_mask(rgb, tau=TAU, r_t=R_T, s_t=S_T):
    """Return (luma plane float32, fire mask bool). rgb is HxWx3 uint8 in RGB order."""
    f = np.asarray(rgb)[..., :3].astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    y = 16.0 + 0.2568 * r + 0.5041 * g + 0.0979 * b
    cb = 128.0 - 0.1482 * r - 0.2910 * g + 0.4392 * b
    cr = 128.0 + 0.4392 * r - 0.3678 * g - 0.0714 * b
    my, mcb, mcr = float(y.mean()), float(cb.mean()), float(cr.mean())
    mn = f.min(axis=2)
    total = np.maximum(f.sum(axis=2), 1.0)
    s_pct = 100.0 - 300.0 * mn / total                      # HSI saturation in percent
    mask = (
        (y > cb) & (cr > cb) & (y > my) & (cb < mcb) & (cr > mcr) & ((cr - cb) >= tau)   # Celik & Demirel
        & (r > r_t) & (r >= g) & (g > b) & (s_pct >= (255.0 - r) * (s_t / r_t))           # Chen et al.
    )
    return y, mask


def detect_frame(rgb, tau=TAU, r_t=R_T, s_t=S_T):
    """Single-frame colour analysis (layer C1). Pure function: no state, no I/O.

    rgb : numpy array, height x width x 3 (or 4), dtype uint8, RGB order.
    Returns a dict:
      mask        bool array, True where the pixel is fire-coloured
      fire_pixels number of such pixels
      fire_ratio  fire_pixels / all pixels   (0..1)
      cx, cy      centroid of the fire-coloured pixels in pixels, or None
      suspicious  True when fire_ratio >= MIN_FIRE_RATIO and at least 12 pixels
    One frame can never tell fire from an orange lamp: use FlickerDetector for video.
    """
    arr = np.asarray(rgb)
    if arr.ndim != 3 or arr.shape[2] < 3:
        raise ValueError("detect_frame needs an array of shape (height, width, 3)")
    _, mask = _luma_and_mask(arr, tau, r_t, s_t)
    n = int(mask.sum())
    ratio = n / float(mask.size)
    if n:
        ys, xs = np.nonzero(mask)
        cx, cy = float(xs.mean()), float(ys.mean())
    else:
        cx = cy = None
    return {"mask": mask, "fire_pixels": n, "fire_ratio": ratio, "cx": cx, "cy": cy,
            "suspicious": bool(ratio >= MIN_FIRE_RATIO and n >= 12)}


class FlickerDetector(object):
    """Video layer: colour (C1) + flicker (C3) + persistence (C5), with hysteresis.

    push(rgb) -> {"state": "clear" | "suspect" | "fire", "confidence", "flicker", "fire_ratio", "reasons": [...]}

    flicker (0..1) = mean over the last ~1.5 s of
        0.6 * how much the fire-coloured area toggles between frames  (|M_t xor M_t-1| / |M_t or M_t-1|)
      + 0.4 * how much the brightness inside that area changes,
      discounted when the whole picture changes (camera moving) and when the fire-coloured
      shape slides as one piece (a red car), because flames jitter in place.
    'fire' needs `confirm_frames` suspicious frames in a row AND flicker >= flicker_min, so a
    static fire-coloured object (lamp, scarf, red wall) stays at most 'suspect'.
    """

    def __init__(self, fps=15.0, window_s=1.5, confirm_frames=8, clear_frames=10, flicker_min=0.2):
        self.fps = float(fps) if fps and fps > 0 else 15.0
        n = max(3, int(round(self.fps * window_s)))
        self.flicks = collections.deque(maxlen=n)
        self.cents = collections.deque(maxlen=n)
        self.confirm_frames = int(confirm_frames)
        self.clear_frames = int(clear_frames)
        self.flicker_min = float(flicker_min)
        self.reset()

    def reset(self):
        self.prev_mask = None
        self.prev_y = None
        self.run = 0
        self.calm = 0
        self.static_run = 0
        self.state = "clear"
        self.flicks.clear()
        self.cents.clear()

    def push(self, rgb):
        small = _shrink(np.asarray(rgb))
        y, mask = _luma_and_mask(small)
        n = int(mask.sum())
        ratio = n / float(mask.size)
        suspicious = ratio >= MIN_FIRE_RATIO and n >= 12
        reasons = []

        flick = 0.0
        if self.prev_mask is not None and self.prev_mask.shape == mask.shape:
            union = self.prev_mask | mask
            u = int(union.sum())
            if u >= 12:
                toggle = float((self.prev_mask ^ mask).sum()) / u
                d_y = float(np.abs(y - self.prev_y)[union].mean())
                outside = ~union
                change = float(np.abs(y - self.prev_y)[outside].mean()) if outside.any() else 0.0
                steady = 1.0 - _sat((change - 3.0) / 9.0)                  # 1 = a still camera
                flick = (0.6 * _sat((toggle - 0.06) / 0.25) + 0.4 * _sat((d_y - 1.5) / 8.0)) * steady
                if steady < 0.5:
                    reasons.append("camera-motion")
        self.prev_mask, self.prev_y = mask, y

        if n:
            ys, xs = np.nonzero(mask)
            self.cents.append((float(xs.mean()), float(ys.mean())))
        else:
            self.cents.append(None)
        self.flicks.append(flick)
        flicker = float(sum(self.flicks)) / len(self.flicks)
        pts = [p for p in self.cents if p is not None]
        if len(pts) >= 4:
            path = sum(((pts[i + 1][0] - pts[i][0]) ** 2 + (pts[i + 1][1] - pts[i][1]) ** 2) ** 0.5 for i in range(len(pts) - 1))
            net = ((pts[-1][0] - pts[0][0]) ** 2 + (pts[-1][1] - pts[0][1]) ** 2) ** 0.5
            if path > 3.0 and net / path > 0.6:                           # the whole window slides as one piece: not a flame
                flicker *= 0.25
                reasons.append("sliding")

        if suspicious:
            self.run += 1
        else:
            self.run = max(0, self.run - 2)
        # a "calm" frame = nothing fire-coloured, OR fire-coloured but no longer flickering (a lamp
        # that replaced the flame): ten calm frames in a row end the 'fire' state
        if (not suspicious) or flicker < self.flicker_min * 0.5:
            self.calm += 1
        else:
            self.calm = 0
        self.static_run = self.static_run + 1 if (suspicious and flicker < self.flicker_min * 0.5) else 0

        if self.state == "fire":
            if self.calm >= self.clear_frames:
                self.state = "clear"
        elif self.run >= self.confirm_frames and flicker >= self.flicker_min:
            self.state = "fire"
        elif suspicious or self.run >= 2:          # a one-frame miss does not drop the suspicion
            self.state = "suspect"
        else:
            self.state = "clear"

        run_f = _sat(self.run / float(self.confirm_frames))
        if self.state == "fire":
            conf = 0.55 + 0.2 * run_f + 0.25 * _sat(flicker / 0.6)
        elif self.state == "suspect":
            conf = 0.15 + 0.25 * run_f * (0.4 + 0.6 * _sat(flicker / self.flicker_min))
        else:
            conf = 0.0
        if suspicious:
            reasons.append("colour")
        if flicker >= self.flicker_min:
            reasons.append("flicker")
        if self.static_run >= 3:
            reasons.append("static")
        return {"state": self.state, "confidence": round(min(conf, 0.99), 3), "flicker": round(flicker, 3),
                "fire_ratio": round(ratio, 5), "reasons": reasons}


# ---------------------------------------------------------------------------------------------
# synthetic scenes (so the script runs with no camera, and so the tests have known truth)
# ---------------------------------------------------------------------------------------------
def demo_frame(kind, t, size=(180, 240), seed=1):
    """One synthetic RGB frame. kind: 'flame' | 'lamp' | 'car' | 'empty'. t = frame number."""
    h, w = size
    rng = np.random.RandomState(seed * 100003 + int(t))
    img = np.empty((h, w, 3), np.uint8)
    img[:] = (22, 24, 34)
    img += rng.randint(0, 4, size=(h, w, 1)).astype(np.uint8)          # sensor noise
    yy, xx = np.mgrid[0:h, 0:w]
    if kind == "flame":
        cx, base = w * 0.5, h * 0.82
        for k in range(3):                                              # three tongues, each different every frame
            off = rng.uniform(-14, 14)
            height = rng.uniform(0.28, 0.5) * h
            width = rng.uniform(10, 20)
            dx = (xx - (cx + off)) / width
            dy = (base - yy) / height
            inside = (dy > 0) & (dy < 1) & (np.abs(dx) < (1.0 - dy) * 1.0 + rng.uniform(-0.15, 0.15))
            heat = np.clip(1.0 - dy, 0, 1) * rng.uniform(0.75, 1.0)
            rr = np.where(inside, 255, 0)
            gg = np.where(inside, 90 + 150 * heat, 0)
            bb = np.where(inside, 10 + 60 * heat * heat, 0)
            img[inside] = np.stack([rr, gg, bb], axis=-1)[inside].astype(np.uint8)
    elif kind == "lamp":
        img[60:110, 90:140] = (255, 150, 30)                            # a static orange lamp / wall / scarf
    elif kind == "car":
        x0 = int(t * 3) % (w + 55) - 55                                # drives in from the left, out on the right
        lo, hi = max(x0, 0), min(x0 + 55, w)
        if hi > lo:
            img[90:125, lo:hi] = (235, 70, 30)                         # a red car sliding past
    return img


def _scene_source(kind, n, size=(180, 240)):
    for t in range(n):
        yield demo_frame(kind, t, size)


def run_selftest(fps=15.0, verbose=True):
    """Synthetic scenes with known truth. Returns True when every one behaves."""
    ok = True
    results = {}
    for kind, want in (("empty", ("clear",)), ("lamp", ("suspect",)), ("car", ("clear", "suspect")), ("flame", ("fire",))):
        det = FlickerDetector(fps=fps)
        last = None
        states = []
        for fr in _scene_source(kind, 60):
            last = det.push(fr)
            states.append(last["state"])
        must_never_fire = kind != "flame"          # a lamp, a sliding car and an empty room must never reach 'fire'
        good = last["state"] in want and not (must_never_fire and "fire" in states)
        results[kind] = (last["state"], good)
        ok = ok and good
        if verbose:
            print("  %-6s -> %-8s flicker=%.2f  %s" % (kind, last["state"], last["flicker"], "PASS" if good else "FAIL"))
    # a flame that is replaced by a static lamp must not stay 'fire' for ever
    det = FlickerDetector(fps=fps)
    last = None
    for kind in ("flame", "lamp"):
        for t in range(70):
            last = det.push(demo_frame(kind, t))
    good = last["state"] == "suspect"
    ok = ok and good
    if verbose:
        print("  %-6s -> %-8s flicker=%.2f  %s" % ("flame>lamp", last["state"], last["flicker"], "PASS" if good else "FAIL"))
    return ok


# ---------------------------------------------------------------------------------------------
# frame sources
# ---------------------------------------------------------------------------------------------
def source_demo(seconds_per_scene=6, fps=15.0):
    for kind in ("empty", "flame", "lamp", "car", "flame"):
        for t in range(int(seconds_per_scene * fps)):
            yield kind, demo_frame(kind, t)


def source_raw(width, height):
    n = width * height * 3
    stream = sys.stdin.buffer
    while True:
        buf = stream.read(n)
        if len(buf) < n:
            return
        yield None, np.frombuffer(buf, np.uint8).reshape(height, width, 3)


def read_ppm(path):
    """Read a binary 8-bit PPM (P6). Header comments (# ...) are allowed."""
    with open(path, "rb") as f:
        data = f.read()
    pos, tokens = 0, []
    while len(tokens) < 4:                              # magic, width, height, maxval
        while pos < len(data) and data[pos:pos + 1].isspace():
            pos += 1
        if data[pos:pos + 1] == b"#":                   # comment: skip to end of line
            while pos < len(data) and data[pos:pos + 1] != b"\n":
                pos += 1
            continue
        start = pos
        while pos < len(data) and not data[pos:pos + 1].isspace():
            pos += 1
        if start == pos:
            raise ValueError("%s: truncated PPM header" % path)
        tokens.append(data[start:pos])
    pos += 1                                            # exactly one whitespace byte after maxval
    if tokens[0] != b"P6":
        raise ValueError("%s is not a binary PPM (P6)" % path)
    w, h, mx = int(tokens[1]), int(tokens[2]), int(tokens[3])
    if mx != 255:
        raise ValueError("only 8-bit PPM is supported")
    pix = np.frombuffer(data, np.uint8, count=w * h * 3, offset=pos)
    return pix.reshape(h, w, 3)


def source_ppm(folder):
    for name in sorted(os.listdir(folder)):
        if name.lower().endswith(".ppm"):
            yield None, read_ppm(os.path.join(folder, name))


def source_cv(target):
    try:
        import cv2  # optional
    except ImportError:
        sys.exit("OpenCV is not installed. Use --demo, --raw or --ppm, or: pip install opencv-python")
    cap = cv2.VideoCapture(target)
    if not cap.isOpened():
        sys.exit("Could not open %r" % (target,))
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    try:
        while True:
            ok, bgr = cap.read()
            if not ok:
                return
            yield fps, bgr[..., ::-1].copy()          # BGR -> RGB
    finally:
        cap.release()


def main(argv=None):
    ap = argparse.ArgumentParser(description="MANARA fire-colour + flicker detector (rule-based computer vision, not AI).")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--selftest", action="store_true", help="run 4 synthetic scenes and exit 0 on success")
    g.add_argument("--demo", action="store_true", help="synthetic scenes with a live status line (no hardware)")
    g.add_argument("--camera", type=int, metavar="N", help="webcam index (needs opencv-python)")
    g.add_argument("--video", metavar="FILE", help="video file (needs opencv-python)")
    g.add_argument("--raw", metavar="WxH", help="raw rgb24 frames on stdin, e.g. from ffmpeg (numpy only)")
    g.add_argument("--ppm", metavar="DIR", help="folder of binary .ppm frames (numpy only)")
    ap.add_argument("--fps", type=float, default=0.0, help="frame rate if the source does not tell us (default 15)")
    ap.add_argument("--fast", action="store_true", help="with --demo: do not wait, run as fast as possible")
    ap.add_argument("--jsonl", metavar="FILE", help="append one detection event per state change")
    ap.add_argument("--show", action="store_true", help="show a window with the fire mask (needs opencv-python)")
    a = ap.parse_args(argv)

    if a.selftest:
        print("MANARA webcam detector self-test (synthetic scenes, rule-based):")
        good = run_selftest()
        print("self-test:", "PASS" if good else "FAIL")
        return 0 if good else 1

    source = "video"
    if a.demo:
        frames, source = source_demo(), "video"
    elif a.camera is not None:
        frames, source = source_cv(a.camera), "camera"
    elif a.video:
        frames = source_cv(a.video)
    elif a.raw:
        try:
            w, h = [int(v) for v in a.raw.lower().split("x")]
        except ValueError:
            sys.exit("--raw needs WxH, for example 320x240")
        frames = source_raw(w, h)
    elif a.ppm:
        frames = source_ppm(a.ppm)
    else:
        ap.print_help()
        return 2

    det = FlickerDetector(fps=a.fps or 15.0)
    out = open(a.jsonl, "a") if a.jsonl else None
    last_state, n, t0, last_print = None, 0, time.time(), 0.0
    try:
        for tag, rgb in frames:
            if isinstance(tag, float) and tag > 0 and a.fps == 0:      # cv2 told us the real fps
                det.fps = tag
            n += 1
            res = det.push(rgb)
            if a.demo and not a.fast:
                time.sleep(1.0 / det.fps)
            now = (n / det.fps) if (a.demo and a.fast) else time.time() - t0
            if res["state"] != last_state and out:
                out.write(json.dumps({"type": "detection", "source": source, "state": res["state"],
                                      "confidence": res["confidence"], "fireRatio": res["fire_ratio"],
                                      "t": round(now, 2)}) + "\n")
                out.flush()
            last_state = res["state"]
            if now - last_print >= 1.0:
                last_print = now
                scene = (" scene=%s" % tag) if (a.demo and isinstance(tag, str)) else ""
                print("t=%6.1fs frame=%5d state=%-7s confidence=%.2f flicker=%.2f fire=%.2f%% %s%s" % (
                    now, n, res["state"].upper(), res["confidence"], res["flicker"], 100 * res["fire_ratio"],
                    ",".join(res["reasons"]), scene))
                sys.stdout.flush()
            if a.show:
                import cv2
                m = (_luma_and_mask(_shrink(rgb))[1] * 255).astype(np.uint8)
                cv2.imshow("MANARA fire mask (q = quit)", m)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    except (KeyboardInterrupt, BrokenPipeError):
        pass
    finally:
        if out:
            out.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
