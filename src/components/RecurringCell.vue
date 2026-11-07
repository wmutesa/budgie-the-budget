<script setup>
import Icon from './Icon.vue';
import { recurring, trackAsSubscription } from '../lib/recurring';
import { newId } from '../lib/store';

// Payments that repeat each month but are not tracked yet, with one-click tracking.
const money = (n, c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'USD', maximumFractionDigits: c === 'RWF' ? 0 : 2 }).format(n);
</script>

<template>
  <section v-if="recurring.length" class="card cell recurring" data-test="recurring">
    <div class="cell-head"><p class="label">Repeating payments</p><span class="muted small">Found in your activity</span></div>
    <p class="ai-hint"><span class="ai-spark" aria-hidden="true">✦</span>These charge you about the same amount every month. Track them as subscriptions to see them coming.</p>
    <ul class="rec-list">
      <li v-for="r in recurring.slice(0, 6)" :key="r.key">
        <span class="rec-name"><b>{{ r.name }}</b><span class="muted small">{{ r.count }} times over {{ r.months }} months · {{ r.category }}</span></span>
        <b>{{ money(r.amount, r.currency) }}<span class="muted small"> / month</span></b>
        <button class="btn small" type="button" data-test="track-recurring" @click="trackAsSubscription(r, newId)"><Icon name="plus" :size="14" />Track as subscription</button>
      </li>
    </ul>
  </section>
</template>
