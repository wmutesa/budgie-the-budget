<script setup>
import { ref, computed, onMounted } from 'vue';
import { adminSummary, invitePerson } from '../lib/account';
import { toast } from '../lib/toast';
import Icon from './Icon.vue';

// The owner's Admin view: how Taskie is doing for everyone, as counts and
// states only. Nobody's tasks or words are shown here. Logs are kept 30 days.
const props = defineProps({ section: { type: String, default: 'People' } });
const data = ref(null);
const error = ref('');
const busy = ref(false);
async function load() {
  busy.value = true; error.value = '';
  try { data.value = await adminSummary(); } catch (e) { error.value = e.message || 'Could not load.'; }
  busy.value = false;
}
onMounted(load);

const ago = t => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};
const kb = b => (b >= 1e6 ? `${(b / 1e6).toFixed(2)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const people = computed(() => data.value?.people || []);
const thisBuild = typeof document !== 'undefined' ? document.querySelector('script[type="module"][src*="assets/"]')?.getAttribute('src') || '' : '';
const u = computed(() => data.value?.usage?.totals || {});
const usageRows = computed(() => [
  ['Live words (Whisper)', (u.value['live-final-whisper'] || 0) + (u.value['live-partial-whisper'] || 0), (u.value['live-final-whisper-empty'] || 0) + (u.value['live-partial-whisper-empty'] || 0)],
  ['Live words (Gemini, own key)', (u.value['live-final-gemini'] || 0) + (u.value['live-partial-gemini'] || 0), 0],
  ['Live words that failed', u.value['live-failed'] || 0, 0],
  ['Breakdowns (Taskie AI)', u.value['split-budgie'] || 0, u.value['split-budgie-failed'] || 0],
]);
// The models behind recording and sorting, with this week's use, misses and speed.
const avg = (msKey, keys) => { const n = keys.reduce((a, k) => a + (u.value[k] || 0), 0); return n ? Math.round((u.value[msKey] || 0) / n) : null; };
const models = computed(() => [
  { name: 'Whisper large v3 turbo', job: 'Writes down what you say, phrase by phrase', where: 'Cloudflare Workers AI', calls: (u.value['live-final-whisper'] || 0) + (u.value['live-partial-whisper'] || 0) + (u.value['live-final-whisper-empty'] || 0) + (u.value['live-partial-whisper-empty'] || 0), misses: (u.value['live-final-whisper-empty'] || 0) + (u.value['live-partial-whisper-empty'] || 0), ms: avg('ms-whisper', ['live-final-whisper', 'live-partial-whisper', 'live-final-whisper-empty', 'live-partial-whisper-empty']), state: 'In use' },
  { name: 'Gemini Flash (own key)', job: 'Writes down and sorts, for people with their own key', where: 'Google', calls: (u.value['live-final-gemini'] || 0) + (u.value['live-partial-gemini'] || 0), misses: 0, ms: avg('ms-gemini-live', ['live-final-gemini', 'live-partial-gemini']), state: 'Optional' },
  { name: 'Llama 3.3 70B', job: 'Splits what was said into tasks, routines, events and goals', where: 'Cloudflare Workers AI', calls: (u.value['split-budgie'] || 0) + (u.value['split-budgie-failed'] || 0), misses: u.value['split-budgie-failed'] || 0, ms: avg('ms-split-budgie', ['split-budgie']), state: 'In use · teacher for training' },
  { name: 'Qwen 2.5 (0.5B and 1.5B)', job: 'On-device splitting when the server is unreachable', where: "The person's browser", calls: null, misses: null, ms: null, state: 'Fallback · to be fine-tuned daily from Nov 9' },
  { name: 'Taskie rules', job: 'Title Case, nonsense filter, run-on splitting, spoken punctuation, no repeats', where: 'The app', calls: null, misses: null, ms: null, state: 'Always on' },
]);
// Calendars across everyone: how many people added each one, and whether it is working.
const calHealth = computed(() => {
  const m = new Map();
  for (const p of people.value) for (const f of p.feeds) { const r = m.get(f.name) || { name: f.name, people: 0, failing: 0, events: 0 }; r.people++; r.events += f.count || 0; if (f.error) r.failing++; m.set(f.name, r); }
  return [...m.values()].sort((a, b) => b.people - a.people || b.failing - a.failing);
});
const learnedTotal = computed(() => people.value.reduce((n, p) => n + (p.learned || 0), 0));
// Invite someone from here.
const inviteName = ref(''); const inviteLink = ref('');
async function invite() {
  const name = inviteName.value.trim(); if (!name) return;
  try { const r = await invitePerson(name); inviteLink.value = r.link; inviteName.value = ''; toast(`Invite for ${name} ready. It works once and expires in ${r.expiresInDays} days.`, { kind: 'success' }); }
  catch (e) { toast(e.message || 'The invite could not be made.', { kind: 'error' }); }
}
// Download what this page shows, as a spreadsheet.
function csv() {
  const rows = {
    People: [['Person', 'Role', 'Last seen', 'Passkeys', 'Signed in', 'Open tasks', 'Tasks', 'Added this week', 'Locked in min', 'Recordings'], ...people.value.map(p => [p.name, p.role, p.lastSeen ? new Date(p.lastSeen).toISOString() : '', p.passkeys, p.sessions, p.open, p.tasks, p.added, p.focusMins, p.recordings])],
    Voice: [['Where', 'Recordings', 'Heard', 'Empty', 'Failed', 'Mic blocked', 'Mic muted', 'Quiet rescued'], ...(data.value?.voice || []).map(v => [v.where, v.recordings, v.heard, v.empty, v.failed, v.micBlocked, v.silent, v.quietRescued])],
    Models: [['Model', 'Job', 'Where', 'Calls', 'Misses', 'Avg ms', 'State'], ...models.value.map(m => [m.name, m.job, m.where, m.calls ?? '', m.misses ?? '', m.ms ?? '', m.state])],
    Errors: [['Message', 'Times', 'Last', 'Where'], ...(data.value?.errors || []).map(e => [e.msg, e.n, new Date(e.last).toISOString(), e.where])],
    Sync: [['Person', 'Saves', 'Conflicts', 'Bytes'], ...people.value.map(p => [p.name, p.version, p.conflicts, p.bytes])],
    'AI usage': [['What', 'Calls', 'Empty or failed'], ...usageRows.value],
    Calendars: [['Calendar', 'People', 'Failing', 'Events'], ...calHealth.value.map(c => [c.name, c.people, c.failing, c.events])],
  }[props.section] || [];
  const text = rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = `budgie-admin-${props.section.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const DESC = {
  People: 'Who uses Taskie, how recently, and how much.',
  Models: 'The models that write down and sort what people say: how much they were used, how often they missed, and how fast they were.',
  Voice: 'Recording health by device and browser: what was heard, what was not, and why.',
  Errors: 'What broke in the app, and which version each device is running.',
  Sync: 'Saving between devices: conflicts, and how full each account is.',
  'AI usage': 'How often the speech and planning AIs were used this week, and how often they failed.',
  Calendars: 'Calendars people connected, and any that stopped updating.',
};
</script>

<template>
  <div class="adm span-12" :data-test="`admin-${section.toLowerCase().replace(/\s+/g, '-')}`">
    <header class="adm-head">
      <div>
        <p class="adm-kicker">Admin view · last 7 days</p>
        <h1>{{ section }}</h1>
        <p class="muted">{{ DESC[section] }}</p>
      </div>
      <span class="adm-acts">
        <button type="button" class="btn small" :disabled="!data" data-test="admin-csv" @click="csv"><Icon name="download" :size="14" />CSV</button>
        <button type="button" class="btn small" :disabled="busy" data-test="admin-refresh" @click="load"><Icon name="refresh" :size="14" />{{ busy ? 'Loading…' : 'Refresh' }}</button>
      </span>
    </header>
    <p v-if="error" class="adm-error">{{ error }}</p>
    <p v-else-if="!data" class="muted">Loading…</p>

    <template v-else>
      <!-- People -->
      <section v-if="section === 'People'" class="adm-box adm-invite">
        <form @submit.prevent="invite"><input v-model="inviteName" class="field" placeholder="Name of someone to invite" aria-label="Name to invite" maxlength="60" data-test="admin-invite-name" /><button class="btn small primary" :disabled="!inviteName.trim()" data-test="admin-invite"><Icon name="plus" :size="14" />Invite</button></form>
        <p v-if="inviteLink" class="small adm-link"><span class="muted">Send this link (it works once):</span> <code>{{ inviteLink }}</code></p>
      </section>
      <section v-if="section === 'People'" class="adm-box">
        <table class="adm-table">
          <thead><tr><th>Person</th><th>Last seen</th><th>Devices</th><th>Open tasks</th><th>Added this week</th><th>Locked in</th><th>Words known</th><th>Recordings</th></tr></thead>
          <tbody>
            <tr v-for="p in people" :key="p.id">
              <td><b>{{ p.name }}</b><span class="adm-role">{{ p.role }}</span></td>
              <td>{{ ago(p.lastSeen) }}</td>
              <td>{{ p.passkeys }} passkey{{ p.passkeys === 1 ? '' : 's' }} · {{ p.sessions }} signed in</td>
              <td>{{ p.open }} <span class="muted">of {{ p.tasks }}</span></td>
              <td>{{ p.added }}</td>
              <td>{{ p.focusMins }} min</td>
              <td>{{ p.vocab }} <span v-if="p.learned" class="muted">({{ p.learned }} learned)</span></td>
              <td>{{ p.recordings }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Voice -->
      <template v-else-if="section === 'Voice'">
        <section class="adm-box">
          <h2>By device and browser</h2>
          <table class="adm-table">
            <thead><tr><th>Where</th><th>Recordings</th><th>Phrases heard</th><th>Empty</th><th>Failed</th><th>Mic blocked</th><th>Mic muted</th><th>Quiet mic rescued</th></tr></thead>
            <tbody>
              <tr v-for="v in data.voice" :key="v.where">
                <td><b>{{ v.where }}</b></td><td>{{ v.recordings }}</td><td>{{ v.heard }}</td><td>{{ v.empty }}</td>
                <td :class="{ bad: v.failed }">{{ v.failed }}</td><td :class="{ bad: v.micBlocked }">{{ v.micBlocked }}</td><td :class="{ bad: v.silent }">{{ v.silent }}</td><td>{{ v.quietRescued }}</td>
              </tr>
              <tr v-if="!data.voice.length"><td colspan="8" class="muted">No recordings this week.</td></tr>
            </tbody>
          </table>
        </section>
        <section class="adm-box">
          <h2>By person</h2>
          <table class="adm-table">
            <thead><tr><th>Person</th><th>Recordings</th><th>Phrases heard</th><th>Empty</th><th>Mic blocked</th><th>Mic muted</th><th>Words learned</th></tr></thead>
            <tbody><tr v-for="p in people" :key="p.id"><td><b>{{ p.name }}</b></td><td>{{ p.recordings }}</td><td>{{ p.heard }}</td><td>{{ p.empty }}</td><td :class="{ bad: p.micBlocked }">{{ p.micBlocked }}</td><td :class="{ bad: p.silent }">{{ p.silent }}</td><td>{{ p.learned }}</td></tr></tbody>
          </table>
        </section>
      </template>

      <!-- Models -->
      <template v-else-if="section === 'Models'">
        <section class="adm-box">
          <table class="adm-table">
            <thead><tr><th>Model</th><th>Job</th><th>Runs on</th><th>Calls</th><th>Empty or failed</th><th>Avg speed</th><th>State</th></tr></thead>
            <tbody><tr v-for="m in models" :key="m.name"><td><b>{{ m.name }}</b></td><td>{{ m.job }}</td><td>{{ m.where }}</td><td>{{ m.calls ?? '–' }}</td><td :class="{ bad: m.misses && m.calls && m.misses / m.calls > .3 }">{{ m.misses ?? '–' }}<span v-if="m.calls && m.misses != null" class="muted"> ({{ pct(m.misses, m.calls) }}%)</span></td><td>{{ m.ms != null ? `${(m.ms / 1000).toFixed(1)} s` : '–' }}</td><td>{{ m.state }}</td></tr></tbody>
          </table>
        </section>
        <section class="adm-box adm-train">
          <h2>Training</h2>
          <dl class="adm-kv">
            <div><dt>First run</dt><dd>Mon Nov 9, then a new model every day</dd></div>
            <div><dt>Corrections learned (training signal)</dt><dd>{{ learnedTotal }}</dd></div>
            <div><dt>Opted in to help Taskie hear better</dt><dd>Not built yet</dd></div>
            <div><dt>Plan and scores</dt><dd><a href="https://github.com/wmutesa/budgie-the-budget/issues/4" target="_blank" rel="noopener noreferrer">Issue #4</a></dd></div>
          </dl>
        </section>
      </template>

      <!-- Errors and versions -->
      <template v-else-if="section === 'Errors'">
        <section class="adm-box">
          <h2>Errors</h2>
          <table class="adm-table">
            <thead><tr><th>Message</th><th>Times</th><th>Last</th><th>Where</th></tr></thead>
            <tbody>
              <tr v-for="e in data.errors" :key="e.msg"><td class="adm-msg">{{ e.msg }}</td><td>{{ e.n }}</td><td>{{ ago(e.last) }}</td><td>{{ e.where }}</td></tr>
              <tr v-if="!data.errors.length"><td colspan="4" class="muted">No errors this week. Nice.</td></tr>
            </tbody>
          </table>
        </section>
        <section class="adm-box">
          <h2>App versions in use</h2>
          <table class="adm-table">
            <thead><tr><th>Device</th><th>Version</th><th>Last seen</th></tr></thead>
            <tbody><tr v-for="b in data.builds" :key="`${b.device}${b.build}`"><td>{{ b.device }}</td><td><code>{{ b.build.replace('/assets/', '') }}</code> <span v-if="b.build === thisBuild" class="adm-ok">current</span><span v-else class="adm-old">older</span></td><td>{{ ago(b.at) }}</td></tr></tbody>
          </table>
        </section>
      </template>

      <!-- Sync -->
      <section v-else-if="section === 'Sync'" class="adm-box">
        <table class="adm-table">
          <thead><tr><th>Person</th><th>Saves</th><th>Last saved</th><th>Conflicts this week</th><th>Account size</th></tr></thead>
          <tbody>
            <tr v-for="p in people" :key="p.id">
              <td><b>{{ p.name }}</b></td><td>{{ p.version }}</td><td>{{ ago(p.lastSeen) }}</td>
              <td :class="{ bad: p.conflicts > 20 }">{{ p.conflicts }}</td>
              <td><span class="adm-bar"><i :style="{ width: `${Math.min(100, pct(p.bytes, data.limitBytes))}%` }" :class="{ bad: pct(p.bytes, data.limitBytes) > 80 }" /></span>{{ kb(p.bytes) }} <span class="muted">of {{ kb(data.limitBytes) }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- AI usage -->
      <section v-else-if="section === 'AI usage'" class="adm-box">
        <table class="adm-table">
          <thead><tr><th>What</th><th>Calls</th><th>Empty or failed</th></tr></thead>
          <tbody><tr v-for="[name, n, bad] in usageRows" :key="name"><td>{{ name }}</td><td>{{ n }}</td><td :class="{ bad }">{{ bad }}</td></tr></tbody>
        </table>
        <p class="muted small">Counting started today. Workers AI's free allowance is generous for a handful of people; this is where to watch it.</p>
      </section>

      <!-- Calendars -->
      <template v-else-if="section === 'Calendars'">
      <section class="adm-box">
        <h2>Across everyone</h2>
        <table class="adm-table">
          <thead><tr><th>Calendar</th><th>People</th><th>Events</th><th>Failing</th></tr></thead>
          <tbody>
            <tr v-for="c in calHealth" :key="c.name"><td><b>{{ c.name }}</b></td><td>{{ c.people }}</td><td>{{ c.events }}</td><td :class="{ bad: c.failing }">{{ c.failing }}</td></tr>
            <tr v-if="!calHealth.length"><td colspan="4" class="muted">No calendars connected yet.</td></tr>
          </tbody>
        </table>
      </section>
      <section class="adm-box">
        <h2>By person</h2>
        <table class="adm-table">
          <thead><tr><th>Person</th><th>Calendar</th><th>Events</th><th>State</th></tr></thead>
          <tbody>
            <template v-for="p in people" :key="p.id">
              <tr v-for="f in p.feeds" :key="`${p.id}${f.name}`"><td>{{ p.name }}</td><td>{{ f.name }}</td><td>{{ f.count }}</td><td :class="{ bad: f.error }">{{ f.error || 'Updating' }}</td></tr>
            </template>
            <tr v-if="!people.some(p => p.feeds.length)"><td colspan="4" class="muted">No calendars connected yet.</td></tr>
          </tbody>
        </table>
      </section>
      </template>
    </template>
    <p class="muted small adm-foot">Counts and states only: nobody's tasks or words appear here. Diagnostic logs are deleted after 30 days.</p>
  </div>
</template>
