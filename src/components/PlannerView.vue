<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { store } from '../lib/store';
import { parseTask, addFromText, occurrences, openTasks, summary, today, addDays, dayLabel, fromIso, isoDay, timeLabel, toMins, isDone, toggleDone, KINDS, streak } from '../lib/tasks';
import { refreshFeeds } from '../lib/calendar';
import TaskRow from './TaskRow.vue';
import PlanSuggest from './PlanSuggest.vue';
import PlanSchedule from './PlanSchedule.vue';
import Icon from './Icon.vue';
import { toast } from '../lib/toast';
import { focus, startFocus, finishFocus, stopFocus, mmss } from '../lib/focus';
import { nav, go } from '../lib/nav';
let showDoneFirst = false;

// Planner: school, work, projects, routines and events in one place.
// Type or say anything; Budgie works out the date, time, repeat and priority.
const VIEWS = [['Schedule', 'clock'], ['Tasks', 'list'], ['Agenda', 'agenda'], ['Focus', 'target']];
// The Schedule is new: show it once to everyone, then remember their choice.
if (!store.planner.schSeen) { store.planner.schSeen = true; if (!nav.task) store.planner.view = 'Schedule'; }
// Schedule and calendar are one view now; it opens on the day.
if (!store.planner.schOne) { store.planner.schOne = true; store.planner.cal = 'day'; }
const view = computed({ get: () => (['Week', 'Calendar'].includes(store.planner.view) ? 'Schedule' : VIEWS.some(([v]) => v === store.planner.view) ? store.planner.view : 'Tasks'), set: v => { store.planner.view = v; } });
const now = ref(today());
const clock = ref(new Date());
let tick = null;
// Something asked to open one item (search): show it in the task list.
if (nav.anchor === '#calendars') store.planner.view = 'Schedule';
if (nav.task) {
  const t = store.tasks.find(x => x.id === nav.task);
  if (t) { store.planner.view = 'Tasks'; if (t.done && !t.repeat) showDoneFirst = true; }
}
onMounted(() => {
  refreshFeeds();
  tick = setInterval(() => { clock.value = new Date(); now.value = today(); }, 30000);
});
onUnmounted(() => clearInterval(tick));

// Notes from reminders and such.
const flash = ref('');

// ---------- filters ----------
const project = ref('');
const projects = computed(() => [...new Set(store.tasks.map(t => t.project).filter(Boolean))].sort());
const inFilter = t => !project.value || t.project === project.value;

