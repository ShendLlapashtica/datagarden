// The site's side of the extension: one place that talks to it.
//
//   extensionStatus() -> { state: 'unsupported' | 'missing' | 'outdated' | 'no_answer' | 'ready', version? }
//   sendToExtension(message, { timeoutMs })
//
// Real Chrome exposes NO chrome.runtime to a page unless an installed extension
// lists the page's origin in externally_connectable. So "not installed" on
// desktop Chrome usually looks like window.chrome present, chrome.runtime absent.

export const EXTENSION_ID = 'REPLACE_WITH_YOUR_EXTENSION_ID';
export const MIN_VERSION = '1.0.0';
const DEFAULT_TIMEOUT_MS = 60000;

export function sendToExtension(message, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return reject(new Error('Companion extension not installed'));
    }
    const timer = setTimeout(() => reject(new Error('Companion extension did not respond')), timeoutMs);
    try {
      chrome.runtime.sendMessage(EXTENSION_ID, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(response ?? { status: 'ERROR', error: 'Empty response from extension' });
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

function isDesktopChromium() {
  if (typeof window === 'undefined' || !window.chrome) return false;
  const uad = typeof navigator !== 'undefined' ? navigator.userAgentData : null;
  if (uad && typeof uad.mobile === 'boolean') return !uad.mobile;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /Chrome\//.test(ua) && !/Mobile|Android|CriOS/.test(ua);
}

const older = (v, min) => {
  const a = String(v).split('.').map(Number);
  const b = String(min).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
};

async function probe() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return { state: isDesktopChromium() ? 'missing' : 'unsupported' };
  }
  try {
    const r = await sendToExtension({ type: 'PING' }, { timeoutMs: 2500 });
    if (r?.status !== 'SUCCESS') return { state: 'outdated' };
    return { state: older(r.version, MIN_VERSION) ? 'outdated' : 'ready', version: r.version };
  } catch (err) {
    if (/receiving end does not exist|could not establish/i.test(err.message)) return { state: 'missing' };
    if (/port closed/i.test(err.message)) return { state: 'outdated' };   // a build without PING
    return { state: 'no_answer' };                                        // a sleeping worker
  }
}

let statusPromise = null;
/** Probed once per page load; `no_answer` is not cached, so the next search asks again. */
export function extensionStatus() {
  if (!statusPromise) {
    statusPromise = probe().then((s) => {
      if (s.state === 'no_answer') statusPromise = null;
      return s;
    });
  }
  return statusPromise;
}
