/* =====================================================================================
   MANARA («منارة») — MANARA-SAFE CHECK-IN POINT                    manara_safepoint.ino
   -------------------------------------------------------------------------------------
   An ESP32 that makes its own Wi-Fi network called "MANARA-SAFE" (no internet needed, no
   password, so anyone near the assembly point can join). A phone that joins is sent to a
   tiny page ("captive portal"): room number + language + [I'm safe] / [I need help].
   No names. No accounts. Nothing is saved to flash. Each tap becomes ONE line on USB serial:

       {"v":1,"type":"checkin","room":"203","status":"safe","lang":"ml"}

   (serial protocol v1, docs/MANARA-SPEC.md). The Build page and Mission Control read those
   lines over Web Serial, so the headcount turns green without any internet. The page on the
   phone also shows a live counter, and  http://192.168.4.1/count  is a big-screen counter for
   a teacher's tablet.

   HONEST STATUS
   * Written to the documented APIs of the Arduino-ESP32 core (WiFi, DNSServer, WebServer).
     Not compiled for or run on a real ESP32 by the author: treat as UNTESTED until you have
     flashed it and ticked the checklist in kit/README.md. A PC test checks the pure logic.
   * It does not call anyone. If a life is in danger people must call 999.
   * The network is open on purpose (a safe point must be easy to join). Anyone nearby can
     send a check-in, so use the count as a hint for staff, never as proof that a person is out.
   * Some phones hide captive-portal pages when the network has no internet. If the page does
     not pop up, open  http://192.168.4.1/  in the browser.

   BOARD: "ESP32 Dev Module" (esp32 by Espressif Systems, Arduino core 3.x), 115200 baud.
   LIBRARIES: none to install (WiFi, DNSServer, WebServer ship with the core).
   POWER: USB. For a booth, a 5 V power bank works.
   ===================================================================================== */

// ------------------------------- BEGIN CONFIG -------------------------------------------
#define AP_SSID        "MANARA-SAFE"
#define AP_CHANNEL     6
#define AP_MAX_CLIENTS 8
#define SERIAL_BAUD    115200
#define PIN_LED        2      // on-board LED: blinks on every check-in
#define PIN_RESET      0      // the BOOT button: hold 3 s to clear the counters
#define RESET_HOLD_MS  3000
#define MAX_ROOMS      160    // rooms remembered in RAM (a register of 120 residents fits)
#define MIN_GAP_MS     400    // ignore taps that arrive faster than this (double-taps)
// ------------------------------- END CONFIG ---------------------------------------------

#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <ctype.h>
#include <stdio.h>
#include <string.h>

// ------------------------------- BEGIN MANARA-PURE (compiled by the PC test) -------------
struct Room {
  char id[7];
  uint8_t st;     // 0 unknown, 1 safe, 2 help
};

static const char* const LANG_CODES[8] = { "ar", "en", "ml", "ne", "bn", "ur", "tl", "hi" };

// Keep only letters, digits and '-', at most 6 characters. Returns false if nothing is left.
static bool cleanRoom(const char* in, char* out) {
  int n = 0;
  for (int i = 0; in[i] && n < 6; i++) {
    char c = in[i];
    if (isalnum((unsigned char)c) || c == '-') out[n++] = c;
  }
  out[n] = 0;
  return n > 0;
}
static const char* cleanLang(const char* in) {
  for (int i = 0; i < 8; i++) if (strcmp(in, LANG_CODES[i]) == 0) return LANG_CODES[i];
  return "ar";
}
static int statusCode(const char* s) {
  if (strcmp(s, "safe") == 0) return 1;
  if (strcmp(s, "help") == 0) return 2;
  return 0;
}
static void recordRoom(Room* rooms, int* n, int maxN, const char* id, uint8_t st) {
  for (int i = 0; i < *n; i++) {
    if (strcmp(rooms[i].id, id) == 0) { rooms[i].st = st; return; }     // latest answer wins
  }
  if (*n < maxN) {
    strncpy(rooms[*n].id, id, 6);
    rooms[*n].id[6] = 0;
    rooms[*n].st = st;
    (*n)++;
  }
}
static void countRooms(const Room* rooms, int n, int* safe, int* help) {
  *safe = 0;
  *help = 0;
  for (int i = 0; i < n; i++) {
    if (rooms[i].st == 1) (*safe)++;
    else if (rooms[i].st == 2) (*help)++;
  }
}
// Protocol v1 check-in line, ends with '\n'. Returns the length.
static size_t formatCheckin(char* out, size_t cap, const char* room, const char* status, const char* lang) {
  int r = snprintf(out, cap, "{\"v\":1,\"type\":\"checkin\",\"room\":\"%s\",\"status\":\"%s\",\"lang\":\"%s\"}\n", room, status, lang);
  if (r < 0) return 0;
  return (size_t)r < cap ? (size_t)r : cap - 1;
}
// ------------------------------- END MANARA-PURE -----------------------------------------

