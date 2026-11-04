/* Budgie: local-first budgeting.
 * Data lives in this browser (localStorage). The only network call is to your own
 * local AI server (Ollama by default), and only when you use the Assistant. */

const STORE_KEY = 'ledgerline.v1'; // kept so saved data still loads after the rename

const PRESETS = [
  ['Housing', '#c9a77c'], ['Food & Dining', '#e39a6b'], ['Transport', '#9db4c0'],
  ['Clothing', '#d88fb0'], ['Electronics & Tools', '#7fb0ff'], ['Software & Subscriptions', '#b59cff'],
  ['Daily Essentials', '#8fd1a6'], ['College', '#ffd166'], ['Health', '#6fd3c4'],
  ['Entertainment', '#f08a7e'], ['Other', '#8a8374'],
];

const CYCLE = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
const ACCOUNT_TYPES = [['checking', 'Checking'], ['savings', 'Savings'], ['cash', 'Cash']];
const GOAL_KINDS = [['college', 'College'], ['savings', 'Savings'], ['emergency', 'Emergency fund'], ['other', 'Other']];
const LEVEL_RANK = { bad: 0, warn: 1, info: 2 };
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'NGN', 'KES', 'INR', 'JPY'];

const QUICK = [
  'How much can I spend this week?',
  'Am I over budget anywhere?',
  'What renews soon?',
  'When will my college fund be ready?',
  'Give me a savings plan',
  'Can I afford $300?',
];

const SYSTEM = `You are Budgie's private budgeting assistant. Everything runs on the user's machine.
Answer ONLY from the JSON snapshot provided. Be concise, concrete and kind. When you compare numbers, show the arithmetic in one line.
Name risks plainly. Never invent accounts, balances or transactions. If something is missing from the snapshot, say what to add in the app.
You are not a licensed financial advisor; say so only once, and only when asked about a major decision.`;

/* ---------- Helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const thisMonth = () => today().slice(0, 7);
const monthOf = iso => String(iso).slice(0, 7);
const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const shiftDate = (iso, days) => { const d = parseISO(iso); d.setDate(d.getDate() + days); return isoOf(d); };
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthName = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
const daysInMonth = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
const monthsAgoISO = n => { const d = new Date(); d.setMonth(d.getMonth() - n); return isoOf(d); };
const fmtDate = iso => parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dayLabel = iso => iso === today() ? 'Today' : parseISO(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const byDate = (a, b) => b.date.localeCompare(a.date);
const sum = (arr, fn = x => x) => round2(arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0));
const byId = (list, id) => list.find(x => x.id === id);
const addCycle = (iso, cycle) => {
  const d = parseISO(iso);
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + (cycle === 'quarterly' ? 3 : 1));
  return isoOf(d);
};
const monthlyEq = s => {
  const a = Number(s.amount) || 0;
  return ({ weekly: a * 52 / 12, monthly: a, quarterly: a / 3, yearly: a / 12 })[s.cycle] || 0;
};
const monthsUntil = iso => Math.max(0, daysBetween(today(), iso) / 30.44);

const fmtCache = {};
function money(n, cur) {
  const c = cur || state.settings.currency || 'USD';
  fmtCache[c] ||= new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 });
  return fmtCache[c].format(Number(n) || 0);
}

const catName = id => byId(state.categories, id)?.name || (id ? 'Deleted category' : 'Uncategorized');
const catColor = id => byId(state.categories, id)?.color || '#8a8374';
const catIdByName = n => state.categories.find(c => c.name === n)?.id || '';
const accName = id => byId(state.accounts, id)?.name || '—';

function toast(msg, kind = 'info') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- State ---------- */

function defaultState() {
  return {
    version: 1,
    settings: {
      currency: 'USD', lowBalance: 500, monthlyIncome: 0,
      aiEnabled: true, aiEndpoint: 'http://localhost:11434', aiModel: 'llama3.2',
      notifyBrowser: false,
    },
    accounts: [],
    categories: PRESETS.map(([name, color]) => ({ id: uid(), name, color, budget: 0 })),
    transactions: [],
    goals: [],
    subscriptions: [],
    dismissed: {},
    notifiedOn: '',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = defaultState();
      return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
    }
  } catch (e) {
    console.warn('Budgie: could not read saved data', e);
  }
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Browser storage is full or blocked. Export a backup from Settings.', 'bad');
  }
}

let state = load();

const ui = {
  view: 'overview',
  month: thisMonth(),
  f: { q: '', type: '', cat: '', acc: '', month: thisMonth() },
  range: 30,
  chat: [],
  ai: { ok: false, error: 'checking', models: [] },
};

/* ---------- Calculations ---------- */

function acctBalance(a) {
  let b = Number(a.openingBalance) || 0;
  for (const t of state.transactions) {
    if (t.type === 'income' && t.accountId === a.id) b += t.amount;
    else if (t.type === 'expense' && t.accountId === a.id) b -= t.amount;
    else if (t.type === 'adjust' && t.accountId === a.id) b += t.amount;
    else if (t.type === 'transfer') {
      if (t.accountId === a.id) b -= t.amount;
      if (t.toAccountId === a.id) b += t.amount;
    }
  }
  return round2(b);
}

const goalSaved = g => round2((Number(g.startingAmount) || 0) + sum(state.transactions.filter(t => t.toGoalId === g.id), t => t.amount));

function neededMonthly(g) {
  if (!g.deadline) return 0;
  const left = (Number(g.target) || 0) - goalSaved(g);
  if (left <= 0) return 0;
  return round2(left / Math.max(1, Math.ceil(monthsUntil(g.deadline))));
}

function recentMonthly(g) {
  const since = monthsAgoISO(3);
  return sum(state.transactions.filter(t => t.toGoalId === g.id && t.date >= since), t => t.amount) / 3;
}

function monthSummary(m) {
  const tx = state.transactions.filter(t => monthOf(t.date) === m);
  const byCat = {};
  tx.filter(t => t.type === 'expense').forEach(t => {
    const k = t.categoryId || 'none';
    byCat[k] = round2((byCat[k] || 0) + t.amount);
  });
  return {
    income: sum(tx.filter(t => t.type === 'income'), t => t.amount),
    expense: sum(tx.filter(t => t.type === 'expense'), t => t.amount),
    saved: sum(tx.filter(t => t.toGoalId), t => t.amount),
    byCat,
  };
}

function plan() {
  const income = Number(state.settings.monthlyIncome) || 0;
  const budgets = sum(state.categories, c => c.budget);
  const subs = sum(state.subscriptions, monthlyEq);
  const goals = sum(state.goals, neededMonthly);
  const planned = round2(budgets + subs + goals);
  return { income, budgets, subs, goals, planned, left: round2(income - planned) };
}

function netWorthSeries(n) {
  const days = [];
  const start = new Date();
  start.setDate(start.getDate() - n + 1);
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(isoOf(d));
  }
  const base = sum(state.accounts, a => a.openingBalance) + sum(state.goals, g => g.startingAmount);
  // Transfers move money between holdings and so do not change net worth.
  const deltas = state.transactions
    .filter(t => t.type !== 'transfer')
    .map(t => ({ date: t.date, v: t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : t.amount }));
  return days.map(day => base + sum(deltas.filter(d => d.date <= day), d => d.v));
}

function spendParts(m) {
  const by = monthSummary(m).byCat;
  return Object.entries(by)
    .map(([id, v]) => ({ name: id === 'none' ? 'Uncategorized' : catName(id), color: catColor(id), value: v }))
    .sort((a, b) => b.value - a.value);
}

