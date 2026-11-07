// Sample data, to see how Budgie looks and runs when it is full. Every item it
// adds is marked `sample: true`, so removing it leaves your own things alone.
import { store, newId } from './store';
import { makeTask, today, addDays, fromIso, isoDay } from './tasks';
import { ruleMilestones, GOAL_COLORS } from './goals';

const PROJECTS = {
  Chemistry: '#7c3aed', English: '#0ea5e9', Work: '#f59e0b', Health: '#16a34a', Personal: '#e11d48',
  Calculus: '#6366f1', History: '#a16207', Spanish: '#db2777', Finance: '#0d9488', Family: '#ea580c',
  Music: '#9333ea', 'Side project': '#0891b2', Volunteering: '#65a30d', Home: '#64748b',
};
const pick = (list, i) => list[i % list.length];

export const hasSample = () => store.tasks.some(t => t.sample) || store.goals.some(g => g.sample);

// `size` is roughly how many one-off tasks to spread over the past and next few weeks.
export function addSample(size = 420) {
  removeSample();
  const d0 = today();
  const out = [];
  const add = f => out.push(makeTask({ source: 'sample', sample: true, ...f }));

  // Classes and routines that repeat.
  add({ title: 'CHEM 110 lecture', kind: 'class', project: 'Chemistry', time: '10:00', mins: 75, repeat: { every: 'week', days: [1, 3] }, date: addDays(d0, -21), notes: 'Room 204' });
  add({ title: 'ENGL 101 seminar', kind: 'class', project: 'English', time: '13:30', mins: 75, repeat: { every: 'week', days: [2, 4] }, date: addDays(d0, -21) });
  add({ title: 'Chemistry lab', kind: 'class', project: 'Chemistry', time: '15:00', mins: 120, repeat: { every: 'week', days: [5] }, date: addDays(d0, -21) });
  add({ title: 'Team stand-up', kind: 'event', project: 'Work', time: '09:00', mins: 15, repeat: { every: 'weekdays' }, date: addDays(d0, -21) });
  add({ title: 'Gym', kind: 'routine', project: 'Health', time: '18:00', mins: 60, repeat: { every: 'week', days: [1, 3, 5] }, date: addDays(d0, -21) });
  add({ title: 'Read before bed', kind: 'routine', project: 'Personal', time: '22:00', mins: 30, repeat: { every: 'day' }, date: addDays(d0, -21) });
  add({ title: 'Call home', kind: 'routine', project: 'Family', time: '17:00', mins: 30, repeat: { every: 'week', days: [0] }, date: addDays(d0, -21) });
  add({ title: 'MATH 201 lecture', kind: 'class', project: 'Calculus', time: '08:30', mins: 50, repeat: { every: 'week', days: [1, 3, 5] }, date: addDays(d0, -21), notes: 'Hall B' });
  add({ title: 'HIST 140 discussion', kind: 'class', project: 'History', time: '11:00', mins: 50, repeat: { every: 'week', days: [2, 4] }, date: addDays(d0, -21) });
  add({ title: 'Spanish practice', kind: 'routine', project: 'Spanish', time: '07:30', mins: 15, repeat: { every: 'day' }, date: addDays(d0, -21) });
  add({ title: 'Piano practice', kind: 'routine', project: 'Music', time: '19:30', mins: 30, repeat: { every: 'week', days: [1, 2, 4] }, date: addDays(d0, -21) });
  add({ title: 'Food bank shift', kind: 'event', project: 'Volunteering', time: '10:00', mins: 180, repeat: { every: 'week', days: [6] }, date: addDays(d0, -21) });
  add({ title: 'Check spending', kind: 'routine', project: 'Finance', time: '20:30', mins: 15, repeat: { every: 'week', days: [0] }, date: addDays(d0, -21) });
  add({ title: 'Laundry', kind: 'routine', project: 'Home', time: '16:00', mins: 45, repeat: { every: 'week', days: [6] }, date: addDays(d0, -21) });
  // Ticked days, so streaks show.
  for (const t of out) {
    if (!t.repeat) continue;
    t.doneDates = [];
    for (let i = 1; i <= 14; i++) if ((i * 7 + t.title.length) % 5) t.doneDates.push(addDays(d0, -i));
  }

  // Today, full like the picture: timed blocks in several categories, with steps.
  add({ title: 'Meeting with the lab group', kind: 'event', project: 'Chemistry', date: d0, time: '08:00', mins: 30 });
  add({ title: 'Research for the essay', kind: 'assignment', project: 'English', date: d0, time: '13:00', mins: 150, notes: 'Sources on climate fiction',
    subtasks: [['Library database', true], ['Two journal articles', true], ['Interview notes', false], ['Outline', false]].map(([title, done]) => ({ id: newId(), title, done })) });
  add({ title: 'Send the weekly report', kind: 'task', project: 'Work', date: d0, time: '11:00', mins: 45, priority: 'high' });
  add({ title: 'Plan a personal website', kind: 'task', project: 'Personal', date: d0, time: '09:30', mins: 90,
    subtasks: [['Pick a domain', true], ['Sketch the pages', false], ['Write the about page', false]].map(([title, done]) => ({ id: newId(), title, done })) });
  add({ title: 'Lunch with Maya', kind: 'event', project: 'Personal', date: d0, time: '12:00', mins: 60 });
  add({ title: 'Problem set 6', kind: 'assignment', project: 'Chemistry', date: d0, time: '16:30', mins: 90, priority: 'high' });
  add({ title: 'Give feedback on the design', kind: 'task', project: 'Work', date: d0, time: '15:40', mins: 20 });
  add({ title: 'Buy groceries', kind: 'task', project: 'Personal', date: d0 });
  add({ title: 'Reply to the advisor', kind: 'task', project: 'English', date: d0, done: true, doneAt: new Date().toISOString() });
  add({ title: 'Calculus problem set 8', kind: 'assignment', project: 'Calculus', date: d0, time: '14:00', mins: 60 });
  add({ title: 'Pay the phone bill', kind: 'task', project: 'Finance', date: d0, priority: 'high' });
  add({ title: 'Deploy the landing page', kind: 'task', project: 'Side project', date: d0, time: '19:00', mins: 45 });
  add({ title: 'Message Grandma', kind: 'task', project: 'Family', date: d0 });

  // Many one-off items over the past two weeks and the next four.
  const ITEMS = [
    ['Draft the lab report', 'assignment', 'Chemistry'], ['Review chapter 4 notes', 'task', 'Chemistry'], ['Organic chemistry quiz', 'exam', 'Chemistry'],
    ['Reading response', 'assignment', 'English'], ['Peer review session', 'event', 'English'], ['Finish the essay outline', 'task', 'English'],
    ['Prepare the client slides', 'task', 'Work'], ['Update the budget sheet', 'task', 'Work'], ['One-on-one with Priya', 'event', 'Work'],
    ['Dentist appointment', 'event', 'Health'], ['Yoga class', 'event', 'Health'], ['Meal prep', 'task', 'Health'],
    ['Fix the bike', 'task', 'Personal'], ['Book the trip to Denver', 'task', 'Personal'], ['Birthday dinner for Leo', 'event', 'Personal'],
    ['Derivatives worksheet', 'assignment', 'Calculus'], ['Calculus midterm', 'exam', 'Calculus'], ['Office hours with Dr. Ng', 'event', 'Calculus'],
    ['Primary source analysis', 'assignment', 'History'], ['Read chapter 9', 'task', 'History'], ['History quiz', 'exam', 'History'],
    ['Conversation club', 'event', 'Spanish'], ['Vocabulary list 12', 'task', 'Spanish'], ['Oral exam prep', 'task', 'Spanish'],
    ['Review the monthly budget', 'task', 'Finance'], ['Transfer to savings', 'task', 'Finance'], ['File the tax form', 'task', 'Finance'],
    ['Family dinner', 'event', 'Family'], ['Help Sam with homework', 'task', 'Family'], ['Video call with cousins', 'event', 'Family'],
    ['Band rehearsal', 'event', 'Music'], ['Learn a new song', 'task', 'Music'], ['Recital', 'event', 'Music'],
    ['Write the README', 'task', 'Side project'], ['Fix the login bug', 'task', 'Side project'], ['Ship version 0.2', 'task', 'Side project'],
    ['Beach clean-up', 'event', 'Volunteering'], ['Tutor at the library', 'event', 'Volunteering'], ['Sort donations', 'task', 'Volunteering'],
    ['Clean the kitchen', 'task', 'Home'], ['Water the plants', 'task', 'Home'], ['Call the landlord', 'task', 'Home'],
  ];
  for (let i = 0; i < size; i++) {
    const offset = (i * 7) % 43 - 14;               // -14 .. +28 days
    const date = addDays(d0, offset);
    const timed = i % 3 !== 0;
    const [title, kind, project] = pick(ITEMS, i * 13 + Math.floor(i / 43) * 7);
    add({
      title, kind, project, date,
      time: timed ? `${String(8 + (i % 12)).padStart(2, '0')}:${i % 2 ? '30' : '00'}` : '',
      mins: timed ? [30, 45, 60, 90][i % 4] : null,
      priority: i % 11 === 0 ? 'high' : i % 7 === 0 ? 'low' : 'medium',
      done: offset < 0 ? i % 9 !== 0 : false,
      doneAt: offset < 0 && i % 9 ? fromIso(date).toISOString() : null,
    });
  }

  // Goals with milestones linked to tasks.
  const goals = [
    ['Land a summer internship', addDays(d0, 120), 'To try lab work outside school'],
    ['Run a 10K', addDays(d0, 75), 'Feel stronger and sleep better'],
    ['Read 24 books this year', isoDay(new Date(fromIso(d0).getFullYear(), 11, 31)), ''],
  ].map(([title, by, why], gi) => {
    const g = { id: newId(), title, why, by, color: GOAL_COLORS[gi % GOAL_COLORS.length], createdAt: new Date().toISOString(), milestones: [], sample: true };
    const steps = ruleMilestones(g);
    steps.forEach((s, i) => {
      const date = addDays(d0, Math.round(((i + 1) / steps.length) * 60) - 10);
      const t = makeTask({ title: s, date, kind: 'task', project: title.slice(0, 40), goalId: g.id, source: 'sample', sample: true, done: date < d0 });
      out.push(t);
      g.milestones.push({ id: newId(), title: s, date, taskId: t.id });
    });
    return g;
  });

  store.tasks = [...out, ...store.tasks];
  store.goals = [...goals, ...store.goals];
  const colors = { ...store.projects };
  for (const [p, c] of Object.entries(PROJECTS)) if (!colors[p]) colors[p] = { color: c, sample: true };
  // Each goal's milestones share the goal's colour.
  for (const g of goals) { const p = g.title.slice(0, 40); if (!colors[p]) colors[p] = { color: g.color, sample: true }; }
  store.projects = colors;
  return { tasks: out.length, goals: goals.length };
}

export function removeSample() {
  const n = store.tasks.filter(t => t.sample).length + store.goals.filter(g => g.sample).length;
  store.tasks = store.tasks.filter(t => !t.sample);
  store.goals = store.goals.filter(g => !g.sample);
  store.projects = Object.fromEntries(Object.entries(store.projects || {}).filter(([, v]) => !v?.sample));
  return n;
}
