<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, fromIso, isoDay, toMins, KINDS, streak } from '../lib/tasks';
import { catKey, catLabel, catColor } from '../lib/cats';
import Icon from './Icon.vue';

// Reports: what got done, where the focus went, and what it says about how you
// work. Everything comes from your planner, ticks and focus sessions.
const RANGES = [['week', 'Week', 7], ['month', 'Month', 30], ['quarter', '3 months', 90]];
const range = ref('month');
const days = computed(() => RANGES.find(r => r[0] === range.value)[2]);
const to = computed(() => today());
const from = computed(() => addDays(to.value, -(days.value - 1)));
const inRange = d => d >= from.value && d <= to.value;
const dayOf = iso => isoDay(new Date(iso));

// Every scheduled thing in the range (one-offs and each repeat), plus done items with no date.
const occ = computed(() => {
  const list = occurrences(from.value, to.value);
  const undated = store.tasks.filter(t => !t.date && !t.repeat && t.done && t.doneAt && inRange(dayOf(t.doneAt))).map(t => ({ task: t, date: dayOf(t.doneAt), done: true, key: t.id }));
  return [...list, ...undated];
});
const done = computed(() => occ.value.filter(x => x.done));
const sessions = computed(() => (store.focusLog || []).filter(s => inRange(dayOf(s.at))));
const focusMins = computed(() => sessions.value.reduce((n, s) => n + (s.mins || 0), 0));
const hours = m => (m >= 60 ? `${+(m / 60).toFixed(1)} h` : `${m} min`);

// ---------- headline numbers ----------
const assignments = computed(() => done.value.filter(x => ['assignment', 'exam'].includes(x.task.kind)).length);
const onTime = computed(() => {
  const dated = done.value.filter(x => !x.task.repeat && x.task.date && x.task.doneAt);
  if (!dated.length) return null;
  return Math.round((dated.filter(x => dayOf(x.task.doneAt) <= x.task.date).length / dated.length) * 100);
});
const completion = computed(() => (occ.value.length ? Math.round((done.value.length / occ.value.length) * 100) : 0));
const stats = computed(() => [
  { label: 'Focus', value: hours(focusMins.value), sub: `${sessions.value.length} sessions`, icon: 'target' },
  { label: 'Done', value: done.value.length, sub: `${completion.value}% of what was planned`, icon: 'check' },
  { label: 'Assignments and exams', value: assignments.value, sub: 'completed', icon: 'steps' },
  { label: 'On time', value: onTime.value == null ? '–' : `${onTime.value}%`, sub: 'of dated tasks', icon: 'clock' },
]);

// ---------- by day ----------
const daily = computed(() => {
  const out = [];
  for (let i = 0; i < days.value; i++) {
    const d = addDays(from.value, i);
    out.push({ d, done: done.value.filter(x => x.date === d).length, focus: sessions.value.filter(s => dayOf(s.at) === d).reduce((n, s) => n + s.mins, 0) });
  }
  return out;
});
const maxDaily = computed(() => Math.max(1, ...daily.value.map(x => x.done)));
const maxFocus = computed(() => Math.max(1, ...daily.value.map(x => x.focus)));

// ---------- by category (#) ----------
const byCat = computed(() => {
  const m = new Map();
  const get = t => { const k = catKey(t); if (!m.has(k)) m.set(k, { key: k, label: catLabel(t), color: catColor(t), planned: 0, done: 0, focus: 0 }); return m.get(k); };
  for (const x of occ.value) { const c = get(x.task); c.planned++; if (x.done) c.done++; }
  for (const s of sessions.value) get({ project: s.project, kind: s.kind }).focus += s.mins;
  return [...m.values()].map(c => ({ ...c, rate: c.planned ? Math.round((c.done / c.planned) * 100) : 0 })).sort((a, b) => b.done - a.done || b.focus - a.focus);
});
const maxCat = computed(() => Math.max(1, ...byCat.value.map(c => c.done)));

