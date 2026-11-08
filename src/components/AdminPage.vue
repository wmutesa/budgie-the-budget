<script setup>
import { ref, computed, onMounted } from 'vue';
import { adminSummary } from '../lib/account';
import Icon from './Icon.vue';

// The owner's Admin view: how Budgie is doing for everyone, as counts and
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
  ['Breakdowns (Budgie AI)', u.value['split-budgie'] || 0, u.value['split-budgie-failed'] || 0],
]);
const DESC = {
  People: 'Who uses Budgie, how recently, and how much.',
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
      <button type="button" class="btn small" :disabled="busy" data-test="admin-refresh" @click="load"><Icon name="refresh" :size="14" />{{ busy ? 'Loading…' : 'Refresh' }}</button>
    </header>
    <p v-if="error" class="adm-error">{{ error }}</p>
    <p v-else-if="!data" class="muted">Loading…</p>

    <template v-else>
      <!-- People -->
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
      <section v-else-if="section === 'Calendars'" class="adm-box">
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
    <p class="muted small adm-foot">Counts and states only: nobody's tasks or words appear here. Diagnostic logs are deleted after 30 days.</p>
  </div>
</template>
