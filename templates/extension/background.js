// datagarden companion extension: MV3 service worker (template).
//
// Reads ONE allow-listed public page in the visitor's own browser when your
// site asks, and returns trimmed HTML for your site to parse. It never solves,
// scripts or disguises around a verification page: a check is brought to the
// front for the visitor to decide. Replace every EXAMPLE value.

const ALLOWED_WEBAPP_ORIGINS = ["https://www.example-app.com", "https://example-app.com"]; // production only
const PAGE_LOAD_TIMEOUT_MS = 30000;
const VERIFICATION_WAIT_MS = 180000;
const VERIFICATION_POLL_MS = 2000;
const MAX_HTML_CHARS = 2000000;  // refused above this, never truncated
const REST_MS = 30 * 60 * 1000;  // after a 403/429 or an unfinished check

// One entry per host you read. Keep paths anchored and queries strict.
const ROUTES = [
  {
    host: "listings.example-source.test",
    origin: "https://listings.example-source.test/*",
    path: /^\/cars\/[a-z0-9-]+(?:\/[a-z0-9-]+)?\/$/,
    query: false,                          // no query string allowed at all
    marker: 'data-results="list"',         // only a RESULTS page carries this
    keepScript: null,                      // or a substring of the one data script to keep
    cooldownMs: 15000,
    dailyCap: 25,
    company: "example-source"              // hosts of one owner share a lock and a rest
  }
];
// Checked on its own, so a future regex edit cannot open a disallowed path.
const ROBOTS_DISALLOW = {
  "listings.example-source.test": [/^\/api\//i, /[?&](q|kw)=/i, /[?&]utm_/i]
};

const lastAt = {};             // company -> last start/finish
const inFlight = new Set();    // companies with a tab open
let capQueue = Promise.resolve();

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (!sender.origin || !ALLOWED_WEBAPP_ORIGINS.includes(sender.origin)) {
    sendResponse({ status: "ERROR", error: "FORBIDDEN_ORIGIN" });
    return false;
  }
  if (request?.type === "PING") {
    sendResponse({ status: "SUCCESS", version: chrome.runtime.getManifest().version, features: ["fetch"] });
    return false;
  }
  if (request?.type === "FETCH") return handleFetch(request, sendResponse);
  return false;
});

function routeFor(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return null;
  if ((ROBOTS_DISALLOW[u.hostname] || []).some((re) => re.test(u.pathname + u.search))) return null;
  const route = ROUTES.find((r) => r.host === u.hostname);
  if (!route || !route.path.test(u.pathname)) return null;
  const qs = u.search.replace(/^\?/, "");
  if (route.query === false ? qs !== "" : !route.query.test(qs)) return null;
  return { route, url: u.href };
}

function handleFetch(request, sendResponse) {
  const hit = routeFor(request?.payload?.url);
  if (!hit) { sendResponse({ status: "ERROR", error: "URL_NOT_ALLOWED" }); return false; }
  const { route, url } = hit;
  const key = route.company;
  const now = Date.now();                              // admission is synchronous
  const wait = route.cooldownMs - (now - (lastAt[key] || 0));
  if (inFlight.has(key) || wait > 0) {
    sendResponse({ status: "RATE_LIMITED", retryAfterMs: Math.max(wait, 1000) });
    return false;
  }
  inFlight.add(key);
  lastAt[key] = now;
  fetchPage(route, url)
    .then((data) => sendResponse({ status: "SUCCESS", data }))
    .catch((err) => sendResponse({ status: "ERROR", error: err.message }))
    .finally(() => { lastAt[key] = Date.now(); inFlight.delete(key); });  // cooldown from the FINISH
  return true;
}

async function storageGet(key) { return (await chrome.storage.local.get(key))[key]; }

async function restingUntil(company) {
  const rest = (await storageGet("rest")) || {};
  return rest[company] > Date.now() ? rest[company] : 0;
}
async function rest(company) {
  const all = (await storageGet("rest")) || {};
  all[company] = Date.now() + REST_MS;
  await chrome.storage.local.set({ rest: all });
}
function takeDailySlot(route) {            // serialised: no lost increments
  const run = capQueue.then(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const day = (await storageGet("day")) || {};
    const d = day.date === today ? day : { date: today, counts: {} };
    const used = d.counts[route.host] || 0;
    if (used >= route.dailyCap) return false;
    d.counts[route.host] = used + 1;
    await chrome.storage.local.set({ day: d });
    return true;
  });
  capQueue = run.catch(() => {});
  return run;
}

