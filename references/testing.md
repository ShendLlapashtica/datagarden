# Testing the pipeline

Ordered by how many real bugs each test caught on the original project.

## 1. Fixtures through a fake extension (unit, offline)

Save real pages once, cut them to the parts the parser reads, and keep them
under `fixtures/`. Fake `chrome.runtime.sendMessage` so that it:

- answers `PING` with a chosen version, or with Chrome's real errors:
  `"Could not establish connection. Receiving end does not exist."` for no
  listener, and `"The message port closed before a response was received."`
  for an old build that never calls `sendResponse`;
- answers `FETCH` with a fixture, and lets a test change the landed URL or
  serve the wrong page.

Assert:

- the happy path parses every source, with namespaced ids and the seller
  currency kept;
- a wrong series page, a wrong make page and a landed-elsewhere tab are each
  **refused**, and nothing empty is cached;
- a make one source doesn't carry fails only that source, in plain words;
- every extension code becomes a sentence with no code in it;
- the states `unsupported`, `missing` (with `chrome = {}`!), `outdated`,
  `no_answer` (not cached) and `ready`;
- a store outage reads as an error, an empty store as empty, and a store that
  was never configured as off (nothing shown).

`templates/test/pipeline-unit.mjs` is a starting point.

## 2. Trimming inside real Chrome (offline)

A regex test in Node proves nothing about a DOM-clone trim. Build one HTML
page that embeds the saved pages as JSON (escape `<` as `\u003c`, and add
`<meta charset="utf-8">`, or non-Latin text breaks the script). Parse each
with `DOMParser`, run the injected snapshot function against it, and write the
results base64-encoded into a `<pre>`. Then run:

```
chrome --headless=new --dump-dom file:///…/trim-test.html
```

Decode the output in Node, and assert that the parser returns **identical
rows** for the full page and the trimmed copy. Include a trap page with
`"<!--"` and `"<svg"` inside scripts.

## 3. Render every visitor state

Bundle the component with esbuild (`--platform=node --format=cjs`) and
`renderToStaticMarkup` it for each state: phone/no extension, Chrome/no
extension with cached rows, outdated, ready-but-landed, live with one source
failed, store down, make-only. Then *read the text*. This caught "1 verified
listings", a contradiction ("the shared index above works" while it was down),
and "Bmw".

## 4. Real viewport, real phone width

Headless Chrome refuses windows narrower than ~500 px, so `--window-size=390`
silently renders at 504 px and crops. Use the DevTools protocol instead:
`Emulation.setDeviceMetricsOverride({ width: 390, mobile: true })`. Then
assert `document.documentElement.scrollWidth === innerWidth`, and screenshot.

## 5. One rendered check per live source, then stop

Before shipping, load one real list page per source once (headless, with an
honest UA) and run the parser on the dumped DOM. If it is a check page, stop
there. That result is the answer, and you don't ask again.

## 6. An independent adversarial review

Give a fresh reviewer the files, not your conclusions. Ask specifically
about:

- allowlist bypasses after navigation;
- timeouts between the site and the extension;
- labels that call cached data "live";
- caching of unchecked pages;
- what real Chrome does differently from your fakes.

Two review rounds on the original project found 25 issues. All the friendly
tests had passed.
