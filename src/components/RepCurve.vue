<script setup>
import { ref, computed } from 'vue';

// A smooth line with a soft gradient fill, a recessive dashed grid, and a
// crosshair, marker and tooltip on hover. One series, one axis.
const props = defineProps({
  values: { type: Array, required: true },   // numbers, one per point
  labels: { type: Array, required: true },   // tooltip label per point
  ticks: { type: Array, default: () => [] }, // [index, text] for the x axis
  format: { type: Function, default: v => String(v) },
  color: { type: String, default: 'var(--violet)' },
  height: { type: Number, default: 180 },
  name: { type: String, default: '' },
});
const uid = `rc${Math.random().toString(36).slice(2, 8)}`;
const max = computed(() => { const m = Math.max(0, ...props.values); if (!m) return 1; const step = 10 ** Math.floor(Math.log10(m)); return Math.ceil(m / step) * step; });
const n = computed(() => Math.max(1, props.values.length - 1));
const pts = computed(() => props.values.map((v, i) => [(i / n.value) * 100, 100 - (v / max.value) * 100]));
// Catmull-Rom to cubic Bézier, control points kept inside the plot.
const clampY = y => Math.max(0, Math.min(100, y));
const line = computed(() => {
  const p = pts.value;
  if (p.length < 2) return '';
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
});
const area = computed(() => (line.value ? `${line.value} L100,100 L0,100 Z` : ''));
const yTicks = computed(() => [max.value, max.value / 2, 0]);

// Hover: the nearest point to the pointer.
const hover = ref(-1);
const plot = ref(null);
function move(e) {
  const r = plot.value.getBoundingClientRect();
  const x = (('touches' in e ? e.touches[0].clientX : e.clientX) - r.left) / r.width;
  hover.value = Math.max(0, Math.min(props.values.length - 1, Math.round(x * n.value)));
}
const hp = computed(() => (hover.value >= 0 ? pts.value[hover.value] : null));
// Keyboard: arrows move the marker.
function key(e) {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const i = hover.value < 0 ? props.values.length - 1 : hover.value + (e.key === 'ArrowRight' ? 1 : -1);
  hover.value = Math.max(0, Math.min(props.values.length - 1, i));
}
</script>

<template>
  <div class="rc" :style="{ '--c': color, '--h': `${height}px` }">
    <div class="rc-y" aria-hidden="true"><span v-for="t in yTicks" :key="t">{{ format(t) }}</span></div>
    <div ref="plot" class="rc-plot" tabindex="0" role="img" :aria-label="`${name}: ${values.map((v, i) => `${labels[i]} ${format(v)}`).join(', ')}`"
      @mousemove="move" @touchmove.passive="move" @mouseleave="hover = -1" @blur="hover = -1" @keydown="key">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient :id="`${uid}-fill`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--c)" stop-opacity=".22" />
            <stop offset="100%" stop-color="var(--c)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line v-for="y in [0, 50, 100]" :key="y" x1="0" x2="100" :y1="y" :y2="y" class="rc-grid" vector-effect="non-scaling-stroke" />
        <path :d="area" :fill="`url(#${uid}-fill)`" />
        <path :d="line" class="rc-line" vector-effect="non-scaling-stroke" />
        <line v-if="hp" :x1="hp[0]" :x2="hp[0]" y1="0" y2="100" class="rc-cross" vector-effect="non-scaling-stroke" />
      </svg>
      <template v-if="hp">
        <i class="rc-dot" :style="{ left: `${hp[0]}%`, top: `${hp[1]}%` }" />
        <span class="rc-tip" :class="{ flip: hp[0] > 70 }" :style="{ left: `${hp[0]}%`, top: `${hp[1]}%` }"><b>{{ format(values[hover]) }}</b> {{ labels[hover] }}</span>
      </template>
    </div>
    <div class="rc-x" aria-hidden="true"><span v-for="[i, t] in ticks" :key="i" :style="{ left: `${(i / n) * 100}%` }">{{ t }}</span></div>
  </div>
</template>
