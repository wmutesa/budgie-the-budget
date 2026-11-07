<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, fromIso, isoDay, toMins, KINDS, streak } from '../lib/tasks';
import { catKey, catLabel, catColor } from '../lib/cats';
import RepCurve from './RepCurve.vue';
import RepMini from './RepMini.vue';
import Icon from './Icon.vue';

// Reports: what got done, where the focus went, and what it says about how you
// work, compared with the period before. Everything comes from your planner,
// ticks and focus sessions.
const RANGES = [['week', 'Week', 7], ['month', 'Month', 30], ['quarter', '3 months', 90]];
const range = ref('month');
const days = computed(() => RANGES.find(r => r[0] === range.value)[2]);
const to = computed(() => today());
const from = computed(() => addDays(to.value, -(days.value - 1)));
const prevTo = computed(() => addDays(from.value, -1));
const prevFrom = computed(() => addDays(prevTo.value, -(days.value - 1)));
const dayOf = iso => isoDay(new Date(iso));
const short = d => fromIso(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const hours = m => (m >= 60 ? `${+(m / 60).toFixed(1)} h` : `${Math.round(m)} min`);

// Everything planned and done between two days (one-offs, each repeat, and done items with no date).
function period(a, b) {
  const inR = d => d >= a && d <= b;
  const occ = [...occurrences(a, b), ...store.tasks.filter(t => !t.date && !t.repeat && t.done && t.doneAt && inR(dayOf(t.doneAt))).map(t => ({ task: t, date: dayOf(t.doneAt), done: true, key: t.id }))];
  const done = occ.filter(x => x.done);
  const sessions = (store.focusLog || []).filter(s => inR(dayOf(s.at)));
  return { occ, done, sessions, focus: sessions.reduce((n, s) => n + (s.mins || 0), 0) };
}
const cur = computed(() => period(from.value, to.value));
const prev = computed(() => period(prevFrom.value, prevTo.value));
// Change against the period before; null when there was nothing to compare with.
const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const pct = d => (d == null ? 'new' : `${d >= 0 ? '+' : ''}${d}%`);

// ---------- headline ----------
const doneN = computed(() => cur.value.done.length);
const doneDelta = computed(() => delta(doneN.value, prev.value.done.length));
const completion = computed(() => (cur.value.occ.length ? Math.round((doneN.value / cur.value.occ.length) * 100) : 0));
const assignments = p => p.done.filter(x => ['assignment', 'exam'].includes(x.task.kind)).length;
const onTimeOf = p => { const d = p.done.filter(x => !x.task.repeat && x.task.date && x.task.doneAt); return d.length ? Math.round((d.filter(x => dayOf(x.task.doneAt) <= x.task.date).length / d.length) * 100) : null; };
const onTime = computed(() => onTimeOf(cur.value));

// ---------- per day ----------
const daily = computed(() => Array.from({ length: days.value }, (_, i) => {
  const d = addDays(from.value, i);
  const occ = cur.value.occ.filter(x => x.date === d);
  return { d, done: occ.filter(x => x.done).length, planned: occ.length, focus: cur.value.sessions.filter(s => dayOf(s.at) === d).reduce((n, s) => n + s.mins, 0), assign: cur.value.done.filter(x => x.date === d && ['assignment', 'exam'].includes(x.task.kind)).length };
}));
const rate = computed(() => daily.value.map(x => (x.planned ? Math.round((x.done / x.planned) * 100) : 0)));
const tickEvery = computed(() => (days.value <= 7 ? 1 : days.value <= 31 ? 7 : 14));
// Evenly spaced labels, and the last day unless it would sit on top of the one before.
const ticks = computed(() => daily.value.map((x, i) => [i, days.value <= 7 ? fromIso(x.d).toLocaleDateString('en-US', { weekday: 'short' }) : short(x.d)]).filter(([i]) => i % tickEvery.value === 0 || (i === days.value - 1 && i % tickEvery.value >= tickEvery.value / 2)));
const metric = ref('done');
const METRICS = [['done', 'Done'], ['focus', 'Focus'], ['rate', 'Completion']];
const curve = computed(() => (metric.value === 'done' ? daily.value.map(x => x.done) : metric.value === 'focus' ? daily.value.map(x => x.focus) : rate.value));
const curveFormat = computed(() => (metric.value === 'done' ? v => `${Math.round(v)}` : metric.value === 'focus' ? v => hours(v) : v => `${Math.round(v)}%`));
const best = computed(() => [...daily.value].sort((a, b) => b.done - a.done || b.focus - a.focus)[0]);

// ---------- this period against the last, a bar per stretch (hatched = before) ----------
const buckets = computed(() => {
  const size = days.value <= 7 ? 1 : 7;
  const n = Math.ceil(days.value / size);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = addDays(from.value, i * size), b = addDays(a, size - 1);
    const pa = addDays(prevFrom.value, i * size), pb = addDays(pa, size - 1);
    const inn = (list, x, y) => list.filter(o => o.date >= x && o.date <= y).length;
    out.push({ label: size === 1 ? fromIso(a).toLocaleDateString('en-US', { weekday: 'short' }) : `W${i + 1}`, now: inn(cur.value.done, a, b), before: inn(prev.value.done, pa, pb), range: `${short(a)}${size > 1 ? ` – ${short(b > to.value ? to.value : b)}` : ''}` });
  }
  return out;
});
const maxBucket = computed(() => Math.max(1, ...buckets.value.flatMap(b => [b.now, b.before])));

