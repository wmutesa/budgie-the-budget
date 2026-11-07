// Every way into the Schedule: typed or spoken lines, a pasted timetable,
// a calendar link, or a calendar file. Things without a time get the next
// free slot on that day, so a title is usually all you need to give.
import { store, newId } from './store';
import { makeTask, parseTask, splitLines, occurrences, toMins, fromMins, today, score } from './tasks';
import { eventToTask, addFeed } from './calendar';
import { parseIcs } from '../../worker/ical.js';

const LINK_RE = /^(https?|webcals?):\/\/\S+$/i;
export const isIcs = text => /BEGIN:VCALENDAR/i.test(String(text));

// Give untimed one-off items on `day` a free slot, after `from` minutes.
// Returns [[task, oldTime, oldMins], ...] so it can be undone.
export function placeFree(tasks, day, { from = 9 * 60, until = 22 * 60 } = {}) {
  const busy = occurrences(day, day).filter(x => x.task.time && !tasks.includes(x.task)).map(x => { const s = toMins(x.task.time); return [s, s + (x.task.mins || 30)]; });
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  let at = Math.max(from, day === today() ? Math.ceil((nowM + 10) / 15) * 15 : 0);
  const moved = [];
  for (const t of [...tasks].sort((a, b) => score(b) - score(a))) {
    if (t.time || t.repeat || t.done || (t.date && t.date !== day)) continue;
    const len = t.mins || 30;
    for (let guard = 0; guard < 200; guard++) {
      const hit = busy.filter(([s, e]) => at < e && at + len > s);
      if (!hit.length) break;
      at = Math.max(...hit.map(([, e]) => e));
    }
    if (at + len > until) break;
    moved.push([t, t.time, t.mins, t.date]);
    t.date = day; t.time = fromMins(at); t.mins = len;
    busy.push([at, at + len]);
    at += len + 10;
  }
  return moved;
}
export const unplace = moved => moved.forEach(([t, time, mins, date]) => { t.time = time; t.mins = mins; t.date = date; });

// A calendar file's events become Planner items (once: they do not refresh).
export function addIcs(text, name = 'Calendar file') {
  const { events, name: calName } = parseIcs(text);
  const feed = { id: `file-${newId()}`, kind: 'other', name: calName || name };
  const seen = new Set(store.tasks.filter(t => t.uid).map(t => t.uid));
  const made = [];
  for (const ev of events) {
    const f = eventToTask(ev, feed);
    if (!f.date || seen.has(String(ev.uid))) continue;
    seen.add(String(ev.uid));
    made.push(makeTask({ ...f, uid: String(ev.uid), source: 'file' }));
  }
  store.tasks.unshift(...made);
  return made;
}

// Typed, spoken or pasted text: one item per line. Lines without a date land
// on `day`; calendar links are imported and kept up to date.
export async function addAnything(text, day = today()) {
  const raw = String(text || '');
  if (isIcs(raw)) return { made: addIcs(raw), links: 0, moved: [] };
  const lines = splitLines(raw.replace(/\t+/g, ' '));
  const made = [];
  let links = 0;
  const errors = [];
  for (const line of lines) {
    if (LINK_RE.test(line)) {
      try { await addFeed(line); links++; } catch (e) { errors.push(e.message); }
      continue;
    }
    const p = parseTask(line);
    made.push(makeTask({ title: p.title, date: p.date || (p.repeat ? '' : day), time: p.time, mins: p.mins, repeat: p.repeat, priority: p.priority, project: p.project, kind: p.kind }));
    if (made[made.length - 1].repeat && !made[made.length - 1].date) made[made.length - 1].date = day;
  }
  store.tasks.unshift(...made);
  const live = made.map(m => store.tasks.find(t => t.id === m.id) || m);
  const moved = placeFree(live.filter(t => !t.time && t.date === day), day);
  return { made: live, links, moved, errors };
}
