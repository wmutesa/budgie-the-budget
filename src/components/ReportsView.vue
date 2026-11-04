<script setup>
import { cashFlow, merchants } from '../data/demo';
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const net = d => d.income - d.expense;
const top = Math.max(...merchants.map(m => m.total));
const saved = cashFlow.reduce((s, d) => s + net(d), 0);
const rate = Math.round((saved / cashFlow.reduce((s, d) => s + d.income, 0)) * 100);
</script>

<template>
  <section class="card cell report-cell">
    <div class="card-head"><p class="label">Year in numbers</p><span class="muted small">Sample history</span></div>
    <div class="stat-row">
      <div class="stat"><span class="muted small">Saved</span><b>{{ fmt(saved) }}</b></div>
      <div class="stat"><span class="muted small">Savings rate</span><b>{{ rate }}%</b></div>
      <div class="stat"><span class="muted small">Best month</span><b>{{ cashFlow.reduce((a, b) => (net(b) > net(a) ? b : a)).m }}</b></div>
    </div>
    <div class="report-cols">
      <div>
        <p class="kicker">Month by month</p>
        <table class="table compact">
          <thead><tr><th>Month</th><th class="num">Income</th><th class="num">Spent</th><th class="num">Net</th></tr></thead>
          <tbody>
            <tr v-for="d in cashFlow" :key="d.m">
              <td>{{ d.m }}</td><td class="num">{{ fmt(d.income) }}</td><td class="num">{{ fmt(d.expense) }}</td>
              <td class="num" :class="net(d) >= 0 ? 'in' : 'out'">{{ fmt(net(d)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <p class="kicker">Top merchants · 3 months</p>
        <ul class="merchant-list">
          <li v-for="m in merchants" :key="m.name">
            <div class="row-line"><span>{{ m.name }} <span class="muted small">×{{ m.count }}</span></span><b>{{ fmt(m.total) }}</b></div>
            <div class="meter"><i :style="{ width: (m.total / top) * 100 + '%' }" /></div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
