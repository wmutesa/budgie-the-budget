<script setup>
import { spending, cashFlow } from '../data/demo';
const cur = cashFlow[10]; // November
const prev = cashFlow[9];
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = (a, b) => Math.round(((a - b) / b) * 100);
const top = Math.max(...spending.map(s => s.amount));
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">{{ cur.m }} 2026</p><span class="muted small">vs {{ prev.m }}</span></div>
    <dl class="rows">
      <div><dt>Income</dt><dd>{{ fmt(cur.income) }} <span class="chip-s up">▲ {{ Math.abs(pct(cur.income, prev.income)) }}%</span></dd></div>
      <div><dt>Spent</dt><dd>{{ fmt(cur.expense) }} <span class="chip-s down">▼ {{ Math.abs(pct(cur.expense, prev.expense)) }}%</span></dd></div>
      <div><dt>To goals</dt><dd>{{ fmt(1500) }}</dd></div>
      <div><dt>Left to plan</dt><dd>{{ fmt(cur.income - cur.expense) }}</dd></div>
    </dl>
    <ul class="spend-list">
      <li v-for="s in spending" :key="s.name">
        <span>{{ s.name }}</span>
        <div class="meter"><i :style="{ width: (s.amount / top) * 100 + '%', background: s.color }" /></div>
        <b>{{ fmt(s.amount) }}</b>
      </li>
    </ul>
  </section>
</template>
