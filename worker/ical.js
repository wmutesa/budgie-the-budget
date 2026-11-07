// Calendar feeds for the Planner: checks a calendar link is safe to fetch and
// reads iCalendar (.ics) text into plain events. Works with Canvas, Google
// Calendar, Apple iCloud and Outlook links.

const MAX_EVENTS = 400;
const PAST_DAYS = 14;
const FUTURE_DAYS = 200;

// A calendar link must be a public https address. Returns a URL or throws a plain message.
export function checkFeedUrl(raw) {
  const text = String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://');
  if (!text || text.length > 2048) throw new Error('Paste the calendar link.');
  let url;
  try { url = new URL(text); } catch { throw new Error('That does not look like a link.'); }
  if (url.protocol !== 'https:') throw new Error('Use the https or webcal link of the calendar.');
  if (url.username || url.password) throw new Error('Calendar links cannot include a password.');
  if (url.port && url.port !== '443') throw new Error('That calendar address is not supported.');
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[') || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) {
    throw new Error('That calendar address is not supported.');
  }
  return url;
}

// Plain advice for links that are not calendar feeds, or that a service refused.
// Google shows several links per calendar and only the secret iCal address
// works for a private calendar. Returns a message, or '' when nothing is known.
const GOOGLE_STEPS = 'On a computer, open calendar.google.com → Settings (gear) → under "Settings for my calendars" pick the calendar → Integrate calendar → copy "Secret address in iCal format". The phone app does not show it.';
export function linkAdvice(raw, status = 0) {
  let u;
  try { u = new URL(String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://')); } catch { return ''; }
  const h = u.hostname.toLowerCase();
  const p = u.pathname;
  if (/(^|\.)google\.com$/.test(h)) {
    if (/\/ical\//.test(p) && /\/private-[^/]+\//.test(p)) return status ? `Google refused this secret address. It may have been reset, or your school or work account may block it. Copy it again: ${GOOGLE_STEPS}` : '';
    if (/\/ical\//.test(p) && /\/public\//.test(p)) return status ? `This is the calendar's public address, which only works when the calendar is public. Use the secret one instead: ${GOOGLE_STEPS}` : '';
    if (/\/embed/.test(p)) return `That is the link for embedding the calendar in a web page, not its calendar feed. ${GOOGLE_STEPS}`;
    return `That is the link for opening Google Calendar, not its calendar feed. ${GOOGLE_STEPS}`;
  }
  if (status && /outlook\.|office365\.com$|live\.com$/.test(h)) return 'Outlook refused this link. In Outlook on the web: Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link again.';
  if (status && /instructure\.com$|canvas/.test(h)) return 'Canvas refused this link. In Canvas: Calendar → Calendar Feed (bottom right) → copy the link again.';
  if (status && /icloud\.com$/.test(h)) return 'iCloud refused this link. In iCloud Calendar, share the calendar as a Public Calendar and copy the link again.';
  return '';
}

// Which service a link is from, for labels and how events are read.
export function feedKind(url) {
  const h = new URL(url).hostname.toLowerCase();
  if (/instructure\.com$|canvas/.test(h)) return 'canvas';
  if (/google\.com$/.test(h)) return 'google';
  if (/icloud\.com$|apple\.com$/.test(h)) return 'apple';
  if (/outlook\.|office365\.com$|live\.com$|office\.com$/.test(h)) return 'outlook';
  return 'other';
}

// Outlook often names time zones the Windows way.
const WINDOWS_ZONES = {
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles', 'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris', 'Central Europe Standard Time': 'Europe/Budapest', 'South Africa Standard Time': 'Africa/Johannesburg',
  'E. Africa Standard Time': 'Africa/Nairobi', 'India Standard Time': 'Asia/Kolkata', 'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo', 'AUS Eastern Standard Time': 'Australia/Sydney', 'UTC': 'UTC',
};
function zoneOffset(ts, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ts)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - ts;
}
// A wall-clock time in a named zone, as a UTC instant. Null when the zone is unknown.
function zonedToUtc([y, mo, d, h, mi, s], tzid) {
  const tz = WINDOWS_ZONES[tzid] || tzid.replace(/^\/[^/]+\/[^/]+\//, '');
  try {
    let guess = Date.UTC(y, mo - 1, d, h, mi, s);
    for (let i = 0; i < 2; i++) guess = Date.UTC(y, mo - 1, d, h, mi, s) - zoneOffset(guess, tz);
    return new Date(guess).toISOString();
  } catch { return null; }
}

// "20261112T235900Z" with its parameters, as { date } (all day), { at } (UTC instant) or { local } (no zone).
function readTime(value, params) {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00', z] = m;
  if (!h || params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}` };
  const parts = [y, mo, d, h, mi, s].map(Number);
  if (z) return { at: new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])).toISOString() };
  if (params.TZID) { const at = zonedToUtc(parts, params.TZID); if (at) return { at }; }
  return { local: `${y}-${mo}-${d}T${h}:${mi}` };
}
const unescape = s => String(s).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
const stamp = t => (t?.at ? Date.parse(t.at) : t?.date ? Date.parse(`${t.date}T12:00:00Z`) : t?.local ? Date.parse(`${t.local}:00Z`) : NaN);

function readRule(text) {
  const r = Object.fromEntries(String(text).split(';').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' }[r.FREQ];
  if (!freq || (r.INTERVAL && r.INTERVAL !== '1')) return null;
  const days = r.BYDAY ? r.BYDAY.split(',').map(d => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(d.slice(-2))).filter(d => d >= 0) : [];
  const until = r.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : '';
  return { every: freq, days, until, count: r.COUNT ? Number(r.COUNT) : null };
}

// Read .ics text into { name, events: [{ uid, title, start, end, location, url, notes, repeat }] }.
export function parseIcs(text, now = Date.now()) {
  const lines = String(text).replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let name = '';
  let ev = null;
  const from = now - PAST_DAYS * 864e5;
  const to = now + FUTURE_DAYS * 864e5;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev && ev.uid && ev.start && !ev.recurrenceId && ev.status !== 'CANCELLED') {
        const t = stamp(ev.start);
        const until = ev.repeat?.until ? Date.parse(`${ev.repeat.until}T23:59:59Z`) : ev.repeat ? Infinity : t;
        if (t <= to && until >= from) {
          events.push({ uid: ev.uid.slice(0, 200), title: (ev.title || 'Untitled').slice(0, 200), start: ev.start, end: ev.end || null, location: (ev.location || '').slice(0, 200), url: /^https:\/\//i.test(ev.url || '') ? ev.url.slice(0, 500) : '', notes: (ev.notes || '').slice(0, 300), repeat: ev.repeat || null });
          if (events.length >= MAX_EVENTS) break;
        }
      }
      ev = null;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const [key, ...rawParams] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    const params = Object.fromEntries(rawParams.map(p => p.split('=')).map(([k, v = '']) => [k.toUpperCase(), v.replace(/^"|"$/g, '')]));
    const k = key.toUpperCase();
    if (!ev) { if (k === 'X-WR-CALNAME') name = unescape(value).slice(0, 80); continue; }
    if (k === 'UID') ev.uid = value.trim();
    else if (k === 'SUMMARY') ev.title = unescape(value);
    else if (k === 'DTSTART') ev.start = readTime(value.trim(), params);
    else if (k === 'DTEND' || k === 'DUE') ev.end = readTime(value.trim(), params);
    else if (k === 'LOCATION') ev.location = unescape(value);
    else if (k === 'URL') ev.url = value.trim();
    else if (k === 'DESCRIPTION') ev.notes = unescape(value).replace(/\s+/g, ' ');
    else if (k === 'RRULE') ev.repeat = readRule(value);
    else if (k === 'RECURRENCE-ID') ev.recurrenceId = true;
    else if (k === 'STATUS') ev.status = value.trim().toUpperCase();
  }
  return { name, events };
}

// Fetch a calendar link, following up to three redirects that are also checked.
export async function fetchFeed(raw) {
  let url = checkFeedUrl(raw);
  // Catch links that are pages, not feeds, before asking the service.
  const before = linkAdvice(raw);
  if (before) throw Object.assign(new Error(before), { status: 422 });
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url.toString(), { redirect: 'manual', headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5', 'User-Agent': 'Mozilla/5.0 (compatible; Budgie calendar import)' }, signal: AbortSignal.timeout(12000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) { url = checkFeedUrl(new URL(res.headers.get('Location'), url).toString()); continue; }
    if (!res.ok) {
      const refused = res.status === 404 || res.status === 401 || res.status === 403 || res.status === 410;
      throw Object.assign(new Error(refused ? (linkAdvice(raw, res.status) || 'That calendar link no longer works. Copy it again from the calendar\'s settings.') : `The calendar did not answer (${res.status}). Try again later.`), { status: 502 });
    }
    // Read at most 3 MB.
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3_000_000) { reader.cancel(); throw Object.assign(new Error('That calendar is too large to import.'), { status: 413 }); }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.length; }
    const text = new TextDecoder().decode(all);
    if (!text.includes('BEGIN:VCALENDAR')) throw Object.assign(new Error('That link is not a calendar feed. Copy the iCal, ICS or "secret address" link.'), { status: 422 });
    return { kind: feedKind(url), ...parseIcs(text) };
  }
  throw Object.assign(new Error('That calendar link redirects too many times.'), { status: 502 });
}
