<script setup>
import { ref, computed } from 'vue';
import { store, newId } from '../lib/store';
import { KINDS, DAY_SHORT, isDone, toggleDone, removeTask, streak, timeLabel, dayLabel, today, urgency, nextOccurrence } from '../lib/tasks';
import { CATEGORIES } from '../lib/categorize';

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
const subDone = computed(() => (t.subtasks || []).filter(s => s.done).length);
const projects = computed(() => [...new Set(store.tasks.map(x => x.project).filter(Boolean))].sort());

const tick = () => toggleDone(t, day.value);
// Editing the repeat rule.
const repeatEvery = computed({
  get: () => t.repeat?.every || '',
  set: v => { t.repeat = v ? { every: v, days: v === 'week' ? (t.repeat?.days?.length ? t.repeat.days : [new Date(`${t.date || today()}T12:00`).getDay()]) : [] } : null; if (v && !t.date) t.date = today(); },
});
const toggleDay = d => { const s = new Set(t.repeat.days || []); s.has(d) ? s.delete(d) : s.add(d); t.repeat.days = [...s].sort(); };
const newSub = ref('');
const addSub = () => { const v = newSub.value.trim(); if (!v) return; (t.subtasks ||= []).push({ id: newId(), title: v, done: false }); newSub.value = ''; };
const setKind = v => { t.kind = v; t.kindSet = true; };
const remove = () => { if (confirm(`Delete "${t.title}"?`)) removeTask(t); };
</script>

<template>
  <li class="tk" :class="{ done, open, urgent, overdue }" :style="{ '--k': kind.color }" data-test="task">
    <button class="tk-check" type="button" role="checkbox" :aria-checked="done" :aria-label="`${done ? 'Undo' : 'Done'}: ${t.title}`" data-test="task-check" @click="tick">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button class="tk-main" type="button" :aria-expanded="open" @click="open = !open">
      <span class="tk-title">{{ t.title }}</span>
      <span class="tk-meta">
        <span v-if="when" class="tk-when" :class="{ late: overdue }">{{ overdue ? `Overdue · ${when}` : when }}</span>
        <span v-if="t.time">{{ timeLabel(t.time) }}<template v-if="t.mins"> · {{ t.mins >= 60 ? `${+(t.mins / 60).toFixed(1)} h` : `${t.mins} min` }}</template></span>
        <span class="tk-kind">{{ kind.label }}</span>
        <span v-if="t.project" class="tk-proj">#{{ t.project }}</span>
        <span v-if="repeatText" class="tk-rep">↻ {{ repeatText }}<b v-if="fire > 1" class="tk-fire" :title="`${fire} in a row`"> · {{ fire }} in a row</b></span>
        <span v-if="t.cost" class="tk-cost">${{ t.cost }}</span>
        <span v-if="t.subtasks?.length">{{ subDone }}/{{ t.subtasks.length }} steps</span>
        <span v-if="t.source === 'calendar'" class="tk-src">From calendar</span>
      </span>
    </button>
    <span v-if="t.priority === 'high' || urgent" class="tk-flag" :title="urgent && t.priority !== 'high' ? 'Budgie thinks this is urgent' : 'High priority'">{{ t.priority === 'high' ? 'High' : 'Urgent' }}</span>

    <div v-if="open" class="tk-edit" data-test="task-edit">
      <label class="tk-f wide"><span>Title</span><input v-model="t.title" maxlength="160" /></label>
      <label class="tk-f"><span>Date</span><input v-model="t.date" type="date" /></label>
      <label class="tk-f"><span>Time</span><input v-model="t.time" type="time" /></label>
      <label class="tk-f"><span>Minutes</span><input v-model.number="t.mins" type="number" min="0" step="5" /></label>
      <label class="tk-f"><span>Kind</span>
        <select :value="t.kind" @change="setKind($event.target.value)"><option v-for="(k, id) in KINDS" :key="id" :value="id">{{ k.label }}</option></select>
      </label>
      <div class="tk-f"><span>Priority</span>
        <div class="seg"><button v-for="p in ['high', 'medium', 'low']" :key="p" type="button" :class="{ on: t.priority === p }" @click="t.priority = p">{{ p[0].toUpperCase() + p.slice(1) }}</button></div>
      </div>
      <label class="tk-f"><span>Repeats</span>
        <select v-model="repeatEvery" data-test="task-repeat">
          <option value="">Does not repeat</option><option value="day">Every day</option><option value="weekdays">Weekdays</option><option value="week">Some days each week</option><option value="month">Every month</option>
        </select>
      </label>
      <div v-if="t.repeat?.every === 'week'" class="tk-f"><span>On</span>
        <div class="tk-days"><button v-for="(d, i) in DAY_SHORT" :key="d" type="button" :class="{ on: t.repeat.days?.includes(i) }" :aria-pressed="t.repeat.days?.includes(i)" @click="toggleDay(i)">{{ d[0] }}</button></div>
      </div>
      <label class="tk-f"><span>Project</span><input v-model="t.project" list="tk-projects" maxlength="40" placeholder="e.g. English 101" /></label>
      <datalist id="tk-projects"><option v-for="p in projects" :key="p" :value="p" /></datalist>
      <label class="tk-f"><span>Costs ($)</span><input v-model.number="t.cost" type="number" min="0" step="0.01" placeholder="—" data-test="task-cost" /></label>
      <label v-if="t.cost" class="tk-f"><span>Category</span>
        <select v-model="t.costCategory"><option value="">Guess for me</option><option v-for="c in CATEGORIES.filter(c => c !== 'Income')" :key="c" :value="c">{{ c }}</option></select>
      </label>
      <label class="tk-f wide"><span>Notes</span><textarea v-model="t.notes" rows="2" maxlength="1000" /></label>
      <div class="tk-f wide"><span>Steps</span>
        <ul class="tk-subs">
          <li v-for="s in t.subtasks" :key="s.id"><label><input v-model="s.done" type="checkbox" /> <input v-model="s.title" class="tk-sub-in" maxlength="120" /></label><button type="button" class="notice-link" :aria-label="`Remove ${s.title}`" @click="t.subtasks = t.subtasks.filter(x => x !== s)">×</button></li>
        </ul>
        <input v-model="newSub" placeholder="Add a step, then press Enter" maxlength="120" @keydown.enter.prevent="addSub" />
      </div>
      <p v-if="t.cost" class="muted small wide">When you tick this, ${{ t.cost }} goes to Transactions to review.</p>
      <div class="tk-acts wide">
        <a v-if="t.link" class="notice-link" :href="t.link" target="_blank" rel="noopener noreferrer">Open in calendar</a>
        <button type="button" class="btn small acct-danger" @click="remove">Delete</button>
        <button type="button" class="btn small" @click="open = false">Close</button>
      </div>
    </div>
  </li>
</template>