async function fetchPage(route, url) {
  if (!(await chrome.permissions.contains({ origins: [route.origin] }))) throw new Error(`PERMISSION_REQUIRED: allow ${route.host} first.`);
  if (await restingUntil(route.company)) throw new Error(`SOURCE_RESTING: ${route.host} is resting in this browser.`);
  if (!(await takeDailySlot(route))) throw new Error(`DAILY_CAP: ${route.host} for today.`);

  const tab = await chrome.tabs.create({ url, active: false });
  await trackTab(tab.id, true);
  try {
    await waitForComplete(tab.id, PAGE_LOAD_TIMEOUT_MS);
    let page = await read(tab.id, route);
    if (page.requiresVerification) {
      await chrome.tabs.update(tab.id, { active: true });          // the visitor decides
      page = await pollUntilCleared(tab.id, route, url);
      if (!page || page === "CLOSED") {
        await rest(route.company);
        throw new Error(page === "CLOSED" ? "VERIFICATION_CLOSED" : "VERIFICATION_REQUIRED");
      }
    }
    if (page.httpStatus === 403 || page.httpStatus === 429) { await rest(route.company); throw new Error(`SOURCE_REFUSED: ${page.httpStatus}`); }
    if (page.httpStatus >= 400) throw new Error(`SOURCE_ERROR: ${page.httpStatus}`);
    if (page.tooLarge) throw new Error("PAGE_TOO_LARGE");
    if (page.trimLost) throw new Error("EXTRACTION_FAILED");
    if (new URL(page.url).href !== new URL(url).href) throw new Error(`WRONG_PAGE: ${page.url}`);
    return { url: page.url, html: page.html };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
    trackTab(tab.id, false).catch(() => {});
  }
}

async function trackTab(id, open) {
  const ids = (await chrome.storage.session.get("tabs")).tabs || [];
  await chrome.storage.session.set({ tabs: open ? [...new Set([...ids, id])] : ids.filter((x) => x !== id) });
}
async function closeLeftovers() {
  const ids = (await chrome.storage.session.get("tabs")).tabs || [];
  await Promise.all(ids.map((id) => chrome.tabs.remove(id).catch(() => {})));
  await chrome.storage.session.set({ tabs: [] });
}
chrome.runtime.onStartup.addListener(() => { closeLeftovers().catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { closeLeftovers().catch(() => {}); });

function waitForComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => { if (done) return; done = true; clearTimeout(t); chrome.tabs.onUpdated.removeListener(on); err ? reject(err) : resolve(); };
    const on = (id, info) => { if (id === tabId && info.status === "complete") finish(); };
    chrome.tabs.onUpdated.addListener(on);                       // listener first, then check
    const t = setTimeout(() => finish(new Error("PAGE_TIMEOUT")), timeoutMs);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === "complete") finish(); }).catch(finish);
  });
}

async function read(tabId, route) {
  const tab = await chrome.tabs.get(tabId);
  let landed = null;
  try { landed = new URL(tab.url || ""); } catch { /* unreadable */ }
  if (!landed || landed.hostname !== route.host) {
    if (landed && /verify|captcha|challenge|defen[cs]e/i.test(landed.href)) return { requiresVerification: true };
    throw new Error(`WRONG_PAGE: sent to ${landed ? landed.hostname : "an unreadable page"}`);
  }
  const [inj] = await chrome.scripting.executeScript({ target: { tabId }, func: snapshot, args: [route.marker, route.keepScript, MAX_HTML_CHARS] });
  if (!inj?.result) throw new Error("EXTRACTION_FAILED");
  return inj.result;
}

async function pollUntilCleared(tabId, route, url) {
  const deadline = Date.now() + VERIFICATION_WAIT_MS;
  let sentBack = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, VERIFICATION_POLL_MS));
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch { return "CLOSED"; }
    if (tab.status !== "complete") continue;
    const page = await read(tabId, route).catch(() => null);
    if (!page || page.requiresVerification) continue;
    if (new URL(page.url).href === new URL(url).href || sentBack) return page;
    sentBack = true;                                             // back to the asked page, once
    await chrome.tabs.update(tabId, { url });
  }
  return null;
}

// Injected. Self-contained. Reads; changes nothing on the page.
function snapshot(marker, keepScript, maxChars) {
  const nav = performance.getEntriesByType("navigation")[0];
  const httpStatus = nav && nav.responseStatus ? nav.responseStatus : null;
  const full = document.documentElement.outerHTML;
  const hasResults = full.includes(marker);
  const looksLikeCheck = /captcha|security verification|verify you are human|challenge/i.test(full);
  if (!hasResults && looksLikeCheck) return { requiresVerification: true };
  if (!hasResults) {
    if (full.length > maxChars) return { requiresVerification: false, httpStatus, tooLarge: full.length };
    return { requiresVerification: false, httpStatus, url: location.href, html: full };
  }
  const copy = document.documentElement.cloneNode(true);         // never regex over HTML
  copy.querySelectorAll("style, svg, noscript, iframe, link").forEach((n) => n.remove());
  copy.querySelectorAll("script").forEach((n) => { if (!(keepScript && n.textContent.includes(keepScript))) n.remove(); });
  const w = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (w.nextNode()) comments.push(w.currentNode);
  comments.forEach((c) => c.remove());
  const html = copy.outerHTML;
  if (!html.includes(marker)) return { requiresVerification: false, httpStatus, trimLost: true };
  if (html.length > maxChars) return { requiresVerification: false, httpStatus, tooLarge: html.length };
  return { requiresVerification: false, httpStatus, url: location.href, html };
}
