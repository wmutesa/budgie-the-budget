<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, fromIso, isoDay, toMins, streak } from '../lib/tasks';
import { catKey, catLabel, catColor } from '../lib/cats';
import Icon from './Icon.vue';

// Reports, written like a short study of your own time: a summary, what the
// data is, the findings in plain words with simple statistics, two figures,
// a few tables, what it means, and what to try next. Mostly text; cards and
// charts only where they help.
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
const r1 = v => +v.toFixed(1);

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
const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const pct = d => (d == null ? 'new' : `${d >= 0 ? '+' : ''}${d}%`);

// ---------- per day, and simple statistics ----------
const daily = computed(() => Array.from({ length: days.value }, (_, i) => {
  const d = addDays(from.value, i);
  const occ = cur.value.occ.filter(x => x.date === d);
  return { d, done: occ.filter(x => x.done).length, planned: occ.length, focus: cur.value.sessions.filter(s => dayOf(s.at) === d).reduce((n, s) => n + s.mins, 0) };
}));
const doneList = computed(() => daily.value.map(x => x.done));
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
// Pearson's r between two lists, or null when one does not vary.
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; a.forEach((v, i) => { n += (v - ma) * (b[i] - mb); da += (v - ma) ** 2; db += (b[i] - mb) ** 2; }); return da && db ? n / Math.sqrt(da * db) : null; };
// Least-squares slope: change in things done per day, over the range.
const slope = a => { const xs = a.map((_, i) => i); const mx = mean(xs), my = mean(a); let n = 0, d = 0; xs.forEach((x, i) => { n += (x - mx) * (a[i] - my); d += (x - mx) ** 2; }); return d ? n / d : 0; };
const stats = computed(() => {
  const a = doneList.value;
  const active = a.filter(v => v > 0).length;
  const r = corr(daily.value.map(x => x.focus), a);
  const s = slope(a);
  return { mean: r1(mean(a)), median: r1(median(a)), sd: r1(sd(a)), min: Math.min(...a), max: Math.max(...a), active, consistency: Math.round((active / Math.max(1, a.length)) * 100), r: r == null ? null : +r.toFixed(2), slopeWeek: r1(s * 7) };
});
const strength = r => { const x = Math.abs(r); return x >= 0.7 ? 'strong' : x >= 0.4 ? 'moderate' : x >= 0.2 ? 'weak' : 'little or no'; };
const spreadWord = computed(() => { const cv = stats.value.mean ? stats.value.sd / stats.value.mean : 0; return cv < 0.35 ? 'steady' : cv < 0.8 ? 'uneven' : 'very uneven'; });
const maxDaily = computed(() => Math.max(1, ...doneList.value));
const best = computed(() => [...daily.value].sort((a, b) => b.done - a.done || b.focus - a.focus)[0]);
const dayLabelEvery = computed(() => (days.value <= 7 ? 1 : days.value <= 31 ? 7 : 14));

// ---------- categories ----------
const byCat = computed(() => {
  const m = new Map();
  const get = t => { const k = catKey(t); if (!m.has(k)) m.set(k, { key: k, label: catLabel(t), color: catColor(t), planned: 0, done: 0, focus: 0 }); return m.get(k); };
  for (const x of cur.value.occ) { const c = get(x.task); c.planned++; if (x.done) c.done++; }
  for (const s of cur.value.sessions) get({ project: s.project, kind: s.kind }).focus += s.mins;
  const n = cur.value.done.length;
  return [...m.values()].filter(c => c.planned || c.focus).map(c => ({ ...c, rate: c.planned ? Math.round((c.done / c.planned) * 100) : 0, share: n ? Math.round((c.done / n) * 100) : 0 })).sort((a, b) => b.done - a.done || b.focus - a.focus);
});
const strongest = computed(() => byCat.value.filter(c => c.planned >= 3).sort((a, b) => b.rate - a.rate)[0]);
const slipping = computed(() => byCat.value.filter(c => c.planned >= 3).sort((a, b) => a.rate - b.rate)[0]);
const topCats = computed(() => byCat.value.slice(0, 6));

