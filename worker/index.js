// Budgie's Worker: serves the site and runs the /api routes for personal
// accounts. Sign-in is invite-only and uses passkeys; each person's data is
// one JSON document in D1.
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { fetchFeed } from './ical.js';
import { modelSource, modelResponse } from './models.js';
import { makeDigest, profileFromAccount } from './digest.js';
import { geminiResearch, geminiSplit, geminiVoice, geminiWords, audioTypeOk, checkKey, tidyKey, keyShapeOk } from './gemini.js';

const SESSION_COOKIE = '__Host-budgie_session';
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_DATA_BYTES = 1_500_000;
const RECOVERY_CODES = 8;
const RECOVERY_LINK_MS = 15 * 60 * 1000;
const MAX_FAILED_RECOVERIES = 10; // per network address per hour
const OPEN_PER_HOUR = 120; // sign-in and invite requests per network address per hour
const CALENDAR_PER_HOUR = 60; // calendar imports per person per hour
const DIGESTS_PER_HOUR = 6; // "Generate now" per person per hour
const DIGESTS_KEPT = 30; // editions kept per person
const DIGESTS_LIVE = false; // digests are on hold ("coming soon"): no schedule, no new editions

// ---------- small helpers ----------
const now = () => Date.now();
const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));

const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });
const fail = (status, message) => json({ error: message }, status);

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
const sessionCookie = (value, maxAge) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

// The site's own address decides the passkey domain, so it works on
// workers.dev, a custom domain and localhost without configuration.
const rp = url => ({ rpID: url.hostname, origin: url.origin, rpName: 'Budgie' });

// ---------- recovery codes ----------
// Ten characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXXX-XXXXX.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const raw = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}
const normalizeCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Replace a person's recovery codes and return the new ones (shown once).
async function issueRecoveryCodes(env, userId) {
  const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(userId),
    ...await Promise.all(codes.map(async c => env.DB.prepare('INSERT INTO recovery_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, await sha256(normalizeCode(c)), t))),
  ]);
  return codes;
}

// A simple per-address limit on failed attempts.
async function tooManyAttempts(env, key, max = MAX_FAILED_RECOVERIES) {
  const row = await env.DB.prepare('SELECT count, window_start FROM attempts WHERE key = ?').bind(key).first();
  return Boolean(row && now() - row.window_start < 3600e3 && row.count >= max);
}
async function countFailure(env, key) {
  await env.DB.prepare(
    `INSERT INTO attempts (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN ?2 - window_start > 3600000 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ?2 - window_start > 3600000 THEN ?2 ELSE window_start END`,
  ).bind(key, now()).run();
}

// ---------- digests ----------
// A person can have several digests ("streams"); "main" is written from their
// goals and projects, others from a one-line focus. Everything a digest needs
// (who they are, their goals, their own Gemini key) comes from their account data.
const STREAM = /^[a-z0-9-]{1,40}$/;
async function accountData(env, userId) {
  const row = await env.DB.prepare('SELECT data FROM user_data WHERE user_id = ?').bind(userId).first();
  try { return row ? JSON.parse(row.data) : {}; } catch { return {}; }
}
const streamsOf = data => {
  const list = Array.isArray(data?.digest?.streams) ? data.digest.streams.filter(x => STREAM.test(x?.id || '')) : [];
  return list.some(x => x.id === 'main') ? list : [{ id: 'main', name: 'My brief' }, ...list];
};
async function writeDigestFor(env, userId, data, stream, timeZone) {
  const prev = await env.DB.prepare('SELECT data FROM digest_editions WHERE user_id = ? AND stream = ? ORDER BY id DESC LIMIT 1').bind(userId, stream.id).first();
  const key = tidyKey(data?.digest?.geminiKey);
  const edition = await makeDigest(profileFromAccount(data, stream), prev ? JSON.parse(prev.data) : null, {
    timeZone: timeZone || data?.digest?.timeZone || 'UTC', geminiKey: keyShapeOk(key) ? key : '', research: geminiResearch, name: String(stream.name || 'My brief').slice(0, 60),
  });
  edition.stream = stream.id;
  if (key && !keyShapeOk(key)) edition.researchError = 'the saved Gemini key does not look like an API key; check it in your profile';
  await env.DB.batch([
    env.DB.prepare('INSERT INTO digest_editions (user_id, stream, id, data, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, stream, id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at').bind(userId, stream.id, edition.id, JSON.stringify(edition), now()),
    env.DB.prepare('DELETE FROM digest_editions WHERE user_id = ? AND stream = ? AND id NOT IN (SELECT id FROM digest_editions WHERE user_id = ? AND stream = ? ORDER BY id DESC LIMIT ?)').bind(userId, stream.id, userId, stream.id, DIGESTS_KEPT),
  ]);
  return edition;
}
// Mondays and Thursdays (see wrangler.jsonc): a new edition of every digest
// that is on automatic, for everyone.
async function scheduledDigests(env) {
  const rows = await env.DB.prepare('SELECT user_id, data FROM user_data').all();
  for (const r of (rows.results || []).slice(0, 50)) {
    let data;
    try { data = JSON.parse(r.data); } catch { continue; }
    if (data?.digest?.off) continue;
    for (const st of streamsOf(data).filter(x => x.auto !== false).slice(0, 6)) {
      try { await writeDigestFor(env, r.user_id, data, st); } catch (e) { console.error('digest failed', e?.message); }
    }
  }
}

// ---------- sessions ----------
async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), now()).first();
  return row || null;
}

