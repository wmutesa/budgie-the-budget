<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import Icon from './Icon.vue';
import { checkGeminiKey, saveNow, account } from '../lib/account';

// AI and voice. Recordings are always heard by Deepgram Nova-3; Gemini then
// fixes words from context and splits everything into items. Taskie uses the
// server's Gemini key for everyone; your own free key is optional (your own
// quota). "Help Taskie hear better" keeps text pairs (what was heard and what it
// really was) to train Taskie: on unless you turn it off. Never audio.
const show = ref(false);
// Pasted keys can carry spaces or quotes; keys come in more than one format.
const tidy = v => String(v || '').replace(/\s+/g, '').replace(/^["'`]+|["'`]+$/g, '');
const key = computed({ get: () => store.digest.geminiKey || '', set: v => { store.digest.geminiKey = tidy(v) || undefined; result.value = null; } });
const keyOk = computed(() => !key.value || /^[A-Za-z0-9._~+/=-]{20,256}$/.test(key.value));
const helpHear = computed({ get: () => store.planner?.helpHear !== false, set: v => { store.planner.helpHear = v; } });
// The owner can share their key so everyone's recordings get Gemini's correction.
const shareKey = computed({ get: () => store.planner?.shareGemini !== false, set: v => { store.planner.shareGemini = v; } });
const owner = computed(() => account.user?.role === 'owner');
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
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="sparkle" :size="12" /></span>AI and voice</p><span class="muted small">Deepgram + Gemini</span></div>
    <p class="small">When you talk in <b>Add</b>, Deepgram Nova-3 writes it down and Gemini fixes names, courses and dates from your planner, then splits it into tasks. A key of your own is optional: it uses your own free quota. Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>.</p>
    <span class="you-key">
      <input v-model="key" :type="show ? 'text' : 'password'" autocomplete="off" spellcheck="false" placeholder="Paste your Gemini API key" aria-label="Gemini API key" data-test="you-key" />
      <button type="button" class="ibtn ghost" :title="show ? 'Hide' : 'Show'" :aria-label="show ? 'Hide key' : 'Show key'" @click="show = !show"><Icon :name="show ? 'x' : 'search'" /></button>
      <button type="button" class="btn small" :disabled="!key || !keyOk || checking" data-test="you-key-check" @click="check"><Icon :name="checking ? 'refresh' : 'check'" :size="14" />{{ checking ? 'Checking…' : 'Check key' }}</button>
    </span>
    <p v-if="!keyOk" class="pln-err small">That does not look like an API key. Copy it again from Google AI Studio (the copy button next to the key).</p>
    <p v-else-if="result" :class="result.ok ? 'pln-ok' : 'pln-err'" class="small" role="status" data-test="you-key-result">{{ result.message }}</p>
    <label class="dgp-check" data-test="help-hear"><input v-model="helpHear" type="checkbox" /> Help Taskie hear better: keep the text of what was heard and what it became, to train Taskie</label>
    <label v-if="owner && key" class="dgp-check" data-test="share-gemini"><input v-model="shareKey" type="checkbox" /> Use my key for everyone I invite (when the server has no key of its own)</label>
    <p class="muted small">Your key stays in your account and goes only to Google. Taskie never keeps recordings, only text, and you can turn that off here.</p>
  </section>
</template>
