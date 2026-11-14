/* =====================================================================================
   MANARA («منارة») — BENCH ROVER FIRMWARE (Tier 4)                  manara_rover.ino
   -------------------------------------------------------------------------------------
   A small two-motor rover that is the BENCH MODEL of the rescue robot in robot.html and in
   the Control Room: it will not move until a human approves, it searches by driving and turning
   away from obstacles, it looks for a warm shape with a cheap thermal camera, and when it
   finds one it STOPS, blinks its light and beeps, and tells the browser. It never decides alone
   what happens to a person: firefighters decide.

   HONEST STATUS — READ THIS BEFORE YOU FLASH
   * This sketch was written to the documented APIs of the libraries listed below. The author
     could NOT compile it for an ESP32 or run it on real hardware. Treat it as UNTESTED until you
     have flashed it and ticked the test checklist in kit/README.md.
   * The decisions (drive mixing, ultrasonic maths, stop/slow zones, battery estimate, hot-spot
     rule, warm-shape ("person") rule, the approval and safety state machine, command parser,
     JSON writer) live in the block marked MANARA-PURE below. That block is compiled and run on a
     PC by manara/tools/test_kit.py, so those parts ARE tested. The motors, the wiring and what
     the rover does on a real floor are NOT.
   * It is a BENCH PROTOTYPE of a concept. It is not a rescue robot, it is not approved by any
     authority, it cannot climb stairs, it cannot open doors, it does not know where it is, and a
     thermal camera sees a warm shape, not a person. In a hot room (background above
     PERSON_BG_MAX_C) the warm-shape key is switched off, because there is no contrast.
   * The speaker makes TONES only. Spoken Arabic/English guidance would need an audio-player
     module with recorded files; it is not included.
   * Never use it near people unsupervised, near stairs or edges, or near real fire.

   WHAT IT DOES
   1. APPROVE  The rover starts STOWED. A fresh {"cmd":"approve"} from the browser (the human
               key, repeated about once a second as a keep-alive) lets it leave STOWED. If the
               keep-alive stops for APPROVE_TTL_MS, the rover stops and goes back to STOWED.
   2. SEARCH   Drive forward; slow down near an obstacle (ultrasonic); turn away when it is close;
               stop for good if the thermal image shows a hot spot ahead (it never drives at heat).
   3. FIND     A warm shape (rule below) = state HOLDING: motors off, friendly light, found-beep.
               It stays there until a human says "search" again or "recall".
   4. TALK     115200 baud, one JSON object per line ("serial protocol v1", manara/docs/MANARA-SPEC.md):
               board -> browser: {"type":"rover"} about 2 Hz and {"type":"grid"} about 1 Hz;
               browser -> board: {"type":"rover","cmd":"approve|search|hold|stop|recall|drive|say"}.
               Lines starting with '#' are human notes; parsers ignore them.

   LOCAL SAFETY RULES (they never wait for the browser and the browser cannot override them)
     * E-stop button, low battery, no keep-alive: motors off.        * Obstacle STOP: no forward motion.
     * Hot spot ahead (>= 57 C and clearly hotter than the room): no forward motion.
     * Speed is capped by DRIVE_MAX_PCT; near an obstacle by SLOW_PCT.  * Unknown distance = slow, never "clear".

   LIBRARIES (Arduino IDE 2.x, Library Manager) — see kit/README.md for versions
     Adafruit MLX90640 (HAS_MLX90640) OR Adafruit AMG88xx Library (HAS_AMG8833), not both.
     Adafruit BusIO and Adafruit Sensor are pulled in as dependencies. No motor library: the sketch
     drives an L298N or TB6612FNG with plain GPIO and the ESP32 LEDC PWM (Arduino core 3.x API).
   BOARD:  "ESP32 Dev Module" (esp32 by Espressif Systems, Arduino core 3.x), 115200 baud.

   SAFETY AT THE BENCH: first test with the wheels OFF THE GROUND (rover on a box). Motors on their
   own battery pack, common ground with the ESP32. No flames, no real smoke, no bare LiPo.
   See the Build page, section "Tier 4 — drone and rescue rover".
   ===================================================================================== */

// ------------------------------- BEGIN CONFIG (read by the PC test) ----------------------
// 1) WHICH PARTS DO YOU HAVE?   1 = fitted, 0 = not fitted (the sketch leaves that part out)
#define HAS_MLX90640          1   // thermal camera 32x24, I2C 0x33
#define HAS_AMG8833           0   // thermal camera 8x8, I2C 0x69 (use this OR the MLX90640)
#define HAS_ULTRASONIC        1   // HC-SR04 looking forward
#define HAS_BATTERY_SENSE     1   // battery voltage through a divider (2S pack)
#define HAS_SPEAKER           1   // small passive speaker (tones only)
#define HAS_LED               1   // friendly light (one LED through a resistor)
#define HAS_ESTOP             1   // push button: pressed = motors off

// 2) PIN MAP — ESP32 DevKit (30/38-pin "DOIT" style). Change here, nowhere else.
//    The motor driver is an L298N or a TB6612FNG: one PWM pin and two direction pins per motor.
#define PIN_I2C_SDA     21   // I2C bus 0: thermal camera
#define PIN_I2C_SCL     22
#define PIN_MOTL_PWM    25   // left motor: speed (ENA / PWMA)
#define PIN_MOTL_IN1    26   // left motor: direction
#define PIN_MOTL_IN2    27
#define PIN_MOTR_PWM    33   // right motor: speed (ENB / PWMB)
#define PIN_MOTR_IN1    32   // right motor: direction
#define PIN_MOTR_IN2    13
#define PIN_TRIG        23   // HC-SR04 trigger (3.3 V is enough)
#define PIN_ECHO        19   // HC-SR04 echo: 5 V signal! 1k/2k divider to 3.3 V
#define PIN_BATT        34   // ADC1 ch6, input only: battery through a 100k/47k divider
#define PIN_SPEAKER     18   // speaker through a 100 ohm resistor (or a small NPN transistor)
#define PIN_LED          4   // friendly light, 330 ohm to GND
#define PIN_ESTOP       17   // push button to GND (internal pull-up)