// ---------- when you work ----------
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const wd = d => (d.getDay() + 6) % 7;
const moments = computed(() => [
  ...cur.value.done.filter(x => x.task.time).map(x => ({ day: wd(fromIso(x.date)), h: Math.floor(toMins(x.task.time) / 60) })),
  ...cur.value.sessions.map(s => { const d = new Date(s.at); return { day: wd(d), h: d.getHours() }; }),
]);
const weekdays = computed(() => WEEK_LONG.map((name, day) => ({ name, n: cur.value.done.filter(x => wd(fromIso(x.date)) === day).length })).sort((a, b) => b.n - a.n));
const SLOTS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
const slotLabel = h => (h === 12 ? '12 PM' : h === 24 ? '12 AM' : h > 12 ? `${h - 12} PM` : `${h} AM`);
const heat = computed(() => SLOTS.map(h => ({ h, cells: WEEK.map((name, day) => ({ name, n: moments.value.filter(m => m.day === day && m.h >= h && m.h < h + 2).length })) })));
const maxHeat = computed(() => Math.max(1, ...heat.value.flatMap(r => r.cells.map(c => c.n))));
const LILAC = ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa'];
const heatShade = n => LILAC[Math.min(4, Math.max(1, Math.ceil((n / maxHeat.value) * 4)))];
const peak = computed(() => { let b = null; for (const r of heat.value) for (const c of r.cells) if (!b || c.n > b.n) b = { ...c, h: r.h }; return b?.n ? b : null; });
const PARTS = [['early mornings', 0, 9], ['mornings', 9, 12], ['afternoons', 12, 17], ['evenings', 17, 21], ['late nights', 21, 24]];
const bestPart = computed(() => PARTS.map(([name, a, b]) => ({ name, n: moments.value.filter(m => m.h >= a && m.h < b).length })).sort((a, b) => b.n - a.n)[0]);

// ---------- focus, size, goals ----------
const longest = computed(() => [...cur.value.sessions].sort((a, b) => b.mins - a.mins)[0]);
const avgSession = computed(() => (cur.value.sessions.length ? Math.round(cur.value.focus / cur.value.sessions.length) : 0));
const SIZES = [['Quick wins', 'under 30 min', 0, 30], ['Steady', '30 to 90 min', 30, 90], ['Deep work', '90 min or more', 90, 1e9]];
const bySize = computed(() => SIZES.map(([name, sub, a, b]) => ({ name, sub, done: cur.value.done.filter(x => (x.task.mins || 0) >= a && (x.task.mins || 0) < b && (a > 0 || x.task.mins)).length })));
const sizedTotal = computed(() => Math.max(1, bySize.value.reduce((n, s) => n + s.done, 0)));
const goals = computed(() => (store.goals || []).map(g => {
  const steps = store.tasks.filter(t => t.goalId === g.id);
  const doneNow = steps.filter(t => t.done && t.doneAt && dayOf(t.doneAt) >= from.value && dayOf(t.doneAt) <= to.value).length;
  return { g, all: steps.length, doneAll: steps.filter(t => t.done).length, doneNow };
}).filter(x => x.all));
const streaks = computed(() => store.tasks.filter(t => t.repeat && t.kind === 'routine').map(t => ({ t, n: streak(t) })).filter(x => x.n > 1).sort((a, b) => b.n - a.n).slice(0, 3));

