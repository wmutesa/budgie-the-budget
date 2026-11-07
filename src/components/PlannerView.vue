<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { store } from '../lib/store';
import { parseTask, addFromText, occurrences, openTasks, summary, today, addDays, dayLabel, fromIso, isoDay, timeLabel, toMins, isDone, toggleDone, KINDS, streak } from '../lib/tasks';
import { refreshFeeds } from '../lib/calendar';
import { useDictation, canDictate } from '../lib/dictation';
import TaskRow from './TaskRow.vue';
import MicButton from './MicButton.vue';
import PlanSuggest from './PlanSuggest.vue';
import PlanRoutine from './PlanRoutine.vue';
import PlanCalendars from './PlanCalendars.vue';
import PlanCalendar from './PlanCalendar.vue';
import Icon from './Icon.vue';
import { focus, startFocus, finishFocus, stopFocus, mmss } from '../lib/focus';
import { nav } from '../lib/nav';
let showDoneFirst = false;

// Planner: school, work, projects, routines and events in one place.
// Type or say anything; Budgie works out the date, time, repeat and priority.
const VIEWS = [['Tasks', 'list'], ['Agenda', 'agenda'], ['Calendar', 'calendar'], ['Focus', 'target']];
const view = computed({ get: () => (store.planner.view === 'Week' ? 'Calendar' : VIEWS.some(([v]) => v === store.planner.view) ? store.planner.view : 'Tasks'), set: v => { store.planner.view = v; } });
const now = ref(today());
const clock = ref(new Date());
let tick = null;
// Something asked to open one item (search): show it in the task list.
if (nav.task) {
  const t = store.tasks.find(x => x.id === nav.task);
  if (t) { store.planner.view = 'Tasks'; if (t.done && !t.repeat) showDoneFirst = true; }
}
onMounted(() => {
  refreshFeeds();
  tick = setInterval(() => { clock.value = new Date(); now.value = today(); }, 30000);
});
onUnmounted(() => clearInterval(tick));

// ---------- quick add ----------
const entry = ref('');
const flash = ref('');
const preview = computed(() => (entry.value.trim() ? parseTask(entry.value.split('\n')[0]) : null));
function add() {
  const text = entry.value.trim();
  if (!text) return;
  const made = addFromText(text);
  const first = made[0];
  flash.value = made.length > 1 ? `Added ${made.length} items.` : `Added “${first.title}”${first.date ? ` for ${dayLabel(first.date).toLowerCase()}` : ''}${first.time ? ` at ${timeLabel(first.time)}` : ''}.`;
  setTimeout(() => { flash.value = ''; }, 2500);
  entry.value = '';
}
let baseText = '';
const dict = useDictation({
  continuous: false,
  onCancel: () => { entry.value = baseText; },
  onText: t => { entry.value = `${baseText}${t}`; },
  onFinal: () => {},
});
const toggleDictate = () => { if (!dict.listening.value) baseText = entry.value ? `${entry.value.trim()} ` : ''; dict.toggle(); };

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
  return rows.filter(g => g.list.length);
});
const doneList = computed(() => store.tasks.filter(t => !t.repeat && t.done && inFilter(t)).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 30));

