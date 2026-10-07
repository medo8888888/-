/* =====================================================================================
   MANARA («منارة») — SENTINEL / TWIN-BOARD FIRMWARE                manara_sentinel.ino
   -------------------------------------------------------------------------------------
   One ESP32 that watches a tabletop twin (or a real room) with cheap sensors, decides on
   its own whether something is wrong, and talks to the MANARA web pages over USB serial.

   HONEST STATUS — READ THIS BEFORE YOU FLASH
   * This sketch was written to the documented APIs of the libraries listed below. The
     author could NOT compile it for an ESP32 or run it on real hardware. Treat it as
     UNTESTED until you have flashed it and ticked the test checklist in kit/README.md.
   * The maths (hot-spot test, wet bulb, WBGT estimate, heat index, fall logic, JSON
     writer, command parser) lives in the block marked MANARA-PURE below. That block is
     compiled and checked on a PC by tools/manara/test_kit.py, so those parts ARE tested.
   * The sensors are cheap and uncalibrated. Gas numbers are millivolts, not ppm.
   * It is a student prototype. It never replaces a certified fire alarm or gas detector.

   WHAT IT DOES
   1. SENSE   MLX90640 thermal image (32x24), SHT31 temperature/humidity, MQ-2 + MQ-7 gas,
              water level (HC-SR04 over a cup, or a float switch), SOS button, optional
              MPU6050 fall sensor, optional PMS5003 dust, 3 exit switches (A, B, R=roof).
   2. PROVE   LOCAL alarm = two independent keys on the board (see the table below), or the
              human SOS press, or water at danger level. It never waits for a browser, a
              drone, Wi-Fi or a person: the buzzer, ring and exit signs work with only USB
              power. The public alert and the "approve" step live in the web pages.
   3. REACH   WS2812 exit signs (green go / red stop), a friendly ring light, a buzzer.
   4. TALK    115200 baud, one JSON object per line ("serial protocol v1",
              docs/MANARA-SPEC.md):  frame (~4 Hz), grid (~1 Hz), and it accepts "signs".
              Lines starting with '#' are human notes; parsers ignore them.
   5. HEAD    optional pan-tilt head (HAS_HEAD): PATROL -> TRACK -> HOLD on the hottest cell.

   LOCAL ALARM RULES (student-set; change them, then defend them)
     fire   key 1: thermal hot-spot (>= 57 C AND clearly hotter than the background, for 5 s,
                   or rising >= 8.3 C/min)          key 2: MQ-2 smoke index >= 3 sigma
     gas    key 1: MQ-7 or MQ-2 index >= 3 sigma   key 2: the OTHER sensor >= 3 sigma AND a
                   rising trend (3 rising samples)
     flood  warn: depth >= WATER_WARN_CM            alarm: depth >= WATER_DANGER_CM or float closed
     heat   warn: WBGT estimate >= 28 C             alarm: >= 32.1 C for 10 s (ring only, no siren)
     dust   warn: PM10 10-minute average >= 150     (never a local alarm: needs a second key)
     sos    alarm: SOS pressed, or a fall followed by no answer to the check-in for 30 s
   One key = SUSPECT (amber ring, local.alarm=false, local.hazard names the hazard).
   Two keys = ALARM (red ring, siren, exit signs). The browser can only ESCALATE the ring,
   never silence a local alarm, and a "go" sign is never shown on an exit whose switch says locked.

   LIBRARIES (Arduino IDE 2.x, Library Manager) — see kit/README.md for versions
     Adafruit MLX90640, Adafruit SHT31 Library, Adafruit NeoPixel, ESP32Servo (head only),
     Adafruit MPU6050 + Adafruit Unified Sensor (fall sensor only; Adafruit BusIO and
     Adafruit Sensor are pulled in as dependencies).
   BOARD:  "ESP32 Dev Module" (esp32 by Espressif Systems, Arduino core 3.x), 115200 baud.

   SAFETY AT THE BOOTH: no open flame, no flammable gas. Hot mug, sanitiser-vapour swab,
   cup of water, hair dryer, SOS button. See the Build page, section "Booth safety".
   ===================================================================================== */

// ------------------------------- BEGIN CONFIG (read by the PC test) ----------------------
// 1) WHICH PARTS DO YOU HAVE?   1 = fitted, 0 = not fitted (the sketch leaves that part out)
#define HAS_MLX90640          1   // thermal camera, I2C 0x33
#define HAS_SHT31             1   // temperature + humidity, I2C 0x44
#define HAS_MQ2               1   // smoke / combustible gas (analog)
#define HAS_MQ7               1   // carbon monoxide (analog)
#define HAS_PMS5003           0   // dust sensor on UART2 (optional)
#define HAS_WATER_ULTRASONIC  1   // HC-SR04 looking down at a cup / underpass
#define HAS_WATER_FLOAT       0   // float switch (closes when the water reaches it)
#define HAS_MPU6050           0   // fall sensor on the SECOND I2C bus (optional)
#define HAS_SOS               1   // push button
#define HAS_EXITS             1   // three toggle switches: Stair A, Stair B, roof R
#define HAS_STRIP             1   // WS2812: 3 exit signs + a ring on ONE data wire
#define HAS_BUZZER            1   // ACTIVE buzzer (has its own oscillator)
#define HAS_HEAD              0   // pan-tilt head with two SG90 servos

// 2) PIN MAP — ESP32 DevKit (30/38-pin "DOIT" style). Change here, nowhere else.
//    ADC rule: analog sensors sit on ADC1 pins (32-39). ADC2 pins cannot be read while Wi-Fi
//    is on. This sketch does not use Wi-Fi, but keeping analog on ADC1 keeps it future-proof.
#define PIN_I2C_SDA     21   // I2C bus 0: MLX90640 + SHT31
#define PIN_I2C_SCL     22
#define PIN_I2C2_SDA    25   // I2C bus 1: MPU6050 only (own bus, so it never waits for the thermal camera)
#define PIN_I2C2_SCL    26
#define PIN_MQ2         34   // ADC1 ch6, input only: MQ-2 AO through a 10k/20k divider
#define PIN_MQ7         35   // ADC1 ch7, input only: MQ-7 AO through a 10k/20k divider
#define PIN_TRIG        23   // HC-SR04 trigger (3.3 V is enough)
#define PIN_ECHO        19   // HC-SR04 echo: 5 V signal! 1k/2k divider to 3.3 V
#define PIN_FLOAT       33   // float switch to GND (internal pull-up)
#define PIN_SOS          4   // SOS button to GND (internal pull-up)
#define PIN_EXIT_A      13   // toggle switch to GND (internal pull-up)
#define PIN_EXIT_B      14
#define PIN_EXIT_R      27
#define PIN_STRIP       18   // WS2812 data (330 ohm in series)
#define PIN_BUZZER      32   // active buzzer through an NPN transistor
#define PIN_PMS_RX      16   // PMS5003 TX -> this pin (UART2 RX)
#define PIN_SERVO_PAN   17   // SG90 pan
#define PIN_SERVO_TILT   5   // SG90 tilt (GPIO5 is a boot-strapping pin: fine as an output)

