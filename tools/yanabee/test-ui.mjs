// Browser tests for the Yanabee search overlay and «مساعد ينابيع» (Playwright, Chromium, file:// URLs).
//
//   node tools/yanabee/test-ui.mjs
//
// From file:// there is no Worker, so the assistant must run in "document search" mode and
// answer from window.YANABEE_KB. A second part serves the site over http through the real
// worker/index.js (Gemini stubbed) to test the online path: payload {site: "yanabee"},
// streaming, related links, a missing key and upstream errors. Pages built by other modules
// (teams/operations/quran) are only navigated to when they exist. Exits non-zero on any failure.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { Readable } from 'node:stream';

// Playwright is installed globally in the sandbox; ESM ignores NODE_PATH, so resolve it by hand.
const globalRoot = process.env.NODE_PATH || execSync('npm root -g').toString().trim();
const { chromium } = createRequire(import.meta.url)(path.join(globalRoot, 'playwright'));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = path.join(ROOT, 'site/yanabee');
const url = f => pathToFileURL(path.join(SITE, f)).href;
const exists = f => fs.existsSync(path.join(SITE, f));

let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failures.push(detail ? `${name} — ${detail}` : name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
};


/* ------------------------------------------- http + the real Worker (Gemini stubbed) -- */
const worker = (await import(pathToFileURL(path.join(ROOT, 'worker/index.js')).href)).default;
const realFetch = globalThis.fetch;
const upstream = { mode: 'ok', bodies: [] };
const sse = text => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: 'model' } }] })}\r\n\r\n`;
globalThis.fetch = async (input, init = {}) => {
  const u = String(input && input.url || input);
  if (!u.startsWith('https://generativelanguage.googleapis.com/')) return realFetch(input, init);
  upstream.bodies.push(JSON.parse(init.body));
  if (upstream.mode === 'error') return new Response('{"error":{"message":"boom"}}', { status: 500 });
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(ctl) {
      ctl.enqueue(enc.encode(sse('وفق وثيقة المشروع، ')));
      await new Promise(r => setTimeout(r, 60));
      ctl.enqueue(enc.encode(sse('تأتي **60%** من مصادر التمويل من إعادة توجيه الميزانيات.')));
      ctl.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const env = {
  GEMINI_API_KEY: 'test-key',
  ASSETS: {
    async fetch(req) {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
      const file = path.join(ROOT, 'site', rel);
      if (!file.startsWith(path.join(ROOT, 'site')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('not found', { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' } });
    },
  },
};
const server = http.createServer(async (req, res) => {
  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers: req.headers, ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });
    const r = await worker.fetch(request, env, { waitUntil() {}, passThroughOnException() {} });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (r.body) for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const HTTP = `http://127.0.0.1:${server.address().port}/yanabee/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce', ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const where = (m.location() && m.location().url) || '';
    if (/fonts\.(googleapis|gstatic)/.test(where) || /fonts\.(googleapis|gstatic)/.test(m.text())) return;
    if (/\/api\/chat$/.test(where) && upstream.mode === 'error') return; // the deliberate 502 below
    errors.push(`console (${p.url().split('/').pop()}): ${m.text()}`);
  });
  p.on('pageerror', e => errors.push(`pageerror (${p.url().split('/').pop()}): ${e.message}`));
  return p;
}
const state = p => p.evaluate(() => {
  const box = document.querySelector('.search');
  const input = box.querySelector('input');
  return {
    open: !box.hidden,
    expanded: input.getAttribute('aria-expanded'),
    active: input.getAttribute('aria-activedescendant'),
    focusInInput: document.activeElement === input,
    hrefs: [...box.querySelectorAll('[role=option]')].map(a => a.getAttribute('href')),
    mainInert: document.querySelector('main').inert,
    overflow: document.documentElement.style.overflow,
  };
});

