// A toy source adapter, the shape every real one follows. PURE: no fetch, no
// DOM, so the server and the browser pipeline run the very same code, and it
// is tested against saved fixtures.
//
//   list(params)          -> { url } for a list page; throws on what it cannot express
//   parseList(html)       -> { rows }; throws on a check page or a changed shape
//   selected(html)        -> what the page SAYS it shows (for the identity check)
//   vocabulary(html, mk)  -> { models: [{ id, key }] } read from the site's own page

export const src = 'example';
const BASE = 'https://listings.example-source.test';
const MAKES = { bmw: 'bmw', audi: 'audi' };

export function list({ make, series } = {}) {
  const mk = MAKES[make];
  if (!mk) throw new Error(`example: no make slug for "${make}"`);
  if (series && !/^[a-z0-9-]+$/.test(series)) throw new Error(`example: not a series slug "${series}"`);
  return { url: `${BASE}/cars/${mk}/${series ? `${series}/` : ''}` };
}

export function parseList(html) {
  const text = String(html || '');
  if (/captcha|security verification/i.test(text) && !text.includes('data-results="list"')) {
    throw new Error('example: this is a verification page, not a results page');
  }
  if (!text.includes('data-results="list"')) throw new Error('example: no results frame -- the page shape changed');
  const rows = [...text.matchAll(/<li data-id="(\d+)" data-price="(\d+)" data-year="(\d{4})">([^<]+)<\/li>/g)]
    .map(([, id, p, y, t]) => ({ id, src, title: t.trim(), price: Number(p), currency: 'CNY', year: Number(y) }));
  return { rows };
}

export function selected(html) {
  const m = /data-selected-make="([a-z0-9-]*)" data-selected-series="([a-z0-9-]*)"/.exec(String(html || ''));
  return { make: m ? m[1] || null : null, series: m ? m[2] || null : null };
}

export function vocabulary(html) {
  const models = [...String(html || '').matchAll(/data-series-id="([a-z0-9-]+)" data-key="([a-z0-9-]+)"/g)]
    .map(([, id, key]) => ({ id, key }));
  return { models };
}
