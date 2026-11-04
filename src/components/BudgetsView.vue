<script setup>
import { budgets } from '../data/demo';
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = b => Math.min(100, Math.round((b.spent / b.budget) * 100));
const state = b => (b.spent > b.budget ? 'over' : pct(b) >= 80 ? 'near' : 'ok');
</script>

<template>
  <section class="card wide">
    <div class="card-head"><p class="label">Monthly budgets</p><span class="muted small">{{ budgets.length }} categories</span></div>
    <ul class="budget-list">
      <li v-for="b in budgets" :key="b.name" class="budget-row" :class="state(b)">
        <div class="budget-name"><i class="swatch" :style="{ background: b.color }" />{{ b.name }}</div>
        <div class="meter"><i :style="{ width: pct(b) + '%', background: b.color }" /></div>
        <div class="budget-num">
          <b>{{ fmt(b.spent) }}</b><span class="muted small"> / {{ fmt(b.budget) }}</span>
        </div>
        <span class="status-tag">{{ state(b) === 'over' ? 'Over' : state(b) === 'near' ? 'Close' : 'On track' }}</span>
      </li>
    </ul>
  </section>
</template>
