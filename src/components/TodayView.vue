<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, dayLabel, timeLabel, toMins, streak, KINDS } from '../lib/tasks';
import { progress } from '../lib/goals';
import { go } from '../lib/nav';
import TaskRow from './TaskRow.vue';
import Icon from './Icon.vue';
import PlanSuggest from './PlanSuggest.vue';
import { deleteGoal } from '../lib/undo';
import { capture } from '../lib/capture';

// Today: your day first (what is on, what is next, deadlines, streaks), then
// and your goals. Everything comes from your own planner.
const now = new Date();
const part = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening';
const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
const d = today();
const items = computed(() => occurrences(d, d));
const left = computed(() => items.value.filter(x => !x.done));
// The list stays short: what is next first, the rest behind one tap.
const SHOW = 5;
const allOpen = ref(false);
const showDone = ref(false);
const upNext = computed(() => {
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  const rank = x => (x.task.time ? (toMins(x.task.time) + (x.task.mins || 30) < m ? 2000 + toMins(x.task.time) : toMins(x.task.time)) : 1500);
  return [...left.value].sort((a, b) => rank(a) - rank(b));
});
const shown = computed(() => (allOpen.value ? upNext.value : upNext.value.slice(0, SHOW)));
const next = computed(() => { const m = new Date().getHours() * 60 + new Date().getMinutes(); return left.value.find(x => x.task.time && toMins(x.task.time) >= m) || null; });
const deadlines = computed(() => store.tasks.filter(t => !t.repeat && !t.done && ['assignment', 'exam'].includes(t.kind) && t.date >= d && t.date <= addDays(d, 7)).sort((a, b) => a.date.localeCompare(b.date)));
const overdue = computed(() => store.tasks.filter(t => !t.repeat && !t.done && t.date && t.date < d).length);
const habits = computed(() => store.tasks.filter(t => t.repeat && t.kind === 'routine').map(t => ({ t, n: streak(t) })).sort((a, b) => b.n - a.n));
const best = computed(() => habits.value.find(h => h.n >= 3) || null);
const goals = computed(() => store.goals.map(g => ({ g, p: progress(g) })));
const empty = computed(() => !store.tasks.length && !store.goals.length);
const pct = computed(() => (items.value.length ? Math.round(((items.value.length - left.value.length) / items.value.length) * 100) : 0));
// One next step, from your own data (no AI, so nothing is made up): what is
// overdue first; otherwise, on a light day, the next milestone of the goal
// furthest behind.
const nextStep = computed(() => {
  const late = store.tasks.filter(t => !t.repeat && !t.done && t.date && t.date < d).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (late) return { text: 'Start with', what: late.title, note: 'overdue' };
  if (next.value || deadlines.value.some(t => t.date === d)) return null;
  const behind = goals.value.filter(x => x.p.next).sort((a, b) => a.p.pct - b.p.pct)[0];
  if (behind) return { text: left.value.length ? 'When you have a moment:' : 'A quiet day. Good time for', what: behind.p.next.title, note: behind.g.title };
  return items.value.length ? null : { text: 'A quiet day. Tap Add to set a goal and give it direction.', what: '', note: '' };
});
</script>

