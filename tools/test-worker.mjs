// Dependency-free tests for worker/index.js (Node 22+): node tools/test-worker.mjs
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";
import { KNOWLEDGE } from "../worker/knowledge.js";

const ORIGIN = "https://takamul.example";
const KEY = "test-key-SECRET-123";
const wranglerText = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const DEFAULT_MODEL = wranglerText.match(/"GEMINI_MODEL"\s*:\s*"([^"]+)"/)?.[1];

let passed = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) passed++;
  else failures.push(detail ? `${name} — ${detail}` : name);
}

// --- stubs -----------------------------------------------------------------
const CHUNK_1 = "مرحباً بك في";
const CHUNK_2 = " جمعية تكامل!";
const sse = (text) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: "model" } }] })}\r\n\r\n`;

let captured = [];
let upstreamMode = "ok";
globalThis.fetch = async (input, init = {}) => {
  captured.push({ url: String(input), method: init.method, headers: new Headers(init.headers), body: init.body });
  if (upstreamMode === "error") {
    return new Response(`{"error":{"message":"quota exceeded for ${KEY}"}}`, { status: 429 });
  }
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(sse(CHUNK_1)));
      controller.enqueue(enc.encode(sse(CHUNK_2)));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
};

const loggedErrors = [];
console.error = (...args) => loggedErrors.push(args.join(" "));

let assetCalls = [];
function makeEnv(overrides = {}) {
  return {
    GEMINI_API_KEY: KEY,
    ASSETS: { fetch: async (req) => { assetCalls.push(new URL(req.url).pathname); return new Response("asset-body"); } },
    ...overrides,
  };
}

function chatRequest(body, { origin = ORIGIN, raw = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGIN}/api/chat`, { method: "POST", headers, body: raw ? body : JSON.stringify(body) });
}

const run = (req, env = makeEnv()) => worker.fetch(req, env, { waitUntil() {}, passThroughOnException() {} });
const valid = { messages: [{ role: "user", text: "ما هي جمعية تكامل؟" }] };

// --- health ----------------------------------------------------------------
{
  const r1 = await run(new Request(`${ORIGIN}/api/health`), makeEnv());
  const b1 = await r1.text();
  check("health configured:true", r1.status === 200 && JSON.parse(b1).ok === true && JSON.parse(b1).configured === true, b1);
  check("health never echoes key", !b1.includes(KEY));
  const r2 = await run(new Request(`${ORIGIN}/api/health`), makeEnv({ GEMINI_API_KEY: undefined }));
  const b2 = await r2.json();
  check("health configured:false", r2.status === 200 && b2.configured === false, JSON.stringify(b2));
}

// --- not configured --------------------------------------------------------
{
  captured = [];
  const r = await run(chatRequest(valid), makeEnv({ GEMINI_API_KEY: "" }));
  const b = await r.json();
  check("missing key -> 503 not_configured", r.status === 503 && b.error === "not_configured", `${r.status} ${JSON.stringify(b)}`);
  check("missing key -> no upstream call", captured.length === 0);
}

// --- bad requests ----------------------------------------------------------
{
  const many = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 ? "model" : "user", text: "x" }));
  const cases = {
    "invalid JSON": chatRequest("{not json", { raw: true }),
    "no messages": chatRequest({}),
    "messages not array": chatRequest({ messages: "hi" }),
    "empty array": chatRequest({ messages: [] }),
    "25 messages": chatRequest({ messages: many }),
    "bad role": chatRequest({ messages: [{ role: "system", text: "hi" }] }),
    "empty text": chatRequest({ messages: [{ role: "user", text: "   " }] }),
    "non-string text": chatRequest({ messages: [{ role: "user", text: 42 }] }),
    "last is model": chatRequest({ messages: [{ role: "user", text: "a" }, { role: "model", text: "b" }] }),
    "body > 32KB": chatRequest({ messages: [{ role: "user", text: "a".repeat(33 * 1024) }] }),
  };
  captured = [];
  for (const [name, req] of Object.entries(cases)) {
    const r = await run(req);
    const b = await r.json().catch(() => ({}));
    check(`bad body (${name}) -> 400`, r.status === 400 && b.error === "bad_request", `${r.status} ${JSON.stringify(b)}`);
  }
  check("bad bodies -> no upstream call", captured.length === 0, `${captured.length} calls`);
}

// --- origin guard ----------------------------------------------------------
{
  captured = [];
  const r = await run(chatRequest(valid, { origin: "https://evil.example" }));
  const b = await r.json();
  check("cross-origin -> 403 forbidden", r.status === 403 && b.error === "forbidden", `${r.status} ${JSON.stringify(b)}`);
  const r2 = await run(chatRequest(valid, { origin: "null" }));
  check("opaque origin -> 403", r2.status === 403);
  check("cross-origin -> no upstream call", captured.length === 0);
  const r3 = await run(chatRequest(valid, { origin: null }));
  await r3.text();
  check("no Origin header -> allowed", r3.status === 200, String(r3.status));
}

