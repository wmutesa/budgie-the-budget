<script setup>
import { ref, computed } from 'vue';
import { store, monthly } from '../lib/store';
import { convert } from '../lib/rates';
const income = ref(store.plan?.income || 0);
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cats = computed(() => store.budgets.reduce((s, b) => s + b.budget, 0));
const subs = computed(() => store.subscriptions.reduce((t, x) => t + (convert(monthly(x), x.currency, 'USD') ?? 0), 0));
// Saving for each goal over a year.
const need = computed(() => store.goals.reduce((s, g) => s + Math.max(0, g.target - g.saved) / 12, 0));
const left = computed(() => income.value - cats.value - subs.value - need.value);
const parts = computed(() => [
  { label: 'Budgets', v: cats.value, c: '#7c3aed' },
  { label: 'Subscriptions', v: subs.value, c: '#2563eb' },
  { label: 'Goals', v: need.value, c: '#16a34a' },
]);
</script>

<template>
  <section class="card cell">
    <div class="cell-head">
      <p class="label">Plan</p>
      <label class="inline">Income <input v-model.number="income" type="number" min="0" step="50" aria-label="Monthly income" /></label>
    </div>
    <div class="stack">
      <i v-for="p in parts" :key="p.label" :style="{ flex: p.v, background: p.c }" :title="p.label" />
      <i v-if="left > 0" :style="{ flex: left, background: 'var(--surface-2)' }" title="Unassigned" />
    </div>
    <ul class="plan-lines">
      <li v-for="p in parts" :key="p.label"><span>{{ p.label }}</span><b>{{ fmt(p.v) }}</b></li>
      <li v-if="income" class="total"><span>Unassigned</span><b :class="left < 0 ? 'out' : 'in'">{{ fmt(left) }}</b></li>
    </ul>
    <p v-if="!income" class="empty-note">Enter your monthly income above to see how much is left after budgets, subscriptions and goals.</p>
  </section>
</template>