// 3) BEHAVIOUR — every number marked "student-set" is YOURS to calibrate and defend
#define SERIAL_BAUD            115200
#define LOOP_MS                50         // control loop 20 Hz
#define FRAME_MS               500        // rover frame ~2 Hz
#define GRID_MS                1000       // thermal image ~1 Hz
#define PWM_HZ                 20000      // above hearing; the L298N/TB6612 accept it
#define PWM_BITS               8
#define DRIVE_MAX_PCT          60         // never drive faster than this (student-set; first tests: 40)
#define SEARCH_PCT             45         // forward speed while searching (student-set)
#define SLOW_PCT               25         // forward speed in the slow zone (student-set)
#define TURN_PCT               40         // turning speed (wheels opposite)
#define TURN_MS                900        // one avoidance turn (student-set: depends on your wheels and floor)
#define STOP_CM                20.0f      // closer than this: stop going forward
#define SLOW_CM                45.0f      // closer than this: slow down
#define RANGE_HYST_CM          5.0f       // hysteresis, so the state does not flap
#define ECHO_TIMEOUT_US        12000      // ~2 m
#define APPROVE_TTL_MS         3000       // no keep-alive for this long = stop and back to STOWED
#define DRIVE_TTL_MS           600        // a manual "drive" command is obeyed for this long
#define SEARCH_MAX_MS          180000UL   // a search ends by itself after 3 minutes (student-set)
#define HOLD_BLINK_MS          2000       // friendly-light beat while holding
#define BATT_DIVIDER_RATIO     3.128f     // (100k + 47k) / 47k
#define BATT_FULL_MV           8400.0f    // 2S Li-ion full (a crude estimate: check your cell's datasheet)
#define BATT_EMPTY_MV          6000.0f
#define BATT_LOW_MV            6600       // below this: warn, and stop searching
#define BATT_CUT_MV            6200       // below this: FAULT, motors off
#define HOT_ABS_C              57.0f      // listed heat-detector rating, 135 F (docs S58); same as the sentinel
#define HOT_CTX_K              3.0f       // contextual rule, same as js/detect.js: > mean + 3*MAD ...
#define HOT_CTX_RISE_C         6.0f       // ... and > mean + 6 C
#define PERSON_MIN_C           28.0f      // a clothed body surface is roughly 28-37 C at a distance (student-set; calibrate)
#define PERSON_MAX_C           42.0f      // hotter than this is not a person (mug, lamp, fire)
#define PERSON_DELTA_K         4.0f       // at least this much warmer than the room's median pixel
#define PERSON_BG_MAX_C        34.0f      // a hotter room: no contrast, the key is OFF (the honest limit)
#define PERSON_MIN_FRAC        0.006f     // at least this share of the image (but at least 2 pixels)
#define PERSON_MAX_FRAC        0.35f      // more than this is a warm wall or a sunlit surface, not a person
#define PERSON_SUSTAIN_MS      1500       // the shape must persist this long before the rover stops for it
#define SAY_FOLLOW_HZ          880        // tone patterns (the speaker cannot speak words)
#define SAY_FOUND_HZ           1320
#define SAY_STOP_HZ            440
#define LED_ON_LEVEL           HIGH
#define ESTOP_PRESSED_LEVEL    LOW
// ------------------------------- END CONFIG ----------------------------------------------

#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <algorithm>

#if HAS_MLX90640 && HAS_AMG8833
  #error "Fit ONE thermal camera: set HAS_MLX90640 or HAS_AMG8833 to 0"
#endif
#if HAS_MLX90640
  #include <Adafruit_MLX90640.h>
#endif
#if HAS_AMG8833
  #include <Adafruit_AMG88xx.h>
#endif

// ------------------------------- BEGIN MANARA-PURE (compiled by the PC test) -------------
// No Arduino calls in here: only C++ and <math.h>. All TYPES are declared before the first
// function (the Arduino preprocessor adds prototypes before the first function).
#define TH_MAX 768        // the biggest image (MLX90640 32x24); the AMG8833 uses 64

enum RoverState { RS_STOWED = 0, RS_APPROVED, RS_SEARCHING, RS_HOLDING, RS_FAULT };
enum RangeState { RG_CLEAR = 0, RG_SLOW, RG_STOP };
enum RoverCmdKind { CMD_NONE = 0, CMD_APPROVE, CMD_SEARCH, CMD_HOLD, CMD_STOP, CMD_RECALL, CMD_DRIVE, CMD_SAY };
enum Why { WHY_NONE = 0, WHY_OBSTACLE, WHY_HEAT, WHY_BATTERY, WHY_LINK, WHY_ESTOP, WHY_RECALL, WHY_TIMEOUT };
enum Say { SAY_NONE = 0, SAY_FOLLOW, SAY_FOUND, SAY_STOP };

struct Hotspot {
  bool hot, absOk, ctxOk;
  float tmax, tmean, bgMean, bgMad, ctxThr, x, y;
  int idx;
};
struct PersonResult {
  bool found, hotRoom;      // hotRoom = the background is too warm: the key is off
  int nPix;
  float tmax, bgMedian, contrast, x, y;
};
struct RoverCmd {
  RoverCmdKind kind;
  int l, r;                 // manual drive, percent -100..100
  Say say;
};
struct Rover {
  RoverState st;
  bool approved;
  uint32_t approvedAt, searchSince, turnUntil, manualUntil;
  int turnDir;
  int l, r;                 // wheel command now, percent -100..100
  Why why;
  Say say;                  // a tone pattern to play once (the hardware side clears it)
  int manualL, manualR;
};
struct RoverIn {
  uint32_t now;
  bool estop;
  RangeState range;
  bool battKnown;
  float battMv;
  bool person, hot;         // thermal keys for this tick (already sustained)
  bool haveCmd;
  RoverCmd cmd;
};
struct RoverFrame {
  uint32_t ms;
  RoverState st;
  bool approved;
  int l, r;
  bool hasRange;  float cm;  RangeState rg;
  bool hasThermal;  float tmax, tmean;  bool hot;  float hotX, hotY, hotT;  bool person;  float px, py, dt;  int pxN;  bool noContrast;
  bool hasBatt;  int mv, pct;
  bool stop;  Why why;
};
struct OutBuf {
  char* p;
  size_t cap;
  size_t len;
};

