<script setup>
import { computed, onMounted } from 'vue';
import { store } from '../lib/store';
import { suggestions } from '../lib/suggest';
import { makeTask, today, dayLabel, timeLabel, toggleDone, KINDS } from '../lib/tasks';
import { planGoal } from '../lib/goals';
import { startFocus } from '../lib/focus';
import { catColor } from '../lib/cats';
import { go, nav } from '../lib/nav';
import { toast } from '../lib/toast';
import { aiIdeas, aiState, refreshIdeas, watchIdeas } from '../lib/nextideas';
import Icon from './Icon.vue';

// What's next: one list for everything coming up. Taskie's AI ideas on top
// (written fresh from your planner, refreshed as it changes), then today's
// things in time order and this week's deadlines, each with one action.
const props = defineProps({ upNext: { type: Array, default: () => [] }, deadlines: { type: Array, default: () => [] } });
onMounted(watchIdeas);

const ideas = computed(() => {
  const ai = aiIdeas.value.filter(x => !store.dismissed.includes(x.id)).map(x => ({ ...x, ai: true }));
  // The built-in ideas only when the AI has nothing to say (offline, or still thinking the first time).
  const rules = ai.length ? [] : suggestions.value;
  const seen = new Set();
  return [...ai, ...rules].filter(x => { const k = x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
});
const short = d => dayLabel(d).replace(/^(\w{3})\w*/, '$1');
const rows = computed(() => {
  const d = today();
  const todayIds = new Set(props.upNext.map(x => x.task.id));
  const now = props.upNext.slice(0, 3).map(x => ({ key: `t-${x.key}`, type: 'task', x, tag: x.task.time ? timeLabel(x.task.time) : 'Today', meta: [KINDS[x.task.kind]?.label, x.task.project && `#${x.task.project}`, x.task.mins && `${x.task.mins} min`].filter(Boolean).join(' · '), title: x.task.title, color: catColor(x.task), hi: x.task.priority === 'high' }));
  const due = props.deadlines.filter(t => t.date > d && !todayIds.has(t.id)).slice(0, 2).map(t => ({ key: `d-${t.id}`, type: 'due', t, tag: `Due ${short(t.date)}`, meta: [KINDS[t.kind]?.label, t.project && `#${t.project}`, t.time && timeLabel(t.time)].filter(Boolean).join(' · '), title: t.title, color: catColor(t), hi: t.priority === 'high' }));
  const idea = ideas.value.map(s => ({ key: `i-${s.id}`, type: 'idea', s, tag: s.ai ? 'Taskie suggests' : 'Idea', meta: s.why, title: s.title }));
  return [...idea, ...now, ...due];
});
const moreToday = computed(() => Math.max(0, props.upNext.length - 3));

function accept(s) {
  if (s.ai) {
    if (s.action === 'overdue') { const d = today(); store.tasks.filter(t => !t.repeat && !t.done && t.date && t.date < d).forEach(t => { t.date = d; }); }
    else if (s.task) store.tasks.unshift(makeTask({ title: s.task.title, date: s.task.date || today(), time: s.task.time || '', mins: s.task.mins || 30, kind: s.task.kind || 'task', source: 'suggestion' }));
    store.dismissed.push(s.id);
    toast(s.action === 'overdue' ? 'Overdue things moved to today.' : 'Added to your schedule.', { kind: 'success' });
    return;
  }
  if (s.run) s.run();
  if (s.goal) planGoal(s.goal);
  if (s.task) store.tasks.unshift(makeTask({ ...s.task, source: 'suggestion' }));
  store.dismissed.push(s.id);
  toast(s.goal ? `Milestones planned for “${s.goal.title}”.` : s.run ? 'Done.' : 'Added to your schedule.', { kind: 'success' });
}
const canDo = s => !s.ai || s.action === 'overdue' || !!s.task;
const dismiss = s => store.dismissed.push(s.id);
function openDay() { store.planner.cal = 'day'; nav.day = ''; go('Schedule'); }
</script>

<template>
  <section class="card cell nx" data-test="today-list">
    <div class="nx-head">
      <p class="label">What's next</p>
      <button type="button" class="ibtn ghost nx-refresh" :class="{ spin: aiState === 'loading' }" :title="aiState === 'loading' ? 'Thinking…' : 'New ideas'" aria-label="New ideas" data-test="next-refresh" @click="refreshIdeas({ force: true })"><Icon name="refresh" :size="14" /></button>
    </div>
    <ul v-if="rows.length" class="nx-list">
      <li v-for="r in rows" :key="r.key" class="nx-row" :class="`nx-${r.type}`" :style="r.color ? { '--k': r.color } : {}" :data-test="r.type === 'idea' ? 'suggestion' : 'task'">
        <span class="nx-main">
          <span class="nx-tag"><Icon v-if="r.type === 'idea'" name="sparkle" :size="11" />{{ r.tag }}<b v-if="r.hi" class="nx-hi">High</b></span>
          <b class="nx-title">{{ r.title }}</b>
          <span v-if="r.meta" class="nx-meta">{{ r.meta }}</span>
        </span>
        <span class="nx-acts">
          <template v-if="r.type === 'task'">
            <button type="button" class="ibtn ghost" title="Lock In" :aria-label="`Lock in on ${r.title}`" @click="startFocus(r.x.task)"><Icon name="timer" :size="15" /></button>
            <button type="button" class="ibtn ghost" title="Done" :aria-label="`Done: ${r.title}`" @click="toggleDone(r.x.task, r.x.date)"><Icon name="check" :size="15" /></button>
          </template>
          <button v-else-if="r.type === 'due'" type="button" class="ibtn ghost" title="Lock In" :aria-label="`Lock in on ${r.title}`" @click="startFocus(r.t)"><Icon name="timer" :size="15" /></button>
          <template v-else>
            <button v-if="canDo(r.s)" type="button" class="ibtn ghost" :title="r.s.run || r.s.action === 'overdue' ? 'Do it' : 'Add to your schedule'" :aria-label="`Add: ${r.title}`" data-test="suggestion-add" @click="accept(r.s)"><Icon name="plus" :size="15" /></button>
            <button type="button" class="ibtn ghost" title="Not now" :aria-label="`Not now: ${r.title}`" @click="dismiss(r.s)"><Icon name="x" :size="15" /></button>
          </template>
        </span>
      </li>
    </ul>
    <p v-else class="empty-note">Nothing coming up. Suspiciously calm. Tap Add and say what is on your mind.</p>
    <button v-if="upNext.length" type="button" class="nx-more" data-test="today-more" @click="openDay">
      <span>{{ moreToday ? `${moreToday} more today` : 'All of today' }}</span><span class="muted">See the day</span><Icon name="right" :size="15" />
    </button>
  </section>
</template>
