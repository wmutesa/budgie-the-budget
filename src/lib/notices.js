// What the bell shows: today's plan, what is late, deadlines tomorrow, goal
// dates coming up and a new digest. Every notice comes from your own data.
import { computed } from 'vue';
import { store } from './store';
import { today, addDays, occurrences, dayLabel } from './tasks';
import { progress } from './goals';
import { digests, isRead } from './digest';
import { go } from './nav';

const open = page => ({ label: `Open ${page}`, run: () => go(page) });

export const cards = computed(() => {
  const d = today();
  const out = [];
  const late = store.tasks.filter(t => !t.repeat && !t.done && t.date && t.date < d);
  if (late.length) out.push({ id: `plan-late-${d}`, tone: 'warn', title: `${late.length} overdue task${late.length === 1 ? '' : 's'}`, body: `${late.slice(0, 3).map(t => t.title).join(', ')}. Do them, move them or let them go.`, action: open('Planner') });
  store.tasks.filter(t => !t.repeat && !t.done && t.date === addDays(d, 1) && ['assignment', 'exam'].includes(t.kind))
    .forEach(t => out.push({ id: `plan-due-${t.id}`, tone: 'warn', title: `${t.title} is due ${dayLabel(t.date).toLowerCase()}`, body: t.project ? `For ${t.project}.` : 'Leave time for it today.', action: open('Planner') }));
  const left = occurrences(d, d).filter(x => !x.done && x.task.kind !== 'routine');
  if (left.length) out.push({ id: `plan-today-${d}`, tone: 'info', title: `${left.length} thing${left.length === 1 ? '' : 's'} on today`, body: left.slice(0, 4).map(x => x.task.title).join(', ') + (left.length > 4 ? ` and ${left.length - 4} more.` : '.'), action: open('Planner') });
  for (const g of store.goals) {
    const p = progress(g);
    if (p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 14 && p.pct < 100) out.push({ id: `goal-soon-${g.id}-${g.by}`, tone: 'warn', title: `${g.title}: ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left`, body: `${p.done} of ${p.all} steps done.${p.next ? ` Next: ${p.next.title}.` : ''}`, action: { label: 'Open goals', run: () => go('Playground', { anchor: '#goals' }) } });
  }
  const ed = digests.current;
  if (ed && !isRead(ed)) out.push({ id: `digest-${ed.stream}-${ed.id}`, tone: 'good', title: `New digest: ${ed.name || 'My brief'}, ${ed.edition}`, body: ed.preheader || ed.lead?.headline || '', action: open('Digests') });
  return out.filter(c => !store.dismissed.includes(c.id));
});
