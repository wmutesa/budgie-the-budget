<script setup>
import { computed } from 'vue';
import { BANKS } from '../data/banks';
import { store } from '../lib/store';
import { surplus, pace } from '../lib/advice';
import { logoUrl } from '../lib/brands';
import { goals } from '../data/demo';

// Where spare money could go, at the banks you use. Amounts come from your data;
// rates are on each bank's own page because they change daily.
const usd = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const toggle = id => { store.banks = store.banks.includes(id) ? store.banks.filter(b => b !== id) : [...store.banks, id]; };
const emergency = goals.find(g => /emergency/i.test(g.name)) || goals[0];
const monthlySpend = computed(() => Math.max(pace.value.projected, 1));
const cushionMonths = computed(() => (emergency ? emergency.saved / monthlySpend.value : 0));

const ideas = computed(() => store.banks.filter(id => BANKS[id]).flatMap(id => {
  const bank = BANKS[id];
  const save = Math.round(surplus.value / 2 / 10) * 10;
  return bank.products.map(p => {
    if (p.kind === 'savings') return { bank, p, title: save > 0 ? `Move ${usd(save)} a month to ${p.name}` : `Open ${p.name} for your cushion`, body: save > 0 ? 'Half of what income is ahead of spending this month.' : 'Start small; any amount builds the habit.' };
    if (p.kind === 'cds') return { bank, p, title: `Lock part of your cushion in ${p.name}`, body: emergency ? `${emergency.name} holds ${usd(emergency.saved)}. A CD suits money you will not touch for months.` : 'Good for money you will not need soon.' };
    return { bank, p, title: cushionMonths.value >= 3 ? `Start investing with ${p.name}` : `Build 3 months of cushion before investing`, body: cushionMonths.value >= 3 ? `Your cushion covers about ${cushionMonths.value.toFixed(1)} months of spending.` : `Your cushion covers about ${cushionMonths.value.toFixed(1)} months. Aim for 3 before ${p.name}.` };
  });
}));
</script>

<template>
  <section class="card cell opps">
    <div class="cell-head"><p class="label">Savings and investing</p><span class="muted small">Your banks</span></div>
    <div class="bank-toggles">
      <button v-for="(b, id) in BANKS" :key="id" class="bank-chip" :class="{ on: store.banks.includes(id) }" @click="toggle(id)">
        <img :src="logoUrl(b.domain)" :alt="`${b.name} logo`" width="18" height="18" />{{ b.name }}
      </button>
    </div>
    <ul class="opp-list">
      <li v-for="o in ideas" :key="o.p.url" class="opp">
        <img :src="logoUrl(o.bank.domain)" :alt="`${o.bank.name} logo`" width="22" height="22" />
        <div class="grow">
          <b>{{ o.title }}</b>
          <span class="muted small">{{ o.body }}</span>
          <a :href="o.p.url" target="_blank" rel="noopener noreferrer" class="opp-link">Today's rate on {{ o.bank.domain }} ↗</a>
        </div>
      </li>
    </ul>
    <p class="meta small">Suggestions, not financial advice. Rates change daily, so check the bank's page.</p>
  </section>
</template>
