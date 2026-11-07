<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, dayLabel, timeLabel, toMins, streak, KINDS } from '../lib/tasks';
import { progress } from '../lib/goals';
import { digests, loadDigests } from '../lib/digest';
import { ai, aiAdvise } from '../lib/ai';
import { go } from '../lib/nav';
import TaskRow from './TaskRow.vue';
import Icon from './Icon.vue';

// Today: your day first (what is on, what is next, deadlines, streaks), then
// your goals and the latest digest. Everything comes from your own planner.
onMounted(() => { if (!digests.loaded) loadDigests(); });
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
const ed = computed(() => digests.viewing.main || digests.current);
const empty = computed(() => !store.tasks.length && !store.goals.length);
const pct = computed(() => (items.value.length ? Math.round(((items.value.length - left.value.length) / items.value.length) * 100) : 0));
// A one-line note from the on-device AI, when it is ready.
const said = ref('');
watch(() => ai.ready, async ready => {
  if (!ready || !store.tasks.length) return;
  const facts = [`Today: ${items.value.length} planned, ${items.value.length - left.value.length} done.`, next.value ? `Next: ${next.value.task.title} at ${timeLabel(next.value.task.time)}.` : 'Nothing else timed today.', `Deadlines this week: ${deadlines.value.map(t => `${t.title} ${t.date}`).join('; ') || 'none'}.`, `Overdue: ${overdue.value}.`, ...goals.value.map(x => `Goal ${x.g.title}: ${x.p.pct}% done.`)];
  said.value = (await aiAdvise(facts)) || '';
}, { immediate: true });
</script>

<template>
  <section class="card cell span-8 headline" id="today" data-test="today">
    <p class="label">{{ weekday }} brief</p>
    <p class="greet">Good <em>{{ part }}</em>.</p>
    <p v-if="empty" class="lede">Budgie starts empty. Say or type what is on your mind in the <b>Playground</b>, import your school calendar in the <b>Planner</b>, or set up your <b>Digest</b>.</p>
    <p v-else class="lede" data-test="brief">
      <template v-if="items.length">Today you have <mark class="m-violet">{{ items.length }} {{ items.length === 1 ? 'thing' : 'things' }}</mark> planned<template v-if="items.length - left.length">, {{ items.length - left.length }} done</template>. </template>
      <template v-else>Nothing is planned for today yet. </template>
      <template v-if="next">Next is <b>{{ next.task.title }}</b> at {{ timeLabel(next.task.time) }}. </template>
      <template v-if="deadlines.length"><mark class="m-pink">{{ deadlines.length }} {{ deadlines.length === 1 ? 'deadline' : 'deadlines' }}</mark> this week, first <b>{{ deadlines[0].title }}</b> {{ dayLabel(deadlines[0].date).toLowerCase() }}. </template>
      <template v-if="overdue"><mark class="m-amber">{{ overdue }} overdue</mark>. </template>
      <template v-if="best">Your {{ best.t.title.toLowerCase() }} streak is <mark class="m-green">{{ best.n }} days</mark>. </template>
    </p>
    <p v-if="said" class="ai-hint ai-brief" data-test="ai-brief"><span class="ai-spark" aria-hidden="true">✦</span>{{ said }} <span class="muted small">· {{ ai.used.advice }}</span></p>
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
    <p v-else class="empty-note">Nothing on today. Add something in the Playground or by voice with the microphone at the top.</p>
  </section>

  <section class="card cell span-4" data-test="today-deadlines">
    <div class="cell-head"><p class="label">This week</p><span class="muted small">{{ deadlines.length }} deadlines</span></div>
    <ul v-if="deadlines.length" class="td-list">
      <li v-for="t in deadlines.slice(0, 6)" :key="t.id" :style="{ '--k': KINDS[t.kind].color }"><i /><span><b>{{ t.title }}</b><span class="muted small">{{ dayLabel(t.date) }}{{ t.time ? ` · ${timeLabel(t.time)}` : '' }}{{ t.project ? ` · #${t.project}` : '' }}</span></span></li>
    </ul>
    <p v-else class="empty-note">No assignments or exams due this week.</p>
  </section>

  <section class="card cell span-6" data-test="today-goals">
    <div class="cell-head"><p class="label">Goals</p><button type="button" class="ibtn ghost" title="Open goals" aria-label="Open goals" @click="go('Playground', { anchor: '#goals' })"><Icon name="right" /></button></div>
    <ul v-if="goals.length" class="td-goals">
      <li v-for="x in goals" :key="x.g.id">
        <span class="td-goal-top"><b>{{ x.g.title }}</b><span class="muted small">{{ x.p.done }}/{{ x.p.all }}{{ x.g.by ? ` · ${x.p.daysLeft >= 0 ? `${x.p.daysLeft} days left` : 'past its date'}` : '' }}</span></span>
        <span class="td-bar"><i :style="{ width: `${x.p.pct}%`, background: x.g.color }" /></span>
        <span v-if="x.p.next" class="muted small">Next: {{ x.p.next.title }} · {{ dayLabel(x.p.next.date) }}</span>
      </li>
    </ul>
    <p v-else class="empty-note">No goals yet. In the Playground, write something like “I want to run a 10K by March” and Budgie plans the milestones.</p>
  </section>

  <section class="card cell span-6 td-digest" data-test="today-digest">
    <div class="cell-head"><p class="label">Latest digest</p><button type="button" class="ibtn ghost" title="Open digests" aria-label="Open digests" @click="go('Digests')"><Icon name="right" /></button></div>
    <template v-if="ed">
      <p class="dg-kick">{{ ed.edition }} · {{ ed.dateLong }}</p>
      <h3 v-if="ed.lead" class="td-dg-head">{{ ed.lead.headline }}</h3>
      <p class="muted small">{{ ed.preheader }}</p>
      <ul v-if="ed.deadlines?.length" class="td-list"><li v-for="x in ed.deadlines.slice(0, 3)" :key="x.ctaLink" style="--k: #a3181b"><i /><span><b>{{ x.name }}</b><span class="muted small">{{ dayLabel(x.date) }}</span></span></li></ul>
    </template>
    <p v-else class="empty-note">Set up your digest and Budgie writes you a brief of opportunities and news every Monday and Thursday.</p>
  </section>
</template>
