<script setup>
import EmojiPick from './EmojiPick.vue';
import { ref as emoRef } from 'vue';
const titleIn = emoRef(null);
import { ref, computed } from 'vue';
import { store, newId } from '../lib/store';
import { KINDS, DAY_SHORT, removeTask, today } from '../lib/tasks';
import { breakDown } from '../lib/breakdown';
import Icon from './Icon.vue';
import { deleteTask } from '../lib/undo';
import DateField from './DateField.vue';
import TimeField from './TimeField.vue';

// Every detail of one Planner item. Changes save as you type.
// headTitle: the card's own heading is the title, so no separate Title field.
const props = defineProps({ task: { type: Object, required: true }, headTitle: { type: Boolean, default: false } });
const emit = defineEmits(['close']);
const t = props.task;
const projects = computed(() => [...new Set(store.tasks.map(x => x.project).filter(Boolean))].sort());
const repeatEvery = computed({
  get: () => t.repeat?.every || '',
  set: v => { t.repeat = v ? { every: v, days: v === 'week' ? (t.repeat?.days?.length ? t.repeat.days : [new Date(`${t.date || today()}T12:00`).getDay()]) : [] } : null; if (v && !t.date) t.date = today(); },
});
const toggleDay = d => { const s = new Set(t.repeat.days || []); s.has(d) ? s.delete(d) : s.add(d); t.repeat.days = [...s].sort(); };
const newSub = ref('');
const addSub = () => { const v = newSub.value.trim(); if (!v) return; (t.subtasks ||= []).push({ id: newId(), title: v, done: false }); newSub.value = ''; };
const setKind = v => { t.kind = v; t.kindSet = true; };
const remove = () => { emit('close'); deleteTask(t); };
const splitting = ref(false);
const splitBy = ref('');
async function split() { splitting.value = true; splitBy.value = await breakDown(t); splitting.value = false; }
</script>

<template>
  <div class="tk-edit" data-test="task-edit">
    <div v-if="!headTitle" class="tk-f wide"><span>Title</span><div class="emo-row"><input aria-label="Title" ref="titleIn" v-model="t.title" maxlength="160" data-test="task-title" /><EmojiPick v-model="t.title" :input="titleIn" /></div></div>
    <div class="tk-f"><span>Date</span><DateField v-model="t.date" label="Date" placeholder="No date" /></div>
    <div class="tk-f"><span>Time</span><TimeField v-model="t.time" label="Time" /></div>
    <label class="tk-f"><span>Minutes</span><input v-model.number="t.mins" type="number" min="0" step="5" /></label>
    <label class="tk-f"><span>Kind</span>
      <select :value="t.kind" @change="setKind($event.target.value)"><option v-for="(k, id) in KINDS" :key="id" :value="id">{{ k.label }}</option></select>
    </label>
    <div class="tk-f"><span>Priority</span><span class="tk-ai-pri" :title="'Set by Taskie\'s AI from what you said and the deadline'" data-test="ai-priority">{{ { high: 'High', medium: 'Normal', low: 'Low' }[t.priority] || 'Normal' }} · by AI</span></div>
    <label class="tk-f"><span>Repeats</span>
      <select v-model="repeatEvery" data-test="task-repeat">
        <option value="">Does not repeat</option><option value="day">Every day</option><option value="weekdays">Weekdays</option><option value="week">Some days each week</option><option value="month">Every month</option>
      </select>
    </label>
    <div v-if="t.repeat?.every === 'week'" class="tk-f"><span>On</span>
      <div class="tk-days"><button v-for="(d, i) in DAY_SHORT" :key="d" type="button" :class="{ on: t.repeat.days?.includes(i) }" :aria-pressed="t.repeat.days?.includes(i)" :aria-label="d" @click="toggleDay(i)">{{ d[0] }}</button></div>
    </div>
    <label class="tk-f"><span>Project</span><input v-model="t.project" list="tk-projects" maxlength="40" placeholder="e.g. English 101" /></label>
    <datalist id="tk-projects"><option v-for="p in projects" :key="p" :value="p" /></datalist>
    <label v-if="store.goals.length" class="tk-f"><span>Goal</span>
      <select v-model="t.goalId" data-test="task-goal"><option :value="undefined">No goal</option><option v-for="g in store.goals" :key="g.id" :value="g.id">{{ g.title }}</option></select>
    </label>
    <label class="tk-f wide"><span>Notes</span><textarea v-model="t.notes" rows="2" maxlength="1000" /></label>
    <div class="tk-f wide">
      <span class="tk-steps-head">Steps
        <button type="button" class="ibtn ai tk-split" :class="{ spin: splitting }" :disabled="splitting" :title="splitting ? 'Thinking…' : 'Break it into steps'" :aria-label="splitting ? 'Thinking' : 'Break it into steps'" data-test="breakdown" @click="split"><Icon name="split" :size="15" /></button>
        <small v-if="splitBy" class="muted">by {{ splitBy }}</small>
      </span>
      <ul class="tk-subs">
        <li v-for="s in t.subtasks" :key="s.id"><label><input v-model="s.done" type="checkbox" /> <input v-model="s.title" class="tk-sub-in" maxlength="120" /></label><button type="button" class="ibtn ghost" :aria-label="`Remove ${s.title}`" title="Remove step" @click="t.subtasks = t.subtasks.filter(x => x !== s)"><Icon name="x" :size="14" /></button></li>
      </ul>
      <input v-model="newSub" placeholder="Add a step, then press Enter" maxlength="120" @keydown.enter.prevent="addSub" />
    </div>
    <div class="tk-acts wide">
      <a v-if="t.link" class="ibtn ghost" :href="t.link" target="_blank" rel="noopener noreferrer" title="Open in calendar" aria-label="Open in calendar"><Icon name="external" /></a>
      <button type="button" class="ibtn danger" title="Delete" aria-label="Delete" @click="remove"><Icon name="trash" /></button>
      <button type="button" class="ibtn" title="Close" aria-label="Close" @click="emit('close')"><Icon name="check" /></button>
    </div>
  </div>
</template>