// ------------------------------- the pages ----------------------------------------------
static const char PAGE_TOP[] PROGMEM = R"HTML(<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MANARA-SAFE</title>
<style>
body{font-family:system-ui,Tahoma,sans-serif;margin:0;padding:18px;background:#0e141e;color:#e7ecf4;line-height:1.7}
h1{font-size:1.5rem;margin:0 0 6px}h1 small{display:block;font-size:.95rem;color:#8ee9f2;font-weight:500}
p{margin:8px 0}.en{color:#c3cbd8;direction:ltr;text-align:left}
form{display:grid;gap:12px;margin-top:14px}
label{display:grid;gap:4px;font-weight:600}
input,select{font:inherit;padding:12px;border-radius:12px;border:1px solid #2c3a50;background:#172131;color:#e7ecf4}
button{font:inherit;font-weight:700;padding:16px;border:0;border-radius:14px;cursor:pointer}
.safe{background:#4ade80;color:#06210f}.help{background:#f87171;color:#2a0707}
.box{margin-top:16px;padding:12px 14px;border-radius:12px;background:#121925;border:1px solid #1f2a3a}
.big{font-size:3.4rem;font-weight:700;line-height:1.1}.row{display:flex;gap:14px;flex-wrap:wrap}.row>div{flex:1;min-width:140px}
.g{color:#4ade80}.r{color:#f87171}a{color:#8ee9f2}
</style></head><body>
)HTML";

static const char PAGE_FORM[] PROGMEM = R"HTML(<h1>منارة · نقطة الأمان<small>MANARA · Safe point</small></h1>
<p>اكتب رقم غرفتك، واختر لغتك، ثم اضغط زرًّا واحدًا. لا نطلب اسمك.</p>
<p class="en">Type your room number, pick your language, then tap one button. We do not ask for your name.</p>
<form action="/ci" method="get">
<label>رقم الغرفة · Room<input name="room" inputmode="text" maxlength="6" autocomplete="off" required></label>
<label>اللغة · Language<select name="lang">
<option value="ar">العربية</option><option value="en">English</option><option value="ml">മലയാളം</option>
<option value="ne">नेपाली</option><option value="bn">বাংলা</option><option value="ur">اردو</option>
<option value="tl">Tagalog</option><option value="hi">हिन्दी</option></select></label>
<button class="safe" name="status" value="safe" type="submit">أنا بأمان · I'm safe</button>
<button class="help" name="status" value="help" type="submit">أحتاج مساعدة · I need help</button>
</form>
)HTML";

static const char PAGE_NOTE[] PROGMEM = R"HTML(<div class="box"><p>هذه الصفحة لا تتصل بأحد. إذا كانت حياة أحد في خطر فاتصل بـ <b>999</b>.</p>
<p class="en">This page does not call anyone. If a life is in danger, call <b>999</b>.</p></div>
</body></html>
)HTML";

static DNSServer dnsServer;
static WebServer server(80);
static Room rooms[MAX_ROOMS];
static int nRooms = 0;
static uint32_t lastTap = 0, ledUntil = 0, resetDownAt = 0;
static uint32_t totalTaps = 0;

static String countsBox() {
  int s = 0, h = 0;
  countRooms(rooms, nRooms, &s, &h);
  String b = "<div class=\"box\"><div class=\"row\"><div><span class=\"big g\">";
  b += String(s);
  b += "</span><br>آمنون · Safe</div><div><span class=\"big r\">";
  b += String(h);
  b += "</span><br>يحتاجون مساعدة · Need help</div></div></div>";
  return b;
}

static void sendPage(const String& body) {
  String page = FPSTR(PAGE_TOP);
  page += body;
  page += FPSTR(PAGE_NOTE);
  server.send(200, "text/html; charset=utf-8", page);
}

static void handleRoot() {
  String body = FPSTR(PAGE_FORM);
  body += countsBox();
  sendPage(body);
}

static void handleCount() {
  String body = "<meta http-equiv=\"refresh\" content=\"3\"><h1>منارة · العدّاد<small>MANARA · Counter</small></h1>";
  body += countsBox();
  body += "<div class=\"box\"><p>غرف تحتاج مساعدة · Rooms needing help:</p><p class=\"big r\" style=\"font-size:1.6rem\">";
  bool any = false;
  for (int i = 0; i < nRooms; i++) {
    if (rooms[i].st == 2) { body += rooms[i].id; body += "  "; any = true; }     // room ids are already cleaned to [0-9A-Za-z-]
  }
  if (!any) body += "-";
  body += "</p></div><p><a href=\"/\">&larr; ";
  body += "نموذج التسجيل · Check-in form</a></p>";
  sendPage(body);
}

static void handleCheckin() {
  char room[7];
  uint32_t now = millis();
  if (!server.hasArg("room") || !server.hasArg("status") || !cleanRoom(server.arg("room").c_str(), room)) {
    server.sendHeader("Location", "/");
    server.send(302, "text/plain", "");
    return;
  }
  int st = statusCode(server.arg("status").c_str());
  if (st == 0) {
    server.sendHeader("Location", "/");
    server.send(302, "text/plain", "");
    return;
  }
  const char* lang = cleanLang(server.hasArg("lang") ? server.arg("lang").c_str() : "ar");
  if (now - lastTap >= MIN_GAP_MS || lastTap == 0) {
    lastTap = now;
    recordRoom(rooms, &nRooms, MAX_ROOMS, room, (uint8_t)st);
    char line[120];
    size_t n = formatCheckin(line, sizeof(line), room, st == 1 ? "safe" : "help", lang);
    Serial.write((const uint8_t*)line, n);
    totalTaps++;
    ledUntil = now + 300;
  }
  String body = "<h1>";
  body += st == 1 ? "تم تسجيلك: بأمان<small>Recorded: you are safe</small>" : "وصل طلبك: تحتاج مساعدة<small>Received: you need help</small>";
  body += "</h1><div class=\"box\"><p>الغرفة · Room: <b>";
  body += room;
  body += "</b></p>";
  if (st == 1) body += "<p>ابقَ في نقطة التجمّع واتبع تعليمات المسؤولين.</p><p class=\"en\">Stay at the assembly point and follow the staff.</p>";
  else body += "<p>ابقَ مكانك إن أمكن. تم إبلاغ المسؤولين برقم غرفتك.</p><p class=\"en\">Stay where you are if you can. Staff were told your room number.</p>";
  body += "</div>";
  body += countsBox();
  body += "<p><a href=\"/\">&larr; رجوع · Back</a></p>";
  sendPage(body);
}

static void redirectToPortal() {                       // any unknown address (phones probe many) -> our page
  String url = "http://";
  url += WiFi.softAPIP().toString();
  url += "/";
  server.sendHeader("Location", url);
  server.send(302, "text/plain", "");
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(300);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  pinMode(PIN_RESET, INPUT_PULLUP);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, NULL, AP_CHANNEL, 0, AP_MAX_CLIENTS);     // open network, no password
  delay(200);
  IPAddress ip = WiFi.softAPIP();
  dnsServer.start(53, "*", ip);                        // every name -> this board (captive portal)
  server.on("/", HTTP_GET, handleRoot);
  server.on("/ci", HTTP_GET, handleCheckin);
  server.on("/count", HTTP_GET, handleCount);
  server.onNotFound(redirectToPortal);
  server.begin();
  Serial.print("# MANARA-SAFE v1.0 - written to documented APIs, UNTESTED on hardware until you flash it\n");
  Serial.print("# Wi-Fi network: " AP_SSID "  page: http://");
  Serial.print(ip.toString().c_str());
  Serial.print("/   counter: /count\n");
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
  uint32_t now = millis();
  digitalWrite(PIN_LED, (int32_t)(ledUntil - now) > 0 ? HIGH : LOW);
  if (digitalRead(PIN_RESET) == LOW) {                 // hold BOOT for 3 s: new session
    if (resetDownAt == 0) resetDownAt = now ? now : 1;
    if (now - resetDownAt >= RESET_HOLD_MS) {
      nRooms = 0;
      totalTaps = 0;
      resetDownAt = 0;
      Serial.print("# counters cleared\n");
      delay(600);
    }
  } else {
    resetDownAt = 0;
  }
  delay(2);
}
