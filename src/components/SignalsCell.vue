<script setup>
import { computed } from 'vue';
import { budgets } from '../data/demo';
import { store, daysUntil } from '../lib/store';
import { rates } from '../lib/rates';

const signals = computed(() => {
  const out = [];
  store.subscriptions.forEach(s => {
    const d = daysUntil(s.next);
    if (d >= 0 && d <= 7) out.push({ tone: 'info', title: `${s.name} renews ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}`, body: `${s.amount} ${s.currency}, ${s.cycle}.` });
    if (d < 0) out.push({ tone: 'warn', title: `${s.name} payment date passed`, body: 'Update the next payment date.' });
  });
  budgets.filter(b => b.spent > b.budget).forEach(b => out.push({ tone: 'warn', title: `${b.name} is over budget`, body: `$${b.spent} of $${b.budget} this month.` }));
  if (rates.status === 'error') out.push({ tone: 'warn', title: 'Exchange rates offline', body: 'Converted amounts are hidden until rates load.' });
  if (!out.length) out.push({ tone: 'good', title: 'All quiet', body: 'Nothing needs attention right now.' });
  return out;
});
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">Signals</p><span class="muted small">{{ signals.length }} active</span></div>
    <ul class="signals">
      <li v-for="s in signals" :key="s.title" :class="s.tone"><b>{{ s.title }}</b><span class="muted small">{{ s.body }}</span></li>
    </ul>
  </section>
</template>
