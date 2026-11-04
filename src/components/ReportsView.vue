<script setup>
import { computed } from 'vue';
import { cashFlow, activeMonths, topMerchants as merchants } from '../lib/ledger';
const since = computed(() => new Date(`${cashFlow.value[0].key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));

// Year in numbers, from your own entries for each month since you started (up to 12).
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const short = n => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n));
const net = d => d.income - d.expense;
const saved = computed(() => cashFlow.value.reduce((s, d) => s + net(d), 0));
const income = computed(() => cashFlow.value.reduce((s, d) => s + d.income, 0));
const rate = computed(() => (income.value > 0 ? Math.max(0, Math.round((saved.value / income.value) * 100)) : 0));
const best = computed(() => activeMonths.value.reduce((x, y) => (net(y) > net(x) ? y : x), activeMonths.value[0] || { m: '—', key: '', income: 0, expense: 0 }));
const maxFlow = computed(() => Math.max(1, ...cashFlow.value.map(d => Math.max(d.income, d.expense))));
const topM = computed(() => Math.max(1, ...merchants.value.map(m => m.total)));
const tints = ['#7c3aed']; // one accent; the rest stays neutral

// A small area chart of net savings per month.
const spark = computed(() => {
  const v = cashFlow.value.map(net);
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => [v.length > 1 ? (i / (v.length - 1)) * 100 : 100, 34 - ((x - min) / span) * 28]);
  return { line: pts.map(p => p.join(',')).join(' '), area: `0,40 ${pts.map(p => p.join(',')).join(' ')} 100,40`, last: pts[pts.length - 1] };
});
</script>

<template>
  <section class="card cell report-cell">
    <div class="card-head"><p class="label">Year in numbers</p><span class="muted small">Since {{ since }}, from your entries</span></div>

    <div class="stat-row tinted">
      <div class="stat t-violet">
        <span class="small">Saved this year</span><b>{{ fmt(saved) }}</b>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="stat-spark" aria-hidden="true">
          <polygon :points="spark.area" fill="#7c3aed" opacity=".14" />
          <polyline :points="spark.line" fill="none" stroke="#7c3aed" stroke-width="1.6" vector-effect="non-scaling-stroke" />
          <circle :cx="spark.last[0]" :cy="spark.last[1]" r="2.2" fill="#7c3aed" />
        </svg>
      </div>
      <div class="stat t-green">
        <span class="small">Savings rate</span><b>{{ rate }}%</b>
        <div class="ring-row">
          <svg viewBox="0 0 36 36" class="ring" aria-hidden="true">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#bbf7d0" stroke-width="5" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#16a34a" stroke-width="5" pathLength="100" :stroke-dasharray="`${rate} 100`" transform="rotate(-90 18 18)" />
          </svg>
          <span class="small">of {{ short(income) }} earned</span>
        </div>
      </div>
      <div class="stat t-blue">
        <span class="small">Best month</span><b>{{ best.m }}</b>
        <span class="small">{{ best.key ? `kept ${fmt(net(best))}` : 'no entries yet' }}</span>
      </div>
    </div>

    <div>
      <div class="kicker-row">
        <p class="kicker">Month by month</p>
        <span class="legend-mini"><i class="lm in" />Income <i class="lm out" />Spent</span>
      </div>
      <div class="month-rows">
        <div v-for="d in cashFlow" :key="d.key" class="m-row" :class="{ best: d.key === best.key, quiet: !d.income && !d.expense }">
          <span class="m-name">{{ d.m }}</span>
          <div class="m-bars">
            <i class="mb in" :style="{ width: (d.income / maxFlow) * 100 + '%' }" :title="`Income ${fmt(d.income)}`" />
            <i class="mb out" :style="{ width: (d.expense / maxFlow) * 100 + '%' }" :title="`Spent ${fmt(d.expense)}`" />
          </div>
          <span class="m-num small"><span class="m-in">{{ short(d.income) }}</span> / <span class="m-out">{{ short(d.expense) }}</span></span>
          <span class="m-net" :class="net(d) >= 0 ? 'gain' : 'loss'" :title="net(d) >= 0 ? 'Gain: you kept money this month' : 'Loss: you spent more than you earned'"><span aria-hidden="true">{{ net(d) >= 0 ? '▲' : '▼' }}</span> {{ net(d) >= 0 ? '+' : '−' }}{{ short(Math.abs(net(d))) }}</span>
        </div>
      </div>
    </div>

    <div>
      <p class="kicker">Top merchants · 3 months</p>
      <ul class="merchant-list colored">
        <li v-if="!merchants.length" class="muted small">Your top places to spend appear here.</li>
        <li v-for="(m, i) in merchants" :key="m.name">
          <div class="row-line"><span><i class="m-dot" :style="{ background: tints[i % tints.length] }" />{{ m.name }} <span class="muted small">×{{ m.count }}</span></span><b>{{ fmt(m.total) }}</b></div>
          <div class="meter"><i :style="{ width: (m.total / topM) * 100 + '%', background: tints[i % tints.length] }" /></div>
        </li>
      </ul>
    </div>
  </section>
</template>
