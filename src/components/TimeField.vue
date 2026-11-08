<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { timeLabel, fromMins, toMins } from '../lib/tasks';
import Icon from './Icon.vue';
import TimeWheels from './TimeWheels.vue';

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
      <TimeWheels :model-value="modelValue" @update:model-value="t => emit('update:modelValue', t)" />
      <div class="tp-foot">
        <button v-if="clearable && modelValue" type="button" class="tp-clear" @click="pick('')">Clear</button>
        <button type="button" class="tp-done" data-test="tp-done" @click="open = false">Done</button>
      </div>
    </div>
  </Teleport>
</template>
