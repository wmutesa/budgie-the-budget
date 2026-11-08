<script setup>
import { ref, computed, watch } from 'vue';
import { store } from '../lib/store';
import { openTasks, today, addDays, isoDay, timeLabel } from '../lib/tasks';
import { focus, startFocus } from '../lib/focus';
import Icon from './Icon.vue';

// The Focus page's side bar: how much you have focused, a quick way to start
// a session of the length you want, and today's sessions.
const LENGTHS = [15, 25, 50];
const mins = ref(25);
const now = computed(() => today());
const log = computed(() => store.focusLog || []);
const dayOf = x => isoDay(new Date(x.at));
const minsOn = d => log.value.filter(x => dayOf(x) === d).reduce((n, x) => n + (x.mins || 0), 0);

const todayMins = computed(() => minsOn(now.value));
const todaySessions = computed(() => log.value.filter(x => dayOf(x) === now.value).slice().reverse());
// The last seven days, oldest first, for the bars.
const week = computed(() => Array.from({ length: 7 }, (_, i) => { const d = addDays(now.value, i - 6); return { d, m: minsOn(d), label: new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'narrow' }) }; }));
const weekMins = computed(() => week.value.reduce((n, x) => n + x.m, 0));
const top = computed(() => Math.max(25, ...week.value.map(x => x.m)));
// Days in a row with at least one session, counting today only once it has one.
const streak = computed(() => { let n = 0; let d = minsOn(now.value) ? now.value : addDays(now.value, -1); while (minsOn(d)) { n++; d = addDays(d, -1); } return n; });
const hm = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

// What to focus on: open things, most pressing first.
const choices = computed(() => openTasks(now.value).filter(t => t.kind !== 'routine').slice(0, 12));
const pick = ref('');
watch(choices, c => { if (!c.some(t => t.id === pick.value)) pick.value = c[0]?.id || ''; }, { immediate: true });
const start = () => { const t = choices.value.find(x => x.id === pick.value); if (t) startFocus(t, mins.value); };
</script>

<template>
  <section class="pln-card fsd" data-test="focus-side">
    <div class="pln-card-head"><h2>Your focus</h2></div>

    <div class="fsd-stats">
      <div><b data-test="focus-today">{{ hm(todayMins) }}</b><span>today</span></div>
      <div><b>{{ hm(weekMins) }}</b><span>last 7 days</span></div>
      <div><b>{{ streak }}</b><span>{{ streak === 1 ? 'day' : 'days' }} in a row</span></div>
    </div>

    <div class="fsd-bars" role="img" :aria-label="`Minutes focused, last seven days: ${week.map(x => x.m).join(', ')}`">
      <span v-for="x in week" :key="x.d" :class="{ on: x.d === now }" :title="`${x.d}: ${hm(x.m)}`"><i :style="{ height: `${Math.max(4, (x.m / top) * 100)}%` }" /><small>{{ x.label }}</small></span>
    </div>

    <div class="fsd-start">
      <p class="label">Start a session</p>
      <template v-if="choices.length">
        <select v-model="pick" aria-label="What to focus on" data-test="focus-pick">
          <option v-for="t in choices" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
        <div class="fsd-lens" role="radiogroup" aria-label="How long">
          <button v-for="m in LENGTHS" :key="m" type="button" role="radio" :aria-checked="mins === m" :class="{ on: mins === m }" :data-test="`focus-len-${m}`" @click="mins = m">{{ m }} min</button>
        </div>
        <button type="button" class="btn primary fsd-go" :disabled="!pick" data-test="focus-start" @click="start"><Icon name="play" :size="14" />{{ focus.task ? 'Switch to this' : `Focus for ${mins} minutes` }}</button>
      </template>
      <p v-else class="muted small">Nothing open to focus on. Add something first.</p>
    </div>

    <div class="fsd-log">
      <p class="label">Today's sessions</p>
      <ul v-if="todaySessions.length" data-test="focus-log">
        <li v-for="x in todaySessions" :key="x.id"><span>{{ x.title }}</span><small>{{ x.mins }} min · {{ timeLabel(new Date(x.at).toTimeString().slice(0, 5)) }}</small></li>
      </ul>
      <p v-else class="muted small">No sessions yet today. Even 15 minutes counts.</p>
    </div>
  </section>
</template>
