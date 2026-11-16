# The site side: status, pipeline, errors, onboarding

Template: `templates/web/`.

## 1. Know the visitor's state before opening anything

```
unsupported  not desktop Chromium (phone, Safari, Firefox)
missing      desktop Chrome, but no extension answers
outdated     an extension answered but has no PING (older build)
no_answer    PING timed out (the worker was asleep); not cached, ask again later
ready        PING answered with a version >= the minimum
```

**Real Chrome gives the page no `chrome.runtime` at all unless an installed
extension lists the page's origin.** So "not installed" usually looks like
`window.chrome` present but `chrome.runtime` undefined, not like a failed
message. Detect desktop Chromium with `navigator.userAgentData.mobile ===
false`, falling back to the UA string. Treat the case as `missing`, not
`unsupported`. The original project labelled every desktop visitor without
the extension as "unsupported"; only a test with `chrome = {}` catches that.

Chrome attaches the runtime when the page loads, so a visitor who installs the
extension mid-visit must reload. Say so in the copy.

## 2. The pipeline

For each source, in order, so only one tab is open at a time:

1. Get the source's series list ("vocabulary") for the make. Cache it in
   `localStorage` for a day, but **only when it is non-empty and its page
   passed the identity check**. One odd page must not hide a make for a day.
2. Resolve your canonical model to the source's own id. If there's no match,
   the source has nothing for this model, which is a note, not an error.
3. `FETCH` the list page. Then check that the landed URL equals the asked URL,
   check the page's identity, and parse with the same adapter the server uses.
4. Convert to your display currency in parallel, with a ~3 s limit. Without a
   rate, show the seller's price only, and say so.
5. Namespace ids (`src-id`) and de-duplicate across sources.

Pass `isCurrent()` through, and check it before every page. A newer search
must stop an older one before its next tab opens. Use a generation counter,
and make sure a page render can never pre-empt a typed search.

## 3. Page identity: the check that keeps wrong data out

Every list page states what it shows: a "selected filters" bar, the brand on
each card, a heading. Compare that to what you asked for and throw on a
mismatch:

```js
if (page.selectedMake !== asked.make || page.selectedSeries !== asked.series) {
  throw new Error(`answered for ${got}, not ${want}`);
}
```

This catches renumbered ids, redirects, and a visitor clicking around inside a
check tab. Without it, wrong cars appear under the right name, and get cached.

## 4. Plain errors

Map every code to one sentence with a next step. Unknown errors say "could
not be read this time"; they never describe the page wrongly.

| Code | Visitor reads |
|---|---|
| `PERMISSION_REQUIRED` | Allow {host} first: click the extension icon, then "Enable". |
| `DAILY_CAP` | Your browser has reached today's limit for this site. It resets tomorrow. |
| `SOURCE_RESTING` | Paused for 30 minutes after the site refused or a check was left unfinished. |
| `VERIFICATION_CLOSED` | The security check tab was closed. Search again whenever you like. |
| `WRONG_PAGE` / identity | The site answered for a different item, so nothing was shown. |
| `RATE_LIMITED` | Busy with another search. Try again in a few seconds. |
| adapter refusal | This site does not list this make or model. |

Test it: no visible sentence may match `/[A-Z]{4,}_[A-Z]+/`.

## 5. Onboarding for the visitor who doesn't have it

Most visitors never will. Design for them first:

- **Show the server/CDN data straight away,** for everyone, on any device.
  That's the value; the extension is extra.
- **Never put an error box at the top of the page** about something the
  visitor can't fix (an unconfigured store, a missing extension). One quiet
  line with a fold-out, "How the optional extension works", is enough.
- **The fold-out says, in four lines a skeptic can check:** why it exists
  (sites block servers), what it reads (named public pages), when it runs (only
  when you search or press the button), and that checks stay with the visitor.
  Add one line for their state (phone, missing, outdated, no answer), with a
  reload hint where it helps.
- **No tab opens without a typed search or a click.** Someone arriving from a
  link gets cached data, plus a "Check live in my browser" button if `ready`.
- **Contribution to a shared index is opt-in, off by default,** and says
  exactly which fields leave the browser.
- **Fold long lists** (6 rows plus "Show all") so the extra source never pushes
  the main results off the first screen.
