<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, onUpdated, watch } from 'vue';
import { store } from '../lib/store';
import {
  occurrences, today, addDays, fromIso, isoDay, toMins, fromMins, timeLabel, KINDS, toggleDone, isDone,
  parseTask, makeTask, skipDay, duplicateTask, removeTask, score, dayLabel,
} from '../lib/tasks';
import { breakDown } from '../lib/breakdown';
import { startFocus } from '../lib/focus';
import { ai, aiSuggestTasks } from '../lib/ai';
import { plannerFacts } from '../lib/suggest';
import { catColor } from '../lib/cats';
import TaskEditor from './TaskEditor.vue';
import { deleteTask } from '../lib/undo';
import Icon from './Icon.vue';

// A calendar like the ones you know: day, week and month, with a time grid.
// Click an item for its actions, a day to open it,
// drag an item to move it.
// Inside the Schedule (embedded) it shows week and month; a day opens the
// Schedule's own day time line.
// `fill`: the height to grow to (the Schedule's activity list), 0 for its own size.
const props = defineProps({ filter: { type: Function, default: () => true }, embedded: { type: Boolean, default: false }, fill: { type: Number, default: 0 }, listHidden: { type: Boolean, default: false } });
const emit = defineEmits(['focus', 'day', 'range', 'list']);
const MODES = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
const mode = computed({ get: () => (['day', 'week', 'month'].includes(store.planner.cal) ? store.planner.cal : 'week'), set: v => { store.planner.cal = v; } });
const anchor = ref(today());
// Pixels per hour: 48, or taller to fill `fill`.
const root = ref(null);
const monthEl = ref(null);
const over = ref(0);
const HOUR = computed(() => (props.fill && mode.value !== 'month' ? Math.max(48, Math.floor((props.fill - over.value - 2) / Math.max(1, endH.value - startH.value))) : 48));
const monthFill = computed(() => (props.fill && mode.value === 'month' ? Math.max(0, props.fill - over.value) : 0));
const clock = ref(new Date());
let tick = null;

// ---------- ranges ----------
const weekStart = iso => { const d = fromIso(iso); return addDays(iso, -((d.getDay() + 6) % 7)); };
const days = computed(() => {
  if (mode.value === 'day') return [anchor.value];
  if (mode.value === 'week') return Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor.value), i));
  const first = fromIso(anchor.value); first.setDate(1);
  const start = weekStart(isoDay(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
});
// Tell the Schedule which days are shown (the month itself, not the weeks around it).
watch(days, d => {
  if (mode.value !== 'month') return emit('range', [d[0], d[d.length - 1]]);
  const a = fromIso(anchor.value); a.setDate(1); const b = new Date(a); b.setMonth(b.getMonth() + 1); b.setDate(0);
  emit('range', [isoDay(a), isoDay(b)]);
}, { immediate: true });
const items = computed(() => occurrences(days.value[0], days.value[days.value.length - 1]).filter(x => props.filter(x.task)));
const title = computed(() => {
  const a = fromIso(days.value[0]);
  if (mode.value === 'day') return fromIso(anchor.value).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (mode.value === 'month') return fromIso(anchor.value).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const b = fromIso(days.value[6]);
  return `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString('en-US', a.getMonth() === b.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}, ${b.getFullYear()}`;
});
const step = n => { anchor.value = mode.value === 'month' ? (() => { const d = fromIso(anchor.value); d.setDate(1); d.setMonth(d.getMonth() + n); return isoDay(d); })() : addDays(anchor.value, n * (mode.value === 'day' ? 1 : 7)); };
const goToday = () => { anchor.value = today(); nextTick(scrollToNow); };

