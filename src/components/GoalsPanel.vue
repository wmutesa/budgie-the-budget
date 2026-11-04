<script setup>
import { goals } from '../data/demo';
</script>

<template>
  <section class="card">
    <div class="card-head"><p class="label">Savings goals</p><button class="btn small">+ Goal</button></div>
    <ul class="goals">
      <li v-for="g in goals" :key="g.name">
        <div class="goal-top">
          <b>{{ g.name }}</b>
          <span>{{ Math.round((g.saved / g.target) * 100) }}%</span>
        </div>
        <div class="bar"><i :style="{ width: (g.saved / g.target) * 100 + '%', background: g.color }" /></div>
        <p class="small muted">${{ g.saved.toLocaleString('en-US') }} / ${{ g.target.toLocaleString('en-US') }}</p>
      </li>
    </ul>
  </section>
</template>
