<script setup>
import { ref } from 'vue';
import { cashFlow } from '../data/demo';

// Income rises above the line, spending hangs below it.
const hover = ref(null);
const max = Math.max(...cashFlow.map(d => Math.max(d.income, d.expense)));
const total = cashFlow.reduce((s, d) => s + d.income - d.expense, 0);
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
</script>

<template>
  <section class="card cell">
    <div class="cell-head">
      <div><p class="label">Cash flow · 2026</p><p class="big sm">{{ fmt(total) }} <span class="muted small">kept this year</span></p></div>
      <div class="legend-inline"><span><i class="sw stripe-violet" />Income</span><span><i class="sw solid-violet" />Spending</span></div>
    </div>
    <div class="caps" @mouseleave="hover = null">
      <div v-for="(d, i) in cashFlow" :key="d.m" class="cap-col" :class="{ active: hover === i }" @mouseenter="hover = i">
        <div class="cap-up"><i :style="{ height: (d.income / max) * 100 + '%' }" /></div>
        <div class="cap-down"><i :style="{ height: (d.expense / max) * 100 + '%' }" /></div>
        <span class="cap-m">{{ d.m }}</span>
        <div v-if="hover === i" class="cap-tip">
          <b>{{ d.m }}</b><span>In {{ fmt(d.income) }}</span><span>Out {{ fmt(d.expense) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