static const char* const ST_NAME[5] = { "stowed", "approved", "searching", "holding", "fault" };
static const char* const RG_NAME[3] = { "clear", "slow", "stop" };
static const char* const WHY_NAME[8] = { "none", "obstacle", "heat", "battery", "link", "estop", "recall", "timeout" };

static bool fin(float x) { return x == x && x < 3.0e38f && x > -3.0e38f; }
static int clampi(int v, int a, int b) { return v < a ? a : (v > b ? b : v); }

// Tank-style mixing: fwd and turn are percent (-100..100); the result is limited to +-maxPct.
// Positive turn = turn right (the left wheel goes faster than the right one).
static void mixDrive(int fwd, int turn, int maxPct, int* l, int* r) {
  int a = fwd + turn, b = fwd - turn;
  int big = abs(a) > abs(b) ? abs(a) : abs(b);
  if (big > 100) { a = a * 100 / big; b = b * 100 / big; }          // keep the ratio when one side would clip
  *l = clampi(a * maxPct / 100, -maxPct, maxPct);
  *r = clampi(b * maxPct / 100, -maxPct, maxPct);
}

// HC-SR04: echo pulse (microseconds, out and back) to centimetres. Speed of sound 331.3 + 0.606*T m/s.
// 0 microseconds = no echo = unknown (NAN).
static float echoToCm(uint32_t us, float tempC) {
  if (us == 0) return NAN;
  float c = 331.3f + 0.606f * (fin(tempC) ? tempC : 25.0f);
  return ((float)us * 0.5f) * c / 10000.0f;
}

// Stop / slow / clear with hysteresis. Unknown distance is NEVER "clear": it is SLOW.
static RangeState rangeState(float cm, RangeState prev) {
  if (!fin(cm) || cm < 2.0f) return RG_SLOW;                          // no echo or inside the sensor's blind zone
  float stopOn = STOP_CM, slowOn = SLOW_CM;
  if (prev == RG_STOP) stopOn += RANGE_HYST_CM;
  if (prev >= RG_SLOW) slowOn += RANGE_HYST_CM;
  if (cm < stopOn) return RG_STOP;
  if (cm < slowOn) return RG_SLOW;
  return RG_CLEAR;
}

// Battery: millivolts at the pack (the ADC reading times the divider ratio) to a crude percentage.
static int battPct(float mv) {
  float p = (mv - BATT_EMPTY_MV) * 100.0f / (BATT_FULL_MV - BATT_EMPTY_MV);
  return (int)(p < 0.0f ? 0.0f : (p > 100.0f ? 100.0f : p) + 0.5f);
}

static bool gridSane(const float* g, int n) {
  for (int i = 0; i < n; i++) if (!fin(g[i]) || g[i] < -60.0f || g[i] > 400.0f) return false;
  return true;
}

// Hot-spot test on one w*h image. Same rule as js/detect.js hotspotTest() and the sentinel:
//   background = the coolest 80 % of the pixels; mean and mean-absolute-deviation of those;
//   contextual threshold = mean + max(3*max(MAD, 0.25), 6 C);   absolute: >= 57 C.
//   hot = (hottest pixel >= 57 C) AND (hottest pixel > contextual threshold).
// `scratch` is an n float buffer (it is sorted in place).
static Hotspot hotspotTest(const float* g, int n, int w, int h, float* scratch) {
  Hotspot o;
  double sumAll = 0.0;
  float tmax = -1.0e9f;
  int ix = 0;
  for (int i = 0; i < n; i++) {
    float v = g[i];
    scratch[i] = v;
    sumAll += v;
    if (v > tmax) { tmax = v; ix = i; }
  }
  std::sort(scratch, scratch + n);
  int nb = (int)(n * 0.8f);
  if (nb < 4) nb = 4;
  double sum = 0.0;
  for (int i = 0; i < nb; i++) sum += scratch[i];
  float mean = (float)(sum / nb);
  double dev = 0.0;
  for (int i = 0; i < nb; i++) dev += fabsf(scratch[i] - mean);
  float mad = (float)(dev / nb);
  float k = HOT_CTX_K * (mad > 0.25f ? mad : 0.25f);
  float ctxThr = mean + (k > HOT_CTX_RISE_C ? k : HOT_CTX_RISE_C);
  o.tmax = tmax;
  o.tmean = (float)(sumAll / n);
  o.bgMean = mean;
  o.bgMad = mad;
  o.ctxThr = ctxThr;
  o.absOk = tmax >= HOT_ABS_C;
  o.ctxOk = tmax > ctxThr;
  o.hot = o.absOk && o.ctxOk;
  o.idx = ix;
  o.x = (float)(ix % w) / (float)(w - 1);
  o.y = (float)(ix / w) / (float)(h - 1);
  return o;
}

