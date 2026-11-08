<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import Icon from './Icon.vue';
import { checkGeminiKey, saveNow } from '../lib/account';

// Your own free Gemini key. With it, what you say or type in Add is broken
// into every separate thing by Gemini. The key is saved in your account and
// sent only to Google, from Budgie's server.
const show = ref(false);
// Pasted keys can carry spaces or quotes; keys come in more than one format.
const tidy = v => String(v || '').replace(/\s+/g, '').replace(/^["'`]+|["'`]+$/g, '');
const key = computed({ get: () => store.digest.geminiKey || '', set: v => { store.digest.geminiKey = tidy(v) || undefined; result.value = null; } });
const keyOk = computed(() => !key.value || /^[A-Za-z0-9._~+/=-]{20,256}$/.test(key.value));
const checking = ref(false);
const result = ref(null);
async function check() {
  checking.value = true; result.value = null;
  try { result.value = await checkGeminiKey(key.value); if (result.value.ok) await saveNow(); } catch (e) { result.value = { ok: false, message: e.message || 'The key could not be checked.' }; }
  checking.value = false;
}
</script>

<template>
  <section class="acct-sec t-a" data-test="gemini-key">
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="sparkle" :size="12" /></span>Gemini for what you say</p><span class="muted small">Free, optional</span></div>
    <p class="small">With your own key, everything you say or type in <b>Add</b> is read by Gemini and broken into each separate task, assignment, class, routine and goal, with its date and time, even when you list dozens at once. Without a key, Budgie's own rules do it. Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>.</p>
    <span class="you-key">
      <input v-model="key" :type="show ? 'text' : 'password'" autocomplete="off" spellcheck="false" placeholder="Paste your Gemini API key" aria-label="Gemini API key" data-test="you-key" />
      <button type="button" class="ibtn ghost" :title="show ? 'Hide' : 'Show'" :aria-label="show ? 'Hide key' : 'Show key'" @click="show = !show"><Icon :name="show ? 'x' : 'search'" /></button>
      <button type="button" class="btn small" :disabled="!key || !keyOk || checking" data-test="you-key-check" @click="check"><Icon :name="checking ? 'refresh' : 'check'" :size="14" />{{ checking ? 'Checking…' : 'Check key' }}</button>
    </span>
    <p v-if="!keyOk" class="pln-err small">That does not look like an API key. Copy it again from Google AI Studio (the copy button next to the key).</p>
    <p v-else-if="result" :class="result.ok ? 'pln-ok' : 'pln-err'" class="small" role="status" data-test="you-key-result">{{ result.message }}</p>
    <p class="muted small">The key is kept in your account and sent only to Google. Gemini's free tier has a daily limit; when it is reached, Budgie's own rules take over.</p>
  </section>
</template>
