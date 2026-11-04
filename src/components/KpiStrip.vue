<script setup>
import { computed } from 'vue';
import { store } from '../lib/store';
import { monthTotals } from '../lib/ledger';

// Four headline tiles, each with a small tinted mark.
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const tiles = computed(() => {
  const t = monthTotals.value;
  const scanned = store.transactions.filter(x => x.source !== 'sample').length;
  return [
    { label: 'Income this month', value: fmt(t.income), note: 'deposits and refunds', tint: 'green', mark: '↗' },
    { label: 'Spending this month', value: fmt(t.spent), note: `${Math.round((t.spent / t.budget) * 100)}% of budget`, tint: 'pink', mark: '↘' },
    { label: 'Net', value: fmt(t.income - t.spent), note: t.income >= t.spent ? 'ahead this month' : 'behind this month', tint: 'violet', mark: '=' },
    { label: 'Captured by you', value: String(scanned), note: 'scans, imports and notes', tint: 'blue', mark: '+' },
  ];
});
</script>

<template>
  <div v-for="t in tiles" :key="t.label" class="card cell kpi span-3">
    <div class="kpi-top"><span class="muted small">{{ t.label }}</span><span class="kpi-mark" :class="t.tint">{{ t.mark }}</span></div>
    <p class="kpi-val">{{ t.value }}</p>
    <p class="muted small">{{ t.note }}</p>
  </div>
</template>
