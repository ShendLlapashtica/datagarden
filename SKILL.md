---
name: datagarden
description: Build compliant data pipelines for public listing sites (cars, property, jobs, products) when some sources serve your server and others block it. Covers choosing the right path per source (server + CDN cache, an opt-in browser extension that reads in the visitor's own browser, a licensed feed, or stop), robots.txt double guards, pacing and rests, handing verification pages to the human instead of solving them, page-identity checks so a wrong page is never shown, shared parsers between server and browser, plain-language errors, and onboarding for visitors without the extension. Use this whenever someone wants to pull listings from a site that challenges or rate-limits their server, asks about scraping a marketplace, wants a "companion extension" or "client-side fetching", or is tempted to reach for proxies, residential IPs, headless browsers or a site's private API to get past a block, even if they don't say "pipeline".
---

# datagarden

A garden, not a harvester: you take only what the site openly offers, at the
pace it tolerates, and you leave it as you found it. This skill is the pattern
behind a working multi-country listings aggregator. Some sources served its
server, some challenged it, and one was only readable from a real visitor's
browser. Every rule below came from a failure that actually happened.

## First: pick the path for each source

Probe each source with a few plain requests at human pace, using your real
user agent. Read `robots.txt` first. Then put the source on exactly one path:

| What the probe shows | Path | Read |
|---|---|---|
| Robots allows the list pages, and they come back as real HTML/JSON from your server | **Server + CDN**: fetch from your backend, cache at the edge | `references/server-cdn.md` |
| Real pages for a home connection, a challenge for your datacenter | **Visitor's browser**: an opt-in extension reads the page in the visitor's own tab | `references/extension.md`, `references/web-client.md` |
| Challenges everyone, or robots disallows the data, or the data only comes from a private `/api/` | **Licensed feed or stop**: ask the owner for a feed, or leave the source out | `references/red-lines.md` |
| No data in the page at all, raw or rendered | **Not a source** | write it down and move on |

Write the result down per source: date, URLs asked, status, size, and what the
body actually was. A 200 can be a challenge page, so judge by the body, never
by the status code. Future you will re-probe it.

## The rules every path shares

These hold whether the request leaves your server or the visitor's browser.
`references/red-lines.md` explains why each one exists.

1. **Robots, twice.** Allow-list the exact list paths you read, and keep a
   separate disallow list checked on its own. Then a later edit to a regex
   cannot quietly open `/api/` or `?kw=`.
2. **Stop on the first challenge, 403 or 429, and rest.** Never retry into a
   block. Rest the source (30 minutes is a good default), serve the last good
   answer marked as stale, and say so.
3. **Never solve, script or disguise around a check.** No captcha solving, no
   copied challenge cookies, no faked fingerprints, no rotating or residential
   proxies, no headless browser posing as a person. If a human must pass a
   check, it is the visitor, in their own browser, by their own choice.
4. **One request in flight per source, at a pace a person would keep.** Count
   pages per day if the site budgets by address.
5. **The page must be the page you asked for.** Check the landed URL and the
   page's own statement of what it shows (selected make/model, card brands).
   A redirect or a renumbered id must never put another product's listings
   under your label, or into a cache.
6. **One parser per source.** The same pure `parse(html)` runs on the server
   and on HTML handed back by the browser, and it is tested against saved
   fixtures. Parsers throw on challenge pages and on changed shapes. They
   never return a silent empty list.
7. **Cache at the edge, not in a database.** Example:
   `Cache-Control: public, s-maxage=21600, stale-while-revalidate=86400`.
   Repeat searches then cost zero upstream requests and zero store commands.
8. **Every failure a visitor sees is one plain sentence with a next step.**
   No error codes, no stack traces, no "unavailable" with no reason.

## Building the visitor's-browser path

Read `references/extension.md` for the extension and
`references/web-client.md` for the site side. The short version:

- **Extension (MV3).** It answers only your site's origins (production only,
  never `localhost` in a release) and only these messages: `PING`, which
  reports the version and opens nothing, and `FETCH {url}`. For an allowed URL
  it opens a background tab, waits, and takes a snapshot. If the snapshot is a
  check, the tab comes to the front and the extension polls until the human
  clears it or gives up. Then it checks the landed URL, trims a detached DOM
  clone, refuses oversize pages rather than truncating them, closes the tab,
  and returns the HTML.
- **Site.** First ask `PING` and tell five states apart: `unsupported`,
  `missing`, `outdated`, `no_answer` and `ready`. In real Chrome a page gets
  no `chrome.runtime` at all when no extension lists its origin. Only `ready`
  opens tabs, and only after a typed search or a button click. Everyone else
  gets the server/CDN data plus an honest fold-out explaining what the
  extension does.

Templates to copy and adapt are in `templates/`: `extension/` for the worker
and manifest, `web/` for the client, the pipeline and the plain errors, and
`test/` for a fake-extension unit test.

## Testing that actually catches things

See `references/testing.md`. The tests that found real bugs on the original
project:

- **Fixtures through a fake extension:** the happy path, a wrong page, a wrong
  model, an unknown make, and a landed-elsewhere tab.
- **Extension states with `chrome = {}`,** not only a friendly fake runtime.
  Real Chrome hides the runtime entirely when nothing is installed.
- **Trimming inside real Chrome** (headless, offline, against saved pages):
  assert the parser returns identical rows before and after, and include a
  page with `"<!--"` and `"<svg"` inside scripts.
- **Render every visitor state** and read the text a skeptic would see.
- **An independent adversarial review** before shipping. It found the
  "desktop Chrome is labelled unsupported" bug that every friendly test missed.

## What this skill will not help build

Proxy or IP rotation to look like many users, residential exits to get past a
datacenter block, captcha solving, challenge-cookie reuse, fingerprint
spoofing, or calling a site's private API from your servers. These are
different words for getting around a decision the site made. Renaming one as
"geo-localization" or a "regional gateway" does not change what it does. When
a source is closed to you, the honest options are a licensed feed, the
visitor's own browser with their consent, or leaving it out.
`references/red-lines.md` has the reasoning to give a stakeholder who asks.
