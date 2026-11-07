// Calendar imports for the Planner. Paste the iCal link from Canvas, Google
// Calendar, Apple iCloud or Outlook; Budgie's server reads it (browsers cannot
// fetch other sites' calendars directly), and events become Planner items.
// Links are kept in your private account data and refresh on their own.
import { store, newId } from './store';
import { readCalendar } from './account';
import { makeTask, isoDay, toMins, guessKind, today, dayDiff } from './tasks';

export const FEED_KINDS = {
  canvas: { name: 'Canvas', help: 'Canvas → Calendar → Calendar Feed (bottom right) → copy the link.' },
  google: { name: 'Google Calendar', help: 'Google Calendar → Settings → your calendar → Integrate calendar → Secret address in iCal format.' },
  apple: { name: 'Apple Calendar', help: 'iCloud Calendar → share the calendar → Public Calendar → copy the link.' },
  outlook: { name: 'Outlook', help: 'Outlook → Settings → Calendar → Shared calendars → Publish a calendar → ICS link.' },
  other: { name: 'Calendar', help: 'Any calendar that gives an iCal (.ics) or webcal link.' },
};
const REFRESH_MS = 3 * 60 * 60 * 1000;
const guessFeed = url => {
  const h = (() => { try { return new URL(url.replace(/^webcals?:/i, 'https:')).hostname; } catch { return ''; } })();
  return /instructure|canvas/.test(h) ? 'canvas' : /google/.test(h) ? 'google' : /icloud|apple/.test(h) ? 'apple' : /outlook|office|live\.com/.test(h) ? 'outlook' : 'other';
};

// An event's start in this device's time zone: { date, time }.
function localStart(t) {
  if (!t) return { date: '', time: '' };
  if (t.date) return { date: t.date, time: '' };
  if (t.local) return { date: t.local.slice(0, 10), time: t.local.slice(11, 16) };
  const d = new Date(t.at);
  return { date: isoDay(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}

// One calendar event as Planner fields.
export function eventToTask(ev, feed) {
  const start = localStart(ev.start);
  const end = localStart(ev.end);
  let title = ev.title;
  let project = '';
  // Canvas puts the course in brackets: "Essay 2 [ENGL 101 Fall 2026]".
  const course = title.match(/\s*\[([^\]]{2,60})\]\s*$/);
  if (course) { project = course[1].replace(/\s+(fall|spring|summer|winter|autumn)\b.*$/i, '').replace(/[-_]\d{2,}.*$/, '').trim(); title = title.replace(course[0], '').trim(); }
  let kind = guessKind(` ${title} `, Boolean(ev.repeat));
  if (feed.kind === 'canvas' && !['exam', 'class'].includes(kind)) kind = 'assignment';
  if (kind === 'task' || kind === 'routine') kind = ev.repeat ? 'class' : 'event';
  const mins = start.time && end.time && end.date === start.date ? toMins(end.time) - toMins(start.time) : null;
  const repeat = ev.repeat ? { every: ev.repeat.every, days: ev.repeat.days || [], until: ev.repeat.until || '' } : null;
  return {
    title: title.slice(0, 160), kind, project, date: start.date, time: start.time === '00:00' && !ev.start?.at ? '' : start.time,
    mins: mins > 0 ? mins : null, repeat, notes: [ev.location, ev.notes].filter(Boolean).join(' · ').slice(0, 300), link: ev.url || '',
  };
}

// Put a feed's events into the planner: new ones are added, changed ones are
// updated (your ticks, notes, priority and subtasks are kept), and future ones
// that left the calendar are removed.
export function mergeEvents(feed, events) {
  const now = today();
  const mine = new Map(store.tasks.filter(t => t.feedId === feed.id).map(t => [t.uid, t]));
  const seen = new Set();
  const added = [];
  for (const ev of events) {
    const uid = String(ev.uid);
    if (seen.has(uid)) continue;
    seen.add(uid);
    const f = eventToTask(ev, feed);
    if (!f.date) continue;
    const old = mine.get(uid);
    if (old) Object.assign(old, { title: f.title, date: f.date, time: f.time, mins: f.mins, repeat: f.repeat, link: f.link, project: old.project || f.project, kind: old.kindSet ? old.kind : f.kind });
    else {
      const soon = ['assignment', 'exam'].includes(f.kind) && dayDiff(now, f.date) <= 2;
      added.push(makeTask({ ...f, source: 'calendar', feedId: feed.id, uid, priority: soon ? 'high' : 'medium' }));
    }
  }
  const gone = new Set([...mine.keys()].filter(uid => !seen.has(uid) && !mine.get(uid).done && (mine.get(uid).repeat || mine.get(uid).date >= now)));
  store.tasks = [...store.tasks.filter(t => !(t.feedId === feed.id && gone.has(t.uid))), ...added];
  return { added: added.length, removed: gone.size };
}

export async function syncFeed(feed) {
  feed.busy = true;
  try {
    const out = await readCalendar(feed.url);
    if (out.name && (!feed.name || feed.name === FEED_KINDS[feed.kind]?.name)) feed.name = out.name;
    if (out.kind) feed.kind = out.kind;
    const r = mergeEvents(feed, out.events || []);
    Object.assign(feed, { lastSync: new Date().toISOString(), count: (out.events || []).length, error: '' });
    return r;
  } catch (e) {
    feed.error = e.message || 'The calendar could not be read.';
    feed.lastSync = new Date().toISOString();
    return null;
  } finally {
    delete feed.busy;
  }
}

export async function addFeed(raw, name = '') {
  const url = raw.trim().replace(/^webcals?:\/\//i, 'https://');
  if (store.feeds.some(f => f.url === url)) throw new Error('That calendar is already imported.');
  const kind = guessFeed(url);
  const feed = { id: newId(), name: name || FEED_KINDS[kind].name, url, kind, lastSync: null, count: 0, error: '' };
  store.feeds.push(feed);
  const live = store.feeds[store.feeds.length - 1];
  const r = await syncFeed(live);
  if (!r && !live.count) { store.feeds = store.feeds.filter(f => f.id !== feed.id); throw new Error(live.error); }
  return r;
}
export function removeFeed(feed, { keepItems = false } = {}) {
  store.feeds = store.feeds.filter(f => f.id !== feed.id);
  if (!keepItems) store.tasks = store.tasks.filter(t => t.feedId !== feed.id || t.done);
}

// Refresh every calendar that is more than three hours old.
let running = false;
export async function refreshFeeds({ force = false } = {}) {
  if (running) return;
  running = true;
  try {
    for (const f of store.feeds) {
      if (force || !f.lastSync || Date.now() - Date.parse(f.lastSync) > REFRESH_MS) await syncFeed(f);
    }
  } finally { running = false; }
}
export const feedTime = f => (f.lastSync ? new Date(f.lastSync).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'never');
