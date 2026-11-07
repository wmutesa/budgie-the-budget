// The Playground's inbox (and voice): write or say anything, one thing per
// line, and Budgie decides what each line is: a task (or event, class,
// deadline), a routine (something that repeats), or a life goal. You can
// change any choice before sending.
import { store, newId } from './store';
import { parseTask, makeTask, splitLines, dayLabel, timeLabel, today, KINDS, DAY_SHORT } from './tasks';
import { parseGoal, makeGoal, planGoal, GOAL_WORDS } from './goals';

export const DESTS = {
  task: { label: 'Task', icon: 'planner' },
  routine: { label: 'Routine', icon: 'repeat' },
  goal: { label: 'Goal', icon: 'target' },
};

// Read one line and pick what it is.
export function route(line) {
  const text = line.trim();
  const task = parseTask(text);
  const goal = parseGoal(text);
  let dest = 'task';
  if (task.repeat) dest = 'routine';
  else if (GOAL_WORDS.test(text) && !task.time) dest = 'goal';
  const why = { task: task.date ? 'Something to do on a day' : 'Something to do', routine: 'Something that repeats', goal: 'Something you are working towards: Budgie adds milestones' }[dest];
  return { id: newId(), text, dest, task, goal, why };
}
// Comma lists ("gym mwf 6pm, call mom sundays") become one line each when every part has a time or day.
const splitCommas = line => { const parts = line.split(/,\s*/).map(x => x.trim()).filter(Boolean); return parts.length > 1 && parts.every(x => parseTask(x).date || parseTask(x).repeat || parseTask(x).time) ? parts : [line]; };
export const routeAll = text => splitLines(text).flatMap(splitCommas).map(route);

// Speech has no line breaks. Split at sentence ends, "then", "also", "after
// that", and at "and" when what follows starts a new thing ("and remind me
// to…", "and gym on Monday"), but not inside "call mom and dad".
const STARTS = "(?:i |i've |i have |i need |i want |remind|remember|need to|have to|call|email|text|pay|buy|book|study|finish|submit|start|go to|meet|meeting|gym|my |add|schedule|learn|read|run|clean)";
const AND_SPLIT = new RegExp(`,?\\s+and\\s+(?=${STARTS})`, 'gi');
export function splitSpoken(text) {
  return String(text)
    .replace(/[.!?]+\s+/g, '\n')
    .replace(/,?\s+\b(?:and then|then|after that|also|plus)\b\s+/gi, '\n')
    .replace(AND_SPLIT, '\n')
    .split('\n')
    .map(s => s.trim().replace(/^(add|remind me to|remember to)\s+/i, '').replace(/[.,;]+$/, ''))
    .filter(s => s.length > 1);
}
export const routeSpoken = text => splitSpoken(text).map(route);

// What each choice will create.
export function preview(r, d) {
  const t = r.task;
  if (d === 'goal') return [r.goal.title, r.goal.by ? `by ${dayLabel(r.goal.by)}` : 'no date', 'milestones added for you'].join(' · ');
  const when = t.repeat ? (t.repeat.every === 'day' ? 'every day' : t.repeat.every === 'weekdays' ? 'weekdays' : t.repeat.every === 'month' ? 'monthly' : t.repeat.days?.map(x => DAY_SHORT[x]).join(' ')) : t.date && dayLabel(t.date);
  return [d === 'routine' ? 'Routine' : KINDS[t.kind].label, t.title, when, t.time && timeLabel(t.time), t.project && `#${t.project}`].filter(Boolean).join(' · ');
}

// Send the lines. Returns what was made, for the note and for Undo.
export async function sendAll(list) {
  const n = { task: 0, routine: 0, goal: 0, made: [] };
  for (const r of list) {
    const p = r.task;
    if (r.dest === 'goal') {
      const g = makeGoal({ title: r.goal.title, by: r.goal.by });
      await planGoal(g);
      n.made.push({ r, to: 'goal', id: g.id, label: g.title, sub: `${g.milestones.length} milestones${g.by ? ` · by ${dayLabel(g.by)}` : ''}` });
    } else {
      const routine = r.dest === 'routine';
      const t = makeTask({ title: p.title, date: p.date || (routine ? today() : ''), time: p.time, mins: p.mins, repeat: routine ? (p.repeat || { every: 'day' }) : null, priority: p.priority, project: p.project, kind: routine && p.kind === 'task' ? 'routine' : p.kind, source: 'playground' });
      store.tasks.unshift(t);
      n.made.push({ r, to: r.dest, id: t.id, label: t.title, sub: preview({ ...r, task: { ...p, repeat: t.repeat } }, r.dest).split(' · ').slice(2).join(' · ') });
    }
    n[r.dest]++;
  }
  return n;
}

// Take back everything one send created (goals take their milestone tasks with them).
export function undoSend(n) {
  const ids = new Set(n.made.map(m => m.id));
  store.goals = store.goals.filter(g => !ids.has(g.id));
  store.tasks = store.tasks.filter(t => !ids.has(t.id) && !ids.has(t.goalId));
}

// Switch something already added: a task becomes a routine or a goal, and so on.
// Returns the new entry for the list of what was added.
export async function switchMade(m, dest) {
  if (m.to === dest || !m.r) return m;
  undoSend({ made: [m] });
  const out = await sendAll([{ ...m.r, dest }]);
  return out.made[0];
}