try {
  /* ------------------------------------------------------------ search -- */
  console.log('search overlay (index.html)');
  const p = await newPage();
  await p.goto(url('index.html'), { waitUntil: 'load' });
  check('window.YANABEE_KB loaded', await p.evaluate(() => !!(window.YANABEE_KB && window.YANABEE_KB.items.length > 40)));
  check('YanabeeSearch / YanabeeChat APIs', await p.evaluate(() =>
    typeof window.YanabeeSearch.open === 'function' && typeof window.YanabeeSearch.close === 'function'
    && ['open', 'close', 'ask'].every(k => typeof window.YanabeeChat[k] === 'function')));

  // (a) Ctrl+K, quick links, "الكشافة" -> teams.html#t2
  await p.locator('.brand').first().focus();
  await p.keyboard.press('Control+k');
  await p.waitForTimeout(150);
  let s = await state(p);
  check('Ctrl+K opens the search overlay', s.open);
  check('focus moves to the search input', s.focusInInput);
  check('page behind is inert + scroll locked', s.mainInert === true && s.overflow === 'hidden');
  check('empty query shows quick links (every page + 7 teams)', s.hrefs.length === 12 && s.hrefs.includes('teams.html#t7') && s.hrefs.includes('learn.html'), s.hrefs.join(' '));
  await p.keyboard.type('الكشافة');
  await p.waitForTimeout(120);
  s = await state(p);
  check('"الكشافة" lists teams.html#t2', s.hrefs.includes('teams.html#t2'), s.hrefs.join(' '));
  check('"الكشافة" ranks teams.html#t2 first', s.hrefs[0] === 'teams.html#t2', s.hrefs[0]);
  check('combobox aria-expanded=true with results', s.expanded === 'true');
  check('results highlight the hit with <mark>', await p.evaluate(() => [...document.querySelectorAll('#search-results mark')].some(m => m.textContent.includes('الكشافة'))));
  await p.keyboard.press('ArrowDown');
  s = await state(p);
  const activeHref = s.active && await p.evaluate(id => document.getElementById(id).getAttribute('href'), s.active);
  check('ArrowDown sets aria-activedescendant on the first option', activeHref === 'teams.html#t2', `${s.active} -> ${activeHref}`);
  check('active option is aria-selected', await p.evaluate(id => document.getElementById(id).getAttribute('aria-selected') === 'true', s.active));
  await p.keyboard.press('End');
  const endId = (await state(p)).active;
  await p.keyboard.press('Home');
  const homeId = (await state(p)).active;
  check('Home/End move between first and last option', endId && homeId === s.active && endId !== homeId, `${homeId} ${endId}`);

  // (b) "التمويل"
  await p.fill('.search-bar input', 'التمويل');
  await p.waitForTimeout(120);
  s = await state(p);
  check('"التمويل" finds operations.html#s6', s.hrefs.includes('operations.html#s6'), s.hrefs.join(' '));
  check('"التمويل" finds quran.html#a9', s.hrefs.includes('quran.html#a9'), s.hrefs.join(' '));
  check('results are grouped by page', await p.evaluate(() => document.querySelectorAll('#search-results [role=group]').length >= 2));
  check('Arabic normalisation (أإآ/ة/ى, tashkeel, digits): "التَّمْويل" == "التمويل"', await p.evaluate(() => {
    const e = window.YanabeeSearch.engine;
    return e.norm('التَّمْويل') === e.norm('التمويل') && e.norm('إدارة') === 'اداره' && e.norm('٨٥') === '85' && e.norm('مبنى') === 'مبني';
  }));

  // no results -> empty state with "ask the assistant"
  await p.fill('.search-bar input', 'كلمةغيرموجودةإطلاقا');
  await p.waitForTimeout(120);
  check('no results -> empty state + ask-assistant button', await p.evaluate(() =>
    !document.querySelector('.search-empty').hidden && !!document.querySelector('.search-empty .se-ask')
    && document.querySelector('.search-bar input').getAttribute('aria-expanded') === 'false'));

  // focus trap
  await p.fill('.search-bar input', 'الكشافة');
  for (let i = 0; i < 4; i++) await p.keyboard.press('Tab');
  check('Tab stays inside the dialog', await p.evaluate(() => document.querySelector('.search-panel').contains(document.activeElement)));
  await p.locator('.search-bar input').focus();

  // (c) Esc closes and focus returns
  await p.keyboard.press('Escape');
  s = await state(p);
  check('Esc closes the overlay', !s.open);
  check('focus returns to the element focused before opening', await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('brand')));
  check('page behind restored (not inert, scroll unlocked)', s.mainInert === false && s.overflow === '');

  // "/" shortcut + the nav button
  await p.locator('body').click({ position: { x: 5, y: 400 } });
  await p.keyboard.press('/');
  check('"/" opens the overlay when not typing', (await state(p)).open);
  await p.keyboard.press('Escape');
  await p.click('.nav [data-open-search]');
  s = await state(p);
  check('[data-open-search] button opens the overlay', s.open);
  await p.keyboard.press('Escape');
  check('focus returns to the search button', await p.evaluate(() => document.activeElement && document.activeElement.matches('.nav [data-open-search]')));

  // same-page anchor: closes and scrolls
  const sameId = await p.evaluate(() => {
    const it = window.YANABEE_KB.items.find(x => x.page === 'index.html' && x.type === 'subsection' && document.getElementById(x.id));
    return it && { id: it.id, title: it.title };
  });
  if (sameId) {
    await p.evaluate(q => window.YanabeeSearch.open(q), sameId.title);
    await p.waitForTimeout(100);
    const first = await p.evaluate(() => document.querySelector('#search-results [role=option]').getAttribute('href'));
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ hash: location.hash, open: !document.querySelector('.search').hidden, y: scrollY }));
    check(`"${sameId.title}" ranks index.html#${sameId.id} first`, first === 'index.html#' + sameId.id, first);
    check('same-page result closes the overlay and jumps to its anchor', !r.open && 'index.html' + r.hash === first && r.y > 0, JSON.stringify(r));
  } else {
    console.log('  skip same-page anchor test (no index subsection anchors yet)');
  }

  // ArrowDown + Enter navigates (only if the target page exists)
  await p.evaluate(() => window.YanabeeSearch.open('الكشافة'));
  await p.waitForTimeout(100);
  await p.keyboard.press('ArrowDown');
  if (exists('teams.html')) {
    await Promise.all([p.waitForURL(/teams\.html#t2$/, { timeout: 5000 }).catch(() => {}), p.keyboard.press('Enter')]);
    check('ArrowDown + Enter navigates to teams.html#t2', /teams\.html#t2$/.test(p.url()), p.url());
  } else {
    const href = await p.evaluate(() => document.getElementById(document.querySelector('.search-bar input').getAttribute('aria-activedescendant')).href);
    check('ArrowDown + Enter target is teams.html#t2 (teams.html not built yet)', /teams\.html#t2$/.test(href), href);
    console.log('  skip navigation (teams.html not built yet)');
  }
  await p.context().close();

  /* --------------------------------------------------------- assistant -- */
  console.log('assistant (index.html, offline / document search)');
  const c = await newPage();
  await c.goto(url('index.html'), { waitUntil: 'load' });
  await c.evaluate(() => sessionStorage.clear());
  await c.reload({ waitUntil: 'load' });
  await c.click('.nav .btn-ai');
  await c.waitForTimeout(200);
  const info = await c.evaluate(() => ({
    open: !document.querySelector('.chat').hidden,
    offline: document.querySelector('.chat').classList.contains('offline'),
    mode: document.querySelector('.chat-mode').textContent,
    chips: document.querySelectorAll('.chat-suggest button').length,
    welcome: document.querySelector('.chat-log .msg.bot').textContent,
    focus: document.activeElement === document.querySelector('.chat-form textarea'),
  }));
  check('chat opens', info.open);
  check('file:// -> offline "document search" mode (.offline)', info.offline);
  check('mode text = "يجيب من نصوص الوثائق مباشرة"', info.mode === 'يجيب من نصوص الوثائق مباشرة', info.mode);
  check('6 suggestion chips', info.chips === 6, String(info.chips));
  check('welcome introduces «مساعد ينابيع»', info.welcome.includes('مساعد ينابيع'));
  check('input focused on desktop', info.focus);
  check('input stays enabled offline', await c.evaluate(() => !document.querySelector('.chat-form textarea').disabled && !document.querySelector('.chat-send').disabled));

  // (d) "ما مصادر التمويل؟"
  await c.fill('.chat-form textarea', 'ما مصادر التمويل؟');
  await c.keyboard.press('Enter');
  await c.waitForSelector('.chat-log .msg.bot.local', { timeout: 4000 }).catch(() => {});
  const ans = await c.evaluate(() => {
    const last = [...document.querySelectorAll('.chat-log .msg.bot')].pop();
    return { text: last ? last.textContent : '', links: last ? [...last.querySelectorAll('a')].map(a => a.getAttribute('href')) : [] };
  });
  check('offline answer contains "60%"', ans.text.includes('60%'), ans.text.slice(0, 160));
  check('offline answer links to operations.html#s6', ans.links.includes('operations.html#s6'), ans.links.join(' '));
  check('offline answer has the source chip text', ans.text.includes('اقرأ في الموقع'));
  check('user message rendered as text', await c.evaluate(() => [...document.querySelectorAll('.chat-log .msg.user')].pop().textContent === 'ما مصادر التمويل؟'));
  check('suggestions hidden after the first question', await c.evaluate(() => document.querySelectorAll('.chat-suggest button').length === 0));

  // the suggestion chip about the project's funding cites the project (s6) first, not the initiative's a9
  await c.fill('.chat-form textarea', 'كيف يُموَّل المشروع؟');
  await c.keyboard.press('Enter');
  await c.waitForFunction(() => document.querySelectorAll('.chat-log .msg.bot.local').length >= 2, null, { timeout: 4000 }).catch(() => {});
  const fund = await c.evaluate(() => {
    const last = [...document.querySelectorAll('.chat-log .msg.bot')].pop();
    const first = last && last.querySelector('a[href*=".html#"]');
    return first ? first.getAttribute('href') : '';
  });
  check('"كيف يُموَّل المشروع؟" cites operations.html#s6 first', fund === 'operations.html#s6', fund);

  // a question the documents don't answer
  await c.fill('.chat-form textarea', 'ما حالة الطقس غداً؟');
  await c.keyboard.press('Enter');
  await c.waitForTimeout(700);
  const none = await c.evaluate(() => [...document.querySelectorAll('.chat-log .msg.bot')].pop().textContent);
  check('no match -> honest "not found" reply', none.includes('لم أجد'), none.slice(0, 120));

  // XSS: user text is never parsed as HTML
  await c.fill('.chat-form textarea', '<img src=x onerror="window.__xss=1">');
  await c.keyboard.press('Enter');
  await c.waitForTimeout(700);
  check('user text is not parsed as HTML', await c.evaluate(() => !window.__xss && !document.querySelector('.chat-log img')));

  // history survives a reload (sessionStorage 'yanabee-chat')
  await c.reload({ waitUntil: 'load' });
  await c.evaluate(() => window.YanabeeChat.open());
  await c.waitForTimeout(200);
  check('history restored from sessionStorage', await c.evaluate(() =>
    !!sessionStorage.getItem('yanabee-chat') && [...document.querySelectorAll('.chat-log .msg.bot.local')].some(m => m.textContent.includes('60%'))));

  // Esc closes the chat and returns focus
  await c.evaluate(() => window.YanabeeChat.close());
  await c.click('.nav .btn-ai');
  await c.waitForTimeout(150);
  await c.keyboard.press('Escape');
  check('Esc closes the chat and focus returns', await c.evaluate(() =>
    document.querySelector('.chat').hidden && document.activeElement && document.activeElement.matches('.nav .btn-ai')));

  // search empty state -> ask the assistant with the same words
  await c.evaluate(() => sessionStorage.clear());
  await c.reload({ waitUntil: 'load' });
  await c.evaluate(() => window.YanabeeSearch.open('كلمةغيرموجودة'));
  await c.waitForTimeout(100);
  const hasEmpty = await c.evaluate(() => !document.querySelector('.search-empty').hidden);
  if (hasEmpty) {
    await c.click('.search-empty .se-ask');
    await c.waitForTimeout(800);
    check('empty search -> "اسأل مساعد ينابيع" opens chat with the query', await c.evaluate(() =>
      document.querySelector('.search').hidden && !document.querySelector('.chat').hidden
      && [...document.querySelectorAll('.chat-log .msg.user')].pop().textContent === 'كلمةغيرموجودة'));
  } else {
    await c.evaluate(() => window.YanabeeSearch.close());
    await c.evaluate(() => window.YanabeeChat.ask('ما دور قائد الفريق؟'));
    await c.waitForTimeout(800);
    check('YanabeeChat.ask() opens the chat and answers', await c.evaluate(() => !document.querySelector('.chat').hidden && !!document.querySelector('.chat-log .msg.bot.local')));
  }

  // mobile: chat is a modal
  await c.context().close();
  const m = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(url('index.html'), { waitUntil: 'load' });
  await m.click('.tabbar .tab-ai');
  await m.waitForTimeout(200);
  check('mobile: chat is modal (aria-modal, page inert)', await m.evaluate(() =>
    document.querySelector('.chat-panel').getAttribute('aria-modal') === 'true' && document.querySelector('main').inert));
  await m.evaluate(() => window.YanabeeChat.ask('ما مراحل نمو المشروع؟'));
  await m.waitForTimeout(800);
  check('mobile: answer quotes the growth phases', await m.evaluate(() => [...document.querySelectorAll('.chat-log .msg.bot')].pop().textContent.includes('1,000')));
  check('mobile: no horizontal overflow with chat open', await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await m.keyboard.press('Escape');
  await m.evaluate(() => window.YanabeeSearch.open('الكشافة'));
  await m.waitForTimeout(100);
  check('mobile: no horizontal overflow with search open', await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await m.context().close();


  /* ------------------------------------------------------ online mode -- */
  console.log('assistant online (http + worker/index.js, Gemini stubbed)');
  const o = await newPage();
  const posted = [];
  o.on('request', r => { if (r.url().endsWith('/api/chat')) posted.push(r.postData()); });
  await o.goto(HTTP + 'index.html', { waitUntil: 'load' });
  await o.evaluate(() => window.YanabeeChat.open());
  await o.waitForTimeout(400);
  check('online: health configured -> not offline', await o.evaluate(() => !document.querySelector('.chat').classList.contains('offline')
    && document.querySelector('.chat-mode').textContent === 'يجيب من وثائق المشروع'));
  await o.evaluate(() => window.YanabeeChat.ask('ما مصادر التمويل؟'));
  await o.waitForFunction(() => !document.querySelector('.chat-log').getAttribute('aria-busy') || document.querySelector('.chat-log').getAttribute('aria-busy') === 'false', null, { timeout: 5000 }).catch(() => {});
  await o.waitForTimeout(300);
  const sent = posted.length ? JSON.parse(posted[0]) : {};
  check('online: POST /api/chat with {site:"yanabee", messages}', sent.site === 'yanabee' && Array.isArray(sent.messages) && sent.messages.at(-1).text === 'ما مصادر التمويل؟', JSON.stringify(sent).slice(0, 160));
  const sys = upstream.bodies[0] && upstream.bodies[0].systemInstruction.parts[0].text || '';
  check('online: Worker used the Yanabee prompt + knowledge', sys.includes('«مساعد ينابيع»') && sys.includes('فرقة الكشافة والخدمة العامة') && !sys.includes('مساعد تكامل الذكي'));
  const on = await o.evaluate(() => {
    const last = [...document.querySelectorAll('.chat-log .msg.bot')].pop();
    return { html: last.innerHTML, text: last.textContent, links: [...last.querySelectorAll('a')].map(a => a.getAttribute('href')) };
  });
  check('online: streamed answer rendered (markdown bold)', on.text.includes('تأتي 60% من مصادر التمويل') && on.html.includes('<strong>60%</strong>'), on.text.slice(0, 120));
  check('online: related link chip to operations.html#s6', on.links.includes('operations.html#s6'), on.links.join(' '));

  upstream.mode = 'error';
  const logErr = console.error;
  console.error = () => {}; // the Worker logs the stubbed upstream failure
  await o.evaluate(() => window.YanabeeChat.ask('ما مراحل نمو المشروع؟'));
  await o.waitForTimeout(1200);
  const er = await o.evaluate(() => [...document.querySelectorAll('.chat-log .msg.bot')].slice(-2).map(m => m.className + '|' + m.textContent));
  check('online: upstream error -> error note + answer from the documents', er.length === 2 && er[0].includes('err') && er[1].includes('local') && er[1].includes('1,000'), er.join(' || ').slice(0, 200));
  upstream.mode = 'ok';
  console.error = logErr;
  await o.context().close();

  env.GEMINI_API_KEY = '';
  const nk = await newPage();
  await nk.goto(HTTP + 'index.html', { waitUntil: 'load' });
  await nk.evaluate(() => window.YanabeeChat.open());
  await nk.waitForTimeout(400);
  check('no API key: health configured:false -> document search mode', await nk.evaluate(() => document.querySelector('.chat').classList.contains('offline')));
  const before = upstream.bodies.length;
  await nk.evaluate(() => window.YanabeeChat.ask('ما مصادر التمويل؟'));
  await nk.waitForTimeout(800);
  check('no API key: answered locally, no upstream call', upstream.bodies.length === before && await nk.evaluate(() =>
    [...document.querySelectorAll('.chat-log .msg.bot')].pop().textContent.includes('60%')));
  await nk.context().close();
  env.GEMINI_API_KEY = 'test-key';

  // (e) console errors
  check('no console errors / page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  failures.push('exception: ' + (e && e.stack || e));
  console.log(e);
} finally {
  await browser.close();
  server.close();
}

const total = passed + failures.length;
if (failures.length) {
  console.log(`\nFAIL ${failures.length}/${total}\n` + failures.map(f => '  x ' + f).join('\n'));
  process.exit(1);
}
console.log(`\nPASS ${passed}/${total} UI tests`);
