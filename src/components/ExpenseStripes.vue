<script setup>
import { spending } from '../data/demo';
const total = spending.reduce((s, x) => s + x.amount, 0);
const tints = ['stripe-orange', 'stripe-violet', 'stripe-cyan', 'stripe-pink'];
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">Expense breakdown</p><span class="muted small">{{ fmt(total) }}</span></div>
    <div class="stripes">
      <div v-for="(s, i) in spending" :key="s.name" class="stripe-seg" :style="{ flex: s.amount }">
        <span class="small muted">{{ s.name }}</span>
        <b>{{ Math.round((s.amount / total) * 100) }}%</b>
        <i :class="tints[i % tints.length]" />
      </div>
    </div>
  </section>
</template>
