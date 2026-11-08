<script>
import { ref as refShared } from 'vue';
const sharedRange = refShared('month');
</script>

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
// One range for both parts on the Overview (the charts and the summary at the bottom).
const range = sharedRange;
const props = defineProps({ part: { type: String, default: 'all' } });
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

// ---------- the main chart: straight segments, a soft fill, a hover marker ----------
const metric = ref('done');
const series = computed(() => daily.value.map(x => (metric.value === 'done' ? x.done : x.focus)));
const fmt = v => (metric.value === 'done' ? `${Math.round(v)}` : hours(v));
// A top that splits into four even steps: whole numbers for counts, half hours for focus.
const yMax = computed(() => { const m = Math.max(1, ...series.value); const q = metric.value === 'done' ? 4 : 120; return Math.ceil(m / q) * q; });
const yTicks = computed(() => [1, 0.75, 0.5, 0.25, 0].map(f => yMax.value * f));
const nPts = computed(() => Math.max(1, series.value.length - 1));
const pts = computed(() => series.value.map((v, i) => [(i / nPts.value) * 100, 100 - (v / yMax.value) * 100]));
const linePath = computed(() => pts.value.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' '));
const areaPath = computed(() => (pts.value.length ? `${linePath.value} L100,100 L0,100 Z` : ''));
const xTicks = computed(() => daily.value.map((x, i) => [i, days.value <= 7 ? WEEK[wd(fromIso(x.d))] : short(x.d)]).filter(([i]) => i % dayLabelEvery.value === 0));
const hover = ref(-1);
const plot = ref(null);
function onMove(e) {
  const r = plot.value.getBoundingClientRect();
  const x = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width;
  hover.value = Math.max(0, Math.min(series.value.length - 1, Math.round(x * nPts.value)));
}
function onKey(e) {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const i = hover.value < 0 ? series.value.length - 1 : hover.value + (e.key === 'ArrowRight' ? 1 : -1);
  hover.value = Math.max(0, Math.min(series.value.length - 1, i));
}
const hp = computed(() => (hover.value >= 0 ? pts.value[hover.value] : null));
const total = computed(() => (metric.value === 'done' ? cur.value.done.length : cur.value.focus));
const totalDelta = computed(() => (metric.value === 'done' ? delta(cur.value.done.length, prev.value.done.length) : delta(cur.value.focus, prev.value.focus)));

