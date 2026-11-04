// Numbers derived from the ledger: spending per category this month, in USD.
import { computed } from 'vue';
import { store, thisMonth } from './store';
import { convert } from './rates';

const toUSD = t => (t.currency === 'USD' ? t.amount : convert(t.amount, t.currency, 'USD') ?? t.amount);

export const monthTx = computed(() => store.transactions.filter(t => String(t.date).startsWith(thisMonth())));

export const spentByCategory = computed(() => {
  const out = {};
  monthTx.value.filter(t => t.amount < 0).forEach(t => { out[t.category] = (out[t.category] || 0) - toUSD(t); });
  return out;
});

export const budgetRows = computed(() => store.budgets.map(b => ({ ...b, spent: Math.round((spentByCategory.value[b.name] || 0) * 100) / 100 })));

export const monthTotals = computed(() => {
  const spent = monthTx.value.filter(t => t.amount < 0).reduce((s, t) => s - toUSD(t), 0);
  const income = monthTx.value.filter(t => t.amount > 0).reduce((s, t) => s + toUSD(t), 0);
  const budget = store.budgets.reduce((s, b) => s + b.budget, 0);
  return { spent, income, budget };
});

// Spending in a given month (YYYY-MM), in USD, from the ledger.
export function spentIn(month) {
  return store.transactions.filter(t => String(t.date).startsWith(month) && t.amount < 0).reduce((s, t) => s - toUSD(t), 0);
}