// ---------- fun ways to slice it ----------
const PARTS = [['Early bird', 'before 9 AM', 0, 9], ['Morning', '9 AM to noon', 9, 12], ['Afternoon', 'noon to 5 PM', 12, 17], ['Evening', '5 to 9 PM', 17, 21], ['Night owl', 'after 9 PM', 21, 24]];
const partOf = h => PARTS.find(p => h >= p[2] && h < p[3])?.[0];
const byPart = computed(() => {
  const m = Object.fromEntries(PARTS.map(p => [p[0], { name: p[0], sub: p[1], done: 0, focus: 0 }]));
  for (const x of done.value) if (x.task.time) m[partOf(Math.floor(toMins(x.task.time) / 60))].done++;
  for (const s of sessions.value) m[partOf(new Date(s.at).getHours())].focus += s.mins;
  return Object.values(m);
});
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const byWeekday = computed(() => {
  const m = WEEK.map(n => ({ name: n, done: 0 }));
  for (const x of done.value) m[(fromIso(x.date).getDay() + 6) % 7].done++;
  return m;
});
const maxWeekday = computed(() => Math.max(1, ...byWeekday.value.map(x => x.done)));
const byKind = computed(() => Object.entries(KINDS).map(([k, v]) => ({ name: v.label, color: v.color, done: done.value.filter(x => x.task.kind === k).length })).filter(x => x.done).sort((a, b) => b.done - a.done));
const SIZES = [['Quick wins', 'under 30 min', 0, 30], ['Steady', '30 to 90 min', 30, 90], ['Deep work', '90 min or more', 90, 1e9]];
const bySize = computed(() => SIZES.map(([name, sub, a, b]) => ({ name, sub, done: done.value.filter(x => (x.task.mins || 0) >= a && (x.task.mins || 0) < b && (a > 0 || x.task.mins)).length })));
const streaks = computed(() => store.tasks.filter(t => t.repeat && t.kind === 'routine').map(t => ({ t, n: streak(t) })).filter(x => x.n > 1).sort((a, b) => b.n - a.n).slice(0, 3));