// ---------- Tasks view ----------
const showDone = ref(showDoneFirst);
const groups = computed(() => {
  const d = now.value;
  const one = store.tasks.filter(t => !t.repeat && !t.done && inFilter(t));
  const sorted = list => [...list].sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || (a.time || '99').localeCompare(b.time || '99') || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  const rows = [
    ['Overdue', one.filter(t => t.date && t.date < d)],
    ['Today', one.filter(t => t.date === d)],
    ['Tomorrow', one.filter(t => t.date === addDays(d, 1))],
    ['This week', one.filter(t => t.date > addDays(d, 1) && t.date <= addDays(d, 7))],
    ['Later', one.filter(t => t.date > addDays(d, 7))],
    ['Any time', one.filter(t => !t.date)],
  ].map(([name, list]) => ({ name, list: sorted(list) }));
  rows.push({ name: 'Routines and classes', list: store.tasks.filter(t => t.repeat && inFilter(t)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')), repeating: true });
  if (groupBy.value === 'category') {
    // One column per #project, or per kind when there is no project.
    const all = [...one.filter(t => !t.date || t.date >= addDays(d, -60)), ...store.tasks.filter(t => t.repeat && inFilter(t))];
    const m = new Map();
    for (const t of all) { const k = t.project ? `#${t.project}` : (KINDS[t.kind]?.label || 'Task'); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
    return [...m.entries()].map(([name, list]) => ({ name, list: sorted(list), color: list[0].project ? store.projects[list[0].project]?.color : KINDS[list[0].kind]?.color })).sort((a, b) => b.list.length - a.list.length);
  }
  return rows.filter(g => g.list.length);
});
// Columns stay short: the first few, then "Show more".
const LIMIT = 6;
const expanded = ref(new Set());
const more = name => { const s = new Set(expanded.value); s.has(name) ? s.delete(name) : s.add(name); expanded.value = s; };
const visible = g => (expanded.value.has(g.name) || g.list.length <= LIMIT + 1 ? g.list : g.list.slice(0, LIMIT));
// Opened from search: make sure that item's column shows it.
if (nav.task) { const t = store.tasks.find(x => x.id === nav.task); if (t) expanded.value = new Set(['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'Any time', 'Routines and classes']); }
const groupBy = computed({ get: () => (store.planner.groupBy === 'category' ? 'category' : 'when'), set: v => { store.planner.groupBy = v; } });
// Overdue: bring everything to today in one go.
function allToToday(g) { const d = now.value; const was = g.list.map(t => [t, t.date]); g.list.forEach(t => { t.date = d; }); toast(`${was.length} moved to today.`, { kind: 'success', action: { label: 'Undo', run: () => was.forEach(([t, x]) => { t.date = x; }) } }); }
const doneList = computed(() => store.tasks.filter(t => !t.repeat && t.done && inFilter(t)).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 30));

// ---------- Agenda ----------
const agenda = computed(() => {
  const items = occurrences(now.value, addDays(now.value, 13)).filter(x => inFilter(x.task));
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(now.value, i);
    days.push({ name: d, date: d, list: items.filter(x => x.date === d) });
  }
  return days;
});

// ---------- Focus ----------
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
// ---------- reminders on this device ----------
const canNotify = typeof Notification !== 'undefined';
async function toggleRemind() {
  if (!store.planner.remind && canNotify && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission().catch(() => 'denied');
    if (p !== 'granted') { flash.value = 'Notifications are blocked for this site in your browser settings.'; return; }
  }
  store.planner.remind = !store.planner.remind;
}
const greeting = computed(() => { const h = clock.value.getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; });
</script>

<template>
  <div class="pln span-12" data-test="planner">
    <section class="pln-head">
      <div>
        <p class="label">{{ greeting }}</p>
        <h1>Planner</h1>
        <p class="pln-sum" data-test="planner-summary">{{ summary(now) }}</p>
        <p v-if="flash" class="pln-err small" role="alert">{{ flash }}</p>
      </div>
      <div class="pln-head-right">
        <div class="seg pln-views" role="tablist" aria-label="Planner views">
          <button v-for="[v, ic] in VIEWS" :key="v" type="button" role="tab" :aria-selected="view === v" :class="{ on: view === v }" :title="v" :data-test="`view-${v.toLowerCase()}`" @click="view = v"><Icon :name="ic" :size="15" /><span class="pln-vlabel">{{ v }}</span></button>
        </div>
        <button v-if="canNotify" type="button" class="ibtn" :class="{ on: store.planner.remind }" :aria-pressed="store.planner.remind" :title="store.planner.remind ? 'Reminders on: tap to turn off' : 'Remind me 10 minutes before timed items'" :aria-label="store.planner.remind ? 'Turn reminders off' : 'Turn reminders on'" data-test="remind" @click="toggleRemind"><Icon :name="store.planner.remind ? 'bell' : 'bell-off'" /></button>
      </div>
    </section>


    <div v-if="projects.length && view !== 'Schedule'" class="pln-filter" role="group" aria-label="Filter by project">
      <button type="button" class="chip-btn" :class="{ on: !project }" @click="project = ''">Everything</button>
      <button v-for="p in projects" :key="p" type="button" class="chip-btn" :class="{ on: project === p }" @click="project = project === p ? '' : p">#{{ p }}</button>
    </div>

    <div v-if="focus.task && view !== 'Focus'" class="pln-focusbar" role="status">
      <Icon name="target" /><b>{{ focus.task.title }}</b><span class="pln-clock small">{{ mmss(focus.left) }}</span>
      <button type="button" class="ibtn ghost" :title="focus.running ? 'Pause' : 'Resume'" :aria-label="focus.running ? 'Pause' : 'Resume'" @click="focus.running = !focus.running"><Icon :name="focus.running ? 'pause' : 'play'" /></button>
      <button type="button" class="ibtn ghost" title="Mark done" aria-label="Mark done" @click="finishFocus"><Icon name="check" /></button>
    </div>

    <template v-if="view === 'Schedule'">
      <PlanSchedule @view="v => view = v" />
    </template>
    <div v-else class="pln-body" :class="{ cols: view === 'Tasks' || view === 'Agenda' }">
      <div class="pln-main">
        <!-- Tasks: columns, by when or by category; each column stays short -->
        <template v-if="view === 'Tasks'">
          <div class="pln-cols-bar">
            <span class="muted small">Group by</span>
            <div class="seg" role="group" aria-label="Group by">
              <button type="button" :class="{ on: groupBy === 'when' }" :aria-pressed="groupBy === 'when'" data-test="group-when" @click="groupBy = 'when'">When</button>
              <button type="button" :class="{ on: groupBy === 'category' }" :aria-pressed="groupBy === 'category'" data-test="group-category" @click="groupBy = 'category'">Category</button>
            </div>
          </div>
          <div v-if="groups.length" class="pln-cols">
            <section v-for="g in groups" :key="g.name" class="pln-group pln-col" :class="{ late: g.name === 'Overdue' }" :style="g.color ? { '--c': g.color } : {}" :data-group="g.name">
              <h2 class="pln-gh"><i v-if="g.color" class="pln-col-dot" />{{ g.name }} <span class="muted">{{ g.list.length }}</span>
                <button v-if="g.name === 'Overdue'" type="button" class="pln-col-act" data-test="overdue-today" @click="allToToday(g)">Move all to today</button>
              </h2>
              <ul class="tk-list"><TaskRow v-for="t in visible(g)" :key="t.id" :task="t" :show-date="!['Today', 'Tomorrow'].includes(g.name)" /></ul>
              <button v-if="g.list.length > LIMIT + 1" type="button" class="pln-more" :aria-expanded="expanded.has(g.name)" @click="more(g.name)">{{ expanded.has(g.name) ? 'Show fewer' : `Show ${g.list.length - LIMIT} more` }}</button>
            </section>
          </div>
          <div v-if="!groups.length" class="pln-empty">
            <h2>Your planner is clear</h2>
            <p>Tap Add and say what is coming up, or bring in your school calendar from the Schedule.</p>
          </div>
          <div v-if="doneList.length" class="pln-group">
            <button type="button" class="notice-link" :aria-expanded="showDone" @click="showDone = !showDone">{{ showDone ? 'Hide' : 'Show' }} {{ doneList.length }} done</button>
            <ul v-if="showDone" class="tk-list"><TaskRow v-for="t in doneList" :key="t.id" :task="t" /></ul>
          </div>
        </template>

        <!-- Agenda: the next two weeks, one column per day -->
        <template v-else-if="view === 'Agenda'">
          <div class="pln-cols">
            <section v-for="d in agenda" :key="d.date" class="pln-group pln-col" :class="{ today: d.date === now }" data-test="agenda-day">
              <h2 class="pln-gh">{{ dayLabel(d.date, now) }} <span class="muted">{{ fromIso(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }}</span></h2>
              <ul v-if="d.list.length" class="tk-list"><TaskRow v-for="x in visible(d)" :key="x.key" :task="x.task" :date="x.date" :show-date="false" /></ul>
              <p v-else class="muted small pln-free">Free</p>
              <button v-if="d.list.length > LIMIT + 1" type="button" class="pln-more" @click="more(d.name)">{{ expanded.has(d.name) ? 'Show fewer' : `Show ${d.list.length - LIMIT} more` }}</button>
            </section>
          </div>
        </template>

        <!-- Focus: what matters now -->
        <template v-else>
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
            <p v-if="Math.max(0, ...routineToday.map(x => streak(x.task))) > 1" class="muted small">Best streak: {{ Math.max(0, ...routineToday.map(x => streak(x.task))) }} days in a row.</p>
          </div>
        </template>
      </div>

      <aside class="pln-side">
        <PlanSuggest />
      </aside>
    </div>
  </div>
</template>
