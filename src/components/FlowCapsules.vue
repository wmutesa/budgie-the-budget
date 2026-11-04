<script setup>
import { ref, computed } from 'vue';
import { cashFlow, activeMonths } from '../lib/ledger';

// Income rises above the line, spending hangs below it. Last 12 months.
const hover = ref(null);
const max = computed(() => Math.max(1, ...cashFlow.value.map(d => Math.max(d.income, d.expense))));
const total = computed(() => cashFlow.value.reduce((s, d) => s + d.income - d.expense, 0));
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
</script>

<template>
  <section class="card cell">
    <div class="cell-head">
      <div><p class="label">Cash flow · last 12 months</p><p class="big sm">{{ fmt(total) }} <span class="muted small">kept</span></p></div>
      <div class="legend-inline"><span><i class="sw stripe-violet" />Income</span><span><i class="sw solid-violet" />Spending</span></div>
    </div>
    <div v-if="activeMonths.length" class="caps" @mouseleave="hover = null">
      <div v-for="(d, i) in cashFlow" :key="d.key" class="cap-col" :class="{ active: hover === i }" @mouseenter="hover = i">
        <div class="cap-up"><i :style="{ height: (d.income / max) * 100 + '%' }" /></div>
        <div class="cap-down"><i :style="{ height: (d.expense / max) * 100 + '%' }" /></div>
        <span class="cap-m">{{ d.m }}</span>
        <div v-if="hover === i" class="cap-tip">
          <b>{{ d.m }} {{ d.year }}</b><span>In {{ fmt(d.income) }}</span><span>Out {{ fmt(d.expense) }}</span>
        </div>
      </div>
    </div>
    <p v-else class="empty-note">Income and spending for each month appear here as you add them, or import a bank statement to fill in past months.</p>
  </section>
</template>