// ---------- by category (#) ----------
const byCat = computed(() => {
  const m = new Map();
  const get = t => { const k = catKey(t); if (!m.has(k)) m.set(k, { key: k, label: catLabel(t), color: catColor(t), planned: 0, done: 0, focus: 0, before: 0 }); return m.get(k); };
  for (const x of cur.value.occ) { const c = get(x.task); c.planned++; if (x.done) c.done++; }
  for (const x of prev.value.done) get(x.task).before++;
  for (const s of cur.value.sessions) get({ project: s.project, kind: s.kind }).focus += s.mins;
  return [...m.values()].filter(c => c.planned || c.focus).map(c => ({ ...c, rate: c.planned ? Math.round((c.done / c.planned) * 100) : 0, share: doneN.value ? Math.round((c.done / doneN.value) * 100) : 0, change: delta(c.done, c.before) })).sort((a, b) => b.done - a.done || b.focus - a.focus);
});
// The share bar: the top four and the rest as Other.
const shares = computed(() => {
  const top = byCat.value.filter(c => c.done).slice(0, 4);
  const rest = byCat.value.filter(c => c.done).slice(4).reduce((n, c) => n + c.done, 0);
  const list = top.map(c => ({ label: c.label, color: c.color, n: c.done, pct: c.share }));
  if (rest) list.push({ label: 'Other', color: '#a1a1aa', n: rest, pct: Math.max(0, 100 - list.reduce((n, x) => n + x.pct, 0)) });
  return list;
});