<template>
  <div class="td-col td-main span-8">
  <section class="card cell headline" id="today" data-test="today">
    <p class="label">{{ weekday }} brief</p>
    <p class="greet">Good <em>{{ part }}</em>.</p>
    <p v-if="empty" class="lede">Budgie starts empty. Tap <b>Add</b> and say what is on your mind, or bring in your school calendar from the <b>Planner</b>.</p>
    <p v-else class="lede" data-test="brief">
      <template v-if="items.length">Today you have <mark class="m-violet">{{ items.length }} {{ items.length === 1 ? 'thing' : 'things' }}</mark> planned<template v-if="items.length - left.length">, {{ items.length - left.length }} done</template>. </template>
      <template v-else>Nothing is planned for today yet. </template>
      <template v-if="next">Next is <b>{{ next.task.title }}</b> at {{ timeLabel(next.task.time) }}. </template>
      <template v-if="deadlines.length"><mark class="m-pink">{{ deadlines.length }} {{ deadlines.length === 1 ? 'deadline' : 'deadlines' }}</mark> this week, first <b>{{ deadlines[0].title }}</b> {{ dayLabel(deadlines[0].date).toLowerCase() }}. </template>
      <template v-if="overdue"><mark class="m-amber">{{ overdue }} overdue</mark>. </template>
      <template v-if="best">Your {{ best.t.title.toLowerCase() }} streak is <mark class="m-green">{{ best.n }} days</mark>. </template>
      <template v-if="nextStep">{{ nextStep.text }}<template v-if="nextStep.what">{{ ' ' }}<b>{{ nextStep.what }}</b> <span class="lede-note">({{ nextStep.note }})</span></template>. </template>
    </p>
    <p class="brief-acts">
      <button type="button" class="btn small primary" data-test="today-add" @click="capture.open = true"><Icon name="capture" :size="16" />Add something</button>
      <button type="button" class="btn small" @click="go('Planner')"><Icon name="planner" :size="16" />Open Planner</button>
    </p>
  </section>
  <section class="card cell" data-test="today-list">
    <div class="cell-head"><p class="label">Up next</p><button type="button" class="ibtn ghost" title="Open the schedule" aria-label="Open the schedule" @click="store.planner.view = 'Schedule'; go('Planner')"><Icon name="calendar" /></button></div>
    <ul v-if="left.length" class="tk-list"><TaskRow v-for="x in shown" :key="x.key" :task="x.task" :date="x.date" :show-date="false" /></ul>
    <p v-else-if="items.length" class="empty-note">All done for today.</p>
    <p v-if="items.length" class="td-more">
      <button v-if="upNext.length > SHOW" type="button" class="pln-more" data-test="today-more" @click="allOpen = !allOpen">{{ allOpen ? 'Show fewer' : `${upNext.length - SHOW} more today` }}</button>
      <button v-if="items.length - left.length" type="button" class="pln-more" :aria-expanded="showDone" @click="showDone = !showDone">{{ showDone ? 'Hide done' : `${items.length - left.length} done` }}</button>
      <button type="button" class="pln-more" @click="store.planner.view = 'Schedule'; go('Planner')">See the day</button>
    </p>
    <ul v-if="showDone" class="tk-list"><TaskRow v-for="x in items.filter(y => y.done)" :key="x.key" :task="x.task" :date="x.date" :show-date="false" /></ul>
    <p v-if="!items.length" class="empty-note">Nothing on today. Tap Add and say what is coming up.</p>
  </section>
  </div>
  <div class="td-col td-side span-4">
  <section class="card cell td-ring-card">
    <div class="cell-head"><p class="label">Today</p><span class="muted small">{{ items.length - left.length }} of {{ items.length }} done</span></div>
    <div class="pln-ring td-ring" :style="{ '--p': pct }" role="img" :aria-label="`${pct}% of today done`"><b>{{ pct }}%</b><span>done</span></div>
    <p v-if="habits.length" class="muted small td-habits">{{ habits.filter(h => items.some(x => x.task === h.t && x.done)).length }} of {{ habits.filter(h => items.some(x => x.task === h.t)).length }} habits today</p>
  </section>
  <div class="card cell td-sugg"><PlanSuggest /></div>
  <section class="card cell" data-test="today-goals">
    <div class="cell-head"><p class="label">Goals</p><button type="button" class="ibtn ghost" title="Milestones in the Planner" aria-label="Milestones in the Planner" @click="go('Planner')"><Icon name="right" /></button></div>
    <ul v-if="goals.length" class="td-goals">
      <li v-for="x in goals" :key="x.g.id" :class="{ pending: x.g.pending }" :data-goal-id="x.g.id">
        <span class="td-goal-top"><b>{{ x.g.title }}</b><span class="muted small">{{ x.p.done }}/{{ x.p.all }}{{ x.g.by ? ` · ${x.p.daysLeft >= 0 ? `${x.p.daysLeft} days left` : 'past its date'}` : '' }}<button type="button" class="ibtn ghost danger td-goal-del" title="Delete goal" :aria-label="`Delete ${x.g.title}`" data-test="goal-delete" @click="deleteGoal(x.g)"><Icon name="trash" :size="14" /></button></span></span>
        <span class="td-bar"><i :style="{ width: `${x.p.pct}%`, background: x.g.color }" /></span>
        <span v-if="x.p.next" class="muted small">Next: {{ x.p.next.title }} · {{ dayLabel(x.p.next.date) }}</span>
      </li>
    </ul>
    <p v-else class="empty-note">No goals yet. Tap Add and say something like “I want to run a 10K by March”; Budgie plans the milestones.</p>
  </section>
  <section class="card cell" data-test="today-deadlines">
    <div class="cell-head"><p class="label">This week</p><span class="muted small">{{ deadlines.length }} deadlines</span></div>
    <ul v-if="deadlines.length" class="td-list">
      <li v-for="t in deadlines.slice(0, 6)" :key="t.id" :style="{ '--k': KINDS[t.kind].color }"><i /><span><b>{{ t.title }}</b><span class="muted small">{{ dayLabel(t.date) }}{{ t.time ? ` · ${timeLabel(t.time)}` : '' }}{{ t.project ? ` · #${t.project}` : '' }}</span></span></li>
    </ul>
    <p v-else class="empty-note">No assignments or exams due this week.</p>
  </section>
  </div>





</template>
