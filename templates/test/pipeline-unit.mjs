// Offline: node templates/test/pipeline-unit.mjs
// A fake extension serves fixture pages; the real pipeline, adapter, error
// mapping and status probe run against it. Copy and grow this per project.
import assert from 'node:assert/strict';

const PAGE = (make, series, cars = []) => `<html><body>
<div data-selected-make="${make}" data-selected-series="${series || ''}"></div>
<a data-series-id="bmw-5" data-key="5-series"></a><a data-series-id="bmw-3" data-key="3-series"></a>
<ul data-results="list">${cars.map(([id, p, y, t]) => `<li data-id="${id}" data-price="${p}" data-year="${y}">${t}</li>`).join('')}</ul>
</body></html>`;
const CHECK = '<html><body><h1>Security Verification</h1><div class="captcha"></div></body></html>';

const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) } };

let mode = {};
const asked = [];
function fakeExtension(msg, reply) {
  if (msg.type === 'PING') {
    if (mode.ping === 'missing') return reply(undefined, 'Could not establish connection. Receiving end does not exist.');
    if (mode.ping === 'old') return reply(undefined, 'The message port closed before a response was received.');
    return reply({ status: 'SUCCESS', version: mode.version || '1.0.0' });
  }
  const { url } = msg.payload;
  asked.push(url);
  const m = /\/cars\/([a-z0-9]+)\/(?:([a-z0-9-]+)\/)?$/.exec(new URL(url).pathname);
  let html = PAGE(m[1], mode.wrongSeries ? null : m[2], [['101', 156600, 2019, 'BMW 5 Series 2019'], ['102', 228800, 2024, 'BMW 5 Series 2024']]);
  if (mode.check) html = CHECK;
  reply({ status: 'SUCCESS', data: { url: mode.land || url, html } });
}
globalThis.chrome = {
  runtime: {
    lastError: null,
    sendMessage(id, msg, cb) {
      setTimeout(() => fakeExtension(msg, (res, err) => {
        chrome.runtime.lastError = err ? { message: err } : null;
        cb(res);
        chrome.runtime.lastError = null;
      }), 0);
    },
  },
};

const adapter = await import('../web/example-adapter.js');
const { pipeline } = await import('../web/pipeline.js');
const { plainError } = await import('../web/plain-errors.js');
const run = async (make, model, m = {}) => { mode = m; asked.length = 0; mem.clear(); return (await pipeline([adapter], make, model))[0]; };

// 1. Happy path.
{
  const r = await run('bmw', '5-series');
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 2);
  assert.ok(r.rows.every((x) => x.key.startsWith('example-')), 'ids namespaced');
  assert.ok(asked.length <= 2, 'at most two pages');
  console.log('  ok   happy path:', r.rows.length, 'rows,', asked.length, 'pages');
}
// 2. Wrong series page -> refused, plain words.
{
  const r = await run('bmw', '5-series', { wrongSeries: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /different item/);
  console.log('  ok   wrong page refused:', r.error);
}
// 3. Landed elsewhere -> refused.
{
  const r = await run('bmw', null, { land: 'https://listings.example-source.test/' });
  assert.equal(r.ok, false);
  assert.match(r.error, /different page/);
  console.log('  ok   landed elsewhere refused');
}
// 4. A check page is never parsed as results, and nothing empty is cached.
{
  const r = await run('bmw', '5-series', { check: true });
  assert.equal(r.ok, false);
  assert.equal([...mem.keys()].length, 0, 'nothing cached');
  console.log('  ok   check page refused:', r.error);
}
// 5. Unknown make: plain, no code.
{
  const r = await run('lada', null);
  assert.equal(r.error, 'This site does not list this make or model.');
  console.log('  ok   unknown make, plain');
}
// 6. Every code becomes a sentence.
for (const code of ['PERMISSION_REQUIRED: allow a.test first.', 'DAILY_CAP: x', 'SOURCE_RESTING: x', 'VERIFICATION_CLOSED', 'WRONG_PAGE: x', 'PAGE_TOO_LARGE', 'RATE_LIMITED', 'something unplanned']) {
  const t = plainError(code);
  assert.ok(!/[A-Z]{4,}_[A-Z]+/.test(t), `${code} leaks a code: ${t}`);
}
console.log('  ok   every code reads as a sentence');
// 7. Extension states, including real Chrome with nothing installed (chrome = {}).
{
  const probe = async (label, setup) => { setup(); return (await (await import(`../web/extension-client.js?${label}`)).extensionStatus()).state; };
  const real = globalThis.chrome;
  const nav = (ua, mobile) => Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua, userAgentData: mobile === undefined ? undefined : { mobile } }, configurable: true });
  assert.equal(await probe('ready', () => { mode = { version: '1.0.0' }; }), 'ready');
  assert.equal(await probe('old', () => { mode = { ping: 'old' }; }), 'outdated');
  assert.equal(await probe('missing-listener', () => { mode = { ping: 'missing' }; }), 'missing');
  assert.equal(await probe('desktop-none', () => { globalThis.chrome = {}; globalThis.window.chrome = {}; nav('Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36', false); }), 'missing');
  assert.equal(await probe('phone', () => { nav('Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile Safari/537.36', true); }), 'unsupported');
  globalThis.chrome = real;
  console.log('  ok   extension states: ready, outdated, missing (incl. chrome = {}), unsupported');
}
console.log('pipeline-unit: all checks passed');
