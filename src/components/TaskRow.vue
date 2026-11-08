<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { store } from '../lib/store';
import { nav } from '../lib/nav';
import { KINDS, DAY_SHORT, isDone, toggleDone, streak, timeLabel, dayLabel, today, urgency, nextOccurrence } from '../lib/tasks';
import { breakDown } from '../lib/breakdown';
import { startFocus } from '../lib/focus';
import TaskEditor from './TaskEditor.vue';
import { deleteTask } from '../lib/undo';
import Icon from './Icon.vue';

// One Planner item: tick it, read its details at a glance, open it to edit.
const props = defineProps({
  task: { type: Object, required: true },
  date: { type: String, default: '' },      // which day, for repeating items
  showDate: { type: Boolean, default: true },
});
const open = ref(false);
const t = props.task;
const day = computed(() => props.date || (t.repeat ? nextOccurrence(t) || today() : today()));
const done = computed(() => isDone(t, day.value));
const kind = computed(() => KINDS[t.kind] || KINDS.task);
const fire = computed(() => streak(t));
const urgent = computed(() => !done.value && !t.repeat && urgency(t) === 'high');
const when = computed(() => {
  if (!props.showDate) return '';
  const d = t.repeat ? nextOccurrence(t) : t.date;
  return d ? dayLabel(d) : '';
});
const overdue = computed(() => !t.repeat && !t.done && t.date && t.date < today());
const repeatText = computed(() => {
  const r = t.repeat;
  if (!r) return '';
  if (r.every === 'day') return 'Daily';
  if (r.every === 'weekdays') return 'Weekdays';
  if (r.every === 'month') return 'Monthly';
  return (r.days?.length ? r.days : []).map(d => DAY_SHORT[d]).join(' ') || 'Weekly';
});
const goal = computed(() => (t.goalId ? store.goals.find(g => g.id === t.goalId) : null));
const subDone = computed(() => (t.subtasks || []).filter(s => s.done).length);
const tick = () => toggleDone(t, day.value);
// The Delete key on a focused row (not while typing in the editor) deletes it, with Undo.
const onDeleteKey = e => { if (!e.target.closest('input, textarea, select, .tk-edit')) deleteTask(t); };
// Opened from search: expand and bring into view.
const el = ref(null);
// A click outside an open row closes its editor (date and time pickers float
// outside the row, so clicks in them do not count). Listens only while open.
const outside = e => { const t = e.target; if (t instanceof Element && el.value && !el.value.contains(t) && !t.closest('.pk-pop')) open.value = false; };
watch(open, v => { if (v) document.addEventListener('mousedown', outside); else document.removeEventListener('mousedown', outside); });
onUnmounted(() => document.removeEventListener('mousedown', outside));
onMounted(async () => { if (nav.task === t.id) { open.value = true; nav.task = ''; await nextTick(); el.value?.scrollIntoView({ block: 'center' }); } });
const splitting = ref(false);
async function split() { splitting.value = true; await breakDown(t); splitting.value = false; open.value = true; }
</script>

<template>
  <li ref="el" class="tk" :class="{ done, open, urgent, overdue, pending: t.pending }" :data-kind="t.kind" :data-task-id="t.id" :style="{ '--k': kind.color }" data-test="task" @keydown.delete="onDeleteKey">
    <button class="tk-check" type="button" role="checkbox" :aria-checked="done" :aria-label="`${done ? 'Undo' : 'Done'}: ${t.title}`" data-test="task-check" @click="tick">
      <Icon name="check" :size="14" />
    </button>
    <button class="tk-main" type="button" :aria-expanded="open" @click="open = !open">
      <span class="tk-title">{{ t.title }}</span>
      <span class="tk-meta">
        <span class="tk-kind">{{ kind.label }}</span>
        <span v-if="t.project" class="tk-proj">#{{ t.project }}</span>
        <span v-if="repeatText" class="tk-i tk-rep"><Icon name="repeat" :size="12" />{{ repeatText }}</span>
        <span v-if="fire > 1" class="tk-i tk-fire" :title="`${fire} in a row`"><Icon name="flame" :size="12" />{{ fire }}</span>
        <span v-if="goal" class="tk-i tk-goal" :style="{ color: goal.color }"><Icon name="target" :size="12" />{{ goal.title }}</span>
        <span v-if="t.subtasks?.length" class="tk-i"><Icon name="steps" :size="12" />{{ subDone }}/{{ t.subtasks.length }}</span>
        <span v-if="t.source === 'calendar'" class="tk-i tk-src"><Icon name="calendar" :size="12" />Calendar</span>
      </span>
    </button>
    <span class="tk-side">
      <span v-if="when || t.time" class="tk-due" :class="{ late: overdue }">
        <b v-if="when">{{ overdue ? `Overdue · ${when}` : when }}</b>
        <span v-if="t.time"><Icon name="clock" :size="11" />{{ timeLabel(t.time) }}<template v-if="t.mins"> · {{ t.mins >= 60 ? `${+(t.mins / 60).toFixed(1)} h` : `${t.mins} min` }}</template></span>
      </span>
      <span v-if="t.priority === 'high' || urgent" class="tk-flag" :title="urgent && t.priority !== 'high' ? 'Budgie thinks this is urgent' : 'High priority'">{{ t.priority === 'high' ? 'High' : 'Urgent' }}</span>
      <span class="tk-tools">
        <button v-if="!t.subtasks?.length && !done" type="button" class="ibtn ghost ai" :disabled="splitting" title="Break into steps with AI" :aria-label="`Break ${t.title} into steps`" data-test="row-breakdown" @click="split"><Icon :name="splitting ? 'refresh' : 'sparkle'" /></button>
        <button v-if="!done" type="button" class="ibtn ghost" title="Lock In: a timer for just this" :aria-label="`Lock in on ${t.title}`" @click="startFocus(t)"><Icon name="timer" /></button>
        <button type="button" class="ibtn ghost" title="Edit" :aria-label="`Edit ${t.title}`" @click="open = !open"><Icon name="edit" /></button>
        <button type="button" class="ibtn ghost danger" title="Delete (Delete key)" :aria-label="`Delete ${t.title}`" data-test="task-delete" @click="deleteTask(t)"><Icon name="trash" /></button>
      </span>
    </span>
    <TaskEditor v-if="open" :task="t" @close="open = false" />
  </li>
</template>
