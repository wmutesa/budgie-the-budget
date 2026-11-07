<script setup>
import { computed } from 'vue';

// A small chart for a stat tile: a smooth area, a step line, a dot matrix, or
// bars against a target line. Decorative backing for the number beside it,
// with its own label for screen readers.
const props = defineProps({
  kind: { type: String, default: 'area' }, // area | step | dots | bars
  values: { type: Array, required: true },
  target: { type: Number, default: null }, // for bars: 0..max
  max: { type: Number, default: null },
  label: { type: String, default: '' },
});
const uid = `rm${Math.random().toString(36).slice(2, 8)}`;
const top = computed(() => props.max ?? Math.max(1, ...props.values));
const n = computed(() => Math.max(1, props.values.length - 1));
const y = v => 96 - (v / top.value) * 88;
const area = computed(() => {
  const p = props.values.map((v, i) => [(i / n.value) * 100, y(v)]);
  if (p.length < 2) return { line: '', fill: '' };
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${Math.min(96, p1[1] + (p2[1] - p0[1]) / 6)} ${p2[0] - (p3[0] - p1[0]) / 6},${Math.min(96, p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]},${p2[1]}`;
  }
  return { line: d, fill: `${d} L100,100 L0,100 Z` };
});
const step = computed(() => {
  const w = 100 / props.values.length;
  return props.values.map((v, i) => `${i ? 'L' : 'M'}${i * w},${y(v)} L${(i + 1) * w},${y(v)}`).join(' ');
});
// Dots: one column per point, a dot per unit (up to 6).
const dots = computed(() => {
  const cap = 6;
  const scale = Math.max(1, Math.ceil(top.value / cap));
  return props.values.map((v, i) => ({ i, k: Math.min(cap, Math.ceil(v / scale)) }));
});
</script>

<template>
  <div class="rm" role="img" :aria-label="label">
    <svg v-if="kind === 'area'" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient :id="`${uid}-f`" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--violet)" stop-opacity=".24" /><stop offset="100%" stop-color="var(--violet)" stop-opacity="0" /></linearGradient></defs>
      <path :d="area.fill" :fill="`url(#${uid}-f)`" />
      <path :d="area.line" class="rm-line" vector-effect="non-scaling-stroke" />
    </svg>
    <svg v-else-if="kind === 'step'" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path :d="step" class="rm-line" vector-effect="non-scaling-stroke" />
    </svg>
    <svg v-else-if="kind === 'bars'" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect v-for="(v, i) in values" :key="i" :x="(i / values.length) * 100 + 0.6" :width="100 / values.length - 1.2" :y="y(v)" :height="100 - y(v)" class="rm-bar" :class="{ hit: target != null && v >= target }" />
      <line v-if="target != null" x1="0" x2="100" :y1="y(target)" :y2="y(target)" class="rm-target" vector-effect="non-scaling-stroke" />
    </svg>
    <div v-else class="rm-dots" :style="{ '--n': values.length }" aria-hidden="true">
      <span v-for="c in dots" :key="c.i"><i v-for="d in 6" :key="d" :class="{ on: d <= c.k }" /></span>
    </div>
  </div>
</template>
