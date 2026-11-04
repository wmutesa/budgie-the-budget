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
const emergency = goals.find(g => /emergency/i.test(g.name)) || goals[0];
const monthlySpend = computed(() => Math.max(pace.value.projected, 1));
const cushionMonths = computed(() => (emergency ? emergency.saved / monthlySpend.value : 0));

// One plain-language suggestion from your own numbers, shown above the ideas.
const advice = computed(() => {
  const months = cushionMonths.value;
  const spare = Math.round(surplus.value / 10) * 10;
  if (months < 1) return `Your cushion covers ${months.toFixed(1)} months of spending. Build it first: ${spare > 0 ? `moving ${usd(spare / 2)} a month into savings` : 'even a small automatic transfer'} gets you to a full month fastest.`;
  if (months < 3) return `Your cushion covers ${months.toFixed(1)} months. Keep adding to savings until it reaches 3, then consider a CD for part of it.`;
  return `Your cushion covers ${months.toFixed(1)} months, so investing a fixed amount each month is a reasonable next step.`;
});
const savingsLinks = computed(() => store.banks.filter(id => BANKS[id]).map(id => BANKS[id].products.find(p => p.kind === 'savings')).filter(Boolean));
const openRates = () => savingsLinks.value.forEach(p => window.open(p.url, '_blank', 'noopener,noreferrer'));

const byBank = computed(() => store.banks.filter(id => BANKS[id]).map(id => ({ bank: BANKS[id], items: ideas.value.filter(o => o.bank === BANKS[id]) })));
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
    <div class="opp-ai">
      <span class="opp-ai-tag">Budgie suggests</span>
      <p>{{ advice }}</p>
      <button type="button" class="opp-ai-link" @click="openRates">Compare today's savings rates ↗</button>
    </div>
    <div class="opp-banks">
      <div v-for="g in byBank" :key="g.bank.domain" class="opp-bank">
        <p class="opp-bank-head">
          <img :src="logoUrl(g.bank.domain)" :alt="`${g.bank.name} logo`" width="16" height="16" @error="e => (e.target.style.visibility = 'hidden')" />
          <b>{{ g.bank.name }}</b>
        </p>
        <a v-for="o in g.items" :key="o.p.url" :href="o.p.url" target="_blank" rel="noopener noreferrer" class="opp-line" :title="o.body">
          <span>{{ o.title }}</span><span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
    <p class="meta small">Suggestions, not financial advice. Rates change daily, so check the bank's page.</p>
  </section>
</template>
