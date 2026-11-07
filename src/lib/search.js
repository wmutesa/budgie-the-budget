// One search for everything in Budgie: tasks, routines and classes, spending,
// subscriptions, goals, accounts, calendars and pages. What you type can also
// become an action, such as adding a task or an entry, ranked by the page you
// are on and the shape of the text.
import { store } from './store';
import { parseTask, addFromText, dayLabel, timeLabel, nextOccurrence, KINDS } from './tasks';
import { captureNote, enrich } from './capture';
import { newId } from './store';
import { go } from './nav';

const PLACES = [
  ['Overview', 'Overview', 'Your month, net worth, goals and payments', /overview|home|dashboard|net worth|month|brief/],
  ['Planner', 'Planner', 'Tasks, deadlines, classes and routines', /plan|task|todo|to do|deadline|assignment|class|routine|habit|agenda|schedule/],
  ['Planner', 'Calendar', 'Day, week and month view of your plans', /calendar|week|month|day view|schedule/, 'Calendar'],
  ['Planner', 'Focus', 'Top three and a focus timer', /focus|timer|pomodoro|top three/, 'Focus'],
  ['Planner', 'Import a calendar', 'Canvas, Google, Apple or Outlook', /canvas|google|outlook|apple|ical|import/, null, '#calendars'],
  ['Planner', 'Build my routine', 'Wake, sleep and your week, drafted by AI', /routine|habit|wake|sleep|morning/, null, '#routine'],
  ['Transactions', 'Add spending', 'Type, say, scan or import', /spend|add|receipt|statement|expense|scan|csv|pdf/, null, '#capture'],
  ['Transactions', 'Budgets', 'Monthly limits by category', /budget|limit/, null, '#budgets'],
  ['Transactions', 'Accounts', 'Balances you track', /account|bank|balance|wallet/, null, '#accounts'],
  ['Overview', 'Subscriptions', 'What renews and when', /subscription|renew|netflix|spotify/, null, '#subscriptions'],
  ['Overview', 'Savings goals', 'Progress on what you save for', /goal|saving|save/, null, '#goals'],
  ['Markets', 'Markets', 'Daily brief, indexes and savings ideas', /market|stock|invest|news|rates?|index|crypto|gold/],
  ['Playground', 'Playground', 'Turn rough notes into a money plan', /playground|scenario|plan money|what if/],
];

const has = (hay, q) => String(hay || '').toLowerCase().includes(q);
const money = (n, c = 'USD') => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n); } catch { return `${n} ${c}`; } };

// Actions for the typed text, best first for this page.
export function actionsFor(text, page) {
  const q = text.trim();
  if (q.length < 3) return [];
  const out = [];
  const task = parseTask(q);
  const spend = captureNote(q, store.base)[0];
  const looksSpend = spend && (/\b(spent|paid|bought|cost|for lunch|for dinner|groceries|uber|coffee|bill)\b/i.test(q) || page === 'Transactions');
  const looksTask = task.date || task.time || task.repeat || task.kind !== 'task' || page === 'Planner' || /^(remember|remind|todo|do|call|email|finish|submit|study|buy|book|clean|pay)\b/i.test(q);
  const taskBits = [task.date && dayLabel(task.date), task.time && timeLabel(task.time), task.repeat && 'repeats', task.project && `#${task.project}`].filter(Boolean).join(' · ');
  const addTask = { id: 'act-task', icon: 'plus', title: `Add “${task.title}” to Planner`, sub: [KINDS[task.kind].label, taskBits].filter(Boolean).join(' · '), run: () => { const [t] = addFromText(q); go('Planner', { task: t.id }); } };
  const addSpend = spend && { id: 'act-spend', icon: 'money', title: `Add ${money(Math.abs(spend.amount), spend.currency)} ${spend.merchant ? `at ${spend.merchant}` : ''}`.trim(), sub: `${spend.category} · ${spend.date} · waits in Transactions to check`, run: async () => { store.drafts.unshift({ id: newId(), ...(await enrich(spend)) }); go('Transactions', { anchor: '#review' }); } };
  if (looksSpend && addSpend) out.push(addSpend);
  if (looksTask || !addSpend) out.push(addTask);
  if (addSpend && !looksSpend) out.push(addSpend);
  if (!looksTask && addSpend) out.push(addTask);
  return out;
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
  const tx = store.transactions.filter(t => has(t.merchant, q) || has(t.category, q) || has(t.note, q)).slice(0, 5)
    .map(t => ({ id: `x-${t.id}`, icon: 'money', title: t.merchant, sub: `${money(t.amount, t.currency)} · ${t.category} · ${t.date}`, run: () => { store.query = t.merchant; go('Transactions', { anchor: '#ledger' }); } }));
  if (tx.length) groups.push({ name: 'Spending', page: 'Transactions', items: tx });
  const other = [
    ...store.subscriptions.filter(s => has(s.name, q)).map(s => ({ id: `s-${s.id}`, icon: 'repeat', title: s.name, sub: `Subscription · ${money(s.amount, s.currency)} ${s.cycle} · next ${s.next}`, run: () => go('Overview', { anchor: '#subscriptions' }) })),
    ...store.goals.filter(g => has(g.name, q)).map(g => ({ id: `g-${g.id}`, icon: 'target', title: g.name, sub: `Goal · ${money(g.saved)} of ${money(g.target)}`, run: () => go('Overview', { anchor: '#goals' }) })),
    ...store.balances.filter(b => has(b.name, q)).map(b => ({ id: `b-${b.id}`, icon: 'money', title: b.name, sub: `Account · ${money(b.balance, b.currency)}`, run: () => go('Transactions', { anchor: '#accounts' }) })),
    ...store.feeds.filter(f => has(f.name, q)).map(f => ({ id: `f-${f.id}`, icon: 'calendar', title: f.name, sub: `Calendar · ${f.count} events`, run: () => go('Planner', { anchor: '#calendars' }) })),
  ].slice(0, 5);
  if (other.length) groups.push({ name: 'Money and goals', page: 'Overview', items: other });
  const places = PLACES.filter(([, title, , re]) => has(title, q) || re.test(q)).slice(0, 4)
    .map(([p, title, sub, , view, anchor]) => ({ id: `p-${title}`, icon: 'right', title, sub, run: () => { if (view) store.planner.view = view; go(p, { anchor: anchor || '' }); } }));
  if (places.length) groups.push({ name: 'Go to', items: places });
  return groups.sort((a, b) => Number(b.page === page) - Number(a.page === page));
}

// The search box's hint for each page.
export const HINTS = {
  Overview: 'Search or add anything: tasks, spending, goals',
  Planner: 'Search tasks, or type one to add it',
  Transactions: 'Search spending, or type “12 lunch” to add',
  Markets: 'Search Budgie',
  Playground: 'Search Budgie',
};
