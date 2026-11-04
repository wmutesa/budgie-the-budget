<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { CATEGORIES } from '../lib/categorize';

// The ledger: grouped by day, with chip filters and the shared search.
const kind = ref('All');
const cat = ref('All');
const kinds = ['All', 'Spending', 'Income', 'Scanned', 'Imported'];

const rows = computed(() => store.transactions
  .filter(t => {
    if (kind.value === 'Spending' && t.amount >= 0) return false;
    if (kind.value === 'Income' && t.amount <= 0) return false;
    if (kind.value === 'Scanned' && !['receipt', 'pdf'].includes(t.source)) return false;
    if (kind.value === 'Imported' && !['csv', 'excel'].includes(t.source)) return false;
    if (cat.value !== 'All' && t.category !== cat.value) return false;
    return !store.query || `${t.merchant} ${t.category}`.toLowerCase().includes(store.query.toLowerCase());
  })
  .sort((a, b) => String(b.date).localeCompare(String(a.date))));

const groups = computed(() => {
  const out = [];
  rows.value.forEach(t => {
    const last = out[out.length - 1];
    if (last && last.date === t.date) last.items.push(t); else out.push({ date: t.date, items: [t] });
  });
  return out;
});

const fmt = (n, c) => (n < 0 ? '−' : '+') + new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'USD' }).format(Math.abs(n));
const day = iso => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const remove = id => { store.transactions = store.transactions.filter(t => t.id !== id); };
const sourceLabel = { sample: 'sample', receipt: 'receipt scan', pdf: 'PDF', csv: 'CSV', excel: 'Excel', quick: 'note' };
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">Recent activity</p><span class="muted small">{{ rows.length }} shown</span></div>
    <div class="toolbar">
      <div class="chips">
        <button v-for="k in kinds" :key="k" class="chip-btn" :class="{ on: kind === k }" @click="kind = k">{{ k }}</button>
      </div>
      <input v-model="store.query" class="field" type="search" placeholder="Search" aria-label="Search transactions" />
    </div>
    <div class="chips cat-filter">
      <button class="chip-btn" :class="{ on: cat === 'All' }" @click="cat = 'All'">All categories</button>
      <button v-for="c in CATEGORIES" :key="c" class="chip-btn" :class="{ on: cat === c }" @click="cat = c">{{ c }}</button>
    </div>
    <div v-for="g in groups" :key="g.date" class="day-group">
      <p class="day-label">{{ day(g.date) }}</p>
      <div v-for="t in g.items" :key="t.id" class="tx-row">
        <img v-if="t.logo" :src="t.logo" :alt="`${t.merchant} logo`" width="26" height="26" />
        <span v-else class="logo-fallback">{{ t.merchant[0] }}</span>
        <div class="grow"><b>{{ t.merchant }}</b><span class="muted small">{{ t.category }} · {{ sourceLabel[t.source] || t.source }}</span></div>
        <span class="tx-amt" :class="t.amount > 0 ? 'in' : 'out'">{{ fmt(t.amount, t.currency) }}</span>
        <button class="icon-x" :aria-label="`Delete ${t.merchant}`" @click="remove(t.id)">×</button>
      </div>
    </div>
    <p v-if="!rows.length" class="muted">Nothing matches.</p>
  </section>
</template>
