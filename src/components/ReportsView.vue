<script setup>
import { computed } from 'vue';
import { cashFlow, merchants } from '../data/demo';

const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const short = n => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n));
const net = d => d.income - d.expense;
const saved = cashFlow.reduce((s, d) => s + net(d), 0);
const income = cashFlow.reduce((s, d) => s + d.income, 0);
const rate = Math.round((saved / income) * 100);
const best = cashFlow.reduce((a, b) => (net(b) > net(a) ? b : a));
const maxFlow = Math.max(...cashFlow.map(d => Math.max(d.income, d.expense)));
const topM = Math.max(...merchants.map(m => m.total));
const tints = ['#7c3aed', '#16a34a', '#2563eb', '#db2777', '#d97706'];

// A small area chart of net savings per month.
const spark = computed(() => {
  const v = cashFlow.map(net);
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * 100, 34 - ((x - min) / span) * 28]);
  return { line: pts.map(p => p.join(',')).join(' '), area: `0,40 ${pts.map(p => p.join(',')).join(' ')} 100,40`, last: pts[pts.length - 1] };
});
</script>

<template>
  <section class="card cell report-cell">
    <div class="card-head"><p class="label">Year in numbers</p><span class="muted small">Sample history</span></div>

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
        <span class="small">kept {{ fmt(net(best)) }}</span>
      </div>
    </div>

    <div>
      <div class="kicker-row">
        <p class="kicker">Month by month</p>
        <span class="legend-mini"><i class="lm in" />Income <i class="lm out" />Spent</span>
      </div>
      <div class="month-rows">
        <div v-for="d in cashFlow" :key="d.m" class="m-row" :class="{ best: d.m === best.m }">
          <span class="m-name">{{ d.m }}</span>
          <div class="m-bars">
            <i class="mb in" :style="{ width: (d.income / maxFlow) * 100 + '%' }" :title="`Income ${fmt(d.income)}`" />
            <i class="mb out" :style="{ width: (d.expense / maxFlow) * 100 + '%' }" :title="`Spent ${fmt(d.expense)}`" />
          </div>
          <span class="m-num muted small">{{ short(d.income) }} / {{ short(d.expense) }}</span>
          <span class="m-net" :class="net(d) >= 0 ? 'pos' : 'neg'">{{ net(d) >= 0 ? '+' : '−' }}{{ short(Math.abs(net(d))) }}</span>
        </div>
      </div>
    </div>

    <div>
      <p class="kicker">Top merchants · 3 months</p>
      <ul class="merchant-list colored">
        <li v-for="(m, i) in merchants" :key="m.name">
          <div class="row-line"><span><i class="m-dot" :style="{ background: tints[i % tints.length] }" />{{ m.name }} <span class="muted small">×{{ m.count }}</span></span><b>{{ fmt(m.total) }}</b></div>
          <div class="meter"><i :style="{ width: (m.total / topM) * 100 + '%', background: tints[i % tints.length] }" /></div>
        </li>
      </ul>
    </div>
  </section>
</template>
