<script setup>
import { accounts } from '../data/demo';
const total = accounts.reduce((s, a) => s + a.balance, 0);
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
</script>

<template>
  <section class="card hero">
    <p class="label">Total balance</p>
    <p class="big">{{ fmt(total) }}</p>
    <p class="small"><span class="chip">▲ 12.4%</span> vs last week</p>
    <div class="hero-foot">
      <span>Across {{ accounts.length }} accounts</span>
      <span class="dots" aria-hidden="true"><i v-for="n in 12" :key="n" :style="{ height: 20 + ((n * 37) % 70) + '%' }" /></span>
    </div>
  </section>
</template>
