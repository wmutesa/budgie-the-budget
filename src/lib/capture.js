// Capture: one button anywhere in Budgie. Say or type anything; Budgie sorts
// it in the background into tasks, routines and goals, puts each where it
// belongs as "pending", then walks you through them one by one so you keep,
// switch or drop each before it counts.
import { reactive } from 'vue';
import { store } from './store';
import { routeAll, splitSpoken, sendAll, undoSend, DESTS } from './router';
import { ai, aiRewriteDictation } from './ai';
import { tidyDictation } from './tidy';
import { today, addDays, occursOn, dayLabel, timeLabel, KINDS, DAY_SHORT } from './tasks';
import { placeFree } from './schedule';
import { go, nav } from './nav';

export const capture = reactive({
  open: false,       // the capture sheet
  text: '',
  sorting: false,
  review: [],        // [{ id, to, r }] waiting for a decision, in order
  at: -1,            // which one the review is showing (-1: not reviewing)
});
export { DESTS };

// Mark what one send made as pending (goals take their milestones along).
function markPending(made) {
  for (const m of made) {
    if (m.to === 'goal') {
      const g = store.goals.find(x => x.id === m.id);
      if (g) g.pending = true;
      store.tasks.forEach(t => { if (t.goalId === m.id) t.pending = true; });
    } else {
      const t = store.tasks.find(x => x.id === m.id);
      if (t) t.pending = true;
    }
  }
}
// Things with no day land today, at the next free time, so the review can show them in place.
function settle(made) {
  const d = today();
  const loose = made.filter(m => m.to === 'task').map(m => store.tasks.find(t => t.id === m.id)).filter(t => t && !t.date && !t.repeat);
  loose.forEach(t => { t.date = d; });
  placeFree(loose, d);
}

// Sort what was said or typed and put it in place, pending review.
// What was said, broken down into separate things, one per line: the
// on-device AI reads and splits it when it is ready, otherwise the rules do
// (filler out, sentence and "then / also / and I need to" breaks, planner times).
export async function breakDown(text) {
  let lines = null;
  if (ai.enabled && ai.ready) lines = await aiRewriteDictation(text).catch(() => null);
  return lines || tidyDictation(splitSpoken(text).join('\n'));
}

export async function sortAndPlace(text = capture.text, { spoken = false } = {}) {
  if (!text.trim()) return 0;
  capture.sorting = true;
  const rows = routeAll(spoken ? await breakDown(text) : text).filter(r => r.text);
  if (!rows.length) { capture.sorting = false; return 0; }
  const out = await sendAll(rows);
  settle(out.made);
  markPending(out.made);
  capture.review.push(...out.made.map(m => ({ id: m.id, to: m.to, r: m.r })));
  capture.sorting = false;
  capture.text = '';
  capture.open = false;
  startReview();
  return out.made.length;
}

// ---------- the review ----------
export const pendingCount = () => store.tasks.filter(t => t.pending && !t.goalId).length + store.goals.filter(g => g.pending).length;
// Pick up anything still pending (for example after a reload).
function collect() {
  const known = new Set(capture.review.map(x => x.id));
  for (const g of store.goals) if (g.pending && !known.has(g.id)) capture.review.push({ id: g.id, to: 'goal', r: null });
  for (const t of store.tasks) if (t.pending && !t.goalId && !known.has(t.id)) capture.review.push({ id: t.id, to: t.repeat ? 'routine' : 'task', r: null });
  capture.review = capture.review.filter(x => (x.to === 'goal' ? store.goals.some(g => g.id === x.id) : store.tasks.some(t => t.id === x.id)));
}
export function startReview() { collect(); capture.at = capture.review.length ? 0 : -1; if (capture.at === 0) show(); }
export const current = () => (capture.at >= 0 ? capture.review[capture.at] : null);
export const itemOf = x => (x.to === 'goal' ? store.goals.find(g => g.id === x.id) : store.tasks.find(t => t.id === x.id));

// Where it lives, in words, and the part of the page to highlight.
export function placeOf(x) {
  const it = itemOf(x);
  if (!it) return { where: '', target: '' };
  if (x.to === 'goal') return { page: 'Overview', where: `Overview · Goals${it.by ? ` · by ${dayLabel(it.by)}` : ''} · ${store.tasks.filter(t => t.goalId === it.id).length} milestones in your Planner`, target: `[data-goal-id="${it.id}"]` };
  const when = it.repeat
    ? (it.repeat.every === 'day' ? 'every day' : it.repeat.every === 'weekdays' ? 'weekdays' : it.repeat.every === 'month' ? 'every month' : `every ${(it.repeat.days || []).map(d => DAY_SHORT[d]).join(', ')}`)
    : it.date ? dayLabel(it.date) : 'any day';
  return { page: 'Schedule', day: it.repeat ? nextDay(it) : it.date || today(), where: [`Schedule · ${x.to === 'routine' ? 'Routine' : KINDS[it.kind]?.label || 'Task'}`, when, it.time && timeLabel(it.time), it.project && `#${it.project}`].filter(Boolean).join(' · '), target: `[data-task-id="${it.id}"]` };
}
function nextDay(t) {
  for (let i = 0; i < 31; i++) { const d = addDays(today(), i); if (occursOn(t, d)) return d; }
  return today();
}
// Open the page and day where the current item lives.
export function show() {
  const x = current();
  if (!x) return;
  const p = placeOf(x);
  if (p.page === 'Schedule') { store.planner.cal = 'day'; nav.day = p.day; }
  go(p.page);
}
function advance() {
  capture.review.splice(capture.at, 1);
  if (!capture.review.length) { capture.at = -1; return; }
  capture.at = Math.min(capture.at, capture.review.length - 1);
  show();
}
export function keep() {
  const x = current(); if (!x) return;
  const it = itemOf(x);
  if (it) { it.pending = false; if (x.to === 'goal') store.tasks.forEach(t => { if (t.goalId === x.id) t.pending = false; }); }
  advance();
}
export function drop() {
  const x = current(); if (!x) return;
  undoSend({ made: [{ id: x.id }] });
  advance();
}
export function keepAll() {
  store.tasks.forEach(t => { if (t.pending) t.pending = false; });
  store.goals.forEach(g => { if (g.pending) g.pending = false; });
  capture.review = []; capture.at = -1;
}
export const later = () => { capture.at = -1; };
// Switch the current item to a task, routine or goal; it stays pending and in review.
export async function switchTo(dest) {
  const x = current();
  if (!x || x.to === dest) return;
  const it = itemOf(x);
  const r = x.r || { text: it?.title || '', task: { title: it?.title || '', date: it?.date || '', time: it?.time || '', mins: it?.mins, repeat: it?.repeat, priority: it?.priority || 'medium', project: it?.project || '', kind: it?.kind || 'task' }, goal: { title: it?.title || '', by: it?.by || '' } };
  undoSend({ made: [{ id: x.id }] });
  const out = await sendAll([{ ...r, dest }]);
  settle(out.made);
  markPending(out.made);
  const m = out.made[0];
  capture.review[capture.at] = { id: m.id, to: m.to, r: m.r };
  show();
}
