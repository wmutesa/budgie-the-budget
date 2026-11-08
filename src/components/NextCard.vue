<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { suggestions } from '../lib/suggest';
import { makeTask, today, dayLabel, timeLabel, toggleDone, KINDS } from '../lib/tasks';
import { planGoal } from '../lib/goals';
import { startFocus } from '../lib/focus';
import { catColor } from '../lib/cats';
import { go } from '../lib/nav';
import { toast } from '../lib/toast';
import Icon from './Icon.vue';

// What's next: one list for everything coming up. Today's things in time
// order, this week's deadlines, and Budgie's ideas, each with one action.
const props = defineProps({ upNext: { type: Array, default: () => [] }, deadlines: { type: Array, default: () => [] } });
const SHOW = 6;
const all = ref(false);

const ideas = computed(() => { const seen = new Set(); return suggestions.value.filter(x => { const k = x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); });
const rows = computed(() => {
  const d = today();
  const todayIds = new Set(props.upNext.map(x => x.task.id));
  const now = props.upNext.map(x => ({ key: `t-${x.key}`, type: 'task', x, when: x.task.time ? timeLabel(x.task.time) : 'Today', title: x.task.title, sub: [KINDS[x.task.kind]?.label, x.task.project && `#${x.task.project}`, x.task.mins && `${x.task.mins} min`].filter(Boolean).join(' · '), color: catColor(x.task), hi: x.task.priority === 'high' }));
  const due = props.deadlines.filter(t => t.date > d && !todayIds.has(t.id)).map(t => ({ key: `d-${t.id}`, type: 'due', t, when: `Due ${dayLabel(t.date).replace(/^(\w{3})\w*/, '$1')}`, title: t.title, sub: [KINDS[t.kind]?.label, t.project && `#${t.project}`, t.time && timeLabel(t.time)].filter(Boolean).join(' · '), color: catColor(t), hi: t.priority === 'high' }));
  const idea = ideas.value.slice(0, 3).map(s => ({ key: `i-${s.id}`, type: 'idea', s, when: 'Idea', title: s.title, sub: s.why }));
  // Ideas sit after the next three things today, so what is happening now stays on top.
  return [...now.slice(0, 3), ...idea, ...now.slice(3), ...due];
});
const shown = computed(() => (all.value ? rows.value : rows.value.slice(0, SHOW)));
const moreToday = computed(() => Math.max(0, props.upNext.length - shown.value.filter(r => r.type === 'task').length));

function accept(s) {
  if (s.run) s.run();
  if (s.goal) planGoal(s.goal);
  if (s.task) store.tasks.unshift(makeTask({ ...s.task, source: 'suggestion' }));
  store.dismissed.push(s.id);
  toast(s.goal ? `Milestones planned for “${s.goal.title}”.` : s.run ? 'Done.' : 'Added to your schedule.', { kind: 'success' });
}
const dismiss = s => store.dismissed.push(s.id);
</script>

<template>
  <section class="card cell nx" data-test="today-list">
    <div class="nx-head">
      <p class="label">What's next</p>
      <span class="muted small">{{ upNext.length }} today · {{ deadlines.length }} due this week</span>
      <button type="button" class="ibtn ghost" title="Open the schedule" aria-label="Open the schedule" @click="go('Schedule')"><Icon name="calendar" /></button>
    </div>
    <ul v-if="rows.length" class="nx-list">
      <li v-for="r in shown" :key="r.key" class="nx-row" :class="`nx-${r.type}`" :style="r.color ? { '--k': r.color } : {}" :data-test="r.type === 'idea' ? 'suggestion' : 'task'">
        <span class="nx-when">{{ r.when }}</span>
        <span class="nx-main"><b>{{ r.title }}</b><span v-if="r.sub" class="muted small">{{ r.sub }}</span></span>
        <span v-if="r.hi" class="nx-hi">High</span>
        <span class="nx-acts">
          <template v-if="r.type === 'task'">
            <button type="button" class="ibtn ghost" title="Lock In" :aria-label="`Lock in on ${r.title}`" @click="startFocus(r.x.task)"><Icon name="timer" :size="15" /></button>
            <button type="button" class="ibtn ghost" title="Done" :aria-label="`Done: ${r.title}`" @click="toggleDone(r.x.task, r.x.date)"><Icon name="check" :size="15" /></button>
          </template>
          <template v-else-if="r.type === 'due'">
            <button type="button" class="ibtn ghost" title="Lock In" :aria-label="`Lock in on ${r.title}`" @click="startFocus(r.t)"><Icon name="timer" :size="15" /></button>
          </template>
          <template v-else>
            <button type="button" class="ibtn ghost" :title="r.s.run ? 'Do it' : 'Add to your schedule'" :aria-label="`Add: ${r.title}`" data-test="suggestion-add" @click="accept(r.s)"><Icon name="plus" :size="15" /></button>
            <button type="button" class="ibtn ghost" title="Not now" :aria-label="`Not now: ${r.title}`" @click="dismiss(r.s)"><Icon name="x" :size="15" /></button>
          </template>
        </span>
      </li>
    </ul>
    <p v-else class="empty-note">Nothing coming up. Suspiciously calm. Tap Add and say what is on your mind.</p>
    <p v-if="rows.length > SHOW" class="td-more">
      <button type="button" class="pln-more" data-test="today-more" @click="all = !all">{{ all ? 'Show less' : moreToday ? `${moreToday} more today` : `${rows.length - SHOW} more` }}</button>
      <button type="button" class="pln-more" @click="go('Schedule')">See the day</button>
    </p>
  </section>
</template>
