<script setup>
import { computed } from 'vue';
import { store } from '../lib/store';
import { monthTotals, monthTx, budgetRows } from '../lib/ledger';

const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const used = computed(() => Math.min(100, (monthTotals.value.spent / monthTotals.value.budget) * 100));
const bySource = computed(() => {
  const out = {};
  monthTx.value.forEach(t => { out[t.source] = (out[t.source] || 0) + 1; });
  return out;
});
const label = { sample: 'Sample', receipt: 'Receipts', pdf: 'PDFs', csv: 'CSV', excel: 'Excel', quick: 'Notes' };
// Thin ticks per category, sized by share of this month's spending.
const ticks = computed(() => {
  const rows = budgetRows.value.filter(b => b.spent > 0);
  const total = rows.reduce((s, b) => s + b.spent, 0) || 1;
  return rows.map(b => ({ ...b, share: b.spent / total, count: Math.max(2, Math.round((b.spent / total) * 48)) }));
});
const month = new Date().toLocaleDateString('en-US', { month: 'long' });
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">{{ month }} so far</p><span class="muted small">{{ store.transactions.length }} entries</span></div>
    <p class="big">{{ fmt(monthTotals.spent) }} <span class="muted small">of {{ fmt(monthTotals.budget) }} budget</span></p>
    <div class="meter wide-meter"><i :style="{ width: used + '%', background: used > 90 ? '#db2777' : '#7c3aed' }" /></div>
    <dl class="rows">
      <div><dt>Income</dt><dd>{{ fmt(monthTotals.income) }}</dd></div>
      <div><dt>Left in budget</dt><dd>{{ fmt(Math.max(0, monthTotals.budget - monthTotals.spent)) }}</dd></div>
    </dl>
    <div class="ticks" aria-label="Spending by category">
      <div v-for="t in ticks" :key="t.name" class="tick-group" :style="{ flex: t.count }">
        <div class="tick-row"><i v-for="n in t.count" :key="n" :style="{ background: t.color }" /></div>
        <span class="small"><b>{{ t.name }}</b> {{ Math.round(t.share * 100) }}%</span>
      </div>
    </div>
    <div class="chips sources">
      <span v-for="(n, s) in bySource" :key="s" class="src-chip">{{ label[s] || s }} · {{ n }}</span>
    </div>
  </section>
</template>
