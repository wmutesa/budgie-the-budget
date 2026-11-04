<script setup>
import { computed } from 'vue';
import { upcoming } from '../lib/recurring';
import { daysUntil } from '../lib/store';

// The next two weeks of payments: subscriptions and repeating bills.
const list = computed(() => upcoming(14));
const total = computed(() => list.value.reduce((s, x) => s + x.usd, 0));
const usd = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money = (n, c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'USD', maximumFractionDigits: c === 'RWF' ? 0 : 2 }).format(n);
const when = d => { const n = daysUntil(d); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }); };
const days = computed(() => Array.from({ length: 14 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() + i);
  const iso = d.toISOString().slice(0, 10);
  return { iso, label: d.toLocaleDateString('en-US', { weekday: 'narrow' }), count: list.value.filter(x => x.date === iso).length };
}));
</script>

<template>
  <section class="card cell upcoming" data-test="upcoming">
    <div class="cell-head"><p class="label">Upcoming payments</p><span class="muted small">{{ list.length ? `${usd(total)} in 14 days` : 'Next 14 days' }}</span></div>
    <div class="up-days" aria-hidden="true">
      <span v-for="d in days" :key="d.iso" class="up-day" :class="{ has: d.count }"><i />{{ d.label }}</span>
    </div>
    <ul v-if="list.length" class="up-list">
      <li v-for="x in list.slice(0, 6)" :key="x.id + x.date">
        <span class="up-when">{{ when(x.date) }}</span>
        <span class="up-name"><b>{{ x.name }}</b><span class="muted small">{{ x.kind }}</span></span>
        <b class="up-amt">{{ money(x.amount, x.currency) }}</b>
      </li>
    </ul>
    <p v-else class="empty-note">Nothing due in the next two weeks. Subscriptions and payments that repeat each month show up here before they charge you.</p>
  </section>
</template>
