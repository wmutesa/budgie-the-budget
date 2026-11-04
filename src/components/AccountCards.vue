<script setup>
import { accounts } from '../data/demo';
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
</script>

<template>
  <section class="accounts">
    <article v-for="a in accounts" :key="a.id" class="card account">
      <div class="account-head">
        <span class="icon-square">{{ a.name[0] }}</span>
        <div><h3>{{ a.name }}</h3><p class="muted small">{{ a.sub }}</p></div>
      </div>
      <p class="amount">{{ fmt(a.balance) }}</p>
      <p class="small"><span class="chip">▲ {{ a.change }}%</span></p>
    </article>
  </section>
</template>
