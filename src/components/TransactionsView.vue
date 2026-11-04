<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { CATEGORIES } from '../lib/categorize';
import PickMenu from './PickMenu.vue';
import LogoFix from './LogoFix.vue';
import { fixLogo } from '../lib/store';

// The ledger. Short mode on Transactions; full mode with filters on Reports.
// fill: the list takes exactly the height of its row and scrolls inside, so it lines up with the cell beside it.
const props = defineProps({ full: { type: Boolean, default: false }, limit: { type: Number, default: 8 }, title: { type: String, default: 'Recent activity' }, fill: { type: Boolean, default: false } });

const kind = ref('All');
const cat = ref('All');
const kinds = ['All', 'Spending', 'Income', 'Scanned', 'Imported'];
const catOptions = computed(() => [{ value: 'All', label: 'All categories' }, ...CATEGORIES.map(c => ({ value: c, label: c, color: store.budgets.find(b => b.name === c)?.color }))]);

const filtered = computed(() => store.transactions
  .filter(t => {
    if (kind.value === 'Spending' && t.amount >= 0) return false;
    if (kind.value === 'Income' && t.amount <= 0) return false;
    if (kind.value === 'Scanned' && !['receipt', 'pdf'].includes(t.source)) return false;
    if (kind.value === 'Imported' && !['csv', 'excel'].includes(t.source)) return false;
    if (cat.value !== 'All' && t.category !== cat.value) return false;
    return !store.query || `${t.merchant} ${t.category}`.toLowerCase().includes(store.query.toLowerCase());
  })
  .sort((a, b) => String(b.date).localeCompare(String(a.date))));

const rows = computed(() => (props.full ? filtered.value : filtered.value.slice(0, props.limit)));
const groups = computed(() => {
  const out = [];
  rows.value.forEach(t => {
    const last = out[out.length - 1];
    if (last && last.date === t.date) last.items.push(t); else out.push({ date: t.date, items: [t] });
  });
  return out;
});

// Last 14 days of spending, for the small chart on the full ledger.
const days14 = computed(() => {
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const items = store.transactions.filter(t => t.date === key && t.amount < 0);
    const spent = items.reduce((s, t) => s - t.amount, 0);
    const top = [...items].sort((a, b) => a.amount - b.amount)[0];
    out.push({ key, spent, count: items.length, top: top ? top.merchant : '', topAmount: top ? -top.amount : 0,
      label: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      long: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) });
  }
  const max = Math.max(1, ...out.map(x => x.spent));
  return out.map(x => ({ ...x, h: (x.spent / max) * 100 }));
});
const totalsShown = computed(() => ({
  income: filtered.value.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
  spent: filtered.value.filter(t => t.amount < 0).reduce((s, t) => s - t.amount, 0),
}));
const catColor = c => store.budgets.find(b => b.name === c)?.color || (c === 'Income' ? '#16a34a' : '#a1a1aa');
const money = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmt = (n, c) => (n < 0 ? '−' : '+') + new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'USD' }).format(Math.abs(n));
const day = iso => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const remove = id => { store.transactions = store.transactions.filter(t => t.id !== id); };
const accountOptions = computed(() => [{ value: '', label: 'No account' }, ...store.balances.map(a => ({ value: a.id, label: a.name }))]);
const sourceLabel = { sample: 'sample', receipt: 'receipt scan', pdf: 'PDF', csv: 'CSV', excel: 'Excel', quick: 'note' };
</script>

<template>
  <section class="card cell ledger" :class="{ 'ledger-full': full, 'ledger-fill': fill }">
    <div class="cell-head">
      <p class="label">{{ title }}</p>
      <span class="muted small">{{ full ? `${rows.length} shown` : `Latest ${rows.length} of ${store.transactions.length}` }}</span>
    </div>
    <div v-if="full" class="act-summary">
      <div class="act-totals">
        <div class="at in-tint"><span class="small">Income shown</span><b>{{ money(totalsShown.income) }}</b></div>
        <div class="at out-tint"><span class="small">Spending shown</span><b>{{ money(totalsShown.spent) }}</b></div>
      </div>
      <div class="day-chart" aria-label="Spending over the last 14 days">
        <div v-for="(d, i) in days14" :key="d.key" class="dc-col" :class="{ 'tip-left': i < 4, 'tip-right': i > 9 }" tabindex="0" :aria-label="`${d.long}: ${money(d.spent)} spent`">
          <i :style="{ height: Math.max(d.spent ? 6 : 2, d.h) + '%' }" :class="{ zero: !d.spent }" />
          <span>{{ d.label }}</span>
          <div class="dc-tip" role="tooltip">
            <p class="dc-tip-date">{{ d.long }}</p>
            <b>{{ money(d.spent) }}</b>
            <p v-if="d.count">{{ d.count }} {{ d.count === 1 ? 'purchase' : 'purchases' }}</p>
            <p v-if="d.top" class="dc-tip-top">Biggest: {{ d.top }} · {{ money(d.topAmount) }}</p>
            <p v-else>No spending</p>
          </div>
        </div>
      </div>
    </div>
    <div v-if="full" class="toolbar">
      <div class="chips">
        <button v-for="k in kinds" :key="k" class="chip-btn" :class="{ on: kind === k }" @click="kind = k">{{ k }}</button>
      </div>
      <div class="toolbar-right">
        <PickMenu v-model="cat" :options="catOptions" label="Category" searchable />
        <input v-model="store.query" class="field search-field" type="search" placeholder="Search" aria-label="Search transactions" />
      </div>
    </div>
    <div class="ledger-body">
      <div v-for="g in groups" :key="g.date" class="day-group">
        <p class="day-label">{{ day(g.date) }}</p>
        <div v-for="t in g.items" :key="t.id" class="tx-row">
          <LogoFix :name="t.merchant" :logo="t.logo || ''" @pick="p => fixLogo(t.merchant, p)" />
          <div class="grow"><b>{{ t.merchant }}</b><span class="tx-meta"><span class="cat-tag" :style="{ '--c': catColor(t.category) }">{{ t.category }}</span><span class="muted small">{{ sourceLabel[t.source] || t.source }}</span><PickMenu v-if="store.balances.length" class="tx-acct" :model-value="t.accountId || ''" :options="accountOptions" label="Paid with" @update:model-value="v => (t.accountId = v || null)" /></span></div>
          <span class="tx-amt" :class="t.amount > 0 ? 'in' : 'out'">{{ fmt(t.amount, t.currency) }}</span>
          <button class="icon-x" :aria-label="`Delete ${t.merchant}`" @click="remove(t.id)">×</button>
        </div>
      </div>
      <p v-if="!rows.length" class="muted">{{ store.transactions.length ? 'Nothing matches.' : 'No entries yet. Add what you spent, or import a bank statement.' }}</p>
    </div>
  </section>
</template>
