<script setup>
import { computed, ref, onMounted } from 'vue';
import { fromMins, toMins } from '../lib/tasks';
import { tick } from '../lib/tick';

// Hour, minute and AM/PM wheels, like a phone's: they roll and snap, with a
// soft watch-like click on every step. v-model is 'HH:MM' or ''.
const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const cur = computed(() => { const m = props.modelValue ? toMins(props.modelValue) : null; if (m == null) return null; const h24 = Math.floor(m / 60); return { h12: h24 % 12 || 12, min: m % 60, pm: h24 >= 12 }; });
function set({ h12 = cur.value?.h12 ?? 9, min = cur.value?.min ?? 0, pm = cur.value?.pm ?? (new Date().getHours() >= 12) } = {}) {
  emit('update:modelValue', fromMins(((h12 % 12) + (pm ? 12 : 0)) * 60 + min));
}
const hourCol = ref(null), minCol = ref(null), ampmCol = ref(null);
const ITEM = 34;
const lastIdx = { h: -1, m: -1, p: -1 };
const settle = {};
let quiet = true;
const cols = () => ({ h: [hourCol.value, HOURS], m: [minCol.value, MINS], p: [ampmCol.value, ['AM', 'PM']] });
function onWheel(kind) {
  const [col, items] = cols()[kind];
  if (!col) return;
  const idx = Math.max(0, Math.min(items.length - 1, Math.round(col.scrollTop / ITEM)));
  if (idx !== lastIdx[kind]) { lastIdx[kind] = idx; if (!quiet) tick(); }
  clearTimeout(settle[kind]);
  settle[kind] = setTimeout(() => {
    if (quiet) return;
    if (kind === 'h') set({ h12: HOURS[idx] }); else if (kind === 'm') set({ min: MINS[idx] }); else set({ pm: idx === 1 });
  }, 120);
}
function roll(kind, idx) {
  const [col] = cols()[kind];
  col?.scrollTo({ top: idx * ITEM, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
const tapHour = h => { set({ h12: h }); roll('h', HOURS.indexOf(h)); };
const tapMin = m => { set({ min: m }); roll('m', MINS.indexOf(m)); };
const tapPm = pm => { set({ pm }); roll('p', pm ? 1 : 0); };
// Place the wheels on the chosen time (or the next hour), quietly.
onMounted(() => {
  const n = new Date().getHours() + 1;
  const c = cur.value || { h12: n % 12 || 12, min: 0, pm: n % 24 >= 12 };
  const at = { h: HOURS.indexOf(c.h12), m: Math.max(0, MINS.indexOf(c.min - (c.min % 5))), p: c.pm ? 1 : 0 };
  for (const k of ['h', 'm', 'p']) { lastIdx[k] = at[k]; const [col] = cols()[k]; if (col) col.scrollTop = at[k] * ITEM; }
  setTimeout(() => { quiet = false; }, 200);
});
</script>

<template>
  <div class="tp-wheels">
    <span class="tp-band" aria-hidden="true" />
    <div ref="hourCol" class="tp-wheel" role="listbox" aria-label="Hour" @scroll.passive="onWheel('h')">
      <button v-for="h in HOURS" :key="h" type="button" role="option" class="tp-cell" :class="{ sel: cur?.h12 === h }" :aria-selected="cur?.h12 === h" :data-test="`tp-h-${h}`" @click="tapHour(h)">{{ h }}</button>
    </div>
    <span class="tp-colon" aria-hidden="true">:</span>
    <div ref="minCol" class="tp-wheel" role="listbox" aria-label="Minutes" @scroll.passive="onWheel('m')">
      <button v-for="m in MINS" :key="m" type="button" role="option" class="tp-cell" :class="{ sel: cur?.min === m }" :aria-selected="cur?.min === m" :data-test="`tp-m-${m}`" @click="tapMin(m)">{{ String(m).padStart(2, '0') }}</button>
    </div>
    <div ref="ampmCol" class="tp-wheel tp-wheel-ap" role="listbox" aria-label="AM or PM" @scroll.passive="onWheel('p')">
      <button type="button" role="option" class="tp-cell" :class="{ sel: cur && !cur.pm }" :aria-selected="!!cur && !cur.pm" data-test="tp-am" @click="tapPm(false)">AM</button>
      <button type="button" role="option" class="tp-cell" :class="{ sel: cur?.pm }" :aria-selected="!!cur?.pm" data-test="tp-pm" @click="tapPm(true)">PM</button>
    </div>
  </div>
</template>
