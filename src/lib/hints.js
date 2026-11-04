// Short notes Budgie shows next to each part of the app, from your own numbers.
// One sentence each; nothing is shown when there is nothing useful to say.
import { computed } from 'vue';
import { store, daysUntil, monthly } from './store';
import { convert } from './rates';
import { budgetRows, cashFlow, categorySpend, monthTotals, accountTotal } from './ledger';
import { currentBalance } from './accounts';

const usd = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const toUSD = t => (t.currency === 'USD' ? t.amount : convert(t.amount, t.currency, 'USD') ?? t.amount);
const daysLeft = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate(); };

export const hints = computed(() => {
  const h = {};

  // Budgets
  const over = budgetRows.value.filter(b => b.budget && b.spent > b.budget);
  const near = budgetRows.value.filter(b => b.budget && b.spent <= b.budget && b.spent / b.budget >= 0.8).sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  if (over.length) h.budgets = `${over.map(b => b.name).join(' and ')} ${over.length === 1 ? 'is' : 'are'} over budget. Hold back there for the next ${daysLeft()} days.`;
  else if (near.length) h.budgets = `${near[0].name} is at ${Math.round((near[0].spent / near[0].budget) * 100)}% with ${daysLeft()} days left in the month.`;
  else if (budgetRows.value.length && monthTotals.value.spent) h.budgets = `Every budget is on track, with ${usd(Math.max(0, monthTotals.value.budget - monthTotals.value.spent))} left this month.`;

  // Recent activity
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const week = store.transactions.filter(t => t.amount < 0 && String(t.date) >= weekAgo);
  if (week.length) {
    const top = [...week].sort((a, b) => toUSD(a) - toUSD(b))[0];
    h.ledger = `${week.length} ${week.length === 1 ? 'purchase' : 'purchases'} this week, ${usd(week.reduce((s, t) => s - toUSD(t), 0))} in all. The biggest was ${top.merchant} at ${usd(-toUSD(top))}.`;
  }

  // Adding spending
  if (store.drafts.length) h.capture = `${store.drafts.length} ${store.drafts.length === 1 ? 'entry is' : 'entries are'} waiting for you to check below.`;
  else if (!store.transactions.length) h.capture = 'Start with one thing you bought today. Say it or type it, like "coffee 4.50 with my card".';
  else if (!store.transactions.some(t => t.date === new Date().toISOString().slice(0, 10))) h.capture = 'Nothing added today yet. A quick note keeps your budgets accurate.';

  // Subscriptions
  if (store.subscriptions.length) {
    const next = [...store.subscriptions].filter(s => daysUntil(s.next) >= 0).sort((a, b) => daysUntil(a.next) - daysUntil(b.next))[0];
    const total = store.subscriptions.reduce((s, x) => s + (convert(monthly(x), x.currency, 'USD') ?? 0), 0);
    const share = monthTotals.value.income ? ` That is ${Math.round((total / monthTotals.value.income) * 100)}% of this month's income.` : '';
    h.subscriptions = next ? `${next.name} renews ${daysUntil(next.next) === 0 ? 'today' : `in ${daysUntil(next.next)} days`}.${share}` : `Subscriptions cost ${usd(total)} a month.${share}`;
  }

  // Accounts
  if (store.balances.length) {
    const month = new Date().toISOString().slice(0, 7);
    const unlinked = store.transactions.filter(t => String(t.date).startsWith(month) && !t.accountId).length;
    const card = store.balances.find(a => a.kind === 'card' && currentBalance(a) > 0);
    if (unlinked && store.balances.length > 1) h.accounts = `${unlinked} ${unlinked === 1 ? 'entry this month is' : 'entries this month are'} not linked to an account, so balances may be high. Pick "Paid with" on them.`;
    else if (card) h.accounts = `You owe ${usd(convert(currentBalance(card), card.currency, 'USD') ?? currentBalance(card))} on ${card.name}. Paying it in full avoids interest.`;
    else h.accounts = `You hold ${usd(accountTotal.value)} across ${store.balances.length} ${store.balances.length === 1 ? 'account' : 'accounts'}.`;
  }

  // Goals
  const goal = store.goals.find(g => g.saved < g.target);
  if (goal) h.goals = `${usd(goal.target - goal.saved)} to go for ${goal.name}. About ${usd((goal.target - goal.saved) / 12)} a month gets you there in a year.`;
  else if (store.goals.length) h.goals = 'Every goal is reached. Set a new one to keep going.';

  // Cash flow, this month against last
  const [prev, cur] = cashFlow.value.slice(-2);
  if (prev && cur && prev.expense && cur.expense) {
    const change = Math.round(((cur.expense - prev.expense) / prev.expense) * 100);
    h.cashflow = change <= 0 ? `Spending is ${Math.abs(change)}% lower than last month so far.` : `Spending is ${change}% higher than last month already.`;
  }

  // Expense breakdown
  const total = categorySpend.value.reduce((s, c) => s + c.amount, 0);
  if (categorySpend.value.length && total) h.breakdown = `${categorySpend.value[0].name} takes ${Math.round((categorySpend.value[0].amount / total) * 100)}% of this month's spending.`;

  // Net worth
  const hist = store.netHistory;
  if (hist.length > 1) {
    const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const from = hist.find(p => p.date >= monthAgo) || hist[0];
    const diff = hist[hist.length - 1].total - from.total;
    if (Math.abs(diff) >= 1) h.networth = `${diff >= 0 ? 'Up' : 'Down'} ${usd(Math.abs(diff))} since ${new Date(`${from.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`;
  }

  return h;
});
