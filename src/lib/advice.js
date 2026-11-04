// Rules that turn the ledger into suggestions. Every number comes from your data.
import { computed } from 'vue';
import { store, monthly, daysUntil, thisMonth } from './store';
import { convert } from './rates';
import { budgetRows, monthTotals, spentIn } from './ledger';

const usd = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const round50 = n => Math.ceil(n / 50) * 50;

export const pace = computed(() => {
  const d = new Date();
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const day = d.getDate();
  const t = monthTotals.value;
  // Housing is paid once a month, so only day-to-day spending is projected forward.
  const fixed = budgetRows.value.filter(b => b.name === 'Housing').reduce((s, b) => s + b.spent, 0);
  const variable = Math.max(0, t.spent - fixed);
  const projected = fixed + (day ? (variable / day) * days : variable);
  return { day, days, projected, budget: t.budget, income: t.income, spent: t.spent };
});

export const subsMonthlyUSD = computed(() => store.subscriptions.reduce((s, x) => s + (convert(monthly(x), x.currency, 'USD') ?? 0), 0));

export const surplus = computed(() => Math.max(0, pace.value.income - pace.value.projected));

export const facts = computed(() => {
  const p = pace.value;
  const out = [
    `Day ${p.day} of ${p.days}. Spent ${usd(p.spent)} of a ${usd(p.budget)} monthly budget.`,
    `At this pace the month ends near ${usd(p.projected)}.`,
    `Income recorded this month: ${usd(p.income)}.`,
  ];
  budgetRows.value.filter(b => b.spent > b.budget).forEach(b => out.push(`${b.name} is over budget: ${usd(b.spent)} of ${usd(b.budget)}.`));
  if (store.subscriptions.length) out.push(`${store.subscriptions.length} subscriptions cost about ${usd(subsMonthlyUSD.value)} a month.`);
  return out;
});

export const cards = computed(() => {
  const month = thisMonth();
  const out = [];
  const p = pace.value;

  if (!p.budget) {
    // No budgets yet: the budgets card drafts them once there is income or spending.
  } else if (p.projected > p.budget) {
    out.push({ id: `pace-${month}`, tone: 'warn', title: 'On pace to overspend', body: `Spending is heading for ${usd(p.projected)} against a ${usd(p.budget)} budget. Slow the biggest category for the rest of the month.` });
  } else {
    out.push({ id: `pace-${month}`, tone: 'good', title: 'Spending is on pace', body: `At this rate the month ends near ${usd(p.projected)}, under your ${usd(p.budget)} budget.` });
  }

  budgetRows.value.filter(b => b.spent > b.budget).forEach(b => {
    const to = round50(b.spent * 1.1);
    out.push({
      id: `over-${b.name}-${month}`, tone: 'warn', title: `${b.name} is over budget`,
      body: `${usd(b.spent)} spent of ${usd(b.budget)}. Raise the limit to match how you really spend, or hold back until next month.`,
      action: { label: `Set ${b.name} to ${usd(to)}`, run: () => { const x = store.budgets.find(y => y.name === b.name); if (x) x.budget = to; } },
    });
  });

  if (p.day >= 10) {
    budgetRows.value.filter(b => b.budget >= 100 && b.spent / b.budget < 0.3).forEach(b => {
      const to = round50(Math.max(b.spent * 1.5, b.budget * 0.6));
      if (to < b.budget) out.push({
        id: `under-${b.name}-${month}`, tone: 'info', title: `${b.name} has room to spare`,
        body: `Only ${usd(b.spent)} of ${usd(b.budget)} used. Lowering it frees ${usd(b.budget - to)} a month for savings.`,
        action: { label: `Lower to ${usd(to)}`, run: () => { const x = store.budgets.find(y => y.name === b.name); if (x) x.budget = to; } },
      });
    });
  }

  const soon = store.subscriptions.filter(s => { const d = daysUntil(s.next); return d >= 0 && d <= 30; });
  if (soon.length) {
    const total = soon.reduce((s, x) => s + (convert(x.amount, x.currency, 'USD') ?? 0), 0);
    out.push({ id: `renew-${month}`, tone: 'info', title: `${soon.length} renewal${soon.length === 1 ? '' : 's'} in the next 30 days`, body: `${soon.map(s => s.name).join(', ')} will charge about ${usd(total)}. Cancel anything you no longer use before it renews.` });
  }

  // Next month: plan from the last three months of recorded spending.
  const prior = [1, 2, 3].map(i => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return spentIn(d.toISOString().slice(0, 7)); }).filter(v => v > 0);
  if (prior.length) {
    const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
    out.push({ id: `next-${month}`, tone: 'info', title: 'Plan for next month', body: `You averaged ${usd(avg)} of spending over the last ${prior.length} month${prior.length === 1 ? '' : 's'} on record. A budget near ${usd(round50(avg))} keeps you realistic.` });
  }

  const goal = store.goals[0];
  if (goal && surplus.value > 0) {
    out.push({ id: `save-${month}`, tone: 'good', title: 'Money left to put to work', body: `Income is ahead of projected spending by about ${usd(surplus.value)}. Moving half of that to ${goal.name.toLowerCase()} gets you to ${usd(goal.target)} sooner.` });
  }

  return out.filter(c => !store.dismissed.includes(c.id));
});
