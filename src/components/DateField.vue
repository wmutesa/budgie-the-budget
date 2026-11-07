<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { isoDay, fromIso, addDays } from '../lib/tasks';
import Icon from './Icon.vue';

// A date picker that looks the same everywhere: a field that opens a month
// calendar with quick picks. v-model is 'YYYY-MM-DD' or ''.
const props = defineProps({ modelValue: { type: String, default: '' }, label: { type: String, default: 'Date' }, placeholder: { type: String, default: 'Pick a date' }, min: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
const open = ref(false);
const field = ref(null);
const pop = ref(null);
const pos = ref({});
const today = isoDay();
const view = ref((props.modelValue || today).slice(0, 7)); // 'YYYY-MM' shown
const text = computed(() => (props.modelValue ? fromIso(props.modelValue).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: props.modelValue.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' }) : ''));
const title = computed(() => fromIso(`${view.value}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
// Six weeks, Monday first.
const cells = computed(() => {
  const first = fromIso(`${view.value}-01`);
  const start = addDays(`${view.value}-01`, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => { const d = addDays(start, i); const x = fromIso(d); return { d, n: x.getDate(), out: d.slice(0, 7) !== view.value, weekend: [0, 6].includes(x.getDay()) }; });
});
const shift = n => { const d = fromIso(`${view.value}-01`); d.setMonth(d.getMonth() + n); view.value = isoDay(d).slice(0, 7); };
const nextMonday = () => addDays(today, ((8 - fromIso(today).getDay()) % 7) || 7);
function pick(d) { emit('update:modelValue', d); open.value = false; field.value?.focus(); }
async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  view.value = (props.modelValue || today).slice(0, 7);
  await nextTick();
  const r = field.value.getBoundingClientRect();
  const w = 288;
  const h = pop.value?.offsetHeight || 340;
  const below = r.bottom + 6 + h < window.innerHeight;
  pos.value = { left: `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`, top: `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px` };
  pop.value?.querySelector('.dp-day.sel, .dp-day.today')?.focus();
}
// Arrow keys move by day and week; Enter picks.
function onKey(e, d) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  if (!step) return;
  e.preventDefault();
  const n = addDays(d, step);
  if (n.slice(0, 7) !== view.value) view.value = n.slice(0, 7);
  nextTick(() => pop.value?.querySelector(`[data-d="${n}"]`)?.focus());
}
const outside = e => { if (open.value && !pop.value?.contains(e.target) && !field.value?.contains(e.target)) open.value = false; };
const esc = e => { if (e.key === 'Escape' && open.value) { open.value = false; e.stopPropagation(); field.value?.focus(); } };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc, true); });
onUnmounted(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc, true); });
</script>

<template>
  <button ref="field" type="button" class="pk-field" :class="{ empty: !modelValue, on: open }" :aria-label="`${label}: ${text || 'none'}`" :aria-expanded="open" aria-haspopup="dialog" data-test="date-field" @click="toggle">
    <Icon name="calendar" :size="15" /><span>{{ text || placeholder }}</span>
  </button>
  <Teleport to="body">
    <div v-if="open" ref="pop" class="pk-pop dp" :style="pos" role="dialog" :aria-label="`Choose ${label.toLowerCase()}`" data-test="date-pop">
      <div class="dp-head">
        <button type="button" class="ibtn ghost" aria-label="Previous month" @click="shift(-1)"><Icon name="left" /></button>
        <b>{{ title }}</b>
        <button type="button" class="ibtn ghost" aria-label="Next month" @click="shift(1)"><Icon name="right" /></button>
      </div>
      <div class="dp-grid" role="grid">
        <span v-for="(w, i) in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="i" class="dp-wd" aria-hidden="true">{{ w }}</span>
        <button v-for="c in cells" :key="c.d" type="button" class="dp-day" :class="{ out: c.out, today: c.d === today, sel: c.d === modelValue, weekend: c.weekend }" :data-d="c.d" :disabled="Boolean(min && c.d < min)" :aria-label="fromIso(c.d).toDateString()" :aria-pressed="c.d === modelValue" @click="pick(c.d)" @keydown="e => onKey(e, c.d)">{{ c.n }}</button>
      </div>
      <div class="pk-quick">
        <button type="button" @click="pick(today)">Today</button>
        <button type="button" @click="pick(addDays(today, 1))">Tomorrow</button>
        <button type="button" @click="pick(nextMonday())">Next Mon</button>
        <button v-if="modelValue" type="button" class="pk-clear" @click="pick('')">Clear</button>
      </div>
    </div>
  </Teleport>
</template>
