// Numbers derived from the ledger: spending per category this month, in USD.
import { computed, watch } from 'vue';
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

// ---------- Numbers worked out from your own entries ----------
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// The month Budgie's history starts: when you started, or your earliest entry
// if you imported older ones.
export const firstMonth = computed(() => {
  const earliest = store.transactions.reduce((m, t) => { const k = String(t.date).slice(0, 7); return /^\d{4}-\d{2}$/.test(k) && k < m ? k : m; }, store.startedAt || monthKey(new Date()));
  return earliest;
});

// Each month from when you started up to this one (at most the last 12), oldest first:
// { key: 'YYYY-MM', m: 'Jan', year, income, expense } in USD.
export const cashFlow = computed(() => {
  const months = [];
  const d = new Date(); d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    if (monthKey(x) < firstMonth.value) continue;
    months.push({ key: monthKey(x), m: x.toLocaleDateString('en-US', { month: 'short' }), year: x.getFullYear(), income: 0, expense: 0 });
  }
  const byKey = Object.fromEntries(months.map(m => [m.key, m]));
  store.transactions.forEach(t => {
    const m = byKey[String(t.date).slice(0, 7)];
    if (!m) return;
    const v = toUSD(t);
    if (v > 0) m.income += v; else m.expense -= v;
  });
  months.forEach(m => { m.income = Math.round(m.income); m.expense = Math.round(m.expense); });
  return months;
});
// Months that have any entries.
export const activeMonths = computed(() => cashFlow.value.filter(m => m.income || m.expense));

// Top merchants by spending over the last three months.
export const topMerchants = computed(() => {
  const since = new Date(); since.setMonth(since.getMonth() - 3);
  const from = since.toISOString().slice(0, 10);
  const out = {};
  store.transactions.filter(t => t.amount < 0 && String(t.date) >= from).forEach(t => {
    const k = t.merchant || 'Unknown';
    out[k] = out[k] || { name: k, total: 0, count: 0 };
    out[k].total -= toUSD(t);
    out[k].count += 1;
  });
  return Object.values(out).sort((a, b) => b.total - a.total).slice(0, 5).map(m => ({ ...m, total: Math.round(m.total * 100) / 100 }));
});

// This month's spending by category, largest first, with each budget's colour.
export const categorySpend = computed(() => Object.entries(spentByCategory.value)
  .filter(([, v]) => v > 0)
  .sort((a, b) => b[1] - a[1])
  .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100, color: store.budgets.find(b => b.name === name)?.color || '#a1a1aa' })));

// Accounts you added, converted to USD, and your net worth.
export const accountTotal = computed(() => store.balances.reduce((s, a) => s + (a.currency === 'USD' ? Number(a.balance) || 0 : convert(Number(a.balance) || 0, a.currency, 'USD') ?? 0), 0));

// Keep one net-worth reading per day while you track accounts, for the chart.
watch(accountTotal, total => {
  if (!store.balances.length) return;
  const date = new Date().toISOString().slice(0, 10);
  const last = store.netHistory[store.netHistory.length - 1];
  const value = Math.round(total * 100) / 100;
  if (last && last.date === date) { if (last.total !== value) last.total = value; }
  else store.netHistory.push({ date, total: value });
  if (store.netHistory.length > 400) store.netHistory.splice(0, store.netHistory.length - 400);
});
