<script setup>
import Icon from './Icon.vue';
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { CATEGORIES } from '../lib/categorize';
import BrandPicker from './BrandPicker.vue';
import PickMenu from './PickMenu.vue';

// Everything captured waits here until accepted, so nothing lands in the ledger by mistake.
const editing = ref(null);
const colors = computed(() => Object.fromEntries(store.budgets.map(b => [b.name, b.color])));
const catOptions = computed(() => CATEGORIES.map(c => ({ value: c, label: c, color: colors.value[c] || (c === 'Income' ? '#16a34a' : '#a1a1aa') })));
const curOptions = ['USD', 'RWF', 'EUR', 'GBP', 'THB', 'KES', 'NGN', 'JPY', 'CAD', 'INR'].map(c => ({ value: c, label: c }));

const iso = d => d.toISOString().slice(0, 10);
const today = iso(new Date());
const yesterday = iso(new Date(Date.now() - 864e5));
const dateChoice = d => (d.date === today ? 'today' : d.date === yesterday ? 'yesterday' : 'other');

const accountOptions = computed(() => [{ value: '', label: 'No account' }, ...store.balances.map(a => ({ value: a.id, label: a.name }))]);
const accept = d => {
  store.transactions.unshift({ ...d, amount: Number(d.amount), accountId: d.accountId || null, addedAt: new Date().toISOString() });
  store.drafts = store.drafts.filter(x => x.id !== d.id);
};
const discard = d => { store.drafts = store.drafts.filter(x => x.id !== d.id); };
const acceptAll = () => { [...store.drafts].forEach(accept); };
const flip = d => { d.amount = -Number(d.amount || 0); };
const pick = (d, brand) => {
  Object.assign(d, { merchant: brand.name, domain: brand.domain, logo: brand.logo, description: brand.description });
  editing.value = null;
};
const sourceLabel = { receipt: 'Receipt scan', pdf: 'PDF', csv: 'CSV', excel: 'Excel', quick: 'Note', planner: 'From Planner' };
</script>

<template>
  <section class="card cell review">
    <div class="cell-head">
      <div><p class="label">Review</p><p class="review-count">{{ store.drafts.length }} waiting · check, then accept</p></div>
      <div class="review-acts">
        <button class="btn small" @click="store.drafts = []"><Icon name="trash" :size="14" />Discard all</button>
        <button class="btn primary small" data-test="accept-all" @click="acceptAll"><Icon name="check" :size="14" />Accept all</button>
      </div>
    </div>

    <ul class="drafts">
      <li v-for="d in store.drafts" :key="d.id" class="draft-card" :class="{ low: d.confidence < 0.6 }">
        <button class="draft-logo" :title="`Change the company for ${d.merchant}`" @click="editing = editing === d.id ? null : d.id">
          <img v-if="d.logo" :src="d.logo" :alt="`${d.merchant} logo`" width="32" height="32" />
          <span v-else class="logo-fallback big-fallback">{{ d.merchant[0] }}</span>
          <span class="swap" aria-hidden="true">↻</span>
        </button>

        <div class="draft-who">
          <b class="draft-name">{{ d.merchant }}</b>
          <span class="draft-meta">
            <span class="src">{{ sourceLabel[d.source] || d.source }}</span>
            <span v-if="d.domain">{{ d.domain }}</span>
            <span v-if="d.confidence < 0.6" class="check">Check this one</span>
          </span>
        </div>

        <div class="draft-amount">
          <button class="sign" :class="Number(d.amount) < 0 ? 'out' : 'in'" :title="Number(d.amount) < 0 ? 'Spending. Click to make it income' : 'Income. Click to make it spending'" @click="flip(d)">{{ Number(d.amount) < 0 ? '−' : '+' }}</button>
          <input class="amt-input" type="number" step="0.01" :value="Math.abs(Number(d.amount) || 0)" :aria-label="`Amount for ${d.merchant}`"
            @input="e => { const v = Math.abs(Number(e.target.value) || 0); d.amount = Number(d.amount) < 0 ? -v : v; }" />
          <PickMenu v-model="d.currency" :options="curOptions" label="Currency" />
        </div>

        <PickMenu v-model="d.category" :options="catOptions" label="Category" class="draft-cat" />
        <PickMenu v-if="store.balances.length" :model-value="d.accountId || ''" :options="accountOptions" label="Paid with" class="draft-acct" data-test="draft-account" @update:model-value="v => (d.accountId = v || null)" />

        <div class="draft-date">
          <button class="seg-btn" :class="{ on: dateChoice(d) === 'today' }" @click="d.date = today">Today</button>
          <button class="seg-btn" :class="{ on: dateChoice(d) === 'yesterday' }" @click="d.date = yesterday">Yesterday</button>
          <label class="seg-btn date-pick" :class="{ on: dateChoice(d) === 'other' }">
            <span>{{ dateChoice(d) === 'other' ? new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date' }}</span>
            <input v-model="d.date" type="date" :aria-label="`Date for ${d.merchant}`" />
          </label>
        </div>

        <div class="draft-acts">
          <button class="round-btn" :aria-label="`Discard ${d.merchant}`" @click="discard(d)">✕</button>
          <button class="round-btn ok" :aria-label="`Accept ${d.merchant}`" @click="accept(d)">✓</button>
        </div>

        <div v-if="editing === d.id" class="draft-picker"><BrandPicker :seed="d.merchant" @pick="b => pick(d, b)" /></div>
      </li>
    </ul>
  </section>
</template>
