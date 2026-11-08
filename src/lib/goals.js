// Life goals: "Get a summer internship", "Run a 10K by March". Each goal has
// milestones, and each milestone is a Planner task (linked by goalId), so
// progress comes from what you actually tick off.
//
// A goal: { id, title, why, by: 'YYYY-MM-DD' or '', color, createdAt, milestones: [{ id, title, date, taskId }] }
import { titleCase } from './titles';
import { store, newId } from './store';
import { makeTask, today, addDays, dayDiff, isoDay, isDone } from './tasks';
import { ai, aiMilestones } from './ai';

export const GOAL_COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#db2777', '#0891b2'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "run a 10K by March", "goal: get an internship by summer", "learn Spanish this year".
export function parseGoal(raw, now = new Date()) {
  let text = String(raw).trim().replace(/^(my |new )?goal:?\s*|^i (want|would like|hope|plan) to\s+|^(aim|try) to\s+/i, '');
  let by = '';
  const endOf = (y, m) => isoDay(new Date(y, m + 1, 0));
  const y = now.getFullYear();
  const take = (re, fn) => { const m = text.match(re); if (m) { by = fn(m); text = text.replace(m[0], ' '); } return Boolean(m); };
  take(/\b(?:by|before|in)\s+(?:the\s+)?(?:end of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i, m => {
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    let yr = m[2] ? Number(m[2]) : y;
    if (!m[2] && endOf(yr, mi) < today()) yr += 1;
    return endOf(yr, mi);
  }) ||
    take(/\b(?:by|before|this|for)\s+(?:the\s+)?(summer|spring|fall|autumn|winter)(?:\s+(\d{4}))?\b/i, m => {
      const start = { spring: 2, summer: 5, fall: 8, autumn: 8, winter: 11 }[m[1].toLowerCase()];
      let yr = m[2] ? Number(m[2]) : y;
      if (!m[2] && isoDay(new Date(yr, start, 1)) < today()) yr += 1;
      return isoDay(new Date(yr, start, 1));
    }) ||
    take(/\b(?:by\s+)?(?:the\s+)?end of (?:the\s+)?year|\bthis year\b/i, () => endOf(y, 11)) ||
    take(/\bin\s+(\d+|a|one|two|three|six)\s+(week|month)s?\b/i, m => {
      const n = { a: 1, one: 1, two: 2, three: 3, six: 6 }[m[1].toLowerCase()] || Number(m[1]);
      const d = new Date(now); m[2].toLowerCase() === 'week' ? d.setDate(d.getDate() + 7 * n) : d.setMonth(d.getMonth() + n);
      return isoDay(d);
    }) ||
    take(/\bby\s+(\d{4}-\d{2}-\d{2})\b/, m => m[1]);
  let title = text.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title: titleCase(title) || 'New goal', by };
}

// Does a line sound like a goal rather than a task?
export const GOAL_WORDS = /^(my |new )?goal:?\s|^i (want|would like|hope|plan) to\b|^(aim|try) to\b|\b(become|get (a|an|into)|land (a|an)|learn|master|run (a|an) \d+k|lose \d+|read \d+ books|be able to|improve my|get better at|launch|grow my)\b/i;

export function makeGoal({ title, why = '', by = '' }) {
  const color = GOAL_COLORS[store.goals.length % GOAL_COLORS.length];
  const goal = { id: newId(), title, why, by, color, createdAt: new Date().toISOString(), milestones: [] };
  store.goals.unshift(goal);
  return store.goals[0];
}

// Steps from rules, by the kind of goal.
export function ruleMilestones(goal) {
  const t = goal.title.toLowerCase();
  if (/intern|job|role|position|offer/.test(t)) return ['List 15 places that fit and their deadlines', 'Update your CV and LinkedIn', 'Ask two people for feedback on your CV', 'Send the first five applications', 'Reach out to three people who work there', 'Practise interviews twice'];
  if (/run|marathon|10k|5k|fitness|gym|lose|weight|strength|swim/.test(t)) return ['Do a baseline session and note it', 'Follow a plan three times a week for a month', 'Increase by about 10% each week', 'Do a test at three quarters of the way', 'Rest well the week before'];
  if (/learn|language|course|study|master|certificat/.test(t)) return ['Pick one course or book', 'Study 30 minutes on five days a week', 'Finish the first quarter', 'Make something small with what you learned', 'Review and test yourself'];
  if (/build|launch|app|website|project|startup|portfolio/.test(t)) return ['Write one paragraph on what it is and who it is for', 'Sketch the smallest useful version', 'Build the first working piece', 'Show it to three people and note what they say', 'Finish and share it'];
  if (/read|books?/.test(t)) return ['Choose the books', 'Read 20 pages a day', 'Finish the first book', 'Keep a one-line note per book'];
  if (/scholarship|apply|admission|grad school|university|college/.test(t)) return ['List the options and their deadlines', 'Gather documents and grades', 'Draft the personal statement', 'Ask for recommendation letters', 'Submit and save confirmations'];
  return [`Decide what "done" looks like for ${goal.title}`, 'Break the first month into weekly steps', 'Do the first step this week', 'Check progress halfway', 'Finish and look back'];
}

// Add milestones as Planner tasks, spread evenly from today to the goal date
// (or one a week when there is no date).
export function addMilestones(goal, titles) {
  const start = today();
  const span = goal.by && goal.by > start ? dayDiff(start, goal.by) : titles.length * 7;
  titles.forEach((title, i) => {
    const date = addDays(start, Math.max(1, Math.round((span * (i + 1)) / titles.length)));
    const task = makeTask({ title, date: goal.by && date > goal.by ? goal.by : date, kind: 'task', project: goal.title.slice(0, 40), goalId: goal.id, source: 'goal' });
    store.tasks.push(task);
    goal.milestones.push({ id: newId(), title, date: task.date, taskId: task.id });
  });
}

// Fill a goal with milestones: the on-device AI when ready, rules otherwise. Returns who wrote them.
export async function planGoal(goal) {
  let steps = null;
  let by = 'Built-in rules';
  if (ai.enabled && ai.ready) {
    steps = await aiMilestones(goal).catch(() => null);
    if (steps) by = ai.used.plan || 'AI';
  }
  addMilestones(goal, steps || ruleMilestones(goal));
  return by;
}

// How far along a goal is: milestones done, plus other tasks linked to it.
export function progress(goal) {
  const linked = store.tasks.filter(t => t.goalId === goal.id && !t.repeat);
  const done = linked.filter(t => isDone(t)).length;
  const next = linked.filter(t => !isDone(t) && t.date).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const habits = store.tasks.filter(t => t.goalId === goal.id && t.repeat);
  return { done, all: linked.length, pct: linked.length ? Math.round((done / linked.length) * 100) : 0, next, habits, daysLeft: goal.by ? dayDiff(today(), goal.by) : null };
}

export function removeGoal(goal, { keepTasks = false } = {}) {
  store.goals = store.goals.filter(g => g.id !== goal.id);
  if (keepTasks) store.tasks.forEach(t => { if (t.goalId === goal.id) delete t.goalId; });
  else store.tasks = store.tasks.filter(t => t.goalId !== goal.id || isDone(t));
}
