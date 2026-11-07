<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, fromIso, isoDay, toMins, streak } from '../lib/tasks';
import { catKey, catLabel, catColor } from '../lib/cats';
import Icon from './Icon.vue';

// Reports: what got done, where the focus went, and what it says about how you
// work, compared with the period before. Mostly words and simple comparisons;
// one calm chart for the days, and a heatmap for when you work best.
const RANGES = [['week', 'Week', 7], ['month', 'Month', 30], ['quarter', '3 months', 90]];
const range = ref('month');
const rangeName = computed(() => ({ week: 'week', month: 'month', quarter: 'three months' })[range.value]);
const days = computed(() => RANGES.find(r => r[0] === range.value)[2]);
const to = computed(() => today());
const from = computed(() => addDays(to.value, -(days.value - 1)));
const prevTo = computed(() => addDays(from.value, -1));
const prevFrom = computed(() => addDays(prevTo.value, -(days.value - 1)));
const dayOf = iso => isoDay(new Date(iso));
const short = d => fromIso(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const longDay = d => fromIso(d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const hours = m => (m >= 60 ? `${+(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Everything planned and done between two days (one-offs, each repeat, and done items with no date).
function period(a, b) {
  const inR = d => d >= a && d <= b;
  const occ = [...occurrences(a, b), ...store.tasks.filter(t => !t.date && !t.repeat && t.done && t.doneAt && inR(dayOf(t.doneAt))).map(t => ({ task: t, date: dayOf(t.doneAt), done: true, key: t.id }))];
  const done = occ.filter(x => x.done);
  const sessions = (store.focusLog || []).filter(s => inR(dayOf(s.at)));
  const dated = done.filter(x => !x.task.repeat && x.task.date && x.task.doneAt);
  return {
    occ, done, sessions,
    focus: sessions.reduce((n, s) => n + (s.mins || 0), 0),
    assign: done.filter(x => ['assignment', 'exam'].includes(x.task.kind)).length,
    onTime: dated.length ? Math.round((dated.filter(x => dayOf(x.task.doneAt) <= x.task.date).length / dated.length) * 100) : null,
    rate: occ.length ? Math.round((done.length / occ.length) * 100) : 0,
  };
}
const cur = computed(() => period(from.value, to.value));
const prev = computed(() => period(prevFrom.value, prevTo.value));
const hasPrev = computed(() => prev.value.occ.length > 0 || prev.value.sessions.length > 0);
// Change against the period before; null when there was nothing to compare with.
const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const pct = d => (d == null ? 'new' : `${d >= 0 ? '+' : ''}${d}%`);

// ---------- per day ----------
const daily = computed(() => Array.from({ length: days.value }, (_, i) => {
  const d = addDays(from.value, i);
  const occ = cur.value.occ.filter(x => x.date === d);
  return { d, done: occ.filter(x => x.done).length, planned: occ.length, focus: cur.value.sessions.filter(s => dayOf(s.at) === d).reduce((n, s) => n + s.mins, 0) };
}));
const maxDaily = computed(() => Math.max(1, ...daily.value.map(x => x.done)));
const activeDays = computed(() => daily.value.filter(x => x.done).length);
const avg = computed(() => (activeDays.value ? +(cur.value.done.length / days.value).toFixed(1) : 0));
const best = computed(() => [...daily.value].sort((a, b) => b.done - a.done || b.focus - a.focus)[0]);
const dayLabelEvery = computed(() => (days.value <= 7 ? 1 : days.value <= 31 ? 7 : 14));

// ---------- categories, as text ----------
const byCat = computed(() => {
  const m = new Map();
  const get = t => { const k = catKey(t); if (!m.has(k)) m.set(k, { key: k, label: catLabel(t), color: catColor(t), planned: 0, done: 0, focus: 0 }); return m.get(k); };
  for (const x of cur.value.occ) { const c = get(x.task); c.planned++; if (x.done) c.done++; }
  for (const s of cur.value.sessions) get({ project: s.project, kind: s.kind }).focus += s.mins;
  return [...m.values()].filter(c => c.planned || c.focus).map(c => ({ ...c, rate: c.planned ? Math.round((c.done / c.planned) * 100) : 0 })).sort((a, b) => b.done - a.done || b.focus - a.focus);
});
// The share bar: the top four and the rest as Other, in light tints.
const shares = computed(() => {
  const n = cur.value.done.length;
  const list = byCat.value.filter(c => c.done);
  const top = list.slice(0, 4).map(c => ({ label: c.label, color: c.color, n: c.done, pct: n ? Math.round((c.done / n) * 100) : 0 }));
  const rest = list.slice(4).reduce((s, c) => s + c.done, 0);
  if (rest) top.push({ label: `Other (${list.length - 4})`, color: '#a1a1aa', n: rest, pct: Math.max(0, 100 - top.reduce((s, x) => s + x.pct, 0)) });
  return top;
});
const strongest = computed(() => byCat.value.filter(c => c.planned >= 3).sort((a, b) => b.rate - a.rate)[0]);
const slipping = computed(() => byCat.value.filter(c => c.planned >= 3).sort((a, b) => a.rate - b.rate)[0]);

// ---------- when you work ----------
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const wd = d => (d.getDay() + 6) % 7;
const moments = computed(() => [
  ...cur.value.done.filter(x => x.task.time).map(x => ({ day: wd(fromIso(x.date)), h: Math.floor(toMins(x.task.time) / 60) })),
  ...cur.value.sessions.map(s => { const d = new Date(s.at); return { day: wd(d), h: d.getHours() }; }),
]);
const weekdays = computed(() => WEEK_LONG.map((name, day) => ({ name, n: cur.value.done.filter(x => wd(fromIso(x.date)) === day).length })).sort((a, b) => b.n - a.n));
const maxWeekday = computed(() => Math.max(1, ...weekdays.value.map(w => w.n)));
const SLOTS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
const slotLabel = h => (h === 12 ? '12 PM' : h === 24 ? '12 AM' : h > 12 ? `${h - 12} PM` : `${h} AM`);
const heat = computed(() => SLOTS.map(h => ({ h, cells: WEEK.map((name, day) => ({ name, n: moments.value.filter(m => m.day === day && m.h >= h && m.h < h + 2).length })) })));
const maxHeat = computed(() => Math.max(1, ...heat.value.flatMap(r => r.cells.map(c => c.n))));
const LILAC = ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa'];
const heatShade = n => LILAC[Math.min(4, Math.max(1, Math.ceil((n / maxHeat.value) * 4)))];
const peak = computed(() => { let b = null; for (const r of heat.value) for (const c of r.cells) if (!b || c.n > b.n) b = { ...c, h: r.h }; return b?.n ? b : null; });
const PARTS = [['early mornings', 0, 9], ['mornings', 9, 12], ['afternoons', 12, 17], ['evenings', 17, 21], ['late nights', 21, 24]];
const bestPart = computed(() => PARTS.map(([name, a, b]) => ({ name, n: moments.value.filter(m => m.h >= a && m.h < b).length })).sort((a, b) => b.n - a.n)[0]);

// ---------- focus ----------
const longest = computed(() => [...cur.value.sessions].sort((a, b) => b.mins - a.mins)[0]);
const focusedOn = computed(() => {
  const m = new Map();
  for (const s of cur.value.sessions) m.set(s.title, (m.get(s.title) || 0) + s.mins);
  return [...m.entries()].map(([title, mins]) => ({ title, mins })).sort((a, b) => b.mins - a.mins).slice(0, 3);
});
const avgSession = computed(() => (cur.value.sessions.length ? Math.round(cur.value.focus / cur.value.sessions.length) : 0));

// ---------- size of task ----------
const SIZES = [['Quick wins', 'under 30 min', 0, 30], ['Steady', '30 to 90 min', 30, 90], ['Deep work', '90 min or more', 90, 1e9]];
const bySize = computed(() => SIZES.map(([name, sub, a, b]) => ({ name, sub, done: cur.value.done.filter(x => (x.task.mins || 0) >= a && (x.task.mins || 0) < b && (a > 0 || x.task.mins)).length })));
const sizedTotal = computed(() => Math.max(1, bySize.value.reduce((n, s) => n + s.done, 0)));

// ---------- goals and streaks ----------
const goals = computed(() => (store.goals || []).map(g => {
  const steps = store.tasks.filter(t => t.goalId === g.id);
  const doneNow = steps.filter(t => t.done && t.doneAt && dayOf(t.doneAt) >= from.value && dayOf(t.doneAt) <= to.value).length;
  const all = steps.length; const doneAll = steps.filter(t => t.done).length;
  return { g, all, doneAll, doneNow, pct: all ? Math.round((doneAll / all) * 100) : 0 };
}).filter(x => x.all));
const streaks = computed(() => store.tasks.filter(t => t.repeat && t.kind === 'routine').map(t => ({ t, n: streak(t) })).filter(x => x.n > 1).sort((a, b) => b.n - a.n).slice(0, 3));

// ---------- the summary, in words ----------
const summary = computed(() => {
  const c = cur.value;
  const parts = [];
  parts.push({ t: `This ${rangeName.value} you finished ` }, { b: plural(c.done.length, 'thing') }, { t: ` of ${c.occ.length} planned` }, { m: `${c.rate}%` }, { t: '. ' });
  if (c.focus) parts.push({ t: 'You focused for ' }, { b: hours(c.focus) }, { t: ` across ${plural(c.sessions.length, 'session')}, about ${hours(avgSession.value)} each. ` });
  if (byCat.value[0]?.done) parts.push({ t: 'Most of it went to ' }, { b: byCat.value[0].label }, { t: `${byCat.value[1]?.done ? ` and ${byCat.value[1].label}` : ''}. ` });
  if (bestPart.value?.n) parts.push({ t: 'You get the most done in the ' }, { b: bestPart.value.name }, { t: `, and ${weekdays.value[0].name} is your strongest day. ` });
  if (hasPrev.value) { const d = delta(c.done.length, prev.value.done.length); if (d != null) parts.push({ t: 'That is ' }, { m: `${Math.abs(d)}% ${d >= 0 ? 'more' : 'less'}` }, { t: ' than the period before.' }); }
  return parts;
});

// ---------- before and now, as a table ----------
const compare = computed(() => [
  ['Done', cur.value.done.length, prev.value.done.length, v => v],
  ['Planned', cur.value.occ.length, prev.value.occ.length, v => v],
  ['Completion', cur.value.rate, prev.value.rate, v => `${v}%`],
  ['Focus', cur.value.focus, prev.value.focus, hours],
  ['Focus sessions', cur.value.sessions.length, prev.value.sessions.length, v => v],
  ['Assignments and exams', cur.value.assign, prev.value.assign, v => v],
  ['On time', cur.value.onTime, prev.value.onTime, v => (v == null ? '–' : `${v}%`)],
].map(([name, now, before, f]) => ({ name, now: f(now), before: hasPrev.value ? f(before) : '–', change: hasPrev.value && now != null && before != null ? delta(now, before) : null })));

// ---------- what it says, and what to try next ----------
const conclusions = computed(() => {
  const out = [];
  if (strongest.value) out.push({ icon: 'trend', tone: 'good', head: `${strongest.value.label} is going well`, text: `${strongest.value.rate}% of what you planned there is done (${strongest.value.done} of ${strongest.value.planned}).` });
  if (slipping.value && slipping.value.rate < 60 && slipping.value !== strongest.value) out.push({ icon: 'help', tone: 'warn', head: `${slipping.value.label} is slipping`, text: `Only ${slipping.value.done} of ${slipping.value.planned} done. Plan less there, or give it one focused session.` });
  if (peak.value) out.push({ icon: 'clock', tone: 'info', head: `Your peak: ${WEEK_LONG[WEEK.indexOf(peak.value.name)]}s around ${slotLabel(peak.value.h)}`, text: 'That is when you finish and focus the most. Put the hardest things there.' });
  if (cur.value.onTime != null) out.push({ icon: 'calendar', tone: cur.value.onTime >= 75 ? 'good' : 'warn', head: `${cur.value.onTime}% on time`, text: cur.value.onTime >= 75 ? 'Dated tasks mostly get done by their day. Keep the rhythm.' : 'Many dated tasks finish late. Fewer things per day, each with a time, helps.' });
  const [q, , d] = bySize.value;
  if (q.done + d.done) out.push({ icon: 'steps', tone: 'info', head: d.done > q.done ? 'You lean towards deep work' : 'Quick wins carry you', text: d.done > q.done ? `${d.done} long pieces of work against ${q.done} quick ones.` : `${q.done} short things done. Block one long session a week for the big ones.` });
  if (!cur.value.focus) out.push({ icon: 'target', tone: 'warn', head: 'No focus sessions yet', text: 'Start one from Focus: 25 minutes on one thing, and it shows up here.' });
  return out.slice(0, 6);
});
const nextSteps = computed(() => {
  const out = [];
  if (slipping.value && slipping.value.rate < 60) out.push(`Book one 25-minute focus session for ${slipping.value.label} this week.`);
  if (peak.value) out.push(`Keep ${WEEK_LONG[WEEK.indexOf(peak.value.name)]} ${slotLabel(peak.value.h)} to ${slotLabel(peak.value.h + 2)} for your hardest task.`);
  const quiet = weekdays.value[weekdays.value.length - 1];
  if (quiet && quiet.n < maxWeekday.value / 2) out.push(`${quiet.name} is your lightest day: a good one for a small catch-up.`);
  if (cur.value.rate < 70) out.push(`You finish ${cur.value.rate}% of what you plan. Try planning ${Math.max(1, Math.round(avg.value))} things a day.`);
  if (streaks.value[0]) out.push(`Keep your ${streaks.value[0].n}-day streak on ${streaks.value[0].t.title} going.`);
  return out.slice(0, 4);
});

// ---------- download ----------
function download() {
  const rows = [['Date', 'Planned', 'Done', 'Focus minutes'], ...daily.value.map(x => [x.d, x.planned, x.done, x.focus]), [], ['Category', 'Planned', 'Done', 'Completion %', 'Focus minutes'], ...byCat.value.map(c => [c.label, c.planned, c.done, c.rate, c.focus])];
  const csv = rows.map(r => r.map(v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `budgie-report-${from.value}-to-${to.value}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>

<template>
  <div class="rep span-12" data-test="reports">
    <section class="rep-head">
      <div>
        <p class="label">{{ short(from) }} – {{ short(to) }}</p>
        <h1>Reports</h1>
      </div>
      <div class="rep-head-acts">
        <div class="seg rep-seg" role="group" aria-label="Range">
          <button v-for="[id, label] in RANGES" :key="id" type="button" :class="{ on: range === id }" :aria-pressed="range === id" :data-test="`rep-${id}`" @click="range = id">{{ label }}</button>
        </div>
        <button type="button" class="ibtn" title="Download as a spreadsheet (CSV)" aria-label="Download as a spreadsheet" data-test="rep-download" @click="download"><Icon name="download" /></button>
      </div>
    </section>

    <!-- The period in a few sentences -->
    <p class="rep-lede" data-test="rep-summary">
      <template v-for="(p, i) in summary" :key="i"><b v-if="p.b">{{ p.b }}</b><mark v-else-if="p.m">{{ p.m }}</mark><template v-else>{{ p.t }}</template></template>
    </p>

    <!-- Four numbers, each with what it means -->
    <div class="rep-tiles">
      <div class="rep-stat" data-test="rep-stat">
        <p class="label">Done</p>
        <b>{{ cur.done.length }}<small>/{{ cur.occ.length }}</small></b>
        <span class="rep-meter"><i :style="{ width: `${cur.rate}%` }" /></span>
        <span class="muted small">{{ cur.rate }}% of what you planned<template v-if="delta(cur.done.length, prev.done.length) != null"> · <span class="rep-chg" :class="delta(cur.done.length, prev.done.length) >= 0 ? 'up' : 'down'">{{ pct(delta(cur.done.length, prev.done.length)) }}</span></template></span>
      </div>
      <div class="rep-stat" data-test="rep-stat">
        <p class="label">Focus</p>
        <b>{{ hours(cur.focus) }}</b>
        <span class="rep-meter"><i :style="{ width: `${Math.min(100, (cur.focus / Math.max(1, days * 60)) * 100)}%` }" /></span>
        <span class="muted small">{{ plural(cur.sessions.length, 'session') }} · about {{ hours(cur.focus / days) }} a day</span>
      </div>
      <div class="rep-stat" data-test="rep-stat">
        <p class="label">Assignments and exams</p>
        <b>{{ cur.assign }}</b>
        <span class="rep-meter"><i :style="{ width: `${Math.min(100, cur.done.length ? (cur.assign / cur.done.length) * 100 * 4 : 0)}%` }" /></span>
        <span class="muted small">completed · {{ hasPrev ? `${prev.assign} the period before` : 'nothing to compare with yet' }}</span>
      </div>
      <div class="rep-stat" data-test="rep-stat">
        <p class="label">On time</p>
        <b>{{ cur.onTime == null ? '–' : `${cur.onTime}%` }}</b>
        <span class="rep-meter"><i :style="{ width: `${cur.onTime || 0}%` }" /><em style="left: 75%" title="Goal: 75%" /></span>
        <span class="muted small">of tasks with a date · goal 75%</span>
      </div>
    </div>

    <!-- What it says -->
    <section class="rep-card">
      <h2>What it says</h2>
      <ul class="rep-says" data-test="rep-says">
        <li v-for="(c, i) in conclusions" :key="i" :class="c.tone"><span class="rep-says-ic"><Icon :name="c.icon" :size="14" /></span><span><b>{{ c.head }}</b>{{ c.text }}</span></li>
        <li v-if="!conclusions.length" class="info"><span class="rep-says-ic"><Icon name="sparkle" :size="14" /></span><span><b>Not enough yet</b>Tick a few things and run a focus session, and Budgie will start drawing conclusions.</span></li>
      </ul>
    </section>

    <div class="rep-grid">
      <!-- The days -->
      <section class="rep-card rep-span2">
        <div class="rep-card-head">
          <div><h2>Day by day</h2><p class="muted small">{{ plural(activeDays, 'day') }} with something done · about {{ avg }} a day<template v-if="best?.done"> · best: {{ longDay(best.d) }}, {{ best.done }} done</template></p></div>
        </div>
        <div class="rep-days" :style="{ '--n': daily.length }" role="img" :aria-label="`Things done each day; the best was ${best ? longDay(best.d) : 'none'}`">
          <span class="rep-avg" :style="{ bottom: `calc(${(avg / maxDaily) * 100}% * (1 - 22 / 160) + 22px)` }"><em>avg {{ avg }}</em></span>
          <div v-for="(x, i) in daily" :key="x.d" class="rep-day" :class="{ today: x.d === to, best: best && x.d === best.d && x.done }" :title="`${longDay(x.d)}: ${x.done} of ${x.planned} done, ${hours(x.focus)} focus`">
            <span class="rep-bar"><i :style="{ height: `${(x.done / maxDaily) * 100}%` }" /></span>
            <span class="rep-dl">{{ i % dayLabelEvery === 0 ? (days <= 7 ? WEEK[wd(fromIso(x.d))] : short(x.d)) : '' }}</span>
          </div>
        </div>
      </section>

      <!-- Where it went -->
      <section class="rep-card">
        <div class="rep-card-head"><h2>Where it went</h2></div>
        <div v-if="shares.length" class="rep-share">
          <div class="rep-share-bar"><i v-for="s in shares" :key="s.label" :style="{ flex: s.n, background: `color-mix(in srgb, ${s.color} 38%, #fff)` }" :title="`${s.label}: ${s.n} done, ${s.pct}%`" /></div>
          <ol class="rep-rank">
            <li v-for="s in shares" :key="s.label"><i :style="{ background: s.color }" /><span>{{ s.label }}</span><b>{{ s.n }}</b><span class="rep-pct">{{ s.pct }}%</span></li>
          </ol>
        </div>
        <p v-else class="muted small">Nothing done in this range yet.</p>
      </section>

      <!-- Before and now -->
      <section class="rep-card rep-span2">
        <div class="rep-card-head"><h2>Compared with before</h2><span class="muted small">{{ short(prevFrom) }} – {{ short(prevTo) }}</span></div>
        <table class="rep-table">
          <thead><tr><th>Measure</th><th>Before</th><th>This {{ rangeName }}</th><th>Change</th></tr></thead>
          <tbody>
            <tr v-for="r in compare" :key="r.name"><td>{{ r.name }}</td><td class="muted">{{ r.before }}</td><td><b>{{ r.now }}</b></td><td><span class="rep-chg" :class="r.change == null ? 'new' : r.change >= 0 ? 'up' : 'down'">{{ pct(r.change) }}</span></td></tr>
          </tbody>
        </table>
        <p v-if="!hasPrev" class="muted small">There is nothing in the period before yet, so changes read "new".</p>
      </section>

      <!-- Your days, busiest first -->
      <section class="rep-card">
        <div class="rep-card-head"><h2>Your week</h2><span class="muted small">busiest first</span></div>
        <ol class="rep-rank">
          <li v-for="w in weekdays" :key="w.name"><span>{{ w.name }}</span><span class="rep-rank-bar"><i :style="{ width: `${(w.n / maxWeekday) * 100}%` }" /></span><b>{{ w.n }}</b></li>
        </ol>
      </section>

      <!-- When you work best -->
      <section class="rep-card">
        <div class="rep-card-head"><div><h2>When you work best</h2><p class="muted small">{{ peak ? `Most active: ${WEEK_LONG[WEEK.indexOf(peak.name)]}, ${slotLabel(peak.h)} to ${slotLabel(peak.h + 2)}` : 'Not enough yet' }}</p></div></div>
        <div class="rep-heat" role="img" :aria-label="peak ? `Most active ${peak.name} at ${slotLabel(peak.h)}` : 'No activity yet'">
          <template v-for="r in heat" :key="r.h">
            <span class="rep-heat-y">{{ slotLabel(r.h) }}</span>
            <i v-for="c in r.cells" :key="c.name" :class="{ empty: !c.n, top: peak && c.n === peak.n && r.h === peak.h && c.name === peak.name }" :style="c.n ? { background: heatShade(c.n) } : {}" :title="`${c.name} ${slotLabel(r.h)}: ${c.n}`" />
          </template>
          <span />
          <span v-for="w in WEEK" :key="w" class="rep-heat-x">{{ w }}</span>
        </div>
      </section>

      <!-- Focus in words -->
      <section class="rep-card">
        <div class="rep-card-head"><h2>Focus</h2></div>
        <dl v-if="cur.sessions.length" class="rep-facts">
          <div><dt>Sessions</dt><dd>{{ cur.sessions.length }} · about {{ hours(avgSession) }} each</dd></div>
          <div v-if="longest"><dt>Longest</dt><dd>{{ hours(longest.mins) }} on {{ longest.title }}</dd></div>
        </dl>
        <template v-if="focusedOn.length">
          <h3 class="label rep-sub">Most focus went to</h3>
          <ol class="rep-rank">
            <li v-for="f in focusedOn" :key="f.title"><span>{{ f.title }}</span><b>{{ hours(f.mins) }}</b></li>
          </ol>
        </template>
        <p v-if="!cur.sessions.length" class="muted small">No focus sessions in this range. Start one from the Focus page.</p>
      </section>

      <!-- Size of task -->
      <section class="rep-card">
        <div class="rep-card-head"><h2>Size of what you finish</h2></div>
        <div class="rep-share-bar soft"><i v-for="(s, i) in bySize" :key="s.name" :style="{ flex: s.done || 0.0001, background: LILAC[i + 2] }" :title="`${s.name}: ${s.done}`" /></div>
        <ul class="rep-sizes">
          <li v-for="(s, i) in bySize" :key="s.name"><i :style="{ background: LILAC[i + 2] }" /><span><b>{{ s.name }}</b><span class="muted small">{{ s.sub }}</span></span><span class="rep-pct">{{ Math.round((s.done / sizedTotal) * 100) }}%</span></li>
        </ul>
      </section>

      <!-- Goals and streaks -->
      <section class="rep-card">
        <div class="rep-card-head"><h2>Goals and streaks</h2></div>
        <ul v-if="goals.length" class="rep-goals">
          <li v-for="x in goals.slice(0, 4)" :key="x.g.id">
            <span class="rep-goal-top"><b>{{ x.g.title }}</b><span class="muted small">{{ x.doneAll }}/{{ x.all }} steps</span></span>
            <span class="rep-meter"><i :style="{ width: `${x.pct}%`, background: `color-mix(in srgb, ${x.g.color || '#a78bfa'} 55%, #fff)` }" /></span>
            <span class="muted small">{{ x.doneNow ? `${plural(x.doneNow, 'step')} done this ${rangeName}` : `No steps this ${rangeName}` }}</span>
          </li>
        </ul>
        <p v-if="goals.length > 4" class="muted small">and {{ goals.length - 4 }} more goals</p>
        <ul v-if="streaks.length" class="rep-streaks">
          <li v-for="x in streaks" :key="x.t.id"><Icon name="flame" :size="13" />{{ x.t.title }}<b>{{ x.n }} days</b></li>
        </ul>
        <p v-if="!goals.length && !streaks.length" class="muted small">Set a goal or keep a routine going, and it shows here.</p>
      </section>

      <!-- Next -->
      <section v-if="nextSteps.length" class="rep-card rep-wide rep-next">
        <h2>Try next {{ rangeName === 'week' ? 'week' : 'time' }}</h2>
        <ol><li v-for="(t, i) in nextSteps" :key="i">{{ t }}</li></ol>
      </section>
    </div>
  </div>
</template>
