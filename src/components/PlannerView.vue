<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { store } from '../lib/store';
import { parseTask, addFromText, occurrences, summary, today, addDays, dayLabel, fromIso, isoDay, timeLabel, isDone, KINDS } from '../lib/tasks';
import { refreshFeeds } from '../lib/calendar';
import TaskRow from './TaskRow.vue';
import PlanSchedule from './PlanSchedule.vue';
import Icon from './Icon.vue';
import { toast } from '../lib/toast';
import { focus, finishFocus, mmss } from '../lib/focus';
import { nav, go } from '../lib/nav';
import { catKey, catColor } from '../lib/cats';
let showDoneFirst = false;

// Planner: school, work, projects, routines and events in one place.
// Focus has its own page in the navbar.
// Type or say anything; Budgie works out the date, time, repeat and priority.
const VIEWS = [['Schedule', 'clock'], ['Tasks', 'list'], ['Agenda', 'agenda']];
// The Schedule is new: show it once to everyone, then remember their choice.
if (!store.planner.schSeen) { store.planner.schSeen = true; if (!nav.task) store.planner.view = 'Schedule'; }
// Schedule and calendar are one view now; it opens on the day.
if (!store.planner.schOne) { store.planner.schOne = true; store.planner.cal = 'day'; }
const view = computed({ get: () => (['Week', 'Calendar', 'Focus'].includes(store.planner.view) ? 'Schedule' : VIEWS.some(([v]) => v === store.planner.view) ? store.planner.view : 'Tasks'), set: v => { store.planner.view = v; } });
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
// One column per #project, or per kind when there is no project, most recent first.
const groups = computed(() => {
  const d = now.value;
  const one = store.tasks.filter(t => !t.repeat && !t.done && inFilter(t));
  // Done things go last (a routine ticked today), then by date, time and priority.
  const doneNow = t => (isDone(t, d) ? 1 : 0);
  const sorted = list => [...list].sort((a, b) => doneNow(a) - doneNow(b) || (a.date || '9').localeCompare(b.date || '9') || (a.time || '99').localeCompare(b.time || '99') || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  const all = [...one.filter(t => !t.date || t.date >= addDays(d, -60)), ...store.tasks.filter(t => t.repeat && inFilter(t))];
  const m = new Map();
  for (const t of all) { const k = catKey(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
  // Most recently added or ticked category first.
  const recent = list => list.reduce((m, t) => [t.createdAt, t.doneAt, ...(t.doneDates || [])].reduce((x, v) => (v && v > x ? v : x), m), '');
  return [...m.entries()].map(([name, list]) => ({ name, list: sorted(list), color: catColor(list[0]), recent: recent(list) })).sort((a, b) => b.recent.localeCompare(a.recent) || b.list.length - a.list.length);
});
// Columns stay short: the first few, then "Show more".
const LIMIT = 6;
const expanded = ref(new Set());
const more = name => { const s = new Set(expanded.value); s.has(name) ? s.delete(name) : s.add(name); expanded.value = s; };
const visible = g => (expanded.value.has(g.name) || g.list.length <= LIMIT + 1 ? g.list : g.list.slice(0, LIMIT));
// Opened from search: make sure that item's column shows it.
if (nav.task) { const t = store.tasks.find(x => x.id === nav.task); if (t) expanded.value = new Set([catKey(t)]); }
const doneList = computed(() => store.tasks.filter(t => !t.repeat && t.done && inFilter(t)).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 30));

// ---------- Agenda ----------
const agenda = computed(() => {
  const items = occurrences(now.value, addDays(now.value, 13)).filter(x => inFilter(x.task));
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(now.value, i);
    days.push({ name: d, date: d, list: items.filter(x => x.date === d).sort((a, b) => a.done - b.done) });
  }
  return days;
});

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
      </div>
    </section>


    <div v-if="(projects.length || view === 'Tasks') && view !== 'Schedule'" class="pln-filter" role="group" aria-label="Filter by project">
      <button type="button" class="chip-btn" :class="{ on: !project }" @click="project = ''">Everything</button>
      <button v-for="p in projects" :key="p" type="button" class="chip-btn" :class="{ on: project === p }" @click="project = project === p ? '' : p">#{{ p }}</button>
      
    </div>

    <div v-if="focus.task" class="pln-focusbar" role="status">
      <Icon name="target" /><b>{{ focus.task.title }}</b><span class="pln-clock small">{{ mmss(focus.left) }}</span>
      <button type="button" class="ibtn ghost" :title="focus.running ? 'Pause' : 'Resume'" :aria-label="focus.running ? 'Pause' : 'Resume'" @click="focus.running = !focus.running"><Icon :name="focus.running ? 'pause' : 'play'" /></button>
      <button type="button" class="ibtn ghost" title="Mark done" aria-label="Mark done" @click="finishFocus"><Icon name="check" /></button>
    </div>

    <template v-if="view === 'Schedule'">
      <PlanSchedule @view="v => view = v" />
    </template>
    <div v-else class="pln-body cols">
      <div class="pln-main">
        <!-- Tasks: columns, by when or by category; each column stays short -->
        <template v-if="view === 'Tasks'">
          <div v-if="groups.length" class="pln-cols">
            <section v-for="g in groups" :key="g.name" class="pln-group pln-col" :style="g.color ? { '--c': g.color } : {}" :data-group="g.name">
              <h2 class="pln-gh"><i v-if="g.color" class="pln-col-dot" />{{ g.name }} <span class="muted">{{ g.list.length }}</span>
              </h2>
              <ul class="tk-list"><TaskRow v-for="t in visible(g)" :key="t.id" :task="t" /></ul>
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
        <template v-else>
          <div class="pln-cols">
            <section v-for="d in agenda" :key="d.date" class="pln-group pln-col" :class="{ today: d.date === now }" data-test="agenda-day">
              <h2 class="pln-gh">{{ dayLabel(d.date, now) }} <span class="muted">{{ fromIso(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }}</span></h2>
              <ul v-if="d.list.length" class="tk-list"><TaskRow v-for="x in visible(d)" :key="x.key" :task="x.task" :date="x.date" :show-date="false" /></ul>
              <p v-else class="muted small pln-free">Free</p>
              <button v-if="d.list.length > LIMIT + 1" type="button" class="pln-more" @click="more(d.name)">{{ expanded.has(d.name) ? 'Show fewer' : `Show ${d.list.length - LIMIT} more` }}</button>
            </section>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>
