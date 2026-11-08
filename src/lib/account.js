// Personal accounts: sign-in with passkeys, invites, and syncing each person's
// data to their account. The server side is worker/index.js.
import { reactive, watch } from 'vue';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { snapshot, applySnapshot, openLocal, readLegacy, clearLegacy, clearLocal } from './store';

const USER_KEY = 'budgie.user';
const pendingKey = id => `budgie.pending:${id}`;

export const account = reactive({
  status: 'loading',        // loading | signed-out | signed-in
  user: null,               // { id, name, role }
  offline: false,           // signed in from this device's copy while the server is unreachable
  sync: 'idle',             // idle | saving | saved | offline | error
  syncedAt: null,
  note: '',                 // a short message, such as "Updated from another device"
  invite: null,             // { token, name, addsDevice } when opened from an invite link
  recoveryCodes: null,      // new codes to show once after joining
});
export const canUsePasskeys = () => browserSupportsWebAuthn();

// ---------- requests ----------
class ApiError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data);
  return data;
}
const isNetworkError = e => !(e instanceof ApiError);

// ---------- local helpers ----------
const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

// ---------- syncing ----------
let version = 0;
let lastSent = '';
let timer = null;
let stopWatch = null;

function setPending(on) {
  if (!account.user) return;
  write(pendingKey(account.user.id), on ? { version } : null);
}

async function push() {
  if (!account.user) return;
  const data = snapshot();
  const text = JSON.stringify(data);
  if (text === lastSent) return;
  account.sync = 'saving';
  try {
    const res = await api('/api/data', { method: 'PUT', body: { data, version } });
    version = res.version;
    lastSent = text;
    account.sync = 'saved';
    account.syncedAt = Date.now();
    account.offline = false;
    setPending(false);
  } catch (e) {
    if (e.status === 409 && e.body?.data) {
      // Another device saved first: show its version.
      version = e.body.version;
      lastSent = JSON.stringify(e.body.data);
      applySnapshot(e.body.data);
      account.sync = 'saved';
      account.note = 'Updated with changes from another device.';
      setPending(false);
    } else if (e.status === 401) {
      signedOutLocally();
    } else {
      account.sync = isNetworkError(e) ? 'offline' : 'error';
      setPending(true);
    }
  }
}

function watchChanges() {
  stopWatch?.();
  stopWatch = watch(snapshot, () => {
    clearTimeout(timer);
    timer = setTimeout(push, 1200);
  }, { deep: true });
}

// Load the person's data: this device's copy first, then the server's.
async function openData(user) {
  const local = openLocal(user.id);
  if (local) { applySnapshot(local); account.status = 'signed-in'; } // open instantly from this device's copy
  const pending = read(pendingKey(user.id));
  try {
    const remote = await api('/api/data');
    if (remote.data) {
      if (pending && local && pending.version === remote.version) {
        // Changes made offline on this device, and nothing newer on the server.
        version = remote.version;
        lastSent = '';
        applySnapshot(local);
        await push();
      } else {
        version = remote.version;
        applySnapshot(remote.data);
        lastSent = JSON.stringify(snapshot());
        setPending(false);
      }
    } else {
      // First sign-in: start from this device's data if there is any.
      const legacy = readLegacy();
      applySnapshot(local || legacy || snapshot());
      version = 0;
      lastSent = '';
      await push();
      if (legacy && account.sync === 'saved') clearLegacy();
    }
    account.sync = account.sync === 'saving' ? 'saving' : 'saved';
    account.syncedAt = Date.now();
  } catch (e) {
    if (e.status === 401) return signedOutLocally();
    if (!local) applySnapshot({});
    account.offline = true;
    account.sync = 'offline';
  }
  account.status = 'signed-in';
  watchChanges();
}

async function becomeSignedIn(user) {
  account.user = user;
  write(USER_KEY, user);
  await openData(user);
}

function signedOutLocally() {
  stopWatch?.();
  clearTimeout(timer);
  openLocal(null);
  account.user = null;
  account.status = 'signed-out';
  account.offline = false;
  account.sync = 'idle';
  write(USER_KEY, null);
  applySnapshot({});
}

// ---------- start ----------
export async function startAccount() {
  const fromUrl = inviteToken(location.href);
  if (fromUrl) {
    history.replaceState(null, '', '/');
    await openInvite(fromUrl).catch(() => {});
  }
  try {
    const { user } = await api('/api/me');
    account.invite = null; // already signed in on this device
    await becomeSignedIn(user);
  } catch (e) {
    const cached = read(USER_KEY);
    if (isNetworkError(e) && cached) {
      // No connection: open this device's copy and sync when back online.
      account.user = cached;
      account.status = 'signed-in';
      account.offline = true;
      account.sync = 'offline';
      const local = openLocal(cached.id);
      if (local) applySnapshot(local);
      watchChanges();
    } else {
      signedOutLocally();
    }
  }
  if (!listening) {
    listening = true;
    window.addEventListener('online', () => { if (account.user) (account.offline ? startAccount() : push()); });
  }
}
let listening = false;