function computeAlerts() {
  const out = [];
  const s = state.settings;
  const m = thisMonth();
  const ms = monthSummary(m);
  const day = new Date().getDate();

  if (!state.accounts.length) {
    out.push({ id: 'no-accounts', level: 'info', title: 'Add your accounts', body: 'Start with Chase Checking and your savings so balances and alerts become real.' });
  }
  state.accounts.forEach(a => {
    const b = acctBalance(a);
    if (b < 0) out.push({ id: 'neg-' + a.id, level: 'bad', title: `${a.name} is overdrawn`, body: `Balance is ${money(b)}.` });
    else if (a.type === 'checking' && b < s.lowBalance) out.push({ id: 'low-' + a.id, level: 'warn', title: `${a.name} is running low`, body: `${money(b)} left, under your ${money(s.lowBalance)} floor.` });
  });
  state.categories.filter(c => c.budget > 0).forEach(c => {
    const spent = ms.byCat[c.id] || 0;
    const pct = spent / c.budget * 100;
    if (pct >= 100) out.push({ id: `over-${c.id}-${m}`, level: 'bad', title: `${c.name} is over budget`, body: `${money(spent)} of ${money(c.budget)} used this month.` });
    else if (pct >= 80) out.push({ id: `near-${c.id}-${m}`, level: 'warn', title: `${c.name} at ${Math.round(pct)}%`, body: `${money(c.budget - spent)} left this month.` });
  });
  state.subscriptions.forEach(sub => {
    const d = daysBetween(today(), sub.nextDate);
    if (d < 0) out.push({ id: `subod-${sub.id}-${sub.nextDate}`, level: 'warn', title: `${sub.name} renewal is overdue`, body: `Due ${fmtDate(sub.nextDate)}. Mark it paid once it has charged.` });
    else if (d <= 3) out.push({ id: `sub-${sub.id}-${sub.nextDate}`, level: 'info', title: `${sub.name} renews ${d === 0 ? 'today' : `in ${d} day${d > 1 ? 's' : ''}`}`, body: `${money(sub.amount)}, ${CYCLE[sub.cycle].toLowerCase()}.` });
  });
  state.goals.forEach(g => {
    if (!g.deadline) return;
    const months = monthsUntil(g.deadline);
    const pct = g.target > 0 ? goalSaved(g) / g.target * 100 : 100;
    if (months <= 6 && pct < 50) {
      out.push({ id: `goal-${g.id}-${m}`, level: 'warn', title: `${g.name} is behind`, body: `${Math.round(pct)}% funded with about ${Math.round(months)} months left. Needs ${money(neededMonthly(g))}/mo.` });
    }
  });
  const p = plan();
  if (p.income > 0 && p.left < 0) out.push({ id: `plan-${m}`, level: 'bad', title: 'Plan is over income', body: `Planned outflows exceed income by ${money(-p.left)}.` });
  if (p.income > 0 && day >= 5 && ms.expense > 0) {
    const projected = ms.expense / day * daysInMonth(m);
    if (projected > p.income) out.push({ id: `pace-${m}`, level: 'warn', title: 'Spending pace is high', body: `At this rate you'd spend ${money(projected)} this month against ${money(p.income)} income.` });
  }
  return out
    .filter(a => state.dismissed[a.id] !== today())
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

function monthsWithData() {
  const set = new Set([ui.month, thisMonth(), ...state.transactions.map(t => monthOf(t.date))]);
  return [...set].sort().reverse();
}

/* ---------- Views: one page, built from ruled cells ---------- */

const emptyState = (title, body) => `<div class="empty"><b>${esc(title)}</b><span>${esc(body)}</span></div>`;

function opts(list, selected) {
  return list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

const pctChange = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) * 100 : null);
const monthShort = m => monthName(m).split(' ')[0].slice(0, 3);

function chip(change, goodWhenUp) {
  if (change === null || !Number.isFinite(change)) return '';
  const up = change >= 0;
  return `<span class="chip ${up === goodWhenUp ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%</span>`;
}

