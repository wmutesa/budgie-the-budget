// One search for everything in Budgie: tasks, routines and classes, goals,
// digest stories, calendars and pages. What you type can also become an
// action (add a task, a routine or a goal), ranked by the shape of the text.
import { store } from './store';
import { parseTask, addFromText, dayLabel, timeLabel, nextOccurrence, KINDS } from './tasks';
import { parseGoal, makeGoal, planGoal, progress, GOAL_WORDS } from './goals';
import { digests } from './digest';
import { go } from './nav';

const PLACES = [
  ['Today', 'Today', 'Your day, goals and the latest digest', /today|home|overview|dashboard|brief/],
  ['Planner', 'Planner', 'Tasks, deadlines, classes and routines', /plan|task|todo|to do|deadline|assignment|class|agenda|schedule/],
  ['Planner', 'Calendar', 'Day, week and month view of your plans', /calendar|week|month|day view|schedule/, 'Calendar'],
  ['Planner', 'Focus', 'Top three and a focus timer', /focus|timer|pomodoro|top three/, 'Focus'],
  ['Planner', 'Import a calendar', 'Canvas, Google, Apple or Outlook', /canvas|google|outlook|apple|ical|import/, null, '#calendars'],
  ['Digests', 'Digests', 'Your twice-weekly brief of opportunities and news', /digest|brief|news|newsletter|opportunit|intern|scholarship|event|draft|email/],
  ['Digests', 'Digest profile', 'What your digest looks for', /profile|interests|keywords|sources|feeds?/, null, '#digest-profile'],
  ['Playground', 'Playground', 'Add anything; goals, routines and projects', /playground|inbox|add|write|say/],
  ['Playground', 'Goals', 'Life goals with milestones', /goal|milestone|dream|aim/, null, '#goals'],
  ['Playground', 'Build my routine', 'Wake, sleep and your week, drafted by AI', /routine|habit|wake|sleep|morning/, null, '#routine'],
  ['Playground', 'Projects', 'Colours and names for your projects', /project|category|categories|tag/, null, '#projects'],
];

const has = (hay, q) => String(hay || '').toLowerCase().includes(q);

// Actions for the typed text: a goal when it sounds like one, otherwise a task or routine.
export function actionsFor(text) {
  const q = text.trim();
  if (q.length < 3) return [];
  const task = parseTask(q);
  const bits = [task.date && dayLabel(task.date), task.time && timeLabel(task.time), task.repeat && 'repeats', task.project && `#${task.project}`].filter(Boolean).join(' · ');
  const addTask = { id: 'act-task', icon: 'plus', title: `Add “${task.title}” to Planner`, sub: [task.repeat ? 'Routine' : KINDS[task.kind].label, bits].filter(Boolean).join(' · '), run: () => { const [t] = addFromText(q); go('Planner', { task: t.id }); } };
  const g = parseGoal(q);
  const addGoal = { id: 'act-goal', icon: 'target', title: `Set a goal: “${g.title}”`, sub: `${g.by ? `By ${dayLabel(g.by)} · ` : ''}milestones added for you`, run: async () => { const goal = makeGoal(g); await planGoal(goal); go('Playground', { anchor: '#goals' }); } };
  return GOAL_WORDS.test(q) && !task.time ? [addGoal, addTask] : [addTask, addGoal];
}

// Everything that matches, in groups. Groups for the current page come first.
export function search(text, page) {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const groups = [];
  const tasks = store.tasks.filter(t => has(t.title, q) || has(t.project, q) || has(t.notes, q) || has(KINDS[t.kind]?.label, q))
    .sort((a, b) => Number(a.done) - Number(b.done)).slice(0, 6)
    .map(t => {
      const d = t.repeat ? nextOccurrence(t) : t.date;
      return { id: `t-${t.id}`, icon: t.done ? 'check' : t.repeat ? 'repeat' : 'list', color: KINDS[t.kind]?.color, title: t.title, sub: [KINDS[t.kind]?.label, d && dayLabel(d), t.time && timeLabel(t.time), t.project && `#${t.project}`, t.done && 'done'].filter(Boolean).join(' · '), run: () => go('Planner', { task: t.id }) };
    });
  if (tasks.length) groups.push({ name: 'Planner', page: 'Planner', items: tasks });
  const goals = store.goals.filter(g => has(g.title, q) || has(g.why, q)).slice(0, 4)
    .map(g => { const p = progress(g); return { id: `g-${g.id}`, icon: 'target', color: g.color, title: g.title, sub: `Goal · ${p.done} of ${p.all} done${g.by ? ` · by ${dayLabel(g.by)}` : ''}`, run: () => go('Playground', { anchor: '#goals' }) }; });
  if (goals.length) groups.push({ name: 'Goals', page: 'Playground', items: goals });
  const ed = digests.current;
  const stories = ed ? [ed.lead, ...(ed.stories || [])].filter(s => s && (has(s.headline, q) || has(s.desc || s.dek, q) || has(s.tag, q))).slice(0, 4)
    .map((s, i) => ({ id: `d-${i}-${s.headline}`, icon: 'list', title: s.headline, sub: `Digest · ${s.tag || 'Lead'}${s.deadline ? ` · ${s.deadline}` : ''}`, run: () => go('Digests') })) : [];
  if (stories.length) groups.push({ name: 'Digest', page: 'Digests', items: stories });
  const feeds = store.feeds.filter(f => has(f.name, q)).map(f => ({ id: `f-${f.id}`, icon: 'calendar', title: f.name, sub: `Calendar · ${f.count} events`, run: () => go('Planner', { anchor: '#calendars' }) }));
  if (feeds.length) groups.push({ name: 'Calendars', page: 'Planner', items: feeds });
  const places = PLACES.filter(([, title, , re]) => has(title, q) || re.test(q)).slice(0, 4)
    .map(([p, title, sub, , view, anchor]) => ({ id: `p-${title}`, icon: 'right', title, sub, run: () => { if (view) store.planner.view = view; go(p, { anchor: anchor || '' }); } }));
  if (places.length) groups.push({ name: 'Go to', items: places });
  return groups.sort((a, b) => Number(b.page === page) - Number(a.page === page));
}

// The search box's hint for each page.
export const HINTS = {
  Today: 'Search or add anything: tasks, goals, digest stories',
  Planner: 'Search tasks, or type one to add it',
  Digests: 'Search digest stories, or add a task',
  Playground: 'Search goals and tasks, or add one',
};
