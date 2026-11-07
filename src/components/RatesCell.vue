<script setup>
import Icon from './Icon.vue';
import { computed } from 'vue';
import { rates, loadRates, ratesLabel } from '../lib/rates';
import { store } from '../lib/store';

const bases = ['USD', 'RWF', 'EUR', 'GBP', 'THB', 'KES'];
const watchList = ['USD', 'RWF', 'EUR', 'GBP', 'THB', 'JPY', 'CAD', 'INR', 'KES', 'NGN'];
const shown = computed(() => watchList.filter(c => c !== rates.base && rates.values[c]));
const setBase = b => { store.base = b; loadRates(b, { force: true }); };
const fmt = n => (n >= 100 ? n.toFixed(1) : n.toFixed(4));
</script>

<template>
  <section class="card cell">
    <div class="cell-head">
      <p class="label">Exchange rates</p>
      <button class="btn small btn-icon" @click="loadRates(store.base, { force: true })" title="Refresh" aria-label="Refresh"><Icon name="refresh" :size="14" /></button>
    </div>
    <div class="chips">
      <button v-for="b in bases" :key="b" class="chip-btn" :class="{ on: store.base === b }" @click="setBase(b)">{{ b }}</button>
    </div>
    <ul v-if="shown.length" class="fx">
      <li v-for="c in shown" :key="c"><span class="muted">1 {{ rates.base }} =</span><b>{{ fmt(rates.values[c]) }}</b><span>{{ c }}</span></li>
    </ul>
    <p v-else class="muted small">{{ rates.status === 'error' ? 'Rates could not be loaded. Check your connection, then refresh.' : 'Loading rates…' }}</p>
    <p class="meta small">{{ ratesLabel() }}</p>
  </section>
</template>
