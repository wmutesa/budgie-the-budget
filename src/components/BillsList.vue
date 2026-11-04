<script setup>
import { bills } from '../data/demo';
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
</script>

<template>
  <section class="card">
    <div class="card-head"><p class="label">Upcoming bills</p><button class="btn small">+</button></div>
    <ul class="bills">
      <li v-for="b in bills" :key="b.name">
        <span class="bill-logo" :style="{ color: b.color }">{{ b.name[0] }}</span>
        <div class="grow"><b>{{ b.name }}</b><span class="muted small">{{ b.date }}</span></div>
        <div class="bill-right"><b>{{ fmt(b.amount) }}</b><span class="pill">{{ b.status }}</span></div>
      </li>
    </ul>
  </section>
</template>
