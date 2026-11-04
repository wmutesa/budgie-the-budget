<script setup>
import { ref } from 'vue';
import { ai, BROWSER_MODELS, browserAISupported, startBrowserAI, removeBrowserAI } from '../lib/ai';

// Turn the in-browser AI on or off for this device.
const choice = ref(BROWSER_MODELS[0].id);
const supported = browserAISupported();
const turnOn = () => startBrowserAI(choice.value);
const turnOff = () => { if (confirm('Turn off in-browser AI on this device and delete the downloaded model?')) removeBrowserAI(); };
const current = () => BROWSER_MODELS.find(m => m.id === ai.browser.model);
</script>

<template>
  <section class="acct-sec ai-panel" data-test="ai-panel">
    <div class="acct-sec-head"><p class="kicker">AI helper</p><span class="muted small">{{ ai.label }}</span></div>

    <p v-if="ai.status === 'ollama'" class="small">Using Ollama on this computer ({{ ai.model }}). It is private and needs nothing else.</p>

    <template v-else-if="ai.browser.state === 'ready'">
      <p class="small">An open-source model ({{ current()?.name }}) runs inside this browser on your device. Nothing you type is sent anywhere, and no account or API key is involved.</p>
      <button class="btn small" type="button" data-test="ai-off" @click="turnOff">Turn off and delete the model</button>
    </template>

    <template v-else-if="ai.browser.state === 'loading'">
      <p class="small">Downloading and starting the model. This happens once on this device; keep the page open.</p>
      <div class="ai-progress" role="progressbar" :aria-valuenow="ai.browser.progress" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: ai.browser.progress + '%' }" /></div>
      <p class="muted small ai-progress-text">{{ ai.browser.progress }}% · {{ ai.browser.text }}</p>
    </template>

    <template v-else>
      <p class="small">Budgie works without AI, using its built-in rules. For smarter receipt reading and suggestions, run a free open-source model right in this browser: no install, no API key, and your data never leaves the device.</p>
      <p v-if="!supported" class="si-error" role="alert">This browser cannot run AI on the device. Try an up-to-date Chrome, Edge or Safari on a recent device.</p>
      <template v-else>
        <div class="ai-models" role="radiogroup" aria-label="Model">
          <label v-for="m in BROWSER_MODELS" :key="m.id" class="ai-model" :class="{ on: choice === m.id }">
            <input v-model="choice" type="radio" name="ai-model" :value="m.id" />
            <span><b>{{ m.name }}</b><span class="muted small">{{ m.size }} · {{ m.note }}</span></span>
          </label>
        </div>
        <button class="btn primary small" type="button" data-test="ai-on" @click="turnOn">Turn on in-browser AI</button>
        <p class="muted small">Use Wi-Fi: the model downloads once and the browser keeps it. If you run Ollama on this computer, Budgie uses that instead.</p>
      </template>
      <p v-if="ai.browser.error" class="si-error" role="alert">{{ ai.browser.error }}</p>
    </template>
  </section>
</template>
