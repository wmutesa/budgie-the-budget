<script setup>
import { computed, ref, watch } from 'vue';
import { facts } from '../lib/advice';
import { ai, aiAdvise } from '../lib/ai';
import { store, monthly } from '../lib/store';
import { convert, ratesLabel } from '../lib/rates';
import { monthTotals, accountTotal } from '../lib/ledger';

// A short written brief of the month, from your own entries.
const fmt = (n, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const subsMonthly = computed(() => store.subscriptions.reduce((s, x) => s + (convert(monthly(x), x.currency, store.base) ?? 0), 0));
const t = monthTotals;
const kept = computed(() => (t.value.income > 0 ? Math.round(((t.value.income - t.value.spent) / t.value.income) * 100) : null));
const month = new Date().toLocaleDateString('en-US', { month: 'long' });
const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });
const hour = new Date().getHours();
const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
const said = ref('');
let lastFacts = '';
watch([facts, () => ai.ready], async () => {
  const key = facts.value.join('|') + ai.ready;
  if (key === lastFacts || !ai.ready || !store.transactions.length) return;
  lastFacts = key;
  said.value = (await aiAdvise(facts.value)) || '';
}, { immediate: true });
const empty = computed(() => !store.transactions.length && !store.balances.length && !store.subscriptions.length);
</script>

<template>
  <section class="card cell headline">
    <p class="label">{{ weekday }} brief</p>
    <p class="greet">Good <em>{{ part }}</em>.</p>
    <p v-if="empty" class="lede">
      Budgie starts empty. Add what you spent today on the <b>Transactions</b> page, your account balances below, and your subscriptions with <b>+ Subscription</b>. This brief fills in as you go.
    </p>
    <p v-else class="lede">
      <template v-if="store.balances.length">You hold <mark class="m-violet">{{ fmt(accountTotal) }}</mark> across {{ store.balances.length }} {{ store.balances.length === 1 ? 'account' : 'accounts' }}. </template>
      <template v-if="t.income || t.spent">
        In {{ month }} you
        <template v-if="t.income">earned <mark class="m-green">{{ fmt(t.income) }}</mark>, </template>
        spent <mark class="m-pink">{{ fmt(t.spent) }}</mark><template v-if="kept !== null"> and kept <mark class="m-blue">{{ kept }}%</mark></template>.
      </template>
      <template v-else>Nothing recorded for {{ month }} yet. </template>
      <template v-if="store.subscriptions.length">Subscriptions take <mark class="m-amber">{{ fmt(subsMonthly, store.base) }}</mark> a month.</template>
    </p>
    <p v-if="said && !empty" class="ai-hint ai-brief" data-test="ai-brief"><span class="ai-spark" aria-hidden="true">✦</span>{{ said }} <span class="muted small">· {{ ai.used.advice }}</span></p>
    <p class="meta">
      <span>Rates · {{ ratesLabel() || 'not loaded' }}</span>
      <span>{{ store.transactions.length }} {{ store.transactions.length === 1 ? 'entry' : 'entries' }}</span>
      <span>{{ store.subscriptions.length }} subscriptions tracked</span>
    </p>
  </section>
</template>
