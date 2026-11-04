<script setup>
import { computed } from 'vue';
import { cashFlow, categorySpend } from '../lib/ledger';

// This month against last month, from your entries.
const cur = computed(() => cashFlow.value[cashFlow.value.length - 1]);
const prev = computed(() => cashFlow.value[cashFlow.value.length - 2] || null);
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const top = computed(() => Math.max(1, ...categorySpend.value.map(s => s.amount)));
const inChange = computed(() => (prev.value ? pct(cur.value.income, prev.value.income) : null));
const outChange = computed(() => (prev.value ? pct(cur.value.expense, prev.value.expense) : null));
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">{{ cur.m }} {{ cur.year }}</p><span class="muted small">{{ prev ? `vs ${prev.m}` : 'Your first month' }}</span></div>
    <dl class="rows">
      <div><dt>Income</dt><dd>{{ fmt(cur.income) }} <span v-if="inChange !== null" class="chip-s" :class="inChange >= 0 ? 'up' : 'down'">{{ inChange >= 0 ? '▲' : '▼' }} {{ Math.abs(inChange) }}%</span></dd></div>
      <div><dt>Spent</dt><dd>{{ fmt(cur.expense) }} <span v-if="outChange !== null" class="chip-s" :class="outChange <= 0 ? 'up' : 'down'">{{ outChange >= 0 ? '▲' : '▼' }} {{ Math.abs(outChange) }}%</span></dd></div>
      <div><dt>Left</dt><dd>{{ fmt(cur.income - cur.expense) }}</dd></div>
    </dl>
    <ul v-if="categorySpend.length" class="spend-list">
      <li v-for="s in categorySpend.slice(0, 4)" :key="s.name">
        <span>{{ s.name }}</span>
        <div class="meter"><i :style="{ width: (s.amount / top) * 100 + '%', background: s.color }" /></div>
        <b>{{ fmt(s.amount) }}</b>
      </li>
    </ul>
    <p v-else class="empty-note">Nothing spent this month yet.</p>
  </section>
</template>
