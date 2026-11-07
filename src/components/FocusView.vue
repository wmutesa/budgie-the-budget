<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { openTasks, occurrences, summary, today, addDays, dayLabel, timeLabel, toMins, toggleDone, KINDS, streak } from '../lib/tasks';
import TaskRow from './TaskRow.vue';
import PlanSuggest from './PlanSuggest.vue';
import Icon from './Icon.vue';
import { focus, startFocus, finishFocus, stopFocus, mmss } from '../lib/focus';

// Focus: what matters now. Its own page, with Budgie's suggestions as the
// right side bar, top to bottom.
const now = ref(today());
const clock = ref(new Date());
let tick = null;
onMounted(() => { tick = setInterval(() => { clock.value = new Date(); now.value = today(); }, 30000); });
onUnmounted(() => clearInterval(tick));

const todayItems = computed(() => occurrences(now.value, now.value));
const progress = computed(() => { const all = todayItems.value.length; const done = todayItems.value.filter(x => x.done).length; return { all, done, pct: all ? Math.round((done / all) * 100) : 0 }; });
const nowItem = computed(() => {
  const m = clock.value.getHours() * 60 + clock.value.getMinutes();
  const timed = todayItems.value.filter(x => x.task.time && !x.done);
  const current = timed.find(x => toMins(x.task.time) <= m && m < toMins(x.task.time) + (x.task.mins || 30));
  if (current) return { label: 'Now', item: current };
  const next = timed.find(x => toMins(x.task.time) > m);
  return next ? { label: `Next at ${timeLabel(next.task.time)}`, item: next } : null;
});
const top3 = computed(() => openTasks(now.value).filter(t => t.kind !== 'routine' && !(t.repeat && t.kind === 'class')).filter(t => !t.date || t.date <= addDays(now.value, 3) || t.priority === 'high').slice(0, 3));
const routineToday = computed(() => todayItems.value.filter(x => x.task.kind === 'routine'));
const best = computed(() => Math.max(0, ...routineToday.value.map(x => streak(x.task))));
const greeting = computed(() => { const h = clock.value.getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; });
</script>

<template>
  <div class="pln fcs span-12" data-test="focus-page">
    <div class="fcs-main">
      <section class="pln-head">
        <div>
          <p class="label">{{ greeting }}</p>
          <h1>Focus</h1>
          <p class="pln-sum">{{ summary(now) }}</p>
        </div>
      </section>
      <div class="pln-main">
        <div class="pln-focus" data-test="focus">
          <div class="pln-ring" :style="{ '--p': progress.pct }" role="img" :aria-label="`${progress.done} of ${progress.all} done today`">
            <b>{{ progress.done }}/{{ progress.all }}</b><span>done today</span>
          </div>
          <div v-if="nowItem" class="pln-now">
            <p class="label">{{ nowItem.label }}</p>
            <h2>{{ nowItem.item.task.title }}</h2>
            <button type="button" class="ibtn primary" title="Mark done" aria-label="Mark done" @click="toggleDone(nowItem.item.task, nowItem.item.date)"><Icon name="check" /></button>
          </div>
          <div v-else class="pln-now"><p class="label">Now</p><h2>Free time</h2><p class="muted small">Nothing else is scheduled today.</p></div>
        </div>
        <div v-if="focus.task" class="pln-timer" data-test="timer">
          <span class="label">Focusing on</span><b>{{ focus.task.title }}</b>
          <span class="pln-clock">{{ mmss(focus.left) }}</span>
          <button type="button" class="ibtn" :title="focus.running ? 'Pause' : 'Resume'" :aria-label="focus.running ? 'Pause' : 'Resume'" @click="focus.running = !focus.running"><Icon :name="focus.running ? 'pause' : 'play'" /></button>
          <button type="button" class="ibtn primary" title="Mark done" aria-label="Mark done" @click="finishFocus"><Icon name="check" /></button>
          <button type="button" class="ibtn" title="Stop" aria-label="Stop" @click="stopFocus"><Icon name="x" /></button>
        </div>
        <div class="pln-group">
          <h2 class="pln-gh">Top three</h2>
          <ol v-if="top3.length" class="pln-top">
            <li v-for="t in top3" :key="t.id">
              <span class="pln-top-t"><b>{{ t.title }}</b><span class="muted small">{{ t.date ? dayLabel(t.date, now) : 'Any time' }}{{ t.time ? ` · ${timeLabel(t.time)}` : '' }} · {{ KINDS[t.kind].label }}</span></span>
              <button type="button" class="ibtn" title="Focus for 25 minutes" :aria-label="`Focus on ${t.title}`" data-test="top-focus" @click="startFocus(t)"><Icon name="play" /></button>
              <button type="button" class="ibtn primary" title="Mark done" :aria-label="`Done: ${t.title}`" @click="toggleDone(t)"><Icon name="check" /></button>
            </li>
          </ol>
          <p v-else class="muted small">Nothing urgent. Enjoy it, or pick something from Later.</p>
        </div>
        <div v-if="routineToday.length" class="pln-group">
          <h2 class="pln-gh">Routine today</h2>
          <ul class="tk-list"><TaskRow v-for="x in routineToday" :key="x.key" :task="x.task" :date="x.date" :show-date="false" /></ul>
          <p v-if="best > 1" class="muted small">Best streak: {{ best }} days in a row.</p>
        </div>
      </div>
    </div>
    <!-- Suggestions fill the whole right side, top to bottom -->
    <aside class="fcs-side" aria-label="Suggestions"><PlanSuggest /></aside>
  </div>
</template>