// ---------- when: weekday by time of day, and the peak hours ----------
const PARTS = [['Early', 0, 9], ['Morning', 9, 12], ['Afternoon', 12, 17], ['Evening', 17, 21], ['Night', 21, 24]];
const PART_SHADES = ['#ede9fe', '#c4b5fd', '#a78bfa', '#7c3aed', '#4c1d95'];
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const wd = d => (d.getDay() + 6) % 7;
// Something counts at a time: a timed thing done, or a focus session.
const moments = computed(() => [
  ...cur.value.done.filter(x => x.task.time).map(x => ({ day: wd(fromIso(x.date)), h: Math.floor(toMins(x.task.time) / 60) })),
  ...cur.value.sessions.map(s => { const d = new Date(s.at); return { day: wd(d), h: d.getHours() }; }),
]);
const weekParts = computed(() => WEEK.map((name, day) => {
  const list = moments.value.filter(m => m.day === day);
  return { name, total: list.length, parts: PARTS.map(([p, a, b], i) => ({ p, n: list.filter(m => m.h >= a && m.h < b).length, shade: PART_SHADES[i] })) };
}));
const maxWeek = computed(() => Math.max(1, ...weekParts.value.map(w => w.total)));
const SLOTS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
const slotLabel = h => (h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`);
const heat = computed(() => SLOTS.map(h => ({ h, cells: WEEK.map((name, day) => ({ name, n: moments.value.filter(m => m.day === day && m.h >= h && m.h < h + 2).length })) })));
const maxHeat = computed(() => Math.max(1, ...heat.value.flatMap(r => r.cells.map(c => c.n))));
const heatShade = n => PART_SHADES[Math.min(4, Math.ceil((n / maxHeat.value) * 4))];
const peak = computed(() => { let b = null; for (const r of heat.value) for (const c of r.cells) if (!b || c.n > b.n) b = { ...c, h: r.h }; return b?.n ? b : null; });

// ---------- kind and size ----------
const byKind = computed(() => Object.entries(KINDS).map(([k, v]) => ({ name: v.label, color: v.color, done: cur.value.done.filter(x => x.task.kind === k).length })).filter(x => x.done).sort((a, b) => b.done - a.done));
const maxKind = computed(() => Math.max(1, ...byKind.value.map(k => k.done)));
const SIZES = [['Quick wins', 'under 30 min', 0, 30], ['Steady', '30 to 90 min', 30, 90], ['Deep work', '90 min or more', 90, 1e9]];
const bySize = computed(() => SIZES.map(([name, sub, a, b]) => ({ name, sub, done: cur.value.done.filter(x => (x.task.mins || 0) >= a && (x.task.mins || 0) < b && (a > 0 || x.task.mins)).length })));
const streaks = computed(() => store.tasks.filter(t => t.repeat && t.kind === 'routine').map(t => ({ t, n: streak(t) })).filter(x => x.n > 1).sort((a, b) => b.n - a.n).slice(0, 3));

// ---------- badges and what it says ----------
const badges = computed(() => {
  const out = [];
  if (byCat.value[0]?.done) out.push({ icon: 'trend', text: `Top: ${byCat.value[0].label}` });
  if (streaks.value[0]) out.push({ icon: 'flame', text: `${streaks.value[0].n}-day streak` });
  if (best.value?.done) out.push({ icon: 'calendar', text: `Best day: ${short(best.value.d)}` });
  if (peak.value) out.push({ icon: 'clock', text: `Peak: ${peak.value.name} ${slotLabel(peak.value.h)}` });
  return out;
});
const conclusions = computed(() => {
  const out = [];
  const cats = byCat.value.filter(c => c.planned >= 3);
  const top = byCat.value[0];
  if (top?.done) out.push({ tone: 'good', text: `${top.label} is where most got done: ${top.done} things${top.focus ? ` and ${hours(top.focus)} of focus` : ''}.` });
  if (doneDelta.value != null) out.push({ tone: doneDelta.value >= 0 ? 'good' : 'warn', text: doneDelta.value >= 0 ? `${doneDelta.value}% more done than the ${RANGES.find(r => r[0] === range.value)[1].toLowerCase()} before.` : `${-doneDelta.value}% less done than the period before. A lighter plan may help.` });
  const slipping = [...cats].sort((a, b) => a.rate - b.rate)[0];
  if (slipping && slipping.rate < 60 && slipping !== top) out.push({ tone: 'warn', text: `${slipping.label} is slipping: ${slipping.rate}% of what was planned is done. Give it one session this week.` });
  if (peak.value) out.push({ tone: 'info', text: `Your peak is ${peak.value.name} around ${slotLabel(peak.value.h)}. Put hard things there.` });
  if (onTime.value != null) out.push({ tone: onTime.value >= 75 ? 'good' : 'warn', text: onTime.value >= 75 ? `${onTime.value}% of dated tasks were done on time.` : `Only ${onTime.value}% of dated tasks were done on time. Fewer things per day, with times, helps.` });
  const deep = bySize.value[2].done; const quick = bySize.value[0].done;
  if (deep + quick) out.push({ tone: 'info', text: deep > quick ? `You lean towards deep work: ${deep} long sessions against ${quick} quick wins.` : `Quick wins carry you: ${quick} short things done. Block one long session for the big ones.` });
  if (!cur.value.focus) out.push({ tone: 'warn', text: 'No focus sessions yet. Start one from Focus: 25 minutes on one thing.' });
  return out.slice(0, 6);
});

// ---------- download ----------
function download() {
  const rows = [['Date', 'Planned', 'Done', 'Focus minutes', 'Assignments and exams done'], ...daily.value.map(x => [x.d, x.planned, x.done, x.focus, x.assign]), [], ['Category', 'Planned', 'Done', 'Completion %', 'Focus minutes', 'Done the period before'], ...byCat.value.map(c => [c.label, c.planned, c.done, c.rate, c.focus, c.before])];
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
        <div class="seg" role="group" aria-label="Range">
          <button v-for="[id, label] in RANGES" :key="id" type="button" :class="{ on: range === id }" :aria-pressed="range === id" :data-test="`rep-${id}`" @click="range = id">{{ label }}</button>
        </div>
        <button type="button" class="ibtn" title="Download as a spreadsheet (CSV)" aria-label="Download as a spreadsheet" data-test="rep-download" @click="download"><Icon name="download" /></button>
      </div>
    </section>

    <!-- Hero number and stat tiles -->
    <section class="rep-top">
      <div class="rep-hero">
        <p class="rep-hero-k">Things done</p>
        <p class="rep-hero-n"><b>{{ doneN }}</b><span>/{{ cur.occ.length }}</span>
          <span v-if="doneDelta != null" class="rep-delta" :class="doneDelta >= 0 ? 'up' : 'down'"><Icon :name="doneDelta >= 0 ? 'trend' : 'right'" :size="12" />{{ pct(doneDelta) }}</span>
          <span class="rep-delta soft">{{ completion }}% of plan</span>
        </p>
        <p class="muted small">{{ prev.done.length ? `vs ${prev.done.length} the period before` : 'Nothing to compare with before' }} · {{ short(prevFrom) }} – {{ short(prevTo) }}</p>
      </div>
      <div class="rep-tiles">
        <div class="rep-stat" data-test="rep-stat">
          <p class="label">Focus</p><b>{{ hours(cur.focus) }}</b>
          <RepMini kind="area" :values="daily.map(x => x.focus)" :label="`Focus each day, ${hours(cur.focus)} in all`" />
          <span class="muted small">{{ cur.sessions.length }} sessions<template v-if="delta(cur.focus, prev.focus) != null"> · <span :class="delta(cur.focus, prev.focus) >= 0 ? 'rep-up' : 'rep-down'">{{ pct(delta(cur.focus, prev.focus)) }}</span></template></span>
        </div>
        <div class="rep-stat" data-test="rep-stat">
          <p class="label">Assignments and exams</p><b>{{ assignments(cur) }}</b>
          <RepMini kind="dots" :values="daily.slice(-14).map(x => x.assign)" :label="`Assignments and exams done in the last two weeks`" />
          <span class="muted small">completed · {{ assignments(prev) }} before</span>
        </div>
        <div class="rep-stat" data-test="rep-stat">
          <p class="label">On time</p><b>{{ onTime == null ? '–' : `${onTime}%` }}</b>
          <RepMini kind="bars" :values="rate.slice(-14)" :max="100" :target="75" :label="`Daily completion against a 75% target`" />
          <span class="muted small">of dated tasks · target line 75%</span>
        </div>
        <div v-if="best" class="rep-stat rep-best" data-test="rep-stat">
          <p class="label">Best day</p><b>{{ fromIso(best.d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }}</b>
          <span class="small">{{ best.done }} done · {{ hours(best.focus) }} focus</span>
          <RepMini kind="step" :values="daily.slice(-14).map(x => x.done)" :label="`Things done each day in the last two weeks`" />
        </div>
      </div>
    </section>

    <!-- Share of what got done, by category -->
    <section v-if="shares.length" class="rep-share" aria-label="Share of what got done by category">
      <div class="rep-share-bar"><i v-for="s in shares" :key="s.label" :style="{ flex: s.n, background: s.color }" :title="`${s.label}: ${s.n} done, ${s.pct}%`" /></div>
      <ul class="rep-share-list">
        <li v-for="s in shares" :key="s.label"><i :style="{ background: s.color }" /><b>{{ s.label }}</b><span>{{ s.n }}</span><span class="rep-pct">{{ s.pct }}%</span></li>
      </ul>
    </section>

    <div class="rep-grid">
      <section class="rep-card rep-wide">
        <div class="rep-card-head">
          <h2>What it says</h2>
          <span class="rep-badges"><span v-for="b in badges" :key="b.text" class="rep-badge"><Icon :name="b.icon" :size="12" />{{ b.text }}</span></span>
        </div>
        <ul class="rep-says" data-test="rep-says">
          <li v-for="(c, i) in conclusions" :key="i" :class="c.tone">{{ c.text }}</li>
          <li v-if="!conclusions.length" class="info">Tick a few things and run a focus session, and Budgie will start drawing conclusions.</li>
        </ul>
      </section>

      <section class="rep-card rep-span2">
        <div class="rep-card-head">
          <div><h2>Every day</h2><p class="rep-big">{{ metric === 'done' ? doneN : metric === 'focus' ? hours(cur.focus) : `${completion}%` }}</p></div>
          <div class="seg rep-seg" role="group" aria-label="Show">
            <button v-for="[id, label] in METRICS" :key="id" type="button" :class="{ on: metric === id }" :aria-pressed="metric === id" :data-test="`rep-metric-${id}`" @click="metric = id">{{ label }}</button>
          </div>
        </div>
        <RepCurve :values="curve" :labels="daily.map(x => fromIso(x.d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))" :ticks="ticks" :format="curveFormat" :name="METRICS.find(m => m[0] === metric)[1]" :height="200" />
      </section>

      <section class="rep-card">
        <div class="rep-card-head"><h2>Against the period before</h2></div>
        <div class="rep-vs" role="img" :aria-label="buckets.map(b => `${b.label}: ${b.now} now, ${b.before} before`).join('; ')">
          <div v-for="b in buckets" :key="b.label" class="rep-vs-col" :title="`${b.range}: ${b.now} done (before: ${b.before})`">
            <span class="rep-vs-bars">
              <i class="before" :style="{ height: `${(b.before / maxBucket) * 100}%` }" />
              <i class="now" :style="{ height: `${(b.now / maxBucket) * 100}%` }"><em v-if="b.now === Math.max(...buckets.map(x => x.now)) && b.now">{{ b.now }}</em></i>
            </span>
            <span class="rep-vs-l">{{ b.label }}</span>
          </div>
        </div>
        <p class="rep-key"><i class="k-now" />This period <i class="k-before" />Before</p>
      </section>

      <section class="rep-card rep-wide" data-test="rep-cats">
        <div class="rep-card-head"><h2>By category</h2><span class="muted small">done · completion · focus · change</span></div>
        <ul class="rep-cats">
          <li v-for="c in byCat" :key="c.key" :style="{ '--c': c.color }">
            <span class="rep-cat-name"><i />{{ c.label }}</span>
            <span class="rep-cat-bar"><b :style="{ width: `${c.rate}%` }" /></span>
            <span class="rep-cat-n"><b>{{ c.done }}</b>/{{ c.planned }}</span>
            <span class="rep-pct">{{ c.rate }}%</span>
            <span class="rep-cat-n muted">{{ c.focus ? hours(c.focus) : '–' }}</span>
            <span class="rep-chg" :class="c.change == null ? 'new' : c.change >= 0 ? 'up' : 'down'">{{ pct(c.change) }}</span>
          </li>
        </ul>
        <p v-if="!byCat.length" class="muted small">Nothing in this range yet.</p>
      </section>

      <section class="rep-card">
        <div class="rep-card-head"><h2>Each weekday, by time of day</h2></div>
        <div class="rep-wk">
          <div v-for="w in weekParts" :key="w.name" class="rep-wk-row" :title="`${w.name}: ${w.parts.map(p => `${p.p} ${p.n}`).join(', ')}`">
            <span class="rep-wk-d">{{ w.name[0] }}</span>
            <span class="rep-wk-track"><span class="rep-wk-fill" :style="{ width: `${(w.total / maxWeek) * 100}%` }"><i v-for="p in w.parts.filter(x => x.n)" :key="p.p" :style="{ flex: p.n, background: p.shade }" /></span></span>
            <b class="rep-wk-n">{{ w.total }}</b>
          </div>
        </div>
        <p class="rep-key"><template v-for="(p, i) in PARTS" :key="p[0]"><i :style="{ background: PART_SHADES[i] }" />{{ p[0] }} </template></p>
      </section>

      <section class="rep-card">
        <div class="rep-card-head"><div><h2>Peak time</h2><p class="muted small">{{ peak ? `Most active: ${peak.name}, ${slotLabel(peak.h)} to ${slotLabel(peak.h + 2)}` : 'Not enough yet' }}</p></div></div>
        <div class="rep-heat" role="img" :aria-label="peak ? `Most active ${peak.name} at ${slotLabel(peak.h)}` : 'No activity yet'">
          <template v-for="r in heat" :key="r.h">
            <span class="rep-heat-y">{{ slotLabel(r.h) }}</span>
            <i v-for="c in r.cells" :key="c.name" :class="{ empty: !c.n }" :style="c.n ? { background: heatShade(c.n) } : {}" :title="`${c.name} ${slotLabel(r.h)}: ${c.n}`" />
          </template>
          <span />
          <span v-for="w in WEEK" :key="w" class="rep-heat-x">{{ w }}</span>
        </div>
      </section>

      <section class="rep-card">
        <div class="rep-card-head"><h2>Kind of thing</h2></div>
        <ul class="rep-list">
          <li v-for="k in byKind" :key="k.name" :style="{ '--c': k.color }"><i />{{ k.name }}<span class="rep-list-bar"><b :style="{ width: `${(k.done / maxKind) * 100}%` }" /></span><b>{{ k.done }}</b></li>
        </ul>
        <p v-if="!byKind.length" class="muted small">Nothing done in this range yet.</p>
      </section>

      <section class="rep-card">
        <div class="rep-card-head"><h2>Size of task</h2></div>
        <ul class="rep-sizes">
          <li v-for="s in bySize" :key="s.name"><span><b>{{ s.name }}</b><span class="muted small">{{ s.sub }}</span></span><span class="rep-pct">{{ s.done }}</span></li>
        </ul>
        <template v-if="streaks.length">
          <h3 class="label rep-sub">Streaks</h3>
          <ul class="rep-list"><li v-for="x in streaks" :key="x.t.id" :style="{ '--c': catColor(x.t) }"><i />{{ x.t.title }}<span /><b>{{ x.n }} days</b></li></ul>
        </template>
      </section>
    </div>
  </div>
</template>
