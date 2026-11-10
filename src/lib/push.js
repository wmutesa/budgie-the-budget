// Notifications on this device, even when Taskie is closed (Web Push).
// Turning them on asks the browser for permission, signs this device up with
// Taskie's server, and from then on reminders, the morning brief and deadline
// heads-ups arrive like any app's. On iPhone and iPad this needs Taskie on the
// Home Screen (Share, Add to Home Screen) first: Safari only allows it there.
import { reactive } from 'vue';

export const push = reactive({ supported: false, on: false, busy: false, note: '' });
const api = async (path, body) => {
  const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
  return j;
};
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

let reg = null;
export async function setupPush() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try { reg = await navigator.serviceWorker.register('/sw.js'); } catch { return; }
  push.supported = 'PushManager' in window && 'Notification' in window;
  if (!push.supported) return;
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  push.on = Boolean(sub) && Notification.permission === 'granted';
  // Keep the server's copy fresh (time zone changes, a new browser profile).
  if (push.on) api('/api/push/subscribe', { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => {});
}

export async function enablePush() {
  push.note = '';
  if (!push.supported) {
    push.note = isIOS() && !standalone() ? 'On iPhone and iPad, Apple only allows notifications for apps on the Home Screen: tap Share, then Add to Home Screen, open Taskie from that icon and turn this on there.' : 'This browser cannot show notifications from Taskie.';
    return false;
  }
  push.busy = true;
  try {
    const p = await Notification.requestPermission();
    if (p !== 'granted') { push.note = 'Notifications are blocked for Taskie. Allow them in the browser’s site settings, then try again.'; return false; }
    reg = reg || await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/key');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(key) });
    await api('/api/push/subscribe', { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    push.on = true;
    return true;
  } catch (e) { push.note = `Notifications could not be turned on (${e.message}).`; return false; } finally { push.busy = false; }
}
export async function disablePush() {
  push.busy = true;
  try {
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
    push.on = false;
  } finally { push.busy = false; }
}
export async function testPush() {
  push.note = '';
  try { const r = await api('/api/push/test', {}); push.note = r.sent ? 'Sent. It should appear in a few seconds.' : 'No device is signed up yet.'; } catch (e) { push.note = e.message; }
}
