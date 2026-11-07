<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import Icon from './Icon.vue';
import { checkGeminiKey, saveNow } from '../lib/account';

// Your own Gemini key and how digests behave. Saved in your account.
const show = ref(false);
// Pasted keys can carry spaces or quotes; keys come in more than one format.
const tidy = v => String(v || '').replace(/\s+/g, '').replace(/^["'`]+|["'`]+$/g, '');
const key = computed({ get: () => store.digest.geminiKey || '', set: v => { store.digest.geminiKey = tidy(v) || undefined; result.value = null; } });
const keyOk = computed(() => !key.value || /^[A-Za-z0-9._~+/=-]{20,256}$/.test(key.value));
// Ask Google whether the key works.
const checking = ref(false);
const result = ref(null);
async function check() {
  checking.value = true; result.value = null;
  try { result.value = await checkGeminiKey(key.value); if (result.value.ok) await saveNow(); } catch (e) { result.value = { ok: false, message: e.message || 'The key could not be checked.' }; }
  checking.value = false;
}
const auto = computed({ get: () => !store.digest.off, set: v => { store.digest.off = !v; } });
const toPlanner = computed({ get: () => store.digest.autoTasks !== false, set: v => { store.digest.autoTasks = v; } });
</script>

<template>
  <section class="acct-sec t-a" data-test="digest-settings">
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="sparkle" :size="12" /></span>Gemini for your digests</p><span class="muted small">Free, optional</span></div>
    <p class="small">With your own key, every digest is researched by Gemini with Google Search as it is written. Get one free at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>.</p>
    <span class="you-key">
      <input v-model="key" :type="show ? 'text' : 'password'" autocomplete="off" spellcheck="false" placeholder="Paste your Gemini API key" aria-label="Gemini API key" data-test="you-key" />
      <button type="button" class="ibtn ghost" :title="show ? 'Hide' : 'Show'" :aria-label="show ? 'Hide key' : 'Show key'" @click="show = !show"><Icon :name="show ? 'x' : 'search'" /></button>
      <button type="button" class="btn small" :disabled="!key || !keyOk || checking" data-test="you-key-check" @click="check"><Icon :name="checking ? 'refresh' : 'check'" :size="14" />{{ checking ? 'Checking…' : 'Check key' }}</button>
    </span>
    <p v-if="!keyOk" class="pln-err small">That does not look like an API key. Copy it again from Google AI Studio (the copy button next to the key).</p>
    <p v-else-if="result" :class="result.ok ? 'pln-ok' : 'pln-err'" class="small" role="status" data-test="you-key-result">{{ result.message }}</p>
    <p class="muted small">Saved in your account and sent only to Google.</p>
  </section>
  <section class="acct-sec t-b">
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="list" :size="12" /></span>Digests</p></div>
    <label class="dgp-check"><input v-model="auto" type="checkbox" /> New digests every Monday and Thursday</label>
    <label class="dgp-check"><input v-model="toPlanner" type="checkbox" /> Put digest deadlines in my Planner</label>
  </section>
</template>
