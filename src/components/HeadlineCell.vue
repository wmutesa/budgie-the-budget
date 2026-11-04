<script setup>
import { computed } from 'vue';
import { accounts, goals, cashFlow } from '../data/demo';
import { store, monthly } from '../lib/store';
import { rates, convert, ratesLabel } from '../lib/rates';

const nov = cashFlow[10];
const total = accounts.reduce((s, a) => s + a.balance, 0) + goals.reduce((s, g) => s + g.saved, 0);
const kept = Math.round(((nov.income - nov.expense) / nov.income) * 100);
const fmt = (n, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const subsMonthly = computed(() => store.subscriptions.reduce((s, x) => s + (convert(monthly(x), x.currency, store.base) ?? 0), 0));
const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });
const hour = new Date().getHours();
const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
</script>

<template>
  <section class="card cell headline">
    <p class="label">{{ weekday }} brief</p>
    <p class="greet">Good <em>{{ part }}</em>.</p>
    <p class="lede">
      You hold <mark class="m-violet">{{ fmt(total) }}</mark> across {{ accounts.length }} accounts.
      In November you earned <mark class="m-green">{{ fmt(nov.income) }}</mark>,
      spent <mark class="m-pink">{{ fmt(nov.expense) }}</mark>
      and kept <mark class="m-blue">{{ kept }}%</mark>.
      <template v-if="store.subscriptions.length">
        Subscriptions take <mark class="m-amber">{{ fmt(subsMonthly, store.base) }}</mark> a month.
      </template>
    </p>
    <p class="meta">
      <span>Rates · {{ ratesLabel() || 'not loaded' }}</span>
      <span>{{ store.subscriptions.length }} subscriptions tracked</span>
      <span>Balances are sample data until accounts are connected</span>
    </p>
  </section>
</template>