function sparkline(vals) {
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const W = 600, H = 160;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * W).toFixed(1)},${(H - 6 - (v - min) / span * (H - 14)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Net worth over the selected range">
    <defs>
      <linearGradient id="sl" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#2bd17e"/><stop offset="1" stop-color="#a3e635"/></linearGradient>
      <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2bd17e" stop-opacity=".22"/><stop offset="1" stop-color="#2bd17e" stop-opacity="0"/></linearGradient>
    </defs>
    <polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="url(#sg)"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="url(#sl)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="miter"/>
  </svg>`;
}

function gauge(pct) {
  const r = 90, C = Math.PI * r;
  const share = Math.min(100, Math.max(0, pct));
  return `<svg class="gauge" viewBox="0 0 220 124" aria-hidden="true">
    <path d="M20 112 A90 90 0 0 1 200 112" class="g-track"/>
    <path d="M20 112 A90 90 0 0 1 200 112" class="g-fill" pathLength="100" stroke-dasharray="${share.toFixed(2)} 100"/>
  </svg>`;
}

function barRows(parts) {
  if (!parts.length) return '';
  const max = parts[0].value;
  return parts.map(p => `<div class="brow2"><span>${esc(p.name)}</span><div class="bar"><i style="width:${(p.value / max * 100).toFixed(1)}%;background:${p.color}"></i></div><b>${money(p.value)}</b></div>`).join('');
}

function accountRow(a) {
  const b = acctBalance(a);
  const low = a.type === 'checking' && b < state.settings.lowBalance;
  const type = (ACCOUNT_TYPES.find(x => x[0] === a.type) || [])[1] || a.type;
  const initial = (a.name || '•').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase();
  return `<div class="acct-row ${low ? 'low' : ''}">
    <span class="avatar-sm">${esc(initial)}</span>
    <div class="grow"><b>${esc(a.name)}</b><span class="muted small">${esc(type)}${a.institution ? ' · ' + esc(a.institution) : ''}${low ? ' · below floor' : ''}</span></div>
    <div class="acct-bal ${b < 0 ? 'bad' : ''}">${money(b)}</div>
    <button class="icon" data-action="edit-account" data-id="${a.id}" title="Edit or update balance" aria-label="Edit account">✎</button>
  </div>`;
}

function alertList(list) {
  if (!list.length) return `<div class="calm"><b>All quiet.</b><span class="muted small">Nothing needs attention right now.</span></div>`;
  return `<ul class="alerts">${list.map(a => `<li class="alert ${a.level}"><div><b>${esc(a.title)}</b><span>${esc(a.body)}</span></div><button class="icon" title="Hide for today" aria-label="Dismiss" data-action="dismiss" data-id="${esc(a.id)}">×</button></li>`).join('')}</ul>`;
}

function txRow(t) {
  const isIn = t.type === 'income' || (t.type === 'adjust' && t.amount > 0);
  const title = t.merchant || ({ transfer: 'Transfer', adjust: 'Balance update', income: 'Income', expense: catName(t.categoryId) })[t.type];
  let meta;
  if (t.type === 'transfer') {
    const dest = t.toAccountId ? accName(t.toAccountId) : `Goal · ${byId(state.goals, t.toGoalId)?.name || 'removed'}`;
    meta = `${accName(t.accountId)} → ${dest}`;
  } else if (t.type === 'adjust' || t.type === 'income') meta = accName(t.accountId);
  else meta = `${catName(t.categoryId)} · ${accName(t.accountId)}`;
  const dot = t.type === 'expense' ? catColor(t.categoryId) : t.type === 'income' ? 'var(--good)' : t.type === 'transfer' ? 'var(--info)' : 'var(--muted)';
  const amt = t.type === 'transfer' ? money(t.amount) : `${isIn ? '+' : '−'}${money(Math.abs(t.amount))}`;
  return `<div class="tx">
    <span class="dot" style="background:${dot}"></span>
    <div class="tx-main"><b>${esc(title)}</b><span>${esc(meta)}${t.note ? ' · ' + esc(t.note) : ''}</span></div>
    <div class="tx-amt ${isIn ? 'good' : t.type === 'expense' ? 'bad' : ''}">${amt}</div>
    <div class="tx-acts"><button class="icon" data-action="edit-tx" data-id="${t.id}" title="Edit">✎</button><button class="icon" data-action="del-tx" data-id="${t.id}" title="Delete">×</button></div>
  </div>`;
}

function txList(list) {
  if (!list.length) return emptyState('Nothing logged yet', 'Add a spend, income, or a transfer into a goal.');
  let last = '';
  let html = '<div class="txlist">';
  for (const t of list) {
    if (t.date !== last) { last = t.date; html += `<h5 class="day">${dayLabel(t.date)}</h5>`; }
    html += txRow(t);
  }
  return html + '</div>';
}

function ledgerList() {
  const f = ui.f;
  const q = f.q.trim().toLowerCase();
  const list = state.transactions
    .filter(t => (!f.type || t.type === f.type)
      && (!f.cat || t.categoryId === f.cat)
      && (!f.acc || t.accountId === f.acc || t.toAccountId === f.acc)
      && (!f.month || monthOf(t.date) === f.month)
      && (!q || `${t.merchant || ''} ${t.note || ''}`.toLowerCase().includes(q)))
    .sort(byDate);
  const shown = list.slice(0, 60);
  const spent = sum(list.filter(t => t.type === 'expense'), t => t.amount);
  return `<p class="muted small summary">${list.length} entr${list.length === 1 ? 'y' : 'ies'} · ${money(spent)} spent in view${list.length > shown.length ? ` · showing first ${shown.length}` : ''}</p>` + txList(shown);
}

function subFull(s) {
  const d = daysBetween(today(), s.nextDate);
  const when = d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`;
  return `<div class="sub ${d < 0 ? 'od' : d <= 3 ? 'soon' : ''}">
    <div class="sub-main"><b>${esc(s.name)}</b><span>${CYCLE[s.cycle]} · ${esc(catName(s.categoryId))}${s.accountId ? ' · ' + esc(accName(s.accountId)) : ''}</span></div>
    <div class="sub-when"><span>${fmtDate(s.nextDate)} · ${when}</span><b>${money(s.amount)}</b><small>${money(monthlyEq(s))}/mo</small></div>
    <div class="sub-acts"><button class="ghost tiny" data-action="paid-sub" data-id="${s.id}">Paid</button><button class="icon" data-action="edit-sub" data-id="${s.id}" title="Edit">✎</button><button class="icon" data-action="del-sub" data-id="${s.id}" title="Delete">×</button></div>
  </div>`;
}

function goalCell(g) {
  const saved = goalSaved(g);
  const pct = g.target > 0 ? Math.min(100, saved / g.target * 100) : 0;
  const need = neededMonthly(g);
  const pace = recentMonthly(g);
  const kind = (GOAL_KINDS.find(k => k[0] === g.kind) || [])[1] || 'Goal';
  const eta = pace > 0 && g.target > saved ? `${money(pace)}/mo pace · ~${Math.ceil((g.target - saved) / pace)} mo to go` : 'No recent contributions yet';
  const dl = g.deadline ? (need > 0 ? `${money(need)}/mo to finish by ${fmtDate(g.deadline)}` : saved >= g.target ? 'Fully funded' : 'Deadline passed') : 'No target date';
  return `<article class="goal-c">
    <div class="goal-head"><span class="tag">${esc(kind)}</span><span class="grow"></span><button class="icon" data-action="edit-goal" data-id="${g.id}" title="Edit goal" aria-label="Edit goal">✎</button></div>
    <h3>${esc(g.name)}</h3>
    <p class="goal-num"><b>${money(saved)}</b> <span class="muted">/ ${money(g.target)} · ${pct.toFixed(0)}%</span></p>
    <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    <p class="small">${esc(dl)}</p>
    <p class="muted small">${esc(eta)}</p>
    <div class="row"><button class="primary tiny" data-action="contribute" data-id="${g.id}">Add money</button><button class="ghost tiny" data-action="del-goal" data-id="${g.id}">Delete</button></div>
  </article>`;
}

function chatLog() {
  if (!ui.chat.length) {
    return `<div class="msg assistant"><p>I read your balances, budgets, goals and subscriptions from this browser only. Ask anything about your money.</p></div>`;
  }
  return ui.chat.map(m => `<div class="msg ${m.role}"><p>${esc(m.text).replace(/\n/g, '<br>')}</p>${m.note ? `<small>${esc(m.note)}</small>` : ''}</div>`).join('');
}

function flow(label, value, change, goodWhenUp) {
  return `<div class="flow-row"><span class="muted">${esc(label)}</span><b>${value}</b>${chip(change, goodWhenUp)}</div>`;
}

function settingsHTML() {
  const s = state.settings;
  return `<div class="set-grid">
    <div class="set-col">
      <span class="kicker">Preferences</span>
      <label class="fld"><span>Currency</span><select data-change="setting" data-id="currency">${opts(CURRENCIES.map(c => [c, c]), s.currency)}</select></label>
      <label class="fld"><span>Low-balance floor</span><input type="number" min="0" step="50" value="${s.lowBalance}" data-change="setting" data-id="lowBalance"></label>
      <label class="fld"><span>Monthly income (after tax)</span><input type="number" min="0" step="50" value="${s.monthlyIncome || ''}" data-change="setting" data-id="monthlyIncome"></label>
      <label class="chk"><input type="checkbox" ${s.notifyBrowser ? 'checked' : ''} data-change="setting" data-id="notifyBrowser"><span>Browser notifications for renewals and overdrafts</span></label>
    </div>
    <div class="set-col">
      <span class="kicker">Local AI</span>
      <p class="muted small">Runs on this computer through Ollama, which is free and private. Install from ollama.com, then run <code>ollama pull llama3.2</code>.</p>
      <label class="chk"><input type="checkbox" ${s.aiEnabled ? 'checked' : ''} data-change="setting" data-id="aiEnabled"><span>Use the local AI when it is running</span></label>
      <label class="fld"><span>Endpoint</span><input value="${esc(s.aiEndpoint)}" data-change="setting" data-id="aiEndpoint"></label>
      <label class="fld"><span>Model</span><input value="${esc(s.aiModel)}" data-change="setting" data-id="aiModel"></label>
      <div class="row"><button class="primary tiny" data-action="ai-test">Test connection</button></div>
      <p id="ai-test-result" class="muted small"></p>
    </div>
    <div class="set-col">
      <span class="kicker">Your data</span>
      <p class="muted small">Saved only in this browser. Export a backup regularly; clearing site data erases it.</p>
      <div class="row wrap">
        <button class="ghost tiny" data-action="export-json">Export backup</button>
        <button class="ghost tiny" data-action="import-json">Restore backup</button>
        <button class="ghost tiny" data-action="export-csv">Export CSV</button>
        <button class="ghost tiny" data-action="seed-demo">Load demo data</button>
        <button class="ghost tiny" data-action="notify-enable">Enable notifications</button>
        <button class="danger tiny" data-action="reset">Erase everything</button>
      </div>
    </div>
  </div>`;
}

function pageHTML() {
  const m = ui.month;
  const ms = monthSummary(m);
  const pms = monthSummary(shiftMonth(m, -1));
  const p = plan();
  const alerts = computeAlerts();
  const liquid = sum(state.accounts, acctBalance);
  const goalsTot = sum(state.goals, goalSaved);
  const nw = round2(liquid + goalsTot);
  const days = ui.range || 30;
  const series = netWorthSeries(days);
  const nwChange = series.length > 1 ? pctChange(series[series.length - 1], series[0]) : null;
  const goals = state.goals;
  const spend = spendParts(m).slice(0, 5);
  const upcoming = [...state.subscriptions].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const subsMo = sum(state.subscriptions, monthlyEq);
  const budgetRows = state.categories.map(c => {
    const spent = ms.byCat[c.id] || 0;
    const pct = c.budget > 0 ? spent / c.budget * 100 : 0;
    const cls = !c.budget ? '' : pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    const note = !c.budget ? 'no budget' : spent > c.budget ? `${money(spent - c.budget)} over` : `${money(c.budget - spent)} left`;
    return `<div class="brow ${cls}">
      <span class="bname"><i style="background:${c.color}"></i>${esc(c.name)}</span>
      <label class="bbudget"><input type="number" min="0" step="10" value="${c.budget || ''}" placeholder="0" data-change="budget" data-id="${c.id}" aria-label="${esc(c.name)} monthly budget"></label>
      <div class="bar"><i style="width:${Math.min(100, pct).toFixed(1)}%"></i></div>
      <span class="bnums"><b>${money(spent)}</b><span class="muted small">${note}</span></span>
      <button class="icon" data-action="del-cat" data-id="${c.id}" title="Delete category" aria-label="Delete category">×</button>
    </div>`;
  }).join('');
  const segs = [['Budgets', p.budgets, '#2bd17e'], ['Subscriptions', p.subs, '#60a5fa'], ['Goals', p.goals, '#a3e635']];
  const assigned = segs.reduce((s, x) => s + x[1], 0);
  const free = Math.max(0, p.income - assigned);
  const stack = p.income > 0
    ? segs.filter(x => x[1] > 0).map(([l, v, c]) => `<i style="flex:${v};background:${c}" title="${l}: ${money(v)}"></i>`).join('')
      + (free > 0 ? `<i style="flex:${free};background:var(--surface-2)" title="Unassigned: ${money(free)}"></i>` : '')
    : '';
  const seg = [[30, '1M'], [90, '3M'], [365, '1Y']].map(([n, l]) => `<button class="${days === n ? 'on' : ''}" data-action="range" data-id="${n}">${l}</button>`).join('');
  const span = days === 365 ? 'over a year' : days === 90 ? 'over 3 months' : 'over a month';
  const primary = goals.find(g => g.kind === 'college') || goals[0];

  return `
  <div class="grid">
    <section class="cell c5 nw" id="overview">
      <div class="cell-head"><span class="kicker">Net worth</span><div class="seg" role="group" aria-label="Chart range">${seg}</div></div>
      <div class="nw-row"><span class="nw-val">${money(nw)}</span>${chip(nwChange, true)}<span class="muted small">${span}</span></div>
      ${sparkline(series)}
      <div class="axis"><span>${fmtDate(shiftDate(today(), -(days - 1)))}</span><span>${fmtDate(today())}</span></div>
    </section>

    <section class="cell c3">
      <div class="cell-head"><span class="kicker">${monthName(m)}</span><span class="muted small">vs ${monthShort(shiftMonth(m, -1))}</span></div>
      ${flow('Income', money(ms.income), pctChange(ms.income, pms.income), true)}
      ${flow('Spent', money(ms.expense), pctChange(ms.expense, pms.expense), false)}
      ${flow('To goals', money(ms.saved), null, true)}
      ${flow('Left to plan', p.income ? money(p.left) : '—', null, true)}
      <div class="spend-bars">${barRows(spend) || '<p class="muted small">No spending this month yet.</p>'}</div>
    </section>

    <section class="cell c4" id="plan">
      <div class="cell-head"><span class="kicker">Plan</span>
        <label class="inline">Income <input type="number" min="0" step="50" value="${p.income || ''}" placeholder="0" data-change="setting" data-id="monthlyIncome" aria-label="Monthly income"></label>
      </div>
      <div class="stackbar">${stack || '<i style="flex:1;background:var(--surface-2)"></i>'}</div>
      <ul class="plan-lines">
        <li><span>Category budgets</span><b>${money(p.budgets)}</b></li>
        <li><span>Subscriptions / mo</span><b>${money(p.subs)}</b></li>
        <li><span>Goals needed / mo</span><b>${money(p.goals)}</b></li>
        <li class="total"><span>Unassigned</span><b class="${p.left < 0 ? 'bad' : 'good'}">${p.income ? money(p.left) : '—'}</b></li>
      </ul>
      <p class="muted small">Lower a category budget that duplicates a subscription so it isn't counted twice.</p>
    </section>

    <section class="cell c8">
      <div class="cell-head"><span class="kicker">Budgets · ${monthName(m)}</span><button class="ghost tiny" data-action="add-cat">+ Category</button></div>
      <div class="budgets">${budgetRows || emptyState('No categories', 'Add a category to start budgeting.')}</div>
    </section>

    <section class="cell c4">
      <div class="cell-head"><span class="kicker">Signals</span><span class="muted small">${alerts.length} active</span></div>
      ${alertList(alerts)}
    </section>

    <section class="cell c5" id="accounts">
      <div class="cell-head"><span class="kicker">Accounts</span><button class="ghost tiny" data-action="add-account">+ Account</button></div>
      <div class="acct-list">${state.accounts.length ? state.accounts.map(accountRow).join('') : emptyState('No accounts yet', 'Add Chase Checking and your savings to begin.')}</div>
    </section>

    <section class="cell c4 gauge-cell" id="goals">
      <div class="cell-head"><span class="kicker">Goals</span><button class="ghost tiny" data-action="add-goal">+ Goal</button></div>
      ${primary ? `<div class="gauge-wrap">${gauge(goalSaved(primary) / Math.max(1, primary.target) * 100)}<div class="gauge-val"><b>${money(goalSaved(primary))}</b><span>of ${money(primary.target)}</span></div></div>` : emptyState('No goals yet', 'Create a College Fund to see progress here.')}
      <div class="goal-list">${goals.map(goalCell).join('')}</div>
    </section>

    <section class="cell c3" id="ledger-head">
      <div class="cell-head"><span class="kicker">Renewals · ${money(subsMo)}/mo</span><span class="muted small">${state.subscriptions.length} tracked</span></div>
      <div class="subs">${upcoming.length ? upcoming.map(subFull).join('') : emptyState('No subscriptions', 'Add Claude Code, GitHub, iCloud, or anything else that renews.')}</div>
      <div class="row"><button class="ghost tiny" data-action="add-sub">+ Subscription</button></div>
    </section>

    <section class="cell c12" id="ledger">
      <div class="cell-head"><span class="kicker">Ledger</span><button class="ghost tiny" data-action="export-csv">Export CSV</button></div>
      <div class="filters">
        <input type="search" placeholder="Search merchant or note" value="${esc(ui.f.q)}" data-input="q" aria-label="Search ledger">
        <select data-change="filter" data-id="type" aria-label="Type">${opts([['', 'All types'], ['expense', 'Spending'], ['income', 'Income'], ['transfer', 'Transfers'], ['adjust', 'Balance updates']], ui.f.type)}</select>
        <select data-change="filter" data-id="cat" aria-label="Category">${opts([['', 'All categories'], ...state.categories.map(c => [c.id, c.name])], ui.f.cat)}</select>
        <select data-change="filter" data-id="acc" aria-label="Account">${opts([['', 'All accounts'], ...state.accounts.map(a => [a.id, a.name])], ui.f.acc)}</select>
        <select data-change="filter" data-id="month" aria-label="Month">${opts([['', 'All months'], ...monthsWithData().map(x => [x, monthName(x)])], ui.f.month)}</select>
      </div>
      <div id="ledger-list">${ledgerList()}</div>
    </section>

    <section class="cell c12" id="ask">
      <div class="cell-head"><span class="kicker">Assistant</span><span class="chat-status ${ui.ai.ok && state.settings.aiEnabled ? 'on' : ''}"><span class="dot"></span>${!state.settings.aiEnabled ? 'Local AI off · built-in rules' : ui.ai.ok ? `Local ${esc(state.settings.aiModel)} ready` : ui.ai.error === 'checking' ? 'Checking local model…' : `Local AI not reached (${esc(ui.ai.error)}) · built-in rules`}</span></div>
      <div class="log" id="chat-log">${chatLog()}</div>
      <div class="chips">${QUICK.map(q => `<button class="chip-btn ghost" data-action="ask" data-id="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form id="chat-form" class="chatform" autocomplete="off"><input name="q" placeholder="Ask about your money…" aria-label="Ask a question"><button class="primary" type="submit">Ask</button></form>
    </section>
  </div>

  <details id="set" class="settings">
    <summary><span class="kicker">Settings &amp; data</span></summary>
    ${settingsHTML()}
  </details>`;
}

function render() {
  $('#eyebrow').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  $('#top-actions').innerHTML = topActions();
  $('#view').innerHTML = pageHTML();
  document.title = 'Budgie';
  updateAIPill();
}

function topActions() {
  const monthNav = `<div class="monthnav"><button class="icon" data-action="month" data-id="-1" aria-label="Previous month">‹</button><span>${monthName(ui.month)}</span><button class="icon" data-action="month" data-id="1" aria-label="Next month">›</button></div>`;
  return monthNav + `<button class="ghost tiny" data-action="add-account">+ Account</button><button class="primary tiny" data-action="add-tx">+ Entry</button>`;
}

function commit() {
  save();
  render();
}

function updateAIPill() {
  const p = $('#ai-pill');
  if (!p) return;
  const on = state.settings.aiEnabled;
  p.className = 'pill ' + (on && ui.ai.ok ? 'ok' : on ? 'muted' : '');
  p.textContent = !on ? 'AI off · rules'
    : ui.ai.error === 'checking' ? 'AI · checking'
    : ui.ai.ok ? 'AI · local ready'
    : 'AI · rules only';
}

/* ---------- Forms ---------- */

function fieldHTML(f) {
  const show = f.show ? `data-show="${f.show}"` : '';
  let input;
  if (f.type === 'select') {
    input = `<select name="${f.name}">${opts(f.options, f.value)}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea name="${f.name}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc(f.value)}</textarea>`;
  } else {
    input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}"
      ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''}
      ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">`;
  }
  return `<label class="field" ${show}><span>${esc(f.label)}</span>${input}</label>`;
}

