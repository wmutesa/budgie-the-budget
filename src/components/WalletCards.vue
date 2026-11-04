<script setup>
import { computed } from 'vue';
import { store } from '../lib/store';
import { convert } from '../lib/rates';

// Your accounts grouped by currency, converted live to your base currency.
const fmt = (n, code) => new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(n);
const wallets = computed(() => {
  const out = {};
  store.balances.forEach(a => {
    out[a.currency] = out[a.currency] || { code: a.currency, balance: 0, count: 0 };
    out[a.currency].balance += Number(a.balance) || 0;
    out[a.currency].count += 1;
  });
  return Object.values(out).sort((a, b) => (convert(b.balance, b.code, store.base) ?? 0) - (convert(a.balance, a.code, store.base) ?? 0));
});
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">Wallets · converted live to {{ store.base }}</p><span class="muted small">{{ wallets.length }} {{ wallets.length === 1 ? 'currency' : 'currencies' }}</span></div>
    <div v-if="wallets.length" class="wallets">
      <article v-for="w in wallets" :key="w.code" class="wallet">
        <div class="wallet-top"><b>{{ w.code }}</b><span class="status active">{{ w.count }} {{ w.count === 1 ? 'account' : 'accounts' }}</span></div>
        <p class="wallet-amount">{{ fmt(w.balance, w.code) }}</p>
        <p class="muted small">
          <template v-if="w.code !== store.base && convert(w.balance, w.code, store.base) !== null">≈ {{ fmt(convert(w.balance, w.code, store.base), store.base) }}</template>
          <template v-else>Base currency</template>
        </p>
      </article>
    </div>
    <p v-else class="empty-note">Accounts in different currencies, such as US dollars, Rwandan francs or Thai baht, are grouped here with live conversions.</p>
  </section>
</template>
