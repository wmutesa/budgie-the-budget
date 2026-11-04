<script setup>
import { ref, computed } from 'vue';
import { cashFlow } from '../data/demo';

// Hover a month to see its totals, as in the reference dashboards.
const tab = ref('Income');
const tabs = ['Income', 'Expense', 'Savings'];
const hover = ref(null);

const value = d => (tab.value === 'Income' ? d.income : tab.value === 'Expense' ? d.expense : d.income - d.expense);
const max = computed(() => Math.max(...cashFlow.map(value)));
const total = computed(() => cashFlow.reduce((s, d) => s + value(d), 0));
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div>
        <p class="label">Cash flow</p>
        <p class="big sm">{{ fmt(total) }}</p>
      </div>
      <div class="pills" role="tablist">
        <button v-for="t in tabs" :key="t" :class="{ on: tab === t }" @click="tab = t">{{ t }}</button>
      </div>
    </div>
    <div class="bars" @mouseleave="hover = null">
      <div
        v-for="(d, i) in cashFlow"
        :key="d.m"
        class="bar-col"
        :class="{ active: hover === i }"
        @mouseenter="hover = i"
      >
        <div class="bar-track">
          <i class="bar-fill" :style="{ height: (value(d) / max) * 100 + '%' }" />
        </div>
        <span class="month">{{ d.m }}</span>
        <div v-if="hover === i" class="tip">
          <b>{{ d.m }}</b>
          <span>{{ tab }} {{ fmt(value(d)) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
