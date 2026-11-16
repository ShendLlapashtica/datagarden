# datagarden

**Compliant data pipelines for public listing sites. A garden, not a harvester.**

datagarden is a [Claude Code](https://claude.com/claude-code) skill for building
pipelines that pull listings (cars, property, jobs, products) from public sites
when some sources serve your server and others block it. It takes only what a
site openly offers, at the pace the site tolerates, and leaves it as it found it.

It is the pattern behind a working multi-country listings aggregator. Every rule
in it came from a failure that actually happened.

## What it covers

- Choosing the right path for each source, based on a written probe
- Server + CDN caching, so repeat searches cost zero upstream requests
- An opt-in browser extension that reads a public page in the visitor's own
  browser, with their consent
- A robots.txt double guard: an allow-list plus a separate disallow list
- Stopping on the first challenge, 403 or 429, then resting the source
- Handing verification pages to the human instead of solving them
- Page-identity checks, so a wrong page is never shown or cached
- One pure parser per source, shared by server and browser and tested on fixtures
- Plain-language errors and honest onboarding for visitors without the extension

## Pick a path per source

| What the probe shows | Path |
|---|---|
| Robots allows the list pages, and your server gets real HTML/JSON | **Server + CDN**: fetch from your backend, cache at the edge |
| Real pages for a home connection, a challenge for your datacenter | **Visitor's browser**: an opt-in extension reads the page in the visitor's own tab |
| Challenges everyone, robots disallows the data, or the data only comes from a private `/api/` | **Licensed feed or stop** |
| No data in the page at all, raw or rendered | **Not a source** |

Judge by the body, never by the status code: a 200 can be a challenge page.

## What it deliberately will NOT help build

- Proxy or IP rotation, including residential or "regional gateway" exits, to
  get past a block
- Captcha solving, scripted or outsourced
- Reusing challenge cookies or replaying a human's pass
- Fingerprint or header spoofing, or headless browsers posing as people
- Calling a site's private or internal API from your servers

These are different words for overriding a decision the site made. When a
source is closed to you, the honest options are a licensed feed, the visitor's
own browser with their consent, or leaving it out.
[`references/red-lines.md`](references/red-lines.md) has the reasoning to give a
stakeholder who asks.

## Install (Claude Code)

Skills are folders with a `SKILL.md`. Install for every project:

```sh
git clone https://github.com/ShendLlapashtica/datagarden ~/.claude/skills/datagarden
```

Or for one project only:

```sh
git clone https://github.com/ShendLlapashtica/datagarden .claude/skills/datagarden
```

Copying the folder by hand works too. Claude Code picks the skill up on the
next session and uses it when you ask about pulling listings from a site, a
"companion extension", client-side fetching, or getting past a block.

## Run the template test

Needs Node.js 18 or newer. No dependencies, fully offline.

```sh
node templates/test/pipeline-unit.mjs
node --check templates/extension/background.js
```

The test should end with `pipeline-unit: all checks passed`. It drives the real
pipeline, adapter, error mapping and extension-status probe against a fake
extension that serves fixture pages, including a wrong page, a landed-elsewhere
tab, a check page and real Chrome with nothing installed (`chrome = {}`).

## Folder map

```
datagarden/
├── SKILL.md                    the skill: decision table, shared rules, red lines
├── references/
│   ├── server-cdn.md           server + edge cache path, stop rules, price sanity
│   ├── extension.md            the opt-in MV3 extension, FETCH order of operations
│   ├── web-client.md           site side: visitor states, pipeline, identity, errors
│   ├── testing.md              the tests that caught real bugs
│   └── red-lines.md            what not to do, and why
└── templates/
    ├── extension/              manifest.json, background.js, popup.html, popup.js
    ├── web/                    extension-client.js, pipeline.js, plain-errors.js,
    │                           example-adapter.js
    └── test/pipeline-unit.mjs  offline fake-extension unit test
```

All hosts in the templates are placeholders (`example-app.com`,
`listings.example-source.test`). Replace every `EXAMPLE` value and the
extension id before use.

## License

[MIT](LICENSE)
