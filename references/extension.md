# The visitor's-browser path: the extension

Use this path only for a source that serves real pages to a home connection
but challenges your server, and whose robots.txt allows the pages you read.
The extension makes the visitor's own browser open the public page they asked
for, as they would by hand, and hands the HTML to your site to parse.
Template: `templates/extension/`.

## Messages it accepts (and nothing else)

| Message | Does | Opens a tab? |
|---|---|---|
| `PING` | `{ version, features }` from the manifest | no |
| `FETCH { url }` | one allow-listed page, as trimmed HTML | yes, then closes it |

Check `sender.origin` against a hard-coded list of **production** origins,
and include the `www.` variant if your site serves both. `localhost` belongs
only in a dev copy; in a release, any local process on that port could drive
the extension. Mirror the same list in `externally_connectable` in the
manifest. Chrome only exposes `chrome.runtime` to pages whose origin is listed
there.

## Order of operations for `FETCH`

1. **Route check.** Parse with `new URL`. Require https, no credentials, port
   or hash. Then match an exact hostname, an anchored path regex and a strict
   query regex (or no query string at all).
2. **Robots, a second time.** A separate per-host list of disallowed paths
   (`/api/`, `/_next/data/`, search queries, tracking parameters), checked on
   its own. Belt and braces against a future regex edit.
3. **Admission, synchronously.** One tab per host. Use a cooldown counted from
   when the previous page *finished*, so a 3-minute check isn't followed by an
   instant request. If a company runs two hosts (`www.` and `global.`), give
   them one lock. Answer `RATE_LIMITED { retryAfterMs }` instead of queueing.
4. **Permission and rest.** `chrome.permissions.contains` for the host, then
   check whether the site is resting (stored per company in
   `chrome.storage.local`).
5. **Daily cap.** Count per host per day in storage. Serialise the
   read-modify-write on a promise chain, or two hosts will lose each other's
   increments.
6. **Open** a background tab. Record its id in `chrome.storage.session` and
   close leftovers on `onStartup` and `onInstalled`, because a killed worker
   would otherwise leave tabs open for ever.
7. **Snapshot** (injected, self-contained, read-only):
   - Read `performance.getEntriesByType('navigation')[0].responseStatus`
     (Chrome 109+).
   - Is the route's **results marker** present? Choose a marker only a results
     page carries. `self.__next_f` is on every Next.js page, check pages
     included; a data key that only results pages embed is better.
   - No marker, and the page mentions captcha or verification, or shows a
     known check element: it's a **check**.
8. **Check → the human.** Bring the tab to the front and poll every 2 s for up
   to 3 minutes. If the visitor finishes, the site may land them elsewhere on
   its host: send the tab back to the asked-for URL **once**. If they close the
   tab or time runs out, rest the site for 30 minutes and fail with a plain
   reason.
9. **Status.** On a 403 or 429, rest and fail. Fail on any other 4xx or 5xx.
10. **Landed URL must equal the asked URL** (`new URL(a).href === new
    URL(b).href`). A redirect to another host: if it looks like a verification
    host, it's a check; otherwise it's `WRONG_PAGE`.
11. **Trim on a detached clone, never by regex over the HTML.** Do this:
    ```js
    const copy = document.documentElement.cloneNode(true);
    copy.querySelectorAll('style, svg, noscript, iframe, link').forEach((n) => n.remove());
    copy.querySelectorAll('script').forEach((n) => {
      if (!(keepScript && n.textContent.includes(keepScript))) n.remove();
    });
    // remove comments with a TreeWalker(NodeFilter.SHOW_COMMENT)
    ```
    A regex trim cuts real cards when a script contains `"<!--"` or `"<svg"`.
    Check the marker again on the trimmed copy. Refuse anything over the size
    cap; never truncate, because a truncated page parses as fewer rows and
    looks like a real answer.
12. **Close the tab** in `finally`, and return `{ url, html }`.

## Things that bit the original project

- **The site gave up before the extension did.** The page load plus a human
  check can take 3.5 minutes, but the site's message timeout was 60 s, so the
  human solved the check into a dead promise. Give the fetch its own longer
  timeout.
- **A wrong results marker hid checks.** The check page had the marker, so it
  was never handed to the visitor.
- **Two legs of the same company blocked each other.** Make the second leg
  wait for the first rather than failing as "busy".
- **A make-only search built a URL with `/null/`.** Validate every parameter
  before building a URL.
