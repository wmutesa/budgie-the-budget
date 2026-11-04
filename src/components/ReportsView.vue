<script setup>
import { computed } from 'vue';
import { cashFlow, merchants } from '../data/demo';
import { pace } from '../lib/advice';
import { spentByCategory } from '../lib/ledger';
import { store } from '../lib/store';

// The Reports page uses this in three places: the numbers strip, month by month, and where money goes.
const props = defineProps({ part: { type: String, default: 'stats' } });

const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const short = n => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n));
const net = d => d.income - d.expense;
const saved = cashFlow.reduce((s, d) => s + net(d), 0);
const income = cashFlow.reduce((s, d) => s + d.income, 0);
const rate = Math.round((saved / income) * 100);
const best = cashFlow.reduce((a, b) => (net(b) > net(a) ? b : a));
const worst = cashFlow.reduce((a, b) => (net(b) < net(a) ? b : a));
const avgNet = saved / cashFlow.length;
const cats = computed(() => {
  const rows = Object.entries(spentByCategory.value).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((t, [, v]) => t + v, 0) || 1;
  return rows.slice(0, 6).map(([name, v]) => ({ name, v, pct: Math.round((v / total) * 100), color: store.budgets.find(b => b.name === name)?.color || '#a1a1aa' }));
});
const paceRow = computed(() => ({ spent: pace.value.spent ?? 0, budget: pace.value.budget ?? 0, projected: pace.value.projected ?? 0 }));
const maxFlow = Math.max(...cashFlow.map(d => Math.max(d.income, d.expense)));
const topM = Math.max(...merchants.map(m => m.total));
const tints = ['#7c3aed']; // one accent; the rest stays neutral

// A small area chart of net savings per month.
const spark = computed(() => {
  const v = cashFlow.map(net);
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * 100, 34 - ((x - min) / span) * 28]);
  return { line: pts.map(p => p.join(',')).join(' '), area: `0,40 ${pts.map(p => p.join(',')).join(' ')} 100,40`, last: pts[pts.length - 1] };
});
</script>

<template>
  <!-- Numbers strip -->
  <section v-if="part === 'stats'" class="card cell rep-stats">
    <div class="card-head"><p class="label">Year in numbers</p><span class="muted small">Sample history · this month is live</span></div>
    <div class="rs-row">
      <div class="rs">
        <span class="small">This month so far</span>
        <b>{{ fmt(paceRow.spent) }}</b>
        <span class="small muted">heading to {{ fmt(paceRow.projected) }} of {{ fmt(paceRow.budget) }}</span>
        <span class="rs-meter"><i :style="{ width: Math.min(100, (paceRow.projected / (paceRow.budget || 1)) * 100) + '%' }" :class="{ over: paceRow.projected > paceRow.budget }" /></span>
      </div>
      <div class="rs">
        <span class="small">Saved this year</span><b class="gain">{{ fmt(saved) }}</b>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="rs-spark" aria-hidden="true">
          <polygon :points="spark.area" fill="#7c3aed" opacity=".1" />
          <polyline :points="spark.line" fill="none" stroke="#a78bfa" stroke-width="1.4" vector-effect="non-scaling-stroke" />
        </svg>
      </div>
      <div class="rs">
        <span class="small">Savings rate</span><b>{{ rate }}%</b>
        <span class="small muted">of {{ short(income) }} earned · {{ short(avgNet) }} a month</span>
      </div>
      <div class="rs">
        <span class="small">Best month</span><b>{{ best.m }}</b>
        <span class="small gain">+{{ short(net(best)) }} kept</span>
      </div>
      <div class="rs">
        <span class="small">Toughest month</span><b>{{ worst.m }}</b>
        <span class="small" :class="net(worst) < 0 ? 'loss' : 'gain'">{{ net(worst) < 0 ? '−' : '+' }}{{ short(Math.abs(net(worst))) }} {{ net(worst) < 0 ? 'over' : 'kept' }}</span>
      </div>
    </div>
  </section>

  <!-- Month by month -->
  <section v-else-if="part === 'months'" class="card cell report-cell">
    <div class="kicker-row cell-head">
      <p class="label">Month by month</p>
      <span class="legend-mini"><i class="lm in" />Income <i class="lm out" />Spent <span class="gain">▲ gain</span> <span class="loss">▼ loss</span></span>
    </div>
    <div class="month-rows">
      <div v-for="d in cashFlow" :key="d.m" class="m-row" :class="{ best: d.m === best.m }">
        <span class="m-name">{{ d.m }}</span>
        <div class="m-bars">
          <i class="mb in" :style="{ width: (d.income / maxFlow) * 100 + '%' }" :title="`Income ${fmt(d.income)}`" />
          <i class="mb out" :style="{ width: (d.expense / maxFlow) * 100 + '%' }" :title="`Spent ${fmt(d.expense)}`" />
        </div>
        <span class="m-num small"><span class="m-in">{{ short(d.income) }}</span> / <span class="m-out">{{ short(d.expense) }}</span></span>
        <span class="m-net" :class="net(d) >= 0 ? 'gain' : 'loss'" :title="net(d) >= 0 ? 'Gain: you kept money this month' : 'Loss: you spent more than you earned'"><span aria-hidden="true">{{ net(d) >= 0 ? '▲' : '▼' }}</span> {{ net(d) >= 0 ? '+' : '−' }}{{ short(Math.abs(net(d))) }}</span>
      </div>
    </div>
  </section>

  <!-- Where money goes -->
  <section v-else class="card cell report-cell">
    <div class="cell-head"><p class="label">Where money goes</p><span class="muted small">This month by category</span></div>
    <div class="cat-stack" aria-hidden="true">
      <i v-for="c in cats" :key="c.name" :style="{ width: c.pct + '%', background: c.color }" :title="`${c.name} ${c.pct}%`" />
    </div>
    <ul class="cat-list">
      <li v-for="c in cats" :key="c.name"><span><i class="m-dot" :style="{ background: c.color }" />{{ c.name }}</span><span class="muted small">{{ c.pct }}%</span><b>{{ fmt(c.v) }}</b></li>
      <li v-if="!cats.length" class="muted small">No spending yet this month.</li>
    </ul>
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
