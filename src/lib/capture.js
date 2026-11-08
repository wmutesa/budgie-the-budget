// Capture: one button anywhere in Budgie. Say or type anything; Budgie sorts
// it in the background into tasks, routines and goals, puts each where it
// belongs as "pending", then walks you through them one by one so you keep,
// switch or drop each before it counts.
import { reactive } from 'vue';
import { store } from './store';
import { route, routeAll, splitSpoken, sendAll, undoSend, DESTS } from './router';
import { ai, aiExtractItems } from './ai';
import { tidyDictation } from './tidy';
import { geminiBreakdown, geminiHear, budgieBreakdown } from './account';
import { itemLine, localLine, withKind, saidIn as said } from './itemline';
import { today, addDays, isoDay, occursOn, dayLabel, timeLabel, KINDS, DAY_SHORT } from './tasks';
import { placeFree } from './schedule';
import { pullCommands, fromItem, runCommands } from './commands';
import { go, nav } from './nav';
import { isNotTask } from './titles';

export const capture = reactive({
  open: false,       // the capture sheet
  text: '',
  sorting: false,
  review: [],        // [{ id, to, r }] waiting for a decision, in order
  at: -1,            // which one the review is showing (-1: not reviewing)
  via: '',           // what broke the last one down: Gemini, on-device AI or rules
  heard: '',         // what Gemini heard in the last recording
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
// What was said, broken down into every separate thing, one per line, with
// the kind of each when an AI decided it. The rules always run (sentence
// ends, numbering, "then / also", "and" before a new thing, listed items; a
// course or verb carries across). With the person's own Gemini key, Gemini
// reads it; otherwise a free Hugging Face model on this device (Qwen 2.5)
// lists each item with a clear title, its kind, the date and time words and
// the course, and Budgie works out the exact dates. An AI answer is used only
// when it finds about as much as the rules and invents nothing.
// Open things by name, so "mark the lab report as done" can find one.
const myOpen = () => store.tasks.filter(t => !t.pending && (!t.done || t.repeat)).slice(-80).map(t => t.title);
const myCategories = () => [...new Set([...Object.keys(store.projects || {}), ...store.tasks.map(t => t.project).filter(Boolean)])].slice(0, 60);
// What Gemini heard in a recording, kept so it is not sent twice when the text is left as written.
export const lastHeard = { transcript: '', items: null };
export async function hear(audio) {
  const d = new Date();
  const heard = await geminiHear({ audio: audio.data, mime: audio.mime, typed: '', today: isoDay(d), weekday: d.toLocaleDateString('en-US', { weekday: 'long' }), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, categories: myCategories(), existing: myOpen() });
  lastHeard.transcript = String(heard?.transcript || '').trim(); lastHeard.items = heard?.items || null;
  return lastHeard.transcript;
}
export async function breakDown(text, audio = null) {
  // Gemini already heard this recording and the words were left as it wrote them: use its items.
  if (!audio && lastHeard.items && text.trim() === lastHeard.transcript) {
    const heard = { transcript: lastHeard.transcript, items: lastHeard.items };
    lastHeard.items = null;
    const cmds = heard.items.map(fromItem).filter(Boolean);
    const ok = heard.items.filter(x => x.action === 'add' || !x.action).filter(x => said(text)(x.title));
    if (ok.length || cmds.length) { capture.via = 'Gemini (recording)'; capture.heard = heard.transcript; return { lines: ok.map(itemLine), kinds: ok.map(x => x.kind), cmds }; }
  }
  lastHeard.items = null;
  // The recording first: Gemini hears it, writes down what was said and lists every item.
  if (audio && store.digest?.geminiKey && store.planner?.geminiAudio !== false) {
    try {
      const d = new Date();
      const heard = await geminiHear({ audio: audio.data, mime: audio.mime, typed: text, today: isoDay(d), weekday: d.toLocaleDateString('en-US', { weekday: 'long' }), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, categories: myCategories(), existing: myOpen() });
      const words = `${heard.transcript || ''} ${text}`;
      const cmds = (heard.items || []).map(fromItem).filter(Boolean);
      const ok = (heard.items || []).filter(x => x.action === 'add' || !x.action).filter(x => said(words)(x.title));
      const rulesHeard = tidyDictation(splitSpoken(heard.transcript || text).join('\n')).split('\n').filter(Boolean);
      if ((ok.length || cmds.length) && ok.length + cmds.length >= Math.ceil(rulesHeard.length * 0.75)) { capture.via = 'Gemini (recording)'; capture.heard = heard.transcript || ''; return { lines: ok.map(itemLine), kinds: ok.map(x => x.kind), cmds }; }
      if (heard.transcript && !text.trim()) text = heard.transcript; // nothing typed or heard live: use what Gemini wrote down
    } catch { /* turned off, the free limit, or offline: use the live text */ }
  }
  if (!text.trim()) return { lines: [], kinds: null };
  const split = splitSpoken(text);
  const all = tidyDictation(split.join('\n')).split('\n').filter(Boolean);
  // Sentences about what is already planned ("mark X done") are commands, not new things.
  const { cmds: ruleCmds, rest: rules } = pullCommands(all);
  const fair = n => n >= Math.ceil(all.length * 0.75);
  const real = said(text);
  if (store.digest?.geminiKey) {
    try {
      const d = new Date();
      // Your own categories, so items land in them; the rules' split as a checklist so nothing is missed.
      const { items } = await geminiBreakdown(text, isoDay(d), d.toLocaleDateString('en-US', { weekday: 'long' }), Intl.DateTimeFormat().resolvedOptions().timeZone, myCategories(), all.slice(0, 200), myOpen());
      const cmds = (items || []).map(fromItem).filter(Boolean);
      const ok = (items || []).filter(x => x.action === 'add' || !x.action).filter(x => real(x.title));
      if ((ok.length || cmds.length) && fair(ok.length + cmds.length)) { capture.via = 'Gemini'; return { lines: ok.map(itemLine), kinds: ok.map(x => x.kind), cmds }; }
    } catch { /* no key on the server yet, the free limit, or offline: carry on */ }
  }
  // Budgie's own AI on its server (a large open model on Cloudflare): no key needed.
  try {
    const d = new Date();
    const { items } = await budgieBreakdown(text, isoDay(d), d.toLocaleDateString('en-US', { weekday: 'long' }), Intl.DateTimeFormat().resolvedOptions().timeZone, myCategories(), all.slice(0, 200), myOpen());
    const cmds = (items || []).map(fromItem).filter(Boolean);
    const ok = (items || []).filter(x => x.action === 'add' || !x.action).filter(x => real(x.title));
    if ((ok.length || cmds.length) && fair(ok.length + cmds.length)) { capture.via = 'Budgie AI'; return { lines: ok.map(itemLine), kinds: ok.map(x => x.kind), cmds }; }
  } catch { /* offline or busy: the device's AI or the rules take over */ }
  if (ai.enabled && ai.ready) {
    // Chunks of a few sentences each, cut at the rules' own breaks, so a small model reads each part fully.
    const chunks = [];
    let cur = '';
    for (const line of split) { if (cur && cur.length + line.length > 500) { chunks.push(cur); cur = ''; } cur += (cur ? '. ' : '') + line; }
    if (cur) chunks.push(cur);
    const items = await aiExtractItems(chunks, myCategories()).catch(() => null);
    // The small model only adds; the rules already caught the commands.
    const ok = (items || []).filter(x => real(x.title) && !ruleCmds.some(c => c.said.toLowerCase().includes(x.title.toLowerCase())));
    if (ok.length && fair(ok.length + ruleCmds.length)) { capture.via = 'on-device AI'; return { lines: ok.map(localLine), kinds: ok.map(x => x.kind), cmds: ruleCmds }; }
  }
  capture.via = 'rules';
  return { lines: rules, kinds: null, cmds: ruleCmds };
}

export async function sortAndPlace(text = capture.text, { spoken = false, audio = null } = {}) {
  if (!text.trim() && !audio) return 0;
  capture.sorting = true;
  // Spoken or typed, one long run of words is broken into every separate thing.
  const { lines, kinds, cmds = [] } = await breakDown(text, audio);
  const changed = runCommands(cmds);
  const rows = (kinds ? lines.map((l, i) => withKind(route(l), kinds[i])) : routeAll(lines.join('\n'))).filter(r => r.text && !isNotTask(r.text) && !isNotTask(r.task?.title));
  if (!rows.length) { capture.sorting = false; if (changed) { capture.text = ''; capture.open = false; } return changed; }
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