// ---------- time grid layout ----------
// Timed items with side-by-side lanes when they overlap.
function timed(d) {
  const list = items.value.filter(x => x.date === d && x.task.time).map(x => {
    const s = toMins(x.task.time);
    return { ...x, s, e: s + Math.max(15, x.task.mins ?? 45) };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  const lanes = [];
  let group = [];
  let groupEnd = -1;
  const close = () => { const n = Math.max(...group.map(g => g.lane)) + 1; group.forEach(g => { g.lanes = n; }); };
  for (const x of list) {
    if (x.s >= groupEnd && group.length) { close(); group = []; lanes.length = 0; }
    let lane = lanes.findIndex(end => end <= x.s);
    if (lane < 0) { lane = lanes.length; lanes.push(x.e); } else lanes[lane] = x.e;
    x.lane = lane; group.push(x); groupEnd = Math.max(groupEnd, x.e);
  }
  if (group.length) close();
  return list;
}
const boxStyle = x => ({
  top: `${(x.s / 60) * HOUR.value}px`, height: `${Math.max(18, ((x.e - x.s) / 60) * HOUR.value - 2)}px`,
  left: `calc(${(x.lane / x.lanes) * 100}% + 2px)`, width: `calc(${100 / x.lanes}% - 4px)`, '--k': catColor(x.task),
});
const nowTop = computed(() => ((clock.value.getHours() * 60 + clock.value.getMinutes()) / 60) * HOUR.value);
// Full size, no inner scrolling: show 7 AM to 10 PM, widened to fit anything earlier or later.
const startH = computed(() => Math.min(7, ...items.value.filter(x => x.task.time).map(x => Math.floor(toMins(x.task.time) / 60))));
const endH = computed(() => Math.max(22, ...items.value.filter(x => x.task.time).map(x => Math.min(24, Math.ceil((toMins(x.task.time) + (x.task.mins || 45)) / 60)))));
// All 24 hours are there; the window shows startH to endH (the hours with activities) and scrolls for the rest.
const hours = computed(() => Array.from({ length: 24 }, (_, i) => i));
const winHeight = computed(() => (endH.value - startH.value) * HOUR.value + 2);
const hourLabel = h => (h === 0 ? '' : timeLabel(fromMins(h * 60)).replace(':00', ''));
const grid = ref(null);
// Open on the active hours; in the week with today, follow now once it is past them.
function scrollToNow() {
  if (!grid.value) return;
  let target = startH.value * HOUR.value;
  if (days.value.includes(today())) { const n = nowTop.value; if (n > target + winHeight.value - 2) target = Math.max(0, n - HOUR.value * 2); }
  grid.value.scrollTop = target;
}
// Everything around the hours or the month cells, so the rest can fill `fill`.
function measureOver() {
  if (!props.fill || !root.value) return;
  const inner = mode.value === 'month' ? monthEl.value : grid.value;
  if (!inner) return;
  const v = root.value.offsetHeight - inner.offsetHeight;
  if (Math.abs(v - over.value) > 1) over.value = v;
}
onUpdated(measureOver);

// ---------- month layout ----------
const monthOf = computed(() => fromIso(anchor.value).getMonth());
// Habits that happen every day fold into one line so the month stays readable.
const monthItems = d => items.value.filter(x => x.date === d && x.task.kind !== 'routine').sort((a, b) => a.done - b.done);
const habitsOn = d => items.value.filter(x => x.date === d && x.task.kind === 'routine');
const openDay = d => { if (props.embedded) { emit('day', d); mode.value = 'day'; return; } anchor.value = d; mode.value = 'day'; nextTick(scrollToNow); };

// ---------- the floating card ----------
// { kind: 'new', date, time, x, y } or { kind: 'item', item, x, y, editing }
const pop = ref(null);
const popEl = ref(null);
const popStyle = ref({});
const draft = ref('');
const ideas = ref([]);
const thinking = ref(false);
const note = ref('');
async function place(e) {
  await nextTick();
  if (!popEl.value) return;
  if (window.innerWidth < 640) { popStyle.value = {}; return; }
  const r = popEl.value.getBoundingClientRect();
  const x = Math.min(e.clientX + 12, window.innerWidth - r.width - 12);
  const y = Math.min(Math.max(12, e.clientY - 20), window.innerHeight - r.height - 12);
  popStyle.value = { left: `${Math.max(12, x)}px`, top: `${y}px` };
}
// Click an empty part of a day: add something at that time.
function newAt(e, date, timedClick) {
  // Adding happens with the Add button; in the Schedule a click on a day opens it.
  if (props.embedded) { if (!timedClick) openDay(date); return; }
  if (dragging.value) return;
  let time = '';
  if (timedClick) {
    const r = e.currentTarget.getBoundingClientRect();
    const mins = Math.floor((((e.clientY - r.top) / HOUR.value) * 60) / 30) * 30;
    time = fromMins(Math.min(23 * 60 + 30, Math.max(0, mins)));
  }
  pop.value = { kind: 'new', date, time };
  draft.value = ''; ideas.value = []; note.value = '';
  place(e);
  nextTick(() => popEl.value?.querySelector('input')?.focus());
}
const unscheduled = computed(() => store.tasks.filter(t => !t.repeat && !t.done && !t.time && (!t.date || t.date >= today())).sort((a, b) => score(b) - score(a)).slice(0, 4));
function addHere() {
  const text = draft.value.trim();
  if (!text) return;
  const p = parseTask(text);
  const at = pop.value;
  store.tasks.unshift(makeTask({
    title: p.title, kind: p.kind, priority: p.priority, project: p.project,
    repeat: p.repeat, mins: p.mins || (at.time ? 60 : null), date: p.date && p.date !== today() ? p.date : at.date, time: p.time || at.time,
  }));
  pop.value = null;
}
function scheduleHere(t) { Object.assign(t, { date: pop.value.date, time: pop.value.time || t.time, mins: t.mins || (pop.value.time ? 60 : null) }); pop.value = null; }
async function aiIdeas() {
  thinking.value = true; note.value = '';
  const at = pop.value;
  const facts = [...plannerFacts(), `Free slot: ${dayLabel(at.date)}${at.time ? ` at ${timeLabel(at.time)}` : ''}. Suggest what fits there.`];
  const list = await aiSuggestTasks(facts).catch(() => null);
  if (list?.length) ideas.value = list; else note.value = ai.ready ? 'No ideas this time.' : 'The AI is still starting on this device.';
  thinking.value = false;
}
function addIdea(x) { store.tasks.unshift(makeTask({ title: x.title, notes: x.why, date: pop.value.date, time: pop.value.time, mins: pop.value.time ? 60 : null, source: 'ai' })); pop.value = null; }

// Click an item: its card with actions.
function openItem(e, x) {
  if (dragging.value) return;
  pop.value = { kind: 'item', item: x, editing: false };
  place(e);
}
const cur = computed(() => (pop.value?.kind === 'item' ? pop.value.item : null));
const curDone = computed(() => cur.value && isDone(cur.value.task, cur.value.date));
const splitting = ref(false);
async function split() { splitting.value = true; await breakDown(cur.value.task); splitting.value = false; }
const act = {
  done: () => toggleDone(cur.value.task, cur.value.date),
  tomorrow: () => { cur.value.task.date = addDays(cur.value.date, 1); pop.value = null; },
  skip: () => { skipDay(cur.value.task, cur.value.date); pop.value = null; },
  copy: () => { duplicateTask(cur.value.task); pop.value = null; },
  focus: () => { startFocus(cur.value.task); emit('focus'); pop.value = null; },
  remove: () => { const t = cur.value.task; pop.value = null; deleteTask(t); },
};

// ---------- drag to move ----------
const dragging = ref(null);
function dragStart(e, x) { dragging.value = x; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.key); }
function dropOn(e, date, timedDrop) {
  const x = dragging.value;
  if (!x) return;
  const t = x.task;
  if (timedDrop) {
    const r = e.currentTarget.getBoundingClientRect();
    const grab = Number(e.dataTransfer.getData('grab') || 0);
    t.time = fromMins(Math.min(23 * 60 + 45, Math.max(0, Math.round((((e.clientY - r.top - grab) / HOUR.value) * 60) / 15) * 15)));
  } else if (!timedDrop && mode.value !== 'month') t.time = '';
  if (!t.repeat) t.date = date;
  setTimeout(() => { dragging.value = null; }, 0);
}

// ---------- keys ----------
function onKey(e) {
  if (e.target.closest?.('input, textarea, select')) return;
  if (e.key === 'Escape') pop.value = null;
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key.toLowerCase() === 't') goToday();
  else if (e.key.toLowerCase() === 'd') { if (props.embedded) emit('day', anchor.value); mode.value = 'day'; }
  else if (e.key.toLowerCase() === 'w') mode.value = 'week';
  else if (e.key.toLowerCase() === 'm') mode.value = 'month';
}
const outside = e => { if (pop.value && popEl.value && !popEl.value.contains(e.target) && !e.target.closest('.cal-item, .cal-col, .cal-allday-cell, .cal-mcell, .pk-pop')) pop.value = null; };
onMounted(() => {
  tick = setInterval(() => { clock.value = new Date(); }, 60000);
  document.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', outside);
  nextTick(() => { scrollToNow(); measureOver(); });
});
onUnmounted(() => { clearInterval(tick); document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', outside); });
watch(mode, () => { pop.value = null; nextTick(() => { scrollToNow(); measureOver(); }); });
// Another week opens on its own active hours.
watch(anchor, () => nextTick(scrollToNow));
watch(() => props.fill, () => nextTick(measureOver));
const dayHead = d => { const x = fromIso(d); return { name: x.toLocaleDateString('en-US', { weekday: 'short' }), num: x.getDate() }; };
</script>

<template>
  <div ref="root" class="cal" data-test="calendar">
    <div class="cal-bar">
      <button v-if="listHidden" type="button" class="sch-icon" title="Show the list" aria-label="Show the list" @click="emit('list')"><Icon name="list" :size="16" /></button>
      <span class="cal-nav">
        <button type="button" class="ibtn ghost" :title="`Previous ${mode}`" :aria-label="`Previous ${mode}`" @click="step(-1)"><Icon name="left" /></button>
        <button type="button" class="ibtn ghost" :title="`Next ${mode}`" :aria-label="`Next ${mode}`" @click="step(1)"><Icon name="right" /></button>
      </span>
      <h2 class="cal-title">{{ title }}</h2>
      <div v-if="!embedded" class="seg cal-modes" role="group" aria-label="Calendar range">
        <button v-for="[id, label] in MODES" :key="id" type="button" :class="{ on: mode === id }" :aria-pressed="mode === id" :title="`${label} (${label[0]})`" :data-test="`cal-${id}`" @click="mode = id">{{ label }}</button>
      </div>
    </div>

    <!-- Month -->
    <div v-if="mode === 'month'" ref="monthEl" class="cal-month" :class="{ fill: monthFill }" :style="monthFill ? { minHeight: `${monthFill}px` } : {}" data-test="cal-month">
      <span v-for="n in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="n" class="cal-mhead">{{ n }}</span>
      <div v-for="d in days" :key="d" class="cal-mcell" :class="{ other: fromIso(d).getMonth() !== monthOf, today: d === today() }" @click.self="newAt($event, d, false)" @dragover.prevent @drop="dropOn($event, d, false)">
        <button type="button" class="cal-mnum" :aria-label="`Open ${d}`" @click="openDay(d)">{{ fromIso(d).getDate() }}</button>
        <button v-for="x in monthItems(d).slice(0, 3)" :key="x.key" type="button" class="cal-item chip" :class="{ done: x.done }" :style="{ '--k': catColor(x.task) }" draggable="true" @dragstart="dragStart($event, x)" @click="openItem($event, x)">
          <i />{{ x.task.time ? `${timeLabel(x.task.time).replace(':00', '').replace(' ', '').toLowerCase()} ` : '' }}{{ x.task.title }}
        </button>
        <button v-if="monthItems(d).length > 3" type="button" class="cal-more" @click="openDay(d)">{{ monthItems(d).length - 3 }} more</button>
        <button v-if="habitsOn(d).length" type="button" class="cal-habits" :title="habitsOn(d).map(x => x.task.title).join(', ')" @click="openDay(d)"><i :style="{ '--p': Math.round(habitsOn(d).filter(x => x.done).length / habitsOn(d).length * 100) }" />{{ habitsOn(d).filter(x => x.done).length }}/{{ habitsOn(d).length }} habits</button>
      </div>
    </div>

    <!-- Day and week: a time grid -->
    <div v-else class="cal-tgrid">
      <div class="cal-head" :style="{ '--cols': days.length }">
        <span class="cal-gutter" />
        <button v-for="d in days" :key="d" type="button" class="cal-dh" :class="{ today: d === today() }" @click="openDay(d)">
          <span>{{ dayHead(d).name }}</span><b>{{ dayHead(d).num }}</b>
        </button>
      </div>
      <div ref="grid" class="cal-grid win" :style="{ '--cols': days.length, '--hour': `${HOUR}px`, '--win': `${winHeight}px` }" data-test="cal-grid">
        <div class="cal-hours">
          <span v-for="h in hours" :key="h" :style="{ height: `${HOUR}px` }">{{ hourLabel(h) }}</span>
        </div>
        <div v-for="d in days" :key="d" class="cal-col" :class="{ today: d === today() }" :style="{ height: `${hours.length * HOUR}px` }" :data-date="d" @click.self="newAt($event, d, true)" @dragover.prevent @drop="dropOn($event, d, true)">
          <div v-if="d === today() && nowTop >= 0 && nowTop <= hours.length * HOUR" class="cal-now" :style="{ top: `${nowTop}px` }" aria-hidden="true" />
          <button v-for="x in timed(d)" :key="x.key" type="button" class="cal-item box" :class="{ done: x.done, short: x.e - x.s < 40 }" :style="boxStyle(x)" draggable="true" data-test="cal-item" @dragstart="dragStart($event, x)" @click="openItem($event, x)">
            <span class="cal-box-time">{{ timeLabel(x.task.time) }}<template v-if="x.task.mins"> – {{ timeLabel(fromMins(x.s + x.task.mins)) }}</template></span><b>{{ x.task.title }}</b>
          </button>
        </div>
      </div>
      <p class="muted small cal-tip">Click an item for its actions, drag it to move it, or click a day to open it. Keys: ← → T D W M.</p>
    </div>

    <!-- The card for a slot or an item -->
    <Teleport to="body">
      <div v-if="pop" ref="popEl" class="cal-pop" :class="{ wide: pop.editing }" :style="popStyle" role="dialog" :aria-label="pop.kind === 'new' ? 'Add to calendar' : cur.task.title" data-test="cal-pop">
        <template v-if="pop.kind === 'new'">
          <div class="cal-pop-head">
            <span class="label">{{ dayLabel(pop.date) }}{{ pop.time ? ` · ${timeLabel(pop.time)}` : ' · all day' }}</span>
            <button type="button" class="ibtn ghost" title="Close" aria-label="Close" @click="pop = null"><Icon name="x" /></button>
          </div>
          <form class="cal-new" @submit.prevent="addHere">
            <input v-model="draft" placeholder="What is happening? e.g. “Study group 2h #Chem”" aria-label="New item" data-test="cal-new" />
            <button class="ibtn primary" :disabled="!draft.trim()" title="Add" aria-label="Add"><Icon name="plus" /></button>
          </form>
          <div v-if="unscheduled.length" class="cal-pop-sec">
            <p class="label">Schedule here</p>
            <button v-for="t in unscheduled" :key="t.id" type="button" class="cal-pick" :style="{ '--k': catColor(t) }" @click="scheduleHere(t)"><i />{{ t.title }}<Icon name="plus" :size="14" /></button>
          </div>
          <div class="cal-pop-sec">
            <button v-if="ai.enabled" type="button" class="ibtn ai" :disabled="thinking" data-test="cal-ai" @click="aiIdeas"><Icon name="sparkle" :size="14" />{{ thinking ? 'Thinking…' : 'Ideas for this slot' }}</button>
            <button v-for="x in ideas" :key="x.title" type="button" class="cal-pick ai" :title="x.why" @click="addIdea(x)"><Icon name="sparkle" :size="13" />{{ x.title }}<Icon name="plus" :size="14" /></button>
            <p v-if="note" class="muted small">{{ note }}</p>
          </div>
        </template>
        <template v-else-if="cur">
          <div class="cal-pop-head" :style="{ '--k': catColor(cur.task) }">
            <span class="cal-pop-kind"><i />{{ KINDS[cur.task.kind]?.label }}<template v-if="cur.task.project"> · #{{ cur.task.project }}</template></span>
            <button type="button" class="ibtn ghost" title="Close" aria-label="Close" @click="pop = null"><Icon name="x" /></button>
          </div>
          <h3 class="cal-pop-title" :class="{ done: curDone }">{{ cur.task.title }}</h3>
          <p class="muted small">{{ dayLabel(cur.date) }}{{ cur.task.time ? ` · ${timeLabel(cur.task.time)}` : '' }}{{ cur.task.mins ? ` · ${cur.task.mins} min` : '' }}{{ cur.task.repeat ? ' · repeats' : '' }}</p>
          <p v-if="cur.task.notes && !pop.editing" class="cal-pop-notes small">{{ cur.task.notes }}</p>
          <ul v-if="cur.task.subtasks?.length && !pop.editing" class="tk-subs small">
            <li v-for="s in cur.task.subtasks" :key="s.id"><label><input v-model="s.done" type="checkbox" /> {{ s.title }}</label></li>
          </ul>
          <div class="cal-acts" role="toolbar" aria-label="Actions">
            <button type="button" class="ibtn" :class="{ primary: !curDone }" :title="curDone ? 'Undo' : 'Mark done'" :aria-label="curDone ? 'Undo' : 'Mark done'" data-test="cal-done" @click="act.done"><Icon :name="curDone ? 'refresh' : 'check'" /></button>
            <button type="button" class="ibtn" title="Edit" aria-label="Edit" data-test="cal-edit" @click="pop.editing = !pop.editing"><Icon name="edit" /></button>
            <button type="button" class="ibtn ai" :disabled="splitting" title="Break into steps with AI" aria-label="Break into steps" data-test="cal-breakdown" @click="split"><Icon name="sparkle" /></button>
            <button v-if="!curDone" type="button" class="ibtn" title="Focus for 25 minutes" aria-label="Focus" @click="act.focus"><Icon name="play" /></button>
            <button v-if="!cur.task.repeat" type="button" class="ibtn" title="Move to the next day" aria-label="Move to the next day" @click="act.tomorrow"><Icon name="right" /></button>
            <button v-else type="button" class="ibtn" title="Skip this day" aria-label="Skip this day" @click="act.skip"><Icon name="x" /></button>
            <button type="button" class="ibtn" title="Duplicate" aria-label="Duplicate" @click="act.copy"><Icon name="copy" /></button>
            <a v-if="cur.task.link" class="ibtn" :href="cur.task.link" target="_blank" rel="noopener noreferrer" title="Open in calendar" aria-label="Open in calendar"><Icon name="external" /></a>
            <button type="button" class="ibtn danger" title="Delete" aria-label="Delete" @click="act.remove"><Icon name="trash" /></button>
          </div>
          <TaskEditor v-if="pop.editing" :task="cur.task" @close="pop.editing = false" />
        </template>
      </div>
    </Teleport>
  </div>
</template>
