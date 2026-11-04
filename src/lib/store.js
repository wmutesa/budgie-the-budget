// App state that belongs to the signed-in person: base currency, transactions,
// subscriptions, budgets and plan. It syncs to their account (see sync.js) and
// a copy is kept in this browser so the app opens instantly and works offline.
import { reactive, watch } from 'vue';

// Data saved before personal accounts existed; moved into the first account
// that signs in on this device.
export const LEGACY_KEY = 'budgie.v2';
const userKey = id => `budgie.v3:${id}`;
let activeKey = null;

function readKey(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}

// Build the saved part of the state from a stored object, filling gaps with defaults.
function fromSaved(saved = {}) {
  return {
    base: saved.base || 'USD',
    subscriptions: Array.isArray(saved.subscriptions) ? saved.subscriptions : [],
    // Entries from the old sample data are dropped; Budgie only shows your own.
    transactions: Array.isArray(saved.transactions) ? saved.transactions.filter(t => t && t.source !== 'sample') : [],
    drafts: Array.isArray(saved.drafts) ? saved.drafts : [],
    // Monthly budgets, drafted by AI or rules (see budgets.js) and editable.
    budgets: Array.isArray(saved.budgets) ? saved.budgets : [],
    budgetMeta: saved.budgetMeta && typeof saved.budgetMeta === 'object' ? saved.budgetMeta : {},
    // The month you started using Budgie (YYYY-MM); charts begin there.
    startedAt: typeof saved.startedAt === 'string' ? saved.startedAt : new Date().toISOString().slice(0, 7),
    dismissed: Array.isArray(saved.dismissed) ? saved.dismissed : [],
    banks: Array.isArray(saved.banks) ? saved.banks : ['chase', 'bofa'],
    plan: saved.plan && typeof saved.plan === 'object' ? saved.plan : { text: '', income: 0, items: [], auto: true },
    logoOverrides: saved.logoOverrides && typeof saved.logoOverrides === 'object' ? saved.logoOverrides : {},
    guide: saved.guide && typeof saved.guide === 'object' ? saved.guide : { done: false },
    // Playground plans saved under a name: { id, name, savedAt, plan }.
    planScenarios: Array.isArray(saved.planScenarios) ? saved.planScenarios.slice(0, 12) : [],
    // Notifications already shown in the bell's dropdown.
    seenNotices: Array.isArray(saved.seenNotices) ? saved.seenNotices.slice(-200) : [],
    // Accounts you track by hand: { id, name, kind, balance, currency }.
    balances: Array.isArray(saved.balances) ? saved.balances : [],
    // Savings goals: { id, name, saved, target, color }.
    goals: Array.isArray(saved.goals) ? saved.goals : [],
    // One net-worth reading per day, for the chart: { date, total }.
    netHistory: Array.isArray(saved.netHistory) ? saved.netHistory.slice(-400) : [],
  };
}
const SAVED_FIELDS = Object.keys(fromSaved());

export const store = reactive({ ...fromSaved(), query: '' });

// The saved part of the state, as a plain object.
export const snapshot = () => JSON.parse(JSON.stringify(Object.fromEntries(SAVED_FIELDS.map(k => [k, store[k]]))));

// Replace the saved part of the state, for example with data from the server.
export function applySnapshot(data) {
  Object.assign(store, fromSaved(data || {}));
}

// Switch to a person's local copy. Returns what was stored for them, if anything.
export function openLocal(userId) {
  activeKey = userId ? userKey(userId) : null;
  return activeKey ? readKey(activeKey) : null;
}
export const readLegacy = () => readKey(LEGACY_KEY);
export function clearLegacy() { try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ } }
export function clearLocal(userId) { try { localStorage.removeItem(userKey(userId)); } catch { /* storage blocked */ } }

watch(snapshot, value => {
  if (!activeKey) return;
  try { localStorage.setItem(activeKey, JSON.stringify(value)); } catch { /* storage blocked */ }
}, { deep: true });

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

// Apply a logo fix to every entry and subscription with the same name, and remember it.
export function fixLogo(name, { domain, logo }) {
  const key = String(name).trim().toLowerCase();
  store.logoOverrides[key] = { domain, logo };
  const same = x => String(x.merchant || x.name || '').trim().toLowerCase() === key;
  store.transactions.forEach(t => { if (same(t)) Object.assign(t, { domain, logo }); });
  store.subscriptions.forEach(s => { if (same(s)) Object.assign(s, { domain, logo }); });
  store.drafts.forEach(d => { if (same(d)) Object.assign(d, { domain, logo }); });
}
