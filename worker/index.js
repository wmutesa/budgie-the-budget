// Budgie's Worker: serves the site and runs the /api routes for personal
// accounts. Sign-in is invite-only and uses passkeys; each person's data is
// one JSON document in D1.
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const SESSION_COOKIE = '__Host-budgie_session';
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_DATA_BYTES = 1_500_000;
const RECOVERY_CODES = 8;
const RECOVERY_LINK_MS = 15 * 60 * 1000;
const MAX_FAILED_RECOVERIES = 10; // per network address per hour
// Workers AI: an open model (Meta's Llama, the family Ollama runs) on Cloudflare.
const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const AI_NAME = 'Llama 3.1';
const AI_PER_HOUR = 60; // requests per person per hour

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

// A simple per-key hourly limit, used for failed recoveries and AI requests.
async function tooManyAttempts(env, key, max = MAX_FAILED_RECOVERIES) {
  const row = await env.DB.prepare('SELECT count, window_start FROM attempts WHERE key = ?').bind(key).first();
  return Boolean(row && now() - row.window_start < 3600e3 && row.count >= max);
}

// The first {...} in a model reply, parsed; null if there is none.
function firstJSON(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

async function runAI(env, task, input) {
  const clean = v => String(v || '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, 4000);
  if (task === 'receipt') {
    const categories = Array.isArray(input.categories) ? input.categories.slice(0, 30).map(clean) : [];
    const out = await env.AI.run(AI_MODEL, {
      max_tokens: 200,
      temperature: 0,
      messages: [
        { role: 'system', content: `Read receipt text. Reply with JSON only: {"merchant": string, "date": "YYYY-MM-DD" or null, "total": number, "currency": ISO 4217 code, "category": one of ${JSON.stringify(categories)}}. Use only facts in the text.` },
        { role: 'user', content: clean(input.text) },
      ],
    });
    const j = firstJSON(out?.response);
    if (!j || typeof j.total !== 'number') return null;
    return {
      merchant: String(j.merchant || '').slice(0, 80),
      date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : null,
      total: j.total,
      currency: /^[A-Z]{3}$/.test(j.currency || '') ? j.currency : null,
      category: categories.includes(j.category) ? j.category : null,
    };
  }
  if (task === 'advice') {
    const facts = (Array.isArray(input.facts) ? input.facts : []).slice(0, 20).map(clean);
    if (!facts.length) return null;
    const out = await env.AI.run(AI_MODEL, {
      max_tokens: 160,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a careful budgeting assistant. In three short sentences, say how the month is going and the single most useful next step. Use only the facts given. No made-up numbers, no bank rates.' },
        { role: 'user', content: facts.join('\n') },
      ],
    });
    return String(out?.response || '').trim().slice(0, 600) || null;
  }
  return null;
}
async function countFailure(env, key) {
  await env.DB.prepare(
    `INSERT INTO attempts (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN ?2 - window_start > 3600000 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ?2 - window_start > 3600000 THEN ?2 ELSE window_start END`,
  ).bind(key, now()).run();
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
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, now(), expires, (request.headers.get('User-Agent') || '').slice(0, 200)).run();
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
    const sendsBody = method === 'POST' || method === 'PUT';
    if (sendsBody && !(request.headers.get('Content-Type') || '').startsWith('application/json')) return fail(415, 'Send JSON');
  }

  if (path === '/api/me' && method === 'GET') {
    const user = await currentUser(request, env);
    return user ? json({ user }) : fail(401, 'Not signed in');
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

  // --- AI (Workers AI) ---
  if (path === '/api/ai' && method === 'GET') {
    return json({ available: Boolean(env.AI) && env.AI_DISABLED !== '1', model: AI_MODEL, name: AI_NAME });
  }
  if (path === '/api/ai' && method === 'POST') {
    if (!env.AI || env.AI_DISABLED === '1') return json({ result: null });
    const key = `ai:${user.id}`;
    if (await tooManyAttempts(env, key, AI_PER_HOUR)) return fail(429, 'AI is resting for a bit. Budgie keeps working with its built-in rules.');
    await countFailure(env, key); // counts every request toward the hourly limit
    const input = await body(request);
    try {
      return json({ result: await runAI(env, input.task, input) });
    } catch (e) {
      console.error('AI error', e?.message);
      return json({ result: null });
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
