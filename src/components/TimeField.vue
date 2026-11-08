<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { timeLabel, fromMins, toMins } from '../lib/tasks';
import Icon from './Icon.vue';
import { tick } from '../lib/tick';

// A time picker like a phone's: three wheels (hour, minute, AM/PM) that roll
// and snap, with a soft watch-like click on every step.
// v-model is 'HH:MM' or ''.
const props = defineProps({ modelValue: { type: String, default: '' }, label: { type: String, default: 'Time' }, placeholder: { type: String, default: 'Any time' }, clearable: { type: Boolean, default: true } });
const emit = defineEmits(['update:modelValue']);
const open = ref(false);
const field = ref(null);
const pop = ref(null);
const list = ref(null);
const pos = ref({});
const typed = ref('');
// Hours and minutes, picked together: two columns and AM/PM.
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const cur = computed(() => { const m = props.modelValue ? toMins(props.modelValue) : null; if (m == null) return null; const h24 = Math.floor(m / 60); return { h12: h24 % 12 || 12, min: m % 60, pm: h24 >= 12 }; });
function set({ h12 = cur.value?.h12 ?? 9, min = cur.value?.min ?? 0, pm = cur.value?.pm ?? (new Date().getHours() >= 12) } = {}) {
  const h24 = (h12 % 12) + (pm ? 12 : 0);
  emit('update:modelValue', fromMins(h24 * 60 + min));
}
const hourCol = ref(null);
const minCol = ref(null);
const ampmCol = ref(null);
// ---------- the wheels ----------
const ITEM = 34; // px per row
const lastIdx = { h: -1, m: -1, p: -1 };
const settle = {};
let quiet = false; // while placing the wheels on open: no clicks
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
function roll(kind, idx, smooth = true) {
  const [col] = cols()[kind];
  col?.scrollTo({ top: idx * ITEM, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
}
const tapHour = h => { set({ h12: h }); roll('h', HOURS.indexOf(h)); };
const tapMin = m => { set({ min: m }); roll('m', MINS.indexOf(m)); };
const tapPm = pm => { set({ pm }); roll('p', pm ? 1 : 0); };
const text = computed(() => (props.modelValue ? timeLabel(props.modelValue) : ''));
function pick(t) { emit('update:modelValue', t); open.value = false; field.value?.focus(); }
// "5pm", "5:30 pm", "17:30", "9".
function fromTyped() {
  const m = typed.value.trim().toLowerCase().match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return;
  let h = Number(m[1]); const min = Number(m[2] || 0);
  if (m[3]?.startsWith('p') && h < 12) h += 12;
  if (m[3]?.startsWith('a') && h === 12) h = 0;
  if (h > 23 || min > 59) return;
  pick(fromMins(h * 60 + min));
  typed.value = '';
}
async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  await nextTick();
  const r = field.value.getBoundingClientRect();
  const h = pop.value?.offsetHeight || 320;
  const below = r.bottom + 6 + h < window.innerHeight;
  pos.value = { left: `${Math.max(8, Math.min(r.left, window.innerWidth - 248 - 8))}px`, top: `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px` };
  // Place the wheels on the chosen time (or the next hour), quietly.
  quiet = true;
  const c = cur.value || { h12: (new Date().getHours() + 1) % 12 || 12, min: 0, pm: new Date().getHours() + 1 >= 12 };
  const at = { h: HOURS.indexOf(c.h12), m: Math.max(0, MINS.indexOf(c.min - (c.min % 5))), p: c.pm ? 1 : 0 };
  for (const k of ['h', 'm', 'p']) { lastIdx[k] = at[k]; const [col] = cols()[k]; if (col) col.scrollTop = at[k] * ITEM; }
  setTimeout(() => { quiet = false; }, 200);
}
const outside = e => { if (open.value && !pop.value?.contains(e.target) && !field.value?.contains(e.target)) open.value = false; };
const esc = e => { if (e.key === 'Escape' && open.value) { open.value = false; e.stopPropagation(); field.value?.focus(); } };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc, true); });
onUnmounted(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc, true); });
</script>

<template>
  <button ref="field" type="button" class="pk-field" :class="{ empty: !modelValue, on: open }" :aria-label="`${label}: ${text || 'none'}`" :aria-expanded="open" aria-haspopup="dialog" data-test="time-field" @click="toggle">
    <Icon name="clock" :size="15" /><span>{{ text || placeholder }}</span>
  </button>
  <Teleport to="body">
    <div v-if="open" ref="pop" class="pk-pop tp tp2" :style="pos" role="dialog" :aria-label="`Choose ${label.toLowerCase()}`" data-test="time-pop">
      <p class="tp-read" aria-live="polite"><b>{{ cur ? `${cur.h12}:${String(cur.min).padStart(2, '0')} ${cur.pm ? 'PM' : 'AM'}` : '--:--' }}</b></p>
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
      <div class="tp-foot">
        <button v-if="clearable && modelValue" type="button" class="tp-clear" @click="pick('')">Clear</button>
        <button type="button" class="tp-done" data-test="tp-done" @click="open = false">Done</button>
      </div>
    </div>
  </Teleport>
</template>