// ---------- what it says ----------
const conclusions = computed(() => {
  const out = [];
  const cats = byCat.value.filter(c => c.planned >= 3);
  const top = byCat.value[0];
  if (top?.done) out.push({ tone: 'good', text: `${top.label} is where most got done: ${top.done} things${top.focus ? ` and ${hours(top.focus)} of focus` : ''}.` });
  const slipping = [...cats].sort((a, b) => a.rate - b.rate)[0];
  if (slipping && slipping.rate < 60 && slipping !== top) out.push({ tone: 'warn', text: `${slipping.label} is slipping: ${slipping.rate}% of what was planned is done. Give it one session this week.` });
  const bestPart = [...byPart.value].sort((a, b) => (b.focus + b.done * 20) - (a.focus + a.done * 20))[0];
  if (bestPart && (bestPart.focus || bestPart.done)) out.push({ tone: 'info', text: `You are ${/^[aeiou]/i.test(bestPart.name) ? 'an' : 'a'} ${bestPart.name.toLowerCase()} person: that is when you focus and finish the most. Put hard things there.` });
  const bestDay = [...byWeekday.value].sort((a, b) => b.done - a.done)[0];
  const quietDay = [...byWeekday.value].sort((a, b) => a.done - b.done)[0];
  if (bestDay?.done) out.push({ tone: 'info', text: `${bestDay.name} is your strongest day${quietDay && quietDay.done < bestDay.done / 2 ? `, ${quietDay.name} the quietest` : ''}.` });
  if (onTime.value != null) out.push({ tone: onTime.value >= 75 ? 'good' : 'warn', text: onTime.value >= 75 ? `${onTime.value}% of dated tasks were done on time. Keep the rhythm.` : `Only ${onTime.value}% of dated tasks were done on time. Fewer things per day, with times, helps.` });
  const deep = bySize.value[2].done; const quick = bySize.value[0].done;
  if (deep + quick) out.push({ tone: 'info', text: deep > quick ? `You lean towards deep work: ${deep} long sessions against ${quick} quick wins.` : `Quick wins carry you: ${quick} short things done. Block one long session for the big ones.` });
  if (!focusMins.value) out.push({ tone: 'warn', text: 'No focus sessions yet. Start one from Focus: 25 minutes on one thing.' });
  return out.slice(0, 6);
});
const rangeLabel = computed(() => `${fromIso(from.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${fromIso(to.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
</script>

<template>
  <div class="rep span-12" data-test="reports">
    <section class="rep-head">
      <div>
        <p class="label">{{ rangeLabel }}</p>
        <h1>Reports</h1>
        <p class="pln-sum">What got done, where your focus went, and what it says about how you work.</p>
      </div>
      <div class="seg" role="group" aria-label="Range">
        <button v-for="[id, label] in RANGES" :key="id" type="button" :class="{ on: range === id }" :aria-pressed="range === id" :data-test="`rep-${id}`" @click="range = id">{{ label }}</button>
      </div>
    </section>

    <div class="rep-stats">
      <div v-for="s in stats" :key="s.label" class="rep-stat" data-test="rep-stat">
        <span class="rep-stat-ic"><Icon :name="s.icon" :size="15" /></span>
        <p class="label">{{ s.label }}</p>
        <b>{{ s.value }}</b>
        <span class="muted small">{{ s.sub }}</span>
      </div>
    </div>

    <div class="rep-grid">
      <section class="rep-card rep-wide">
        <h2>What it says</h2>
        <ul class="rep-says" data-test="rep-says">
          <li v-for="(c, i) in conclusions" :key="i" :class="c.tone">{{ c.text }}</li>
          <li v-if="!conclusions.length" class="info">Tick a few things and run a focus session, and Budgie will start drawing conclusions.</li>
        </ul>
      </section>

      <section class="rep-card rep-wide">
        <div class="rep-card-head"><h2>Every day</h2><span class="rep-key"><i class="k-done" />Done <i class="k-focus" />Focus</span></div>
        <div class="rep-days" :style="{ '--n': daily.length }" role="img" :aria-label="`Things done each day, ${rangeLabel}`">
          <div v-for="x in daily" :key="x.d" class="rep-day" :class="{ today: x.d === to }" :title="`${fromIso(x.d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${x.done} done, ${hours(x.focus)} focus`">
            <span class="rep-bars"><i class="b-done" :style="{ height: `${(x.done / maxDaily) * 100}%` }" /><i class="b-focus" :style="{ height: `${(x.focus / maxFocus) * 100}%` }" /></span>
            <span v-if="daily.length <= 31 && (daily.length <= 7 || fromIso(x.d).getDay() === 1)" class="rep-dl">{{ daily.length <= 7 ? fromIso(x.d).toLocaleDateString('en-US', { weekday: 'short' }) : fromIso(x.d).getDate() }}</span>
          </div>
        </div>
      </section>

      <section class="rep-card rep-wide" data-test="rep-cats">
        <h2>By category</h2>
        <ul class="rep-cats">
          <li v-for="c in byCat" :key="c.key" :style="{ '--c': c.color }">
            <span class="rep-cat-name"><i />{{ c.label }}</span>
            <span class="rep-cat-bar"><b :style="{ width: `${(c.done / maxCat) * 100}%` }" /></span>
            <span class="rep-cat-n"><b>{{ c.done }}</b> done</span>
            <span class="rep-cat-n muted">{{ c.rate }}%</span>
            <span class="rep-cat-n muted">{{ c.focus ? hours(c.focus) : '–' }}</span>
          </li>
        </ul>
        <p v-if="!byCat.length" class="muted small">Nothing in this range yet.</p>
      </section>

      <section class="rep-card">
        <h2>Time of day</h2>
        <ul class="rep-parts">
          <li v-for="p in byPart" :key="p.name"><span><b>{{ p.name }}</b><span class="muted small">{{ p.sub }}</span></span><span class="rep-pill">{{ p.done }} done</span><span class="rep-pill f">{{ hours(p.focus) }}</span></li>
        </ul>
      </section>

      <section class="rep-card">
        <h2>Day of the week</h2>
        <div class="rep-week" role="img" aria-label="Things done by day of the week">
          <div v-for="w in byWeekday" :key="w.name" class="rep-wk"><span class="rep-wk-bar"><i :style="{ height: `${(w.done / maxWeekday) * 100}%` }" /></span><b>{{ w.done }}</b><span class="muted small">{{ w.name }}</span></div>
        </div>
      </section>

      <section class="rep-card">
        <h2>Kind of thing</h2>
        <ul class="rep-kinds">
          <li v-for="k in byKind" :key="k.name" :style="{ '--c': k.color }"><i />{{ k.name }}<b>{{ k.done }}</b></li>
        </ul>
        <p v-if="!byKind.length" class="muted small">Nothing done in this range yet.</p>
      </section>

      <section class="rep-card">
        <h2>Size of task</h2>
        <ul class="rep-parts">
          <li v-for="s in bySize" :key="s.name"><span><b>{{ s.name }}</b><span class="muted small">{{ s.sub }}</span></span><span class="rep-pill">{{ s.done }} done</span></li>
        </ul>
        <template v-if="streaks.length">
          <h3 class="label rep-sub">Streaks</h3>
          <ul class="rep-kinds"><li v-for="x in streaks" :key="x.t.id" :style="{ '--c': catColor(x.t) }"><i />{{ x.t.title }}<b>{{ x.n }} days</b></li></ul>
        </template>
      </section>
    </div>
  </div>
</template>
