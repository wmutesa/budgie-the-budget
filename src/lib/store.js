// App state that belongs to the user: base currency, tracked subscriptions,
// and the search text. Saved in this browser only.
import { reactive, watch } from 'vue';
import { sampleTransactions } from '../data/demo';

const KEY = 'budgie.v2';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

const saved = read();

export const store = reactive({
  base: saved.base || 'USD',
  subscriptions: Array.isArray(saved.subscriptions) ? saved.subscriptions : [],
  transactions: Array.isArray(saved.transactions) ? saved.transactions : sampleTransactions(),
  drafts: Array.isArray(saved.drafts) ? saved.drafts : [],
  query: '',
});

watch(
  () => ({ base: store.base, subscriptions: store.subscriptions, transactions: store.transactions, drafts: store.drafts }),
  value => { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage blocked */ } },
  { deep: true },
);

// Cost of a subscription per month, in its own currency.
export function monthly(s) {
  const a = Number(s.amount) || 0;
  if (s.cycle === 'yearly') return a / 12;
  if (s.cycle === 'weekly') return (a * 52) / 12;
  return a;
}

export function daysUntil(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 864e5);
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const thisMonth = () => new Date().toISOString().slice(0, 7);