// 3) BEHAVIOUR — every number marked "student-set" is YOURS to calibrate and defend
#define SERIAL_BAUD            115200
#define SAMPLE_MS              250        // frame rate ~4 Hz
#define GRID_MS                1000       // thermal image rate ~1 Hz
#define THERMAL_WARMUP_S       240        // MLX90640 warm-up before the hot-spot key is trusted (~4 min)
#define MQ_WARMUP_S            180        // MQ heater warm-up before the baseline (~3 min). Datasheets say 48 h burn-in first time.
#define MQ_BASELINE_S          120        // clean-air baseline length (student-set; 300 s is better)
#define MQ_DIVIDER_RATIO       1.5f       // 10k + 20k divider: AO = ADC * 1.5
#define MQ_SIGMA_FLOOR_MV      3.0f       // never divide by less than this (student-set)
#define MQ_WARN_SIGMA          3.0f       // docs/MANARA-HAZARDS.md: baseline + 3 sigma
#define MQ_SUSTAIN_MS          2000       // a gas/smoke key must hold this long (student-set)
#define HOT_ABS_C              57.0f      // listed heat-detector rating, 135 F (docs S58)
#define HOT_CTX_K              3.0f       // contextual rule, same as js/detect.js: > mean + 3*MAD ...
#define HOT_CTX_RISE_C         6.0f       // ... and > mean + 6 C
#define THERMAL_SUSTAIN_MS     5000       // hot-spot must last this long (docs: 5 s)
#define RISE_RATE_C_PER_MIN    8.3f       // 15 F/min rate-of-rise rating (docs S58)
#define RISE_MIN_TMAX_C        40.0f      // ignore rises that stay below this (student-set)
#define BOOTH_CUP_MODE         1          // 1 = cup-sized thresholds for the booth (SIM scale), 0 = 15/30 cm guidance
#if BOOTH_CUP_MODE
  #define WATER_WARN_CM        3.0f       // BOOTH SCALE, not the 15 cm guidance
  #define WATER_DANGER_CM      6.0f       // BOOTH SCALE, not the 30 cm guidance
#else
  #define WATER_WARN_CM        15.0f      // 6 inches (US NWS guidance, docs S55)
  #define WATER_DANGER_CM      30.0f      // 12 inches
#endif
#define WATER_MOUNT_CM         20.0f      // sensor face to the EMPTY bottom of the cup (measure it!)
#define WATER_FLOAT_LEVEL_CM   6.0f       // depth the float switch is set at (report value when closed)
#define ECHO_TIMEOUT_US        9000       // ~1.5 m
#define HEAT_WARN_WBGT_C       28.0f      // light work, unacclimatised (OSHA/NIOSH, docs S52)
#define HEAT_DANGER_WBGT_C     32.1f      // Qatar stop-work line (docs S19). Ours is an ESTIMATE.
#define HEAT_SUSTAIN_MS        10000
#define GLOBE_OFFSET_C         0.0f       // 0 = in the shade / indoors. Sun load is NOT measured here.
#define PM10_WARN_UGM3         150.0f     // Qatar PM10 24 h standard (docs S31)
#define FALL_IMPACT_G          2.5f       // PLACEHOLDER — calibrate with mattress drop tests (no standard value exists)
#define FALL_SETTLE_MS         1500       // ignore movement just after the impact
#define FALL_MOVE_G            0.35f      // |g - 1| above this after settling = the person is moving
#define FALL_STILL_MS          15000      // stillness after impact before the check-in starts (docs: 15 s)
#define FALL_CHECK_MS          30000      // no answer for this long = SOS (docs: 30 s)
#define HOLD_MS                30000      // an alarm stays at least this long once raised
#define SIREN_MAX_MS           30000      // the buzzer stops after this per alarm; ring and signs stay on
#define CMD_TTL_MS             10000      // a browser "signs" command is obeyed for this long
#define SOS_CLEAR_HOLD_MS      3000       // hold the SOS button this long to clear a latched SOS
#define EXIT_LOCKED_LEVEL      LOW        // switch closed to GND = "locked". Flip if you wired it the other way.
#define BUZZER_ON_LEVEL        HIGH
#define STRIP_BRIGHTNESS       60         // 0..255. Keep low: 24 pixels at full white can draw >1 A.
#define SIGN_PX                4          // pixels per exit sign
#define RING_PX                12         // pixels in the ring
// head (only used when HAS_HEAD = 1)
#define HEAD_PAN_CENTER        90.0f
#define HEAD_TILT_CENTER       90.0f
#define HEAD_PAN_MIN           30.0f
#define HEAD_PAN_MAX           150.0f
#define HEAD_TILT_MIN          50.0f
#define HEAD_TILT_MAX          120.0f
#define HEAD_PAN_SIGN          1.0f       // +1: increasing the pan angle moves the view to the image RIGHT; flip if not
#define HEAD_TILT_SIGN         1.0f       // +1: increasing the tilt angle moves the view DOWN in the image; flip if not
#define HEAD_FOV_H_DEG         55.0f      // MLX90640 "BAA" = 55 x 35 deg, "BAB" = 110 x 75 deg (docs S68)
#define HEAD_FOV_V_DEG         35.0f
#define HEAD_KP                0.5f       // track gain per thermal frame
#define HEAD_PATROL_DEG_S      18.0f
#define HEAD_HOLD_TOL_DEG      2.0f
#define HEAD_HOLD_AFTER_MS     1000
#define HEAD_LOST_MS           3000
#define BOARD_SPAN_H_DEG       55.0f      // angle the twin board spans as seen from the head (calibrate)
#define BOARD_SPAN_V_DEG       35.0f
// ------------------------------- END CONFIG ----------------------------------------------

#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <algorithm>

#if HAS_MLX90640
  #include <Adafruit_MLX90640.h>
#endif
#if HAS_SHT31
  #include <Adafruit_SHT31.h>
#endif
#if HAS_MPU6050
  #include <Adafruit_MPU6050.h>
  #include <Adafruit_Sensor.h>
#endif
#if HAS_STRIP
  #include <Adafruit_NeoPixel.h>
#endif
#if HAS_HEAD
  #include <ESP32Servo.h>
#endif

// ------------------------------- BEGIN MANARA-PURE (compiled by the PC test) -------------
// No Arduino calls in here: only C++ and <math.h>. All TYPES are declared before the first
// function (the Arduino preprocessor adds prototypes before the first function).
#define TH_W 32
#define TH_H 24
#define TH_N 768
#define HAZ_COUNT 7

enum Hazard { HAZ_NONE = 0, HAZ_FIRE, HAZ_GAS, HAZ_FLOOD, HAZ_DUST, HAZ_HEAT, HAZ_SOS };
enum SignState { SG_OFF = 0, SG_GO, SG_STOP };
enum RingCol { RC_OFF = 0, RC_GREEN, RC_AMBER, RC_RED, RC_BLUE };   // RC_BLUE = warm-up, local only
enum FallPhase { FALL_IDLE = 0, FALL_IMPACT, FALL_CHECK };

struct Hotspot {
  bool hot, absOk, ctxOk;
  float tmax, tmean, bgMean, bgMad, ctxThr, x, y;
  int idx;
};
struct FallState {
  FallPhase phase;
  uint32_t t0;
  bool sos;
};
struct SignsCmd {
  SignState s[3];      // A, B, R
  bool siren;
  RingCol ring;
  Hazard hz;
};
struct FrameData {
  uint32_t ms;
  bool hasThermal;  float tmax, tmean, hx, hy;
  bool hasMq2, hasMq7;  int mq2, mq7;                 // millivolts at the module output
  bool hasAir;      float t, rh, hi, wbgt;
  bool hasPm;       int pm25, pm10;
  bool hasWater;    float cm;
  bool sos, fall;
  bool hasExits;    bool lockA, lockB, lockR;
  bool localAlarm;  Hazard hz;
};
struct OutBuf {
  char* p;
  size_t cap;
  size_t len;
};

