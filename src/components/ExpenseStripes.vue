<script setup>
import { spending } from '../data/demo';

// Expense breakdown: one light stacked bar, then a quiet list with dotted share lines.
const total = spending.reduce((s, x) => s + x.amount, 0);
const tints = ['#ddd6fe', '#e9d5ff', '#e4e4e7', '#f5f3ff'];
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = s => Math.round((s.amount / total) * 100);
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">Expense breakdown</p><span class="muted small">{{ fmt(total) }} this month</span></div>
    <div class="eb-stack" aria-hidden="true">
      <i v-for="(s, i) in spending" :key="s.name" :style="{ flex: s.amount, background: tints[i % tints.length] }"><span>{{ pct(s) }}%</span></i>
    </div>
    <ul class="eb-list">
      <li v-for="(s, i) in spending" :key="s.name">
        <span class="eb-name"><i class="eb-sw" :style="{ background: tints[i % tints.length] }" />{{ s.name }}</span>
        <span class="eb-dots" :style="{ '--w': pct(s) + '%' }" />
        <b>{{ fmt(s.amount) }}</b>
      </li>
    </ul>
  </section>
</template>
