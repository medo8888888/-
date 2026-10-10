#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for the MANARA kit (site/manara/kit): run on a PC, no hardware needed.

    python3 tools/manara/test_kit.py

What is tested (and what is NOT):
  1. python/manara_webcam.py   detect_frame() and FlickerDetector on synthetic frames with known truth,
                               the numpy-only input paths (--raw, --ppm), no top-level OpenCV import.
  2. .ino static lint          balanced braces / parentheses / #if, every PIN_ used is #define'd (and every
                               #define'd PIN_ is used), no GPIO clashes or unsafe pins, JSON key names are exactly
                               protocol v1 from docs/MANARA-SPEC.md, hazard names, honesty marker, no blocking
                               `while (!Serial)`, library includes are documented in the README.
  3. The firmware's pure logic (the block marked MANARA-PURE) is compiled with g++ and RUN: wet bulb, WBGT,
     heat index (compared with the website's own functions through node), hot-spot test (compared with
     js/detect.js), fall logic, `signs` parser, JSON writers (parsed with json.loads), buffer sizes.
  4. Both sketches are syntax/type-checked with g++ against STUB headers that copy the documented library
     signatures (several #define combinations). This catches typos and wrong types. It does NOT prove the
     sketch works on a real ESP32: nobody has flashed it yet.
Skipped (with a notice) when g++ or node is missing.
"""
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True          # never leave __pycache__ folders inside the kit
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SITE = os.path.join(ROOT, "site", "manara")
KIT = os.path.join(SITE, "kit")
SENT = os.path.join(KIT, "firmware", "manara_sentinel", "manara_sentinel.ino")
SAFE = os.path.join(KIT, "firmware", "manara_safepoint", "manara_safepoint.ino")
PYF = os.path.join(KIT, "python", "manara_webcam.py")
README = os.path.join(KIT, "README.md")
SPEC = os.path.join(ROOT, "docs", "MANARA-SPEC.md")

passed = 0
failures = []


def check(name, cond, detail=""):
    global passed
    if cond:
        passed += 1
        print("  ok  " + name)
    else:
        failures.append(name + (" - " + str(detail) if detail else ""))
        print("  FAIL " + name + (" - " + str(detail) if detail else ""))
    return bool(cond)


def section(t):
    print("\n" + t)


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


# =====================================================================================================
# 1. Python detector
# =====================================================================================================
def test_python():
    section("1. python/manara_webcam.py — detect_frame and FlickerDetector on synthetic frames")
    import numpy as np
    spec = importlib.util.spec_from_file_location("manara_webcam", PYF)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    check("module loads without OpenCV (no cv2 imported at import time)", "cv2" not in sys.modules)
    src = read(PYF)
    check("no top-level `import cv2` (only inside functions)", not re.search(r"^import cv2|^from cv2", src, re.M))

    h, w = 120, 160
    grey = np.full((h, w, 3), 90, np.uint8)
    r = mod.detect_frame(grey)
    check("grey frame: no fire pixels, not suspicious", r["fire_pixels"] == 0 and not r["suspicious"] and r["cx"] is None)
    check("mask has the frame's shape and is boolean", r["mask"].shape == (h, w) and r["mask"].dtype == bool)

    img = np.full((h, w, 3), (22, 24, 34), np.uint8)
    img[40:70, 60:100] = (255, 140, 20)
    r = mod.detect_frame(img)
    check("orange blob: fire ratio equals the blob area", abs(r["fire_ratio"] - (30 * 40) / float(h * w)) < 0.004, r["fire_ratio"])
    check("orange blob: centroid is the blob centre", abs(r["cx"] - 79.5) < 1.5 and abs(r["cy"] - 54.5) < 1.5, (r["cx"], r["cy"]))
    check("orange blob: suspicious", r["suspicious"])
    check("RGBA input is accepted", mod.detect_frame(np.dstack([img, np.full((h, w), 255, np.uint8)]))["fire_pixels"] == r["fire_pixels"])
    for name, col in (("blue", (30, 60, 255)), ("green", (30, 220, 40)), ("white", (250, 250, 250))):
        t = np.full((h, w, 3), (22, 24, 34), np.uint8)
        t[40:70, 60:100] = col
        check("%s blob is not fire-coloured" % name, mod.detect_frame(t)["fire_pixels"] == 0)
    try:
        mod.detect_frame(np.zeros((10, 10), np.uint8))
        check("a 2-D array is rejected", False)
    except ValueError:
        check("a 2-D array is rejected", True)

    def run(kind, n=90, extra=None):
        det = mod.FlickerDetector(fps=15)
        states = []
        res = None
        for t in range(n):
            res = det.push(mod.demo_frame(kind, t))
            states.append(res["state"])
        return states, res

    st, res = run("flame")
    check("flickering flame reaches FIRE", "fire" in st, st[-1])
    check("FIRE arrives within 3 s (45 frames)", "fire" in st[:45], st.index("fire") if "fire" in st else None)
    check("a confirmed flame stays FIRE", all(s == "fire" for s in st[st.index("fire"):]) if "fire" in st else False)
    st, res = run("lamp", 120)
    check("static orange lamp never reaches FIRE (120 frames)", "fire" not in st and st[-1] == "suspect", (st[-1], set(st)))
    st, res = run("car", 100)
    check("sliding red car never reaches FIRE", "fire" not in st, set(st))
    st, res = run("empty")
    check("empty room stays CLEAR", set(st) == {"clear"})
    det = mod.FlickerDetector(fps=15)
    for t in range(60):
        det.push(mod.demo_frame("flame", t))
    last = None
    for t in range(60):
        last = det.push(mod.demo_frame("empty", t))
    check("flame removed -> back to CLEAR", last["state"] == "clear", last["state"])
    det = mod.FlickerDetector(fps=15)
    for kind in ("flame", "lamp"):
        for t in range(70):
            last = det.push(mod.demo_frame(kind, t))
    check("flame replaced by a lamp -> SUSPECT, not FIRE for ever", last["state"] == "suspect", last["state"])
    check("run_selftest() passes", mod.run_selftest(verbose=False))

    # a rate that the 320-px subsample path handles (bigger frames)
    big = mod.demo_frame("flame", 3, size=(480, 640))
    check("640x480 frame goes through push() (subsampled)", mod.FlickerDetector(fps=15).push(big)["state"] in ("clear", "suspect", "fire"))

    # CLI paths that need only numpy
    cp = subprocess.run([sys.executable, "-I", PYF, "--selftest"], capture_output=True, text=True, timeout=120)
    check("CLI --selftest exits 0", cp.returncode == 0 and "PASS" in cp.stdout, cp.stdout[-200:] + cp.stderr[-200:])
    frames = b"".join(mod.demo_frame("flame", t, size=(90, 120)).tobytes() for t in range(40))
    cp = subprocess.run([sys.executable, "-I", PYF, "--raw", "120x90", "--fps", "15"], input=frames, capture_output=True, timeout=120)
    check("CLI --raw (numpy only, frames on stdin) runs", cp.returncode == 0, cp.stderr[-200:])
    with tempfile.TemporaryDirectory() as d:
        jl = os.path.join(d, "ev.jsonl")
        subprocess.run([sys.executable, "-I", PYF, "--raw", "120x90", "--fps", "15", "--jsonl", jl], input=frames, capture_output=True, timeout=120)
        lines = [json.loads(x) for x in read(jl).splitlines()] if os.path.exists(jl) else []
        check("--jsonl writes bus-style detection events", bool(lines) and all(l["type"] == "detection" and l["state"] in ("suspect", "fire", "clear") for l in lines), lines[:2])
        check("--jsonl reaches a 'fire' event for a flame", any(l["state"] == "fire" for l in lines))
        ppm = os.path.join(d, "f.ppm")
        a = mod.demo_frame("flame", 1, size=(20, 30))
        with open(ppm, "wb") as f:
            f.write(b"P6\n# comment-free\n30 20\n255\n" + a.tobytes())
        check("read_ppm reads a binary PPM", (mod.read_ppm(ppm) == a).all())


# =====================================================================================================
# 2. .ino static lint
# =====================================================================================================
def strip_code(src):
    """Blank out comments, string / char / raw-string literals (keeps line structure)."""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        two = src[i:i + 2]
        if two == "//":
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
        elif two == "/*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r"[^\n]", " ", src[i:j]))
            i = j
        elif c == 'R' and src[i:i + 2] == 'R"':
            m = re.match(r'R"([A-Za-z0-9_]*)\(', src[i:])
            if m:
                end = ")" + m.group(1) + '"'
                j = src.find(end, i)
                j = n if j < 0 else j + len(end)
                out.append(re.sub(r"[^\n]", " ", src[i:j]))
                i = j
                continue
            out.append(c)
            i += 1
        elif c == '"' or c == "'":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            j = min(j + 1, n)
            out.append(c + " " * (j - i - 2) + c if j - i >= 2 else c)
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def balanced(code):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ln, line in enumerate(code.split("\n"), 1):
        if line.lstrip().startswith("#"):
            continue
        for ch in line:
            if ch in "([{":
                stack.append((ch, ln))
            elif ch in pairs:
                if not stack or stack[-1][0] != pairs[ch]:
                    return False, "unexpected %r on line %d" % (ch, ln)
                stack.pop()
    return (not stack), ("unclosed %r from line %d" % stack[-1]) if stack else ""


def spec_keys():
    txt = read(SPEC)
    keys = set()
    for block in re.findall(r"```json\n(.*?)```", txt, re.S):
        keys |= set(re.findall(r'"([A-Za-z0-9_]+)"\s*:', block))
    return keys


def kit_keys(src):
    ks = set(re.findall(r'\\"([A-Za-z0-9_]+)\\"\s*:', src))
    ks |= set(re.findall(r'json(?:Str|Int)\(\s*\w+,\s*"(\w+)"', src))
    m = re.search(r'const char\* keys\[3\]\s*=\s*\{([^}]*)\}', src)
    if m:
        ks |= set(re.findall(r'"(\w+)"', m.group(1)))
    return ks


def test_lint():
    section("2. .ino static lint (both sketches)")
    sk = {"sentinel": read(SENT), "safepoint": read(SAFE)}
    for name, src in sk.items():
        code = strip_code(src)
        ok, why = balanced(code)
        check("%s: braces, parentheses and brackets balance" % name, ok, why)
        ifs = len(re.findall(r"^\s*#\s*(?:if|ifdef|ifndef)\b", code, re.M))
        ends = len(re.findall(r"^\s*#\s*endif\b", code, re.M))
        check("%s: every #if has an #endif (%d)" % (name, ifs), ifs == ends, "%d vs %d" % (ifs, ends))
        check("%s: has setup() and loop()" % name, re.search(r"\bvoid setup\s*\(\s*\)", code) and re.search(r"\bvoid loop\s*\(\s*\)", code))
        check("%s: honesty marker 'UNTESTED' is still in the header" % name, "UNTESTED" in src[:3000])
        check("%s: no 'world-first' / 'first-ever' / 'AI-powered' claims" % name, not re.search(r"world[- ]first|first[- ]ever|AI[- ]powered|saves? \w* ?lives", src, re.I))
        defs = dict(re.findall(r"^#define\s+(PIN_[A-Z0-9_]+)\s+(\d+)", code, re.M))
        used = set(re.findall(r"\bPIN_[A-Z0-9_]+\b", re.sub(r"^#define\s+PIN_[A-Z0-9_]+\s+\d+", "", code, flags=re.M)))
        check("%s: every PIN_ used in code is #define'd" % name, used <= set(defs), sorted(used - set(defs)))
        check("%s: every #define'd PIN_ is used" % name, set(defs) <= used, sorted(set(defs) - used))
        check("%s: no two PIN_ share a GPIO number" % name, len(set(defs.values())) == len(defs), defs)
        nums = {k: int(v) for k, v in defs.items()}
        check("%s: no flash pins (GPIO 6-11)" % name, not [k for k, v in nums.items() if 6 <= v <= 11])
        check("%s: no UART0 pins (GPIO 1, 3)" % name, not [k for k, v in nums.items() if v in (1, 3)])
        for inc in re.findall(r"^#include\s*[<\"]([^>\"]+)[>\"]", code, re.M):
            known = {"Arduino.h", "Wire.h", "WiFi.h", "DNSServer.h", "WebServer.h", "Adafruit_MLX90640.h", "Adafruit_SHT31.h",
                     "Adafruit_MPU6050.h", "Adafruit_Sensor.h", "Adafruit_NeoPixel.h", "ESP32Servo.h"}
            std = {"math.h", "stdint.h", "stdio.h", "stdarg.h", "string.h", "algorithm", "ctype.h", "stdlib.h"}
            check("%s: #include <%s> is a documented dependency" % (name, inc), inc in known or inc in std)
    # sentinel specifics
    s = sk["sentinel"]
    scode = strip_code(s)
    defs = {k: int(v) for k, v in re.findall(r"^#define\s+(PIN_[A-Z0-9_]+)\s+(\d+)", scode, re.M)}
    outs = ["PIN_TRIG", "PIN_BUZZER", "PIN_STRIP", "PIN_SERVO_PAN", "PIN_SERVO_TILT", "PIN_I2C_SDA", "PIN_I2C_SCL", "PIN_I2C2_SDA", "PIN_I2C2_SCL"]
    check("sentinel: output pins are not input-only GPIOs (34-39)", not [p for p in outs if 34 <= defs[p] <= 39], [p for p in outs if 34 <= defs[p] <= 39])
    check("sentinel: analog sensors sit on ADC1 pins (32-39), not ADC2", all(defs[p] in (32, 33, 34, 35, 36, 39) for p in ("PIN_MQ2", "PIN_MQ7")), (defs["PIN_MQ2"], defs["PIN_MQ7"]))
    pull = ["PIN_SOS", "PIN_EXIT_A", "PIN_EXIT_B", "PIN_EXIT_R", "PIN_FLOAT"]
    check("sentinel: pull-up inputs are not on pull-up-less GPIOs (34-39)", not [p for p in pull if 34 <= defs[p] <= 39])
    check("sentinel: no strapping pins 0, 2, 12, 15 in use", not [k for k, v in defs.items() if v in (0, 2, 12, 15)], [k for k, v in defs.items() if v in (0, 2, 12, 15)])
    check("sentinel: never blocks on `while (!Serial)` (the alarm must not wait for a host)", not re.search(r"while\s*\(\s*!\s*Serial", scode))
    check("sentinel: no `while (1)` / `for (;;)` in setup or loop path except the task", len(re.findall(r"while\s*\(\s*1\s*\)", scode)) == 0 and scode.count("for (;;)") == 1)
    check("sentinel: Serial.setTxBufferSize() comes before Serial.begin()", scode.find("setTxBufferSize") < scode.find("Serial.begin"))
    check("sentinel: protocol writes never block (availableForWrite check)", "availableForWrite" in scode)
    check("sentinel: thermal read lives in its own task (xTaskCreatePinnedToCore)", "xTaskCreatePinnedToCore(thermalTask" in scode)
    check("sentinel: exit truth override present (locked exit never shows GO)", re.search(r"exitLocked\[i\]\s*&&\s*sg\[i\]\s*==\s*SG_GO", scode))
    check("sentinel: the browser cannot silence a local alarm (siren = local OR command)", re.search(r"siren\s*=\s*localSiren\s*\|\|", scode))
    m = re.search(r'HAZ_NAME\[HAZ_COUNT\]\s*=\s*\{([^}]*)\}', s)
    names = re.findall(r'"(\w+)"', m.group(1)) if m else []
    check("hazard names are exactly protocol v1: none, fire, gas, flood, dust, heat, sos", names == ["none", "fire", "gas", "flood", "dust", "heat", "sos"], names)
    # JSON keys == protocol v1
    allowed = spec_keys()
    check("protocol keys were read from docs/MANARA-SPEC.md (%d keys)" % len(allowed), {"v", "type", "thermal", "t10", "room", "siren"} <= allowed, sorted(allowed)[:6])
    ks, kf = kit_keys(s), kit_keys(sk["safepoint"])
    check("sentinel JSON key names are all protocol v1", ks <= allowed, sorted(ks - allowed))
    check("safepoint JSON key names are all protocol v1", kf <= allowed, sorted(kf - allowed))
    check("every protocol v1 key is produced or read by the kit", allowed <= (ks | kf), sorted(allowed - (ks | kf)))
    check("both sketches emit \"v\":1", '\\"v\\":1' in s and '\\"v\\":1' in sk["safepoint"])
    # README documents the libraries the sketches include
    rd = read(README)
    for lib in ("Adafruit MLX90640", "Adafruit SHT31 Library", "Adafruit NeoPixel", "ESP32Servo", "Adafruit MPU6050", "Adafruit Unified Sensor", "esp32 by Espressif Systems"):
        check("README names the library/board package '%s'" % lib, lib in rd)
    check("README says the firmware is untested on hardware (Arabic and English)", "UNTESTED" not in rd and ("لم تُجرَّب" in rd) and ("not been run on real hardware" in rd))
    check("README lists a test checklist", rd.count("\n1. ") >= 3 and "Test checklist" in rd)


# =====================================================================================================
# 3. pure logic compiled and run
# =====================================================================================================
def block(src, name):
    m = re.search(r"// -+ BEGIN %s[^\n]*\n(.*?)// -+ END %s[^\n]*\n" % (name, name), src, re.S)
    return m.group(1) if m else None


HARNESS_HEAD = """#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include <algorithm>
#include <ctype.h>
"""

SENT_MAIN = r"""
static void readLine(char* buf, int n) { if (!fgets(buf, n, stdin)) buf[0] = 0; size_t l = strlen(buf); while (l && (buf[l-1]=='\n' || buf[l-1]=='\r')) buf[--l] = 0; }
int main() {
  char cmd[32];
  static float g[TH_N], s[TH_N];
  static int16_t t10[TH_N];
  char line[400];
  while (scanf("%31s", cmd) == 1) {
    if (!strcmp(cmd, "math")) {
      float t, rh; scanf("%f %f", &t, &rh);
      printf("math %.6f %.6f %.6f\n", stullWetBulbC(t, rh), wbgtEstimateC(t, rh, 0.0f), heatIndexC(t, rh));
    } else if (!strcmp(cmd, "grid")) {
      for (int i = 0; i < TH_N; i++) scanf("%f", &g[i]);
      Hotspot h = hotspotTest(g, s);
      printf("grid %d %d %d %.5f %.5f %.5f %.5f %.5f %.6f %.6f %d sane=%d\n", h.hot, h.absOk, h.ctxOk, h.tmax, h.tmean, h.bgMean, h.bgMad, h.ctxThr, h.x, h.y, h.idx, gridSane(g));
    } else if (!strcmp(cmd, "fall")) {
      int n; scanf("%d", &n);
      FallState f = { FALL_IDLE, 0, false };
      int reached = 0;
      for (int i = 0; i < n; i++) {
        unsigned ms; float gg; int ok; scanf("%u %f %d", &ms, &gg, &ok);
        fallStep(f, gg, ms, ok != 0);
        if (f.phase == FALL_CHECK) reached = 1;
      }
      printf("fall %d %d %d\n", (int)f.phase, (int)f.sos, reached);
    } else if (!strcmp(cmd, "signs")) {
      readLine(line, sizeof(line));
      SignsCmd c;
      if (parseSigns(line, &c)) printf("signs ok %d %d %d %d %d %d\n", c.s[0], c.s[1], c.s[2], (int)c.siren, (int)c.ring, (int)c.hz);
      else printf("signs bad\n");
    } else if (!strcmp(cmd, "frame")) {
      char which[16]; scanf("%15s", which);
      FrameData d; memset(&d, 0, sizeof(d));
      if (!strcmp(which, "full")) {
        d.ms = 4294967295u; d.hasThermal = true; d.tmax = -99.9f; d.tmean = -99.9f; d.hx = 1.0f; d.hy = 1.0f;
        d.hasMq2 = d.hasMq7 = true; d.mq2 = 5000; d.mq7 = 5000;
        d.hasAir = true; d.t = -99.9f; d.rh = 100.0f; d.hi = -99.9f; d.wbgt = -99.9f;
        d.hasPm = true; d.pm25 = 65535; d.pm10 = 65535; d.hasWater = true; d.cm = -99.9f;
        d.sos = d.fall = true; d.hasExits = true; d.lockA = d.lockB = d.lockR = true; d.localAlarm = true; d.hz = HAZ_FLOOD;
      } else if (!strcmp(which, "typical")) {
        d.ms = 12345; d.hasThermal = true; d.tmax = 41.2f; d.tmean = 29.8f; d.hx = 0.62f; d.hy = 0.31f;
        d.hasMq2 = d.hasMq7 = true; d.mq2 = 312; d.mq7 = 40; d.hasAir = true; d.t = 33.5f; d.rh = 61; d.hi = 41.0f; d.wbgt = 31.2f;
        d.hasWater = true; d.cm = 1.2f; d.hasExits = true; d.lockB = true; d.localAlarm = true; d.hz = HAZ_FIRE;
      } else if (!strcmp(which, "mq2only")) {
        d.ms = 7; d.hasMq2 = true; d.mq2 = 300;
      } else { d.ms = 1; }
      static char out[760];
      size_t n = formatFrame(out, sizeof(out), d);
      printf("J %zu %s", n, out);
    } else if (!strcmp(cmd, "gridjson")) {
      char which[16]; scanf("%15s", which);
      for (int i = 0; i < TH_N; i++) t10[i] = !strcmp(which, "worst") ? (i % 2 ? -400 : 3000) : (int16_t)(200 + i % 50);
      static char out[4200];
      size_t n = formatGrid(out, sizeof(out), t10);
      printf("G %zu %s", n, out);
    }
  }
  return 0;
}
"""

SAFE_MAIN = r"""
int main() {
  char cmd[32];
  Room rooms[MAX_ROOMS]; int n = 0;
  while (scanf("%31s", cmd) == 1) {
    char a[64], b[64], c[64];
    if (!strcmp(cmd, "clean")) {
      if (scanf("%63s", a) != 1) break;
      char out[16]; bool ok = cleanRoom(a, out); printf("clean %d [%s]\n", ok, out);
    } else if (!strcmp(cmd, "cleanempty")) {
      char out[16]; bool ok = cleanRoom("", out); printf("clean %d [%s]\n", ok, out);
    } else if (!strcmp(cmd, "lang")) { scanf("%63s", a); printf("lang %s\n", cleanLang(a)); }
    else if (!strcmp(cmd, "status")) { scanf("%63s", a); printf("status %d\n", statusCode(a)); }
    else if (!strcmp(cmd, "record")) { int st; scanf("%63s %d", a, &st); recordRoom(rooms, &n, MAX_ROOMS, a, (uint8_t)st); printf("record n=%d\n", n); }
    else if (!strcmp(cmd, "count")) { int s, h; countRooms(rooms, n, &s, &h); printf("count %d %d %d\n", n, s, h); }
    else if (!strcmp(cmd, "line")) { scanf("%63s %63s %63s", a, b, c); char out[200]; size_t l = formatCheckin(out, sizeof(out), a, b, c); printf("L %zu %s", l, out); }
  }
  return 0;
}
"""


def have(cmd):
    return shutil.which(cmd) is not None


def run_harness(tmp, name, src_text, main, stdin_text):
    cpp = os.path.join(tmp, name + ".cpp")
    exe = os.path.join(tmp, name)
    cfg = block(src_text, "CONFIG")
    pure = block(src_text, "MANARA-PURE")
    if pure is None:
        return None, "MANARA-PURE block not found"
    with open(cpp, "w", encoding="utf-8") as f:
        f.write(HARNESS_HEAD + (cfg or "") + "\n" + pure + "\n" + main)
    cp = subprocess.run(["g++", "-std=gnu++17", "-O1", "-Wall", "-Wextra", "-o", exe, cpp], capture_output=True, text=True)
    if cp.returncode != 0:
        return None, cp.stderr[:1500]
    rp = subprocess.run([exe], input=stdin_text, capture_output=True, text=True, timeout=60)
    return rp.stdout, rp.stderr


def js_reference(tmp, math_pairs, grids):
    """Ask the website's own code (js/detect.js via node + vm) for the same numbers."""
    script = os.path.join(tmp, "ref.mjs")
    with open(script, "w", encoding="utf-8") as f:
        f.write("""import fs from 'node:fs'; import vm from 'node:vm';
const ctx = vm.createContext({console, Math}); ctx.globalThis = ctx; ctx.self = ctx;
for (const f of ['fire.js','detect.js']) vm.runInContext(fs.readFileSync(process.argv[2] + '/' + f, 'utf8'), ctx, {filename: f});
const L = ctx.ManaraLab; const inp = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const out = { math: inp.math.map(([t, rh]) => [L.stullWetBulb(t, rh), L.wbgtEstimate(t, rh, 0), L.heatIndexC(t, rh)]),
  grids: inp.grids.map(g => { const r = L.hotspotTest(Float32Array.from(g)); return [r.hot ? 1 : 0, r.tmax, r.bgMean, r.mad, r.ctxThr, r.x, r.y]; }) };
console.log(JSON.stringify(out));
""")
    inp = os.path.join(tmp, "ref_in.json")
    with open(inp, "w") as f:
        json.dump({"math": math_pairs, "grids": [[float(v) for v in g.reshape(-1)] for g in grids]}, f)
    cp = subprocess.run(["node", script, os.path.join(SITE, "js"), inp], capture_output=True, text=True, timeout=60)
    if cp.returncode != 0:
        return None, cp.stderr[:800]
    return json.loads(cp.stdout), ""


def synth_grids():
    import numpy as np
    rng = np.random.RandomState(7)
    out = {}
    base = 22.0 + rng.normal(0, 0.25, (24, 32))
    mug = base.copy()
    mug[9:11, 20:22] = 65.0
    mug[8, 20:22] = 45.0
    out["mug"] = mug
    out["cold"] = base.copy()
    hand = base.copy()
    hand[5:12, 6:12] = 34.0
    out["hand"] = hand
    out["warm wall (58 C everywhere)"] = 58.0 + rng.normal(0, 0.3, (24, 32))
    sun = 40.0 + rng.normal(0, 0.4, (24, 32))
    sun[:, 24:] = 57.5
    out["sun patch on a 40 C scene"] = sun
    fire = base.copy()
    yy, xx = np.mgrid[0:24, 0:32]
    fire += 140.0 * np.exp(-(((xx - 5) ** 2 + (yy - 18) ** 2) / (2 * 1.6 ** 2)))
    out["real fire blob"] = fire
    return out


def fall_scenario(kind):
    """Lines 'ms g ok' at 100 Hz. Returns text."""
    rows = []
    t = 0
    def add(n_ms, g, ok=0):
        nonlocal t
        for _ in range(n_ms // 10):
            rows.append("%d %.3f %d" % (t, g, ok))
            t += 10
    add(2000, 1.0)
    if kind == "bump":
        add(100, 2.0)
        add(20000, 1.0)
    else:
        add(100, 3.2)
        if kind == "walk":
            for k in range(300):
                add(10, 1.0 if k % 2 else 1.8)
            add(20000, 1.0)
        else:
            add(15100, 1.0)                  # still: stillness phase (15 s) -> check starts
            if kind == "ok":
                add(10000, 1.0)
                add(10, 1.0, 1)              # "I am OK" press
                add(1000, 1.0)
            else:
                add(31000, 1.0)              # nobody answers for 30 s
    return "fall %d\n%s\n" % (len(rows), "\n".join(rows))


def test_pure():
    section("3. The firmware's pure logic (MANARA-PURE blocks), compiled with g++ and run")
    if not have("g++"):
        print("  skip (g++ not found)")
        return
    import numpy as np
    sent, safe = read(SENT), read(SAFE)
    with tempfile.TemporaryDirectory() as tmp:
        grids = synth_grids()
        pairs = [[20.0, 50.0], [40.0, 40.0], [35.0, 70.0], [32.2222, 70.0], [35.5556, 65.0], [30.0, 10.0], [28.0, 90.0], [45.0, 20.0], [50.0, 15.0], [15.0, 60.0], [27.0, 88.0]]
        stdin = []
        for t, rh in pairs:
            stdin.append("math %r %r" % (t, rh))
        for name, g in grids.items():
            stdin.append("grid " + " ".join("%.4f" % v for v in g.reshape(-1)))
        bad = grids["cold"].copy()
        bad[3, 3] = float("nan")
        stdin.append("grid " + " ".join("nan" if v != v else "%.4f" % v for v in bad.reshape(-1)))
        for kind in ("rest", "bump", "walk", "still", "ok"):
            stdin.append(fall_scenario({"rest": "bump", "bump": "bump", "walk": "walk", "still": "still", "ok": "ok"}[kind]).strip())
        good = '{"v":1,"type":"signs","A":"go","B":"stop","R":"off","siren":"on","ring":"amber","hazard":"fire"}'
        stdin += ["signs " + good,
                  'signs {"v": 1, "type": "signs", "A": "stop", "B": "go", "R": "go", "siren": "off", "ring": "red", "hazard": "gas"}',
                  'signs {"v":2,"type":"signs","A":"go"}',
                  'signs {"v":1,"type":"frame","A":"go"}',
                  'signs not json at all',
                  'signs {"v":1,"type":"signs","A":"explode","siren":"loud","ring":"purple","hazard":"zombies"}',
                  "frame full", "frame typical", "frame mq2only", "frame empty", "gridjson worst", "gridjson normal"]
        out, err = run_harness(tmp, "sentinel_pure", sent, SENT_MAIN, "\n".join(stdin) + "\n")
        if out is None:
            check("sentinel MANARA-PURE block compiles with g++ -Wall -Wextra", False, err)
            return
        check("sentinel MANARA-PURE block compiles with g++ -Wall -Wextra", True)
        lines = out.splitlines()
        math_l = [l for l in lines if l.startswith("math ")]
        grid_l = [l for l in lines if l.startswith("grid ")]
        fall_l = [l for l in lines if l.startswith("fall ")]
        sign_l = [l for l in lines if l.startswith("signs ")]
        check("harness produced every answer", len(math_l) == len(pairs) and len(grid_l) == len(grids) + 1 and len(fall_l) == 5 and len(sign_l) == 6,
              (len(math_l), len(grid_l), len(fall_l), len(sign_l)))

        # --- maths: independent Python reference + the website's functions
        def ref(t, rh):
            rh_c = min(99.0, max(5.0, rh))
            at = np.arctan
            tw = t * at(0.151977 * np.sqrt(rh_c + 8.313659)) + at(t + rh_c) - at(rh_c - 1.676331) + 0.00391838 * rh_c ** 1.5 * at(0.023101 * rh_c) - 4.686035
            f = t * 9 / 5 + 32
            hi = 0.5 * (f + 61 + (f - 68) * 1.2 + rh * 0.094)
            if (hi + f) / 2 >= 80:
                hi = -42.379 + 2.04901523 * f + 10.14333127 * rh - .22475541 * f * rh - .00683783 * f * f - .05481717 * rh * rh + .00122874 * f * f * rh + .00085282 * f * rh * rh - .00000199 * f * f * rh * rh
                if rh < 13 and 80 <= f <= 112:
                    hi -= ((13 - rh) / 4) * np.sqrt((17 - abs(f - 95)) / 17)
                elif rh > 85 and 80 <= f <= 87:
                    hi += ((rh - 85) / 10) * ((87 - f) / 5)
            return tw, 0.7 * tw + 0.3 * t, (hi - 32) * 5 / 9
        worst = 0.0
        for (t, rh), l in zip(pairs, math_l):
            c = [float(x) for x in l.split()[1:]]
            r = ref(t, rh)
            worst = max(worst, max(abs(a - b) for a, b in zip(c, r)))
        check("wet bulb / WBGT / heat index match an independent Python formula (worst diff %.4f C)" % worst, worst < 0.02, worst)
        hi_l = [float(l.split()[3]) for l in math_l]
        check("heat index reproduces the NWS chart: 90 F/70 % = 106 F, 96 F/65 % = 121 F", abs(hi_l[3] * 9 / 5 + 32 - 106) < 0.6 and abs(hi_l[4] * 9 / 5 + 32 - 121) < 0.6, (hi_l[3] * 9 / 5 + 32, hi_l[4] * 9 / 5 + 32))
        tw40 = float(math_l[1].split()[1])
        wb40 = float(math_l[1].split()[2])
        check("40 C / 40 %RH: wet bulb about 28.6 C and WBGT estimate about 32.0 C in the shade", abs(tw40 - 28.6) < 0.2 and abs(wb40 - 32.0) < 0.2, (tw40, wb40))
        check("Stull (2011) example: 20 C / 50 %RH is about 13.7 C", abs(float(math_l[0].split()[1]) - 13.7) < 0.15, math_l[0])

        # --- hot-spot test: expectations by construction
        names = list(grids.keys())
        res = {n: l.split() for n, l in zip(names, grid_l)}
        check("hot mug (65 C on a 22 C room): hot-spot found at the mug's cell", res["mug"][1] == "1" and abs(float(res["mug"][9]) - 20.0 / 31) < 0.04 and abs(float(res["mug"][10]) - 9.0 / 23) < 0.07, res["mug"])
        check("cold room: no hot-spot", res["cold"][1] == "0")
        check("a hand (34 C) is not a hot-spot (below 57 C)", res["hand"][1] == "0" and res["hand"][2] == "0")
        check("warm wall 58 C everywhere: absolute rule passes, contextual rule rejects it", res["warm wall (58 C everywhere)"][1] == "0" and res["warm wall (58 C everywhere)"][2] == "1" and res["warm wall (58 C everywhere)"][3] == "0", res["warm wall (58 C everywhere)"])
        check("a sun-heated patch (57.5 C on a 40 C scene) IS a hot-spot for this rule: that is why one hot-spot is only SUSPECT", res["sun patch on a 40 C scene"][1] == "1", res["sun patch on a 40 C scene"])
        check("real fire blob: hot-spot", res["real fire blob"][1] == "1")
        check("a grid with a NaN pixel is rejected by gridSane()", grid_l[-1].endswith("sane=0") and all(l.endswith("sane=1") for l in grid_l[:-1]))

        # --- same answers as the website (js/detect.js hotspotTest + formulas)
        if have("node"):
            ref_js, why = js_reference(tmp, pairs, list(grids.values()))
            if ref_js is None:
                check("node could load js/detect.js for the cross-check", False, why)
            else:
                dmax = 0.0
                for l, r in zip(math_l, ref_js["math"]):
                    c = [float(x) for x in l.split()[1:]]
                    dmax = max(dmax, max(abs(a - b) for a, b in zip(c, r)))
                check("firmware maths = website maths (js/detect.js), worst diff %.4f C" % dmax, dmax < 0.02, dmax)
                same_flag = all(int(l.split()[1]) == int(r[0]) for l, r in zip(grid_l, ref_js["grids"]))
                check("firmware hot-spot decision = website hotspotTest() on every synthetic grid", same_flag,
                      [(l.split()[1], r[0]) for l, r in zip(grid_l, ref_js["grids"])])
                dd = 0.0
                for l, r in zip(grid_l, ref_js["grids"]):
                    f = l.split()
                    dd = max(dd, abs(float(f[4]) - r[1]), abs(float(f[6]) - r[2]), abs(float(f[7]) - r[3]), abs(float(f[8]) - r[4]), abs(float(f[9]) - r[5]) * 31, abs(float(f[10]) - r[6]) * 23)
                check("firmware bgMean / MAD / threshold / position = website values (worst diff %.4f)" % dd, dd < 0.02, dd)
        else:
            print("  skip website cross-check (node not found)")

        # --- fall logic
        fl = [tuple(int(x) for x in l.split()[1:]) for l in fall_l]
        check("rest/bump (peak 2.0 g, below the impact threshold) -> never a check-in", fl[0] == (0, 0, 0) and fl[1] == (0, 0, 0), fl[:2])
        check("impact then walking -> cancelled, no check-in", fl[2] == (0, 0, 0), fl[2])
        check("impact, 15 s still, 30 s no answer -> SOS", fl[3][1] == 1 and fl[3][2] == 1, fl[3])
        check("impact, still, then the person presses OK -> back to idle, no SOS", fl[4] == (0, 0, 1), fl[4])

        # --- signs command
        sg = [l.split() for l in sign_l]
        check("signs: the page's JSON is parsed (A=go, B=stop, R=off, siren on, ring amber, hazard fire)", sg[0][:2] == ["signs", "ok"] and [int(x) for x in sg[0][2:]] == [1, 2, 0, 1, 2, 1], sg[0])
        check("signs: tolerant of spaces after colons", sg[1][1] == "ok" and [int(x) for x in sg[1][2:]] == [2, 1, 1, 0, 3, 2], sg[1])
        check("signs: wrong version, wrong type and garbage are refused", sg[2][1] == "bad" and sg[3][1] == "bad" and sg[4][1] == "bad", sg[2:5])
        check("signs: unknown words never turn anything on", sg[5][1] == "ok" and [int(x) for x in sg[5][2:]] == [0, 0, 0, 0, 0, 0], sg[5])

        # --- JSON writers
        allowed = spec_keys()

        def keys_of(o, acc):
            if isinstance(o, dict):
                for k, v in o.items():
                    acc.add(k)
                    keys_of(v, acc)
            return acc
        jl = {}
        for l in lines:
            if l.startswith("J ") or l.startswith("G "):
                tag, n, rest = l[0], int(l.split()[1]), l.split(" ", 2)[2]
                jl.setdefault(tag, []).append((n, rest))
        frames = jl.get("J", [])
        check("4 frame variants produced", len(frames) == 4, len(frames))
        parsed = []
        for n, txt in frames:
            try:
                parsed.append(json.loads(txt))
            except ValueError as e:
                parsed.append(None)
                check("frame is valid JSON", False, "%s :: %s" % (e, txt[:120]))
        if all(p is not None for p in parsed):
            check("all frames are valid JSON objects", True)
            full, typ, mq, empty = parsed
            ks = set()
            for p in parsed:
                keys_of(p, ks)
            check("frame key names are all protocol v1", ks <= allowed, sorted(ks - allowed))
            check("typical frame equals the spec example's shape", typ["v"] == 1 and typ["type"] == "frame" and typ["thermal"]["hot"]["x"] == 0.62 and typ["gas"] == {"mq2": 312, "mq7": 40} and typ["air"]["wbgt"] == 31.2 and typ["exits"] == {"A": "open", "B": "locked", "R": "open"} and typ["local"] == {"alarm": True, "hazard": "fire"} and typ["sos"] is False and typ["fall"] is False, typ)
            check("absent sensors are omitted (mq2-only frame: no thermal/air/pm/water/exits, gas has only mq2)", set(mq) == {"v", "type", "ms", "gas", "sos", "fall", "local"} and mq["gas"] == {"mq2": 300}, set(mq))
            check("a bare frame still has v, type, ms, sos, fall, local", set(empty) == {"v", "type", "ms", "sos", "fall", "local"} and empty["local"] == {"alarm": False, "hazard": "none"}, empty)
            check("worst-case frame has every optional object", {"thermal", "gas", "air", "pm", "water", "exits"} <= set(full))
        m = re.search(r"static char frameBuf\[(\d+)\]", sent)
        fb = int(m.group(1)) if m else 0
        longest = max(n for n, _ in frames) if frames else 10 ** 9
        check("frameBuf (%d bytes) is larger than the worst-case frame (%d bytes)" % (fb, longest), fb > longest + 20, (fb, longest))
        grids_j = jl.get("G", [])
        m = re.search(r"static char gridBuf\[(\d+)\]", sent)
        gb = int(m.group(1)) if m else 0
        check("2 grid variants produced", len(grids_j) == 2)
        if len(grids_j) == 2:
            glong = max(n for n, _ in grids_j)
            check("gridBuf (%d bytes) is larger than the worst-case grid line (%d bytes)" % (gb, glong), gb > glong + 20, (gb, glong))
            for n, txt in grids_j:
                gj = json.loads(txt)
                check("grid line: v=1, w=32, h=24, 768 integers", gj["v"] == 1 and gj["type"] == "grid" and gj["w"] == 32 and gj["h"] == 24 and len(gj["t10"]) == 768 and all(isinstance(x, int) for x in gj["t10"]), {k: gj[k] for k in ("w", "h")})
            check("grid line key names are protocol v1", set(json.loads(grids_j[0][1])) <= allowed)
        check("every protocol line is ONE line that ends with a newline (declared length = text + '\\n')", all(n == len(txt) + 1 and "\n" not in txt for n, txt in frames + grids_j))
        # keep the lines for the browser-side parser test
        keep = os.environ.get("MANARA_KEEP_LINES")
        if keep:
            with open(keep, "w", encoding="utf-8") as f:
                for n, txt in frames + grids_j:
                    f.write(txt + "\n")

        # --- safepoint
        stdin = ["clean 203", "clean <script>alert(1)</script>", "clean مكتب12", "clean a-b_c!d@e#f$g", "cleanempty", "lang ml", "lang xx", "lang ar", "status safe", "status help", "status ok",
                 "record 203 1", "record 105 2", "record 203 2", "record 302 1", "count", "line 203 safe ml", "line 105 help ar"]
        out, err = run_harness(tmp, "safe_pure", safe, SAFE_MAIN, "\n".join(stdin) + "\n")
        if out is None:
            check("safepoint MANARA-PURE block compiles with g++ -Wall -Wextra", False, err)
            return
        check("safepoint MANARA-PURE block compiles with g++ -Wall -Wextra", True)
        L = out.splitlines()
        check("room 203 stays 203", L[0] == "clean 1 [203]", L[0])
        check("HTML in a room field is stripped to letters (no < > / ( ) characters survive)", L[1] == "clean 1 [script]" and not re.search(r"[<>/()\"']", L[1]), L[1])
        check("non-Latin characters are dropped from a room id", L[2] == "clean 1 [12]", L[2])
        check("only letters, digits and '-' survive, max 6 characters", re.fullmatch(r"clean 1 \[[0-9A-Za-z-]{1,6}\]", L[3]) is not None and L[3] == "clean 1 [a-bcde]", L[3])
        check("an empty room is refused", L[4] == "clean 0 []", L[4])
        check("language whitelist: ml stays, unknown becomes ar", L[5] == "lang ml" and L[6] == "lang ar" and L[7] == "lang ar", L[5:8])
        check("status words: safe=1, help=2, anything else=0", L[8:11] == ["status 1", "status 2", "status 0"], L[8:11])
        check("a repeated room updates in place (latest answer wins)", L[11] == "record n=1" and L[12] == "record n=2" and L[13] == "record n=2" and L[14] == "record n=3", L[11:15])
        check("counts: 3 rooms, 1 safe (302), 2 help (203 and 105)", L[15] == "count 3 1 2", L[15])
        jj = []
        for l in L[16:18]:
            n, txt = l.split(" ", 2)[1], l.split(" ", 2)[2]
            jj.append(json.loads(txt))
        check("check-in line is valid protocol v1 JSON {v,type,room,status,lang}", jj[0] == {"v": 1, "type": "checkin", "room": "203", "status": "safe", "lang": "ml"} and jj[1]["status"] == "help", jj)
        check("check-in line carries no name or any other field", set(jj[0]) == {"v", "type", "room", "status", "lang"})


# =====================================================================================================
# 4. stub compile
# =====================================================================================================
STUBS = {
"Arduino.h": r'''#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include <stdarg.h>
#include <string>
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define SERIAL_8N1 0x800001c
#define PROGMEM
unsigned long millis();
unsigned long micros();
void delay(unsigned long);
void delayMicroseconds(unsigned int);
void pinMode(uint8_t, uint8_t);
int digitalRead(uint8_t);
void digitalWrite(uint8_t, uint8_t);
uint32_t analogReadMilliVolts(uint8_t);
typedef enum { ADC_0db, ADC_2_5db, ADC_6db, ADC_11db } adc_attenuation_t;
void analogSetAttenuation(adc_attenuation_t);
unsigned long pulseIn(uint8_t pin, uint8_t state, unsigned long timeout = 1000000UL);
class HardwareSerial {
 public:
  void begin(unsigned long baud, uint32_t config = 0x800001c, int8_t rxPin = -1, int8_t txPin = -1);
  size_t setTxBufferSize(size_t);
  int available();
  int read();
  int availableForWrite();
  size_t write(const uint8_t*, size_t);
  size_t print(const char*);
  size_t println(const char*);
};
extern HardwareSerial Serial;
extern HardwareSerial Serial2;
typedef struct { int dummy; } portMUX_TYPE;
#define portMUX_INITIALIZER_UNLOCKED {0}
void portENTER_CRITICAL(portMUX_TYPE*);
void portEXIT_CRITICAL(portMUX_TYPE*);
typedef void (*TaskFunction_t)(void*);
typedef void* TaskHandle_t;
typedef uint32_t UBaseType_t;
typedef int BaseType_t;
BaseType_t xTaskCreatePinnedToCore(TaskFunction_t, const char*, uint32_t, void*, UBaseType_t, TaskHandle_t*, BaseType_t);
void vTaskDelay(uint32_t);
#define pdMS_TO_TICKS(x) (x)
class __FlashStringHelper;
#define FPSTR(p) (reinterpret_cast<const __FlashStringHelper*>(p))
class String {
 public:
  std::string s;
  String() {}
  String(const char* c) : s(c) {}
  String(const __FlashStringHelper* f) : s(reinterpret_cast<const char*>(f)) {}
  String(int v) : s(std::to_string(v)) {}
  String(const String& o) : s(o.s) {}
  String& operator+=(const String& o) { s += o.s; return *this; }
  String& operator+=(const char* c) { s += c; return *this; }
  String& operator+=(const __FlashStringHelper* f) { s += reinterpret_cast<const char*>(f); return *this; }
  const char* c_str() const { return s.c_str(); }
  size_t length() const { return s.size(); }
};
class IPAddress { public: String toString() const; };
''',
"Wire.h": r'''#pragma once
#include <Arduino.h>
class TwoWire {
 public:
  bool begin(int sda = -1, int scl = -1, uint32_t freq = 0);
  bool setClock(uint32_t);
  void beginTransmission(uint8_t);
  uint8_t endTransmission(bool stop = true);
};
extern TwoWire Wire;
extern TwoWire Wire1;
''',
"Adafruit_MLX90640.h": r'''#pragma once
#include <Arduino.h>
#include <Wire.h>
#define MLX90640_I2CADDR_DEFAULT 0x33
typedef enum { MLX90640_INTERLEAVED, MLX90640_CHESS } mlx90640_mode_t;
typedef enum { MLX90640_ADC_16BIT, MLX90640_ADC_17BIT, MLX90640_ADC_18BIT, MLX90640_ADC_19BIT } mlx90640_resolution_t;
typedef enum { MLX90640_0_5_HZ, MLX90640_1_HZ, MLX90640_2_HZ, MLX90640_4_HZ, MLX90640_8_HZ, MLX90640_16_HZ, MLX90640_32_HZ, MLX90640_64_HZ } mlx90640_refreshrate_t;
class Adafruit_MLX90640 {
 public:
  bool begin(uint8_t i2c_addr = MLX90640_I2CADDR_DEFAULT, TwoWire* wire = &Wire);
  void setMode(mlx90640_mode_t);
  void setResolution(mlx90640_resolution_t);
  void setRefreshRate(mlx90640_refreshrate_t);
  int getFrame(float* framebuf);
  float getTa(bool newFrame = true);
};
''',
"Adafruit_SHT31.h": r'''#pragma once
#include <Arduino.h>
#include <Wire.h>
class Adafruit_SHT31 {
 public:
  Adafruit_SHT31(TwoWire* theWire = &Wire);
  bool begin(uint8_t i2caddr = 0x44);
  float readTemperature(void);
  float readHumidity(void);
  bool readBoth(float* temperature_out, float* humidity_out);
};
''',
"Adafruit_Sensor.h": r'''#pragma once
#include <Arduino.h>
typedef struct { float x, y, z; } sensors_vec_t;
typedef struct { int32_t version; int32_t sensor_id; int32_t type; int32_t timestamp; union { sensors_vec_t acceleration; sensors_vec_t gyro; float temperature; }; } sensors_event_t;
''',
"Adafruit_MPU6050.h": r'''#pragma once
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
typedef enum { MPU6050_RANGE_2_G, MPU6050_RANGE_4_G, MPU6050_RANGE_8_G, MPU6050_RANGE_16_G } mpu6050_accel_range_t;
typedef enum { MPU6050_BAND_260_HZ, MPU6050_BAND_184_HZ, MPU6050_BAND_94_HZ, MPU6050_BAND_44_HZ, MPU6050_BAND_21_HZ, MPU6050_BAND_10_HZ, MPU6050_BAND_5_HZ } mpu6050_bandwidth_t;
class Adafruit_MPU6050 {
 public:
  bool begin(uint8_t i2c_addr = 0x68, TwoWire* wire = &Wire, int32_t sensorID = 0);
  void setAccelerometerRange(mpu6050_accel_range_t);
  void setFilterBandwidth(mpu6050_bandwidth_t);
  bool getEvent(sensors_event_t* accel, sensors_event_t* gyro, sensors_event_t* temp);
};
''',
"Adafruit_NeoPixel.h": r'''#pragma once
#include <Arduino.h>
#define NEO_GRB 0x52
#define NEO_KHZ800 0x0000
typedef uint16_t neoPixelType;
class Adafruit_NeoPixel {
 public:
  Adafruit_NeoPixel(uint16_t n, int16_t pin = 6, neoPixelType type = NEO_GRB + NEO_KHZ800);
  void begin(void);
  void show(void);
  void clear(void);
  void setBrightness(uint8_t);
  void setPixelColor(uint16_t n, uint32_t c);
  static uint32_t Color(uint8_t r, uint8_t g, uint8_t b) { return ((uint32_t)r << 16) | ((uint32_t)g << 8) | b; }
};
''',
"ESP32Servo.h": r'''#pragma once
#include <Arduino.h>
class ESP32PWM { public: static void allocateTimer(int timerNumber); };
class Servo {
 public:
  void setPeriodHertz(int hertz);
  int attach(int pin);
  int attach(int pin, int min, int max);
  void write(int value);
};
''',
"WiFi.h": r'''#pragma once
#include <Arduino.h>
typedef enum { WIFI_OFF, WIFI_STA, WIFI_AP, WIFI_AP_STA } wifi_mode_t;
class WiFiClass {
 public:
  bool mode(wifi_mode_t);
  bool softAP(const char* ssid, const char* passphrase = NULL, int channel = 1, int ssid_hidden = 0, int max_connection = 4);
  IPAddress softAPIP();
};
extern WiFiClass WiFi;
''',
"DNSServer.h": r'''#pragma once
#include <Arduino.h>
class DNSServer {
 public:
  DNSServer();
  void processNextRequest();
  bool start();
  bool start(uint16_t port, const String& domainName, const IPAddress& resolvedIP);
  void stop();
};
''',
"WebServer.h": r'''#pragma once
#include <Arduino.h>
#include <functional>
enum HTTPMethod { HTTP_ANY, HTTP_GET, HTTP_POST };
class WebServer {
 public:
  typedef std::function<void(void)> THandlerFunction;
  WebServer(int port = 80);
  void begin();
  void handleClient();
  void on(const char* uri, THandlerFunction handler);
  void on(const char* uri, HTTPMethod method, THandlerFunction fn);
  void onNotFound(THandlerFunction fn);
  bool hasArg(const char* name);
  String arg(const char* name);
  void send(int code, const char* content_type, const String& content);
  void sendHeader(const String& name, const String& value, bool first = false);
};
''',
}


def test_compile():
    section("4. Both sketches syntax/type-checked with g++ against stub headers (documented signatures)")
    if not have("g++"):
        print("  skip (g++ not found)")
        return
    with tempfile.TemporaryDirectory() as tmp:
        inc = os.path.join(tmp, "stubs")
        os.makedirs(inc)
        for name, text in STUBS.items():
            with open(os.path.join(inc, name), "w") as f:
                f.write(text)
        sent, safe = read(SENT), read(SAFE)
        flags = re.findall(r"^#define (HAS_[A-Z0-9_]+)\s+([01])", sent, re.M)
        variants = {
            "default configuration": sent,
            "every optional part ON (PMS5003, MPU6050, float switch, head ...)": re.sub(r"^(#define HAS_[A-Z0-9_]+\s+)0", r"\g<1>1", sent, flags=re.M),
            "every part OFF": re.sub(r"^(#define HAS_[A-Z0-9_]+\s+)1", r"\g<1>0", sent, flags=re.M),
            "cup mode OFF (15/30 cm thresholds)": re.sub(r"^(#define BOOTH_CUP_MODE\s+)1", r"\g<1>0", sent, flags=re.M),
            "float switch instead of ultrasonic": re.sub(r"^(#define HAS_WATER_ULTRASONIC\s+)1", r"\g<1>0", re.sub(r"^(#define HAS_WATER_FLOAT\s+)0", r"\g<1>1", sent, flags=re.M), flags=re.M),
            "no thermal camera, SHT31 only": re.sub(r"^(#define HAS_MLX90640\s+)1", r"\g<1>0", sent, flags=re.M),
        }
        check("sentinel has %d HAS_ flags (feature switches)" % len(flags), len(flags) >= 12, flags)
        for label, text in variants.items():
            p = os.path.join(tmp, "v.cpp")
            with open(p, "w", encoding="utf-8") as f:
                f.write(text)
            cp = subprocess.run(["g++", "-std=gnu++17", "-fsyntax-only", "-Wall", "-Wextra", "-I", inc, "-x", "c++", p], capture_output=True, text=True)
            errs = [l for l in cp.stderr.splitlines() if "error" in l]
            check("sentinel compiles: %s" % label, cp.returncode == 0, "; ".join(errs[:3]))
            check("sentinel compiles with no warnings (-Wall -Wextra): %s" % label, cp.stderr.strip() == "", cp.stderr[:300])
        p = os.path.join(tmp, "s.cpp")
        with open(p, "w", encoding="utf-8") as f:
            f.write(safe)
        cp = subprocess.run(["g++", "-std=gnu++17", "-fsyntax-only", "-Wall", "-Wextra", "-I", inc, "-x", "c++", p], capture_output=True, text=True)
        check("safepoint compiles", cp.returncode == 0, cp.stderr[:600])
        check("safepoint compiles without warnings", cp.stderr.strip() == "", cp.stderr[:300])


# =====================================================================================================
# 5. page cross-checks
# =====================================================================================================
def test_page_links():
    section("5. Build page <-> kit files")
    paths = set()
    for f in ("build.html", "js/build.js", "css/build.css"):
        p = os.path.join(SITE, f)
        if os.path.exists(p):
            paths |= set(re.findall(r"kit/[A-Za-z0-9_./-]+\.(?:ino|py|md)", read(p)))
    if not paths:
        print("  skip (build.html / build.js not written yet)")
        return
    check("build page links at least the 4 kit downloads", len(paths) >= 4, sorted(paths))
    for kp in sorted(paths):
        check("kit file exists on disk: %s" % kp, os.path.exists(os.path.join(SITE, kp)))
    actual = set()
    for dp, _, fns in os.walk(KIT):
        for fn in fns:
            if fn.endswith((".ino", ".py", ".md")):
                actual.add(os.path.relpath(os.path.join(dp, fn), SITE).replace(os.sep, "/"))
    check("every kit file is offered for download on the page", actual <= paths, sorted(actual - paths))


def main():
    test_python()
    test_lint()
    test_pure()
    test_compile()
    test_page_links()
    print("\n%d passed, %d failed" % (passed, len(failures)))
    if failures:
        for f in failures:
            print("  - " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