// hardware-side helper types (declared here so the Arduino-generated prototypes can see them)
struct Baseline {
  uint32_t n;
  float mean, m2;
};
struct MqChan {
  float ema;
  bool started, ready;
  float idx;
  Baseline base;
};
struct ThermalSnap {
  bool valid;
  uint32_t seq, ms;
  bool hot;
  float tmax, tmean, hx, hy;
  int16_t t10[TH_N];
};
struct Latch {
  uint8_t level;
  uint32_t holdUntil;
};
struct Sustain {
  uint32_t since;
};

static const char* const HAZ_NAME[HAZ_COUNT] = { "none", "fire", "gas", "flood", "dust", "heat", "sos" };

static bool fin(float x) { return x == x && x < 3.0e38f && x > -3.0e38f; }

// Natural wet-bulb from air temperature (C) and relative humidity (%): Stull (2011),
// J. Appl. Meteor. Climatol. 50:2267-2269. Valid roughly -20..50 C and 5..99 %RH.
static float stullWetBulbC(float t, float rh) {
  if (rh < 5.0f) rh = 5.0f;
  if (rh > 99.0f) rh = 99.0f;
  return t * atanf(0.151977f * sqrtf(rh + 8.313659f)) + atanf(t + rh) - atanf(rh - 1.676331f)
       + 0.00391838f * powf(rh, 1.5f) * atanf(0.023101f * rh) - 4.686035f;
}
// WBGT ESTIMATE (not a measurement): indoor / no-sun OSHA form 0.7*Tnwb + 0.3*Tg with Tg = T + offset.
static float wbgtEstimateC(float t, float rh, float globeOffsetC) {
  return 0.7f * stullWetBulbC(t, rh) + 0.3f * (t + globeOffsetC);
}
// NWS heat index (Rothfusz regression with the NWS low/high humidity adjustments), result in C.
static float heatIndexC(float tc, float rh) {
  float T = tc * 9.0f / 5.0f + 32.0f;
  float hi = 0.5f * (T + 61.0f + ((T - 68.0f) * 1.2f) + (rh * 0.094f));
  if ((hi + T) / 2.0f >= 80.0f) {
    hi = -42.379f + 2.04901523f * T + 10.14333127f * rh - 0.22475541f * T * rh
       - 0.00683783f * T * T - 0.05481717f * rh * rh + 0.00122874f * T * T * rh
       + 0.00085282f * T * rh * rh - 0.00000199f * T * T * rh * rh;
    if (rh < 13.0f && T >= 80.0f && T <= 112.0f) hi -= ((13.0f - rh) / 4.0f) * sqrtf((17.0f - fabsf(T - 95.0f)) / 17.0f);
    else if (rh > 85.0f && T >= 80.0f && T <= 87.0f) hi += ((rh - 85.0f) / 10.0f) * ((87.0f - T) / 5.0f);
  }
  return (hi - 32.0f) * 5.0f / 9.0f;
}

static bool gridSane(const float* g) {
  for (int i = 0; i < TH_N; i++) if (!fin(g[i]) || g[i] < -60.0f || g[i] > 400.0f) return false;
  return true;
}

// Hot-spot test on one 32x24 image. Same rule as js/detect.js hotspotTest():
//   background = the coolest 80 % of the pixels; mean and mean-absolute-deviation of those;
//   contextual threshold = mean + max(3*max(MAD, 0.25), 6 C);   absolute: >= 57 C.
//   hot = (hottest pixel >= 57 C) AND (hottest pixel > contextual threshold).
// `scratch` is a TH_N float buffer (it is sorted in place).
static Hotspot hotspotTest(const float* g, float* scratch) {
  Hotspot h;
  double sumAll = 0.0;
  float tmax = -1.0e9f;
  int ix = 0;
  for (int i = 0; i < TH_N; i++) {
    float v = g[i];
    scratch[i] = v;
    sumAll += v;
    if (v > tmax) { tmax = v; ix = i; }
  }
  std::sort(scratch, scratch + TH_N);
  int nb = (int)(TH_N * 0.8f);
  if (nb < 4) nb = 4;
  double sum = 0.0;
  for (int i = 0; i < nb; i++) sum += scratch[i];
  float mean = (float)(sum / nb);
  double dev = 0.0;
  for (int i = 0; i < nb; i++) dev += fabsf(scratch[i] - mean);
  float mad = (float)(dev / nb);
  float k = HOT_CTX_K * (mad > 0.25f ? mad : 0.25f);
  float ctxThr = mean + (k > HOT_CTX_RISE_C ? k : HOT_CTX_RISE_C);
  h.tmax = tmax;
  h.tmean = (float)(sumAll / TH_N);
  h.bgMean = mean;
  h.bgMad = mad;
  h.ctxThr = ctxThr;
  h.absOk = tmax >= HOT_ABS_C;
  h.ctxOk = tmax > ctxThr;
  h.hot = h.absOk && h.ctxOk;
  h.idx = ix;
  h.x = (float)(ix % TH_W) / (float)(TH_W - 1);
  h.y = (float)(ix / TH_W) / (float)(TH_H - 1);
  return h;
}

// Fall logic, called ~50-100 times a second with the resultant acceleration in g (1.0 = at rest).
// impact -> stillness (15 s) -> check-in (30 s, the person presses the button = "I am OK") -> SOS.
static void fallStep(FallState& f, float g, uint32_t now, bool okPress) {
  if (f.phase == FALL_IDLE) {
    if (g >= FALL_IMPACT_G) { f.phase = FALL_IMPACT; f.t0 = now; }
  } else if (f.phase == FALL_IMPACT) {
    uint32_t dt = now - f.t0;
    if (dt > FALL_SETTLE_MS && fabsf(g - 1.0f) > FALL_MOVE_G) f.phase = FALL_IDLE;   // moving again
    else if (dt >= FALL_STILL_MS) { f.phase = FALL_CHECK; f.t0 = now; }
  } else {
    if (okPress) { f.phase = FALL_IDLE; f.sos = false; }
    else if (now - f.t0 >= FALL_CHECK_MS) f.sos = true;                              // no answer
  }
}