function openForm(title, fields, onSave) {
  const dlg = $('#modal');
  const form = $('#modal-form');
  form.innerHTML = `
    <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon" data-close aria-label="Close">×</button></div>
    <div class="form-grid">${fields.map(fieldHTML).join('')}</div>
    <div class="sheet-foot"><button type="button" class="ghost" data-close>Cancel</button><button class="primary" type="submit">Save</button></div>`;
  const sync = () => {
    const type = form.elements.type?.value;
    form.querySelectorAll('[data-show]').forEach(el => { el.hidden = el.dataset.show !== type; });
  };
  form.oninput = sync;
  form.onchange = sync;
  sync();
  form.onsubmit = e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    if (onSave(d) !== false) dlg.close();
  };
  dlg.showModal();
  setTimeout(() => form.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
}

function txForm(t = {}) {
  if (!state.accounts.length) { toast('Add an account first, from Overview.', 'warn'); return; }
  const isNew = !t.id;
  const targets = [
    ...state.accounts.map(a => [`acc:${a.id}`, `Account · ${a.name}`]),
    ...state.goals.map(g => [`goal:${g.id}`, `Goal · ${g.name}`]),
  ];
  const targetVal = t.toAccountId ? `acc:${t.toAccountId}` : t.toGoalId ? `goal:${t.toGoalId}` : (targets[0]?.[0] || '');
  openForm(isNew ? 'New entry' : 'Edit entry', [
    { name: 'type', label: 'What happened', type: 'select', options: [['expense', 'Spending'], ['income', 'Income'], ['transfer', 'Transfer or save']], value: t.type || 'expense' },
    { name: 'amount', label: 'Amount', type: 'number', step: '0.01', min: '0.01', required: true, value: t.amount ?? '' },
    { name: 'date', label: 'Date', type: 'date', required: true, value: t.date || today() },
    { name: 'accountId', label: 'From account', type: 'select', options: state.accounts.map(a => [a.id, a.name]), value: t.accountId || state.accounts[0].id },
    { name: 'categoryId', label: 'Category', type: 'select', options: state.categories.map(c => [c.id, c.name]), value: t.categoryId || catIdByName('Food & Dining'), show: 'expense' },
    { name: 'target', label: 'Send to', type: 'select', options: targets, value: targetVal, show: 'transfer' },
    { name: 'merchant', label: 'Merchant or source', value: t.merchant || '', placeholder: 'e.g. Uniqlo, Payroll' },
    { name: 'note', label: 'Note', type: 'textarea', value: t.note || '' },
  ], d => {
    const amount = round2(Math.abs(d.amount));
    if (!(amount > 0)) { toast('Enter an amount above zero.', 'warn'); return false; }
    const tx = {
      id: t.id || uid(), type: d.type, amount, date: d.date, accountId: d.accountId,
      categoryId: d.type === 'expense' ? d.categoryId : null,
      toAccountId: null, toGoalId: null,
      merchant: d.merchant.trim(), note: d.note.trim(),
    };
    if (d.type === 'transfer') {
      const [kind, id] = String(d.target).split(':');
      if (kind === 'acc') tx.toAccountId = id;
      else if (kind === 'goal') tx.toGoalId = id;
      if (!tx.toAccountId && !tx.toGoalId) { toast('Choose where the money goes.', 'warn'); return false; }
      if (tx.toAccountId === tx.accountId) { toast('Pick two different accounts.', 'warn'); return false; }
    }
    if (isNew) state.transactions.push(tx);
    else state.transactions[state.transactions.findIndex(x => x.id === t.id)] = tx;
    commit();
    toast(isNew ? 'Entry added' : 'Entry updated', 'good');
  });
}

