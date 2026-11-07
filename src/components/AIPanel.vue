<script setup>
import { ai, MODELS, browserAISupported, startBrowserModels, setAIEnabled } from '../lib/ai';

// AI on this device: on by default, models picked per task automatically.
const supported = browserAISupported();
const stateText = s => ({
  idle: 'Not started', loading: `Downloading · ${s.progress}%`, ready: 'Ready', error: 'Not available', skipped: 'Skipped on this device', notneeded: 'Not needed: the graphics chip models are ready', waiting: 'Waiting for a faster connection',
}[s.state] || s.state);
const toggle = () => {
  if (ai.enabled && !confirm('Turn off AI on this device? The downloaded models are deleted, and Budgie uses its built-in rules.')) return;
  setAIEnabled(!ai.enabled);
};
</script>

<template>
  <section class="acct-sec ai-panel" data-test="ai-panel">
    <div class="acct-sec-head">
      <p class="kicker"><span class="acct-ico" aria-hidden="true">✦</span>AI helper</p>
      <label class="ai-switch"><input type="checkbox" :checked="ai.enabled" data-test="ai-toggle" @change="toggle" /> <span>{{ ai.enabled ? 'On' : 'Off' }}</span></label>
    </div>

    <template v-if="ai.enabled">
      <p class="small">Budgie picks the best ready model for each job and switches if one is missing. Everything runs on your device, with no API key.</p>
      <ul class="ai-engines">
        <li>
          <span><b>Ollama</b><span class="muted small">{{ ai.ollama.state === 'ready' ? ai.ollama.model : 'Not running on this computer' }}</span></span>
          <span class="ai-state" :class="ai.ollama.state">{{ ai.ollama.state === 'ready' ? 'Ready' : ai.ollama.state === 'checking' ? 'Checking' : 'Optional' }}</span>
        </li>
        <li v-for="key in ['small', 'medium', 'cpu']" :key="key">
          <span><b>{{ MODELS[key].name }}</b><span class="muted small">{{ key === 'cpu' ? 'Processor' : 'Graphics chip' }} · {{ MODELS[key].size }} · {{ key === 'cpu' ? 'works in any browser' : `best for ${MODELS[key].good}` }}</span></span>
          <span class="ai-state" :class="ai[key].state">{{ stateText(ai[key]) }}</span>
          <div v-if="ai[key].state === 'loading'" class="ai-progress" role="progressbar" :aria-valuenow="ai[key].progress" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: ai[key].progress + '%' }" /></div>
        </li>
      </ul>
      <p v-if="ai.note" class="small ai-note">{{ ai.note }}</p>
      <details v-if="['small', 'medium', 'cpu'].some(k => ai[k].detail)" class="ai-detail">
        <summary>Technical details</summary>
        <p v-for="k in ['small', 'medium', 'cpu'].filter(k => ai[k].detail)" :key="k" class="small"><b>{{ MODELS[k].name }}:</b> {{ ai[k].detail }}</p>
      </details>
      <p v-if="ai.cpu.state === 'error' && ai.cpu.error" class="ai-error small" role="status">Processor: {{ ai.cpu.error }}</p>
      <p v-if="ai.small.state === 'error' && ai.small.error" class="ai-error small" role="status" data-test="ai-error">{{ ai.small.error }}{{ /built-in rules/.test(ai.small.error) ? '' : ' Budgie keeps working with its built-in rules.' }}</p>
      <p v-else-if="ai.medium.state === 'error' && ai.medium.error" class="ai-error small" role="status">Llama 3.2: {{ ai.medium.error }}</p>
      <button v-if="(ai.small.state === 'waiting' || ai.small.state === 'error' || ai.medium.state === 'skipped' || ai.medium.state === 'error' || ai.cpu.state === 'error' || ai.cpu.state === 'waiting')" class="btn small" type="button" data-test="ai-download" @click="startBrowserModels({ force: true })">
        {{ ai.small.state === 'error' || ai.cpu.state === 'error' ? 'Try again' : ai.small.state === 'ready' ? 'Download Llama 3.2 too' : 'Download now' }}
      </button>
      <p v-if="!supported" class="muted small">This browser has no graphics-chip access for AI, so Budgie runs Qwen 2.5 on the processor instead. It is slower but private.</p>
    </template>
    <p v-else class="small">AI is off on this device. Budgie uses its built-in rules. Turn it back on to download the models again.</p>
  </section>
</template>
