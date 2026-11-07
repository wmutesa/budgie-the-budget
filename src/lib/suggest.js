// Task ideas Budgie offers in the Planner, from rules over your own data:
// deadlines without a plan, exams to review for, renewals, goals, gaps in
// your routine and the weekly review. Free and instant; the on-device AI can
// add more ideas on request (see ai.js).
import { computed } from 'vue';
import { store, daysUntil } from './store';
import { today, addDays, dayDiff, occursOn, isDone, timeLabel, nextOccurrence } from './tasks';

const usd = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
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

  // Money: renewals soon, goals without a plan, entries waiting for a check.
  for (const s of store.subscriptions) {
    const n = daysUntil(s.next);
    if (n >= 0 && n <= 3 && !has(new RegExp(s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))) add({
      id: `renew-${s.id}-${s.next}`, tone: 'info', title: `Keep or cancel ${s.name}?`,
      why: `It renews ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}. Decide before you are charged.`,
      task: { title: `Keep or cancel ${s.name}`, date: now, kind: 'bill', priority: 'high' },
    });
  }
  for (const g of store.goals) {
    const left = (Number(g.target) || 0) - (Number(g.saved) || 0);
    if (left > 0 && !has(new RegExp(`(set aside|save|move).*${g.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))) {
      const each = Math.max(10, Math.round(left / 6 / 10) * 10);
      add({
        id: `goal-${g.id}`, tone: 'good', title: `Set aside ${usd(each)} for ${g.name} each month`,
        why: `${usd(left)} to go. ${usd(each)} a month gets you there in about six months.`,
        task: { title: `Set aside ${usd(each)} for ${g.name}`, date: now, kind: 'bill', cost: null, repeat: { every: 'month' } },
      });
    }
  }
  if (store.drafts.length) add({
    id: `drafts-${now}-${store.drafts.length}`, tone: 'info', title: `Check ${store.drafts.length} entr${store.drafts.length === 1 ? 'y' : 'ies'} waiting in Transactions`,
    why: 'They are not in your totals until you accept them.',
    task: { title: 'Check entries waiting in Transactions', date: now, mins: 5, kind: 'task' },
  });

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
    store.goals.length ? `Savings goals: ${store.goals.map(g => g.name).join(', ')}.` : '',
  ].filter(Boolean);
}
