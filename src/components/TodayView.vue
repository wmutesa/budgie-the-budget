<script setup>
import { computed, onMounted } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, dayLabel, timeLabel, toMins, streak, KINDS } from '../lib/tasks';
import { progress } from '../lib/goals';
import { go } from '../lib/nav';
import TaskRow from './TaskRow.vue';
import Icon from './Icon.vue';
import { deleteGoal } from '../lib/undo';

// Today: your day first (what is on, what is next, deadlines, streaks), then
// and your goals. Everything comes from your own planner.
const now = new Date();
const part = now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening';
const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
const d = today();
const items = computed(() => occurrences(d, d));
const left = computed(() => items.value.filter(x => !x.done));
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
  return items.value.length ? null : { text: 'A quiet day. Set a goal in the Playground to give it direction.', what: '', note: '' };
});
</script>

<template>
  <section class="card cell span-8 headline" id="today" data-test="today">
    <p class="label">{{ weekday }} brief</p>
    <p class="greet">Good <em>{{ part }}</em>.</p>
    <p v-if="empty" class="lede">Budgie starts empty. Say or type what is on your mind in the <b>Playground</b> or import your school calendar in the <b>Planner</b>.</p>
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
      <button type="button" class="btn small" @click="go('Planner')"><Icon name="planner" :size="14" />Planner</button>
      <button type="button" class="btn small" @click="go('Playground', { anchor: '#inbox' })"><Icon name="plus" :size="14" />Add something</button>
    </p>
  </section>

  <section class="card cell span-4 td-ring-card">
    <div class="cell-head"><p class="label">Today</p><span class="muted small">{{ items.length - left.length }} of {{ items.length }} done</span></div>
    <div class="pln-ring td-ring" :style="{ '--p': pct }" role="img" :aria-label="`${pct}% of today done`"><b>{{ pct }}%</b><span>done</span></div>
    <p v-if="habits.length" class="muted small td-habits">{{ habits.filter(h => items.some(x => x.task === h.t && x.done)).length }} of {{ habits.filter(h => items.some(x => x.task === h.t)).length }} habits today</p>
  </section>

  <section class="card cell span-8" data-test="today-list">
    <div class="cell-head"><p class="label">On today</p><button type="button" class="ibtn ghost" title="Open the calendar" aria-label="Open the calendar" @click="store.planner.view = 'Calendar'; go('Planner')"><Icon name="calendar" /></button></div>
    <ul v-if="items.length" class="tk-list"><TaskRow v-for="x in items" :key="x.key" :task="x.task" :date="x.date" :show-date="false" /></ul>
    <p v-else class="empty-note">Nothing on today. Write or say something in the Playground.</p>
  </section>

  <section class="card cell span-4" data-test="today-deadlines">
    <div class="cell-head"><p class="label">This week</p><span class="muted small">{{ deadlines.length }} deadlines</span></div>
    <ul v-if="deadlines.length" class="td-list">
      <li v-for="t in deadlines.slice(0, 6)" :key="t.id" :style="{ '--k': KINDS[t.kind].color }"><i /><span><b>{{ t.title }}</b><span class="muted small">{{ dayLabel(t.date) }}{{ t.time ? ` · ${timeLabel(t.time)}` : '' }}{{ t.project ? ` · #${t.project}` : '' }}</span></span></li>
    </ul>
    <p v-else class="empty-note">No assignments or exams due this week.</p>
  </section>

  <section class="card cell span-12" data-test="today-goals">
    <div class="cell-head"><p class="label">Goals</p><button type="button" class="ibtn ghost" title="Milestones in the Planner" aria-label="Milestones in the Planner" @click="go('Planner')"><Icon name="right" /></button></div>
    <ul v-if="goals.length" class="td-goals">
      <li v-for="x in goals" :key="x.g.id">
        <span class="td-goal-top"><b>{{ x.g.title }}</b><span class="muted small">{{ x.p.done }}/{{ x.p.all }}{{ x.g.by ? ` · ${x.p.daysLeft >= 0 ? `${x.p.daysLeft} days left` : 'past its date'}` : '' }}<button type="button" class="ibtn ghost danger td-goal-del" title="Delete goal" :aria-label="`Delete ${x.g.title}`" data-test="goal-delete" @click="deleteGoal(x.g)"><Icon name="trash" :size="14" /></button></span></span>
        <span class="td-bar"><i :style="{ width: `${x.p.pct}%`, background: x.g.color }" /></span>
        <span v-if="x.p.next" class="muted small">Next: {{ x.p.next.title }} · {{ dayLabel(x.p.next.date) }}</span>
      </li>
    </ul>
    <p v-else class="empty-note">No goals yet. In the Playground, write something like “I want to run a 10K by March” and Budgie plans the milestones.</p>
  </section>

</template>