// Warm-shape ("possible person") rule — rule-based, NOT AI, and it only says "a warm shape is there":
//   background = the median pixel. If the background is hotter than PERSON_BG_MAX_C there is no contrast:
//   hotRoom = true, found = false (the honest limit: in a hot room the key is off).
//   candidate pixels: PERSON_MIN_C <= t <= PERSON_MAX_C and t >= background + PERSON_DELTA_K.
//   found = enough candidates (PERSON_MIN_FRAC of the image, at least 2 pixels) but not too many (PERSON_MAX_FRAC).
static PersonResult personTest(const float* g, int n, int w, int h, float* scratch) {
  PersonResult o;
  memset(&o, 0, sizeof(o));
  for (int i = 0; i < n; i++) scratch[i] = g[i];
  std::sort(scratch, scratch + n);
  o.bgMedian = scratch[n / 2];
  if (o.bgMedian >= PERSON_BG_MAX_C) { o.hotRoom = true; return o; }
  float thr = o.bgMedian + PERSON_DELTA_K;
  if (thr < PERSON_MIN_C) thr = PERSON_MIN_C;
  int cnt = 0;
  double sx = 0.0, sy = 0.0, st = 0.0;
  float tmax = -1.0e9f;
  for (int i = 0; i < n; i++) {
    float v = g[i];
    if (v >= thr && v <= PERSON_MAX_C) {
      cnt++;
      sx += (double)(i % w);
      sy += (double)(i / w);
      st += v;
      if (v > tmax) tmax = v;
    }
  }
  int minPx = (int)ceilf((float)n * PERSON_MIN_FRAC);
  if (minPx < 2) minPx = 2;
  o.nPix = cnt;
  if (cnt >= minPx && (float)cnt <= (float)n * PERSON_MAX_FRAC) {
    o.found = true;
    o.tmax = tmax;
    o.contrast = (float)(st / cnt) - o.bgMedian;
    o.x = (float)(sx / cnt) / (float)(w - 1);
    o.y = (float)(sy / cnt) / (float)(h - 1);
  }
  return o;
}

static void stopMotors(Rover* v) { v->l = 0; v->r = 0; }

// The approval and safety state machine, called every LOOP_MS. It is the only thing that sets the wheel
// command, so every rule below applies to every state. Order matters: SAFETY FIRST, then commands, then behaviour.
//   STOWED   -> (fresh "approve") -> SEARCHING     the human key; a missing keep-alive sends it back to STOWED
//   SEARCHING-> (warm shape) -> HOLDING             stops and says so; it stays until "search" / "recall"
//   any      -> E-stop / "stop" / "recall" -> STOWED, battery cut -> FAULT
static void roverStep(Rover* v, const RoverIn& in) {
  uint32_t now = in.now;
  v->say = SAY_NONE;                                                   // a tone request lasts one tick; `why` is sticky (it says why the rover is not going forward)

  // 1) safety that no command can override
  if (in.estop) {
    if (v->st != RS_STOWED) v->say = SAY_STOP;
    v->st = RS_STOWED; v->approved = false; stopMotors(v); v->why = WHY_ESTOP;
    return;
  }
  if (in.battKnown && in.battMv <= (float)BATT_CUT_MV) {
    if (v->st != RS_FAULT) v->say = SAY_STOP;
    v->st = RS_FAULT; v->approved = false; stopMotors(v); v->why = WHY_BATTERY;
    return;
  }
  if (v->st == RS_FAULT) {                                              // leave FAULT only with a charged battery AND a new approve
    bool charged = !in.battKnown || in.battMv >= (float)BATT_LOW_MV;
    if (charged && in.haveCmd && in.cmd.kind == CMD_APPROVE) { v->st = RS_STOWED; }
    else { stopMotors(v); v->why = WHY_BATTERY; return; }
  }

  // 2) commands from the browser
  if (in.haveCmd) {
    switch (in.cmd.kind) {
      case CMD_APPROVE:
        v->approved = true;
        v->approvedAt = now ? now : 1;
        if (v->st == RS_STOWED) { v->st = RS_SEARCHING; v->searchSince = now; v->turnUntil = 0; v->why = WHY_NONE; v->say = SAY_FOLLOW; }
        break;
      case CMD_STOP:
      case CMD_RECALL:
        v->st = RS_STOWED; v->approved = false; stopMotors(v);
        v->why = in.cmd.kind == CMD_RECALL ? WHY_RECALL : WHY_NONE;
        v->say = SAY_STOP;
        return;
      case CMD_HOLD:
        if (v->approved && (v->st == RS_SEARCHING || v->st == RS_APPROVED)) v->st = RS_HOLDING;
        break;
      case CMD_SEARCH:
        if (v->approved && (v->st == RS_HOLDING || v->st == RS_APPROVED)) { v->st = RS_SEARCHING; v->searchSince = now; v->turnUntil = 0; v->why = WHY_NONE; }
        break;
      case CMD_DRIVE:
        if (v->approved && (v->st == RS_HOLDING || v->st == RS_APPROVED)) {
          v->manualL = clampi(in.cmd.l, -100, 100);
          v->manualR = clampi(in.cmd.r, -100, 100);
          v->manualUntil = now + DRIVE_TTL_MS;
        }
        break;
      case CMD_SAY:
        v->say = in.cmd.say;
        break;
      default: break;
    }
  }

  // 3) the keep-alive: the human key must keep arriving
  if (v->st != RS_STOWED && (now - v->approvedAt) > (uint32_t)APPROVE_TTL_MS) {
    v->st = RS_STOWED; v->approved = false; stopMotors(v); v->why = WHY_LINK; v->say = SAY_STOP;
    return;
  }

  // 4) behaviour
  int l = 0, r = 0;
  switch (v->st) {
    case RS_SEARCHING: {
      if (in.battKnown && in.battMv < (float)BATT_LOW_MV) { v->st = RS_APPROVED; v->why = WHY_BATTERY; break; }   // low battery: stop searching
      if (in.person) { v->st = RS_HOLDING; v->why = WHY_NONE; v->say = SAY_FOUND; break; }
      if (now - v->searchSince > (uint32_t)SEARCH_MAX_MS) { v->st = RS_APPROVED; v->why = WHY_TIMEOUT; v->say = SAY_STOP; break; }
      bool turning = (int32_t)(v->turnUntil - now) > 0;
      if (!turning && (in.range == RG_STOP || in.hot)) {                // blocked: turn away (alternate the direction)
        v->turnDir = -v->turnDir;
        if (v->turnDir == 0) v->turnDir = 1;
        v->turnUntil = now + TURN_MS;
        turning = true;
        v->why = in.hot ? WHY_HEAT : WHY_OBSTACLE;
      }
      if (turning) mixDrive(0, v->turnDir * TURN_PCT, DRIVE_MAX_PCT, &l, &r);
      else mixDrive(in.range == RG_SLOW ? SLOW_PCT : SEARCH_PCT, 0, DRIVE_MAX_PCT, &l, &r);
      break;
    }
    case RS_HOLDING:
    case RS_APPROVED:
      if ((int32_t)(v->manualUntil - now) > 0) { l = v->manualL; r = v->manualR; }   // a manual drive command is obeyed briefly
      break;
    default: break;                                                      // STOWED, FAULT: wheels off
  }

  // 5) last word of the local safety on whatever was asked: no forward motion into an obstacle or heat
  int fwd = (l + r) / 2;
  if (fwd > 0 && (in.range == RG_STOP || in.hot)) { l = 0; r = 0; v->why = in.hot ? WHY_HEAT : WHY_OBSTACLE; }
  if (in.range == RG_SLOW) { l = clampi(l, -SLOW_PCT, SLOW_PCT); r = clampi(r, -SLOW_PCT, SLOW_PCT); }
  v->l = l;
  v->r = r;
  if (l > 0 && r > 0) v->why = WHY_NONE;                                 // going forward again: nothing is holding it back
}

