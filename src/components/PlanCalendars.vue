<script setup>
import { ref } from 'vue';
import { store } from '../lib/store';
import { FEED_KINDS, addFeed, syncFeed, removeFeed, feedTime } from '../lib/calendar';

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
  try {
    const r = await addFeed(url);
    message.value = `Imported ${r.added} item${r.added === 1 ? '' : 's'}. Budgie refreshes this calendar every few hours.`;
    link.value = '';
  } catch (e) { error.value = e.message || 'That calendar could not be read.'; }
  busy.value = false;
}
const remove = f => { if (confirm(`Stop importing ${f.name}? Items from it that are not done are removed.`)) removeFeed(f); };
</script>

<template>
  <section class="pln-card" id="calendars" data-test="calendars">
    <div class="pln-card-head"><h3>Calendars</h3><button type="button" class="notice-link" :aria-expanded="help" @click="help = !help">Where is my link?</button></div>
    <ul v-if="help" class="pln-help">
      <li v-for="(k, id) in FEED_KINDS" :key="id"><b>{{ k.name }}:</b> {{ k.help }}</li>
      <li class="muted">The link is private, like a password to that calendar. Budgie keeps it in your account only.</li>
    </ul>
    <ul v-if="store.feeds.length" class="pln-feeds">
      <li v-for="f in store.feeds" :key="f.id" :class="{ bad: f.error }">
        <span class="pln-feed-kind" :data-kind="f.kind">{{ FEED_KINDS[f.kind]?.name || 'Calendar' }}</span>
        <span class="pln-feed-name"><b>{{ f.name }}</b><span class="muted small">{{ f.error || `${f.count} event${f.count === 1 ? '' : 's'} · updated ${feedTime(f)}` }}</span></span>
        <button type="button" class="btn small" :disabled="f.busy" @click="syncFeed(f)">{{ f.busy ? 'Updating…' : 'Update' }}</button>
        <button type="button" class="notice-link" :aria-label="`Remove ${f.name}`" @click="remove(f)">Remove</button>
      </li>
    </ul>
    <form class="pln-feed-add" @submit.prevent="add">
      <input v-model="link" type="text" inputmode="url" placeholder="Paste a Canvas, Google, Apple or Outlook calendar link" aria-label="Calendar link" data-test="feed-url" autocomplete="off" />
      <button class="btn primary small" :disabled="busy || !link.trim()" data-test="feed-add">{{ busy ? 'Importing…' : 'Import' }}</button>
    </form>
    <p v-if="message" class="pln-ok small" role="status">{{ message }}</p>
    <p v-if="error" class="pln-err small" role="alert">{{ error }}</p>
  </section>
</template>
