# Red lines, and the reasons behind them

Read this when a source blocks you, or when someone proposes a workaround. The
answers below are the ones to give a stakeholder, a client or yourself at 2 a.m.

## The test

Ask what the change does to the site's decision. If the site serves your
server, you are a reader. If the site challenges your server and you change
*how you look* until it stops, you have overridden its decision. The
technique doesn't matter; the effect does.

| Proposal | What it actually does | Answer |
|---|---|---|
| Rotate residential or ISP proxies | Makes one operator look like many home users | No |
| A "single static regional gateway" for a source that challenges your datacenter | Gets your server past the challenge from a different address | No |
| Headless or scripted browser to pass the challenge page | Automates the check meant to find automation | No |
| Copy the challenge cookie (e.g. a bot-session id) into your fetcher | Replays a human's pass | No |
| Fake browser headers or fingerprints | Disguises the client | No |
| Call the site's internal `/api/` from your servers | Reads what robots disallows, usually behind the same protection | No |
| Solve or outsource the captcha | Defeats the check directly | No |
| Use the visitor's own browser, opt-in, with checks shown to them | The visitor reads a public page as themselves | Yes |
| Ask the owner for a licensed feed or partner API | The owner decides | Yes |
| Leave the source out, keep its parser and fixtures for later | Nothing | Yes |

**Geography is different from a bot check.** If a site *redirects* visitors
from outside a country but serves anyone inside it, and robots allows the
paths, a fixed exit in that country can be a localisation question. Check
which one it is: if a home connection abroad gets real pages and only
datacenters are challenged, it is a bot check, and the table above applies.

## Why these lines hold

- **They are the site's rules.** robots.txt and challenges are how a site says
  what it allows. A source that won't serve you at human pace is not a source.
- **Legal exposure is real and uneven.** Some jurisdictions have prosecuted
  scrapers specifically for bypassing anti-crawling measures. Evasion turns a
  terms-of-service issue into something worse, for you and for your client.
- **It is brittle.** Every evasion becomes an arms race you will lose on a
  Friday night, and the data is quietly wrong while you lose it.
- **It poisons trust in the product.** A comparison site is only worth what
  its honesty is worth. If it hides how it got the data, nobody should
  believe the prices it shows.

## What to say instead

"That source challenges servers like ours. We have three honest options:
1. A licensed feed from the owner.
2. Read it in the visitor's own browser with an opt-in extension, where they
   see and answer any check themselves.
3. Leave it out and show the sources that do serve us.

What we won't do is disguise our traffic to get past the check."

## Write the decision down

Put the decision in the source's dossier with the date and the probe evidence:
status, size, body type and the challenge marker. Six weeks later someone will
propose the same workaround with a new name, and the written reason saves the
argument.
