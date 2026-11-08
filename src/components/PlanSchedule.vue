<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, fromIso, isoDay, toMins, fromMins, KINDS, toggleDone, isDone } from '../lib/tasks';
import { startFocus } from '../lib/focus';
import { catKey, catLabel, catColor } from '../lib/cats';
import { nav, go } from '../lib/nav';
import PlanCalendars from './PlanCalendars.vue';
import TaskEditor from './TaskEditor.vue';
import PlanCalendar from './PlanCalendar.vue';
import Icon from './Icon.vue';
import { toast } from '../lib/toast';
import { placeFree, unplace } from '../lib/schedule';

// Schedule: the activity for the day, week or month on the left, grouped by
// category, and on the right the day's time line (one column per category)
// or the week and month calendar, stretched to the list's height.

// The day shown; others (search, the review) can open a day here.
const day = computed({ get: () => nav.day || today(), set: v => { nav.day = v === today() ? '' : v; } });
const clock = ref(new Date());
let tick = null;
onMounted(() => { tick = setInterval(() => { clock.value = new Date(); }, 30000); nextTick(scrollToStart); window.addEventListener('resize', measure); });
onUnmounted(() => { clearInterval(tick); ro?.disconnect(); window.removeEventListener('resize', measure); });
const isToday = computed(() => day.value === today());
const dateLabel = computed(() => fromIso(day.value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
const step = n => { day.value = addDays(day.value, n); };
// The activity list starts open on wide screens and folded on phones.
const wide = ref(typeof window === 'undefined' || window.innerWidth >= 900);
const listOpen = computed({ get: () => store.planner.schList ?? wide.value, set: v => { store.planner.schList = v; } });
// Calendars: link, file, holidays. Opened from the header.
const calOpen = ref(nav.anchor === '#calendars');
const hello = computed(() => {
  const name = (store.me?.name || '').split(' ')[0];
  const h = clock.value.getHours();
  return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${name ? `, ${name}` : ''}.`;
});
// Day is the time line by category; week and month are the calendar grid.
const range = computed({ get: () => (['week', 'month'].includes(store.planner.cal) ? store.planner.cal : 'day'), set: v => { store.planner.cal = v; } });
const openDayFromCal = d => { day.value = d; range.value = 'day'; nextTick(scrollToStart); };

// ---------- categories: your #projects, or the kind of thing ----------
// The week or month the calendar shows, so the list can follow it.
const calRange = ref([today(), today()]);
const span = computed(() => (range.value === 'day' ? [day.value, day.value] : calRange.value));
const items = computed(() => occurrences(day.value, day.value));
const spanItems = computed(() => (range.value === 'day' ? items.value : occurrences(span.value[0], span.value[1])));
// Over a week or month, something that repeats is one row with how many times it was done.
const rows = computed(() => {
  if (range.value === 'day') return spanItems.value;
  const seen = new Map(); const out = [];
  for (const x of spanItems.value) {
    if (!x.task.repeat) { out.push(x); continue; }
    let r = seen.get(x.task.id);
    if (!r) { r = { ...x, key: `r-${x.task.id}`, times: 0, timesDone: 0, summary: true }; seen.set(x.task.id, r); out.push(r); }
    r.times++; if (x.done) r.timesDone++;
  }
  return out;
});
const groupCats = list => {
  const m = new Map();
  for (const x of list) {
    const k = catKey(x.task);
    if (!m.has(k)) m.set(k, { key: k, label: catLabel(x.task), color: catColor(x.task), list: [] });
    m.get(k).list.push(x);
  }
  // Done things sink to the bottom of their category.
  const isDoneRow = x => (x.summary ? x.timesDone === x.times : x.done);
  for (const c of m.values()) c.list.sort((a, b) => isDoneRow(a) - isDoneRow(b));
  return [...m.values()]
    .sort((a, b) => b.list.length - a.list.length || a.key.localeCompare(b.key))
    .map(c => ({ ...c, all: c.list.reduce((n, x) => n + (x.summary ? x.times : 1), 0), done: c.list.reduce((n, x) => n + (x.summary ? x.timesDone : x.done ? 1 : 0), 0) }));
};
const cats = computed(() => groupCats(rows.value));
const dayCats = computed(() => groupCats(items.value));
const colorOf = key => dayCats.value.find(c => c.key === key)?.color || '#52525b';
const progress = computed(() => { const all = spanItems.value.length; const done = spanItems.value.filter(x => x.done).length; return { all, done, pct: all ? Math.round((done / all) * 100) : 0 }; });
const listTitle = computed(() => {
  if (range.value === 'day') return isToday.value ? 'Today' : dateLabel.value;
  const [a] = span.value; const t = today();
  if (range.value === 'month') return fromIso(a).toLocaleDateString('en-US', { month: 'long' });
  return a <= t && t <= span.value[1] ? 'This week' : `Week of ${fromIso(a).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
});
// Over a week or month, categories start folded so the list stays a summary.
const openCats = ref(new Set());
const folded = c => range.value !== 'day' && !openCats.value.has(c.key);
const flip = c => { const s = new Set(openCats.value); s.has(c.key) ? s.delete(c.key) : s.add(c.key); openCats.value = s; };
const rowDate = x => fromIso(x.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

// ---------- the calendar is as tall as the list beside it ----------
const listEl = ref(null);
const headEl = ref(null);
const anyEl = ref(null);
const listH = ref(0);
const headH = ref(0);
let ro = null;
function measure() {
  const side = typeof window !== 'undefined' && window.innerWidth > 900;
  listH.value = side && listOpen.value && listEl.value ? listEl.value.offsetHeight : 0;
  headH.value = (headEl.value?.offsetHeight || 0) + (anyEl.value?.offsetHeight || 0);
}
watch(listEl, (el, old) => {
  if (typeof ResizeObserver === 'undefined') return;
  ro ??= new ResizeObserver(measure);
  if (old) ro.unobserve(old);
  if (el) ro.observe(el);
  measure();
});
watch([listOpen, range, () => items.value.filter(x => !x.task.time).length], () => nextTick(measure));
// A new day opens on its own active hours.
watch(day, () => nextTick(scrollToStart));

// ---------- the time line ----------
const BASE = 64;
// Taller hours when the list is taller than the day; 34px is the grid's top and bottom padding.
const HOUR = computed(() => Math.max(BASE, Math.floor((listH.value - headH.value - 34) / Math.max(1, endH.value - startH.value))));
const timedAll = computed(() => items.value.filter(x => x.task.time).map(x => { const s = toMins(x.task.time); return { ...x, s, e: s + Math.max(15, x.task.mins || 30), cat: catKey(x.task) }; }));
// Up to four columns; the rest share "Other".
const columns = computed(() => {
  // Every category with something today gets a column, timed or not, so the list and the calendar match.
  const keys = dayCats.value.map(c => c.key);
  const shown = keys.length > 4 ? keys.slice(0, 3) : keys;
  const cols = shown.map(k => ({ key: k, label: dayCats.value.find(c => c.key === k).label, color: colorOf(k) }));
  if (keys.length > 4) cols.push({ key: '*other', label: 'Other', color: '#71717a' });
  if (!cols.length) cols.push({ key: '*all', label: 'Your day', color: '#7c3aed' });
  return cols;
});
const colFor = x => (columns.value.some(c => c.key === x.cat) ? x.cat : columns.value[columns.value.length - 1].key);
// Things with no time sit in an "Any time" row at the top of their column.
const untimed = computed(() => items.value.filter(x => !x.task.time).map(x => ({ ...x, cat: catKey(x.task) })).sort((a, b) => a.done - b.done));
const anyFor = key => untimed.value.filter(x => colFor(x) === key);
// The time line spans the planned hours, from the first to the last (at least four hours), at full height with no scrolling.
const startH = computed(() => (timedAll.value.length ? Math.max(0, Math.min(...timedAll.value.map(x => Math.floor(x.s / 60)))) : 8));
const endH = computed(() => { const e = timedAll.value.length ? Math.min(24, Math.max(...timedAll.value.map(x => Math.ceil(x.e / 60)))) : 18; return Math.min(24, Math.max(e, startH.value + 4)); });
// All 24 hours are there; the window shows startH to endH (the hours with activities) and scrolls for the rest.
const hours = computed(() => Array.from({ length: endH.value - startH.value + 1 }, (_, i) => startH.value + i));
// Side-by-side lanes when items in one column overlap.
function laid(key) {
  const list = timedAll.value.filter(x => colFor(x) === key).sort((a, b) => a.s - b.s || b.e - a.e).map(x => ({ ...x }));
  let group = []; let end = -1; const lanes = [];
  const close = () => { const n = Math.max(...group.map(g => g.lane)) + 1; group.forEach(g => { g.lanes = n; }); };
  for (const x of list) {
    if (x.s >= end && group.length) { close(); group = []; lanes.length = 0; }
    let lane = lanes.findIndex(e => e <= x.s);
    if (lane < 0) { lane = lanes.length; lanes.push(x.e); } else lanes[lane] = x.e;
    x.lane = lane; group.push(x); end = Math.max(end, x.e);
  }
  if (group.length) close();
  return list;
}
const boxStyle = x => ({
  top: `${((x.s - startH.value * 60) / 60) * HOUR.value + 2}px`,
  height: `${Math.max(26, ((x.e - x.s) / 60) * HOUR.value - 4)}px`,
  left: `calc(${(x.lane / x.lanes) * 100}% + 6px)`, width: `calc(${100 / x.lanes}% - 12px)`,
  '--c': catColor(x.task),
});
const hhmm = m => fromMins(m);
const nowTop = computed(() => ((clock.value.getHours() * 60 + clock.value.getMinutes() - startH.value * 60) / 60) * HOUR.value);
const grid = ref(null);
// The time line is full height, so there is nothing to scroll inside it.
function scrollToStart() {}
const dur = m => { const n = m || 0; return n ? `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : ''; };

// ---------- plan my day: give untimed things a free slot ----------
function planDay() {
  const open = items.value.filter(x => !x.task.time && !x.done && !x.task.repeat).map(x => x.task);
  if (!open.length) { toast('Everything on this day already has a time.', { kind: 'info' }); return; }
  const moved = placeFree(open, day.value);
  if (!moved.length) { toast('There is no free time left on this day.', { kind: 'info' }); return; }
  toast(`${moved.length} ${moved.length === 1 ? 'thing has' : 'things have'} a time now.`, { kind: 'success', title: 'Day planned', action: { label: 'Undo', run: () => unplace(moved) } });
}

// Jump the time line to now.
// The calendar is full height, so Now scrolls the page to the red line.
function toNow() { if (!isToday.value) day.value = today(); nextTick(() => grid.value?.querySelector('.sch-now')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })); }
// ---------- editing ----------
const editing = ref(null);
const editRow = ref('');
const tickX = x => toggleDone(x.task, x.date);
// Focus on the item open in the edit card.
const focusOn = x => { startFocus(x.task); editing.value = null; go('Focus'); };

// ---------- pick a day from a month calendar ----------
const pickOpen = ref(false);
const pickEl = ref(null);
const pickMonth = ref(day.value.slice(0, 7));
const WEEK_HEAD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const pickDays = computed(() => {
  const first = fromIso(`${pickMonth.value}-01`);
  const start = addDays(isoDay(first), -((first.getDay() + 6) % 7));
  const span = occurrences(start, addDays(start, 41));
  return Array.from({ length: 42 }, (_, i) => { const d = addDays(start, i); return { d, n: fromIso(d).getDate(), other: d.slice(0, 7) !== pickMonth.value, busy: span.some(x => x.date === d) }; });
});
const pickTitle = computed(() => fromIso(`${pickMonth.value}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
const pickStep = n => { const d = fromIso(`${pickMonth.value}-01`); d.setMonth(d.getMonth() + n); pickMonth.value = isoDay(d).slice(0, 7); };
function openPick() { pickMonth.value = day.value.slice(0, 7); pickOpen.value = !pickOpen.value; }
function pickDay(d) { day.value = d; pickOpen.value = false; }

// Opened from search or a notification: open that item on its day.
function openFromNav() {
  if (!nav.task) return;
  const x = items.value.find(o => o.task.id === nav.task);
  nav.task = '';
  if (!x) return;
  if (x.task.time) editing.value = x; else { listOpen.value = true; editRow.value = x.key; }
  nextTick(() => document.querySelector(`[data-task-id="${x.task.id}"]`)?.scrollIntoView({ block: 'center' }));
}
onMounted(() => nextTick(openFromNav));
watch(() => nav.task, () => nextTick(openFromNav));
// A click outside an open card closes it: the edit card, the Calendars panel,
// and the editor under a list row. Date and time pickers float outside their
// card, so clicks in them do not count.
const sheetEl = ref(null);
const calPopEl = ref(null);
function outside(e) {
  const t = e.target;
  if (!(t instanceof Element) || t.closest('.pk-pop')) return;
  if (editing.value && sheetEl.value && !sheetEl.value.contains(t) && !t.closest('.sch-box')) editing.value = null;
  if (calOpen.value && calPopEl.value && !calPopEl.value.contains(t) && !t.closest('[data-test="calendars-open"]')) calOpen.value = false;
  if (editRow.value && t.closest('.sch-row')?.dataset.key !== editRow.value) editRow.value = '';
  if (pickOpen.value && pickEl.value && !pickEl.value.contains(t) && !t.closest('[data-test="sch-today"]')) pickOpen.value = false;
}
onMounted(() => document.addEventListener('mousedown', outside));
onUnmounted(() => document.removeEventListener('mousedown', outside));
</script>

<template>
  <div class="sch" :class="{ 'no-list': !listOpen }" data-test="schedule">
    <div class="sch-bar">
      <h2 class="sch-title">Schedule</h2>
      <div v-if="range === 'day'" class="sch-date">
        <button type="button" class="sch-day" title="Pick a day" :aria-expanded="pickOpen" data-test="sch-today" @click="openPick"><Icon name="calendar" :size="15" />{{ dateLabel }}</button>
        <div v-if="pickOpen" ref="pickEl" class="sch-pick" role="dialog" aria-label="Pick a day" data-test="sch-pick" @keydown.esc="pickOpen = false">
          <div class="sch-pick-head">
            <button type="button" class="sch-step" aria-label="Previous month" @click="pickStep(-1)"><Icon name="left" :size="14" /></button>
            <b>{{ pickTitle }}</b>
            <button type="button" class="sch-step" aria-label="Next month" @click="pickStep(1)"><Icon name="right" :size="14" /></button>
          </div>
          <div class="sch-pick-grid">
            <span v-for="w in WEEK_HEAD" :key="w" class="sch-pick-w">{{ w }}</span>
            <button v-for="c in pickDays" :key="c.d" type="button" class="sch-pick-d" :class="{ other: c.other, today: c.d === today(), on: c.d === day, busy: c.busy }" :aria-label="fromIso(c.d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })" :aria-current="c.d === day ? 'date' : undefined" :data-test="`pick-${c.d}`" @click="pickDay(c.d)">{{ c.n }}</button>
          </div>
          <button type="button" class="sch-pick-today" @click="pickDay(today())">Today</button>
        </div>
        <button type="button" class="sch-step" title="Previous day" aria-label="Previous day" data-test="sch-prev" @click="step(-1)"><Icon name="left" :size="15" /></button>
        <button type="button" class="sch-step" title="Next day" aria-label="Next day" data-test="sch-next" @click="step(1)"><Icon name="right" :size="15" /></button>
      </div>
      <button v-if="range === 'day'" type="button" class="sch-now-btn" title="Jump to now" data-test="sch-now" @click="toNow"><Icon name="clock" :size="14" />Now</button>
      <div class="sch-modes" role="group" aria-label="Range">
        <button v-for="[id, label] in [['day', 'Day'], ['week', 'Week'], ['month', 'Month']]" :key="id" type="button" :class="{ on: range === id }" :aria-pressed="range === id" :data-test="`cal-${id}`" @click="range = id; id === 'day' && nextTick(scrollToStart)">{{ label }}</button>
      </div>
      <button type="button" class="sch-cal-btn" :aria-expanded="calOpen" data-test="calendars-open" @click="calOpen = !calOpen"><Icon name="calendar" :size="15" />Calendars<b v-if="store.feeds.length">{{ store.feeds.length }}</b></button>
      <div v-if="calOpen" ref="calPopEl" class="sch-cal-pop"><PlanCalendars /><button type="button" class="sch-icon sch-cal-x" aria-label="Close" title="Close" @click="calOpen = false"><Icon name="x" :size="16" /></button></div>
    </div>

    <div class="sch-body">
      <section v-if="listOpen" ref="listEl" class="sch-list" aria-label="Activity" data-test="sch-list">
        <div class="sch-list-head">
          <div><h3>{{ listTitle }} activity</h3><p class="muted small">{{ hello }} {{ progress.done }} of {{ progress.all }} done.</p></div>
          <button type="button" class="sch-icon" title="Hide the list" aria-label="Hide the list" @click="listOpen = false"><Icon name="collapse" :size="16" /></button>
        </div>
        <span class="sch-prog" role="img" :aria-label="`${progress.pct}% done`"><i :style="{ width: `${progress.pct}%` }" /></span>
        <button v-if="range === 'day'" type="button" class="sch-plan" data-test="plan-day" @click="planDay">Plan my day <Icon name="sparkle" :size="15" /></button>

        <div v-for="c in cats" :key="c.key" class="sch-group" :style="{ '--c': c.color }" :data-cat="c.label">
          <h4 v-if="range === 'day'"><i />{{ c.label }}<span class="muted">{{ c.done }}/{{ c.all }}</span></h4>
          <h4 v-else><button type="button" class="sch-fold" :aria-expanded="!folded(c)" data-test="sch-fold" @click="flip(c)"><i />{{ c.label }}<span class="sch-fold-bar"><b :style="{ width: `${c.all ? Math.round((c.done / c.all) * 100) : 0}%` }" /></span><span class="muted">{{ c.done }}/{{ c.all }}</span><Icon name="right" :size="13" class="sch-fold-ic" /></button></h4>
          <ul v-if="!folded(c)">
            <li v-for="x in c.list" :key="x.key" class="sch-row" :data-key="x.key" :class="{ done: x.summary ? x.timesDone === x.times : x.done, pending: x.task.pending }" :data-task-id="x.task.time ? null : x.task.id" data-test="sch-row">
              <span v-if="x.summary" class="sch-count" :title="`Done ${x.timesDone} of ${x.times} times`">{{ x.timesDone }}/{{ x.times }}</span>
              <button v-else type="button" class="sch-check" role="checkbox" :aria-checked="x.done" :aria-label="`${x.done ? 'Undo' : 'Done'}: ${x.task.title}`" @click="tickX(x)"><Icon v-if="x.done" name="check" :size="12" /></button>
              <span class="sch-row-main">
                <span class="sch-row-t">{{ x.task.title }}</span>
                <span class="sch-tags"><span v-if="range !== 'day'" class="sch-tag">{{ x.summary ? 'Repeats' : rowDate(x) }}</span><span class="sch-tag">{{ KINDS[x.task.kind]?.label }}</span><span v-if="x.task.project" class="sch-tag c">{{ x.task.project }}</span><span v-if="x.task.priority === 'high'" class="sch-tag hi">High</span></span>
              </span>
              <span class="sch-dur">{{ x.task.time ? x.task.time : '' }}<template v-if="x.task.time && x.task.mins"> · </template>{{ dur(x.task.mins) }}</span>
              <button type="button" class="sch-icon" :aria-expanded="editRow === x.key" :aria-label="`Edit ${x.task.title}`" title="Edit" @click="editRow = editRow === x.key ? '' : x.key"><Icon name="more" :size="16" /></button>
              <TaskEditor v-if="editRow === x.key" :task="x.task" @close="editRow = ''" />
            </li>
          </ul>
        </div>
        <div v-if="!cats.length" class="sch-empty">
          <p><b>Nothing planned{{ range === 'day' ? (isToday ? ' today' : '') : range === 'week' ? ' this week' : ' this month' }}.</b></p>
          <p class="muted small">Tap <b>Add</b> and say what is coming up.</p>
        </div>
      </section>

      <PlanCalendar v-if="range !== 'day'" embedded class="sch-cal" :fill="listH" :class="{ 'with-list': listOpen }" @day="openDayFromCal" @focus="go('Focus')" @range="r => (calRange = r)" @list="listOpen = true" :list-hidden="!listOpen" />
      <section v-else class="sch-time" aria-label="Time line">
        <div ref="headEl" class="sch-cols-head" :style="{ '--n': columns.length }">
          <span class="sch-axis-h"><button v-if="!listOpen" type="button" class="sch-icon" title="Show the list" aria-label="Show the list" @click="listOpen = true"><Icon name="list" :size="16" /></button><template v-else>{{ isToday ? 'Today' : fromIso(day).toLocaleDateString('en-US', { weekday: 'short' }) }}</template></span>
          <span v-for="col in columns" :key="col.key" class="sch-col-h" :style="{ '--c': col.color }">{{ col.label }}<i /></span>
        </div>
        <div v-if="untimed.length" ref="anyEl" class="sch-any" :style="{ '--n': columns.length }" data-test="sch-any">
          <span class="sch-any-h">Any time</span>
          <div v-for="col in columns" :key="col.key" class="sch-any-col">
            <button v-for="x in anyFor(col.key)" :key="x.key" type="button" class="sch-chip" :class="{ done: x.done }" :style="{ '--c': catColor(x.task) }" :data-task-id="x.task.id" data-test="sch-chip" @click="editing = x">{{ x.task.title }}</button>
          </div>
        </div>
        <div ref="grid" class="sch-grid" :style="{ '--n': columns.length, '--h': `${HOUR}px` }">
          <div class="sch-axis">
            <span v-for="h in hours" :key="h" :class="{ now: isToday && clock.getHours() === h }" :style="{ top: `${(h - startH) * HOUR}px` }">{{ String(h).padStart(2, '0') }}:00</span>
          </div>
          <div v-for="col in columns" :key="col.key" class="sch-col" :style="{ height: `${(hours.length - 1) * HOUR}px` }" data-test="sch-col">
            <button v-for="x in laid(col.key)" :key="x.key" type="button" class="sch-box" :class="{ done: x.done, short: x.e - x.s < 45, long: x.e - x.s >= 90, narrow: x.lanes > 1, pending: x.task.pending }" :style="boxStyle(x)" :data-task-id="x.task.id" data-test="sch-box" @click="editing = x">
              <span class="sch-box-time">{{ hhmm(x.s) }} – {{ hhmm(x.e) }}<Icon name="more" :size="14" class="sch-box-more" /></span>
              <b class="sch-box-title">{{ x.task.title }}</b>
              <span v-if="x.task.notes && x.e - x.s >= 60" class="sch-box-note">{{ x.task.notes }}</span>
              <span v-if="x.task.subtasks?.length && x.e - x.s >= 60" class="sch-box-subs">
                <label v-for="s in x.task.subtasks" :key="s.id" :class="{ done: s.done }" @click.stop><input v-model="s.done" type="checkbox" />{{ s.title }}</label>
              </span>
            </button>
          </div>
          <div v-if="isToday && nowTop >= 0 && nowTop <= (hours.length - 1) * HOUR" class="sch-now" :style="{ top: `${nowTop}px` }" aria-hidden="true" />
        </div>
      </section>
    </div>

    <div v-if="editing" ref="sheetEl" class="sch-sheet" role="dialog" aria-label="Edit" @keydown.esc="editing = null">
      <div class="sch-sheet-head">
        <button type="button" class="sch-check" role="checkbox" :aria-checked="isDone(editing.task, editing.date)" :aria-label="`Done: ${editing.task.title}`" @click="toggleDone(editing.task, editing.date)"><Icon v-if="isDone(editing.task, editing.date)" name="check" :size="12" /></button>
        <b>{{ editing.task.title }}</b>
        <button v-if="!isDone(editing.task, editing.date)" type="button" class="sch-icon" title="Focus on it for 25 minutes" aria-label="Focus on it" data-test="sheet-focus" @click="focusOn(editing)"><Icon name="play" :size="16" /></button>
        <button type="button" class="sch-icon" title="Close" aria-label="Close" @click="editing = null"><Icon name="x" :size="16" /></button>
      </div>
      <TaskEditor :task="editing.task" @close="editing = null" />
    </div>
  </div>
</template>
