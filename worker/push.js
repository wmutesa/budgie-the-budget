// Notifications to laptops and phones, even when Taskie is closed (Web Push).
// Every few minutes the scheduled run looks at each person's planner and
// queues what is due: a reminder 10 minutes before anything with a time, a
// short brief in the morning and a heads-up the evening before a deadline.
// It then sends an empty "wake up" push (signed with Taskie's VAPID key) to
// each of their devices; the service worker fetches the queued messages from
// /api/notify/pending and shows them. Empty pushes need no payload encryption,
// and nothing private passes through the browser vendors' push servers.

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const now = () => Date.now();

let ready = false;
export async function pushTables(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS app_keys (name TEXT PRIMARY KEY, value TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, tz TEXT, ua TEXT, created_at INTEGER NOT NULL, last_ok INTEGER, fails INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS notify_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, key TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, created_at INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, UNIQUE (user_id, key))'),
  ]);
  ready = true;
}

// Taskie's VAPID key pair, made once and kept in D1 (no secret to set up).
let vapid = null;
export async function vapidKeys(env) {
  if (vapid) return vapid;
  await pushTables(env);
  const row = await env.DB.prepare("SELECT value FROM app_keys WHERE name = 'vapid'").first();
  if (row) {
    const v = JSON.parse(row.value);
    vapid = { publicKey: v.publicKey, privateKey: await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
    return vapid;
  }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = b64url(raw);
  await env.DB.prepare("INSERT OR IGNORE INTO app_keys (name, value) VALUES ('vapid', ?)").bind(JSON.stringify({ publicKey, jwk })).run();
  vapid = null;
  return vapidKeys(env); // read back, in case another run made one first
}

async function vapidAuth(env, endpoint) {
  const { publicKey, privateKey } = await vapidKeys(env);
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(now() / 1000) + 12 * 3600, sub: 'mailto:hello@taskie.app' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${publicKey}`;
}

// Wake every device of one person. Gone subscriptions (404/410) are removed.
export async function wake(env, userId) {
  await pushTables(env);
  const { results = [] } = await env.DB.prepare('SELECT endpoint FROM push_subs WHERE user_id = ?').bind(userId).all();
  let sent = 0;
  for (const { endpoint } of results) {
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidAuth(env, endpoint), TTL: '3600', Urgency: 'high', 'Content-Length': '0' } });
      if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
      else if (res.ok) { sent++; await env.DB.prepare('UPDATE push_subs SET last_ok = ?, fails = 0 WHERE endpoint = ?').bind(now(), endpoint).run(); }
      else await env.DB.prepare('UPDATE push_subs SET fails = fails + 1 WHERE endpoint = ?').bind(endpoint).run();
    } catch { /* try again next time */ }
  }
  return sent;
}

export async function queue(env, userId, key, title, body, url = '/') {
  await pushTables(env);
  const r = await env.DB.prepare('INSERT OR IGNORE INTO notify_queue (user_id, key, title, body, url, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, key, title.slice(0, 120), String(body || '').slice(0, 240), url, now()).run();
  return r.meta?.changes > 0;
}

// ---------- what is due, from a person's planner ----------
const iso = d => d.toISOString().slice(0, 10);
// "Now" in their time zone, as { day: 'YYYY-MM-DD', mins, weekday }.
function localNow(tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const day = `${p.year}-${p.month}-${p.day}`;
    return { day, mins: (Number(p.hour) % 24) * 60 + Number(p.minute), wd: new Date(`${day}T12:00:00Z`).getUTCDay() };
  } catch { const d = new Date(); return { day: iso(d), mins: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: d.getUTCDay() }; }
}
const addDay = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function occursOn(t, day) {
  if (!t.repeat) return t.date === day;
  if (t.skipDates?.includes(day)) return false;
  const start = t.date || String(t.createdAt || '').slice(0, 10);
  if (start && day < start) return false;
  if (t.repeat.until && day > t.repeat.until) return false;
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  switch (t.repeat.every) {
    case 'day': return true;
    case 'weekdays': return wd >= 1 && wd <= 5;
    case 'week': return (t.repeat.days?.length ? t.repeat.days : [new Date(`${start || day}T12:00:00Z`).getUTCDay()]).includes(wd);
    case 'month': return Number(day.slice(8)) === Number((start || day).slice(8));
    default: return false;
  }
}
const isDone = (t, day) => (t.repeat ? (t.doneDates || []).includes(day) : Boolean(t.done));
const toMins = s => (/^\d{2}:\d{2}$/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);
const clock = m => `${(Math.floor(m / 60) % 12) || 12}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`;

export const LEAD = 10;      // minutes before a timed item
const BRIEF_AT = 8 * 60;     // the morning brief, local time
const EVE_AT = 19 * 60;      // tomorrow's deadlines, local time
// Queue whatever is due for one person now. Returns how many new messages.
export async function planFor(env, userId, data, tz) {
  const prefs = data?.planner || {};
  if (prefs.remind === false && prefs.push === false) return 0;
  const { day, mins } = localNow(tz);
  const tasks = (Array.isArray(data?.tasks) ? data.tasks : []).filter(t => t && !t.pending && t.title);
  let n = 0;
  // 1. Reminders: anything timed starting in the next LEAD minutes (a 15-minute window, as the run is every 5).
  for (const t of tasks) {
    const at = toMins(t.time);
    if (at == null || !occursOn(t, day) || isDone(t, day)) continue;
    const until = at - mins;
    if (until < -4 || until > LEAD) continue;
    if (await queue(env, userId, `r:${t.id}:${day}`, t.title, until > 0 ? `At ${clock(at)}, in ${until} min` : 'Starting now', '/#schedule')) n++;
  }
  // 2. The morning brief.
  if (mins >= BRIEF_AT && mins < BRIEF_AT + 30 && prefs.brief !== false) {
    const todays = tasks.filter(t => occursOn(t, day) && !isDone(t, day));
    const first = todays.filter(t => t.time).sort((a, b) => a.time.localeCompare(b.time))[0];
    const overdue = tasks.filter(t => !t.repeat && !t.done && t.date && t.date < day).length;
    if (todays.length || overdue) {
      const body = [todays.length ? `${todays.length} ${todays.length === 1 ? 'thing' : 'things'} today` : 'Nothing planned today', first ? `first ${first.title} at ${clock(toMins(first.time))}` : '', overdue ? `${overdue} overdue` : ''].filter(Boolean).join(', ');
      if (await queue(env, userId, `b:${day}`, 'Good morning ☀️', `${body}.`, '/')) n++;
    }
  }
  // 3. Deadlines tomorrow, the evening before.
  if (mins >= EVE_AT && mins < EVE_AT + 30) {
    const tom = addDay(day, 1);
    const due = tasks.filter(t => !t.repeat && !t.done && t.date === tom && ['assignment', 'exam'].includes(t.kind));
    if (due.length) if (await queue(env, userId, `d:${tom}`, due.length === 1 ? `Due tomorrow: ${due[0].title}` : `${due.length} things due tomorrow`, due.length === 1 ? 'A short session tonight makes tomorrow easy.' : due.map(t => t.title).slice(0, 3).join(', '), '/#schedule')) n++;
  }
  return n;
}

// The scheduled run: everyone with a device signed up for notifications.
export async function scheduledPush(env) {
  await pushTables(env);
  const { results = [] } = await env.DB.prepare('SELECT user_id, MAX(tz) AS tz FROM push_subs GROUP BY user_id').all();
  for (const { user_id: userId, tz } of results) {
    try {
      const row = await env.DB.prepare('SELECT data FROM user_data WHERE user_id = ?').bind(userId).first();
      const data = row ? JSON.parse(row.data) : {};
      if (await planFor(env, userId, data, tz)) await wake(env, userId);
    } catch (e) { console.error('push', userId, e?.message); }
  }
  // Delivered messages are kept a day, undelivered ones two.
  await env.DB.prepare('DELETE FROM notify_queue WHERE (delivered = 1 AND created_at < ?) OR created_at < ?').bind(now() - 86400e3, now() - 2 * 86400e3).run();
}
