// Budgie's Worker: serves the site and runs the /api routes for personal
// accounts. Sign-in is invite-only and uses passkeys; each person's data is
// one JSON document in D1.
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { fetchFeed } from './ical.js';
import { modelSource, modelResponse } from './models.js';

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

// ---------- markets and news (Yahoo Finance) ----------
// Fetched here because Yahoo does not allow browsers to call it directly.
// Cached for 15 minutes so Budgie asks Yahoo rarely.
const MARKET_TTL = 15 * 60;
const INDEXES = [
  ['^GSPC', 'S&P 500', 'The 500 largest US companies'],
  ['^IXIC', 'Nasdaq', 'US tech-heavy index'],
  ['^DJI', 'Dow Jones', '30 large US companies'],
  ['^TNX', '10-year Treasury yield', 'What the US government pays to borrow; moves mortgage and savings rates'],
  ['GC=F', 'Gold', 'Often rises when markets are nervous'],
  ['BTC-USD', 'Bitcoin', 'Very volatile'],
];
const WATCH = [
  ['VTI', 'US stock market', 'One fund that owns almost every US company'],
  ['VXUS', 'International stocks', 'Companies outside the US'],
  ['EEM', 'Emerging markets', 'Faster-growing economies such as India, Brazil and Taiwan; higher risk'],
  ['QQQ', 'Tech leaders', 'The 100 largest Nasdaq companies'],
  ['VNQ', 'Real estate', 'Property companies that pay rent-based dividends'],
  ['BND', 'Bonds', 'Steadier, lower growth; balances stocks'],
];
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Budgie/1.0)', Accept: 'application/json,text/xml;q=0.9,*/*;q=0.8' };

async function yahooChart(symbol, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, cf: { cacheTtl: MARKET_TTL } });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const closes = (r?.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number');
  if (!closes.length) throw new Error('no data');
  const price = r.meta?.regularMarketPrice ?? closes[closes.length - 1];
  const prev = r.meta?.chartPreviousClose ?? closes[0];
  return { closes, price, prev, currency: r.meta?.currency || 'USD' };
}
const pctChange = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

async function marketRow([symbol, name, about], withYear) {
  try {
    const month = await yahooChart(symbol, '1mo');
    const year = withYear ? await yahooChart(symbol, '1y').catch(() => null) : null;
    const c = month.closes;
    const day = pctChange(month.price, c.length > 1 ? c[c.length - 2] : month.prev);
    return {
      symbol, name, about, price: Math.round(month.price * 100) / 100, currency: month.currency,
      day, month: pctChange(month.price, c[0]), year: year ? pctChange(year.price, year.closes[0]) : null,
      spark: c.slice(-22).map(v => Math.round(v * 100) / 100),
    };
  } catch { return null; }
}

function parseRss(xml) {
  const out = [];
  const tag = (s, t) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';
  const clean = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  for (const item of xml.split('<item').slice(1)) {
    const title = clean(tag(item, 'title'));
    const link = clean(tag(item, 'link'));
    if (!title || !/^https:\/\/[^\s]+$/.test(link)) continue;
    out.push({ title: title.slice(0, 200), link, source: clean(tag(item, 'source')).slice(0, 60) || 'Yahoo Finance', date: clean(tag(item, 'pubDate')) });
  }
  return out;
}

async function yahooNews() {
  const feeds = [
    'https://finance.yahoo.com/news/rssindex',
    'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EIXIC,VTI&region=US&lang=en-US',
  ];
  const seen = new Set();
  const items = [];
  for (const url of feeds) {
    try {
      const res = await fetch(url, { headers: YAHOO_HEADERS, cf: { cacheTtl: MARKET_TTL } });
      if (!res.ok) continue;
      for (const n of parseRss(await res.text())) if (!seen.has(n.title)) { seen.add(n.title); items.push(n); }
    } catch { /* try the next feed */ }
  }
  return items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)).slice(0, 12);
}

async function marketsPayload() {
  const [indexes, watch, news] = await Promise.all([
    Promise.all(INDEXES.map(r => marketRow(r, false))),
    Promise.all(WATCH.map(r => marketRow(r, true))),
    yahooNews(),
  ]);
  return { indexes: indexes.filter(Boolean), watch: watch.filter(Boolean), news, updatedAt: new Date().toISOString(), source: 'Yahoo Finance' };
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

  // --- markets and news ---
  if (path === '/api/markets' && method === 'GET') {
    const cache = caches.default;
    const key = new Request(`${url.origin}/__cache/markets-v1`);
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { headers: { ...API_HEADERS } });
    const payload = await marketsPayload();
    const res = json(payload);
    if (payload.indexes.length || payload.news.length) {
      await cache.put(key, new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${MARKET_TTL}` } }));
    }
    return res;
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
};
