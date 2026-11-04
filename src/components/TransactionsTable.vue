<script setup>
import { transactions } from '../data/demo';
const fmt = n => (n < 0 ? '−' : '+') + Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
</script>

<template>
  <section class="card">
    <div class="card-head"><p class="label">Recent activity</p><button class="btn small">Filter</button></div>
    <table class="table">
      <thead><tr><th>Activity</th><th>Date</th><th class="num">Amount</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="t in transactions" :key="t.id">
          <td>{{ t.title }}</td>
          <td class="muted">{{ t.date }}</td>
          <td class="num" :class="t.kind">{{ fmt(t.amount) }}</td>
          <td><span :class="['status', t.status.toLowerCase()]">{{ t.status }}</span></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
