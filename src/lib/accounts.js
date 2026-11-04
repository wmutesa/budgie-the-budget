// Linking spending to the accounts you track. Each account keeps a balance you
// set at a point in time; entries paid with it afterwards are deducted (or
// added, for income), so the shown balance stays current without double counting.
import { store } from './store';
import { convert } from './rates';
import { matchMerchant } from '../data/directory';
import { logoUrl } from './brands';
import { aiPickAccount } from './ai';

const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const GENERIC = new Set(['bank', 'card', 'account', 'checking', 'savings', 'saving', 'my', 'the', 'credit', 'debit', 'wallet', 'cash', 'mobile', 'money']);
const KIND_WORDS = {
  cash: ['cash'],
  card: ['card', 'visa', 'mastercard', 'amex', 'credit'],
  mobile: ['momo', 'mpesa', 'm-pesa', 'airtel', 'mobile money', 'mtn'],
  savings: ['savings'],
  checking: ['checking', 'debit'],
};

// The balance you set, and when (older accounts used `balance` and `updatedAt`).
const base = a => ({ amount: Number(a.base ?? a.balance) || 0, at: a.baseAt || a.updatedAt || '1970-01-01' });

// Current balance: what you set, plus entries paid with this account since then.
// For a credit card the number is what you owe, so spending raises it.
export function currentBalance(a) {
  const b = base(a);
  const since = String(b.at).slice(0, 10);
  const moved = store.transactions
    .filter(t => t.accountId === a.id && String(t.date) >= since && (!t.addedAt || t.addedAt >= b.at))
    .reduce((s, t) => s + (t.currency === a.currency ? Number(t.amount) : convert(Number(t.amount), t.currency, a.currency) ?? 0), 0);
  return a.kind === 'card' ? b.amount - moved : b.amount + moved;
}
// What an account adds to net worth, in USD (cards subtract what you owe).
export function worthUSD(a) {
  const v = currentBalance(a);
  const usd = a.currency === 'USD' ? v : convert(v, a.currency, 'USD') ?? 0;
  return a.kind === 'card' ? -usd : usd;
}

// Set a new balance: it becomes the starting point for later deductions.
export function setBalance(a, amount) {
  const now = new Date().toISOString();
  Object.assign(a, { base: amount, baseAt: now, balance: amount, updatedAt: now });
}

// The logo for an account, from your upload or from the bank's website.
export function accountIcon(a) {
  if (a.icon) return a.icon;
  const known = matchMerchant(a.name);
  return known ? logoUrl(known.domain) : null;
}

// Which account a piece of text mentions, by name or by type ("cash", "card", "MoMo").
export function matchAccount(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const scored = store.balances.map(a => {
    let score = 0;
    const named = words(a.name).filter(w => w.length >= 3 && !GENERIC.has(w));
    named.forEach(w => { if (new RegExp(`\\b${w}\\b`).test(t)) score += 3; });
    (KIND_WORDS[a.kind] || []).forEach(w => { if (t.includes(` ${w}`)) score += 1; });
    return { a, score };
  }).filter(x => x.score > 0).sort((x, y) => y.score - x.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null; // unclear
  return scored[0].a;
}

// Removes "with my Chase card", "paid cash", "via MoMo" and similar from a note,
// so the payment method is not mistaken for the shop.
export function stripPayment(text, account) {
  let s = String(text || '');
  const names = account ? words(account.name).filter(w => w.length >= 3 && !GENERIC.has(w)) : [];
  const alts = [...names, ...Object.values(KIND_WORDS).flat()].map(w => w.replace(/[-]/g, '\\-')).join('|');
  if (!alts) return s;
  const re = new RegExp(`\\s*\\b(?:paid\\s+|pay\\s+)?(?:with|using|via|from|on|by|in)\\s+(?:my\\s+|the\\s+)?(?:[a-z]+\\s+)?(?:${alts})(?:\\s+(?:card|account|bank|wallet|money))?\\b`, 'gi');
  s = s.replace(re, ' ').replace(/\s*\bpaid\s+(?:in\s+)?cash\b/gi, ' ');
  return s.replace(/\s{2,}/g, ' ').trim();
}

// Pick the account for a new entry: one account means that one; otherwise the
// text, then the AI model on this device. Returns an id or null.
export async function guessAccount(text) {
  if (!store.balances.length) return null;
  if (store.balances.length === 1) return store.balances[0].id;
  const byRule = matchAccount(text);
  if (byRule) return byRule.id;
  const name = await aiPickAccount(text, store.balances.map(a => `${a.name} (${a.kind})`)).catch(() => null);
  if (!name) return null;
  const hit = store.balances.find(a => name.toLowerCase().startsWith(a.name.toLowerCase()));
  return hit ? hit.id : null;
}

// For an imported statement: the account named in the file name or its first lines.
export function accountForFile(fileName, firstText = '') {
  if (store.balances.length === 1) return store.balances[0].id;
  return matchAccount(`${fileName} ${String(firstText).slice(0, 400)}`)?.id || null;
}