function accountForm(a = {}) {
  const isNew = !a.id;
  openForm(isNew ? 'New account' : 'Edit account', [
    { name: 'name', label: 'Account name', required: true, value: a.name || '', placeholder: 'Chase Checking' },
    { name: 'institution', label: 'Institution', value: a.institution || '', placeholder: 'Chase' },
    { name: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES, value: a.type || 'checking' },
    { name: 'current', label: isNew ? 'Current balance today' : 'Balance today (changing it logs an update)', type: 'number', step: '0.01', required: true, value: isNew ? '' : acctBalance(a) },
  ], d => {
    const name = d.name.trim();
    if (!name) return false;
    const cur = round2(d.current);
    if (isNew) {
      state.accounts.push({ id: uid(), name, institution: d.institution.trim(), type: d.type, openingBalance: cur });
      toast(`${name} added`, 'good');
    } else {
      const diff = round2(cur - acctBalance(a));
      a.name = name;
      a.institution = d.institution.trim();
      a.type = d.type;
      if (Math.abs(diff) > 0.004) {
        state.transactions.push({ id: uid(), type: 'adjust', amount: diff, date: today(), accountId: a.id, categoryId: null, toAccountId: null, toGoalId: null, merchant: 'Balance update', note: 'Set to the balance you entered' });
      }
      toast('Account updated', 'good');
    }
    commit();
  });
}

function goalForm(g = {}) {
  const isNew = !g.id;
  openForm(isNew ? 'New goal' : 'Edit goal', [
    { name: 'name', label: 'Goal name', required: true, value: g.name || '', placeholder: 'College Fund · Fall 2028' },
    { name: 'kind', label: 'Kind', type: 'select', options: GOAL_KINDS, value: g.kind || 'savings' },
    { name: 'target', label: 'Target amount', type: 'number', step: '1', min: '1', required: true, value: g.target ?? '' },
    { name: 'saved', label: 'Saved so far', type: 'number', step: '0.01', min: '0', required: true, value: isNew ? '' : goalSaved(g) },
    { name: 'deadline', label: 'Target date (optional)', type: 'date', value: g.deadline || '' },
  ], d => {
    const target = round2(d.target);
    const saved = round2(d.saved);
    const name = d.name.trim();
    if (!name || !(target > 0)) { toast('A goal needs a name and a target above zero.', 'warn'); return false; }
    if (isNew) {
      state.goals.push({ id: uid(), name, kind: d.kind, target, startingAmount: saved, deadline: d.deadline || null });
    } else {
      const contributed = sum(state.transactions.filter(t => t.toGoalId === g.id), t => t.amount);
      Object.assign(g, { name, kind: d.kind, target, startingAmount: round2(saved - contributed), deadline: d.deadline || null });
    }
    commit();
    toast('Goal saved', 'good');
  });
}

function contributeForm(g) {
  if (!state.accounts.length) { toast('Add an account first, from Overview.', 'warn'); return; }
  openForm(`Add money to ${g.name}`, [
    { name: 'amount', label: 'Amount', type: 'number', step: '0.01', min: '0.01', required: true },
    { name: 'accountId', label: 'From account', type: 'select', options: state.accounts.map(a => [a.id, `${a.name} · ${money(acctBalance(a))}`]), value: state.accounts[0].id },
    { name: 'date', label: 'Date', type: 'date', value: today() },
  ], d => {
    const amount = round2(d.amount);
    if (!(amount > 0)) { toast('Enter an amount above zero.', 'warn'); return false; }
    const from = byId(state.accounts, d.accountId);
    state.transactions.push({ id: uid(), type: 'transfer', amount, date: d.date, accountId: d.accountId, toGoalId: g.id, toAccountId: null, categoryId: null, merchant: `To ${g.name}`, note: '' });
    commit();
    if (from && acctBalance(from) < 0) toast(`${from.name} is now overdrawn. Check the amount.`, 'bad');
    else toast(`${money(amount)} added to ${g.name}`, 'good');
  });
}

