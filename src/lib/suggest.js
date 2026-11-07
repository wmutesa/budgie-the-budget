// Task ideas Budgie offers in the Planner, from rules over your own data:
// deadlines without a plan, exams to review for, goals without a next step,
// gaps in your routine and the weekly review. Free and instant; the on-device AI can
// add more ideas on request (see ai.js).
import { computed } from 'vue';
import { store } from './store';
import { today, addDays, dayDiff, occursOn, isDone, timeLabel, nextOccurrence } from './tasks';

const has = re => store.tasks.some(t => re.test(t.title));
const hasOpen = re => store.tasks.some(t => re.test(t.title) && (t.repeat ? nextOccurrence(t) : !t.done));

export const suggestions = computed(() => {
  const now = today();
  const out = [];
  const add = s => { if (!store.dismissed.includes(s.id)) out.push(s); };
  const open = store.tasks.filter(t => !t.repeat && !t.done);

  // Overdue pile-up: move it to today in one go.
  const overdue = open.filter(t => t.date && t.date < now);
  if (overdue.length >= 2) add({
    id: `overdue-${now}`, tone: 'warn', title: `Move ${overdue.length} overdue tasks to today`,
    why: 'Old dates hide what still needs doing. Bring them forward, then drop what no longer matters.',
    run: () => overdue.forEach(t => { t.date = now; }),
  });

  // Deadlines: start work early, and review before exams.
  for (const t of open) {
    if (!t.date) continue;
    const n = dayDiff(now, t.date);
    const name = t.title.replace(/^(submit|finish|do)\s+/i, '');
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 40);
    if (t.kind === 'assignment' && n >= 1 && n <= 7 && !hasOpen(new RegExp(`(work on|start|draft).*${esc}`, 'i'))) add({
      id: `start-${t.id}`, tone: n <= 2 ? 'warn' : 'info', title: `Work on ${name} today`,
      why: `Due ${n === 1 ? 'tomorrow' : `in ${n} days`}. A one-hour session now makes the deadline easy.`,
      task: { title: `Work on ${name}`, date: now, mins: 60, kind: 'assignment', project: t.project, priority: n <= 2 ? 'high' : 'medium' },
    });
    if (t.kind === 'exam' && n >= 1 && n <= 10 && !has(new RegExp(`review.*${esc}`, 'i'))) add({
      id: `review-${t.id}`, tone: 'info', title: `Review for ${name} every day until then`,
      why: `${n} day${n === 1 ? '' : 's'} to go. Short daily reviews beat one long night.`,
      task: { title: `Review for ${name}`, date: now, mins: 45, kind: 'exam', project: t.project, priority: 'high', repeat: { every: 'day', until: addDays(t.date, -1) } },
    });
  }

  // Goals: give each one a plan, and keep a next step on the calendar.
  for (const g of store.goals) {
    const linked = store.tasks.filter(t => t.goalId === g.id);
    const open = linked.filter(t => !t.repeat && !t.done);
    if (!linked.length) add({
      id: `goal-plan-${g.id}`, tone: 'good', title: `Break “${g.title}” into milestones`,
      why: 'A goal with steps on the calendar is far more likely to happen. Budgie spreads them out up to your date.',
      goal: g,
    });
    else if (!open.some(t => t.date && dayDiff(now, t.date) <= 7)) add({
      id: `goal-next-${g.id}-${now}`, tone: 'info', title: `Take one step for “${g.title}” this week`,
      why: 'Nothing for this goal is planned in the next seven days.',
      task: { title: `Next step for ${g.title}`, date: addDays(now, 1), mins: 30, kind: 'task', goalId: g.id, project: g.title.slice(0, 40) },
    });
  }

  // Routine gaps, once you have a routine.
  const routine = store.tasks.filter(t => t.source === 'routine' || t.kind === 'routine');
  if (routine.length >= 3) {
    if (!has(/gym|workout|work out|run|jog|exercise|yoga|swim|walk/i)) add({
      id: 'idea-exercise', tone: 'good', title: 'Move your body three times a week',
      why: 'Your routine has no exercise yet. Three short sessions a week is a good start.',
      task: { title: 'Gym', time: '18:00', mins: 45, kind: 'routine', repeat: { every: 'week', days: [1, 3, 5] }, date: now },
    });
    if (!has(/call|text|see|visit|friends?|family|mom|dad|parents/i)) add({
      id: 'idea-friends', tone: 'good', title: 'Call a friend or family every Sunday',
      why: 'Nothing in your planner keeps you in touch with people. A weekly call is easy to keep.',
      task: { title: 'Call a friend or family', time: '17:00', mins: 20, kind: 'routine', repeat: { every: 'week', days: [0] }, date: now },
    });
  }
  if (store.tasks.length >= 5 && !has(/weekly review|plan (the|my|next) week/i)) add({
    id: 'idea-weekly-review', tone: 'info', title: 'Plan your week every Sunday',
    why: 'Fifteen minutes to look back, clear what is late and plan the week ahead. Budgie fills in the numbers.',
    task: { title: 'Weekly review', time: '19:00', mins: 15, kind: 'routine', repeat: { every: 'week', days: [0] }, date: now },
  });

  return out.slice(0, 8);
});

// Facts for the AI when you ask it for more ideas.
export function plannerFacts() {
  const now = today();
  const soon = store.tasks.filter(t => !t.repeat && !t.done && t.date && dayDiff(now, t.date) <= 14).slice(0, 15)
    .map(t => `${t.title} (${t.kind}, ${t.date}${t.time ? ` ${timeLabel(t.time)}` : ''})`);
  const routine = store.tasks.filter(t => t.repeat).slice(0, 15).map(t => `${t.title}${t.time ? ` at ${timeLabel(t.time)}` : ''}`);
  const doneToday = store.tasks.filter(t => isDone(t, now) && (t.repeat ? occursOn(t, now) : true)).length;
  return [
    `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
    `Coming up: ${soon.join('; ') || 'nothing'}.`,
    `Routine: ${routine.join('; ') || 'none yet'}.`,
    `Done today: ${doneToday}.`,
    store.goals.length ? `Goals: ${store.goals.map(g => `${g.title}${g.by ? ` by ${g.by}` : ''}`).join('; ')}.` : '',
  ].filter(Boolean);
}
