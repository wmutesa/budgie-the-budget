<script setup>
import { ref, computed, onMounted } from 'vue';
import { adminSummary, invitePerson } from '../lib/account';
import { toast } from '../lib/toast';
import Icon from './Icon.vue';

// The owner's Admin view: how Taskie is doing for everyone, as counts and
// states only. Nobody's tasks or words are shown here. Logs are kept 30 days.
// Laid out like a dashboard: stat cards, a week of activity, then tables.
const props = defineProps({ section: { type: String, default: 'Dashboard' } });
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
const sum = (...keys) => keys.reduce((a, k) => a + (u.value[k] || 0), 0);
const avg = (msKey, keys) => { const n = sum(...keys); return n ? Math.round((u.value[msKey] || 0) / n) : null; };

// ---------- dashboard ----------
const activeWeek = computed(() => people.value.filter(p => p.lastSeen && Date.now() - p.lastSeen < 7 * 86400e3).length);
const recordings = computed(() => sum('hear-nova', 'hear-nova-failed'));
const geminiShare = computed(() => { const g = sum('hear-gemini', 'split-gemini', 'next-gemini', 'steps-gemini'); const all = g + sum('hear-gemini-failed', 'split-llama', 'split-budgie', 'next-llama', 'steps-llama'); return all ? pct(g, all) : null; });
const errorsWeek = computed(() => (data.value?.errors || []).reduce((n, e) => n + e.n, 0));
const stats = computed(() => [
  { label: 'People', value: people.value.length, note: `${activeWeek.value} active this week`, icon: 'user' },
  { label: 'Recordings heard', value: recordings.value, note: `${sum('hear-nova-failed')} failed · Nova-3 ${avg('ms-nova', ['hear-nova']) ?? '–'} ms avg`, icon: 'mic', bad: sum('hear-nova-failed') > 0 },
  { label: 'Gemini share', value: geminiShare.value == null ? '–' : `${geminiShare.value}%`, note: data.value?.gemini === 'none' ? 'No key yet: add GEMINI_API_KEY' : `Key: ${data.value?.gemini === 'server' ? 'server secret' : "owner's, shared"}`, icon: 'sparkle', warn: data.value?.gemini === 'none' },
  { label: 'Errors', value: errorsWeek.value, note: `${(data.value?.errors || []).length} different messages`, icon: 'help', bad: errorsWeek.value > 0 },
]);
// A week of activity per day: recordings, typed notes and AI ideas.
const SERIES = [['Recordings', ['hear-nova'], '#7c3aed'], ['Typed notes', ['split-gemini', 'split-llama', 'split-budgie'], '#a78bfa'], ['Ideas and steps', ['next-gemini', 'next-llama', 'steps-gemini', 'steps-llama'], '#ddd6fe']];
const week = computed(() => {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 86400e3); days.push(d.toISOString().slice(0, 10)); }
  const rows = data.value?.usage?.days || [];
  const out = days.map(day => ({ day, label: new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' }), parts: SERIES.map(([, keys]) => rows.filter(r => r.day === day && keys.includes(r.key)).reduce((a, r) => a + r.n, 0)) }));
  const max = Math.max(1, ...out.map(d => d.parts.reduce((a, b) => a + b, 0)));
  return { days: out, max };
});
const recent = computed(() => [...people.value].filter(p => p.lastSeen).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 6));
const initials = n => String(n || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();

// ---------- tables ----------
const q = ref('');
const sortBy = ref('lastSeen');
const sortDir = ref(-1);
const sortOn = k => { if (sortBy.value === k) sortDir.value *= -1; else { sortBy.value = k; sortDir.value = -1; } };
const shownPeople = computed(() => {
  const f = q.value.trim().toLowerCase();
  return people.value.filter(p => !f || p.name.toLowerCase().includes(f) || p.role.includes(f)).sort((a, b) => ((a[sortBy.value] ?? 0) > (b[sortBy.value] ?? 0) ? 1 : -1) * sortDir.value);
});
const models = computed(() => [
  { name: 'Deepgram Nova-3', job: 'Hears every recording, boosted with each person’s own words', where: 'Cloudflare Workers AI', calls: sum('hear-nova', 'hear-nova-failed'), misses: sum('hear-nova-failed', 'hear-empty'), ms: avg('ms-nova', ['hear-nova']), state: 'Always · the only transcriber' },
  { name: 'Gemini 2.5 Flash', job: 'Fixes what Nova-3 misheard from the sound and context; splits notes; ideas; steps', where: 'Google', calls: sum('hear-gemini', 'hear-gemini-failed', 'split-gemini', 'split-gemini-failed', 'next-gemini', 'next-gemini-failed', 'steps-gemini', 'steps-gemini-failed'), misses: sum('hear-gemini-failed', 'split-gemini-failed', 'next-gemini-failed', 'steps-gemini-failed'), ms: avg('ms-gemini-hear', ['hear-gemini']), state: data.value?.gemini === 'none' ? 'Waiting for a key' : 'First choice' },
  { name: 'Llama 3.3 70B', job: 'Splits and suggests when Gemini is unavailable; teacher for training', where: 'Cloudflare Workers AI', calls: sum('split-llama', 'split-budgie', 'split-llama-failed', 'split-budgie-failed', 'next-llama', 'steps-llama'), misses: sum('split-llama-failed', 'split-budgie-failed'), ms: avg('ms-split-llama', ['split-llama']), state: 'Backup' },
  { name: 'Qwen 2.5 (0.5B, 1.5B)', job: 'On-device splitting when the server cannot be reached', where: 'The person’s browser', calls: null, misses: null, ms: null, state: 'Offline backup · fine-tuned daily' },
  { name: 'Taskie rules', job: 'Title Case, nonsense filter, spoken punctuation, no repeats', where: 'The app', calls: null, misses: null, ms: null, state: 'Always on' },
]);
const calHealth = computed(() => {
  const m = new Map();
  for (const p of people.value) for (const f of p.feeds) { const r = m.get(f.name) || { name: f.name, people: 0, failing: 0, events: 0 }; r.people++; r.events += f.count || 0; if (f.error) r.failing++; m.set(f.name, r); }
  return [...m.values()].sort((a, b) => b.people - a.people || b.failing - a.failing);
});
const tr = computed(() => data.value?.training || {});

// Invite someone from here.
const inviteName = ref(''); const inviteLink = ref('');
async function invite() {
  const name = inviteName.value.trim(); if (!name) return;
  try { const r = await invitePerson(name); inviteLink.value = r.link; inviteName.value = ''; toast(`Invite for ${name} ready. It works once and expires in ${r.expiresInDays} days.`, { kind: 'success' }); }
  catch (e) { toast(e.message || 'The invite could not be made.', { kind: 'error' }); }
}
function csv() {
  const rows = {
    Dashboard: [['Stat', 'Value', 'Note'], ...stats.value.map(s => [s.label, s.value, s.note])],
    People: [['Person', 'Role', 'Last seen', 'Passkeys', 'Signed in', 'Open tasks', 'Tasks', 'Added this week', 'Locked in min', 'Recordings', 'Notifications', 'Helps training'], ...people.value.map(p => [p.name, p.role, p.lastSeen ? new Date(p.lastSeen).toISOString() : '', p.passkeys, p.sessions, p.open, p.tasks, p.added, p.focusMins, p.recordings, p.pushOn ? 'on' : 'off', p.helpHear ? 'yes' : 'no'])],
    Voice: [['Where', 'Recordings', 'Heard', 'Empty', 'Failed', 'Mic blocked', 'Mic muted'], ...(data.value?.voice || []).map(v => [v.where, v.recordings, v.heard, v.empty, v.failed, v.micBlocked, v.silent])],
    Models: [['Model', 'Job', 'Where', 'Calls', 'Misses', 'Avg ms', 'State'], ...models.value.map(m => [m.name, m.job, m.where, m.calls ?? '', m.misses ?? '', m.ms ?? '', m.state])],
    Training: [['What', 'Value'], ['Text pairs kept', tr.value.samples], ['This week', tr.value.week], ['People contributing', tr.value.people], ['Corrected by Gemini this week', tr.value.changed], ['Opted out', tr.value.optedOut]],
    Errors: [['Message', 'Times', 'Last', 'Where'], ...(data.value?.errors || []).map(e => [e.msg, e.n, new Date(e.last).toISOString(), e.where])],
    Sync: [['Person', 'Saves', 'Conflicts', 'Bytes'], ...people.value.map(p => [p.name, p.version, p.conflicts, p.bytes])],
    Calendars: [['Calendar', 'People', 'Failing', 'Events'], ...calHealth.value.map(c => [c.name, c.people, c.failing, c.events])],
  }[props.section] || [];
  const text = rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = `taskie-admin-${props.section.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const DESC = {
  Dashboard: 'How Taskie is doing for everyone this week.',
  People: 'Who uses Taskie, how recently, and how much.',
  Voice: 'Recording health by device and browser: what was heard, what was not, and why.',
  Models: 'The models behind hearing, sorting and ideas: use, misses and speed.',
  Training: 'Help Taskie hear better: the text pairs that teach Taskie, and the daily training plan.',
  Errors: 'What broke in the app, and which version each device is running.',
  Sync: 'Saving between devices: conflicts, and how full each account is.',
  Calendars: 'Calendars people connected, and any that stopped updating.',
};
</script>

<template>
  <div class="adm" :data-test="`admin-${section.toLowerCase().replace(/\s+/g, '-')}`">
    <header class="adm-head">
      <div>
        <h1>{{ section }}</h1>
        <p class="muted">{{ DESC[section] }}</p>
      </div>
      <span class="adm-acts">
        <button type="button" class="adm-btn" :disabled="!data" data-test="admin-csv" @click="csv"><Icon name="download" :size="14" />Export</button>
        <button type="button" class="adm-btn dark" :disabled="busy" data-test="admin-refresh" @click="load"><Icon name="refresh" :size="14" />{{ busy ? 'Loading…' : 'Refresh' }}</button>
      </span>
    </header>
    <p v-if="error" class="adm-error">{{ error }}</p>
    <div v-else-if="!data" class="adm-skel" aria-label="Loading"><i v-for="n in 4" :key="n" /></div>

    <template v-else>
      <!-- Dashboard -->
      <template v-if="section === 'Dashboard'">
        <div class="adm-stats">
          <section v-for="s in stats" :key="s.label" class="adm-card adm-stat" :class="{ bad: s.bad, warn: s.warn }">
            <p class="adm-stat-top"><span>{{ s.label }}</span><Icon :name="s.icon" :size="15" /></p>
            <b>{{ s.value }}</b>
            <span class="adm-note">{{ s.note }}</span>
          </section>
        </div>
        <div class="adm-two">
          <section class="adm-card adm-chart">
            <h2>Activity</h2>
            <p class="adm-note">Last 7 days</p>
            <div class="adm-bars" role="img" :aria-label="`Activity over the last 7 days`">
              <div v-for="d in week.days" :key="d.day" class="adm-col">
                <span class="adm-stack" :style="{ height: `${(d.parts.reduce((a, b) => a + b, 0) / week.max) * 100}%` }"><i v-for="(n, k) in d.parts" :key="k" :style="{ flexGrow: n, background: SERIES[k][2] }" :title="`${SERIES[k][0]}: ${n}`" /></span>
                <span class="adm-day">{{ d.label }}</span>
              </div>
            </div>
            <p class="adm-legend"><span v-for="s in SERIES" :key="s[0]"><i :style="{ background: s[2] }" />{{ s[0] }}</span></p>
          </section>
          <section class="adm-card">
            <h2>Recently active</h2>
            <p class="adm-note">{{ activeWeek }} people this week</p>
            <ul class="adm-recent">
              <li v-for="p in recent" :key="p.id"><span class="adm-av">{{ initials(p.name) }}</span><span><b>{{ p.name }}</b><span class="adm-note">{{ p.open }} open · {{ p.recordings }} recordings</span></span><span class="adm-note">{{ ago(p.lastSeen) }}</span></li>
            </ul>
          </section>
        </div>
        <div class="adm-stats three">
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Notifications on</span><Icon name="bell" :size="15" /></p><b>{{ data.push.devices }}</b><span class="adm-note">devices · {{ data.push.people }} people</span></section>
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Training text</span><Icon name="trend" :size="15" /></p><b>{{ tr.samples }}</b><span class="adm-note">{{ tr.week }} this week · {{ tr.changed }} corrected by Gemini</span></section>
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Locked in</span><Icon name="timer" :size="15" /></p><b>{{ people.reduce((n, p) => n + p.focusMins, 0) }} min</b><span class="adm-note">across everyone this week</span></section>
        </div>
      </template>

      <!-- People -->
      <template v-else-if="section === 'People'">
        <section class="adm-card adm-invite">
          <form @submit.prevent="invite"><input v-model="inviteName" class="adm-input" placeholder="Name of someone to invite" aria-label="Name to invite" maxlength="60" data-test="admin-invite-name" /><button class="adm-btn dark" :disabled="!inviteName.trim()" data-test="admin-invite"><Icon name="plus" :size="14" />Invite</button></form>
          <p v-if="inviteLink" class="small adm-link"><span class="muted">Send this link (it works once):</span> <code>{{ inviteLink }}</code></p>
        </section>
        <section class="adm-card adm-box">
          <div class="adm-tools"><span class="adm-search"><Icon name="search" :size="14" /><input v-model="q" placeholder="Filter people…" aria-label="Filter people" /></span><span class="adm-note">{{ shownPeople.length }} of {{ people.length }}</span></div>
          <div class="adm-scroll">
            <table class="adm-table">
              <thead><tr>
                <th><button type="button" @click="sortOn('name')">Person</button></th>
                <th><button type="button" @click="sortOn('lastSeen')">Last seen</button></th>
                <th>Devices</th>
                <th><button type="button" @click="sortOn('open')">Open tasks</button></th>
                <th><button type="button" @click="sortOn('added')">Added this week</button></th>
                <th><button type="button" @click="sortOn('focusMins')">Locked in</button></th>
                <th><button type="button" @click="sortOn('recordings')">Recordings</button></th>
                <th>Notifications</th>
              </tr></thead>
              <tbody>
                <tr v-for="p in shownPeople" :key="p.id">
                  <td><span class="adm-who"><span class="adm-av">{{ initials(p.name) }}</span><b>{{ p.name }}</b><span class="adm-role">{{ p.role }}</span></span></td>
                  <td>{{ ago(p.lastSeen) }}</td>
                  <td>{{ p.passkeys }} passkey{{ p.passkeys === 1 ? '' : 's' }} · {{ p.sessions }} signed in</td>
                  <td>{{ p.open }} <span class="muted">of {{ p.tasks }}</span></td>
                  <td>{{ p.added }}</td>
                  <td>{{ p.focusMins }} min</td>
                  <td>{{ p.recordings }}</td>
                  <td><span class="adm-pill" :class="p.pushOn ? 'ok' : ''">{{ p.pushOn ? 'On' : 'Off' }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <!-- Voice -->
      <template v-else-if="section === 'Voice'">
        <div class="adm-stats">
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Recordings</span><Icon name="mic" :size="15" /></p><b>{{ recordings }}</b><span class="adm-note">heard by Nova-3 this week</span></section>
          <section class="adm-card adm-stat" :class="{ bad: sum('hear-nova-failed') }"><p class="adm-stat-top"><span>Failed</span><Icon name="x" :size="15" /></p><b>{{ sum('hear-nova-failed') }}</b><span class="adm-note">Nova-3 could not answer</span></section>
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Nothing heard</span><Icon name="help" :size="15" /></p><b>{{ sum('hear-empty') }}</b><span class="adm-note">silence or a muted mic</span></section>
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Speed</span><Icon name="clock" :size="15" /></p><b>{{ tr.ms ? `${(tr.ms / 1000).toFixed(1)} s` : '–' }}</b><span class="adm-note">Stop to items, on average</span></section>
        </div>
        <section class="adm-card adm-box">
          <h2>By device and browser</h2>
          <div class="adm-scroll">
            <table class="adm-table">
              <thead><tr><th>Where</th><th>Recordings</th><th>Heard</th><th>Empty</th><th>Failed</th><th>Mic blocked</th><th>Mic muted</th></tr></thead>
              <tbody>
                <tr v-for="v in data.voice" :key="v.where">
                  <td><b>{{ v.where }}</b></td><td>{{ v.recordings }}</td><td>{{ v.heard }}</td><td>{{ v.empty }}</td>
                  <td :class="{ bad: v.failed }">{{ v.failed }}</td><td :class="{ bad: v.micBlocked }">{{ v.micBlocked }}</td><td :class="{ bad: v.silent }">{{ v.silent }}</td>
                </tr>
                <tr v-if="!data.voice.length"><td colspan="7" class="muted">No recordings this week.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <!-- Models -->
      <template v-else-if="section === 'Models'">
        <section class="adm-card adm-box">
          <div class="adm-scroll">
            <table class="adm-table">
              <thead><tr><th>Model</th><th>Job</th><th>Runs on</th><th>Calls</th><th>Missed</th><th>Avg speed</th><th>State</th></tr></thead>
              <tbody><tr v-for="m in models" :key="m.name"><td><b>{{ m.name }}</b></td><td class="adm-wrap">{{ m.job }}</td><td>{{ m.where }}</td><td>{{ m.calls ?? '–' }}</td><td :class="{ bad: m.misses && m.calls && m.misses / m.calls > .2 }">{{ m.misses ?? '–' }}<span v-if="m.calls && m.misses != null" class="muted"> ({{ pct(m.misses, m.calls) }}%)</span></td><td>{{ m.ms != null ? `${(m.ms / 1000).toFixed(1)} s` : '–' }}</td><td><span class="adm-pill" :class="{ ok: /First|Always/.test(m.state), warn: /Waiting/.test(m.state) }">{{ m.state }}</span></td></tr></tbody>
            </table>
          </div>
        </section>
        <p v-if="data.gemini === 'none'" class="adm-callout"><Icon name="sparkle" :size="15" />Gemini is not being used yet. Add a <b>GEMINI_API_KEY</b> secret to the Worker in Cloudflare (Workers, budgie, Settings, Variables and secrets), or save your own key in Settings, AI.</p>
      </template>

      <!-- Training -->
      <template v-else-if="section === 'Training'">
        <div class="adm-stats">
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Text pairs</span><Icon name="trend" :size="15" /></p><b>{{ tr.samples }}</b><span class="adm-note">heard vs. what it was</span></section>
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>This week</span><Icon name="calendar" :size="15" /></p><b>{{ tr.week }}</b><span class="adm-note">{{ tr.changed }} corrected by Gemini ({{ pct(tr.changed, tr.week) }}%)</span></section>
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Contributing</span><Icon name="user" :size="15" /></p><b>{{ tr.people }}</b><span class="adm-note">{{ tr.optedOut }} opted out</span></section>
          <section class="adm-card adm-stat"><p class="adm-stat-top"><span>Nova-3 confidence</span><Icon name="target" :size="15" /></p><b>{{ tr.confidence != null ? `${Math.round(tr.confidence * 100)}%` : '–' }}</b><span class="adm-note">average this week</span></section>
        </div>
        <section class="adm-card adm-box">
          <h2>How Taskie learns</h2>
          <ol class="adm-steps">
            <li><b>Every recording</b> is heard by Nova-3, then corrected by Gemini with the sound and the person’s planner. Both texts are kept (never the audio) unless the person turns off <i>Help Taskie hear better</i>.</li>
            <li><b>Every night</b> the pairs where Gemini changed something become training data: a keyterm list per person for Nova-3, and examples for the on-device model.</li>
            <li><b>Daily runs</b> fine-tune the on-device model on public data plus these pairs, until users’ own data is enough on its own.</li>
          </ol>
          <p class="adm-note">Plan and scores: <a href="https://github.com/wmutesa/taskie-the-task/issues/4" target="_blank" rel="noopener noreferrer">wmutesa/taskie-the-task#4</a></p>
        </section>
      </template>

      <!-- Errors -->
      <template v-else-if="section === 'Errors'">
        <section class="adm-card adm-box">
          <h2>Errors</h2>
          <div class="adm-scroll">
            <table class="adm-table">
              <thead><tr><th>Message</th><th>Times</th><th>Last</th><th>Where</th></tr></thead>
              <tbody>
                <tr v-for="e in data.errors" :key="e.msg"><td class="adm-msg">{{ e.msg }}</td><td>{{ e.n }}</td><td>{{ ago(e.last) }}</td><td>{{ e.where }}</td></tr>
                <tr v-if="!data.errors.length"><td colspan="4" class="muted">No errors this week. Nice.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="adm-card adm-box">
          <h2>App versions in use</h2>
          <div class="adm-scroll">
            <table class="adm-table">
              <thead><tr><th>Device</th><th>Version</th><th>Last seen</th></tr></thead>
              <tbody><tr v-for="b in data.builds" :key="`${b.device}${b.build}`"><td>{{ b.device }}</td><td><code>{{ b.build.replace('/assets/', '') }}</code> <span class="adm-pill" :class="b.build === thisBuild ? 'ok' : 'warn'">{{ b.build === thisBuild ? 'current' : 'older' }}</span></td><td>{{ ago(b.at) }}</td></tr></tbody>
            </table>
          </div>
        </section>
      </template>

      <!-- Sync -->
      <section v-else-if="section === 'Sync'" class="adm-card adm-box">
        <div class="adm-scroll">
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
        </div>
      </section>

      <!-- Calendars -->
      <template v-else-if="section === 'Calendars'">
        <section class="adm-card adm-box">
          <h2>Across everyone</h2>
          <div class="adm-scroll">
            <table class="adm-table">
              <thead><tr><th>Calendar</th><th>People</th><th>Events</th><th>Failing</th></tr></thead>
              <tbody>
                <tr v-for="c in calHealth" :key="c.name"><td><b>{{ c.name }}</b></td><td>{{ c.people }}</td><td>{{ c.events }}</td><td :class="{ bad: c.failing }">{{ c.failing }}</td></tr>
                <tr v-if="!calHealth.length"><td colspan="4" class="muted">No calendars connected yet.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
    <p class="adm-note adm-foot">Counts and states only: nobody’s tasks or words appear here. Diagnostic logs are deleted after 30 days.</p>
  </div>
</template>