function subForm(s = {}) {
  const isNew = !s.id;
  openForm(isNew ? 'New subscription' : 'Edit subscription', [
    { name: 'name', label: 'Service', required: true, value: s.name || '', placeholder: 'Claude Code' },
    { name: 'amount', label: 'Amount per cycle', type: 'number', step: '0.01', min: '0', required: true, value: s.amount ?? '' },
    { name: 'cycle', label: 'Billing cycle', type: 'select', options: Object.entries(CYCLE), value: s.cycle || 'monthly' },
    { name: 'nextDate', label: 'Next renewal', type: 'date', required: true, value: s.nextDate || today() },
    { name: 'categoryId', label: 'Category', type: 'select', options: state.categories.map(c => [c.id, c.name]), value: s.categoryId || catIdByName('Software & Subscriptions') },
    { name: 'accountId', label: 'Paid from', type: 'select', options: [['', 'Not linked'], ...state.accounts.map(a => [a.id, a.name])], value: s.accountId || '' },
  ], d => {
    const name = d.name.trim();
    const amount = round2(d.amount);
    if (!name) return false;
    const obj = { name, amount, cycle: d.cycle, nextDate: d.nextDate, categoryId: d.categoryId, accountId: d.accountId || null };
    if (isNew) state.subscriptions.push({ id: uid(), ...obj });
    else Object.assign(s, obj);
    commit();
    toast('Subscription saved', 'good');
  });
}

function catForm() {
  openForm('New category', [
    { name: 'name', label: 'Name', required: true, placeholder: 'Gear & tools' },
    { name: 'budget', label: 'Monthly budget (optional)', type: 'number', step: '10', min: '0', value: '' },
    { name: 'color', label: 'Color', type: 'color', value: '#c9a77c' },
  ], d => {
    const name = d.name.trim();
    if (!name) return false;
    state.categories.push({ id: uid(), name, color: d.color || '#8a8374', budget: round2(d.budget) || 0 });
    commit();
    toast(`${name} added`, 'good');
  });
}

/* ---------- Assistant ---------- */

function briefing() {
  const m = thisMonth();
  const ms = monthSummary(m);
  const p = plan();
  return JSON.stringify({
    currency: state.settings.currency,
    today: today(),
    accounts: state.accounts.map(a => ({ name: a.name, type: a.type, balance: acctBalance(a) })),
    netWorth: round2(sum(state.accounts, acctBalance) + sum(state.goals, goalSaved)),
    thisMonth: {
      month: m, income: ms.income, spent: ms.expense, savedToGoals: ms.saved,
      spentByCategory: Object.fromEntries(Object.entries(ms.byCat).map(([k, v]) => [catName(k), v])),
    },
    budgets: state.categories.filter(c => c.budget > 0).map(c => ({ category: c.name, monthlyBudget: c.budget, spent: ms.byCat[c.id] || 0 })),
    plan: p,
    goals: state.goals.map(g => ({ name: g.name, kind: g.kind, target: g.target, saved: goalSaved(g), deadline: g.deadline || null, monthlyNeeded: neededMonthly(g), recentMonthlyPace: round2(recentMonthly(g)) })),
    subscriptions: state.subscriptions.map(s => ({ name: s.name, monthlyCost: round2(monthlyEq(s)), nextRenewal: s.nextDate })),
    recentTransactions: [...state.transactions].sort(byDate).slice(0, 15).map(t => ({
      date: t.date, type: t.type, amount: t.amount,
      category: t.type === 'expense' ? catName(t.categoryId) : undefined,
      merchant: t.merchant || undefined,
    })),
  });
}

function answerOffline(q) {
  const s = q.toLowerCase();
  if (!state.accounts.length) return 'Add your accounts first (Overview, then + Account). Then I can answer balance and spending questions.';
  const m = thisMonth();
  const ms = monthSummary(m);
  const p = plan();
  const day = new Date().getDate();
  const checking = sum(state.accounts.filter(a => a.type === 'checking'), acctBalance);
  const dueSoon = sum(state.subscriptions.filter(x => daysBetween(today(), x.nextDate) <= 30), x => x.amount);
  const amountMatch = q.match(/(\d[\d,]*(?:\.\d+)?)/);

  if (s.includes('afford') && amountMatch) {
    const cost = Number(amountMatch[1].replace(/,/g, ''));
    const after = round2(checking - dueSoon - cost);
    const verdict = after < 0
      ? 'That would overdraw checking, so I would wait.'
      : after < state.settings.lowBalance
        ? `That would drop checking under your ${money(state.settings.lowBalance)} floor. Risky right now.`
        : 'That fits, though check it against the category budget too.';
    return `Checking: ${money(checking)}. Subscriptions due in the next 30 days: ${money(dueSoon)}. After buying ${money(cost)}: ${money(after)}.\n${verdict}`;
  }
  if (s.includes('subscri') || s.includes('renew')) {
    if (!state.subscriptions.length) return 'No subscriptions tracked yet. Add them in the Subscriptions view.';
    const lines = state.subscriptions.map(x => `${x.name}: ${money(x.amount)} ${CYCLE[x.cycle].toLowerCase()}, renews ${fmtDate(x.nextDate)}.`);
    const mo = sum(state.subscriptions, monthlyEq);
    return [...lines, `Total: ${money(mo)} a month, about ${money(mo * 12)} a year.`].join('\n');
  }
  if (s.includes('goal') || s.includes('college') || s.includes('fund')) {
    if (!state.goals.length) return 'No goals yet. Add a College Fund in the Goals view.';
    return state.goals.map(g => {
      const saved = goalSaved(g);
      const pct = g.target > 0 ? Math.round(saved / g.target * 100) : 0;
      const pace = recentMonthly(g);
      const need = neededMonthly(g);
      const parts = [`${g.name}: ${money(saved)} of ${money(g.target)} (${pct}%).`];
      if (need > 0) parts.push(`It needs ${money(need)} a month to finish by ${fmtDate(g.deadline)}.`);
      if (pace > 0 && g.target > saved) parts.push(`At your recent ${money(pace)} a month, about ${Math.ceil((g.target - saved) / pace)} months to go.`);
      else if (saved < g.target) parts.push('No recent contributions, so there is no pace yet.');
      return parts.join(' ');
    }).join('\n');
  }
  if (s.includes('over') || s.includes('budget')) {
    if (!state.categories.some(c => c.budget > 0)) return 'No category budgets set yet. Set them in Budgets & plan.';
    const over = state.categories.filter(c => c.budget > 0 && (ms.byCat[c.id] || 0) > c.budget);
    const near = state.categories.filter(c => c.budget > 0 && (ms.byCat[c.id] || 0) >= c.budget * 0.8 && (ms.byCat[c.id] || 0) <= c.budget);
    if (!over.length && !near.length) return 'Nothing is over budget or close to it this month. Good shape.';
    return [
      ...over.map(c => `${c.name} is over by ${money((ms.byCat[c.id] || 0) - c.budget)}.`),
      ...near.map(c => `${c.name} is at ${Math.round((ms.byCat[c.id] || 0) / c.budget * 100)}%.`),
    ].join('\n');
  }
  if (s.includes('spend') || s.includes('spent') || s.includes('week')) {
    const left = sum(state.categories.filter(c => c.budget > 0), c => Math.max(0, c.budget - (ms.byCat[c.id] || 0)));
    const daysLeft = daysInMonth(m) - day + 1;
    const top = Object.entries(ms.byCat).sort((a, b) => b[1] - a[1])[0];
    let out = `You have spent ${money(ms.expense)} in ${monthName(m)}.`;
    if (top) out += ` The biggest category is ${catName(top[0])} at ${money(top[1])}.`;
    out += left > 0
      ? `\nBudget room left this month: ${money(left)} across ${daysLeft} days, about ${money(left / daysLeft * 7)} a week.`
      : '\nSet category budgets to get a weekly spending number.';
    return out;
  }
  if (s.includes('save') || s.includes('plan')) {
    if (!p.income) return 'Set your monthly income in Budgets & plan first, then I can split it for you.';
    const advice = p.left > 0
      ? `You have ${money(p.left)} unassigned. Put it toward the goal with the nearest date, or keep it as a buffer.`
      : p.left < 0
        ? `You are ${money(-p.left)} over. Trim the biggest budget or push a goal's date out.`
        : 'Every dollar is assigned.';
    return `Income ${money(p.income)}: budgets ${money(p.budgets)}, subscriptions ${money(p.subs)}, goal savings ${money(p.goals)}.\n${advice}`;
  }
  if (s.includes('balance') || s.includes('have') || s.includes('account')) {
    return state.accounts.map(a => `${a.name}: ${money(acctBalance(a))}`).join('\n')
      + `\nTotal in accounts: ${money(sum(state.accounts, acctBalance))}.`;
  }
  return 'Offline rules can answer: balances, what you spent, budgets, subscriptions, goals, and "Can I afford $X?". Start a local model in Settings for open questions.';
}

