<script setup>
const signals = [
  { tone: 'info', title: 'iCloud+ renews in 2 days', body: '$2.99, monthly.' },
  { tone: 'warn', title: 'Shopping is over budget', body: '$286 of $250 this month.' },
  { tone: 'good', title: 'Savings rate 36%', body: 'Kept over the last three months.' },
];
</script>

<template>
  <section class="card cell">
    <div class="cell-head"><p class="label">Signals</p><span class="muted small">{{ signals.length }} active</span></div>
    <ul class="signals">
      <li v-for="s in signals" :key="s.title" :class="s.tone">
        <b>{{ s.title }}</b><span class="muted small">{{ s.body }}</span>
      </li>
    </ul>
  </section>
</template>
