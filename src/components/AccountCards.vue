<script setup>
import { accounts, goals } from '../data/demo';
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const short = n => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n));
const pct = g => Math.round((g.saved / g.target) * 100);
const saved = goals.reduce((s, g) => s + g.saved, 0);
const target = goals.reduce((s, g) => s + g.target, 0);
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
    <article class="card account goals-card">
      <div class="account-head">
        <span class="icon-square">G</span>
        <div><h3>Goals</h3><p class="muted small">{{ goals.length }} goals · {{ short(saved) }} of {{ short(target) }}</p></div>
      </div>
      <div class="goal-mini">
        <div v-for="g in goals" :key="g.name" class="gm-row" :aria-label="`${g.name}: ${pct(g)}% saved`">
          <span class="small gm-name">{{ g.name }}</span>
          <span class="gm-bar"><i :style="{ width: pct(g) + '%', background: g.color }" /></span>
          <span class="small gm-pct">{{ pct(g) }}%</span>
        </div>
      </div>
    </article>
  </section>
</template>
