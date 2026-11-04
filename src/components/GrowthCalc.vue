<script setup>
import { ref, computed } from 'vue';

// What regular saving could grow to. An estimate with a steady yearly return,
// not a promise: real returns go up and down.
const monthly = ref(200);
const years = ref(10);
const presets = [
  { id: 'cautious', label: 'Cautious', rate: 3, about: 'like a high-yield savings account or bonds' },
  { id: 'middle', label: 'Middle', rate: 5, about: 'a mix of stocks and bonds' },
  { id: 'bold', label: 'Bold', rate: 7, about: 'mostly stocks, with bigger swings' },
];
const pick = ref('middle');
const rate = computed(() => presets.find(p => p.id === pick.value).rate);

const series = computed(() => {
  const r = rate.value / 100 / 12;
  const out = [];
  let bal = 0;
  for (let m = 1; m <= Math.max(1, years.value) * 12; m++) {
    bal = bal * (1 + r) + (Number(monthly.value) || 0);
    if (m % 12 === 0) out.push({ year: m / 12, bal, put: (Number(monthly.value) || 0) * m });
  }
  return out;
});
const end = computed(() => series.value[series.value.length - 1] || { bal: 0, put: 0 });
const usd = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const max = computed(() => Math.max(1, end.value.bal));
</script>

<template>
  <div class="growth" data-test="growth">
    <p class="kicker">Growth calculator</p>
    <div class="gr-inputs">
      <label><span class="small muted">Each month</span><input v-model.number="monthly" class="field" type="number" min="0" step="25" aria-label="Amount each month" /></label>
      <label><span class="small muted">Years</span><input v-model.number="years" class="field" type="number" min="1" max="50" step="1" aria-label="Years" /></label>
    </div>
    <div class="gr-presets" role="radiogroup" aria-label="Yearly return">
      <button v-for="p in presets" :key="p.id" type="button" role="radio" :aria-checked="pick === p.id" class="chip-btn" :class="{ on: pick === p.id }" :title="`${p.rate}% a year, ${p.about}`" @click="pick = p.id">{{ p.label }} · {{ p.rate }}%</button>
    </div>
    <div class="gr-bars" aria-hidden="true">
      <span v-for="s in series" :key="s.year" class="gr-col" :title="`Year ${s.year}: ${usd(s.bal)}`">
        <i class="gr-grow" :style="{ height: (s.bal / max) * 100 + '%' }"><i class="gr-put" :style="{ height: (s.put / s.bal) * 100 + '%' }" /></i>
      </span>
    </div>
    <p class="gr-key small muted"><i class="gr-put-key" />What you put in <i class="gr-grow-key" />Growth</p>
    <p class="gr-result">
      In {{ years }} {{ years === 1 ? 'year' : 'years' }}: <b data-test="growth-total">{{ usd(end.bal) }}</b>
      <span class="muted small">&nbsp;· you put in {{ usd(end.put) }}, growth adds {{ usd(end.bal - end.put) }}</span>
    </p>
    <p class="meta small">An estimate with a steady {{ rate }}% a year. Real returns rise and fall, and nothing is guaranteed.</p>
  </div>
</template>