// ---------- Agenda ----------
const agenda = computed(() => {
  const items = occurrences(now.value, addDays(now.value, 13)).filter(x => inFilter(x.task));
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(now.value, i);
    const list = items.filter(x => x.date === d);
    if (list.length || i === 0) days.push({ date: d, list });
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
      </div>
      <div class="pln-head-right">
        <div class="seg pln-views" role="tablist" aria-label="Planner views">
          <button v-for="[v, ic] in VIEWS" :key="v" type="button" role="tab" :aria-selected="view === v" :class="{ on: view === v }" :title="v" :data-test="`view-${v.toLowerCase()}`" @click="view = v"><Icon :name="ic" :size="15" /><span class="pln-vlabel">{{ v }}</span></button>
        </div>
        <button v-if="canNotify" type="button" class="ibtn" :class="{ on: store.planner.remind }" :aria-pressed="store.planner.remind" :title="store.planner.remind ? 'Reminders on: tap to turn off' : 'Remind me 10 minutes before timed items'" :aria-label="store.planner.remind ? 'Turn reminders off' : 'Turn reminders on'" data-test="remind" @click="toggleRemind"><Icon :name="store.planner.remind ? 'bell' : 'bell-off'" /></button>
      </div>
    </section>

    <section class="pln-add" :class="{ live: dict.listening.value }">
      <div class="pln-add-row">
        <span class="pln-plus" aria-hidden="true">+</span>
        <textarea v-model="entry" rows="1" class="pln-input" placeholder="Add anything, like “Essay due Fri 5pm” or “Gym MWF 6pm”" aria-label="Add to planner" data-test="plan-add" @keydown.enter.exact.prevent="add" />
        <MicButton v-if="canDictate" :listening="dict.listening.value" label="Say it" @toggle="toggleDictate" />
        <button type="button" class="ibtn primary" :disabled="!entry.trim()" title="Add (Enter)" aria-label="Add" data-test="plan-add-btn" @click="add"><Icon name="plus" /></button>
      </div>
      <p v-if="preview" class="pln-chips" aria-live="polite" data-test="plan-preview">
        <span class="pln-chip k" :style="{ '--k': KINDS[preview.kind].color }">{{ KINDS[preview.kind].label }}</span>
        <span v-for="c in preview.found" :key="c" class="pln-chip">{{ c }}</span>
        <span class="muted small">“{{ preview.title }}”</span>
      </p>
      <p v-else-if="flash" class="pln-chips pln-ok" role="status">{{ flash }}</p>
      <p v-else class="pln-chips muted small">Dates, times, repeats (“every Mon”, “3x a week”), #projects, ! for priority and $ for costs are picked up for you.</p>
    </section>

    <div v-if="projects.length" class="pln-filter" role="group" aria-label="Filter by project">
      <button type="button" class="chip-btn" :class="{ on: !project }" @click="project = ''">Everything</button>
      <button v-for="p in projects" :key="p" type="button" class="chip-btn" :class="{ on: project === p }" @click="project = project === p ? '' : p">#{{ p }}</button>
    </div>

    <div v-if="focus.task && view !== 'Focus'" class="pln-focusbar" role="status">
      <Icon name="target" /><b>{{ focus.task.title }}</b><span class="pln-clock small">{{ mmss(focus.left) }}</span>
      <button type="button" class="ibtn ghost" :title="focus.running ? 'Pause' : 'Resume'" :aria-label="focus.running ? 'Pause' : 'Resume'" @click="focus.running = !focus.running"><Icon :name="focus.running ? 'pause' : 'play'" /></button>
      <button type="button" class="ibtn ghost" title="Mark done" aria-label="Mark done" @click="finishFocus"><Icon name="check" /></button>
    </div>

    <div class="pln-body">
      <div class="pln-main">
        <!-- Tasks: grouped by when -->
        <template v-if="view === 'Tasks'">
          <div v-for="g in groups" :key="g.name" class="pln-group" :data-group="g.name">
            <h2 class="pln-gh">{{ g.name }} <span class="muted">{{ g.list.length }}</span></h2>
            <ul class="tk-list"><TaskRow v-for="t in g.list" :key="t.id" :task="t" :show-date="!['Today', 'Tomorrow'].includes(g.name)" /></ul>
          </div>
          <div v-if="!groups.length" class="pln-empty">
            <h2>Your planner is clear</h2>
            <p>Add a deadline, a class or a habit above, import your school calendar, or let Budgie build a daily routine for you.</p>
          </div>
          <div v-if="doneList.length" class="pln-group">
            <button type="button" class="notice-link" :aria-expanded="showDone" @click="showDone = !showDone">{{ showDone ? 'Hide' : 'Show' }} {{ doneList.length }} done</button>
            <ul v-if="showDone" class="tk-list"><TaskRow v-for="t in doneList" :key="t.id" :task="t" /></ul>
          </div>
        </template>

        <!-- Agenda: the next two weeks, day by day -->
        <template v-else-if="view === 'Agenda'">
          <div v-for="d in agenda" :key="d.date" class="pln-group" data-test="agenda-day">
            <h2 class="pln-gh">{{ dayLabel(d.date, now) }} <span class="muted">{{ fromIso(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }}</span></h2>
            <ul v-if="d.list.length" class="tk-list"><TaskRow v-for="x in d.list" :key="x.key" :task="x.task" :date="x.date" :show-date="false" /></ul>
            <p v-else class="muted small">Nothing planned.</p>
          </div>
        </template>

        <!-- Calendar: day, week and month, like a calendar app -->
        <template v-else-if="view === 'Calendar'">
          <PlanCalendar :filter="inFilter" @focus="view = 'Focus'" />
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
        <PlanRoutine />
        <PlanCalendars />
      </aside>
    </div>
  </div>
</template>
