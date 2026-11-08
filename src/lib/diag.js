// Diagnostics for the Add card: a short trail of what happened (opened,
// microphone asked, started, levels, closed and from where), sent to Budgie's
// server so a problem on one device can be traced. It never holds the words
// you said: only counts, lengths, states and error names.
const events = [];
let sent = 0;
let timer = null;
const t0 = Date.now();

export function diag(what, detail = {}) {
  events.push({ t: Date.now() - t0, what, ...detail });
  if (events.length > 400) events.splice(0, events.length - 400);
  clearTimeout(timer);
  timer = setTimeout(flush, 2500);
}
// Where a call came from (for "who closed the card").
export const from = () => (new Error().stack || '').split('\n').slice(2, 7).map(s => s.trim()).join(' | ').slice(0, 600);

export function flush(beacon = false) {
  if (events.length <= sent) return;
  const batch = events.slice(sent);
  sent = events.length;
  const payload = JSON.stringify({ events: batch, ua: navigator.userAgent, build: document.querySelector('script[type="module"][src*="assets/"]')?.getAttribute('src') || '' });
  try {
    if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/diag', new Blob([payload], { type: 'application/json' }));
    else fetch('/api/diag', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  } catch { /* never in the way */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', e => diag('window-error', { msg: String(e.message).slice(0, 300), at: `${e.filename}:${e.lineno}:${e.colno}` }));
  window.addEventListener('unhandledrejection', e => diag('unhandled', { msg: String(e.reason?.message || e.reason).slice(0, 300), stack: String(e.reason?.stack || '').slice(0, 500) }));
  document.addEventListener('visibilitychange', () => { diag('visibility', { state: document.visibilityState }); if (document.visibilityState === 'hidden') flush(true); });
  window.addEventListener('pagehide', () => flush(true));
}