async function askAssistant(question) {
  const q = String(question || '').trim();
  if (!q) return;
  ui.chat.push({ role: 'user', text: q });
  const pending = { role: 'assistant', text: 'Thinking…', pending: true };
  ui.chat.push(pending);
  refreshLog();

  let reply;
  let note = '';
  if (state.settings.aiEnabled) {
    try {
      const history = ui.chat.filter(m => !m.pending).slice(-8).map(m => ({ role: m.role, content: m.text }));
      reply = await LocalAI.chat({
        endpoint: state.settings.aiEndpoint,
        model: state.settings.aiModel,
        system: `${SYSTEM}\n\nSnapshot:\n${briefing()}`,
        messages: history,
      });
      ui.ai = { ok: true, error: '', models: ui.ai.models };
    } catch (e) {
      ui.ai = { ok: false, error: e.name === 'AbortError' ? 'timed out' : (e.message || 'unreachable'), models: [] };
      reply = answerOffline(q);
      note = 'Local AI did not respond, so this came from built-in rules.';
    }
  } else {
    reply = answerOffline(q);
    note = 'Built-in rules (local AI is turned off).';
  }
  Object.assign(pending, { text: reply, note, pending: false });
  refreshLog();
  updateAIPill();
}

function refreshLog() {
  const el = $('#chat-log');
  if (!el) return;
  el.innerHTML = chatLog();
  el.scrollTop = el.scrollHeight;
}

async function testAI() {
  const result = $('#ai-test-result');
  if (result) result.textContent = 'Checking…';
  ui.ai = { ok: false, error: 'checking', models: [] };
  updateAIPill();
  const r = await LocalAI.ping(state.settings.aiEndpoint);
  ui.ai = { ok: r.ok, error: r.ok ? '' : r.error, models: r.models || [] };
  const want = state.settings.aiModel.trim();
  const installed = r.ok && r.models.some(n => n === want || n === `${want}:latest` || n.startsWith(`${want}:`));
  let msg;
  if (!r.ok) msg = `Not reachable (${r.error}). Is Ollama running? Start it with "ollama serve".`;
  else if (!installed) msg = `Connected, but the model "${want}" is not installed. Run: ollama pull ${want}`;
  else msg = `Connected. "${want}" is ready.`;
  render();
  const after = $('#ai-test-result');
  if (after) after.textContent = msg;
}

/* ---------- Notifications ---------- */

async function enableNotifications() {
  if (!('Notification' in window)) { toast('This browser does not support notifications.', 'warn'); return; }
  const perm = await Notification.requestPermission();
  state.settings.notifyBrowser = perm === 'granted';
  commit();
  toast(perm === 'granted' ? 'Notifications are on' : 'Notifications are blocked in browser settings', perm === 'granted' ? 'good' : 'warn');
}

function maybeNotify() {
  if (!state.settings.notifyBrowser || !('Notification' in window)) return;
  if (Notification.permission !== 'granted' || state.notifiedOn === today()) return;
  computeAlerts().filter(a => a.level !== 'info').slice(0, 3).forEach(a => {
    new Notification(`Budgie · ${a.title}`, { body: a.body, tag: a.id });
  });
  state.notifiedOn = today();
  save();
}

/* ---------- Demo data & export ---------- */

function demoState() {
  const s = defaultState();
  const cat = n => s.categories.find(c => c.name === n).id;
  const chk = uid(), sav = uid(), jum = uid();
  s.accounts = [
    { id: chk, name: 'Chase Checking', institution: 'Chase', type: 'checking', openingBalance: 1240.55 },
    { id: sav, name: 'Chase Savings', institution: 'Chase', type: 'savings', openingBalance: 850 },
    { id: jum, name: 'Jumbo Cash', institution: 'Jumbo', type: 'savings', openingBalance: 2100 },
  ];
  const college = { id: uid(), name: 'College Fund', kind: 'college', target: 12000, startingAmount: 1500, deadline: shiftDate(today(), 730) };
  const emergency = { id: uid(), name: 'Emergency Fund', kind: 'emergency', target: 5000, startingAmount: 800, deadline: null };
  s.goals = [college, emergency];
  s.settings.monthlyIncome = 4700;
  const budgets = { 'Food & Dining': 400, 'Clothing': 120, 'Electronics & Tools': 250, 'Daily Essentials': 200, 'Entertainment': 80, 'Transport': 150, 'College': 300 };
  s.categories.forEach(c => { c.budget = budgets[c.name] || 0; });
  s.subscriptions = [
    { id: uid(), name: 'Claude Code', amount: 100, cycle: 'monthly', nextDate: shiftDate(today(), 6), categoryId: cat('Software & Subscriptions'), accountId: chk },
    { id: uid(), name: 'iCloud+', amount: 2.99, cycle: 'monthly', nextDate: shiftDate(today(), 2), categoryId: cat('Software & Subscriptions'), accountId: chk },
    { id: uid(), name: 'Spotify Student', amount: 5.99, cycle: 'monthly', nextDate: shiftDate(today(), 20), categoryId: cat('Entertainment'), accountId: chk },
    { id: uid(), name: 'Domain renewal', amount: 14, cycle: 'yearly', nextDate: shiftDate(today(), 90), categoryId: cat('Software & Subscriptions'), accountId: null },
  ];
  const T = [
    { d: 1, type: 'income', a: 2350, m: 'Payroll · Employer' },
    { d: 15, type: 'income', a: 2350, m: 'Payroll · Employer' },
    { d: 20, type: 'income', a: 8.4, m: 'High-yield interest', acc: 'jumbo' },
    { d: 2, c: 'Housing', a: 1450, m: 'Rent share' },
    { d: 4, c: 'Food & Dining', a: 86.4, m: "Trader Joe's" },
    { d: 6, c: 'Transport', a: 64, m: 'Metro top-up' },
    { d: 9, c: 'Clothing', a: 118, m: 'Uniqlo' },
    { d: 11, c: 'Electronics & Tools', a: 249, m: 'Mechanical keyboard' },
    { d: 13, c: 'College', a: 212, m: 'Textbook' },
    { d: 16, c: 'Food & Dining', a: 42.1, m: 'Chipotle' },
    { d: 18, c: 'Daily Essentials', a: 57.3, m: 'Pharmacy' },
    { d: 21, c: 'Entertainment', a: 28, m: 'Cinema' },
    { d: 23, c: 'Health', a: 35, m: 'Gym' },
    { d: 25, c: 'Food & Dining', a: 64.9, m: 'Groceries' },
    { d: 27, type: 'transfer', a: 300, m: 'Monthly college transfer', toGoal: true },
    { d: 28, type: 'transfer', a: 200, m: 'Save to Chase Savings', toAcc: true },
  ];
  const now = new Date();
  for (let mo = -2; mo <= 0; mo++) {
    for (const t of T) {
      const date = isoOf(new Date(now.getFullYear(), now.getMonth() + mo, t.d));
      if (date > today()) continue;
      const base = { id: uid(), date, merchant: t.m, note: '', categoryId: null, toAccountId: null, toGoalId: null };
      if (t.type === 'income') s.transactions.push({ ...base, type: 'income', amount: t.a, accountId: t.acc === 'jumbo' ? jum : chk });
      else if (t.type === 'transfer') s.transactions.push({ ...base, type: 'transfer', amount: t.a, accountId: chk, toAccountId: t.toAcc ? sav : null, toGoalId: t.toGoal ? college.id : null });
      else s.transactions.push({ ...base, type: 'expense', amount: t.a, accountId: chk, categoryId: cat(t.c) });
    }
  }
  return s;
}