// --- happy path ------------------------------------------------------------
{
  captured = [];
  const r = await run(chatRequest(valid));
  const body = await r.text();
  check("valid -> 200", r.status === 200, String(r.status));
  check("valid -> text/event-stream", (r.headers.get("content-type") || "").startsWith("text/event-stream"), r.headers.get("content-type"));
  check("valid -> cache-control no-store", r.headers.get("cache-control") === "no-store");
  check("valid -> nosniff", r.headers.get("x-content-type-options") === "nosniff");
  check("stream contains chunk 1", body.includes(JSON.stringify(CHUNK_1).slice(1, -1)), body);
  check("stream contains chunk 2", body.includes(JSON.stringify(CHUNK_2).slice(1, -1)), body);
  check("response never echoes key", !body.includes(KEY));

  check("exactly one upstream call", captured.length === 1, String(captured.length));
  const call = captured[0] || { headers: new Headers(), url: "", body: "{}" };
  const sent = JSON.parse(call.body);
  check("upstream method POST", call.method === "POST");
  check("upstream x-goog-api-key header", call.headers.get("x-goog-api-key") === KEY);
  check("key not in upstream URL", !call.url.includes(KEY), call.url);
  check("wrangler.jsonc defines GEMINI_MODEL", Boolean(DEFAULT_MODEL));
  check(
    "upstream URL = default model + alt=sse",
    call.url === `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:streamGenerateContent?alt=sse`,
    call.url,
  );
  const sys = sent.systemInstruction?.parts?.[0]?.text || "";
  check("systemInstruction has prompt", sys.includes("مساعد تكامل الذكي"));
  check("systemInstruction has KNOWLEDGE", sys.endsWith("\n\n" + KNOWLEDGE));
  check("contents mapped", sent.contents?.length === 1 && sent.contents[0].role === "user" && sent.contents[0].parts[0].text === valid.messages[0].text, JSON.stringify(sent.contents));
  check("generationConfig.maxOutputTokens 1024", sent.generationConfig?.maxOutputTokens === 1024);
  check("no temperature on Gemini 3+", !("temperature" in (sent.generationConfig || {})));
  check("no thinkingConfig by default", !("thinkingConfig" in (sent.generationConfig || {})));
}

// --- model override, thinking level, legacy temperature --------------------
{
  captured = [];
  await (await run(chatRequest(valid), makeEnv({ GEMINI_MODEL: "gemini-2.5-flash", GEMINI_THINKING_LEVEL: "low" }))).text();
  const call = captured[0];
  const sent = JSON.parse(call.body);
  check("GEMINI_MODEL override in URL", call.url.endsWith("/models/gemini-2.5-flash:streamGenerateContent?alt=sse"), call.url);
  check("temperature 0.4 on Gemini 2.x", sent.generationConfig.temperature === 0.4);
  check("thinkingLevel from env", sent.generationConfig.thinkingConfig?.thinkingLevel === "low");
}

// --- history trimming --------------------------------------------------------
{
  captured = [];
  // 24 messages alternating, starting with "model" so the last one is "user";
  // the last one is over-long (but the whole body stays under 32 KB).
  const msgs = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? "user" : "model", text: `m${i} ` + "ب".repeat(i === 23 ? 2500 : 200) }));
  const r = await run(chatRequest({ messages: msgs }));
  await r.text();
  check("24 messages -> 200", r.status === 200, String(r.status));
  const sent = JSON.parse(captured[0]?.body || "{}");
  const contents = sent.contents || [];
  check("at most 12 messages sent", contents.length >= 1 && contents.length <= 12, String(contents.length));
  check("first sent turn is user", contents[0]?.role === "user");
  check("last sent turn is the latest user msg", contents.at(-1)?.parts[0].text.startsWith("m23 "));
  check("texts truncated to 2000 chars", contents.every((c) => Array.from(c.parts[0].text).length <= 2000));
}

// --- upstream failure --------------------------------------------------------
{
  upstreamMode = "error";
  loggedErrors.length = 0;
  const r = await run(chatRequest(valid));
  const text = await r.text();
  const b = JSON.parse(text);
  check("upstream error -> 502", r.status === 502 && b.error === "upstream" && b.status === 429, text);
  check("upstream error text not leaked", !text.includes("quota") && !text.includes(KEY), text);
  check("upstream error logged", loggedErrors.some((l) => l.includes("429")));
  upstreamMode = "ok";
}

// --- methods & routing -------------------------------------------------------
{
  for (const method of ["GET", "OPTIONS", "PUT"]) {
    const r = await run(new Request(`${ORIGIN}/api/chat`, { method }));
    check(`${method} /api/chat -> 405`, r.status === 405, String(r.status));
  }
  const rh = await run(new Request(`${ORIGIN}/api/health`, { method: "POST", body: "{}" }));
  check("POST /api/health -> 405", rh.status === 405);
  const rn = await run(new Request(`${ORIGIN}/api/nope`));
  check("unknown /api path -> 404", rn.status === 404);

  assetCalls = [];
  const ra = await run(new Request(`${ORIGIN}/about.html`));
  check("non-API path -> env.ASSETS.fetch", assetCalls.length === 1 && assetCalls[0] === "/about.html" && (await ra.text()) === "asset-body");
  assetCalls = [];
  await run(new Request(`${ORIGIN}/apiary.html`));
  check("/apiary.html is not treated as API", assetCalls.length === 1);
}

// --- summary -------------------------------------------------------------------
const total = passed + failures.length;
if (failures.length) {
  process.stdout.write(`FAIL ${failures.length}/${total}\n` + failures.map((f) => `  x ${f}`).join("\n") + "\n");
  process.exit(1);
}
process.stdout.write(`PASS ${passed}/${total} worker tests\n`);
