<script setup>
import { wallets } from '../data/demo';
const fmt = (n, code) => new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(n);
</script>

<template>
  <section class="card">
    <div class="card-head"><p class="label">My wallets</p><button class="btn small">+ Add</button></div>
    <div class="wallets">
      <article v-for="w in wallets" :key="w.code" class="wallet">
        <div class="wallet-top"><b>{{ w.code }}</b><span :class="['status', w.status.toLowerCase()]">{{ w.status }}</span></div>
        <p class="wallet-amount">{{ fmt(w.balance, w.code) }}</p>
        <p class="muted small">Limit {{ w.limit }}</p>
      </article>
    </div>
  </section>
</template>