// --- tiny JSON helpers (no library): enough to read the flat "signs" command ---
static const char* findKey(const char* s, const char* key) {
  char pat[24];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char* p = strstr(s, pat);
  if (!p) return NULL;
  p += strlen(pat);
  while (*p == ' ') p++;
  if (*p != ':') return NULL;
  p++;
  while (*p == ' ') p++;
  return p;
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
// Browser -> board:  {"v":1,"type":"signs","A":"go|stop|off","B":..,"R":..,"siren":"off|on","ring":"green|amber|red|off","hazard":"fire|gas|flood|dust|heat|sos|none"}
static bool parseSigns(const char* line, SignsCmd* c) {
  long v = 0;
  char type[12], val[12];
  if (!jsonInt(line, "v", &v) || v != 1) return false;
  if (!jsonStr(line, "type", type, sizeof(type)) || strcmp(type, "signs") != 0) return false;
  c->s[0] = c->s[1] = c->s[2] = SG_OFF;
  c->siren = false;
  c->ring = RC_OFF;
  c->hz = HAZ_NONE;
  const char* keys[3] = { "A", "B", "R" };
  for (int i = 0; i < 3; i++) {
    if (jsonStr(line, keys[i], val, sizeof(val))) {
      if (strcmp(val, "go") == 0) c->s[i] = SG_GO;
      else if (strcmp(val, "stop") == 0) c->s[i] = SG_STOP;
    }
  }
  if (jsonStr(line, "siren", val, sizeof(val))) c->siren = strcmp(val, "on") == 0;
  if (jsonStr(line, "ring", val, sizeof(val))) {
    if (strcmp(val, "green") == 0) c->ring = RC_GREEN;
    else if (strcmp(val, "amber") == 0) c->ring = RC_AMBER;
    else if (strcmp(val, "red") == 0) c->ring = RC_RED;
  }
  if (jsonStr(line, "hazard", val, sizeof(val))) {
    for (int i = 0; i < HAZ_COUNT; i++) if (strcmp(val, HAZ_NAME[i]) == 0) c->hz = (Hazard)i;
  }
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
static size_t formatFrame(char* out, size_t cap, const FrameData& d) {
  OutBuf o = { out, cap, 0 };
  oapp(&o, "{\"v\":1,\"type\":\"frame\",\"ms\":%lu", (unsigned long)d.ms);
  if (d.hasThermal)
    oapp(&o, ",\"thermal\":{\"tmax\":%.1f,\"tmean\":%.1f,\"hot\":{\"x\":%.2f,\"y\":%.2f,\"t\":%.1f}}", d.tmax, d.tmean, d.hx, d.hy, d.tmax);
  if (d.hasMq2 || d.hasMq7) {
    oapp(&o, ",\"gas\":{");
    if (d.hasMq2) oapp(&o, "\"mq2\":%d", d.mq2);
    if (d.hasMq7) oapp(&o, "%s\"mq7\":%d", d.hasMq2 ? "," : "", d.mq7);
    oapp(&o, "}");
  }
  if (d.hasAir) oapp(&o, ",\"air\":{\"t\":%.1f,\"rh\":%.0f,\"hi\":%.1f,\"wbgt\":%.1f}", d.t, d.rh, d.hi, d.wbgt);
  if (d.hasPm) oapp(&o, ",\"pm\":{\"pm25\":%d,\"pm10\":%d}", d.pm25, d.pm10);
  if (d.hasWater) oapp(&o, ",\"water\":{\"cm\":%.1f}", d.cm);
  oapp(&o, ",\"sos\":%s,\"fall\":%s", d.sos ? "true" : "false", d.fall ? "true" : "false");
  if (d.hasExits)
    oapp(&o, ",\"exits\":{\"A\":\"%s\",\"B\":\"%s\",\"R\":\"%s\"}", d.lockA ? "locked" : "open", d.lockB ? "locked" : "open", d.lockR ? "locked" : "open");
  oapp(&o, ",\"local\":{\"alarm\":%s,\"hazard\":\"%s\"}}\n", d.localAlarm ? "true" : "false", HAZ_NAME[d.hz]);
  return o.len;
}
// Thermal image: 32x24 row-major, degrees C x 10 as integers.
static size_t formatGrid(char* out, size_t cap, const int16_t* t10) {
  OutBuf o = { out, cap, 0 };
  oapp(&o, "{\"v\":1,\"type\":\"grid\",\"w\":%d,\"h\":%d,\"t10\":[", TH_W, TH_H);
  for (int i = 0; i < TH_N; i++) oapp(&o, "%s%d", i ? "," : "", (int)t10[i]);
  oapp(&o, "]}\n");
  return o.len;
}
// ------------------------------- END MANARA-PURE -----------------------------------------

// ------------------------------- hardware side (needs an ESP32) --------------------------
static ThermalSnap thShared, thLocal, thWork;
static portMUX_TYPE thMux = portMUX_INITIALIZER_UNLOCKED;
static volatile float airT = NAN, airRH = NAN;
static volatile uint32_t airMs = 0;
static volatile uint32_t thBad = 0;
static uint32_t thSeqCounter = 0;
static float thFrame[TH_N], thScratch[TH_N];
static bool mlxOk = false, shtOk = false, mpuOk = false;

static char frameBuf[760];
static char gridBuf[4200];
static uint32_t nextSample = 0, nextGrid = 0, nextOut = 0, nextHead = 0, nextNote = 0;
static uint32_t lastGridSeq = 0, droppedLines = 0;

static MqChan mq2c, mq7c;
static float mq2mv = NAN, mq7mv = NAN;
static float waterCm = NAN, distHist[5];
static uint8_t distN = 0;
static bool floatClosed = false;
static float pm25 = NAN, pm10ema = NAN;
static uint32_t pmsMs = 0;
static bool exitLocked[3] = { false, false, false };
static bool sosLatched = false, sosDown = false, sosWasLatched = false;
static uint32_t sosDownAt = 0;
static FallState fall = { FALL_IDLE, 0, false };
static bool okEvent = false;

static Latch latches[HAZ_COUNT];
static Sustain susHot, susSmoke, susGas, susHeat;
static uint32_t trendUntil = 0;
static float gasHist[3] = { 0, 0, 0 };
static uint32_t nextGasHist = 0;
static float tmaxHist[48];
static uint32_t tmaxHistMs[48];
static uint8_t tmaxHistN = 0, tmaxHistPos = 0;
static uint32_t lastThSeq = 0;
static bool riseKey = false;

static uint8_t gLevel = 0;
static Hazard gHaz = HAZ_NONE;
static uint32_t alarmSince = 0;
static uint32_t cmdAt = 0;
static SignsCmd cmd = { { SG_OFF, SG_OFF, SG_OFF }, false, RC_OFF, HAZ_NONE };
static char lineBuf[200];
static uint8_t lineLen = 0;
static uint32_t lastOutMs = 0;

#if HAS_MLX90640
static Adafruit_MLX90640 mlx;
#endif
#if HAS_SHT31
static Adafruit_SHT31 sht31 = Adafruit_SHT31();
#endif
#if HAS_MPU6050
static Adafruit_MPU6050 mpu;
#endif
#if HAS_STRIP
static Adafruit_NeoPixel strip(3 * SIGN_PX + RING_PX, PIN_STRIP, NEO_GRB + NEO_KHZ800);
#endif
#if HAS_HEAD
static Servo panServo, tiltServo;
enum HeadMode { H_PATROL = 0, H_TRACK, H_HOLD };
static HeadMode headMode = H_PATROL;
static float panDeg = HEAD_PAN_CENTER, tiltDeg = HEAD_TILT_CENTER;
static int patrolDir = 1;
static uint32_t headLastSeq = 0, headSeenAt = 0, headCentredAt = 0, headLastMove = 0;
static float headOffX = 0.0f, headOffY = 0.0f;   // board-plane offset of the hot-spot, degrees
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

static void baseAdd(Baseline* b, float x) {
  b->n++;
  float d = x - b->mean;
  b->mean += d / (float)b->n;
  b->m2 += d * (x - b->mean);
}
static float baseSigma(const Baseline* b) {
  float s = b->n > 1 ? sqrtf(b->m2 / (float)(b->n - 1)) : 0.0f;
  return s < MQ_SIGMA_FLOOR_MV ? MQ_SIGMA_FLOOR_MV : s;
}
static bool sustained(Sustain* s, bool cond, uint32_t now, uint32_t needMs) {
  if (!cond) { s->since = 0; return false; }
  if (s->since == 0) s->since = now ? now : 1;
  return (now - s->since) >= needMs;
}
static uint8_t holdLevel(Latch* l, uint8_t raw, uint32_t now) {
  if (raw >= l->level) {
    l->level = raw;
    l->holdUntil = now + (raw ? HOLD_MS : 0);
  } else if ((int32_t)(now - l->holdUntil) > 0) {
    l->level = raw;
  }
  return l->level;
}

// ---------------------------------- sensors ----------------------------------------------
static float readMv(uint8_t pin) {
  uint32_t s = 0;
  for (int i = 0; i < 16; i++) s += analogReadMilliVolts(pin);
  return ((float)s / 16.0f) * MQ_DIVIDER_RATIO;      // millivolts at the module's AO pin
}
static void mqUpdate(MqChan* c, float mv, uint32_t now) {
  if (!c->started) { c->ema = mv; c->started = true; }
  c->ema += 0.3f * (mv - c->ema);
  uint32_t warm = (uint32_t)MQ_WARMUP_S * 1000UL;
  uint32_t baseEnd = warm + (uint32_t)MQ_BASELINE_S * 1000UL;
  if (now >= warm && now < baseEnd) baseAdd(&c->base, c->ema);
  if (now >= baseEnd && c->base.n > 8) {
    c->ready = true;
    c->idx = (c->ema - c->base.mean) / baseSigma(&c->base);
  }
}

#if HAS_WATER_ULTRASONIC
static float readDistanceCm(float tempC) {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(3);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  if (us == 0) return NAN;
  float c = 331.3f + 0.606f * tempC;                // speed of sound, m/s (compensates for heat)
  return ((float)us * 0.5f) * c / 10000.0f;         // cm
}
static float median5(const float* a, uint8_t n) {
  float t[5];
  for (uint8_t i = 0; i < n; i++) t[i] = a[i];
  std::sort(t, t + n);
  return t[n / 2];
}
#endif

#if HAS_PMS5003
static uint8_t pmsBuf[32];
static uint8_t pmsPos = 0;
static void pollPms() {
  while (Serial2.available()) {
    uint8_t c = (uint8_t)Serial2.read();
    if (pmsPos == 0 && c != 0x42) continue;
    if (pmsPos == 1 && c != 0x4D) { pmsPos = 0; continue; }
    pmsBuf[pmsPos++] = c;
    if (pmsPos == 32) {
      pmsPos = 0;
      uint16_t sum = 0;
      for (int i = 0; i < 30; i++) sum += pmsBuf[i];
      uint16_t chk = (uint16_t)((pmsBuf[30] << 8) | pmsBuf[31]);
      if (sum == chk) {                              // atmospheric-environment values
        pm25 = (float)((pmsBuf[12] << 8) | pmsBuf[13]);
        float p10 = (float)((pmsBuf[14] << 8) | pmsBuf[15]);
        pm10ema = fin(pm10ema) ? pm10ema + (p10 - pm10ema) * ((float)SAMPLE_MS / 600000.0f) : p10;   // ~10 min average
        pmsMs = millis();
      }
    }
  }
}
#endif

#if HAS_MLX90640 || HAS_SHT31
// Runs on core 0 so the slow thermal read (~0.5 s per image) never stalls the alarm loop.
// It is the ONLY user of I2C bus 0.
static void thermalTask(void* arg) {
  (void)arg;
  uint32_t nextAir = 0;
  for (;;) {
#if HAS_MLX90640
    if (mlxOk) {
      if (mlx.getFrame(thFrame) == 0 && gridSane(thFrame)) {
        Hotspot hs = hotspotTest(thFrame, thScratch);
        thWork.valid = true;
        thWork.ms = millis();
        thWork.seq = ++thSeqCounter;
        thWork.hot = hs.hot;
        thWork.tmax = hs.tmax;
        thWork.tmean = hs.tmean;
        thWork.hx = hs.x;
        thWork.hy = hs.y;
        for (int i = 0; i < TH_N; i++) thWork.t10[i] = (int16_t)lroundf(thFrame[i] * 10.0f);
        portENTER_CRITICAL(&thMux);
        memcpy(&thShared, &thWork, sizeof(ThermalSnap));
        portEXIT_CRITICAL(&thMux);
      } else {
        thBad = thBad + 1;
        vTaskDelay(pdMS_TO_TICKS(40));
      }
    } else {
      vTaskDelay(pdMS_TO_TICKS(100));
    }
#else
    vTaskDelay(pdMS_TO_TICKS(100));
#endif
#if HAS_SHT31
    if (shtOk && millis() >= nextAir) {
      nextAir = millis() + 1000;
      float t = NAN, h = NAN;
      if (sht31.readBoth(&t, &h) && fin(t) && fin(h)) { airT = t; airRH = h; airMs = millis(); }
    }
#endif
    vTaskDelay(1);
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
  note("I2C bus 0 devices: %s(expect 0x33 MLX90640, 0x44 SHT31)", n ? list : "none ");
}

// ---------------------------------- inputs -----------------------------------------------
static void pollInputs(uint32_t now) {
  (void)now;                                           // only used when the SOS button is fitted
#if HAS_SOS
  bool down = digitalRead(PIN_SOS) == LOW;
  if (down && !sosDown) {                              // press
    sosDown = true;
    sosDownAt = now;
    sosWasLatched = sosLatched || fall.sos;
    if (fall.phase == FALL_CHECK && !fall.sos) okEvent = true;     // "I am OK"
    else if (!sosLatched) sosLatched = true;                       // SOS: the human key
  } else if (!down && sosDown) {
    sosDown = false;
  }
  if (sosDown && sosWasLatched && (now - sosDownAt) >= SOS_CLEAR_HOLD_MS) {   // long press clears
    sosLatched = false;
    fall.sos = false;
    fall.phase = FALL_IDLE;
    sosWasLatched = false;
    note("SOS cleared by long press");
  }
#endif
#if HAS_EXITS
  static const uint8_t pins[3] = { PIN_EXIT_A, PIN_EXIT_B, PIN_EXIT_R };
  for (int i = 0; i < 3; i++) exitLocked[i] = digitalRead(pins[i]) == EXIT_LOCKED_LEVEL;
#endif
#if HAS_WATER_FLOAT
  floatClosed = digitalRead(PIN_FLOAT) == LOW;
#endif
}

static void applyLine(const char* line) {
  SignsCmd c;
  if (parseSigns(line, &c)) {
    cmd = c;
    cmdAt = millis() ? millis() : 1;
  }
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

// ---------------------------------- decision ---------------------------------------------
static void tmaxHistPush(uint32_t now, float tmax) {
  tmaxHist[tmaxHistPos] = tmax;
  tmaxHistMs[tmaxHistPos] = now;
  tmaxHistPos = (uint8_t)((tmaxHistPos + 1) % 48);
  if (tmaxHistN < 48) tmaxHistN++;
}
static bool riseTest(uint32_t now, float tmaxNow) {
  // compare with the oldest sample that is 10..25 s old
  for (uint8_t k = 0; k < tmaxHistN; k++) {
    uint8_t i = (uint8_t)((tmaxHistPos + 48 - tmaxHistN + k) % 48);
    uint32_t age = now - tmaxHistMs[i];
    if (age >= 10000 && age <= 25000) {
      float perMin = (tmaxNow - tmaxHist[i]) * 60000.0f / (float)age;
      return perMin >= RISE_RATE_C_PER_MIN && tmaxNow >= RISE_MIN_TMAX_C;
    }
  }
  return false;
}

static void evaluate(uint32_t now) {
  uint8_t raw[HAZ_COUNT];
  memset(raw, 0, sizeof(raw));

  // ---- FIRE: thermal hot-spot + smoke index ----
  bool thermalWarm = now >= (uint32_t)THERMAL_WARMUP_S * 1000UL;
  bool hotKey = false;
  if (thermalWarm && thLocal.valid && (now - thLocal.ms) < 3000) {
    hotKey = sustained(&susHot, thLocal.hot, now, THERMAL_SUSTAIN_MS) || riseKey;
  } else {
    sustained(&susHot, false, now, 0);
  }
  bool smokeKey = sustained(&susSmoke, mq2c.ready && mq2c.idx >= MQ_WARN_SIGMA, now, MQ_SUSTAIN_MS);
  raw[HAZ_FIRE] = (uint8_t)(hotKey + smokeKey);

  // ---- GAS: one sensor above warn, the other one too, and a rising trend ----
  if (now >= nextGasHist) {
    nextGasHist = now + 1000;
    float a = mq7c.ready ? mq7c.idx : -99.0f;
    float b = mq2c.ready ? mq2c.idx : -99.0f;
    float top = a > b ? a : b;
    gasHist[0] = gasHist[1];
    gasHist[1] = gasHist[2];
    gasHist[2] = top;
    if (gasHist[2] > gasHist[1] + 0.2f && gasHist[1] > gasHist[0] + 0.2f) trendUntil = now + 30000;
  }
  float iA = mq7c.ready ? mq7c.idx : -99.0f;
  float iB = mq2c.ready ? mq2c.idx : -99.0f;
  float hi = iA > iB ? iA : iB, lo = iA > iB ? iB : iA;
  bool gasKey1 = sustained(&susGas, hi >= MQ_WARN_SIGMA, now, MQ_SUSTAIN_MS);
  bool gasKey2 = gasKey1 && lo >= MQ_WARN_SIGMA && (int32_t)(trendUntil - now) > 0;
  raw[HAZ_GAS] = (uint8_t)(gasKey1 + gasKey2);

  // ---- FLOOD ----
  bool wetWarn = fin(waterCm) && waterCm >= WATER_WARN_CM;
  bool wetDanger = (fin(waterCm) && waterCm >= WATER_DANGER_CM) || floatClosed;
  raw[HAZ_FLOOD] = wetDanger ? 2 : (wetWarn ? 1 : 0);

  // ---- DUST (never a local alarm: it needs a second key from the browser) ----
  if (fin(pm10ema) && pm10ema >= PM10_WARN_UGM3) raw[HAZ_DUST] = 1;

  // ---- HEAT (ring only) ----
  float tNow = airT, rhNow = airRH;
  if (fin(tNow) && fin(rhNow) && (now - airMs) < 5000) {
    float w = wbgtEstimateC(tNow, rhNow, GLOBE_OFFSET_C);
    bool warn = w >= HEAT_WARN_WBGT_C;
    bool danger = sustained(&susHeat, w >= HEAT_DANGER_WBGT_C, now, HEAT_SUSTAIN_MS);
    raw[HAZ_HEAT] = danger ? 2 : (warn ? 1 : 0);
  }

  // ---- SOS ----
  if (sosLatched || fall.sos) raw[HAZ_SOS] = 2;
  else if (fall.phase == FALL_CHECK) raw[HAZ_SOS] = 1;

  // hold alarms for HOLD_MS so they do not flap, then pick the winner (priority below)
  static const Hazard order[6] = { HAZ_SOS, HAZ_FIRE, HAZ_GAS, HAZ_FLOOD, HAZ_HEAT, HAZ_DUST };
  uint8_t best = 0;
  Hazard bestHz = HAZ_NONE;
  for (int i = 0; i < 6; i++) {
    Hazard h = order[i];
    uint8_t lv = holdLevel(&latches[h], raw[h], now);
    if (lv > best) { best = lv; bestHz = h; }
  }
  if (best == 2 && gLevel != 2) alarmSince = now;
  gLevel = best;
  gHaz = bestHz;
}

// ---------------------------------- outputs ----------------------------------------------
#if HAS_STRIP
static uint32_t ringColour(RingCol c, uint32_t now) {
  switch (c) {
    case RC_GREEN: {
      uint32_t ph = now % 2000;                          // friendly lighthouse beat: two short white flashes every 2 s
      if (ph < 70 || (ph >= 180 && ph < 250)) return strip.Color(160, 160, 160);
      return strip.Color(0, 90, 20);
    }
    case RC_AMBER: return strip.Color(190, 100, 0);
    case RC_RED:   return ((now / 500) % 2 == 0) ? strip.Color(200, 0, 0) : strip.Color(40, 0, 0);   // 1 Hz, slow
    case RC_BLUE:  return strip.Color(0, 30, 70);
    default:       return strip.Color(0, 0, 0);
  }
}
static void drawSign(uint8_t first, SignState st, uint32_t now) {
  for (uint8_t i = 0; i < SIGN_PX; i++) {
    uint32_t col = strip.Color(0, 0, 0);
    if (st == SG_GO) col = (i == (now / 160) % SIGN_PX) ? strip.Color(0, 200, 40) : strip.Color(0, 28, 6);
    else if (st == SG_STOP) col = strip.Color(190, 0, 0);
    strip.setPixelColor(first + i, col);
  }
}
#endif

static bool cmdFresh(uint32_t now) { return cmdAt != 0 && (now - cmdAt) < CMD_TTL_MS; }

static void updateOutputs(uint32_t now) {
  bool fresh = cmdFresh(now);
  bool warm = now < (uint32_t)THERMAL_WARMUP_S * 1000UL;

  // ring: the local state, escalated (never silenced) by the browser
  RingCol local = warm ? RC_BLUE : (gLevel == 2 ? RC_RED : (gLevel == 1 ? RC_AMBER : RC_GREEN));
  if (fall.phase == FALL_CHECK && gLevel < 2) local = RC_AMBER;
  RingCol ring = local;
  if (fresh) {
    if (cmd.ring == RC_OFF) { if (gLevel == 0 && !warm) ring = RC_OFF; }
    else if (cmd.ring > ring && ring != RC_BLUE) ring = cmd.ring;
    else if (cmd.ring > RC_GREEN && ring == RC_BLUE) ring = cmd.ring;
  }

  // exit signs: local default for fire and gas alarms; a fresh browser command wins, with the safety override
  SignState sg[3] = { SG_OFF, SG_OFF, SG_OFF };
  if (gLevel == 2 && (gHaz == HAZ_FIRE || gHaz == HAZ_GAS)) {
    for (int i = 0; i < 3; i++) sg[i] = exitLocked[i] ? SG_STOP : SG_GO;
  }
  if (fresh) for (int i = 0; i < 3; i++) sg[i] = cmd.s[i];
  for (int i = 0; i < 3; i++) if (exitLocked[i] && sg[i] == SG_GO) sg[i] = SG_STOP;   // exit truth

  // siren: local alarms (not heat/dust) for SIREN_MAX_MS, or the browser asks for it
  bool localSiren = gLevel == 2 && gHaz != HAZ_HEAT && gHaz != HAZ_DUST && (now - alarmSince) < SIREN_MAX_MS;
  bool siren = localSiren || (fresh && cmd.siren);
  bool beep = false;
  if (siren) {
    uint32_t t = (now - (localSiren ? alarmSince : cmdAt)) % 4500;     // three pulses, then a pause
    beep = t < 500 || (t >= 1000 && t < 1500) || (t >= 2000 && t < 2500);
  } else if (fall.phase == FALL_CHECK && !fall.sos) {
    beep = ((now - fall.t0) % 3000) < 120;                              // gentle "are you OK?" tick
  }
#if HAS_BUZZER
  digitalWrite(PIN_BUZZER, beep ? BUZZER_ON_LEVEL : !BUZZER_ON_LEVEL);
#endif
  (void)beep;                                          // silences the warning when no buzzer is fitted
#if HAS_STRIP
  drawSign(0, sg[0], now);
  drawSign(SIGN_PX, sg[1], now);
  drawSign(2 * SIGN_PX, sg[2], now);
  uint32_t rc = ringColour(ring, now);
  for (uint8_t i = 0; i < RING_PX; i++) strip.setPixelColor(3 * SIGN_PX + i, rc);
  strip.show();
#endif
}

// ---------------------------------- the head (optional) ----------------------------------
#if HAS_HEAD
static float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }
static void headUpdate(uint32_t now) {
  static uint32_t lastMs = 0;
  float dt = lastMs ? (float)(now - lastMs) / 1000.0f : 0.04f;
  lastMs = now;
  bool newFrame = thLocal.valid && thLocal.seq != headLastSeq;
  bool hot = thLocal.valid && thLocal.hot && (now - thLocal.ms) < 2000;
  if (hot) headSeenAt = now;

  if (headMode == H_PATROL) {
    panDeg += patrolDir * HEAD_PATROL_DEG_S * dt;
    if (panDeg >= HEAD_PAN_MAX) { panDeg = HEAD_PAN_MAX; patrolDir = -1; }
    if (panDeg <= HEAD_PAN_MIN) { panDeg = HEAD_PAN_MIN; patrolDir = 1; }
    tiltDeg = HEAD_TILT_CENTER;
    if (hot && newFrame) { headMode = H_TRACK; note("head TRACK"); }
  } else {
    if (newFrame && hot) {
      float dx = (thLocal.hx - 0.5f) * HEAD_FOV_H_DEG;       // degrees the hot-spot is off-centre in the image
      float dy = (thLocal.hy - 0.5f) * HEAD_FOV_V_DEG;
      if (headMode == H_TRACK || fabsf(dx) > 2.0f * HEAD_HOLD_TOL_DEG || fabsf(dy) > 2.0f * HEAD_HOLD_TOL_DEG) {
        panDeg = clampf(panDeg + HEAD_PAN_SIGN * HEAD_KP * dx, HEAD_PAN_MIN, HEAD_PAN_MAX);
        tiltDeg = clampf(tiltDeg + HEAD_TILT_SIGN * HEAD_KP * dy, HEAD_TILT_MIN, HEAD_TILT_MAX);
        if (headMode == H_HOLD) { headMode = H_TRACK; note("head TRACK"); }
      }
      bool centred = fabsf(dx) < HEAD_HOLD_TOL_DEG && fabsf(dy) < HEAD_HOLD_TOL_DEG;
      if (centred) {
        if (headCentredAt == 0) headCentredAt = now;
        if (headMode == H_TRACK && (now - headCentredAt) >= HEAD_HOLD_AFTER_MS) { headMode = H_HOLD; note("head HOLD pan=%d tilt=%d", (int)panDeg, (int)tiltDeg); }
      } else {
        headCentredAt = 0;
      }
      // small-angle estimate of where the hot-spot is on the twin board (calibrate BOARD_SPAN_*)
      headOffX = (panDeg - HEAD_PAN_CENTER) * HEAD_PAN_SIGN + dx;
      headOffY = (tiltDeg - HEAD_TILT_CENTER) * HEAD_TILT_SIGN + dy;
    }
    uint32_t lostFor = now - headSeenAt;
    if (lostFor > (headMode == H_HOLD ? 5000UL : (uint32_t)HEAD_LOST_MS)) {
      headMode = H_PATROL;
      headCentredAt = 0;
      note("head PATROL");
    }
  }
  if (newFrame) headLastSeq = thLocal.seq;
  panServo.write((int)panDeg);
  tiltServo.write((int)tiltDeg);
}
#endif

// ---------------------------------- output of protocol lines -----------------------------
static void writeLine(const char* buf, size_t len) {
  if ((size_t)Serial.availableForWrite() < len) { droppedLines++; return; }   // never block the alarm loop
  Serial.write((const uint8_t*)buf, len);
}

static void sendFrame(uint32_t now) {
  FrameData d;
  memset(&d, 0, sizeof(d));
  d.ms = now;
  if (thLocal.valid && (now - thLocal.ms) < 3000) {
    d.hasThermal = true;
    d.tmax = thLocal.tmax;
    d.tmean = thLocal.tmean;
    d.hx = thLocal.hx;
    d.hy = thLocal.hy;
#if HAS_HEAD
    d.hx = clampf(0.5f + headOffX / BOARD_SPAN_H_DEG, 0.0f, 1.0f);
    d.hy = clampf(0.5f + headOffY / BOARD_SPAN_V_DEG, 0.0f, 1.0f);
#endif
  }
#if HAS_MQ2
  if (fin(mq2mv)) { d.hasMq2 = true; d.mq2 = (int)(mq2c.ema + 0.5f); }
#endif
#if HAS_MQ7
  if (fin(mq7mv)) { d.hasMq7 = true; d.mq7 = (int)(mq7c.ema + 0.5f); }
#endif
  float t = airT, rh = airRH;
  if (fin(t) && fin(rh) && (now - airMs) < 5000) {
    d.hasAir = true;
    d.t = t;
    d.rh = rh;
    d.hi = heatIndexC(t, rh);
    d.wbgt = wbgtEstimateC(t, rh, GLOBE_OFFSET_C);
  }
#if HAS_PMS5003
  if (fin(pm10ema) && (now - pmsMs) < 5000) { d.hasPm = true; d.pm25 = (int)(pm25 + 0.5f); d.pm10 = (int)(pm10ema + 0.5f); }
#endif
#if HAS_WATER_ULTRASONIC
  if (fin(waterCm)) { d.hasWater = true; d.cm = waterCm; }
#elif HAS_WATER_FLOAT
  d.hasWater = true;
  d.cm = floatClosed ? WATER_FLOAT_LEVEL_CM : 0.0f;
#endif
  d.sos = sosLatched || fall.sos;
  d.fall = fall.phase == FALL_CHECK;
#if HAS_EXITS
  d.hasExits = true;
  d.lockA = exitLocked[0];
  d.lockB = exitLocked[1];
  d.lockR = exitLocked[2];
#endif
  d.localAlarm = gLevel == 2;
  d.hz = gLevel >= 1 ? gHaz : HAZ_NONE;
  size_t n = formatFrame(frameBuf, sizeof(frameBuf), d);
  writeLine(frameBuf, n);
}

static void sampleSlow(uint32_t now) {
#if HAS_MQ2
  mq2mv = readMv(PIN_MQ2);
  mqUpdate(&mq2c, mq2mv, now);
#endif
#if HAS_MQ7
  mq7mv = readMv(PIN_MQ7);
  mqUpdate(&mq7c, mq7mv, now);
#endif
#if HAS_WATER_ULTRASONIC
  float tc = fin(airT) ? airT : 25.0f;
  float dcm = readDistanceCm(tc);
  if (fin(dcm) && dcm >= 2.0f) {
    if (distN < 5) distHist[distN++] = dcm;
    else { for (int i = 0; i < 4; i++) distHist[i] = distHist[i + 1]; distHist[4] = dcm; }
    float m = median5(distHist, distN);
    waterCm = m > WATER_MOUNT_CM ? 0.0f : WATER_MOUNT_CM - m;
  }
#endif
  // copy the newest thermal image out of the core-0 task (short critical section)
  if (thShared.seq != lastThSeq) {
    portENTER_CRITICAL(&thMux);
    memcpy(&thLocal, &thShared, sizeof(ThermalSnap));
    portEXIT_CRITICAL(&thMux);
    lastThSeq = thLocal.seq;
    if (thLocal.valid) {
      riseKey = riseTest(now, thLocal.tmax);
      tmaxHistPush(now, thLocal.tmax);
    }
  }
}

void setup() {
  Serial.setTxBufferSize(8192);                       // so a 1 Hz thermal image never blocks the loop
  Serial.begin(SERIAL_BAUD);
  delay(300);
  note("MANARA sentinel firmware v1.0 - written to documented APIs, UNTESTED on hardware until you flash it");
#if HAS_SOS
  pinMode(PIN_SOS, INPUT_PULLUP);
#endif
#if HAS_EXITS
  pinMode(PIN_EXIT_A, INPUT_PULLUP);
  pinMode(PIN_EXIT_B, INPUT_PULLUP);
  pinMode(PIN_EXIT_R, INPUT_PULLUP);
#endif
#if HAS_WATER_FLOAT
  pinMode(PIN_FLOAT, INPUT_PULLUP);
#endif
#if HAS_WATER_ULTRASONIC
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);
#endif
#if HAS_BUZZER
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, !BUZZER_ON_LEVEL);
#endif
#if HAS_MQ2 || HAS_MQ7
  analogSetAttenuation(ADC_11db);                     // 0..~3.1 V range on ADC1
#endif
#if HAS_STRIP
  strip.begin();
  strip.setBrightness(STRIP_BRIGHTNESS);
  strip.clear();
  strip.show();
#endif
#if HAS_PMS5003
  Serial2.begin(9600, SERIAL_8N1, PIN_PMS_RX, -1);
#endif
#if HAS_MLX90640 || HAS_SHT31
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  i2cScan();
#if HAS_MLX90640
  mlxOk = mlx.begin(MLX90640_I2CADDR_DEFAULT, &Wire);
  if (mlxOk) {
    mlx.setMode(MLX90640_CHESS);
    mlx.setResolution(MLX90640_ADC_18BIT);
    mlx.setRefreshRate(MLX90640_4_HZ);
    note("MLX90640 ok (about 2 images per second)");
  } else {
    note("MLX90640 NOT found - thermal key disabled");
  }
#endif
#if HAS_SHT31
  shtOk = sht31.begin(0x44);
  note(shtOk ? "SHT31 ok" : "SHT31 NOT found - air / heat disabled");
#endif
  Wire.setClock(400000);                              // after every begin(): the libraries may reset the clock
  xTaskCreatePinnedToCore(thermalTask, "thermal", 12288, NULL, 1, NULL, 0);
#endif
#if HAS_MPU6050
  Wire1.begin(PIN_I2C2_SDA, PIN_I2C2_SCL);
  mpuOk = mpu.begin(0x68, &Wire1);
  if (mpuOk) {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_44_HZ);
  }
  note(mpuOk ? "MPU6050 ok" : "MPU6050 NOT found - fall sensor disabled");
#endif
#if HAS_HEAD
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  panServo.setPeriodHertz(50);
  tiltServo.setPeriodHertz(50);
  panServo.attach(PIN_SERVO_PAN, 500, 2400);
  tiltServo.attach(PIN_SERVO_TILT, 500, 2400);
  panServo.write((int)panDeg);
  tiltServo.write((int)tiltDeg);
  note("head ready: PATROL");
#endif
  uint32_t t = millis();
  nextSample = t + 500;
  nextGrid = t + 2000;
  nextNote = t + 30000;
  note("warm-up: thermal %d s, gas %d s + %d s baseline. SOS, water and exits work immediately.", THERMAL_WARMUP_S, MQ_WARMUP_S, MQ_BASELINE_S);
}

