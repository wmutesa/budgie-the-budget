<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import Icon from './Icon.vue';

// About you, for your digests and draft emails, plus your own Gemini key.
// Saved in your account as you type; never part of Budgie's code.
if (!store.me || typeof store.me !== 'object') store.me = {};
const me = store.me;
const show = ref(false);
const key = computed({ get: () => store.digest.geminiKey || '', set: v => { store.digest.geminiKey = v.trim() || undefined; } });
const keyOk = computed(() => !key.value || /^[\w-]{20,80}$/.test(key.value));
const auto = computed({ get: () => !store.digest.off, set: v => { store.digest.off = !v; } });
const toPlanner = computed({ get: () => store.digest.autoTasks !== false, set: v => { store.digest.autoTasks = v; } });
</script>

<template>
  <section class="acct-sec t-b you" data-test="profile-you">
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="user" :size="12" /></span>You</p><span class="muted small">For your digests and drafts</span></div>
    <div class="you-grid">
      <label class="tk-f"><span>Name</span><input v-model="me.name" maxlength="60" autocomplete="name" data-test="you-name" /></label>
      <label class="tk-f"><span>School or work</span><input v-model="me.school" maxlength="80" placeholder="e.g. State University" /></label>
      <label class="tk-f"><span>What you study or do</span><input v-model="me.study" maxlength="80" placeholder="e.g. Electrical Engineering" data-test="you-study" /></label>
      <label class="tk-f"><span>Year or stage</span><input v-model="me.year" maxlength="40" placeholder="e.g. first-year" /></label>
      <label class="tk-f wide"><span>Where you are</span><input v-model="me.location" maxlength="60" placeholder="e.g. Boston" /></label>
      <label class="tk-f wide"><span>A line about you</span><textarea v-model="me.about" rows="2" maxlength="400" placeholder="What you care about and what you are aiming for. Used for digests and draft emails." /></label>
    </div>
    <label class="tk-f wide"><span>Gemini API key (free, optional)</span>
      <span class="you-key">
        <input v-model="key" :type="show ? 'text' : 'password'" autocomplete="off" spellcheck="false" placeholder="Paste your key for deeper research" aria-label="Gemini API key" data-test="you-key" />
        <button type="button" class="ibtn ghost" :title="show ? 'Hide' : 'Show'" :aria-label="show ? 'Hide key' : 'Show key'" @click="show = !show"><Icon :name="show ? 'x' : 'search'" /></button>
      </span>
    </label>
    <p v-if="!keyOk" class="pln-err small">That does not look like a Gemini key. Copy it again from Google AI Studio.</p>
    <p class="muted small">Get one free at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>. With a key, every digest is researched by Gemini with Google Search as it is written. The key is saved in your account and sent only to Google.</p>
    <label class="dgp-check"><input v-model="auto" type="checkbox" /> New digests every Monday and Thursday</label>
    <label class="dgp-check"><input v-model="toPlanner" type="checkbox" /> Put digest deadlines in my Planner</label>
  </section>
</template>