function toCSV() {
  const head = ['date', 'type', 'amount', 'merchant', 'category', 'from', 'to', 'note'];
  const rows = [...state.transactions].sort((a, b) => a.date.localeCompare(b.date)).map(t => [
    t.date, t.type, t.amount, t.merchant || '',
    t.type === 'expense' ? catName(t.categoryId) : '',
    accName(t.accountId),
    t.toAccountId ? accName(t.toAccountId) : t.toGoalId ? `Goal: ${byId(state.goals, t.toGoalId)?.name || ''}` : '',
    t.note || '',
  ]);
  return [head, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

/* ---------- Actions & events ---------- */

const ACTIONS = {
  'month': id => { ui.month = shiftMonth(ui.month, Number(id)); render(); },
  'add-tx': () => txForm(),
  'edit-tx': id => txForm(byId(state.transactions, id)),
  'del-tx': id => {
    if (!confirm('Delete this entry?')) return;
    state.transactions = state.transactions.filter(t => t.id !== id);
    commit();
    toast('Entry deleted');
  },
  'add-account': () => accountForm(),
  'edit-account': id => accountForm(byId(state.accounts, id)),
  'del-account': id => {
    const a = byId(state.accounts, id);
    const n = state.transactions.filter(t => t.accountId === id || t.toAccountId === id).length;
    if (!confirm(`Delete ${a.name}${n ? ` and its ${n} linked entries` : ''}?`)) return;
    state.accounts = state.accounts.filter(x => x.id !== id);
    state.transactions = state.transactions.filter(t => t.accountId !== id && t.toAccountId !== id);
    state.subscriptions.forEach(s => { if (s.accountId === id) s.accountId = null; });
    commit();
    toast('Account deleted');
  },
  'add-goal': () => goalForm(),
  'edit-goal': id => goalForm(byId(state.goals, id)),
  'contribute': id => contributeForm(byId(state.goals, id)),
  'del-goal': id => {
    const g = byId(state.goals, id);
    const n = state.transactions.filter(t => t.toGoalId === id).length;
    if (!confirm(`Delete "${g.name}"?${n ? ` Its ${n} contribution(s) will be removed from the ledger too.` : ''}`)) return;
    state.transactions = state.transactions.filter(t => t.toGoalId !== id);
    state.goals = state.goals.filter(x => x.id !== id);
    commit();
    toast('Goal removed');
  },
  'add-sub': () => subForm(),
  'edit-sub': id => subForm(byId(state.subscriptions, id)),
  'del-sub': id => {
    if (!confirm('Remove this subscription? Past payments stay in the ledger.')) return;
    state.subscriptions = state.subscriptions.filter(x => x.id !== id);
    commit();
    toast('Subscription removed');
  },
  'paid-sub': id => {
    const s = byId(state.subscriptions, id);
    state.transactions.push({
      id: uid(), type: 'expense', amount: round2(s.amount), date: today(),
      accountId: s.accountId || null, categoryId: s.categoryId || null,
      toAccountId: null, toGoalId: null, merchant: s.name, note: 'Subscription',
    });
    s.nextDate = addCycle(s.nextDate, s.cycle);
    commit();
    toast(`${s.name} marked paid. Next renewal ${fmtDate(s.nextDate)}.`, 'good');
  },
  'add-cat': () => catForm(),
  'del-cat': id => {
    const c = byId(state.categories, id);
    if (state.categories.length <= 1) return;
    if (!confirm(`Delete ${c.name}? Its spending moves to Other.`)) return;
    const other = state.categories.find(x => x.name === 'Other' && x.id !== id) || state.categories.find(x => x.id !== id);
    state.transactions.forEach(t => { if (t.categoryId === id) t.categoryId = other.id; });
    state.subscriptions.forEach(s => { if (s.categoryId === id) s.categoryId = other.id; });
    state.categories = state.categories.filter(x => x.id !== id);
    commit();
    toast(`${c.name} deleted`);
  },
  'dismiss': id => { state.dismissed[id] = today(); commit(); },
  'range': id => { ui.range = Number(id); render(); },
  'theme': () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('ledgerline.theme', next); } catch (e) { /* storage blocked: theme still switches */ }
  },
  'ask': id => askAssistant(id),
  'clear-chat': () => { ui.chat = []; render(); },
  'ai-test': () => testAI(),
  'notify-enable': () => enableNotifications(),
  'seed-demo': () => {
    if ((state.accounts.length || state.transactions.length) && !confirm('Replace your current data with the demo set?')) return;
    state = demoState();
    commit();
    toast('Demo data loaded. Edit or erase it when you are ready.', 'good');
  },
  'reset': () => {
    if (!confirm('Erase all Budgie data in this browser? Export a backup first.')) return;
    state = defaultState();
    commit();
    toast('Everything erased');
  },
  'export-json': () => download(`budgie-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json'),
  'import-json': () => $('#import-file').click(),
  'export-csv': () => download(`budgie-transactions-${today()}.csv`, toCSV(), 'text/csv'),
};

const CHANGES = {
  filter: (id, val) => { ui.f[id] = val; render(); },
  budget: (id, val) => {
    const c = byId(state.categories, id);
    c.budget = round2(Math.max(0, Number(val) || 0));
    commit();
  },
  setting: (name, val, el) => {
    if (name === 'notifyBrowser' && el.checked) { enableNotifications(); return; }
    const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (Number(val) || 0) : val;
    state.settings[name] = v;
    if (name === 'aiEnabled' || name === 'aiEndpoint' || name === 'aiModel') {
      ui.ai = { ok: false, error: 'checking', models: [] };
      testAI();
    }
    commit();
    if (!['aiEndpoint', 'aiModel'].includes(name)) toast('Saved', 'good');
  },
};

function onClick(e) {
  const el = e.target.closest('[data-action],[data-view],[data-close]');
  if (!el) return;
  if (el.hasAttribute('data-close')) { $('#modal').close(); return; }
  if (el.dataset.view) {
    ui.view = el.dataset.view;
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el.dataset.id, el);
}

function setupFab() {
  const fab = $('#fab');
  const btn = $('#fab-toggle');
  const panel = $('#fab-panel');
  const setOpen = open => {
    fab.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(!fab.classList.contains('open')); });
  panel.addEventListener('click', e => { if (e.target.closest('a,button')) setOpen(false); });
  document.addEventListener('click', e => { if (!fab.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
}

function init() {
  document.addEventListener('click', onClick);

  document.addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.change;
    if (k && CHANGES[k]) CHANGES[k](e.target.dataset.id, e.target.value, e.target);
  });

  document.addEventListener('input', e => {
    if (e.target.dataset && e.target.dataset.input === 'q') {
      ui.f.q = e.target.value;
      const list = $('#ledger-list');
      if (list) list.innerHTML = ledgerList();
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id === 'global-search') {
      e.preventDefault();
      ui.view = 'ledger';
      ui.f.q = e.target.elements.q.value.trim();
      render();
      return;
    }
    if (e.target.id !== 'chat-form') return;
    e.preventDefault();
    const input = e.target.elements.q;
    const q = input.value;
    input.value = '';
    askAssistant(q);
  });

  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.close(); });

  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.accounts) || !Array.isArray(data.transactions)) throw new Error('this is not a Budgie backup');
      const d = defaultState();
      state = { ...d, ...data, settings: { ...d.settings, ...(data.settings || {}) } };
      commit();
      toast('Backup restored', 'good');
    } catch (err) {
      toast(`Could not restore: ${err.message}`, 'bad');
    }
    e.target.value = '';
  });

  try {
    const saved = localStorage.getItem('ledgerline.theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch (e) { /* storage blocked: keep the default theme */ }
  render();
  setupFab();
  // Entrance animation plays once; later re-renders stay still.
  setTimeout(() => document.body.classList.add('ready'), 900);
  maybeNotify();
  testAI();
}

init();