void loop() {
  uint32_t now = millis();
  pollInputs(now);
  pollSerial();
#if HAS_PMS5003
  pollPms();
#endif
#if HAS_MPU6050
  static uint32_t nextMpu = 0;
  if (mpuOk && now >= nextMpu) {
    nextMpu = now + 10;                                // 100 Hz
    sensors_event_t a, g, tp;
    if (mpu.getEvent(&a, &g, &tp)) {
      float gr = sqrtf(a.acceleration.x * a.acceleration.x + a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z) / 9.80665f;
      fallStep(fall, gr, now, okEvent);
      okEvent = false;
    }
  }
#else
  if (okEvent) { fall.phase = FALL_IDLE; okEvent = false; }
#endif
  if ((int32_t)(now - nextSample) >= 0) {
    nextSample = now + SAMPLE_MS;
    sampleSlow(now);
    evaluate(now);
    sendFrame(now);
  }
  if ((int32_t)(now - nextGrid) >= 0) {
    nextGrid = now + GRID_MS;
    if (thLocal.valid && (now - thLocal.ms) < 3000) {
      size_t n = formatGrid(gridBuf, sizeof(gridBuf), thLocal.t10);
      writeLine(gridBuf, n);
    }
  }
  if ((int32_t)(now - nextOut) >= 0) {
    nextOut = now + 40;
    updateOutputs(now);
  }
#if HAS_HEAD
  if ((int32_t)(now - nextHead) >= 0) {
    nextHead = now + 40;
    headUpdate(now);
  }
#endif
  if ((int32_t)(now - nextNote) >= 0) {
    nextNote = now + 30000;
    if (now < (uint32_t)(THERMAL_WARMUP_S > MQ_WARMUP_S + MQ_BASELINE_S ? THERMAL_WARMUP_S : MQ_WARMUP_S + MQ_BASELINE_S) * 1000UL)
      note("warming up: %lu s since boot; mq2 ready=%d mq7 ready=%d", (unsigned long)(now / 1000), (int)mq2c.ready, (int)mq7c.ready);
    if (droppedLines) note("dropped %lu protocol lines (serial buffer full)", (unsigned long)droppedLines);
    if (thBad) note("thermal read failures: %lu", (unsigned long)thBad);
  }
  delay(1);
}
