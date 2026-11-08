<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { isoDay, fromIso, addDays, timeLabel } from '../lib/tasks';
import TimeWheels from './TimeWheels.vue';
import Icon from './Icon.vue';

// One button for when something happens: the day and the time together.
// It opens one card: the month on top, the hour and minute wheels below.
const props = defineProps({ date: { type: String, default: '' }, time: { type: String, default: '' } });
const emit = defineEmits(['update:date', 'update:time']);
const open = ref(false);
const field = ref(null);
const pop = ref(null);
const pos = ref({});
const today = isoDay();
const view = ref((props.date || today).slice(0, 7));
const text = computed(() => {
  const d = props.date ? fromIso(props.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No day';
  return props.time ? `${d} · ${timeLabel(props.time)}` : props.date ? `${d} · any time` : 'Pick a day and time';
});
const title = computed(() => fromIso(`${view.value}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
const cells = computed(() => {
  const first = fromIso(`${view.value}-01`);
  const start = addDays(`${view.value}-01`, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => { const d = addDays(start, i); return { d, n: fromIso(d).getDate(), out: d.slice(0, 7) !== view.value }; });
});
const shift = n => { const d = fromIso(`${view.value}-01`); d.setMonth(d.getMonth() + n); view.value = isoDay(d).slice(0, 7); };
const setDate = d => emit('update:date', d);
const setTime = t => { if (!props.date) emit('update:date', today); emit('update:time', t); };
async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  view.value = (props.date || today).slice(0, 7);
  await nextTick();
  const r = field.value.getBoundingClientRect();
  const w = 284, h = pop.value?.offsetHeight || 480;
  const below = r.bottom + 6 + h < window.innerHeight;
  pos.value = { left: `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`, top: `${below ? r.bottom + 6 : Math.max(8, Math.min(r.top - h - 6, window.innerHeight - h - 8))}px` };
}
const outside = e => { if (open.value && !pop.value?.contains(e.target) && !field.value?.contains(e.target)) open.value = false; };
const esc = e => { if (e.key === 'Escape' && open.value) { open.value = false; e.stopPropagation(); field.value?.focus(); } };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc, true); });
onUnmounted(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc, true); });
</script>

<template>
  <button ref="field" type="button" class="pk-field wf-field" :class="{ empty: !date, on: open }" :aria-label="`When: ${text}`" :aria-expanded="open" aria-haspopup="dialog" data-test="when-field" @click="toggle">
    <Icon name="when" :size="15" /><span>{{ text }}</span>
  </button>
  <Teleport to="body">
    <div v-if="open" ref="pop" class="pk-pop wf" :style="pos" role="dialog" aria-label="Choose a day and time" data-test="when-pop">
      <div class="wf-head">
        <b>{{ title }}</b>
        <span><button type="button" aria-label="Previous month" @click="shift(-1)"><Icon name="left" :size="14" /></button><button type="button" aria-label="Next month" @click="shift(1)"><Icon name="right" :size="14" /></button></span>
      </div>
      <div class="wf-grid">
        <span v-for="(w, i) in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="i" class="wf-wd" aria-hidden="true">{{ w }}</span>
        <button v-for="c in cells" :key="c.d" type="button" class="wf-day" :class="{ out: c.out, today: c.d === today, sel: c.d === date }" :aria-pressed="c.d === date" :aria-label="fromIso(c.d).toDateString()" :data-d="c.d" @click="setDate(c.d)">{{ c.n }}</button>
      </div>
      <TimeWheels :model-value="time" @update:model-value="setTime" />
      <div class="tp-foot">
        <button v-if="time" type="button" class="tp-clear" data-test="when-anytime" @click="emit('update:time', '')">Any time</button>
        <button type="button" class="tp-done" data-test="when-done" @click="open = false">Done</button>
      </div>
    </div>
  </Teleport>
</template>
