// App state that belongs to the user: base currency, tracked subscriptions,
// and the search text. Saved in this browser only.
import { reactive, watch } from 'vue';

const KEY = 'budgie.v2';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

const saved = read();

export const store = reactive({
  base: saved.base || 'USD',
  subscriptions: Array.isArray(saved.subscriptions) ? saved.subscriptions : [],
  query: '',
});

watch(
  () => ({ base: store.base, subscriptions: store.subscriptions }),
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
