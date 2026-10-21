#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for the MANARA kit (manara/kit): run on a PC, no hardware needed.

    python3 manara/tools/test_kit.py

What is tested (and what is NOT):
  1. python/manara_webcam.py   detect_frame() and FlickerDetector on synthetic frames with known truth,
                               the numpy-only input paths (--raw, --ppm), no top-level OpenCV import.
  2. .ino static lint          balanced braces / parentheses / #if, every PIN_ used is #define'd (and every
                               #define'd PIN_ is used), no GPIO clashes or unsafe pins, JSON key names are exactly
                               protocol v1 from manara/docs/MANARA-SPEC.md, hazard names, honesty marker, no blocking
                               `while (!Serial)`, library includes are documented in the README.
  3. The firmware's pure logic (the block marked MANARA-PURE) is compiled with g++ and RUN: wet bulb, WBGT,
     heat index (compared with the website's own functions through node), hot-spot test (compared with
     js/detect.js), fall logic, `signs` parser, JSON writers (parsed with json.loads), buffer sizes.
  4. All three sketches (sentinel, safepoint, rover) are syntax/type-checked with g++ against STUB headers that copy
     the documented library signatures (several #define combinations). This catches typos and wrong types. It
     does NOT prove the sketch works on a real ESP32: nobody has flashed it yet.
  5. The ROVER (Tier 4, kit/firmware/manara_rover): its MANARA-PURE block is compiled and RUN: drive mixing, the
     ultrasonic maths, the stop/slow zones with hysteresis, the battery estimate, the hot-spot rule (against
     js/detect.js), the warm-shape rule (and its hot-room limit), the approval + safety state machine (it never
     moves without a fresh human approve, the keep-alive, the E-stop, the battery cut, heat and obstacles, the
     32-bit clock wrap), the command parser and the JSON writers (against protocol v1 in docs/MANARA-SPEC.md).
     What is NOT tested: the motors, the wiring, and what the rover does on a real floor.
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
ROOT = os.path.abspath(os.path.join(HERE, ".."))     # manara/ : this file is manara/tools/test_kit.py, so it works from any cwd
SITE = ROOT                                          # the public pages and the kit live in the same folder as docs/ and tools/
KIT = os.path.join(SITE, "kit")
SENT = os.path.join(KIT, "firmware", "manara_sentinel", "manara_sentinel.ino")
SAFE = os.path.join(KIT, "firmware", "manara_safepoint", "manara_safepoint.ino")
ROVER = os.path.join(KIT, "firmware", "manara_rover", "manara_rover.ino")
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
    section("2. .ino static lint (sentinel, safepoint, rover)")
    sk = {"sentinel": read(SENT), "safepoint": read(SAFE), "rover": read(ROVER)}
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
                     "Adafruit_MPU6050.h", "Adafruit_Sensor.h", "Adafruit_NeoPixel.h", "ESP32Servo.h", "Adafruit_AMG88xx.h"}
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
    # rover specifics (Tier 4)
    r = sk["rover"]
    rcode = strip_code(r)
    rdefs = {k: int(v) for k, v in re.findall(r"^#define\s+(PIN_[A-Z0-9_]+)\s+(\d+)", rcode, re.M)}
    routs = ["PIN_I2C_SDA", "PIN_I2C_SCL", "PIN_MOTL_PWM", "PIN_MOTL_IN1", "PIN_MOTL_IN2", "PIN_MOTR_PWM", "PIN_MOTR_IN1", "PIN_MOTR_IN2", "PIN_TRIG", "PIN_SPEAKER", "PIN_LED"]
    check("rover: output pins are not input-only GPIOs (34-39)", not [p for p in routs if 34 <= rdefs[p] <= 39], [p for p in routs if 34 <= rdefs[p] <= 39])
    check("rover: the battery divider sits on an ADC1 pin (32-39), not ADC2", rdefs["PIN_BATT"] in (32, 33, 34, 35, 36, 39), rdefs["PIN_BATT"])
    check("rover: the E-stop pull-up input is not on a pull-up-less GPIO (34-39)", not 34 <= rdefs["PIN_ESTOP"] <= 39)
    check("rover: no strapping pins 0, 2, 12, 15 in use", not [k for k, v in rdefs.items() if v in (0, 2, 12, 15)], [k for k, v in rdefs.items() if v in (0, 2, 12, 15)])
    check("rover: never blocks on `while (!Serial)`", not re.search(r"while\s*\(\s*!\s*Serial", rcode))
    check("rover: no `while (1)` and exactly one `for (;;)` (the thermal task)", len(re.findall(r"while\s*\(\s*1\s*\)", rcode)) == 0 and rcode.count("for (;;)") == 1)
    check("rover: Serial.setTxBufferSize() comes before Serial.begin()", rcode.find("setTxBufferSize") < rcode.find("Serial.begin"))
    check("rover: protocol writes never block (availableForWrite check)", "availableForWrite" in rcode)
    check("rover: thermal read lives in its own task (xTaskCreatePinnedToCore)", "xTaskCreatePinnedToCore(thermalTask" in rcode)
    check("rover: motors are switched OFF in setup() before the sensors start", re.search(r"void setup\(\)\s*\{.*?driveMotors\(0, 0\).*?pinMode\(PIN_TRIG", rcode, re.S) is not None)
    check("rover: the wheel command comes ONLY from roverStep() (one driveMotors(rover.l, rover.r) call in loop)", len(re.findall(r"driveMotors\(rover\.l,\s*rover\.r\)", rcode)) == 1 and rcode.count("setMotor(PIN_") == 2)
    check("rover: the E-stop pin is read every control tick", re.search(r"in\.estop\s*=\s*digitalRead\(PIN_ESTOP\)", rcode))
    check("rover: two thermal cameras at once is a compile-time #error", re.search(r"#if HAS_MLX90640 && HAS_AMG8833\s*\n\s*#error", r))
    check("rover: the speaker is described as tones only (no spoken-guidance claim)", re.search(r"TONES only", r) and re.search(r"audio-player\s+module", r))
    check("rover: honesty header says it is a bench prototype, not a rescue robot", re.search(r"not a rescue robot", r) and re.search(r"not approved by any\s+authority", r))
    m = re.search(r'HAZ_NAME\[HAZ_COUNT\]\s*=\s*\{([^}]*)\}', s)
    names = re.findall(r'"(\w+)"', m.group(1)) if m else []
    check("hazard names are exactly protocol v1: none, fire, gas, flood, dust, heat, sos", names == ["none", "fire", "gas", "flood", "dust", "heat", "sos"], names)
    # JSON keys == protocol v1
    allowed = spec_keys()
    check("protocol keys were read from manara/docs/MANARA-SPEC.md (%d keys)" % len(allowed), {"v", "type", "thermal", "t10", "room", "siren"} <= allowed, sorted(allowed)[:6])
    ks, kf, kr = kit_keys(s), kit_keys(sk["safepoint"]), kit_keys(sk["rover"])
    check("sentinel JSON key names are all protocol v1", ks <= allowed, sorted(ks - allowed))
    check("safepoint JSON key names are all protocol v1", kf <= allowed, sorted(kf - allowed))
    check("rover JSON key names are all protocol v1 (the rover messages are in docs/MANARA-SPEC.md)", kr <= allowed, sorted(kr - allowed))
    check("every protocol v1 key is produced or read by the kit", allowed <= (ks | kf | kr), sorted(allowed - (ks | kf | kr)))
    check("all three sketches emit \"v\":1", '\\"v\\":1' in s and '\\"v\\":1' in sk["safepoint"] and '\\"v\\":1' in sk["rover"])
    # README documents the libraries the sketches include
    rd = read(README)
    for lib in ("Adafruit MLX90640", "Adafruit SHT31 Library", "Adafruit NeoPixel", "ESP32Servo", "Adafruit MPU6050", "Adafruit Unified Sensor", "Adafruit AMG88xx Library", "esp32 by Espressif Systems"):
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
# 3b. the rover's pure logic compiled and run (Tier 4)
# =====================================================================================================
ROVER_MAIN = r"""
static void readLine(char* buf, int n) { if (!fgets(buf, n, stdin)) buf[0] = 0; size_t l = strlen(buf); while (l && (buf[l-1]=='\n' || buf[l-1]=='\r')) buf[--l] = 0; }
int main() {
  char cmd[32];
  static float g[TH_MAX], s[TH_MAX];
  static int16_t t10[TH_MAX];
  static char out[4800];
  char line[400];
  Rover rv; memset(&rv, 0, sizeof(rv)); rv.turnDir = 1;
  while (scanf("%31s", cmd) == 1) {
    if (!strcmp(cmd, "mix")) {
      int f, t, m; scanf("%d %d %d", &f, &t, &m); int l, r; mixDrive(f, t, m, &l, &r); printf("mix %d %d\n", l, r);
    } else if (!strcmp(cmd, "echo")) {
      unsigned us; float tc; scanf("%u %f", &us, &tc); printf("echo %.4f\n", echoToCm(us, tc));
    } else if (!strcmp(cmd, "range")) {
      float cm; int prev; scanf("%f %d", &cm, &prev); printf("range %d\n", (int)rangeState(cm, (RangeState)prev));
    } else if (!strcmp(cmd, "batt")) {
      float mv; scanf("%f", &mv); printf("batt %d\n", battPct(mv));
    } else if (!strcmp(cmd, "hot")) {
      int w, h; scanf("%d %d", &w, &h);
      for (int i = 0; i < w * h; i++) scanf("%f", &g[i]);
      Hotspot o = hotspotTest(g, w * h, w, h, s);
      printf("hot %d %d %d %.5f %.5f %.5f %.5f %.5f %.6f %.6f %d sane=%d\n", o.hot, o.absOk, o.ctxOk, o.tmax, o.tmean, o.bgMean, o.bgMad, o.ctxThr, o.x, o.y, o.idx, gridSane(g, w * h));
    } else if (!strcmp(cmd, "person")) {
      int w, h; scanf("%d %d", &w, &h);
      for (int i = 0; i < w * h; i++) scanf("%f", &g[i]);
      PersonResult o = personTest(g, w * h, w, h, s);
      printf("person %d %d %d %.4f %.4f %.4f %.4f %.4f\n", o.found, o.hotRoom, o.nPix, o.tmax, o.bgMedian, o.contrast, o.x, o.y);
    } else if (!strcmp(cmd, "parse")) {
      readLine(line, sizeof(line));
      RoverCmd c;
      if (parseRoverCmd(line, &c)) printf("parse ok %d %d %d %d\n", (int)c.kind, c.l, c.r, (int)c.say); else printf("parse bad\n");
    } else if (!strcmp(cmd, "smreset")) {
      memset(&rv, 0, sizeof(rv)); rv.turnDir = 1; rv.st = RS_STOWED;
    } else if (!strcmp(cmd, "step")) {
      unsigned now; int estop, rng, bk, person, hot, hc, ck, cl, cr, cs; float bmv;
      scanf("%u %d %d %d %f %d %d %d %d %d %d %d", &now, &estop, &rng, &bk, &bmv, &person, &hot, &hc, &ck, &cl, &cr, &cs);
      RoverIn in; memset(&in, 0, sizeof(in));
      in.now = now; in.estop = estop != 0; in.range = (RangeState)rng; in.battKnown = bk != 0; in.battMv = bmv; in.person = person != 0; in.hot = hot != 0;
      in.haveCmd = hc != 0; in.cmd.kind = (RoverCmdKind)ck; in.cmd.l = cl; in.cmd.r = cr; in.cmd.say = (Say)cs;
      roverStep(&rv, in);
      printf("S %d %d %d %d %d %d\n", (int)rv.st, rv.l, rv.r, (int)rv.why, (int)rv.say, (int)rv.approved);
    } else if (!strcmp(cmd, "frame")) {
      char which[16]; scanf("%15s", which);
      RoverFrame d; memset(&d, 0, sizeof(d));
      if (!strcmp(which, "full")) {
        d.ms = 4294967295u; d.st = RS_FAULT; d.approved = true; d.l = -60; d.r = -60; d.hasRange = true; d.cm = 999.9f; d.rg = RG_STOP;
        d.hasThermal = true; d.tmax = -99.9f; d.tmean = -99.9f; d.hot = true; d.hotX = 1.0f; d.hotY = 1.0f; d.hotT = 399.9f;
        d.person = true; d.px = 1.0f; d.py = 1.0f; d.dt = -99.9f; d.pxN = 768; d.noContrast = true;
        d.hasBatt = true; d.mv = 99999; d.pct = 100; d.stop = true; d.why = WHY_TIMEOUT;
      } else if (!strcmp(which, "typical")) {
        d.ms = 12345; d.st = RS_SEARCHING; d.approved = true; d.l = 27; d.r = 27; d.hasRange = true; d.cm = 84.2f; d.rg = RG_CLEAR;
        d.hasThermal = true; d.tmax = 33.4f; d.tmean = 27.9f; d.person = true; d.px = 0.41f; d.py = 0.55f; d.dt = 5.2f; d.pxN = 14;
        d.hasBatt = true; d.mv = 7420; d.pct = 71; d.why = WHY_NONE;
      } else { d.ms = 1; d.rg = RG_SLOW; d.why = WHY_NONE; d.stop = true; }
      size_t n = formatRover(out, 560, d);
      printf("J %zu %s", n, out);
    } else if (!strcmp(cmd, "gridjson")) {
      char which[16]; int w, h; scanf("%15s %d %d", which, &w, &h);
      for (int i = 0; i < w * h; i++) t10[i] = !strcmp(which, "worst") ? (i % 2 ? -600 : 4000) : (int16_t)(200 + i % 50);
      size_t n = formatGrid(out, sizeof(out), t10, w, h);
      printf("G %zu %s", n, out);
    }
  }
  return 0;
}
"""


