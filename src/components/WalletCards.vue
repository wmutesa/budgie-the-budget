<script setup>
import { wallets } from '../data/demo';
import { store } from '../lib/store';
import { convert } from '../lib/rates';
const fmt = (n, code) => new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(n);
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">Wallets · converted live to {{ store.base }}</p><span class="muted small">Sample balances</span></div>
    <div class="wallets">
      <article v-for="w in wallets" :key="w.code" class="wallet">
        <div class="wallet-top"><b>{{ w.code }}</b><span :class="['status', w.status.toLowerCase()]">{{ w.status }}</span></div>
        <p class="wallet-amount">{{ fmt(w.balance, w.code) }}</p>
        <p class="muted small">
          <template v-if="w.code !== store.base && convert(w.balance, w.code, store.base) !== null">≈ {{ fmt(convert(w.balance, w.code, store.base), store.base) }}</template>
          <template v-else>Limit {{ w.limit }}</template>
        </p>
      </article>
    </div>
  </section>
</template>
