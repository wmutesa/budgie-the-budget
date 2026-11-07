<script setup>
import { ref } from 'vue';
import { store } from '../lib/store';
import { FEED_KINDS, addFeed, syncFeed, removeFeed, feedTime } from '../lib/calendar';
import Icon from './Icon.vue';
import { toast, loading, finish, fail } from '../lib/toast';
import { addIcs, addAnything, isIcs } from '../lib/schedule';
import { capture } from '../lib/capture';

// More than one way in: a link that stays up to date, a file, public holidays,
// or typing a timetable.
const WAYS = [['link', 'Link', 'external'], ['file', 'File', 'download'], ['holidays', 'Holidays', 'calendar'], ['type', 'Type it', 'edit']];
const way = ref('link');
const HOLIDAYS = [['US', 'en.usa'], ['UK', 'en.uk'], ['Canada', 'en.canadian'], ['Australia', 'en.australian'], ['India', 'en.indian'], ['Kenya', 'en.ke'], ['Rwanda', 'en.rw'], ['Nigeria', 'en.ng'], ['South Africa', 'en.sa'], ['Germany', 'en.german'], ['France', 'en.french']];
const country = ref('US');
const holidayUrl = c => `https://calendar.google.com/calendar/ical/${encodeURIComponent(`${HOLIDAYS.find(h => h[0] === c)[1]}#holiday@group.v.calendar.google.com`)}/public/basic.ics`;
async function addHolidays() {
  busy.value = true;
  const id = loading(`Adding ${country.value} holidays…`);
  try { const r = await addFeed(holidayUrl(country.value), `${country.value} holidays`); finish(id, `${r.added} holidays added. They stay up to date.`, { title: 'Holidays added' }); }
  catch (e) { fail(id, e.message || 'Those holidays could not be read.', { title: 'Holidays not added' }); }
  busy.value = false;
}
const fileIn = ref(null);
async function readFiles(files) {
  for (const f of [...(files || [])].slice(0, 5)) {
    if (f.size > 2e6) { toast(`${f.name} is too big to read.`, { kind: 'error' }); continue; }
    const text = await f.text();
    if (isIcs(text)) { const made = addIcs(text, f.name.replace(/\.ics$/i, '')); toast(`${made.length} events from ${f.name} added.`, { kind: 'success', title: 'Calendar file' }); }
    else if (/\.(txt|csv|md)$/i.test(f.name) || f.type.startsWith('text')) { const r = await addAnything(text); toast(`${r.made.length} items from ${f.name} added.`, { kind: 'success', title: 'Timetable' }); }
    else toast(`${f.name}: choose a calendar file (.ics) or a text list.`, { kind: 'warn' });
  }
}
const dragging = ref(false);
const onDrop = e => { dragging.value = false; readFiles(e.dataTransfer?.files); };
const typeIt = () => { capture.open = true; };

// Calendar links: paste once, and assignments, classes and events keep arriving.
const link = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');
const help = ref(false);

async function add() {
  const url = link.value.trim();
  if (!url) return;
  busy.value = true; error.value = ''; message.value = '';
  const id = loading('Importing your calendar…');
  try {
    const r = await addFeed(url);
    message.value = `Imported ${r.added} item${r.added === 1 ? '' : 's'}. Budgie refreshes this calendar every few hours.`;
    finish(id, message.value, { title: 'Calendar imported' });
    link.value = '';
  } catch (e) {
    error.value = e.message || 'That calendar could not be read.';
    fail(id, error.value, { title: 'Calendar not imported' });
  }
  busy.value = false;
}
async function refresh(f) {
  const id = loading(`Updating ${f.name}…`);
  const r = await syncFeed(f, { quiet: true });
  if (r) finish(id, `${f.name} is up to date${r.added ? `: ${r.added} new` : ''}.`);
  else fail(id, f.error, { title: `${f.name} did not update` });
}
// Remove at once; Undo brings the calendar and its items back.
function remove(f) {
  const feeds = JSON.parse(JSON.stringify(store.feeds));
  const tasks = JSON.parse(JSON.stringify(store.tasks));
  removeFeed(f);
  toast(`${f.name} removed, with its open items.`, { kind: 'info', action: { label: 'Undo', run: () => { store.feeds = feeds; store.tasks = tasks; } } });
}
</script>

