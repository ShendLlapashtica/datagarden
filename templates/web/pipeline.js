// The browser pipeline: for each source, one page at a time, through the
// extension, checked, then parsed by the SAME adapter the server uses.
//
// What it guarantees:
//   * the page must be the page asked for (landed URL, then the page's own
//     statement of what it shows), or it is refused, not shown, not cached;
//   * a vocabulary is cached for a day only when non-empty and checked;
//   * a newer search stops an older one before its next tab (isCurrent);
//   * every failure is a plain sentence; one source failing never sinks another.
import { sendToExtension } from './extension-client.js';
import { plainError } from './plain-errors.js';

const VOCAB_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 240000;          // page load + up to 3 min for the visitor's check
const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class Cancelled extends Error {}

const store = {
  get(key) {
    try {
      const hit = JSON.parse(window.localStorage.getItem(key) || 'null');
      return hit && Date.now() - hit.at < VOCAB_TTL_MS ? hit.value : null;
    } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch { /* storage blocked */ }
  },
};

async function fetchPage(url, isCurrent) {
  for (let attempt = 0; ; attempt += 1) {
    if (!isCurrent()) throw new Cancelled('replaced by a newer search');
    const r = await sendToExtension({ type: 'FETCH', payload: { url } }, { timeoutMs: FETCH_TIMEOUT_MS });
    if (r.status === 'SUCCESS') {
      if (new URL(r.data.url).href !== new URL(url).href) throw new Error(`the tab ended on a different page (${r.data.url})`);
      return r.data.html;
    }
    if (r.status === 'RATE_LIMITED' && attempt < MAX_RETRIES) { await sleep(Math.min(r.retryAfterMs ?? 5000, 20000) + 250); continue; }
    throw new Error(r.error || 'extension failed');
  }
}

function checkIdentity(adapter, html, asked) {
  adapter.parseList(html);                                    // throws on a check / changed shape
  const got = adapter.selected(html);
  if (got.make !== asked.make || (got.series || null) !== (asked.series || null)) {
    throw new Error(`answered for ${got.make}/${got.series || '-'}, not ${asked.make}/${asked.series || '-'}`);
  }
}

async function searchOne(adapter, make, modelKey, isCurrent) {
  const vkey = `vocab:${adapter.src}:${make}`;
  let vocab = store.get(vkey);
  let makePage = null;
  if (!vocab) {
    makePage = await fetchPage(adapter.list({ make }).url, isCurrent);
    checkIdentity(adapter, makePage, { make });
    vocab = adapter.vocabulary(makePage, make);
    if (vocab.models.length) store.set(vkey, vocab);          // never cache an empty list
  }
  let html = makePage;
  let asked = { make };
  if (modelKey) {
    const hit = vocab.models.find((m) => m.key === modelKey);
    if (!hit) return { ok: true, rows: [], note: 'no matching model on this site' };
    asked = { make, series: hit.id };
    html = await fetchPage(adapter.list(asked).url, isCurrent);
  } else if (!html) {
    html = await fetchPage(adapter.list(asked).url, isCurrent);
  }
  checkIdentity(adapter, html, asked);
  return { ok: true, rows: adapter.parseList(html).rows.map((r) => ({ ...r, key: `${r.src}-${r.id}` })) };
}

/** Sources run one after another, so only one tab is open at a time. */
export async function pipeline(adapters, make, modelKey, { isCurrent = () => true, onSource } = {}) {
  const results = [];
  for (const adapter of adapters) {
    if (!isCurrent()) break;
    let r;
    try {
      r = { src: adapter.src, ...(await searchOne(adapter, make, modelKey, isCurrent)) };
    } catch (err) {
      if (err instanceof Cancelled) break;
      r = { src: adapter.src, ok: false, rows: [], error: plainError(err.message) };
    }
    results.push(r);
    onSource?.(r);
  }
  return results;
}