// ---------- the verdict, with how sure Budgie is ----------
const verdict = computed(() => {
  const s = stats.value; const c = cur.value;
  const label = c.rate >= 75 && s.consistency >= 70 ? 'On track' : c.rate >= 55 ? 'Steady, with gaps' : 'Overloaded';
  const why = label === 'On track' ? 'You finish most of what you plan, most days.' : label === 'Steady, with gaps' ? 'Good follow-through, but some days pass with nothing done.' : 'More is planned than gets done. A lighter plan would help.';
  // More days of data means a surer read.
  const sure = Math.round(Math.min(95, 40 + Math.min(1, cur.value.occ.length / 120) * 35 + Math.min(1, s.active / 20) * 20));
  return { label, why, sure };
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
  <div class="rep" :class="[`rep-part-${part}`]" data-test="reports">
    <!-- Header and the key facts -->
    <section v-if="part !== 'main'" class="rep-box rep-top">
      <div class="rep-top-row">
        <div>
          <p class="rep-crumb">PROGRESS / <b>{{ rangeName.toUpperCase() }}</b></p>
          <h1>How your {{ rangeName }} went</h1>
        </div>
        <button type="button" class="rep-btn" title="Download the data as a spreadsheet (CSV)" data-test="rep-download" @click="download"><Icon name="download" :size="15" />Download</button>
      </div>
      <dl class="rep-facts">
        <div data-test="rep-stat"><dt>Done</dt><dd>{{ cur.done.length }} of {{ cur.occ.length }}</dd></div>
        <div data-test="rep-stat"><dt>Completion</dt><dd>{{ cur.rate }}%</dd></div>
        <div data-test="rep-stat"><dt>Per day</dt><dd>{{ stats.mean }} avg</dd></div>
        <div data-test="rep-stat"><dt>Focus</dt><dd>{{ hours(cur.focus) }}</dd></div>
        <div><dt>On time</dt><dd>{{ cur.onTime == null ? '–' : `${cur.onTime}%` }}</dd></div>
        <div><dt>Best day</dt><dd>{{ best?.done ? short(best.d) : '–' }}</dd></div>
      </dl>
    </section>

    <div v-if="part !== 'facts'" class="rep-layout">
      <div class="rep-main">
        <!-- The main chart -->
        <section class="rep-box rep-chart-box">
          <div class="rep-chart-head">
            <div>
              <p class="muted">{{ metric === 'done' ? 'Things done' : 'Focus time' }}</p>
              <p class="rep-total">{{ metric === 'done' ? total : hours(total) }}
                <span v-if="totalDelta != null" class="rep-chg" :class="totalDelta >= 0 ? 'up' : 'down'">{{ pct(totalDelta) }}</span>
              </p>
            </div>
            <p class="rep-index muted">Daily average <b>{{ metric === 'done' ? stats.mean : hours(cur.focus / days) }}</b></p>
          </div>
          <div class="rep-chart">
            <div class="rep-y" aria-hidden="true"><span v-for="t in yTicks" :key="t">{{ fmt(t) }}</span></div>
            <div ref="plot" class="rep-plot" tabindex="0" role="img" :aria-label="`${metric === 'done' ? 'Things done' : 'Focus'} each day: ${daily.map((x, i) => `${short(x.d)} ${fmt(series[i])}`).join(', ')}`" @mousemove="onMove" @touchmove.passive="onMove" @mouseleave="hover = -1" @blur="hover = -1" @keydown="onKey">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="rep-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a78bfa" stop-opacity=".28" /><stop offset="100%" stop-color="#a78bfa" stop-opacity="0" /></linearGradient>
                  <!-- Nothing is drawn below the baseline. -->
                  <clipPath id="rep-clip"><rect x="-1" y="-5" width="102" height="105" /></clipPath>
                </defs>
                <line v-for="y in [0, 25, 50, 75]" :key="y" x1="0" x2="100" :y1="y" :y2="y" class="rep-grid" vector-effect="non-scaling-stroke" />
                <g clip-path="url(#rep-clip)">
                  <path :d="areaPath" fill="url(#rep-fill)" />
                  <path :d="linePath" class="rep-line" vector-effect="non-scaling-stroke" />
                </g>
                <line x1="0" x2="100" y1="100" y2="100" class="rep-base" vector-effect="non-scaling-stroke" />
                <line v-if="hp" :x1="hp[0]" :x2="hp[0]" y1="0" y2="100" class="rep-cross" vector-effect="non-scaling-stroke" />
              </svg>
              <template v-if="hp">
                <i class="rep-dot" :style="{ left: `${hp[0]}%`, top: `min(${hp[1]}%, calc(100% - 7px))` }" />
                <span class="rep-tip" :class="{ flip: hp[0] > 70 }" :style="{ left: `${hp[0]}%`, top: `${hp[1]}%` }">{{ fromIso(daily[hover].d).toLocaleDateString('en-US', { weekday: 'long' }) }} <b>{{ fmt(series[hover]) }}</b></span>
              </template>
            </div>
            <div class="rep-x" aria-hidden="true"><span v-for="[i, t] in xTicks" :key="i" :style="{ left: `${(i / nPts) * 100}%` }">{{ t }}</span></div>
          </div>
          <div class="rep-chart-foot">
            <div class="rep-tabs" role="group" aria-label="Range">
              <button v-for="[id, label] in RANGES" :key="id" type="button" :class="{ on: range === id }" :aria-pressed="range === id" :data-test="`rep-${id}`" @click="range = id">{{ label }}</button>
            </div>
            <div class="rep-tabs" role="group" aria-label="Show">
              <button type="button" :class="{ on: metric === 'done' }" :aria-pressed="metric === 'done'" data-test="rep-metric-done" @click="metric = 'done'">Done</button>
              <button type="button" :class="{ on: metric === 'focus' }" :aria-pressed="metric === 'focus'" data-test="rep-metric-focus" @click="metric = 'focus'">Focus</button>
            </div>
          </div>
        </section>

        <div class="rep-pair">
          <!-- In a few words -->
          <section class="rep-box">
            <h2>In a few words</h2>
            <p class="rep-p" data-test="rep-summary">{{ summary }}</p>
            <div class="rep-grid4">
              <div><span>Typical day</span><b>{{ stats.median }}</b></div>
              <div><span>Spread</span><b>± {{ stats.sd }}</b></div>
              <div><span>Days active</span><b>{{ stats.active }}/{{ days }}</b></div>
              <div><span>Trend</span><b :class="stats.slopeWeek >= 0 ? 'rep-up' : 'rep-down'">{{ stats.slopeWeek >= 0 ? '+' : '' }}{{ stats.slopeWeek }}/wk</b></div>
            </div>
            <div v-if="nextSteps.length" class="rep-try">
              <h3 class="rep-sub"><Icon name="sparkle" :size="14" />TRY NEXT</h3>
              <ol class="rep-next" data-test="rep-next"><li v-for="(t, i) in nextSteps.slice(0, 3)" :key="i">{{ t }}</li></ol>
            </div>
          </section>
          <!-- Where it went -->
          <section class="rep-box">
            <h2>Where the effort went</h2>
            <ul class="rep-list">
              <li v-for="c in topCats.slice(0, 5)" :key="c.key" :style="{ '--c': c.color }"><i /><span>{{ c.label }}</span><b>{{ c.done }}</b><span class="rep-pct">{{ c.share }}%</span></li>
            </ul>
            <p v-if="!topCats.length" class="muted small">Nothing done in this range yet.</p>
          </section>
        </div>
      </div>

    </div>
  </div>
</template>