// ---------- the findings, in words ----------
const findings = computed(() => {
  const s = stats.value; const c = cur.value; const out = [];
  out.push({ head: 'How much gets done', text: `On an average day you finish ${s.mean} things (median ${s.median}; most days fall between ${Math.max(0, r1(s.mean - s.sd))} and ${r1(s.mean + s.sd)}). Your days are ${spreadWord.value}: the lightest had ${s.min}, the busiest ${s.max}.` });
  out.push({ head: 'How consistent you are', text: `You got something done on ${s.active} of ${days.value} days (${s.consistency}%). ${s.consistency >= 80 ? 'That is a strong habit of showing up.' : s.consistency >= 50 ? 'There are gaps, but a clear rhythm.' : 'Many days pass with nothing ticked; small daily wins would help.'}` });
  if (days.value >= 7) out.push({ head: 'Which way it is going', text: Math.abs(s.slopeWeek) < 0.5 ? 'Across the period, your daily output is flat: neither rising nor falling.' : `Across the period, you finish about ${Math.abs(s.slopeWeek)} ${s.slopeWeek > 0 ? 'more' : 'fewer'} things a day for every week that passes.` });
  if (s.r != null && c.sessions.length >= 3) out.push({ head: 'Does focus help?', text: `On days with more focus time you ${s.r > 0 ? 'finish more' : 'finish less'}: there is a ${strength(s.r)} ${s.r > 0 ? 'positive' : 'negative'} link (r = ${s.r}). ${Math.abs(s.r) >= 0.4 ? 'Focus sessions look worth protecting.' : 'Focus and output move mostly independently so far.'}` });
  if (bestPart.value?.n) out.push({ head: 'When you work best', text: `Most of your work happens in the ${bestPart.value.name}${peak.value ? `, with a peak on ${WEEK_LONG[WEEK.indexOf(peak.value.name)]}s around ${slotLabel(peak.value.h)}` : ''}. ${weekdays.value[0].name} is your strongest day and ${weekdays.value[6].name} the lightest.` });
  if (strongest.value) out.push({ head: 'Where it goes well, and where it slips', text: `${strongest.value.label} has the best follow-through (${strongest.value.rate}% of what was planned)${slipping.value && slipping.value !== strongest.value ? `; ${slipping.value.label} the weakest (${slipping.value.rate}%)` : ''}.` });
  if (c.onTime != null) out.push({ head: 'Deadlines', text: `${c.onTime}% of things with a date were done by that date${c.assign ? `, including ${plural(c.assign, 'assignment or exam', 'assignments and exams')}` : ''}.` });
  return out;
});
const summary = computed(() => {
  const c = cur.value; const s = stats.value;
  let t = `Over the last ${rangeName.value} you finished ${c.done.length} of ${c.occ.length} planned things (${c.rate}%), about ${s.mean} a day`;
  if (c.focus) t += `, and focused for ${hours(c.focus)} in ${plural(c.sessions.length, 'session')}`;
  t += '.';
  if (byCat.value[0]?.done) t += ` Most of the effort went to ${byCat.value[0].label}${byCat.value[1]?.done ? ` and ${byCat.value[1].label}` : ''}.`;
  if (hasPrev.value) { const d = delta(c.done.length, prev.value.done.length); if (d != null) t += ` That is ${Math.abs(d)}% ${d >= 0 ? 'more' : 'less'} than the period before.`; }
  return t;
});
const meaning = computed(() => {
  const out = [];
  const s = stats.value;
  if (s.consistency < 60) out.push('Your output depends on a few big days. A smaller, steadier daily plan would spread the load.');
  else out.push('You show up on most days, which matters more than any single big day.');
  if (slipping.value && slipping.value.rate < 60) out.push(`${slipping.value.label} is planned more than it is done. Either plan less there or give it fixed time.`);
  if (peak.value) out.push(`Your best hours are a resource: ${WEEK_LONG[WEEK.indexOf(peak.value.name)]} around ${slotLabel(peak.value.h)} is where hard work is most likely to happen.`);
  return out;
});
const nextSteps = computed(() => {
  const out = [];
  if (slipping.value && slipping.value.rate < 60) out.push(`Book one 25-minute focus session for ${slipping.value.label} this week.`);
  if (peak.value) out.push(`Keep ${WEEK_LONG[WEEK.indexOf(peak.value.name)]} ${slotLabel(peak.value.h)} to ${slotLabel(peak.value.h + 2)} for your hardest task.`);
  if (cur.value.rate < 70) out.push(`You finish ${cur.value.rate}% of what you plan. Try planning ${Math.max(1, Math.round(stats.value.mean + 1))} things a day.`);
  if (streaks.value[0]) out.push(`Keep your ${streaks.value[0].n}-day streak on ${streaks.value[0].t.title} going.`);
  return out.slice(0, 4);
});
const compare = computed(() => [
  ['Things done', cur.value.done.length, prev.value.done.length, v => v],
  ['Planned', cur.value.occ.length, prev.value.occ.length, v => v],
  ['Completion', cur.value.rate, prev.value.rate, v => `${v}%`],
  ['Focus', cur.value.focus, prev.value.focus, hours],
  ['Focus sessions', cur.value.sessions.length, prev.value.sessions.length, v => v],
  ['Assignments and exams', cur.value.assign, prev.value.assign, v => v],
  ['On time', cur.value.onTime, prev.value.onTime, v => (v == null ? '–' : `${v}%`)],
].map(([name, now, before, f]) => ({ name, now: f(now), before: hasPrev.value ? f(before) : '–', change: hasPrev.value && now != null && before != null ? delta(now, before) : null })));

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
  <article class="rep span-12" data-test="reports">
    <header class="rep-head">
      <div>
        <p class="label">Report · {{ short(from) }} – {{ short(to) }}</p>
        <h1>How your {{ rangeName }} went</h1>
      </div>
      <div class="rep-head-acts">
        <div class="seg rep-seg" role="group" aria-label="Range">
          <button v-for="[id, label] in RANGES" :key="id" type="button" :class="{ on: range === id }" :aria-pressed="range === id" :data-test="`rep-${id}`" @click="range = id">{{ label }}</button>
        </div>
        <button type="button" class="ibtn" title="Download the data as a spreadsheet (CSV)" aria-label="Download the data as a spreadsheet" data-test="rep-download" @click="download"><Icon name="download" /></button>
      </div>
    </header>

    <!-- Summary -->
    <section class="rep-sec">
      <h2><span>1</span>Summary</h2>
      <p class="rep-abstract" data-test="rep-summary">{{ summary }}</p>
      <dl class="rep-keys">
        <div data-test="rep-stat"><dt>Done</dt><dd>{{ cur.done.length }}<small> of {{ cur.occ.length }}</small></dd></div>
        <div data-test="rep-stat"><dt>Per day</dt><dd>{{ stats.mean }}<small> avg</small></dd></div>
        <div data-test="rep-stat"><dt>Focus</dt><dd>{{ hours(cur.focus) }}</dd></div>
        <div data-test="rep-stat"><dt>On time</dt><dd>{{ cur.onTime == null ? '–' : `${cur.onTime}%` }}</dd></div>
      </dl>
    </section>

    <!-- The data -->
    <section class="rep-sec">
      <h2><span>2</span>The data</h2>
      <p class="rep-p">This report looks at {{ plural(days, 'day') }}, from {{ longDay(from) }} to {{ longDay(to) }}. It counts every task, event, class and routine that was planned in that time ({{ cur.occ.length }} in all), which of them were ticked, and {{ plural(cur.sessions.length, 'focus session') }}. It is compared with the {{ plural(days, 'day') }} before ({{ short(prevFrom) }} – {{ short(prevTo) }}).<template v-if="!hasPrev"> There is nothing recorded in that earlier period yet, so comparisons read "new".</template></p>
    </section>

    <!-- Findings -->
    <section class="rep-sec">
      <h2><span>3</span>Findings</h2>
      <ol class="rep-findings" data-test="rep-says">
        <li v-for="(f, i) in findings" :key="i"><b>{{ /[?.!]$/.test(f.head) ? f.head : `${f.head}.` }}</b> {{ f.text }}</li>
      </ol>

      <figure class="rep-fig">
        <div class="rep-days" :style="{ '--n': daily.length }" role="img" :aria-label="`Things done each day; average ${stats.mean}`">
          <span class="rep-avg" :style="{ bottom: `calc(${(stats.mean / maxDaily) * 100}% * (1 - 22 / 150) + 22px)` }"><em>avg {{ stats.mean }}</em></span>
          <div v-for="(x, i) in daily" :key="x.d" class="rep-day" :class="{ today: x.d === to, best: best && x.d === best.d && x.done }" :title="`${longDay(x.d)}: ${x.done} of ${x.planned} done, ${hours(x.focus)} focus`">
            <span class="rep-bar"><i :style="{ height: `${(x.done / maxDaily) * 100}%` }" /></span>
            <span class="rep-dl">{{ i % dayLabelEvery === 0 ? (days <= 7 ? WEEK[wd(fromIso(x.d))] : short(x.d)) : '' }}</span>
          </div>
        </div>
        <figcaption><b>Figure 1.</b> Things done each day. The dashed line is the average ({{ stats.mean }}); the darker bar is the best day<template v-if="best?.done"> ({{ longDay(best.d) }}, {{ best.done }})</template>.</figcaption>
      </figure>

      <div class="rep-two">
        <table class="rep-table">
          <caption><b>Table 1.</b> Things done per day</caption>
          <tbody>
            <tr><th scope="row">Average (mean)</th><td>{{ stats.mean }}</td></tr>
            <tr><th scope="row">Typical day (median)</th><td>{{ stats.median }}</td></tr>
            <tr><th scope="row">Spread (standard deviation)</th><td>{{ stats.sd }}</td></tr>
            <tr><th scope="row">Lightest – busiest</th><td>{{ stats.min }} – {{ stats.max }}</td></tr>
            <tr><th scope="row">Days with something done</th><td>{{ stats.active }} of {{ days }} ({{ stats.consistency }}%)</td></tr>
            <tr v-if="days >= 7"><th scope="row">Trend per week</th><td>{{ stats.slopeWeek >= 0 ? '+' : '' }}{{ stats.slopeWeek }} a day</td></tr>
            <tr v-if="stats.r != null"><th scope="row">Focus and output (r)</th><td>{{ stats.r }} · {{ strength(stats.r) }}</td></tr>
          </tbody>
        </table>
        <table class="rep-table">
          <caption><b>Table 2.</b> Compared with the period before</caption>
          <thead><tr><th>Measure</th><th>Before</th><th>Now</th><th>Change</th></tr></thead>
          <tbody>
            <tr v-for="r in compare" :key="r.name"><th scope="row">{{ r.name }}</th><td class="muted">{{ r.before }}</td><td><b>{{ r.now }}</b></td><td><span class="rep-chg" :class="r.change == null ? 'new' : r.change >= 0 ? 'up' : 'down'">{{ pct(r.change) }}</span></td></tr>
          </tbody>
        </table>
      </div>

      <table class="rep-table rep-cats">
        <caption><b>Table 3.</b> Where the effort went</caption>
        <thead><tr><th>Category</th><th>Done</th><th>Share</th><th>Follow-through</th><th>Focus</th></tr></thead>
        <tbody>
          <tr v-for="c in topCats" :key="c.key" :style="{ '--c': c.color }"><th scope="row"><i />{{ c.label }}</th><td>{{ c.done }} of {{ c.planned }}</td><td>{{ c.share }}%</td><td><span class="rep-meter"><i :style="{ width: `${c.rate}%` }" /></span>{{ c.rate }}%</td><td class="muted">{{ c.focus ? hours(c.focus) : '–' }}</td></tr>
        </tbody>
      </table>
      <p v-if="byCat.length > topCats.length" class="muted small">The other {{ byCat.length - topCats.length }} categories are in the downloaded data.</p>

      <div class="rep-two">
        <figure class="rep-fig">
          <div class="rep-heat" role="img" :aria-label="peak ? `Most active ${peak.name} at ${slotLabel(peak.h)}` : 'No activity yet'">
            <template v-for="r in heat" :key="r.h">
              <span class="rep-heat-y">{{ slotLabel(r.h) }}</span>
              <i v-for="c in r.cells" :key="c.name" :class="{ empty: !c.n, top: peak && c.n === peak.n && r.h === peak.h && c.name === peak.name }" :style="c.n ? { background: heatShade(c.n) } : {}" :title="`${c.name} ${slotLabel(r.h)}: ${c.n}`" />
            </template>
            <span />
            <span v-for="w in WEEK" :key="w" class="rep-heat-x">{{ w }}</span>
          </div>
          <figcaption><b>Figure 2.</b> When things get done and focused on, by weekday and two-hour slot. Darker means more; the ringed cell is the peak.</figcaption>
        </figure>
        <div class="rep-notes">
          <h3>Focus</h3>
          <p v-if="cur.sessions.length" class="rep-p">{{ plural(cur.sessions.length, 'session') }}, about {{ hours(avgSession) }} each<template v-if="longest">; the longest was {{ hours(longest.mins) }} on <i>{{ longest.title }}</i></template>.</p>
          <p v-else class="rep-p muted">No focus sessions in this period.</p>
          <h3>Size of what you finish</h3>
          <p class="rep-p"><template v-for="(s, i) in bySize" :key="s.name">{{ s.name }} ({{ s.sub }}): <b>{{ Math.round((s.done / sizedTotal) * 100) }}%</b>{{ i < 2 ? '; ' : '.' }}</template></p>
          <h3>Goals and streaks</h3>
          <p v-if="goals.length" class="rep-p"><template v-for="(x, i) in goals.slice(0, 4)" :key="x.g.id"><i>{{ x.g.title }}</i>: {{ x.doneAll }} of {{ x.all }} steps{{ x.doneNow ? ` (${x.doneNow} this ${rangeName})` : '' }}{{ i < Math.min(goals.length, 4) - 1 ? '; ' : '.' }}</template></p>
          <p v-if="streaks.length" class="rep-p">Longest streaks: <template v-for="(x, i) in streaks" :key="x.t.id">{{ x.t.title }} ({{ x.n }} days){{ i < streaks.length - 1 ? ', ' : '.' }}</template></p>
          <p v-if="!goals.length && !streaks.length" class="rep-p muted">No goals or streaks yet.</p>
        </div>
      </div>
    </section>

    <!-- What it means -->
    <section class="rep-sec">
      <h2><span>4</span>What it means</h2>
      <p v-for="(m, i) in meaning" :key="i" class="rep-p">{{ m }}</p>
      <p class="rep-p muted small">A note on these numbers: they only count what is in Budgie. Things done but never added, or ticked late, are not seen. With fewer than two weeks of data, treat the patterns as hints.</p>
    </section>

    <!-- Next -->
    <section v-if="nextSteps.length" class="rep-sec rep-next">
      <h2><span>5</span>Try next</h2>
      <ol><li v-for="(t, i) in nextSteps" :key="i">{{ t }}</li></ol>
    </section>
  </article>
</template>
