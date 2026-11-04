<script setup>
import { ai, MODELS, browserAISupported, startBrowserModels, setAIEnabled } from '../lib/ai';

// AI on this device: on by default, models picked per task automatically.
const supported = browserAISupported();
const stateText = s => ({
  idle: 'Not started', loading: `Downloading · ${s.progress}%`, ready: 'Ready', error: 'Not available', skipped: 'Skipped on this device', waiting: 'Waiting for a faster connection',
}[s.state] || s.state);
const toggle = () => {
  if (ai.enabled && !confirm('Turn off AI on this device? The downloaded models are deleted, and Budgie uses its built-in rules.')) return;
  setAIEnabled(!ai.enabled);
};
</script>

<template>
  <section class="acct-sec ai-panel" data-test="ai-panel">
    <div class="acct-sec-head">
      <p class="kicker">AI helper</p>
      <label class="ai-switch"><input type="checkbox" :checked="ai.enabled" data-test="ai-toggle" @change="toggle" /> <span>{{ ai.enabled ? 'On' : 'Off' }}</span></label>
    </div>

    <template v-if="ai.enabled">
      <p class="small">Budgie picks the best model for each job from the ones ready on this device: Qwen for reading receipts, Llama for writing suggestions, and Ollama for both when it runs on your computer. If one is busy or missing, the next takes over. Everything runs on your device, with no API key.</p>
      <ul class="ai-engines">
        <li>
          <span><b>Ollama</b><span class="muted small">{{ ai.ollama.state === 'ready' ? ai.ollama.model : 'Not running on this computer' }}</span></span>
          <span class="ai-state" :class="ai.ollama.state">{{ ai.ollama.state === 'ready' ? 'Ready' : ai.ollama.state === 'checking' ? 'Checking' : 'Optional' }}</span>
        </li>
        <li v-for="key in ['small', 'medium']" :key="key">
          <span><b>{{ MODELS[key].name }}</b><span class="muted small">In this browser · {{ MODELS[key].size }} · best for {{ MODELS[key].good }}</span></span>
          <span class="ai-state" :class="ai[key].state">{{ stateText(ai[key]) }}</span>
          <div v-if="ai[key].state === 'loading'" class="ai-progress" role="progressbar" :aria-valuenow="ai[key].progress" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: ai[key].progress + '%' }" /></div>
        </li>
      </ul>
      <p v-if="ai.note" class="small ai-note">{{ ai.note }}</p>
      <button v-if="supported && (ai.small.state === 'waiting' || ai.small.state === 'error' || ai.medium.state === 'skipped' || ai.medium.state === 'error')" class="btn small" type="button" data-test="ai-download" @click="startBrowserModels({ force: true })">
        {{ ai.small.state === 'ready' ? 'Download Llama 3.2 too' : 'Download now' }}
      </button>
      <p v-if="!supported" class="muted small">This browser cannot run models on the device. Budgie uses its built-in rules, or Ollama if it runs on this computer.</p>
      <p v-else-if="ai.small.state === 'error' && ai.small.error" class="muted small">{{ ai.small.error }}</p>
    </template>
    <p v-else class="small">AI is off on this device. Budgie uses its built-in rules. Turn it back on to download the models again.</p>
  </section>
</template>