<template>
  <section class="pln-card" id="calendars" data-test="calendars">
    <div class="pln-card-head"><h3>Calendars</h3><button type="button" class="ibtn ghost" :aria-expanded="help" title="Where is my calendar link?" aria-label="Where is my calendar link?" @click="help = !help"><Icon name="help" /></button></div>
    <ul v-if="help" class="pln-help">
      <li v-for="(k, id) in FEED_KINDS" :key="id"><b>{{ k.name }}:</b> {{ k.help }}</li>
      <li class="muted">The link is private, like a password to that calendar. Budgie keeps it in your account only.</li>
    </ul>
    <ul v-if="store.feeds.length" class="pln-feeds">
      <li v-for="f in store.feeds" :key="f.id" :class="{ bad: f.error }">
        <span class="pln-feed-kind" :data-kind="f.kind">{{ FEED_KINDS[f.kind]?.name || 'Calendar' }}</span>
        <span class="pln-feed-name"><b>{{ f.name }}</b><span class="muted small">{{ f.error || `${f.count} event${f.count === 1 ? '' : 's'} · updated ${feedTime(f)}` }}</span></span>
        <button type="button" class="ibtn ghost" :class="{ spin: f.busy }" :disabled="f.busy" title="Update now" :aria-label="`Update ${f.name}`" @click="refresh(f)"><Icon name="refresh" /></button>
        <button type="button" class="ibtn ghost danger" title="Stop importing" :aria-label="`Remove ${f.name}`" @click="remove(f)"><Icon name="trash" /></button>
      </li>
    </ul>
    <div class="cal-ways seg" role="tablist" aria-label="How to add a calendar">
      <button v-for="[id, label, ic] in WAYS" :key="id" type="button" role="tab" :aria-selected="way === id" :class="{ on: way === id }" :data-test="`way-${id}`" @click="way = id; id === 'type' && typeIt()"><Icon :name="ic" :size="14" />{{ label }}</button>
    </div>
    <div v-if="way === 'file'" class="cal-drop" :class="{ on: dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
      <p class="small"><b>Drop a calendar file here</b> (.ics from any calendar app), or a text timetable.</p>
      <button type="button" class="btn small" @click="fileIn.click()"><Icon name="download" :size="14" />Choose a file</button>
      <input ref="fileIn" type="file" accept=".ics,.txt,.csv,text/calendar,text/plain" multiple hidden data-test="cal-file" @change="readFiles($event.target.files); $event.target.value = ''" />
    </div>
    <form v-else-if="way === 'holidays'" class="pln-feed-add" @submit.prevent="addHolidays">
      <select v-model="country" aria-label="Country" data-test="holiday-country"><option v-for="[c] in HOLIDAYS" :key="c" :value="c">{{ c }} public holidays</option></select>
      <button class="btn small" :disabled="busy" data-test="holiday-add"><Icon name="check" :size="14" />Add</button>
    </form>
    <p v-else-if="way === 'type'" class="small muted">Say or type your timetable in the Add box: “MATH 101 TTh 1:30–2:45”, one per line.</p>
    <form v-else class="pln-feed-add" @submit.prevent="add">
      <input v-model="link" type="text" inputmode="url" placeholder="Paste a Canvas, Google, Apple or Outlook calendar link" aria-label="Calendar link" data-test="feed-url" autocomplete="off" />
      <button class="ibtn primary" :class="{ spin: busy }" :disabled="busy || !link.trim()" title="Import" aria-label="Import" data-test="feed-add"><Icon :name="busy ? 'refresh' : 'plus'" /></button>
    </form>
    <p v-if="message" class="pln-ok small">{{ message }}</p>
  </section>
</template>