// --- tiny JSON helpers (no library): enough to read the flat "rover" command ---
static const char* findKey(const char* s, const char* key) {
  char pat[24];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char* p = s;
  while ((p = strstr(p, pat)) != NULL) {          // a VALUE can look like a key ("cmd":"say" and "say":"follow"): only a match followed by ':' is a key
    const char* q = p + strlen(pat);
    while (*q == ' ') q++;
    if (*q == ':') {
      q++;
      while (*q == ' ') q++;
      return q;
    }
    p++;
  }
  return NULL;
}
static bool jsonStr(const char* line, const char* key, char* out, size_t cap) {
  const char* p = findKey(line, key);
  if (!p || *p != '"') return false;
  p++;
  size_t i = 0;
  while (*p && *p != '"' && i + 1 < cap) out[i++] = *p++;
  out[i] = 0;
  return *p == '"';
}
static bool jsonInt(const char* line, const char* key, long* v) {
  const char* p = findKey(line, key);
  if (!p) return false;
  char* end = NULL;
  long x = strtol(p, &end, 10);
  if (end == p) return false;
  *v = x;
  return true;
}
// Browser -> board:  {"v":1,"type":"rover","cmd":"approve|search|hold|stop|recall|drive|say","l":-100..100,"r":-100..100,"say":"follow|found|stop"}
static bool parseRoverCmd(const char* line, RoverCmd* c) {
  long v = 0, n = 0;
  char type[12], val[12];
  if (!jsonInt(line, "v", &v) || v != 1) return false;
  if (!jsonStr(line, "type", type, sizeof(type)) || strcmp(type, "rover") != 0) return false;
  if (!jsonStr(line, "cmd", val, sizeof(val))) return false;
  c->kind = CMD_NONE;
  c->l = c->r = 0;
  c->say = SAY_NONE;
  if (strcmp(val, "approve") == 0) c->kind = CMD_APPROVE;
  else if (strcmp(val, "search") == 0) c->kind = CMD_SEARCH;
  else if (strcmp(val, "hold") == 0) c->kind = CMD_HOLD;
  else if (strcmp(val, "stop") == 0) c->kind = CMD_STOP;
  else if (strcmp(val, "recall") == 0) c->kind = CMD_RECALL;
  else if (strcmp(val, "drive") == 0) c->kind = CMD_DRIVE;
  else if (strcmp(val, "say") == 0) c->kind = CMD_SAY;
  else return false;
  if (jsonInt(line, "l", &n)) c->l = clampi((int)n, -100, 100);
  if (jsonInt(line, "r", &n)) c->r = clampi((int)n, -100, 100);
  if (jsonStr(line, "say", val, sizeof(val))) {
    if (strcmp(val, "follow") == 0) c->say = SAY_FOLLOW;
    else if (strcmp(val, "found") == 0) c->say = SAY_FOUND;
    else if (strcmp(val, "stop") == 0) c->say = SAY_STOP;
  }
  if (c->kind == CMD_SAY && c->say == SAY_NONE) return false;
  return true;
}

