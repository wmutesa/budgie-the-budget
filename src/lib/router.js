// The Playground's inbox: write or say anything, one thing per line, and
// Budgie decides where each line goes: the Planner (things to do), Transactions
// (money already spent or received), the money plan (amounts that repeat), or
// more than one. You can change any choice before sending.
import { store, newId } from './store';
import { parseTask, makeTask, splitLines, dayLabel, timeLabel, today, KINDS } from './tasks';
import { captureNote, enrich } from './capture';
import { parseChunk } from './plan';
import { guessCategory } from './categorize';

export const DESTS = {
  planner: { label: 'Planner', icon: 'planner' },
  money: { label: 'Transactions', icon: 'wallet' },
  plan: { label: 'Money plan', icon: 'shapes' },
};
const PAST = /\b(spent|paid|bought|got paid|received|earned|cost me|yesterday|last (night|week)|this morning|today i|just)\b/i;
const RECURRING = /\b(salary|rent|income|per month|a month|monthly|a week|weekly|a year|yearly|every month|subscription|save \d|saving|budget|fund)\b/i;
const TODO = /^(remember|remind|todo|to do|need to|have to|call|email|text|finish|submit|study|review|buy|book|clean|pay|renew|cancel|apply|send|pick up|meet|go to|plan)\b/i;

// Read one line three ways and pick where it belongs.
export function route(line) {
  const text = line.trim();
  const task = parseTask(text);
  // Money only counts when it is clear: "$25", "25 dollars", or words like spent, salary, rent.
  // ("Essay 2" and "6pm" are not prices.)
  // A label and an amount on its own ("rent 1450", "groceries maybe 400") is money too.
  const bare = /^[\p{L}][\p{L}\s&'’.+-]*?\s+(maybe |about |around |roughly )?\$?\d[\d,]*(\.\d+)?\s*k?(\s*(a|per|\/)\s*(month|week|year|day|mo|yr|wk))?$/iu.test(text) && !/\b(am|pm)$/i.test(text);
  const moneyish = bare || /\$\s?\d|\d\s?(usd|dollars?|bucks|rwf|eur|gbp|k)\b|\b(spent|paid|bought|cost|costs|salary|income|rent|budget|save|saving|earned|received|bill|subscription)\b/i.test(text);
  const spend = moneyish ? captureNote(text, store.base)[0] || null : null;
  const planItem = moneyish ? parseChunk(text) : null;
  const dest = new Set();
  const future = task.date && task.date >= today() && !PAST.test(text);
  const doing = future || task.time || task.repeat || TODO.test(text) || task.kind !== 'task';
  if (spend && PAST.test(text)) dest.add('money');
  else if (planItem?.amount && (RECURRING.test(text) || bare || /\bby\s+[a-z]{3,9}\b/i.test(text)) && !task.date) dest.add('plan');
  if (doing && !(dest.has('plan') && !future)) dest.add('planner');
  // Something to do that costs money: a task with that cost (ticking it adds the entry).
  if (dest.has('planner') && !task.cost && spend && /\$|dollars|bucks|\bcosts?\b/i.test(text) && !dest.has('money')) task.cost = Math.abs(spend.amount);
  if (!dest.size) dest.add(spend ? 'money' : 'planner');
  const why = dest.has('money') && dest.has('planner') ? 'Done and spent: logged, and kept in your planner'
    : dest.has('money') ? 'Money already spent or received'
      : dest.has('plan') && dest.has('planner') ? 'A repeating amount and something to do'
        : dest.has('plan') ? 'An amount that repeats: goes in your money plan'
          : task.cost ? 'Something to do that costs money: logged when you tick it'
            : 'Something to do';
  return { id: newId(), text, dest: [...dest], task, spend, planItem, why };
}
// Comma lists of amounts ("rent 1500, groceries 450") become one line each.
const splitCommas = line => { const parts = line.split(/,(?!\d{3}\b)/).map(x => x.trim()).filter(Boolean); return parts.length > 1 && parts.every(x => /\d/.test(x)) ? parts : [line]; };
export const routeAll = text => splitLines(text).flatMap(splitCommas).map(route);

// A short description of what each destination will receive.
export function preview(r, d) {
  if (d === 'planner') return [KINDS[r.task.kind].label, r.task.title, r.task.date && dayLabel(r.task.date), r.task.time && timeLabel(r.task.time), r.task.repeat && 'repeats', r.task.cost && `$${r.task.cost} when done`].filter(Boolean).join(' · ');
  if (d === 'money') return r.spend ? `${r.spend.merchant || 'Entry'} · ${Math.abs(r.spend.amount)} ${r.spend.currency} · ${r.spend.category}` : 'No amount found';
  return r.planItem ? `${r.planItem.label} · ${r.planItem.group} · $${Math.round(r.planItem.monthly || 0)} a month` : 'No amount found';
}
export const canSend = (r, d) => (d === 'money' ? Boolean(r.spend) : d === 'plan' ? Boolean(r.planItem?.amount) : true);

// Send the lines where they were routed. Returns counts per destination.
export async function sendAll(list) {
  const n = { planner: 0, money: 0, plan: 0 };
  let income = 0;
  for (const r of list) {
    for (const d of r.dest) {
      if (!canSend(r, d)) continue;
      if (d === 'planner') {
        const p = r.task;
        const done = r.dest.includes('money');
        store.tasks.unshift(makeTask({ title: p.title, date: p.date || (done ? today() : ''), time: p.time, mins: p.mins, repeat: p.repeat, priority: p.priority, project: p.project, kind: p.kind, cost: done ? null : p.cost, costCategory: p.cost ? guessCategory(p.title, -1) : '', done: done && !p.repeat, doneAt: done ? new Date().toISOString() : null, source: 'playground' }));
      } else if (d === 'money') {
        store.drafts.unshift({ id: newId(), ...(await enrich(r.spend)) });
      } else if (d === 'plan') {
        // Income sets the plan's monthly income; everything else is a line in the plan.
        if (r.planItem.group === 'Income') income += Number(r.planItem.monthly) || 0;
        else store.plan.items.push({ ...r.planItem, manual: true });
      }
      n[d]++;
    }
  }
  if (income) store.plan.income = Math.round(income);
  return n;
}
