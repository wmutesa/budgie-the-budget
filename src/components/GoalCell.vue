<script setup>
import { goals } from '../data/demo';
const main = goals[0];
const pct = g => Math.min(100, (g.saved / g.target) * 100);
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
</script>

<template>
  <section class="card cell goal-card">
    <div class="cell-head"><p class="label">Savings goal</p><span class="tag-light">{{ goals.length }} goals</span></div>
    <div class="gauge-wrap">
      <svg viewBox="0 0 220 124" class="gauge" aria-hidden="true">
        <path d="M20 112 A90 90 0 0 1 200 112" class="g-track" />
        <path d="M20 112 A90 90 0 0 1 200 112" class="g-fill" pathLength="100" :stroke-dasharray="`${pct(main).toFixed(1)} 100`" />
      </svg>
      <div class="gauge-val"><b>{{ fmt(main.saved) }}</b><span>{{ main.name }} · {{ fmt(main.target) }} target</span></div>
    </div>
    <ul class="goal-lines">
      <li v-for="g in goals" :key="g.name">
        <div class="row-line"><span>{{ g.name }}</span><b>{{ Math.round(pct(g)) }}%</b></div>
        <div class="thin"><i :style="{ width: pct(g) + '%' }" /></div>
      </li>
    </ul>
  </section>
</template>
