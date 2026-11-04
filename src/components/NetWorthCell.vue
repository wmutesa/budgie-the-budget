<script setup>
import AiHint from './AiHint.vue';
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { accountTotal } from '../lib/ledger';

// Net worth from the accounts you track, with a chart of daily readings.
const range = ref(30);
const ranges = [[30, '1M'], [90, '3M'], [365, '1Y']];
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const day = d => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const points = computed(() => {
  const since = new Date(); since.setDate(since.getDate() - range.value);
  const from = since.toISOString().slice(0, 10);
  return store.netHistory.filter(p => p.date >= from);
});
const path = computed(() => {
  const v = points.value.map(p => p.total);
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  return v.map((x, i) => `${(i / (v.length - 1)) * 100},${40 - ((x - min) / span) * 34}`).join(' ');
});
const change = computed(() => (points.value.length > 1 ? points.value[points.value.length - 1].total - points.value[0].total : null));
</script>

<template>
  <section class="card cell">
    <div class="cell-head">
      <p class="label">Net worth</p>
      <div class="seg" role="group" aria-label="Range">
        <button v-for="[n, l] in ranges" :key="n" :class="{ on: range === n }" @click="range = n">{{ l }}</button>
      </div>
    </div>
    <AiHint for="networth" />
    <template v-if="store.balances.length">
      <p class="big">{{ fmt(accountTotal) }}
        <span v-if="change !== null" class="muted small">{{ change >= 0 ? '+' : '−' }}{{ fmt(Math.abs(change)) }} over {{ range === 365 ? 'a year' : range === 90 ? '3 months' : 'a month' }}</span>
      </p>
      <svg v-if="path" class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="nwfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7c3aed" stop-opacity=".18" /><stop offset="1" stop-color="#7c3aed" stop-opacity="0" /></linearGradient></defs>
        <polygon :points="`0,40 ${path} 100,40`" fill="url(#nwfill)" />
        <polyline :points="path" fill="none" stroke="#7c3aed" stroke-width="1.4" vector-effect="non-scaling-stroke" />
      </svg>
      <div v-if="path" class="axis small muted"><span>{{ day(points[0].date) }}</span><span>{{ day(points[points.length - 1].date) }}</span></div>
      <p v-else class="empty-note">The chart starts once you have balances from more than one day. Update them now and then.</p>
    </template>
    <p v-else class="empty-note">Add your accounts and their balances in <b>Accounts</b> below to see your net worth here.</p>
  </section>
</template>
