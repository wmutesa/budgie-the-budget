// Monthly budgets drafted for you: by the AI when a model is ready, otherwise
// by rules from your own spending. Categories come from the ones your entries
// use, so spending always lands in a budget, and each keeps its set colour.
import { store, monthly, thisMonth } from './store';
import { convert } from './rates';
import { CATEGORIES } from './categorize';
import { ai, aiDraftBudgets, labelFor } from './ai';

// The fixed colour for each category, so budgets look the same wherever they appear.
export const CATEGORY_COLORS = {
  Housing: '#7c3aed', 'Food & dining': '#16a34a', Transport: '#2563eb', Shopping: '#db2777',
  Entertainment: '#d97706', Software: '#4f46e5', Health: '#0891b2', Other: '#64748b',
};
const EXTRA = ['#9333ea', '#059669', '#0284c7', '#e11d48', '#ca8a04', '#0d9488'];
export function colorFor(name, i = 0) { return CATEGORY_COLORS[name] || EXTRA[i % EXTRA.length]; }

const toUSD = t => (t.currency === 'USD' ? t.amount : convert(t.amount, t.currency, 'USD') ?? t.amount);
const round10 = n => Math.max(10, Math.ceil(n / 10) * 10);

// What the draft is based on.
export function budgetInputs() {
  const since = new Date(); since.setDate(1); since.setMonth(since.getMonth() - 3);
  const from = since.toISOString().slice(0, 10);
  const recent = store.transactions.filter(t => String(t.date) >= from);
  const months = Math.max(1, new Set(recent.map(t => String(t.date).slice(0, 7))).size);
  const spend = {};
  recent.filter(t => t.amount < 0).forEach(t => { spend[t.category || 'Other'] = (spend[t.category || 'Other'] || 0) - toUSD(t); });
  Object.keys(spend).forEach(k => { spend[k] = Math.round(spend[k] / months); });
  const earned = recent.filter(t => t.amount > 0).reduce((s, t) => s + toUSD(t), 0) / months;
  const income = Math.round(Number(store.plan?.income) || earned || 0);
  const subs = {};
  store.subscriptions.forEach(s => { const c = /software|github|notion|figma|cloud|vpn|password/i.test(s.name) ? 'Software' : 'Entertainment'; subs[c] = (subs[c] || 0) + (convert(monthly(s), s.currency, 'USD') ?? 0); });
  const planned = {};
  (store.plan?.items || []).filter(i => !['Income', 'Savings', 'Goals'].includes(i.group) && i.monthly).forEach(i => { planned[i.category] = (planned[i.category] || 0) + Number(i.monthly); });
  const used = new Set([...Object.keys(spend), ...Object.keys(planned), ...Object.keys(subs)]);
  const allowed = [...new Set([...CATEGORIES.filter(c => c !== 'Income'), ...used])].filter(c => c && c !== 'Income');
  return { income, spend, subs, planned, allowed, months };
}
export const hasInputs = i => i.income > 0 || Object.keys(i.spend).length > 0 || Object.keys(i.planned).length > 0 || Object.keys(i.subs).length > 0;

// Rules: your recent spending plus a little room, your plan where you made one,
// and typical shares of income for the essentials when there is no history.
function ruleDraft(i) {
  const out = {};
  Object.entries(i.spend).forEach(([c, v]) => { if (v > 0) out[c] = round10(v * 1.1); });
  Object.entries(i.subs).forEach(([c, v]) => { out[c] = Math.max(out[c] || 0, round10(v)); });
  Object.entries(i.planned).forEach(([c, v]) => { out[c] = round10(v); });
  if (!Object.keys(out).length && i.income > 0) {
    const shares = { Housing: 0.3, 'Food & dining': 0.12, Transport: 0.08, Shopping: 0.05, Health: 0.04, Entertainment: 0.04, Other: 0.05 };
    Object.entries(shares).forEach(([c, s]) => { out[c] = round10(i.income * s); });
  }
  return Object.entries(out).map(([name, budget]) => ({ name, budget }));
}

// Keep a draft sensible: known categories only, positive amounts, and within income.
function tidy(list, i) {
  const seen = new Set();
  let rows = list.filter(b => b && i.allowed.includes(b.name) && Number(b.budget) > 0 && !seen.has(b.name) && seen.add(b.name))
    .slice(0, 12).map(b => ({ name: b.name, budget: round10(Number(b.budget)) }));
  const total = rows.reduce((s, b) => s + b.budget, 0);
  if (i.income > 0 && total > i.income * 0.9) rows = rows.map(b => ({ ...b, budget: round10(b.budget * (i.income * 0.9) / total) }));
  const order = Object.keys(CATEGORY_COLORS);
  return rows.sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99))
    .map((b, n) => ({ ...b, color: colorFor(b.name, n) }));
}

let drafting = null;
// Draft budgets and save them. Returns where they came from.
export function draftBudgets({ force = false } = {}) {
  if (drafting) return drafting;
  drafting = (async () => {
    try {
      const i = budgetInputs();
      if (!hasInputs(i)) return null;
      store.budgetMeta = { ...(store.budgetMeta || {}), drafting: true };
      let rows = null, by = 'rules';
      if (ai.ready) {
        const fromAI = await aiDraftBudgets(i);
        if (fromAI && fromAI.length) { rows = tidy(fromAI, i); by = ai.used.budget || labelFor('budget'); }
      }
      if (!rows || !rows.length) { rows = tidy(ruleDraft(i), i); by = 'rules'; }
      if (!rows.length) return null;
      // Keep amounts you changed yourself unless asked for a fresh draft.
      if (!force) rows.forEach(r => { const mine = store.budgets.find(b => b.name === r.name && b.edited); if (mine) r.budget = mine.budget; });
      store.budgets = rows;
      store.budgetMeta = { source: by === 'rules' ? 'rules' : 'ai', by, month: thisMonth(), at: new Date().toISOString() };
      return by;
    } finally {
      if (store.budgetMeta) delete store.budgetMeta.drafting;
      drafting = null;
    }
  })();
  return drafting;
}

// Should Budgie draft (or redraft) on its own right now?
export function shouldDraft() {
  const m = store.budgetMeta || {};
  if (m.source === 'user' || m.source === 'plan') return false;
  if (!store.budgets.length || !m.source) return true;            // none yet, or the old starting set
  if (m.month !== thisMonth()) return true;                        // a new month
  return m.source === 'rules' && ai.ready;                         // a model is ready now: let it improve the draft
}
