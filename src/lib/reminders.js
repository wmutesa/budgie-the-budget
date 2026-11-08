// Reminders on this device: while Budgie is open, a notification shortly
// before anything with a time. Turned on in your profile; nothing is sent
// through a server, so reminders only arrive while a Budgie tab is open.
// During a focus session, what gets through follows the Focus page's choice;
// the rest is held and summed up when the session ends.
import { store } from './store';
import { occurrences, today, toMins, timeLabel } from './tasks';
import { focusGate } from './focus';

const LEAD_MINS = 10;
const sent = new Set();
let timer = null;

function check() {
  if (!store.planner?.remind || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  for (const x of occurrences(today(), today())) {
    if (x.done || !x.task.time) continue;
    const until = toMins(x.task.time) - m;
    if (until < 0 || until > LEAD_MINS || sent.has(x.key)) continue;
    sent.add(x.key);
    const body = until ? `At ${timeLabel(x.task.time)}, in ${until} min` : 'Starting now';
    if (!focusGate(['event', 'class'].includes(x.task.kind) ? 'starting' : 'other', { title: x.task.title, body })) continue;
    try { new Notification(x.task.title, { body: until ? `At ${timeLabel(x.task.time)}, in ${until} min` : 'Starting now', tag: x.key }); } catch { /* blocked */ }
  }
}
export function startReminders() {
  if (timer) return;
  check();
  timer = setInterval(check, 60 * 1000);
}
export function stopReminders() { clearInterval(timer); timer = null; }