// --- JSON writer (board -> browser). Always one complete line ending in '\n'. ---
static void oapp(OutBuf* o, const char* fmt, ...) {
  if (o->len + 1 >= o->cap) return;
  va_list ap;
  va_start(ap, fmt);
  int r = vsnprintf(o->p + o->len, o->cap - o->len, fmt, ap);
  va_end(ap);
  if (r > 0) o->len += (size_t)r;
  if (o->len > o->cap - 1) o->len = o->cap - 1;
}
static size_t formatRover(char* out, size_t cap, const RoverFrame& d) {
  OutBuf o = { out, cap, 0 };
  oapp(&o, "{\"v\":1,\"type\":\"rover\",\"ms\":%lu,\"state\":\"%s\",\"approved\":%s,\"drive\":{\"l\":%d,\"r\":%d}",
       (unsigned long)d.ms, ST_NAME[d.st], d.approved ? "true" : "false", d.l, d.r);
  if (d.hasRange) oapp(&o, ",\"range\":{\"cm\":%.1f,\"state\":\"%s\"}", d.cm, RG_NAME[d.rg]);
  else oapp(&o, ",\"range\":{\"state\":\"%s\"}", RG_NAME[d.rg]);
  if (d.hasThermal) {
    oapp(&o, ",\"thermal\":{\"tmax\":%.1f,\"tmean\":%.1f", d.tmax, d.tmean);
    if (d.hot) oapp(&o, ",\"hot\":{\"x\":%.2f,\"y\":%.2f,\"t\":%.1f}", d.hotX, d.hotY, d.hotT);
    if (d.person) oapp(&o, ",\"person\":{\"x\":%.2f,\"y\":%.2f,\"px\":%d,\"dt\":%.1f}", d.px, d.py, d.pxN, d.dt);
    if (d.noContrast) oapp(&o, ",\"nocontrast\":true");
    oapp(&o, "}");
  }
  if (d.hasBatt) oapp(&o, ",\"batt\":{\"mv\":%d,\"pct\":%d}", d.mv, d.pct);
  oapp(&o, ",\"local\":{\"stop\":%s,\"why\":\"%s\"}}\n", d.stop ? "true" : "false", WHY_NAME[d.why]);
  return o.len;
}
// Thermal image: w x h row-major, degrees C x 10 as integers (the same "grid" line as the sentinel).
static size_t formatGrid(char* out, size_t cap, const int16_t* t10, int w, int h) {
  OutBuf o = { out, cap, 0 };
  oapp(&o, "{\"v\":1,\"type\":\"grid\",\"w\":%d,\"h\":%d,\"t10\":[", w, h);
  for (int i = 0; i < w * h; i++) oapp(&o, "%s%d", i ? "," : "", (int)t10[i]);
  oapp(&o, "]}\n");
  return o.len;
}
// ------------------------------- END MANARA-PURE -----------------------------------------

// ------------------------------- hardware side (needs an ESP32) --------------------------
#if HAS_MLX90640
  #define TH_W 32
  #define TH_H 24
#elif HAS_AMG8833
  #define TH_W 8
  #define TH_H 8
#else
  #define TH_W 8
  #define TH_H 8
#endif
#define TH_N (TH_W * TH_H)

struct ThermalSnap {
  bool valid;
  uint32_t seq, ms;
  bool hot, person, noContrast;
  float tmax, tmean, hx, hy, ht, px, py, dt;
  int pxN;
  int16_t t10[TH_N];
};

static ThermalSnap thShared, thLocal, thWork;
static portMUX_TYPE thMux = portMUX_INITIALIZER_UNLOCKED;
static volatile uint32_t thBad = 0;
static uint32_t thSeqCounter = 0, lastThSeq = 0;
static float thFrame[TH_N], thScratch[TH_N];
static bool camOk = false;

static Rover rover = { RS_STOWED, false, 0, 0, 0, 0, 1, 0, 0, WHY_NONE, SAY_NONE, 0, 0 };
static RangeState rangeSt = RG_SLOW;
static float rangeCm = NAN, rangeHist[3];
static uint8_t rangeN = 0;
static float battMv = NAN;
static uint32_t personSince = 0;
static bool personKey = false;
static char lineBuf[160];
static uint8_t lineLen = 0;
static RoverCmd pendingCmd = { CMD_NONE, 0, 0, SAY_NONE };
static bool haveCmd = false;
static char frameBuf[560];
static char gridBuf[4800];
static uint32_t nextLoop = 0, nextFrame = 0, nextGrid = 0, nextNote = 0, droppedLines = 0;
static uint32_t sayUntil = 0;
static Say sayNow = SAY_NONE;
static uint32_t sayStart = 0;

#if HAS_MLX90640
static Adafruit_MLX90640 cam;
#endif
#if HAS_AMG8833
static Adafruit_AMG88xx cam;
#endif

static void note(const char* fmt, ...) {          // '#' lines: human notes, ignored by parsers
  char b[160];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(b, sizeof(b), fmt, ap);
  va_end(ap);
  Serial.print("# ");
  Serial.println(b);
}

// ---------------------------------- motors ------------------------------------------------
static void setMotor(uint8_t pwmPin, uint8_t in1, uint8_t in2, int pct) {
  int duty = (abs(pct) * ((1 << PWM_BITS) - 1)) / 100;
  if (pct > 0)      { digitalWrite(in1, HIGH); digitalWrite(in2, LOW); }
  else if (pct < 0) { digitalWrite(in1, LOW);  digitalWrite(in2, HIGH); }
  else              { digitalWrite(in1, LOW);  digitalWrite(in2, LOW); duty = 0; }
  ledcWrite(pwmPin, duty);
}
static void driveMotors(int l, int r) {
  setMotor(PIN_MOTL_PWM, PIN_MOTL_IN1, PIN_MOTL_IN2, l);
  setMotor(PIN_MOTR_PWM, PIN_MOTR_IN1, PIN_MOTR_IN2, r);
}

// ---------------------------------- sensors -----------------------------------------------
#if HAS_ULTRASONIC
static float readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(3);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  return echoToCm((uint32_t)us, 25.0f);              // room temperature assumed: add an SHT31 if you want the correction
}
static float median3(const float* a, uint8_t n) {
  float t[3];
  for (uint8_t i = 0; i < n; i++) t[i] = a[i];
  std::sort(t, t + n);
  return t[n / 2];
}
#endif

