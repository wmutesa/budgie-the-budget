<script setup>
import { spending } from '../data/demo';
const total = spending.reduce((s, x) => s + x.amount, 0);
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
</script>

<template>
  <section class="card">
    <p class="label">Spending overview</p>
    <p class="big sm">{{ fmt(total) }}</p>
    <p class="kicker">Spending breakdown</p>
    <div class="stack">
      <i v-for="s in spending" :key="s.name" :style="{ flex: s.amount, background: s.color }" :title="s.name" />
    </div>
    <ul class="legend">
      <li v-for="s in spending" :key="s.name">
        <span class="dot" :style="{ background: s.color }" />
        <span>{{ s.name }}</span><b>{{ fmt(s.amount) }}</b>
      </li>
    </ul>
  </section>
</template>