def cfg_values(src):
    cfg = block(src, "CONFIG") or ""
    out = {}
    for k, v in re.findall(r"^#define\s+([A-Z0-9_]+)\s+([-0-9.]+)[fFuUlL]*\b", cfg, re.M):
        out[k] = float(v)
    return out


def test_rover():
    section("3b. The rover's pure logic (Tier 4): drive, range, battery, hot-spot, warm shape, the approval state machine, parser, JSON")
    if not have("g++"):
        print("  skip (g++ not found)")
        return
    import numpy as np
    rover = read(ROVER)
    C = cfg_values(rover)
    synth = synth_grids()
    rng_ = np.random.RandomState(11)

    def grid_line(tag, g, w=None, h=None):
        h2, w2 = g.shape
        return "%s %d %d " % (tag, w2, h2) + " ".join("%.4f" % v for v in g.reshape(-1))

    stdin = []
    # drive mixing, echo maths, range zones, battery
    mixes = [(50, 0, 60), (100, 100, 100), (0, 50, 60), (-50, 0, 60), (80, 80, 60), (100, 0, 30), (0, -100, 100)]
    for f, t, m in mixes:
        stdin.append("mix %d %d %d" % (f, t, m))
    echoes = [(5830, 25.0), (0, 25.0), (5830, 45.0), (11660, 25.0), (580, 25.0)]
    for us, tc in echoes:
        stdin.append("echo %d %r" % (us, tc))
    ranges = [(100.0, 0), (40.0, 0), (15.0, 0), (22.0, 2), (22.0, 0), (48.0, 1), (48.0, 0), (float("nan"), 0), (1.0, 0), (19.99, 0), (44.99, 0), (24.9, 2)]
    for cm, prev in ranges:
        stdin.append("range %s %d" % ("nan" if cm != cm else repr(cm), prev))
    batts = [8400.0, 6000.0, 7200.0, 9000.0, 5000.0]
    for mv in batts:
        stdin.append("batt %r" % mv)
    # hot-spot on the 32x24 synthetic grids + an 8x8 (AMG8833) image
    for name, g in synth.items():
        stdin.append(grid_line("hot", g))
    amg_cold = 24.0 + rng_.normal(0, 0.2, (8, 8))
    amg_hot = amg_cold.copy()
    amg_hot[3, 5] = 71.0
    stdin.append(grid_line("hot", amg_cold))
    stdin.append(grid_line("hot", amg_hot))
    bad = synth["cold"].copy()
    bad[3, 3] = float("nan")
    stdin.append("hot 32 24 " + " ".join("nan" if v != v else "%.4f" % v for v in bad.reshape(-1)))
    # warm-shape ("person") rule
    base = 24.0 + rng_.normal(0, 0.25, (24, 32))
    person_cases = {}
    p1 = base.copy(); p1[8:16, 10:16] = 33.0; person_cases["person-sized warm blob (33 C) in a 24 C room"] = p1
    p2 = 35.5 + rng_.normal(0, 0.25, (24, 32)); p2[8:16, 10:16] = 37.0; person_cases["hot room (35.5 C background)"] = p2
    p3 = base.copy(); p3[9:11, 20:22] = 65.0; p3[8, 20:22] = 45.0; person_cases["hot mug (65 C)"] = p3
    p4 = base.copy(); p4[10:12, 5:7] = 33.0; person_cases["tiny warm spot (4 pixels)"] = p4
    p5 = base.copy(); p5[:, 16:] = 33.0; person_cases["half the image warm (a warm wall)"] = p5
    p6 = base.copy(); p6[2:6, 26:30] = 29.0; person_cases["barely warm (29 C, 5 K above the room)"] = p6
    for n_, g in person_cases.items():
        stdin.append(grid_line("person", g))
    a1 = 24.0 + rng_.normal(0, 0.2, (8, 8)); a1[2:4, 3:5] = 32.0
    a2 = 24.0 + rng_.normal(0, 0.2, (8, 8)); a2[4, 4] = 32.0
    stdin.append(grid_line("person", a1))
    stdin.append(grid_line("person", a2))
    # command parser
    parses = ['{"v":1,"type":"rover","cmd":"approve"}',
              '{"v": 1, "type": "rover", "cmd": "drive", "l": -70, "r": 120}',
              '{"v":1,"type":"rover","cmd":"say","say":"follow"}',
              '{"v":1,"type":"rover","cmd":"say","say":"opera"}',
              '{"v":1,"type":"rover","cmd":"recall"}',
              '{"v":2,"type":"rover","cmd":"approve"}',
              '{"v":1,"type":"signs","cmd":"approve"}',
              '{"v":1,"type":"rover","cmd":"self-destruct"}',
              '{"v":1,"type":"rover"}',
              'not json at all']
    for l in parses:
        stdin.append("parse " + l)
    # the approval and safety state machine
    T_SEARCH, T_TURN, T_TTL, T_DRIVE = C["SEARCH_MAX_MS"], C["TURN_MS"], C["APPROVE_TTL_MS"], C["DRIVE_TTL_MS"]
    BLOW, BCUT = C["BATT_LOW_MV"], C["BATT_CUT_MV"]
    scen = {}
    order = []

    def start(name):
        order.append(name)
        scen[name] = []
        stdin.append("smreset")

    def st(name, now, cmd=0, l=0, r=0, say=0, estop=0, rng=0, batt=7800.0, person=0, hot=0, known=1):
        stdin.append("step %d %d %d %d %r %d %d %d %d %d %d %d" % (now & 0xFFFFFFFF, estop, rng, known, float(batt), person, hot, 1 if cmd else 0, cmd, l, r, say))
        scen[name].append(now)
    A, S_, H_, STP, RC_, DR, SAY = 1, 2, 3, 4, 5, 6, 7

    start("no approval")
    for k in range(60):
        st("no approval", 1000 + 50 * k, cmd=(DR if k == 10 else (S_ if k == 20 else 0)), l=80, r=80, person=(k > 30), hot=(k > 40))
    start("approve and search")
    st("approve and search", 1000, cmd=A)
    for k in range(1, 61):
        st("approve and search", 1000 + 50 * k, cmd=(A if k % 20 == 0 else 0))
    start("obstacle")
    st("obstacle", 1000, cmd=A)
    t = 1050
    for k in range(10):
        st("obstacle", t, rng=0); t += 50
    for k in range(10):
        st("obstacle", t, rng=2, cmd=(A if k == 5 else 0)); t += 50
    for k in range(25):
        st("obstacle", t, rng=0, cmd=(A if k % 20 == 0 else 0)); t += 50
    start("keep-alive")
    st("keep-alive", 1000, cmd=A)
    for k in range(1, int(T_TTL / 50) + 4):
        st("keep-alive", 1000 + 50 * k)
    start("person found")
    st("person found", 1000, cmd=A)
    for k in range(1, 8):
        st("person found", 1000 + 50 * k)
    st("person found", 1400, person=1)
    for k in range(1, 30):
        st("person found", 1400 + 50 * k, person=1, cmd=(A if k % 20 == 0 else 0))
    st("person found", 3000, cmd=S_)                       # a human says "search" again
    st("person found", 3050, cmd=A)
    start("manual drive")
    st("manual drive", 1000, cmd=DR, l=50, r=50)           # not approved: ignored
    st("manual drive", 1050, cmd=A)                        # approve (it starts searching)
    st("manual drive", 1100, cmd=H_)                       # hold
    st("manual drive", 1150, cmd=DR, l=50, r=50)           # now allowed
    st("manual drive", 1200)
    st("manual drive", 1150 + int(T_DRIVE) + 100)          # the drive command has expired
    st("manual drive", 1150 + int(T_DRIVE) + 150, cmd=A)
    st("manual drive", 2000, cmd=DR, l=50, r=50, rng=2)    # drive straight into an obstacle: refused
    start("estop")
    st("estop", 1000, cmd=A)
    st("estop", 1050)
    st("estop", 1100, estop=1)
    st("estop", 1150, estop=1, cmd=A)                      # approve while pressed: ignored
    st("estop", 1200)                                      # released, no approve: still stowed
    st("estop", 1250, cmd=A)
    start("battery")
    st("battery", 1000, cmd=A)
    st("battery", 1050, batt=BLOW - 100)                   # low: stop searching
    st("battery", 1100, cmd=A, batt=BLOW - 100)
    st("battery", 1150, batt=BCUT - 100)                   # cut: fault
    st("battery", 1200, cmd=A, batt=BCUT - 100)            # approve is refused with a flat battery
    st("battery", 1250, cmd=A, batt=BLOW - 50)             # still below low
    st("battery", 1300, cmd=A, batt=BLOW + 400)            # charged + a new approve
    start("recall")
    st("recall", 1000, cmd=A)
    st("recall", 1050)
    st("recall", 1100, cmd=RC_)
    st("recall", 1150)
    st("recall", 1200, cmd=A)
    start("heat ahead")
    st("heat ahead", 1000, cmd=A)
    for k in range(1, 6):
        st("heat ahead", 1000 + 50 * k, hot=1)
    st("heat ahead", 3000)
    start("slow zone")
    st("slow zone", 1000, cmd=A)
    for k in range(1, 6):
        st("slow zone", 1000 + 50 * k, rng=1)
    start("search timeout")
    st("search timeout", 1000, cmd=A)
    t = 1000
    for k in range(int(T_SEARCH / 1000) + 3):
        t += 1000
        st("search timeout", t, cmd=A)
    start("clock wrap")
    t0 = 0xFFFFFFFF - 2000
    st("clock wrap", t0, cmd=A)
    for k in range(1, 100):
        st("clock wrap", t0 + 100 * k, cmd=(A if k % 5 == 0 else 0))
    start("unknown battery")
    st("unknown battery", 1000, cmd=A)
    st("unknown battery", 1050, known=0, batt=0.0)
    start("unknown distance")
    st("unknown distance", 1000, cmd=A)
    st("unknown distance", 1050, rng=1)
    stdin += ["frame typical", "frame full", "frame min", "gridjson worst 32 24", "gridjson normal 32 24", "gridjson normal 8 8"]
    with tempfile.TemporaryDirectory() as tmp:
        out, err = run_harness(tmp, "rover_pure", rover, ROVER_MAIN, "\n".join(stdin) + "\n")
        if out is None:
            check("rover MANARA-PURE block compiles with g++ -Wall -Wextra", False, err)
            return
        check("rover MANARA-PURE block compiles with g++ -Wall -Wextra (no warnings)", err.strip() == "" or "warning" not in err, err[:300])
        lines = out.splitlines()
        pick = lambda tag: [l for l in lines if l.startswith(tag + " ")]
        mix_l, echo_l, range_l, batt_l, hot_l, per_l, par_l, S_l = pick("mix"), pick("echo"), pick("range"), pick("batt"), pick("hot"), pick("person"), pick("parse"), pick("S")
        check("harness produced every answer", len(mix_l) == len(mixes) and len(echo_l) == len(echoes) and len(range_l) == len(ranges) and len(batt_l) == len(batts)
              and len(hot_l) == len(synth) + 3 and len(per_l) == len(person_cases) + 2 and len(par_l) == len(parses) and len(S_l) == sum(len(v) for v in scen.values()),
              (len(mix_l), len(echo_l), len(range_l), len(batt_l), len(hot_l), len(per_l), len(par_l), len(S_l)))

        # --- drive mixing
        mx = [tuple(int(x) for x in l.split()[1:]) for l in mix_l]
        check("mixDrive: straight 50 % at a 60 % cap = 30 / 30; reverse = -30 / -30; spin right = 30 / -30", mx[0] == (30, 30) and mx[3] == (-30, -30) and mx[2] == (30, -30), mx[:4])
        check("mixDrive: a clipped side keeps the ratio (100 + 100 turn = 100 / 0), and the cap is never exceeded", mx[1] == (100, 0) and all(abs(a) <= m and abs(b) <= m for (a, b), (_, _, m) in zip(mx, mixes)), mx)
        check("mixDrive: 80 + 80 at a cap of 60 never exceeds 60; a 30 cap scales 100 to 30", mx[4] == (60, 60) or max(abs(x) for x in mx[4]) <= 60, mx[4])

        # --- echo
        ec = [l.split()[1] for l in echo_l]
        c25 = 331.3 + 0.606 * 25
        check("echoToCm: 5830 microseconds at 25 C = %.2f cm (speed of sound 331.3 + 0.606 T)" % (5830 * 0.5 * c25 / 10000), abs(float(ec[0]) - 5830 * 0.5 * c25 / 10000) < 0.01, ec[0])
        check("echoToCm: no echo (0 us) is unknown (NaN), never 0 cm", ec[1].lower() == "nan", ec[1])
        check("echoToCm: heat lengthens the distance (45 C reads about 5 % more than 25 C for the same pulse)", 1.03 < float(ec[2]) / float(ec[0]) < 1.06, (ec[0], ec[2]))
        check("echoToCm: double the time = double the distance", abs(float(ec[3]) / float(ec[0]) - 2.0) < 0.001, ec[3])

        # --- stop / slow zones
        rg = [int(l.split()[1]) for l in range_l]
        check("rangeState: 100 cm clear, 40 cm slow, 15 cm stop", rg[:3] == [0, 1, 2], rg[:3])
        check("rangeState: hysteresis (22 cm stays STOP if it was STOP, but is only SLOW if it was clear; 48 cm stays SLOW if it was SLOW)", rg[3] == 2 and rg[4] == 1 and rg[5] == 1 and rg[6] == 0, rg[3:7])
        check("rangeState: unknown distance (no echo) and the blind zone are SLOW, NEVER clear", rg[7] == 1 and rg[8] == 1, rg[7:9])
        check("rangeState: the thresholds are the CONFIG numbers (just inside STOP_CM is STOP, just inside SLOW_CM is SLOW)", rg[9] == 2 and rg[10] == 1 and rg[11] == 2, rg[9:])

        # --- battery
        bp = [int(l.split()[1]) for l in batt_l]
        check("battPct: full 100, empty 0, half 50, clamped above and below", bp == [100, 0, 50, 100, 0], bp)

        # --- hot-spot test: same rule as the website
        names = list(synth.keys())
        res = {n: l.split() for n, l in zip(names, hot_l[:len(names)])}
        check("rover hot-spot: a hot mug is hot; a cold room, a hand and a 58 C wall are not; a real fire blob is", res["mug"][1] == "1" and res["cold"][1] == "0" and res["hand"][1] == "0" and res["warm wall (58 C everywhere)"][1] == "0" and res["real fire blob"][1] == "1", {n: r[1] for n, r in res.items()})
        amg = hot_l[len(names):len(names) + 2]
        check("rover hot-spot works on an 8x8 (AMG8833) image: a 71 C pixel is hot, the same image without it is not; x, y are normalised by (w-1), (h-1)",
              amg[0].split()[1] == "0" and amg[1].split()[1] == "1" and abs(float(amg[1].split()[9]) - 5 / 7) < 0.001 and abs(float(amg[1].split()[10]) - 3 / 7) < 0.001, amg)
        check("rover: a grid with a NaN pixel is rejected by gridSane()", hot_l[-1].endswith("sane=0") and all(l.endswith("sane=1") for l in hot_l[:-1]))
        if have("node"):
            ref_js, why = js_reference(tmp, [], list(synth.values()))
            if ref_js is None:
                check("node could load js/detect.js for the rover cross-check", False, why)
            else:
                same = all(int(l.split()[1]) == int(r[0]) for l, r in zip(hot_l[:len(names)], ref_js["grids"]))
                check("rover hot-spot decision = website hotspotTest() on every synthetic grid", same, [(l.split()[1], r[0]) for l, r in zip(hot_l, ref_js["grids"])])
                dd = 0.0
                for l, r in zip(hot_l[:len(names)], ref_js["grids"]):
                    f = l.split()
                    dd = max(dd, abs(float(f[4]) - r[1]), abs(float(f[6]) - r[2]), abs(float(f[7]) - r[3]), abs(float(f[8]) - r[4]), abs(float(f[9]) - r[5]) * 31, abs(float(f[10]) - r[6]) * 23)
                check("rover bgMean / MAD / threshold / position = website values (worst diff %.4f)" % dd, dd < 0.02, dd)

        # --- warm shape
        pr = {n: l.split() for n, l in zip(person_cases.keys(), per_l[:len(person_cases)])}
        k0 = "person-sized warm blob (33 C) in a 24 C room"
        f = pr[k0]
        check("warm shape: a 33 C person-sized blob in a 24 C room is FOUND, at its centre (x about 0.39, y about 0.52), contrast about 9 K", f[1] == "1" and abs(float(f[7]) - 12.5 / 31) < 0.03 and abs(float(f[8]) - 11.5 / 23) < 0.03 and 7.5 < float(f[6]) < 10.5, f)
        check("warm shape: in a hot room (35.5 C background) the key is OFF (hotRoom = 1, found = 0): the honest limit", pr["hot room (35.5 C background)"][1] == "0" and pr["hot room (35.5 C background)"][2] == "1", pr["hot room (35.5 C background)"])
        check("warm shape: a hot mug is not a person (above PERSON_MAX_C)", pr["hot mug (65 C)"][1] == "0", pr["hot mug (65 C)"])
        check("warm shape: 4 pixels is too small, half the image is a warm wall, 5 K above a 24 C room (29 C) is below PERSON_DELTA_K + the minimum temperature",
              pr["tiny warm spot (4 pixels)"][1] == "0" and pr["half the image warm (a warm wall)"][1] == "0", (pr["tiny warm spot (4 pixels)"], pr["half the image warm (a warm wall)"]))
        a_ok, a_one = per_l[-2].split(), per_l[-1].split()
        check("warm shape on an 8x8 image: 4 warm pixels are found, a single pixel is not", a_ok[1] == "1" and a_one[1] == "0", (a_ok, a_one))

        # --- command parser
        pp = [l.split() for l in par_l]
        check("parser: approve is read (kind 1)", pp[0][1] == "ok" and pp[0][2] == "1", pp[0])
        check("parser: drive l=-70 r=120 is read and clamped to -70 / 100 (tolerant of spaces)", pp[1][1] == "ok" and [int(x) for x in pp[1][2:5]] == [6, -70, 100], pp[1])
        check("parser: say follow is read; an unknown sound is refused", pp[2][1] == "ok" and pp[2][5] == "1" and pp[3][1] == "bad", pp[2:4])
        check("parser: recall is read; wrong version, wrong type, unknown or missing cmd and garbage are refused", pp[4][1] == "ok" and all(x[1] == "bad" for x in pp[5:]), pp[4:])

        # --- the state machine
        R = {}
        off = 0
        for name in order:
            n = len(scen[name])
            R[name] = [tuple(float(x) for x in l.split()[1:]) for l in S_l[off:off + n]]
            off += n
        ST_STOWED, ST_APPROVED, ST_SEARCH, ST_HOLD, ST_FAULT = 0, 1, 2, 3, 4
        w_none, w_obst, w_heat, w_batt, w_link, w_estop, w_recall, w_time = range(8)
        fwd = int(C["SEARCH_PCT"] * C["DRIVE_MAX_PCT"] / 100)
        slow = int(C["SLOW_PCT"] * C["DRIVE_MAX_PCT"] / 100)
        # tuple = (state, l, r, why, say, approved)
        a = R["no approval"]
        check("no human approval: the rover NEVER moves, whatever the sensors, a drive command or a search command say (60 ticks)", all(x[0] == ST_STOWED and x[1] == 0 and x[2] == 0 for x in a), a[:3])
        a = R["approve and search"]
        check("a fresh approve leaves STOWED and starts the search with the 'follow' tone", a[0][0] == ST_SEARCH and a[0][4] == 1 and a[0][5] == 1, a[0])
        check("while searching with a clear path it drives straight at SEARCH_PCT x DRIVE_MAX_PCT (%d / %d), kept alive by repeated approves" % (fwd, fwd), all(x[0] == ST_SEARCH and x[1] == fwd and x[2] == fwd for x in a[1:]), a[1:3])
        a = R["obstacle"]
        stop_part = a[11:20]
        check("an obstacle at STOP range: no forward motion, it turns on the spot (wheels opposite) and says why = obstacle", all(x[1] == -x[2] and x[1] != 0 and x[3] == w_obst for x in stop_part), stop_part[:2])
        after = a[-6:]
        check("after the turn (TURN_MS) and a clear path it drives forward again and the reason clears", all(x[1] == fwd and x[2] == fwd and x[3] == w_none for x in after), after[:2])
        check("no tick ever drives FORWARD while the range is STOP", all(not (x[1] + x[2] > 0) for x in a[11:21]), a[11:21])
        a = R["keep-alive"]
        check("no keep-alive for APPROVE_TTL_MS: the rover stops, goes back to STOWED, approved = false, why = link", a[-1][0] == ST_STOWED and a[-1][5] == 0 and a[-1][3] == w_link and a[-1][1] == 0 and a[-1][2] == 0 and a[int(T_TTL / 50) - 2][0] == ST_SEARCH, (a[-1], a[int(T_TTL / 50) - 2]))
        a = R["person found"]
        check("a warm shape stops the search: HOLDING, wheels off, 'found' tone once", a[8][0] == ST_HOLD and a[8][1] == 0 and a[8][2] == 0 and a[8][4] == 2, a[8])
        check("it stays HOLDING until a human says search (firefighters decide), then it searches again", all(x[0] == ST_HOLD for x in a[9:-2]) and a[-2][0] == ST_SEARCH, (a[-3], a[-2]))
        a = R["manual drive"]
        check("manual drive without approval is ignored", a[0][0] == ST_STOWED and a[0][1] == 0 and a[0][2] == 0, a[0])
        check("after approve + hold, a manual drive is obeyed for DRIVE_TTL_MS only (50 / 50 -> %d / %d), then the wheels stop" % (int(50 * C["DRIVE_MAX_PCT"] / 100) if False else 50, 50),
              a[2][0] == ST_HOLD and a[3][1] == 50 and a[3][2] == 50 and a[4][1] == 50 and a[5][1] == 0, a[2:6])
        check("a manual drive straight at an obstacle is refused (no forward motion at STOP range)", a[-1][1] == 0 and a[-1][2] == 0 and a[-1][3] == w_obst, a[-1])
        a = R["estop"]
        check("the E-stop: STOWED at once, approved = false, why = estop, wheels off", a[2][0] == ST_STOWED and a[2][5] == 0 and a[2][3] == w_estop and a[2][1] == 0 and a[2][2] == 0, a[2])
        check("while the E-stop is pressed an approve is ignored; after release it still needs a NEW approve", a[3][0] == ST_STOWED and a[4][0] == ST_STOWED and a[5][0] == ST_SEARCH, a[3:6])
        a = R["battery"]
        check("a low battery stops the search (state approved, why = battery); a cut battery is FAULT with the wheels off", a[1][0] == ST_APPROVED and a[1][3] == w_batt and a[3][0] == ST_FAULT and a[3][1] == 0 and a[3][2] == 0, a[1:4])
        check("FAULT is left only with a charged battery AND a new approve", a[4][0] == ST_FAULT and a[5][0] == ST_FAULT and a[6][0] == ST_SEARCH, a[4:7])
        a = R["recall"]
        check("recall: STOWED, approved = false, why = recall, 'stop' tone; it needs a new approve to move again", a[2][0] == ST_STOWED and a[2][3] == w_recall and a[2][4] == 3 and a[2][5] == 0 and a[3][1] == 0 and a[4][0] == ST_SEARCH, a[2:5])
        a = R["heat ahead"]
        check("a hot spot ahead: never drives forward (turns away), why = heat; with the heat gone it drives on", all(x[1] + x[2] <= 0 for x in a[1:6]) and a[1][3] == w_heat and a[-1][1] == fwd, (a[1], a[-1]))
        a = R["slow zone"]
        check("the slow zone caps the speed (%d / %d)" % (slow, slow), all(x[1] == slow and x[2] == slow for x in a[1:]), a[1:3])
        a = R["search timeout"]
        check("a search ends by itself after SEARCH_MAX_MS (state approved, why = timeout, wheels off)", a[-1][0] == ST_APPROVED and a[-1][3] == w_time and a[-1][1] == 0 and a[-3][0] == ST_SEARCH or a[-1][0] == ST_APPROVED and a[-1][3] == w_time, (a[-3], a[-1]))
        a = R["clock wrap"]
        check("the 32-bit millisecond counter wrapping around does not trigger a false keep-alive timeout or a false search timeout", all(x[0] == ST_SEARCH for x in a), [x for x in a if x[0] != ST_SEARCH][:2])
        a = R["unknown battery"]
        check("a missing battery reading does not stop the rover by itself (the other safety rules stay)", a[-1][0] == ST_SEARCH, a[-1])
        a = R["unknown distance"]
        check("an unknown distance is treated as SLOW (the slow-zone speed), not as clear", a[-1][1] == slow, a[-1])

        # --- JSON
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
        check("3 rover frame variants produced", len(frames) == 3, len(frames))
        parsed = []
        for n, txt in frames:
            try:
                parsed.append(json.loads(txt))
            except ValueError as e:
                parsed.append(None)
                check("rover frame is valid JSON", False, "%s :: %s" % (e, txt[:140]))
        if parsed and all(p is not None for p in parsed):
            typ, full, mn = parsed
            ksz = set()
            for p in parsed:
                keys_of(p, ksz)
            check("all rover frames are valid JSON objects with only protocol v1 key names", ksz <= allowed, sorted(ksz - allowed))
            check("typical rover frame: v 1, type rover, state searching, approved, drive 27/27, range 84.2 clear, thermal with a person, battery 71 %, local stop false / why none",
                  typ["v"] == 1 and typ["type"] == "rover" and typ["state"] == "searching" and typ["approved"] is True and typ["drive"] == {"l": 27, "r": 27} and typ["range"] == {"cm": 84.2, "state": "clear"}
                  and typ["thermal"]["person"]["px"] == 14 and typ["batt"] == {"mv": 7420, "pct": 71} and typ["local"] == {"stop": False, "why": "none"}, typ)
            check("a minimal frame still has v, type, ms, state, approved, drive, range (state only), local", set(mn) == {"v", "type", "ms", "state", "approved", "drive", "range", "local"} and mn["range"] == {"state": "slow"}, mn)
            check("the worst-case frame carries every optional part (hot, person, nocontrast, battery, range cm)", {"hot", "person", "nocontrast"} <= set(full["thermal"]) and "batt" in full and "cm" in full["range"], full)
        m = re.search(r"static char frameBuf\[(\d+)\]", rover)
        fb = int(m.group(1)) if m else 0
        longest = max(n for n, _ in frames) if frames else 10 ** 9
        check("rover frameBuf (%d bytes) is larger than the worst-case frame (%d bytes), and the harness used the same size (560)" % (fb, longest), fb > longest + 20 and fb == 560, (fb, longest))
        grids_j = jl.get("G", [])
        m = re.search(r"static char gridBuf\[(\d+)\]", rover)
        gb = int(m.group(1)) if m else 0
        check("3 grid variants produced", len(grids_j) == 3, len(grids_j))
        if len(grids_j) == 3:
            glong = max(n for n, _ in grids_j)
            check("rover gridBuf (%d bytes) is larger than the worst-case grid line (%d bytes: 768 values at -60.0 / 400.0 C)" % (gb, glong), gb > glong + 20, (gb, glong))
            g0, g1, g2 = [json.loads(t) for _, t in grids_j]
            check("grid lines: 32x24 = 768 integers (worst and normal), 8x8 = 64 integers (AMG8833)", g0["w"] == 32 and len(g0["t10"]) == 768 and g1["h"] == 24 and len(g1["t10"]) == 768 and g2["w"] == 8 and g2["h"] == 8 and len(g2["t10"]) == 64, (g0["w"], g2["w"]))
        check("every rover protocol line is ONE line that ends with a newline (declared length = text + '\\n')", all(n == len(txt) + 1 and "\n" not in txt for n, txt in frames + grids_j))


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
bool ledcAttach(uint8_t pin, uint32_t freq, uint8_t resolution);
bool ledcWrite(uint8_t pin, uint32_t duty);
void tone(uint8_t pin, unsigned int frequency, unsigned long duration = 0);
void noTone(uint8_t pin);
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
"Adafruit_AMG88xx.h": r'''#pragma once
#include <Arduino.h>
#include <Wire.h>
#define AMG88xx_PIXEL_ARRAY_SIZE 64
class Adafruit_AMG88xx {
 public:
  Adafruit_AMG88xx(void);
  bool begin(uint8_t addr = 0x69, TwoWire* theWire = NULL);
  void readPixels(float* buf, uint8_t size = AMG88xx_PIXEL_ARRAY_SIZE);
  float readThermistor();
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
    section("4. All three sketches syntax/type-checked with g++ against stub headers (documented signatures)")
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
        rv = read(ROVER)
        rflags = re.findall(r"^#define (HAS_[A-Z0-9_]+)\s+([01])", rv, re.M)
        check("rover has %d HAS_ flags (feature switches)" % len(rflags), len(rflags) >= 7, rflags)
        off = lambda t, name: re.sub(r"^(#define %s\s+)1" % name, r"\g<1>0", t, flags=re.M)
        on = lambda t, name: re.sub(r"^(#define %s\s+)0" % name, r"\g<1>1", t, flags=re.M)
        rvariants = {
            "default configuration (MLX90640)": rv,
            "AMG8833 8x8 camera instead of the MLX90640": on(off(rv, "HAS_MLX90640"), "HAS_AMG8833"),
            "no thermal camera at all": off(rv, "HAS_MLX90640"),
            "every part OFF": re.sub(r"^(#define HAS_[A-Z0-9_]+\s+)1", r"\g<1>0", rv, flags=re.M),
            "no ultrasonic and no battery sense": off(off(rv, "HAS_ULTRASONIC"), "HAS_BATTERY_SENSE"),
            "no speaker, no LED, no E-stop": off(off(off(rv, "HAS_SPEAKER"), "HAS_LED"), "HAS_ESTOP"),
        }
        for label, text in rvariants.items():
            p = os.path.join(tmp, "r.cpp")
            with open(p, "w", encoding="utf-8") as f:
                f.write(text)
            cp = subprocess.run(["g++", "-std=gnu++17", "-fsyntax-only", "-Wall", "-Wextra", "-I", inc, "-x", "c++", p], capture_output=True, text=True)
            errs = [l for l in cp.stderr.splitlines() if "error" in l]
            check("rover compiles: %s" % label, cp.returncode == 0, "; ".join(errs[:3]))
            check("rover compiles with no warnings (-Wall -Wextra): %s" % label, cp.stderr.strip() == "", cp.stderr[:300])
        p = os.path.join(tmp, "r2.cpp")
        with open(p, "w", encoding="utf-8") as f:
            f.write(on(rv, "HAS_AMG8833"))
        cp = subprocess.run(["g++", "-std=gnu++17", "-fsyntax-only", "-I", inc, "-x", "c++", p], capture_output=True, text=True)
        check("rover: both thermal cameras at once is refused at compile time with a clear message", cp.returncode != 0 and "Fit ONE thermal camera" in cp.stderr, cp.stderr[:200])


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
    test_rover()
    test_compile()
    test_page_links()
    print("\n%d passed, %d failed" % (passed, len(failures)))
    if failures:
        for f in failures:
            print("  - " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
