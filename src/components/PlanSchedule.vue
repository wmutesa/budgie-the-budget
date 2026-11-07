<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { store } from '../lib/store';
import { occurrences, today, addDays, fromIso, toMins, fromMins, KINDS, toggleDone, isDone, makeTask, score, parseTask } from '../lib/tasks';
import TaskEditor from './TaskEditor.vue';
import PlanCalendar from './PlanCalendar.vue';
import Icon from './Icon.vue';
import { toast, loading, finish, fail } from '../lib/toast';
import { addAnything, placeFree, unplace, isIcs } from '../lib/schedule';
import { useDictation, canDictate } from '../lib/dictation';
import MicButton from './MicButton.vue';

// Schedule: the day's activity on the left, grouped by category, and a time
// line on the right with one column per category.
const emit = defineEmits(['view']);
const day = ref(today());
const clock = ref(new Date());
let tick = null;
onMounted(() => { tick = setInterval(() => { clock.value = new Date(); }, 30000); nextTick(scrollToStart); });
onUnmounted(() => clearInterval(tick));
const isToday = computed(() => day.value === today());
const dateLabel = computed(() => fromIso(day.value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
const step = n => { day.value = addDays(day.value, n); };
const listOpen = computed({ get: () => store.planner.schList !== false, set: v => { store.planner.schList = v; } });
const hello = computed(() => {
  const name = (store.me?.name || '').split(' ')[0];
  const h = clock.value.getHours();
  return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${name ? `, ${name}` : ''}.`;
});
// Day is the time line by category; week and month are the calendar grid.
const range = computed({ get: () => (['week', 'month'].includes(store.planner.cal) ? store.planner.cal : 'day'), set: v => { store.planner.cal = v; } });
const openDayFromCal = d => { day.value = d; range.value = 'day'; nextTick(scrollToStart); };

// ---------- categories: your #projects, or the kind of thing ----------
const PALETTE = ['#7c3aed', '#0ea5e9', '#f59e0b', '#16a34a', '#e11d48', '#6366f1'];
const catOf = t => (t.project ? `#${t.project}` : KINDS[t.kind]?.label || 'Task');
const items = computed(() => occurrences(day.value, day.value));
const cats = computed(() => {
  const m = new Map();
  for (const x of items.value) {
    const k = catOf(x.task);
    if (!m.has(k)) m.set(k, { key: k, project: x.task.project || '', kind: x.task.project ? '' : x.task.kind, list: [] });
    m.get(k).list.push(x);
  }
  let i = 0;
  return [...m.values()]
    .sort((a, b) => b.list.length - a.list.length || a.key.localeCompare(b.key))
    .map(c => ({ ...c, label: c.project || c.key, color: c.project ? store.projects[c.project]?.color || PALETTE[i++ % PALETTE.length] : KINDS[c.kind]?.color || '#52525b', done: c.list.filter(x => x.done).length }));
});
const colorOf = key => cats.value.find(c => c.key === key)?.color || '#52525b';
const progress = computed(() => { const all = items.value.length; const done = items.value.filter(x => x.done).length; return { all, done, pct: all ? Math.round((done / all) * 100) : 0 }; });

// ---------- the time line ----------
const HOUR = 64;
const timedAll = computed(() => items.value.filter(x => x.task.time).map(x => { const s = toMins(x.task.time); return { ...x, s, e: s + Math.max(15, x.task.mins || 30), cat: catOf(x.task) }; }));
// Up to four columns; the rest share "Other".
const columns = computed(() => {
  const keys = cats.value.filter(c => timedAll.value.some(x => x.cat === c.key)).map(c => c.key);
  const shown = keys.length > 4 ? keys.slice(0, 3) : keys;
  const cols = shown.map(k => ({ key: k, label: cats.value.find(c => c.key === k).label, color: colorOf(k) }));
  if (keys.length > 4) cols.push({ key: '*other', label: 'Other', color: '#71717a' });
  if (!cols.length) cols.push({ key: '*all', label: 'Your day', color: '#7c3aed' });
  return cols;
});
const colFor = x => (columns.value.some(c => c.key === x.cat) ? x.cat : columns.value[columns.value.length - 1].key);
const startH = computed(() => Math.min(8, ...timedAll.value.map(x => Math.floor(x.s / 60))));
const endH = computed(() => Math.max(21, ...timedAll.value.map(x => Math.ceil(x.e / 60))));
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
  top: `${((x.s - startH.value * 60) / 60) * HOUR + 2}px`,
  height: `${Math.max(26, ((x.e - x.s) / 60) * HOUR - 4)}px`,
  left: `calc(${(x.lane / x.lanes) * 100}% + 6px)`, width: `calc(${100 / x.lanes}% - 12px)`,
  '--c': colorOf(x.cat) === '#52525b' ? '#7c3aed' : colorOf(x.cat),
});
const hhmm = m => fromMins(m);
const nowTop = computed(() => ((clock.value.getHours() * 60 + clock.value.getMinutes() - startH.value * 60) / 60) * HOUR);
const grid = ref(null);
function scrollToStart() {
  if (!grid.value) return;
  const first = timedAll.value.length ? Math.min(...timedAll.value.map(x => x.s)) : 8 * 60;
  const target = isToday.value ? Math.min(nowTop.value - HOUR, ((first - startH.value * 60) / 60) * HOUR) : ((first - startH.value * 60) / 60) * HOUR;
  grid.value.scrollTop = Math.max(0, target - 12);
}
const dur = m => { const n = m || 0; return n ? `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : ''; };

// ---------- adding ----------
const drafts = ref({});
function addTo(c) {
  const v = (drafts.value[c.key] || '').trim();
  if (!v) return;
  const p = parseTask(v);
  store.tasks.unshift(makeTask({ title: p.title, date: p.date || day.value, time: p.time, mins: p.mins, priority: p.priority, repeat: p.repeat, kind: c.kind && !p.project ? (p.kind !== 'task' ? p.kind : c.kind) : p.kind, project: p.project || c.project }));
  drafts.value[c.key] = '';
}
// Click an empty spot on the time line to add something there.
const slot = ref(null);
const slotText = ref('');
const slotInput = ref(null);
function pick(col, e) {
  if (e.target.closest('.sch-box')) return;
  const y = e.offsetY;
  const m = Math.round(((y / HOUR) * 60 + startH.value * 60) / 15) * 15;
  slot.value = { col, m }; slotText.value = '';
  nextTick(() => slotInput.value?.[0]?.focus?.() || slotInput.value?.focus?.());
}
function addSlot() {
  const v = slotText.value.trim(); const s = slot.value; slot.value = null;
  if (!v || !s) return;
  const p = parseTask(v);
  const c = cats.value.find(x => x.key === s.col.key);
  store.tasks.unshift(makeTask({ title: p.title, date: day.value, time: p.time || hhmm(s.m), mins: p.mins || 30, priority: p.priority, kind: c?.kind || p.kind, project: p.project || c?.project || '' }));
}

// ---------- plan my day: give untimed things a free slot ----------
function planDay() {
  const open = items.value.filter(x => !x.task.time && !x.done && !x.task.repeat).map(x => x.task);
  if (!open.length) { toast('Everything on this day already has a time.', { kind: 'info' }); return; }
  const moved = placeFree(open, day.value);
  if (!moved.length) { toast('There is no free time left on this day.', { kind: 'info' }); return; }
  toast(`${moved.length} ${moved.length === 1 ? 'thing has' : 'things have'} a time now.`, { kind: 'success', title: 'Day planned', action: { label: 'Undo', run: () => unplace(moved) } });
}

// ---------- add anything: type, paste, say it, drop a file ----------
const quick = ref('');
const busy = ref(false);
async function addQuick(text = quick.value) {
  const v = String(text || '').trim();
  if (!v || busy.value) return;
  busy.value = true;
  const tid = /:\/\//.test(v) ? loading('Importing your calendar…') : null;
  const r = await addAnything(v, day.value);
  busy.value = false;
  quick.value = '';
  const n = r.made.length;
  const bits = [n && `${n} ${n === 1 ? 'thing' : 'things'} added`, r.links && `${r.links} calendar${r.links === 1 ? '' : 's'} imported`, r.moved.length && `${r.moved.length} given a free time`].filter(Boolean).join(' · ');
  if (r.errors?.length && !n && !r.links) { tid ? fail(tid, r.errors[0]) : toast(r.errors[0], { kind: 'error' }); return; }
  const undo = { label: 'Undo', run: () => { const ids = new Set(r.made.map(t => t.id)); store.tasks = store.tasks.filter(t => !ids.has(t.id)); } };
  if (tid) finish(tid, bits || 'Nothing new.', { title: 'Added' }); else toast(bits || 'Nothing new.', { kind: 'success', title: 'Added', action: n ? undo : undefined });
}
const onQuickKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addQuick(); } };
let base = '';
const dict = useDictation({
  continuous: true,
  onError: m => toast(m, { kind: 'error', title: 'Microphone' }),
  onCancel: () => { quick.value = base; },
  onText: t => { quick.value = `${base}${t}`; },
  onFinal: t => { quick.value = ''; addQuick(`${base}${t}`); },
});
const talk = () => { if (!dict.listening.value) base = quick.value ? `${quick.value}\n` : ''; dict.toggle(); };
// Drop or pick a calendar file (.ics) or a text timetable.
const dragging = ref(false);
const fileIn = ref(null);
async function readFiles(files) {
  dragging.value = false;
  for (const f of [...(files || [])].slice(0, 5)) {
    if (f.size > 2e6) { toast(`${f.name} is too big to read.`, { kind: 'error' }); continue; }
    const text = await f.text();
    if (isIcs(text) || /\.(txt|csv|md|ics)$/i.test(f.name) || f.type.startsWith('text')) await addQuick(text);
    else toast(`${f.name}: drop a calendar file (.ics) or a text list.`, { kind: 'warn' });
  }
}
const onDrop = e => readFiles(e.dataTransfer?.files);

// ---------- editing ----------
const editing = ref(null);
const editRow = ref('');
const tickX = x => toggleDone(x.task, x.date);
</script>

<template>
  <div class="sch" :class="{ 'no-list': !listOpen, dragging }" data-test="schedule" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <div class="sch-bar">
      <h2 class="sch-title">Schedule</h2>
      <div v-if="range === 'day'" class="sch-date">
        <button type="button" class="sch-day" :title="isToday ? 'Today' : 'Back to today'" data-test="sch-today" @click="day = today()"><Icon name="calendar" :size="15" />{{ dateLabel }}</button>
        <button type="button" class="sch-step" title="Previous day" aria-label="Previous day" data-test="sch-prev" @click="step(-1)"><Icon name="left" :size="15" /></button>
        <button type="button" class="sch-step" title="Next day" aria-label="Next day" data-test="sch-next" @click="step(1)"><Icon name="right" :size="15" /></button>
      </div>
      <div class="sch-modes" role="group" aria-label="Range">
        <button v-for="[id, label] in [['day', 'Day'], ['week', 'Week'], ['month', 'Month']]" :key="id" type="button" :class="{ on: range === id }" :aria-pressed="range === id" :data-test="`cal-${id}`" @click="range = id; id === 'day' && nextTick(scrollToStart)">{{ label }}</button>
      </div>
    </div>

    <form class="sch-quick" :class="{ live: dict.listening.value }" @submit.prevent="addQuick()">
      <Icon name="plus" :size="16" />
      <textarea v-model="quick" rows="1" placeholder="Add to your schedule: “gym 6pm”, “MATH 101 TTh 1:30–2:45”, a pasted timetable or a calendar link" aria-label="Add to your schedule" data-test="sch-quick" @keydown="onQuickKey" />
      <MicButton v-if="canDictate" :listening="dict.listening.value" label="Say it" @toggle="talk" />
      <button type="button" class="sch-icon" title="Add a calendar file (.ics) or a text list" aria-label="Add a file" @click="fileIn.click()"><Icon name="download" :size="16" /></button>
      <input ref="fileIn" type="file" accept=".ics,.txt,.csv,text/calendar,text/plain" multiple hidden data-test="sch-file" @change="readFiles($event.target.files); $event.target.value = ''" />
      <button class="btn primary small" :disabled="!quick.trim() || busy" data-test="sch-quick-add">Add</button>
    </form>

    <PlanCalendar v-if="range !== 'day'" embedded class="sch-cal" @day="openDayFromCal" @focus="emit('view', 'Focus')" />
    <div v-else class="sch-body">
      <section v-if="listOpen" class="sch-list" aria-label="Activity">
        <div class="sch-list-head">
          <div><h3>{{ isToday ? 'Today' : dateLabel }} activity</h3><p class="muted small">{{ hello }} {{ progress.done }} of {{ progress.all }} done.</p></div>
          <button type="button" class="sch-icon" title="Hide the list" aria-label="Hide the list" @click="listOpen = false"><Icon name="collapse" :size="16" /></button>
        </div>
        <span class="sch-prog" role="img" :aria-label="`${progress.pct}% done`"><i :style="{ width: `${progress.pct}%` }" /></span>
        <button type="button" class="sch-plan" data-test="plan-day" @click="planDay">Plan my day <Icon name="sparkle" :size="15" /></button>

        <div v-for="c in cats" :key="c.key" class="sch-group" :style="{ '--c': c.color }" :data-cat="c.label">
          <h4><i />{{ c.label }}<span class="muted">{{ c.done }}/{{ c.list.length }}</span></h4>
          <ul>
            <li v-for="x in c.list" :key="x.key" class="sch-row" :class="{ done: x.done }" data-test="sch-row">
              <button type="button" class="sch-check" role="checkbox" :aria-checked="x.done" :aria-label="`${x.done ? 'Undo' : 'Done'}: ${x.task.title}`" @click="tickX(x)"><Icon v-if="x.done" name="check" :size="12" /></button>
              <span class="sch-row-main">
                <span class="sch-row-t">{{ x.task.title }}</span>
                <span class="sch-tags"><span class="sch-tag">{{ KINDS[x.task.kind]?.label }}</span><span v-if="x.task.project" class="sch-tag c">{{ x.task.project }}</span><span v-if="x.task.priority === 'high'" class="sch-tag hi">High</span></span>
              </span>
              <span class="sch-dur">{{ x.task.time ? x.task.time : '' }}<template v-if="x.task.time && x.task.mins"> · </template>{{ dur(x.task.mins) }}</span>
              <button type="button" class="sch-icon" :aria-expanded="editRow === x.key" :aria-label="`Edit ${x.task.title}`" title="Edit" @click="editRow = editRow === x.key ? '' : x.key"><Icon name="more" :size="16" /></button>
              <TaskEditor v-if="editRow === x.key" :task="x.task" @close="editRow = ''" />
            </li>
          </ul>
          <form class="sch-add" @submit.prevent="addTo(c)"><span class="sch-check ghost" aria-hidden="true" /><input v-model="drafts[c.key]" :placeholder="`Add to ${c.label}…`" :aria-label="`Add to ${c.label}`" maxlength="160" /></form>
        </div>
        <div v-if="!cats.length" class="sch-empty">
          <p><b>Nothing planned{{ isToday ? ' today' : '' }}.</b></p>
          <form class="sch-add" @submit.prevent="addTo({ key: '*', project: '', kind: '' })"><span class="sch-check ghost" aria-hidden="true" /><input v-model="drafts['*']" placeholder="Add something, e.g. “Study 2pm 1h #Biology”" aria-label="Add something" maxlength="160" data-test="sch-add-first" /></form>
        </div>
      </section>

      <section class="sch-time" aria-label="Time line">
        <div class="sch-cols-head" :style="{ '--n': columns.length }">
          <span class="sch-axis-h"><button v-if="!listOpen" type="button" class="sch-icon" title="Show the list" aria-label="Show the list" @click="listOpen = true"><Icon name="list" :size="16" /></button><template v-else>{{ isToday ? 'Today' : fromIso(day).toLocaleDateString('en-US', { weekday: 'short' }) }}</template></span>
          <span v-for="col in columns" :key="col.key" class="sch-col-h">{{ col.label }}<i :style="{ background: col.color }" /></span>
        </div>
        <div ref="grid" class="sch-grid" :style="{ '--n': columns.length, '--h': `${HOUR}px` }">
          <div class="sch-axis">
            <span v-for="h in hours" :key="h" :class="{ now: isToday && clock.getHours() === h }" :style="{ top: `${(h - startH) * HOUR}px` }">{{ String(h).padStart(2, '0') }}:00</span>
          </div>
          <div v-for="col in columns" :key="col.key" class="sch-col" :style="{ height: `${(hours.length - 1) * HOUR}px` }" data-test="sch-col" @click="pick(col, $event)">
            <button v-for="x in laid(col.key)" :key="x.key" type="button" class="sch-box" :class="{ done: x.done, short: x.e - x.s < 45 }" :style="boxStyle(x)" data-test="sch-box" @click="editing = x">
              <span class="sch-box-top"><b>{{ x.task.title }}</b><span>{{ hhmm(x.s) }} - {{ hhmm(x.e) }}</span></span>
              <span v-if="x.task.notes && x.e - x.s >= 60" class="sch-box-note">{{ x.task.notes }}</span>
              <span v-if="x.task.subtasks?.length && x.e - x.s >= 60" class="sch-box-subs">
                <label v-for="s in x.task.subtasks" :key="s.id" :class="{ done: s.done }" @click.stop><input v-model="s.done" type="checkbox" />{{ s.title }}</label>
              </span>
            </button>
            <form v-if="slot && slot.col.key === col.key" class="sch-slot" :style="{ top: `${((slot.m - startH * 60) / 60) * HOUR}px` }" @submit.prevent="addSlot" @click.stop>
              <span>{{ hhmm(slot.m) }}</span><input ref="slotInput" v-model="slotText" placeholder="What is it?" aria-label="New item" data-test="sch-slot" @keydown.esc="slot = null" @blur="addSlot" />
            </form>
          </div>
          <div v-if="isToday && nowTop >= 0 && nowTop <= (hours.length - 1) * HOUR" class="sch-now" :style="{ top: `${nowTop}px` }" aria-hidden="true" />
        </div>
      </section>
    </div>

    <div v-if="editing" class="sch-sheet" role="dialog" aria-label="Edit" @keydown.esc="editing = null">
      <div class="sch-sheet-head">
        <button type="button" class="sch-check" role="checkbox" :aria-checked="isDone(editing.task, editing.date)" :aria-label="`Done: ${editing.task.title}`" @click="toggleDone(editing.task, editing.date)"><Icon v-if="isDone(editing.task, editing.date)" name="check" :size="12" /></button>
        <b>{{ editing.task.title }}</b>
        <button type="button" class="sch-icon" title="Close" aria-label="Close" @click="editing = null"><Icon name="x" :size="16" /></button>
      </div>
      <TaskEditor :task="editing.task" @close="editing = null" />
    </div>
  </div>
</template>
