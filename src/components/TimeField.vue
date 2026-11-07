<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { timeLabel, fromMins, toMins } from '../lib/tasks';
import Icon from './Icon.vue';

// A time picker that looks the same everywhere: a field that opens a list of
// times every 15 minutes, with quick picks, or type one ("5pm", "17:30").
// v-model is 'HH:MM' or ''.
const props = defineProps({ modelValue: { type: String, default: '' }, label: { type: String, default: 'Time' }, placeholder: { type: String, default: 'Any time' }, clearable: { type: Boolean, default: true } });
const emit = defineEmits(['update:modelValue']);
const open = ref(false);
const field = ref(null);
const pop = ref(null);
const list = ref(null);
const pos = ref({});
const typed = ref('');
const times = Array.from({ length: 96 }, (_, i) => fromMins(i * 15));
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
  pos.value = { left: `${Math.max(8, Math.min(r.left, window.innerWidth - 220 - 8))}px`, top: `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px` };
  // Start the list at the chosen time, or the current hour.
  const at = props.modelValue ? toMins(props.modelValue) : new Date().getHours() * 60;
  const el = list.value?.querySelector(`[data-t="${fromMins(Math.floor(at / 15) * 15)}"]`);
  if (el && list.value) list.value.scrollTop = el.offsetTop - 60;
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
    <div v-if="open" ref="pop" class="pk-pop tp" :style="pos" role="dialog" :aria-label="`Choose ${label.toLowerCase()}`" data-test="time-pop">
      <input v-model="typed" class="tp-type" placeholder="Type a time, e.g. 5:30pm" aria-label="Type a time" @keydown.enter.prevent="fromTyped" />
      <div ref="list" class="tp-list" role="listbox">
        <button v-for="t in times" :key="t" type="button" role="option" class="tp-opt" :class="{ sel: t === modelValue, hour: t.endsWith(':00') }" :aria-selected="t === modelValue" :data-t="t" @click="pick(t)">{{ timeLabel(t) }}</button>
      </div>
      <div class="pk-quick">
        <button type="button" @click="pick('09:00')">Morning</button>
        <button type="button" @click="pick('12:00')">Noon</button>
        <button type="button" @click="pick('18:00')">Evening</button>
        <button v-if="clearable && modelValue" type="button" class="pk-clear" @click="pick('')">Clear</button>
      </div>
    </div>
  </Teleport>
</template>
