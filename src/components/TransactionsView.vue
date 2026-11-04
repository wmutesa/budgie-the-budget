<script setup>
import { ref, computed } from 'vue';
import { transactions } from '../data/demo';
import { store } from '../lib/store';

// Chip filters instead of dropdowns.
const filter = ref('All');
const filters = ['All', 'Income', 'Spending', 'Pending'];

const rows = computed(() =>
  transactions.filter(t => {
    if (filter.value === 'Income' && t.amount <= 0) return false;
    if (filter.value === 'Spending' && t.amount >= 0) return false;
    if (filter.value === 'Pending' && t.status !== 'Pending') return false;
    return !store.query || t.title.toLowerCase().includes(store.query.toLowerCase());
  })
);
const fmt = n => (n < 0 ? '−' : '+') + Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
</script>

<template>
  <section class="card wide">
    <div class="card-head"><p class="label">Recent activity</p></div>
    <div class="toolbar">
      <div class="chips">
        <button v-for="f in filters" :key="f" class="chip-btn" :class="{ on: filter === f }" @click="filter = f">{{ f }}</button>
      </div>
      <input v-model="store.query" class="field" type="search" placeholder="Search" aria-label="Search transactions" />
    </div>
    <table class="table">
      <thead><tr><th>Activity</th><th>Date</th><th class="num">Amount</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="t in rows" :key="t.id">
          <td>{{ t.title }}</td>
          <td class="muted">{{ t.date }}</td>
          <td class="num" :class="t.amount > 0 ? 'in' : 'out'">{{ fmt(t.amount) }}</td>
          <td><span class="status" :class="t.status.toLowerCase()">{{ t.status }}</span></td>
        </tr>
        <tr v-if="!rows.length"><td colspan="4" class="muted">Nothing matches.</td></tr>
      </tbody>
    </table>
  </section>
</template>
