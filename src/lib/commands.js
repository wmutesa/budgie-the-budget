// Voice commands on what is already in the planner: "mark the lab report as
// done", "delete the dentist task", "move the essay to Friday", "make problem
// set 7 high priority". A sentence counts as a command only when it clearly
// names one open task; otherwise it is a new thing to add, as before.
import { store } from './store';
import { parseTask, toggleDone, today, dayLabel } from './tasks';
import { toast } from './toast';

const STOP = new Set(['the', 'task', 'tasks', 'about', 'my', 'for', 'one', 'that', 'this', 'thing', 'item', 'and', 'with', 'from', 'all']);
const words = s => (String(s).toLowerCase().replace(/#/g, ' ').match(/[a-z]{3,}|\d+/g) || []).filter(w => !STOP.has(w));
const open = () => store.tasks.filter(t => !t.pending && (!t.done || t.repeat));

// The one open task a spoken name points to, or null when none or several fit.
export function matchTask(name, list = open()) {
  const want = words(name);
  if (!want.length) return null;
  const scored = list.map(t => {
    const have = new Set(words(`${t.title} ${t.project || ''}`));
    const hit = want.filter(w => have.has(w) || [...have].some(h => h.length > 4 && w.length > 4 && (h.startsWith(w) || w.startsWith(h)))).length;
    return { t, s: hit / want.length, exact: t.title.toLowerCase() === String(name).toLowerCase().trim() };
  }).filter(x => x.s >= 0.6).sort((a, b) => b.exact - a.exact || b.s - a.s);
  if (!scored.length) return null;
  if (scored[0].exact) return scored[0].t;
  return scored.length > 1 && scored[1].s === scored[0].s ? null : scored[0].t;
}

// Rules: the command sentences Budgie knows, matched only at the start of a sentence.
const PATTERNS = [
  { act: 'done', re: /^(?:please\s+)?(?:mark|tick|check off|set)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)$/i },
  { act: 'done', re: /^(?:please\s+)?(?:tick off|check off|cross off)\s+(.+)$/i },
  { act: 'done', re: /^i\s+(?:already\s+|just\s+)?(?:finished|completed|did|submitted|handed in|turned in)\s+(.+)$/i },
  { act: 'done', re: /^(.+?)\s+(?:is|are)\s+(?:done|finished|complete|completed|submitted)$/i },
  { act: 'delete', re: /^(?:please\s+)?(?:delete|remove|cancel|drop|scrap)\s+(.+)$/i },
  { act: 'move', re: /^(?:please\s+)?(?:move|push|reschedule|postpone|shift)\s+(.+?)\s+(?:to|until|till)\s+(.+)$/i },
  { act: 'priority', re: /^(?:please\s+)?(?:make|set|mark|change)\s+(.+?)\s+(?:to\s+|as\s+)?(high|low|medium|normal|top)\s+priority$/i },
];
const clean = s => String(s).replace(/^(?:the|my)\s+/i, '').replace(/\s+(?:task|one)$/i, '').trim();

export function readCommand(line) {
  const s = String(line).replace(/[.!?]+$/, '').trim();
  for (const p of PATTERNS) {
    const m = s.match(p.re);
    if (!m) continue;
    const target = clean(m[1]);
    const task = matchTask(target);
    if (!task) return null;
    const cmd = { act: p.act, task, said: s };
    if (p.act === 'move') { cmd.date = parseTask(`x ${m[2]}`).date; if (!cmd.date) return null; }
    if (p.act === 'priority') cmd.priority = /high|top/i.test(m[2]) ? 'high' : /low/i.test(m[2]) ? 'low' : 'medium';
    return cmd;
  }
  return null;
}

// Gemini's actions, checked against the planner like the rules' ones.
export function fromItem(x) {
  if (!x?.action || x.action === 'add') return null;
  const task = matchTask(x.target || x.title);
  if (!task) return null;
  const cmd = { act: x.action, task, said: x.target || x.title };
  if (x.action === 'move') { cmd.date = x.date; if (!cmd.date) return null; }
  if (x.action === 'priority') cmd.priority = x.priority === 'high' ? 'high' : x.priority === 'low' ? 'low' : 'medium';
  return ['done', 'delete', 'move', 'priority'].includes(x.action) ? cmd : null;
}

// Apply them all at once, with one Undo for the lot.
export function runCommands(cmds) {
  const seen = new Set();
  const list = cmds.filter(c => c && !seen.has(`${c.act}:${c.task.id}`) && seen.add(`${c.act}:${c.task.id}`));
  if (!list.length) return 0;
  // Copies of only the touched tasks, so Undo leaves anything added since alone.
  const before = list.map(c => { const i = store.tasks.findIndex(x => x.id === c.task.id); return i < 0 ? null : { i, copy: JSON.parse(JSON.stringify(store.tasks[i])) }; }).filter(Boolean);
  const said = [];
  for (const c of list) {
    const t = store.tasks.find(x => x.id === c.task.id);
    if (!t) continue;
    if (c.act === 'done') { toggleDone(t, t.repeat ? today() : undefined); said.push(`Done: ${t.title}`); }
    else if (c.act === 'delete') { store.tasks = store.tasks.filter(x => x.id !== t.id); said.push(`Deleted: ${t.title}`); }
    else if (c.act === 'move') { t.date = c.date; said.push(`Moved: ${t.title} to ${dayLabel(c.date, today())}`); }
    else if (c.act === 'priority') { t.priority = c.priority; said.push(`${c.priority === 'high' ? 'High' : c.priority === 'low' ? 'Low' : 'Normal'} priority: ${t.title}`); }
  }
  toast(said.join(' · '), { kind: 'success', title: said.length === 1 ? 'Updated from what you said' : `${said.length} changes from what you said`, ms: 9000, action: { label: 'Undo', run: () => { for (const b of before.sort((a, c) => a.i - c.i)) { const j = store.tasks.findIndex(x => x.id === b.copy.id); if (j >= 0) store.tasks.splice(j, 1, b.copy); else store.tasks.splice(Math.min(b.i, store.tasks.length), 0, b.copy); } } } });
  return said.length;
}

// "…to my Work list" or "on the Chemistry board" names the category.
export const listToTag = line => String(line).replace(/\s+(?:to|in|on|into|under)\s+(?:my|the)\s+([A-Za-z][\w-]*(?:\s[A-Za-z][\w-]*)?)\s+(?:list|board|category|folder)\b/i, (_, n) => ` #${n.trim().replace(/\s+/g, '-')}`);

// Rules: pull the command sentences out; the rest is new things to add.
export function pullCommands(lines) {
  const cmds = [], rest = [];
  for (const l of lines) { const c = readCommand(l); if (c) cmds.push(c); else rest.push(listToTag(l)); }
  return { cmds, rest };
}
