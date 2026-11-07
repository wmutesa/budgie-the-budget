<script setup>
import { computed, ref, watch } from 'vue';
import { facts } from '../lib/advice';
import { ai, aiAdvise } from '../lib/ai';
import { store, monthly } from '../lib/store';
import { convert, ratesLabel } from '../lib/rates';
import { monthTotals, accountTotal } from '../lib/ledger';
import { occurrences, today, addDays, dayLabel, timeLabel, toMins, streak } from '../lib/tasks';
import { go } from '../lib/nav';
import Icon from './Icon.vue';

// A short written brief: your day and week first (tasks, deadlines, habits),
// then your money, all from your own data.
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
const empty = computed(() => !store.transactions.length && !store.balances.length && !store.subscriptions.length && !store.tasks.length);
const day = computed(() => {
  const d = today();
  const list = occurrences(d, d);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const next = list.find(x => !x.done && x.task.time && toMins(x.task.time) >= nowM);
  const deadlines = store.tasks.filter(x => !x.repeat && !x.done && ['assignment', 'exam'].includes(x.kind) && x.date >= d && x.date <= addDays(d, 7)).sort((a, b) => a.date.localeCompare(b.date));
  const overdue = store.tasks.filter(x => !x.repeat && !x.done && x.date && x.date < d).length;
  const best = store.tasks.filter(x => x.repeat).map(x => ({ t: x, n: streak(x) })).sort((a, b) => b.n - a.n)[0];
  return { all: list.length, done: list.filter(x => x.done).length, next, deadlines, overdue, best: best && best.n >= 3 ? best : null };
});
</script>

<template>
  <section class="card cell headline">
    <p class="label">{{ weekday }} brief</p>
    <p class="greet">Good <em>{{ part }}</em>.</p>
    <p v-if="empty" class="lede">
      Budgie starts empty. Add what you spent today on the <b>Transactions</b> page, your account balances below, and your subscriptions with <b>+ Subscription</b>. This brief fills in as you go.
    </p>
    <p v-else class="lede" data-test="brief">
      <template v-if="day.all">Today you have <mark class="m-violet">{{ day.all }} {{ day.all === 1 ? 'thing' : 'things' }}</mark> planned<template v-if="day.done">, {{ day.done }} done</template>. </template>
      <template v-else>Nothing is planned for today yet. </template>
      <template v-if="day.next">Next is <b>{{ day.next.task.title }}</b> at {{ timeLabel(day.next.task.time) }}. </template>
      <template v-if="day.deadlines.length"><mark class="m-pink">{{ day.deadlines.length }} {{ day.deadlines.length === 1 ? 'deadline' : 'deadlines' }}</mark> this week, first <b>{{ day.deadlines[0].title }}</b> {{ dayLabel(day.deadlines[0].date).toLowerCase() }}. </template>
      <template v-if="day.overdue"><mark class="m-amber">{{ day.overdue }} overdue</mark>. </template>
      <template v-if="day.best">Your {{ day.best.t.title.toLowerCase() }} streak is <mark class="m-green">{{ day.best.n }} days</mark>. </template>
    </p>
    <p v-if="!empty" class="lede lede-money">
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
    <p v-if="!empty" class="brief-acts"><button type="button" class="btn small" data-test="brief-planner" @click="go('Planner')"><Icon name="planner" :size="14" />Open Planner</button></p>
    <p class="meta">
      <span>{{ store.tasks.length }} in your planner</span>
      <span>Rates · {{ ratesLabel() || 'not loaded' }}</span>
      <span>{{ store.transactions.length }} {{ store.transactions.length === 1 ? 'entry' : 'entries' }}</span>
      <span>{{ store.subscriptions.length }} subscriptions tracked</span>
    </p>
  </section>
</template>
