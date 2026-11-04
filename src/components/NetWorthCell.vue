<script setup>
import { ref, computed } from 'vue';
import { accounts, goals } from '../data/demo';

// Deterministic dummy history so the chart looks the same on every reload.
const range = ref(30);
const ranges = [[30, '1M'], [90, '3M'], [365, '1Y']];
const total = accounts.reduce((s, a) => s + a.balance, 0) + goals.reduce((s, g) => s + g.saved, 0);
const series = computed(() => {
  const n = range.value;
  return Array.from({ length: n }, (_, i) => total * (0.9 + 0.1 * (i / (n - 1)) + 0.012 * Math.sin(i / 3)));
});
const path = computed(() => {
  const v = series.value, min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  return v.map((x, i) => `${(i / (v.length - 1)) * 100},${40 - ((x - min) / span) * 34}`).join(' ');
});
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
</script>

<template>
  <section class="card cell">
    <div class="cell-head">
      <p class="label">Net worth</p>
      <div class="seg" role="group" aria-label="Range">
        <button v-for="[n, l] in ranges" :key="n" :class="{ on: range === n }" @click="range = n">{{ l }}</button>
      </div>
    </div>
    <p class="big">{{ fmt(total) }} <span class="muted small">over {{ range === 365 ? 'a year' : range === 90 ? '3 months' : 'a month' }}</span></p>
    <svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="nwfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7c3aed" stop-opacity=".18" /><stop offset="1" stop-color="#7c3aed" stop-opacity="0" /></linearGradient></defs>
      <polygon :points="`0,40 ${path} 100,40`" fill="url(#nwfill)" />
      <polyline :points="path" fill="none" stroke="#7c3aed" stroke-width="1.4" vector-effect="non-scaling-stroke" />
    </svg>
    <div class="axis small muted"><span>Oct 6, 2026</span><span>Nov 4, 2026</span></div>
  </section>
</template>