#if HAS_MLX90640 || HAS_AMG8833
// Runs on core 0 so the slow thermal read never stalls the control loop. It is the ONLY user of I2C bus 0.
static void thermalTask(void* arg) {
  (void)arg;
  for (;;) {
    bool ok = false;
#if HAS_MLX90640
    ok = camOk && cam.getFrame(thFrame) == 0;
#elif HAS_AMG8833
    if (camOk) { cam.readPixels(thFrame, TH_N); ok = true; }
#endif
    if (ok && gridSane(thFrame, TH_N)) {
      Hotspot hs = hotspotTest(thFrame, TH_N, TH_W, TH_H, thScratch);
      PersonResult pr = personTest(thFrame, TH_N, TH_W, TH_H, thScratch);
      thWork.valid = true;
      thWork.ms = millis();
      thWork.seq = ++thSeqCounter;
      thWork.hot = hs.hot;
      thWork.tmax = hs.tmax;
      thWork.tmean = hs.tmean;
      thWork.hx = hs.x;
      thWork.hy = hs.y;
      thWork.ht = hs.tmax;
      thWork.person = pr.found;
      thWork.noContrast = pr.hotRoom;
      thWork.px = pr.x;
      thWork.py = pr.y;
      thWork.dt = pr.contrast;
      thWork.pxN = pr.nPix;
      for (int i = 0; i < TH_N; i++) thWork.t10[i] = (int16_t)lroundf(thFrame[i] * 10.0f);
      portENTER_CRITICAL(&thMux);
      memcpy(&thShared, &thWork, sizeof(ThermalSnap));
      portEXIT_CRITICAL(&thMux);
    } else {
      thBad = thBad + 1;
      vTaskDelay(pdMS_TO_TICKS(60));
    }
    vTaskDelay(pdMS_TO_TICKS(40));
  }
}
#endif

static void i2cScan() {
  char list[96];
  size_t n = 0;
  list[0] = 0;
  for (uint8_t a = 0x08; a < 0x78; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0 && n + 6 < sizeof(list)) n += snprintf(list + n, sizeof(list) - n, "0x%02X ", a);
  }
  note("I2C bus 0 devices: %s(expect 0x33 MLX90640 or 0x69 AMG8833)", n ? list : "none ");
}

// ---------------------------------- inputs -----------------------------------------------
static void applyLine(const char* line) {
  RoverCmd c;
  if (parseRoverCmd(line, &c)) { pendingCmd = c; haveCmd = true; }
}
static void pollSerial() {
  while (Serial.available()) {
    int ch = Serial.read();
    if (ch < 0) break;
    if (ch == '\n' || ch == '\r') {
      if (lineLen) { lineBuf[lineLen] = 0; applyLine(lineBuf); }
      lineLen = 0;
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = (char)ch;
    } else {
      lineLen = 0;                                      // too long: drop it
    }
  }
}

static void sampleSensors(uint32_t now) {
#if HAS_ULTRASONIC
  float dcm = readDistanceCm();
  if (rangeN < 3) rangeHist[rangeN++] = dcm;
  else { rangeHist[0] = rangeHist[1]; rangeHist[1] = rangeHist[2]; rangeHist[2] = dcm; }
  // median of three, but a NAN (no echo) in the window keeps the answer unknown, which the rule treats as SLOW
  bool anyNan = false;
  for (uint8_t i = 0; i < rangeN; i++) if (!fin(rangeHist[i])) anyNan = true;
  rangeCm = anyNan ? NAN : median3(rangeHist, rangeN);
  rangeSt = rangeState(rangeCm, rangeSt);
#else
  rangeCm = NAN;
  rangeSt = RG_SLOW;                                    // no distance sensor: stay slow, never "clear"
#endif
#if HAS_BATTERY_SENSE
  uint32_t s = 0;
  for (int i = 0; i < 16; i++) s += analogReadMilliVolts(PIN_BATT);
  float mv = ((float)s / 16.0f) * BATT_DIVIDER_RATIO;
  battMv = fin(battMv) ? battMv + 0.2f * (mv - battMv) : mv;
#endif
  if (thShared.seq != lastThSeq) {
    portENTER_CRITICAL(&thMux);
    memcpy(&thLocal, &thShared, sizeof(ThermalSnap));
    portEXIT_CRITICAL(&thMux);
    lastThSeq = thLocal.seq;
  }
  // the warm-shape key must persist before the rover stops for it (a hand wave or a passing reflection is not enough)
  bool freshThermal = thLocal.valid && (now - thLocal.ms) < 3000;
  if (freshThermal && thLocal.person) { if (personSince == 0) personSince = now ? now : 1; }
  else personSince = 0;
  personKey = personSince != 0 && (now - personSince) >= (uint32_t)PERSON_SUSTAIN_MS;
}

// ---------------------------------- outputs ----------------------------------------------
static void playSay(Say s, uint32_t now) {
  if (s == SAY_NONE) return;
  sayNow = s;
  sayStart = now;
  sayUntil = now + 900;
}
static void setTone(int hz) {                         // only touches the LEDC timer when the note changes
  static int cur = 0;
  if (hz == cur) return;
  cur = hz;
  if (hz > 0) tone(PIN_SPEAKER, (unsigned int)hz); else noTone(PIN_SPEAKER);
}
static void updateSpeaker(uint32_t now) {
#if HAS_SPEAKER
  if (sayNow == SAY_NONE) return;
  if ((int32_t)(now - sayUntil) >= 0) { setTone(0); sayNow = SAY_NONE; return; }
  uint32_t t = now - sayStart;
  // three short patterns, all slower than 3 Hz: follow = two rising notes, found = three beeps, stop = one long low tone
  if (sayNow == SAY_FOLLOW) setTone(t < 300 ? SAY_FOLLOW_HZ : (t < 350 ? 0 : SAY_FOLLOW_HZ + 220));
  else if (sayNow == SAY_FOUND) setTone((t % 300) < 150 ? SAY_FOUND_HZ : 0);
  else setTone(SAY_STOP_HZ);
#else
  (void)now;
#endif
}
static void updateLed(uint32_t now) {
#if HAS_LED
  bool on = false;
  switch (rover.st) {
    case RS_SEARCHING: on = (now % 1000) < 500; break;                                   // slow blink: working
    case RS_HOLDING: { uint32_t ph = now % HOLD_BLINK_MS; on = ph < 70 || (ph >= 180 && ph < 250); break; }   // the lighthouse beat: two short flashes every 2 s
    case RS_APPROVED: on = true; break;
    case RS_FAULT: on = (now % 1000) < 120; break;
    default: on = false; break;
  }
  digitalWrite(PIN_LED, on ? LED_ON_LEVEL : !LED_ON_LEVEL);
#else
  (void)now;
#endif
}