async function startSession(request, env, userId) {
  const token = randomToken();
  const expires = now() + SESSION_DAYS * 864e5;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(token), userId, now(), expires, (request.headers.get('User-Agent') || '').slice(0, 200)),
  ]);
  return sessionCookie(token, SESSION_DAYS * 86400);
}

async function saveChallenge(env, kind, challenge, data) {
  const id = randomToken(16);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(now()),
    env.DB.prepare('INSERT INTO challenges (id, challenge, kind, data, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, challenge, kind, JSON.stringify(data || {}), now() + CHALLENGE_MS),
  ]);
  return id;
}

// A challenge can be used once.
async function takeChallenge(env, id, kind) {
  if (!id) return null;
  const row = await env.DB.prepare('DELETE FROM challenges WHERE id = ? AND kind = ? AND expires_at > ? RETURNING challenge, data')
    .bind(String(id), kind, now()).first();
  return row ? { challenge: row.challenge, data: JSON.parse(row.data || '{}') } : null;
}

async function findInvite(env, token) {
  if (!token || typeof token !== 'string') return null;
  return env.DB.prepare('SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .bind(await sha256(token), now()).first();
}

// ---------- routes ----------
async function routes(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // Requests that change something must come from this site.
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (origin !== url.origin) return fail(403, 'Wrong origin');
    const sendsBody = method === 'POST' || method === 'PUT' || (method === 'DELETE' && Number(request.headers.get('Content-Length') || 0) > 0);
    if (sendsBody && !(request.headers.get('Content-Type') || '').startsWith('application/json')) return fail(415, 'Send JSON');
  }

  if (path === '/api/me' && method === 'GET') {
    const user = await currentUser(request, env);
    return user ? json({ user }) : fail(401, 'Not signed in');
  }

  // Endpoints that work without signing in are limited per network address,
  // so nobody can flood the database with challenges or guess at invites.
  const OPEN = ['/api/invite', '/api/register/options', '/api/register/verify', '/api/login/options', '/api/login/verify'];
  if (OPEN.includes(path) && method === 'POST') {
    const key = `open:${request.headers.get('CF-Connecting-IP') || 'local'}`;
    if (await tooManyAttempts(env, key, OPEN_PER_HOUR)) return fail(429, 'Too many tries from this network. Wait a while and try again.');
    await countFailure(env, key);
  }

  // --- invites: check, then register a passkey ---
  if (path === '/api/invite' && method === 'POST') {
    const invite = await findInvite(env, (await body(request)).token);
    if (!invite) return fail(404, 'This invite link is not valid. It may have expired or been used already.');
    return json({ name: invite.name, addsDevice: Boolean(invite.user_id), role: invite.role });
  }

  if (path === '/api/register/options' && method === 'POST') {
    const { token } = await body(request);
    const invite = await findInvite(env, token);
    if (!invite) return fail(404, 'This invite link is not valid. It may have expired or been used already.');
    const { rpID, rpName } = rp(url);
    const userId = invite.user_id || crypto.randomUUID();
    const existing = invite.user_id
      ? (await env.DB.prepare('SELECT id, transports FROM credentials WHERE user_id = ?').bind(userId).all()).results
      : [];
    const options = await generateRegistrationOptions({
      rpName, rpID,
      userID: enc.encode(userId),
      userName: invite.name,
      userDisplayName: invite.name,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    const challengeId = await saveChallenge(env, 'register', options.challenge, { inviteId: invite.id, userId });
    return json({ challengeId, options });
  }

  if (path === '/api/register/verify' && method === 'POST') {
    const { challengeId, response, token } = await body(request);
    const saved = await takeChallenge(env, challengeId, 'register');
    if (!saved) return fail(400, 'That took too long. Try again.');
    const invite = await findInvite(env, token);
    if (!invite || invite.id !== saved.data.inviteId) return fail(404, 'This invite link is not valid any more.');
    const { rpID, origin } = rp(url);
    let result;
    try {
      result = await verifyRegistrationResponse({ response, expectedChallenge: saved.challenge, expectedOrigin: origin, expectedRPID: rpID });
    } catch (e) {
      return fail(400, `The passkey could not be checked: ${e.message}`);
    }
    if (!result.verified) return fail(400, 'The passkey could not be checked.');
    const { credential } = result.registrationInfo;
    const userId = saved.data.userId;
    const t = now();
    const label = (request.headers.get('User-Agent') || '').match(/iPhone|iPad|Android|Mac|Windows|Linux/)?.[0] || 'Passkey';
    const statements = [];
    if (!invite.user_id) {
      statements.push(env.DB.prepare('INSERT INTO users (id, name, role, created_at) VALUES (?, ?, ?, ?)').bind(userId, invite.name, invite.role, t));
    }
    statements.push(
      env.DB.prepare('INSERT INTO credentials (id, user_id, public_key, counter, transports, label, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(credential.id, userId, b64url(credential.publicKey), credential.counter || 0, JSON.stringify(credential.transports || []), label, t, t),
      env.DB.prepare('UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(t, invite.id),
    );
    await env.DB.batch(statements);
    const cookie = await startSession(request, env, userId);
    const user = await env.DB.prepare('SELECT id, name, role FROM users WHERE id = ?').bind(userId).first();
    // New people get recovery codes straight away; so does anyone who has none left.
    const left = (await env.DB.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').bind(userId).first()).n;
    const recoveryCodes = !invite.user_id || left === 0 ? await issueRecoveryCodes(env, userId) : null;
    return json({ user, recoveryCodes }, 200, { 'Set-Cookie': cookie });
  }

  // --- lost every passkey: a recovery code gives a short link to add a new one ---
  if (path === '/api/recover' && method === 'POST') {
    const key = `recover:${request.headers.get('CF-Connecting-IP') || 'local'}`;
    if (await tooManyAttempts(env, key)) return fail(429, 'Too many tries. Wait an hour and try again.');
    const code = normalizeCode((await body(request)).code);
    const row = code.length === 10
      ? await env.DB.prepare(
        `UPDATE recovery_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL
         RETURNING user_id`,
      ).bind(now(), await sha256(code)).first()
      : null;
    if (!row) {
      await countFailure(env, key);
      return fail(401, 'That recovery code is not valid or has been used.');
    }
    const user = await env.DB.prepare('SELECT id, name, role FROM users WHERE id = ?').bind(row.user_id).first();
    const token = randomToken();
    await env.DB.prepare('INSERT INTO invites (id, token_hash, name, role, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), await sha256(token), user.name, user.role, user.id, user.id, now(), now() + RECOVERY_LINK_MS).run();
    const left = (await env.DB.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').bind(user.id).first()).n;
    return json({ token, name: user.name, role: user.role, codesLeft: left });
  }

  // --- sign in with a passkey ---
  if (path === '/api/login/options' && method === 'POST') {
    const { rpID } = rp(url);
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
    const challengeId = await saveChallenge(env, 'login', options.challenge);
    return json({ challengeId, options });
  }

  if (path === '/api/login/verify' && method === 'POST') {
    const { challengeId, response } = await body(request);
    const saved = await takeChallenge(env, challengeId, 'login');
    if (!saved) return fail(400, 'That took too long. Try again.');
    const cred = response?.id ? await env.DB.prepare('SELECT * FROM credentials WHERE id = ?').bind(String(response.id)).first() : null;
    if (!cred) return fail(401, 'This passkey is not registered with Budgie. Ask for an invite.');
    const { rpID, origin } = rp(url);
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response, expectedChallenge: saved.challenge, expectedOrigin: origin, expectedRPID: rpID,
        credential: { id: cred.id, publicKey: fromB64url(cred.public_key), counter: cred.counter, transports: cred.transports ? JSON.parse(cred.transports) : undefined },
      });
    } catch (e) {
      return fail(401, `The passkey could not be checked: ${e.message}`);
    }
    if (!result.verified) return fail(401, 'The passkey could not be checked.');
    await env.DB.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?').bind(result.authenticationInfo.newCounter, now(), cred.id).run();
    const cookie = await startSession(request, env, cred.user_id);
    const user = await env.DB.prepare('SELECT id, name, role FROM users WHERE id = ?').bind(cred.user_id).first();
    return json({ user }, 200, { 'Set-Cookie': cookie });
  }

  if (path === '/api/logout' && method === 'POST') {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  // Everything below needs a signed-in person.
  const user = await currentUser(request, env);
  if (!user) return fail(401, 'Not signed in');

  // Sign out on every device, including this one.
  if (path === '/api/sessions' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  // Delete my account and all my data. The owner cannot, so Budgie is never left without one.
  if (path === '/api/me' && method === 'DELETE') {
    if (user.role === 'owner') return fail(400, 'The owner account cannot be deleted from the app.');
    const { confirm } = await body(request).catch(() => ({}));
    if (confirm !== 'DELETE') return fail(400, 'Type DELETE to confirm.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM credentials WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM invites WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM user_data WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM digest_editions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(user.id),
      env.DB.prepare("DELETE FROM users WHERE id = ? AND role <> 'owner'").bind(user.id),
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  // --- synced data ---
  if (path === '/api/data' && method === 'GET') {
    const row = await env.DB.prepare('SELECT data, version, updated_at FROM user_data WHERE user_id = ?').bind(user.id).first();
    return json(row ? { data: JSON.parse(row.data), version: row.version, updatedAt: row.updated_at } : { data: null, version: 0 });
  }

  if (path === '/api/data' && method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_DATA_BYTES) return fail(413, 'Your data is too large to sync.');
    let payload;
    try { payload = JSON.parse(text); } catch { return fail(400, 'Send JSON'); }
    if (!payload || typeof payload.data !== 'object' || payload.data === null) return fail(400, 'Missing data');
    const base = Number(payload.version) || 0;
    const next = base + 1;
    const t = now();
    // Only write if nobody else wrote since this device last read.
    const res = base === 0
      ? await env.DB.prepare('INSERT INTO user_data (user_id, data, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING')
        .bind(user.id, JSON.stringify(payload.data), t).run()
      : await env.DB.prepare('UPDATE user_data SET data = ?, version = ?, updated_at = ? WHERE user_id = ? AND version = ?')
        .bind(JSON.stringify(payload.data), next, t, user.id, base).run();
    if (!res.meta.changes) {
      const row = await env.DB.prepare('SELECT data, version, updated_at FROM user_data WHERE user_id = ?').bind(user.id).first();
      return json({ error: 'Changed on another device', data: row ? JSON.parse(row.data) : null, version: row?.version || 0 }, 409);
    }
    return json({ version: base === 0 ? 1 : next, updatedAt: t });
  }

  // --- AI model files, through Budgie's own address (see models.js) ---
  if (path.startsWith('/api/model/') && (method === 'GET' || method === 'HEAD')) {
    const source = modelSource(path);
    return source ? modelResponse(request, source) : fail(404, 'Not found');
  }

  // --- digests: list, read, write now, remove ---
  if (path === '/api/digests' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT stream, id, data FROM digest_editions WHERE user_id = ? ORDER BY id DESC LIMIT 200').bind(user.id).all();
    const editions = {};
    for (const r of rows.results || []) {
      const d = JSON.parse(r.data);
      (editions[r.stream] ||= []).push({ id: r.id, edition: d.edition, dateLong: d.dateLong, preheader: d.preheader, createdAt: d.createdAt });
    }
    return json({ editions });
  }
  const one = path.match(/^\/api\/digests\/([a-z0-9-]{1,40})\/(\d{4}-\d{2}-\d{2})$/);
  if (one && method === 'GET') {
    const row = await env.DB.prepare('SELECT data FROM digest_editions WHERE user_id = ? AND stream = ? AND id = ?').bind(user.id, one[1], one[2]).first();
    return row ? json(JSON.parse(row.data)) : fail(404, 'No such edition');
  }
  if (path === '/api/digests' && method === 'POST' && !DIGESTS_LIVE) return fail(503, 'Digests are coming soon.');
  if (path === '/api/digests' && method === 'POST') {
    const key = `digest:${user.id}`;
    if (await tooManyAttempts(env, key, DIGESTS_PER_HOUR)) return fail(429, 'Several digests were written this hour. The next one comes on schedule.');
    await countFailure(env, key);
    const { stream, timeZone } = await body(request);
    if (!stream || !STREAM.test(stream.id || '')) return fail(400, 'Which digest?');
    const data = await accountData(env, user.id);
    const st = { id: stream.id, name: String(stream.name || '').slice(0, 60), focus: String(stream.focus || '').slice(0, 120) };
    return json(await writeDigestFor(env, user.id, data, st, typeof timeZone === 'string' ? timeZone.slice(0, 60) : ''));
  }
  // Break a recording into planner items with the person's own Gemini key (kept in their data, sent only to Google).
  if (path === '/api/gemini/breakdown' && method === 'POST') {
    const data = await accountData(env, user.id);
    const gkey = tidyKey(data?.digest?.geminiKey);
    if (!keyShapeOk(gkey)) return fail(404, 'No Gemini key saved.');
    const key = `gemini-split:${user.id}`;
    if (await tooManyAttempts(env, key, 120)) return fail(429, 'Many breakdowns this hour. Budgie used its own rules instead.');
    await countFailure(env, key);
    const { text, today, weekday, timeZone, categories, hints, existing } = await body(request);
    const strings = (list, n, len) => (Array.isArray(list) ? list.filter(x => typeof x === 'string').slice(0, n).map(x => x.replace(/[<>\n]/g, ' ').slice(0, len).trim()).filter(Boolean) : []);
    const said = String(text || '').slice(0, 12000);
    if (!said.trim()) return fail(400, 'Nothing to break down.');
    try {
      return json({ items: await geminiSplit(gkey, { text: said, today: /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toISOString().slice(0, 10), weekday: String(weekday || '').slice(0, 12), timeZone: String(timeZone || '').slice(0, 60), categories: strings(categories, 60, 40), hints: strings(hints, 200, 160), existing: strings(existing, 120, 80) }) });
    } catch (e) { return fail(502, String(e?.message || 'Gemini could not be reached.').slice(0, 200)); }
  }
  // Live words while recording: one short piece of audio (16 kHz WAV) at a time.
  // Cloudflare's Whisper first (free, no key); the person's Gemini key otherwise.
  if (path === '/api/voice/live' && method === 'POST') {
    const key = `voice-live:${user.id}`;
    if (await tooManyAttempts(env, key, 2000)) return fail(429, 'A lot of talking this hour. Live words pause; Stop still works.');
    await countFailure(env, key);
    const { audio, prompt } = await body(request);
    if (typeof audio !== 'string' || !audio || audio.length > 3 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 200))) return fail(400, 'That piece of audio could not be read.');
    const before = String(prompt || '').replace(/[<>\n]/g, ' ').slice(-200);
    // Whisper sometimes "hears" these in silence.
    const ghost = t => /^(?:thank you\.?|thanks for watching!?|you|bye\.?|\.+|\s*)$/i.test(t.trim());
    let lastErr = '';
    if (env.AI) {
      try {
        const out = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio, vad_filter: true, ...(before ? { initial_prompt: before } : {}) });
        const text = String(out?.text || '').trim();
        return json({ text: ghost(text) ? '' : text, via: 'whisper' });
      } catch (e) { lastErr = String(e?.message || e).slice(0, 160); }
    }
    const data = await accountData(env, user.id);
    const gkey = tidyKey(data?.digest?.geminiKey);
    if (keyShapeOk(gkey)) {
      try { const text = await geminiWords(gkey, { audio, prompt: before }); return json({ text: ghost(text) ? '' : text, via: 'gemini' }); } catch (e) { lastErr = String(e?.message || e).slice(0, 160); }
    }
    return fail(503, lastErr ? `Live words are not available right now (${lastErr}).` : 'Live words are not available right now.');
  }
  // Hear a recording with the person's own Gemini key: what was said, word for word, and every item in it.
  if (path === '/api/gemini/voice' && method === 'POST') {
    const data = await accountData(env, user.id);
    const gkey = tidyKey(data?.digest?.geminiKey);
    if (!keyShapeOk(gkey)) return fail(404, 'No Gemini key saved.');
    if (data?.planner?.geminiAudio === false) return fail(403, 'Sending recordings to Gemini is turned off.');
    const key = `gemini-voice:${user.id}`;
    if (await tooManyAttempts(env, key, 60)) return fail(429, 'Many recordings this hour. Budgie used the live text instead.');
    await countFailure(env, key);
    const { audio, mime, typed, today, weekday, timeZone, categories, existing } = await body(request);
    if (typeof audio !== 'string' || !audio || audio.length > 18 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 200))) return fail(400, 'That recording could not be read.');
    if (!audioTypeOk(mime)) return fail(400, 'That kind of recording is not supported.');
    const strings = (list, n, len) => (Array.isArray(list) ? list.filter(x => typeof x === 'string').slice(0, n).map(x => x.replace(/[<>\n]/g, ' ').slice(0, len).trim()).filter(Boolean) : []);
    try {
      return json(await geminiVoice(gkey, { audio, mime, typed: String(typed || '').slice(0, 6000), today: /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toISOString().slice(0, 10), weekday: String(weekday || '').slice(0, 12), timeZone: String(timeZone || '').slice(0, 60), categories: strings(categories, 60, 40), existing: strings(existing, 120, 80) }));
    } catch (e) { return fail(502, String(e?.message || 'Gemini could not be reached.').slice(0, 200)); }
  }
  if (path === '/api/gemini/check' && method === 'POST') {
    const key = `gemini-check:${user.id}`;
    if (await tooManyAttempts(env, key, 20)) return fail(429, 'Too many checks this hour. Try again later.');
    await countFailure(env, key);
    try { return json(await checkKey((await body(request)).key)); } catch { return json({ ok: false, message: 'Google could not be reached. Try again in a minute.' }); }
  }
  const gone = path.match(/^\/api\/digests\/([a-z0-9-]{1,40})$/);
  if (gone && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM digest_editions WHERE user_id = ? AND stream = ?').bind(user.id, gone[1]).run();
    return json({ ok: true });
  }

  // --- calendar import for the Planner: the link stays in the person's data; it is never logged ---
  if (path === '/api/calendar' && method === 'POST') {
    const key = `cal:${user.id}`;
    if (await tooManyAttempts(env, key, CALENDAR_PER_HOUR)) return fail(429, 'Too many calendar updates. Try again in an hour.');
    await countFailure(env, key);
    const { url: link } = await body(request);
    try {
      return json(await fetchFeed(link));
    } catch (e) {
      // Our own messages are plain words; network failures get a general one.
      if (e.name === 'TimeoutError' || e instanceof TypeError) return fail(502, 'The calendar could not be reached. Check the link and try again.');
      return fail(e.status || 400, String(e.message || 'The calendar could not be read.'));
    }
  }

  // --- recovery codes ---
  if (path === '/api/recovery-codes' && method === 'GET') {
    const left = (await env.DB.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').bind(user.id).first()).n;
    return json({ left });
  }
  if (path === '/api/recovery-codes' && method === 'POST') {
    return json({ recoveryCodes: await issueRecoveryCodes(env, user.id) });
  }
  // Someone who relies on synced passkeys can turn codes off; unseen codes should not stay valid.
  if (path === '/api/recovery-codes' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(user.id).run();
    return json({ left: 0 });
  }

  // --- your devices ---
  if (path === '/api/passkeys' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, label, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at').bind(user.id).all();
    return json({ passkeys: results });
  }

  // A one-time link for adding this account to another device.
  if (path === '/api/devices/link' && method === 'POST') {
    const token = randomToken();
    await env.DB.prepare('INSERT INTO invites (id, token_hash, name, role, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), await sha256(token), user.name, user.role, user.id, user.id, now(), now() + 864e5).run();
    return json({ link: `${url.origin}/invite#${token}`, expiresInHours: 24 });
  }

  const passkey = path.match(/^\/api\/passkeys\/([\w-]+)$/);
  if (passkey && method === 'DELETE') {
    const { results } = await env.DB.prepare('SELECT id FROM credentials WHERE user_id = ?').bind(user.id).all();
    if (results.length <= 1) return fail(400, 'You need at least one passkey to sign in.');
    await env.DB.prepare('DELETE FROM credentials WHERE id = ? AND user_id = ?').bind(passkey[1], user.id).run();
    return json({ ok: true });
  }

  // --- people (owner only) ---
  if (path.startsWith('/api/people') || path.startsWith('/api/invites')) {
    if (user.role !== 'owner') return fail(403, 'Only the owner can manage people.');

    if (path === '/api/people' && method === 'GET') {
      const people = (await env.DB.prepare(
        `SELECT u.id, u.name, u.role, u.created_at,
          (SELECT COUNT(*) FROM credentials c WHERE c.user_id = u.id) AS passkeys,
          (SELECT MAX(last_used_at) FROM credentials c WHERE c.user_id = u.id) AS last_seen
         FROM users u ORDER BY u.created_at`,
      ).all()).results;
      const invites = (await env.DB.prepare('SELECT id, name, created_at, expires_at FROM invites WHERE used_at IS NULL AND user_id IS NULL AND expires_at > ? ORDER BY created_at DESC').bind(now()).all()).results;
      return json({ people, invites });
    }

    if (path === '/api/invites' && method === 'POST') {
      const name = String((await body(request)).name || '').trim().slice(0, 60);
      if (!name) return fail(400, 'Add a name for the person you are inviting.');
      const token = randomToken();
      await env.DB.prepare('INSERT INTO invites (id, token_hash, name, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), await sha256(token), name, 'member', user.id, now(), now() + INVITE_DAYS * 864e5).run();
      return json({ link: `${url.origin}/invite#${token}`, expiresInDays: INVITE_DAYS });
    }

    const inv = path.match(/^\/api\/invites\/([\w-]+)$/);
    if (inv && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM invites WHERE id = ? AND used_at IS NULL').bind(inv[1]).run();
      return json({ ok: true });
    }

    const person = path.match(/^\/api\/people\/([\w-]+)$/);
    if (person && method === 'DELETE') {
      if (person[1] === user.id) return fail(400, 'You cannot remove yourself.');
      const id = person[1];
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
        env.DB.prepare('DELETE FROM credentials WHERE user_id = ?').bind(id),
        env.DB.prepare('DELETE FROM invites WHERE user_id = ?').bind(id),
        env.DB.prepare('DELETE FROM user_data WHERE user_id = ?').bind(id),
        env.DB.prepare('DELETE FROM digest_editions WHERE user_id = ?').bind(id),
        env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(id),
        env.DB.prepare("DELETE FROM users WHERE id = ? AND role <> 'owner'").bind(id),
      ]);
      return json({ ok: true });
    }
  }

  return fail(404, 'Not found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await routes(request, env, url);
      } catch (e) {
        console.error(e);
        return fail(500, 'Something went wrong. Try again.');
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    if (DIGESTS_LIVE) ctx.waitUntil(scheduledDigests(env));
  },
};