// ---------- invites ----------
// Finds the invite code in a link or pasted text: /invite#CODE, /invite/#CODE,
// ?invite=CODE, #invite=CODE, or just the code itself.
export function inviteToken(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let url = null;
  try { url = new URL(s, location.origin); } catch { /* not a link */ }
  if (url && /^https?:/.test(s)) {
    const q = url.searchParams.get('invite');
    if (q) return q;
    const h = decodeURIComponent(url.hash.replace(/^#/, ''));
    if (h.startsWith('invite=')) return h.slice(7);
    if (/^\/invite\/?$/.test(url.pathname) && h) return h;
    return null;
  }
  if (location.href === s) return null;
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}

// Check an invite code with the server and switch the sign-in screen to it.
export async function openInvite(token) {
  try {
    const info = await api('/api/invite', { method: 'POST', body: { token } });
    account.invite = { token, ...info };
  } catch (e) {
    account.invite = { token: null, error: e.message };
    throw e;
  }
}

// ---------- sign-in ----------
export async function registerWithInvite() {
  const token = account.invite?.token;
  if (!token) throw new Error('This invite link is not valid.');
  const { challengeId, options } = await api('/api/register/options', { method: 'POST', body: { token } });
  const response = await startRegistration({ optionsJSON: options });
  const { user, recoveryCodes } = await api('/api/register/verify', { method: 'POST', body: { challengeId, response, token } });
  account.invite = null;
  account.recoveryCodes = recoveryCodes || null;
  stopWatch?.();
  await becomeSignedIn(user);
}

export async function signIn() {
  const { challengeId, options } = await api('/api/login/options', { method: 'POST', body: {} });
  const response = await startAuthentication({ optionsJSON: options });
  const { user } = await api('/api/login/verify', { method: 'POST', body: { challengeId, response } });
  await becomeSignedIn(user);
}

export async function signOut() {
  clearTimeout(timer);
  await push().catch(() => {});
  const id = account.user?.id;
  try { await api('/api/logout', { method: 'POST', body: {} }); } catch { /* signed out locally anyway */ }
  if (id && !read(pendingKey(id))) clearLocal(id); // keep unsynced changes so they are not lost
  signedOutLocally();
}

// Friendly text for errors from the browser's passkey prompt.
export function passkeyError(e) {
  if (e?.name === 'NotAllowedError') return 'The passkey prompt was closed or timed out.';
  if (e?.name === 'InvalidStateError') return 'This device already has a passkey for Budgie. Sign in instead.';
  return e?.message || 'Something went wrong.';
}

// ---------- devices and people ----------
// Lost every passkey: trade a recovery code for a short link to add one on this device.
export async function recoverWithCode(code) {
  const r = await api('/api/recover', { method: 'POST', body: { code } });
  account.invite = { token: r.token, name: r.name, role: r.role, addsDevice: true, recovered: true, codesLeft: r.codesLeft };
}
export const recoveryStatus = () => api('/api/recovery-codes');
export const newRecoveryCodes = () => api('/api/recovery-codes', { method: 'POST', body: {} });
export const dropRecoveryCodes = () => api('/api/recovery-codes', { method: 'DELETE' });
export async function signOutEverywhere() {
  await push().catch(() => {});
  const id = account.user?.id;
  await api('/api/sessions', { method: 'DELETE' });
  if (id && !read(pendingKey(id))) clearLocal(id);
  signedOutLocally();
}
export async function deleteMyAccount() {
  const id = account.user?.id;
  await api('/api/me', { method: 'DELETE', body: { confirm: 'DELETE' } });
  if (id) { clearLocal(id); write(pendingKey(id), null); }
  signedOutLocally();
}
export const listPasskeys = () => api('/api/passkeys');
export const removePasskey = id => api(`/api/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const deviceLink = () => api('/api/devices/link', { method: 'POST', body: {} });
export const listPeople = () => api('/api/people');
export const invitePerson = name => api('/api/invites', { method: 'POST', body: { name } });
export const cancelInvite = id => api(`/api/invites/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const removePerson = id => api(`/api/people/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const readCalendar = url => api('/api/calendar', { method: 'POST', body: { url } });
// Save now (for example before the server writes a digest from your account data).
export async function saveNow() { clearTimeout(timer); await push(); }
export const readDigests = () => api('/api/digests');
export const readDigest = (stream, id) => api(`/api/digests/${encodeURIComponent(stream)}/${encodeURIComponent(id)}`);
export const writeDigest = (stream, timeZone) => api('/api/digests', { method: 'POST', body: { stream, timeZone } });
export const checkGeminiKey = key => api('/api/gemini/check', { method: 'POST', body: { key } });
// Gemini (the person's own key, kept server-side) breaks a recording into planner items.
// Gemini hears a recording (base64 audio) and returns { transcript, items }.
export const geminiHear = payload => api('/api/gemini/voice', { method: 'POST', body: payload });
// Live words: one short piece of a recording, written down by Budgie's server.
export const liveWords = (audio, prompt) => api('/api/voice/live', { method: 'POST', body: { audio, prompt } }).then(r => r.text || '');
export const geminiBreakdown = (text, today, weekday, timeZone, categories = [], hints = [], existing = []) => api('/api/gemini/breakdown', { method: 'POST', body: { text, today, weekday, timeZone, categories, hints, existing } });
export const dropDigest = stream => api(`/api/digests/${encodeURIComponent(stream)}`, { method: 'DELETE' });