// ---------------------------------- output of protocol lines -----------------------------
static void writeLine(const char* buf, size_t len) {
  if ((size_t)Serial.availableForWrite() < len) { droppedLines++; return; }   // never block the control loop
  Serial.write((const uint8_t*)buf, len);
}
static void sendFrame(uint32_t now) {
  RoverFrame d;
  memset(&d, 0, sizeof(d));
  d.ms = now;
  d.st = rover.st;
  d.approved = rover.approved;
  d.l = rover.l;
  d.r = rover.r;
  d.rg = rangeSt;
  if (fin(rangeCm)) { d.hasRange = true; d.cm = rangeCm; }
  if (thLocal.valid && (now - thLocal.ms) < 3000) {
    d.hasThermal = true;
    d.tmax = thLocal.tmax;
    d.tmean = thLocal.tmean;
    d.hot = thLocal.hot;
    d.hotX = thLocal.hx;
    d.hotY = thLocal.hy;
    d.hotT = thLocal.ht;
    d.person = thLocal.person;
    d.px = thLocal.px;
    d.py = thLocal.py;
    d.dt = thLocal.dt;
    d.pxN = thLocal.pxN;
    d.noContrast = thLocal.noContrast;
  }
  if (fin(battMv)) { d.hasBatt = true; d.mv = (int)(battMv + 0.5f); d.pct = battPct(battMv); }
  d.stop = rover.l == 0 && rover.r == 0;
  d.why = rover.why;
  size_t n = formatRover(frameBuf, sizeof(frameBuf), d);
  writeLine(frameBuf, n);
}

void setup() {
  Serial.setTxBufferSize(4096);                       // so a 1 Hz thermal image never blocks the loop
  Serial.begin(SERIAL_BAUD);
  delay(300);
  note("MANARA rover firmware v1.0 - written to documented APIs, UNTESTED on hardware until you flash it. Wheels OFF THE GROUND for the first test.");
  pinMode(PIN_MOTL_IN1, OUTPUT);
  pinMode(PIN_MOTL_IN2, OUTPUT);
  pinMode(PIN_MOTR_IN1, OUTPUT);
  pinMode(PIN_MOTR_IN2, OUTPUT);
  ledcAttach(PIN_MOTL_PWM, PWM_HZ, PWM_BITS);
  ledcAttach(PIN_MOTR_PWM, PWM_HZ, PWM_BITS);
  driveMotors(0, 0);                                  // motors OFF before anything else
#if HAS_ULTRASONIC
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);
#endif
#if HAS_BATTERY_SENSE
  analogSetAttenuation(ADC_11db);                     // 0..~3.1 V range on ADC1
#endif
#if HAS_LED
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, !LED_ON_LEVEL);
#endif
#if HAS_SPEAKER
  pinMode(PIN_SPEAKER, OUTPUT);
#endif
#if HAS_ESTOP
  pinMode(PIN_ESTOP, INPUT_PULLUP);
#endif
#if HAS_MLX90640 || HAS_AMG8833
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  i2cScan();
#if HAS_MLX90640
  camOk = cam.begin(MLX90640_I2CADDR_DEFAULT, &Wire);
  if (camOk) {
    cam.setMode(MLX90640_CHESS);
    cam.setResolution(MLX90640_ADC_18BIT);
    cam.setRefreshRate(MLX90640_4_HZ);
  }
#endif
#if HAS_AMG8833
  camOk = cam.begin(0x69);
#endif
  note(camOk ? "thermal camera ok" : "thermal camera NOT found - the hot-spot and warm-shape keys are disabled");
  Wire.setClock(400000);                              // after every begin(): the libraries may reset the clock
  xTaskCreatePinnedToCore(thermalTask, "thermal", 12288, NULL, 1, NULL, 0);
#endif
  uint32_t t = millis();
  nextLoop = t + 300;
  nextFrame = t + 1000;
  nextGrid = t + 2500;
  nextNote = t + 30000;
  note("STOWED. It will not move until the browser sends {\"cmd\":\"approve\"} about once a second.");
}

void loop() {
  uint32_t now = millis();
  pollSerial();
  if ((int32_t)(now - nextLoop) >= 0) {
    nextLoop = now + LOOP_MS;
    sampleSensors(now);
    RoverIn in;
    memset(&in, 0, sizeof(in));
    in.now = now;
#if HAS_ESTOP
    in.estop = digitalRead(PIN_ESTOP) == ESTOP_PRESSED_LEVEL;
#endif
    in.range = rangeSt;
    in.battKnown = fin(battMv);
    in.battMv = battMv;
    in.person = personKey;
    in.hot = thLocal.valid && (now - thLocal.ms) < 3000 && thLocal.hot;
    in.haveCmd = haveCmd;
    in.cmd = pendingCmd;
    haveCmd = false;
    roverStep(&rover, in);
    driveMotors(rover.l, rover.r);                     // the wheel command comes ONLY from roverStep()
    playSay(rover.say, now);
  }
  updateSpeaker(now);
  updateLed(now);
  if ((int32_t)(now - nextFrame) >= 0) {
    nextFrame = now + FRAME_MS;
    sendFrame(now);
  }
  if ((int32_t)(now - nextGrid) >= 0) {
    nextGrid = now + GRID_MS;
    if (thLocal.valid && (now - thLocal.ms) < 3000) {
      size_t n = formatGrid(gridBuf, sizeof(gridBuf), thLocal.t10, TH_W, TH_H);
      writeLine(gridBuf, n);
    }
  }
  if ((int32_t)(now - nextNote) >= 0) {
    nextNote = now + 30000;
    if (droppedLines) note("dropped %lu protocol lines (serial buffer full)", (unsigned long)droppedLines);
    if (thBad) note("thermal read failures: %lu", (unsigned long)thBad);
  }
  delay(1);
}
