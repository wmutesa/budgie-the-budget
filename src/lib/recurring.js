// Payments that repeat: the same place charging a similar amount in different
// months, which are not tracked as subscriptions yet.
import { computed } from 'vue';
import { store, daysUntil, monthly } from './store';
import { convert } from './rates';

const key = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const toUSD = t => (t.currency === 'USD' ? t.amount : convert(t.amount, t.currency, 'USD') ?? t.amount);

export const recurring = computed(() => {
  const tracked = new Set(store.subscriptions.map(s => key(s.name)));
  const groups = {};
  store.transactions.filter(t => t.amount < 0 && t.merchant).forEach(t => {
    const k = key(t.merchant);
    (groups[k] = groups[k] || []).push(t);
  });
  const out = [];
  Object.entries(groups).forEach(([k, list]) => {
    if (tracked.has(k) || list.length < 2) return;
    const months = new Set(list.map(t => String(t.date).slice(0, 7)));
    if (months.size < 2) return;
    const amounts = list.map(t => -toUSD(t));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (amounts.some(a => Math.abs(a - avg) > avg * 0.15)) return; // amounts vary too much to be a bill
    const sorted = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const last = sorted[0];
    const next = new Date(`${last.date}T00:00:00`); next.setMonth(next.getMonth() + 1);
    out.push({ key: k, name: last.merchant, domain: last.domain, logo: last.logo, amount: Math.round(-last.amount * 100) / 100, currency: last.currency, avgUSD: avg, count: list.length, months: months.size, next: next.toISOString().slice(0, 10), category: last.category });
  });
  return out.sort((a, b) => b.avgUSD - a.avgUSD);
});

// Upcoming payments in the next `days`: subscriptions plus repeating payments.
export function upcoming(days = 14) {
  const subs = store.subscriptions.map(s => ({ id: s.id, name: s.name, logo: s.logo, amount: Number(s.amount), currency: s.currency, date: s.next, kind: 'Subscription', usd: convert(Number(s.amount), s.currency, 'USD') ?? Number(s.amount) }));
  const rec = recurring.value.map(r => ({ id: r.key, name: r.name, logo: r.logo, amount: r.amount, currency: r.currency, date: r.next, kind: 'Repeats monthly', usd: r.avgUSD }));
  return [...subs, ...rec].filter(x => { const d = daysUntil(x.date); return d >= 0 && d <= days; }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Start tracking a repeating payment as a subscription.
export function trackAsSubscription(r, newId) {
  store.subscriptions.push({ id: newId(), name: r.name, domain: r.domain || '', logo: r.logo || null, amount: r.amount, currency: r.currency, cycle: 'monthly', next: r.next });
}

export const monthlySubsUSD = () => store.subscriptions.reduce((s, x) => s + (convert(monthly(x), x.currency, 'USD') ?? 0), 0);
