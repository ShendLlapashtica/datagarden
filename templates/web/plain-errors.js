// Every failure a visitor can see is ONE sentence with a next step. No codes.
// Unknown errors say "could not be read", never something untrue about the page.

const PLAIN = [
  [/^PERMISSION_REQUIRED/, (m) => `Allow ${(/allow (\S+)/.exec(m) || [, 'this site'])[1]} first: click the extension icon, then "Enable".`],
  [/^DAILY_CAP/, () => 'Your browser has reached today’s limit for this site. It resets tomorrow.'],
  [/^SOURCE_RESTING/, () => 'Paused for 30 minutes after the site refused or a check was left unfinished.'],
  [/^SOURCE_REFUSED/, () => 'The site turned the request away, so it is paused for 30 minutes.'],
  [/^VERIFICATION_CLOSED/, () => 'The security check tab was closed. Search again whenever you like.'],
  [/^VERIFICATION_REQUIRED/, () => 'The site’s security check was not finished in time. Search again to retry.'],
  [/^WRONG_PAGE|ended on a different page/, () => 'The site sent the tab to a different page, so nothing from it was shown.'],
  [/answered for|answered with/, () => 'The site answered for a different item than the one searched, so nothing was shown.'],
  [/^PAGE_TIMEOUT/, () => 'The site took too long to load.'],
  [/^PAGE_TOO_LARGE/, () => 'The page was unusually large, so it was not read.'],
  [/RATE_LIMITED|busy|Please wait/i, () => 'Busy with another search. Try again in a few seconds.'],
  [/FORBIDDEN_ORIGIN|URL_NOT_ALLOWED|INVALID_PAYLOAD/, () => 'The companion extension refused this request. Reload this page and try again.'],
  [/not installed|did not respond|Empty response/, () => 'The companion extension did not answer. Reload it, then reload this page.'],
  [/cannot express|no (?:make|brand|series) (?:slug|id)|not a (?:series|model)/i, () => 'This site does not list this make or model.'],
  [/challenge page|verification page/, () => 'The site showed a security check instead of results.'],
];

export function plainError(message) {
  const m = String(message || '');
  const hit = PLAIN.find(([re]) => re.test(m));
  return hit ? hit[1](m) : 'This site could not be read this time.';
}
