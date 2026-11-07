<script setup>
import { ref, onUnmounted } from 'vue';
import { routeSpoken, sendAll, undoSend, DESTS } from '../lib/router';
import { useDictation, canDictate } from '../lib/dictation';
import { go } from '../lib/nav';
import Icon from './Icon.vue';

// Say it from anywhere. Budgie splits what you said into separate things and
// sends each where it belongs: a task, a routine or a goal.
// No form to fill; a note shows what went where, with Undo.
const live = ref('');
const result = ref(null);
const error = ref('');
let hide = null;
const dict = useDictation({
  continuous: true,
  onText: t => { live.value = t; },
  onError: m => { error.value = m; },
  onFinal: async t => {
    const rows = routeSpoken(t);
    live.value = '';
    if (!rows.length) return;
    result.value = { heard: t, ...(await sendAll(rows)) };
    clearTimeout(hide);
    hide = setTimeout(() => { result.value = null; }, 12000);
  },
});
const start = () => { error.value = ''; result.value = null; live.value = ''; dict.toggle(); };
const undo = () => { undoSend(result.value); result.value = null; };
const open = to => { go(to === 'goal' ? 'Playground' : 'Planner', { anchor: to === 'goal' ? '#goals' : '' }); result.value = null; };
onUnmounted(() => clearTimeout(hide));
</script>

<template>
  <span v-if="canDictate" class="voice">
    <button type="button" class="voice-btn" :class="{ on: dict.listening.value }" :aria-pressed="dict.listening.value" :title="dict.listening.value ? 'Stop and add' : 'Say anything to add it'" :aria-label="dict.listening.value ? 'Stop and add' : 'Add by voice'" data-test="voice" @click="start">
      <span v-if="dict.listening.value" class="mic-stop" aria-hidden="true" />
      <svg v-else viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" fill="currentColor" /></svg>
    </button>
    <Teleport to="body">
      <div v-if="dict.listening.value" class="voice-live" role="status" aria-live="polite" data-test="voice-live">
        <i class="rec-dot" aria-hidden="true" />
        <span class="voice-text">{{ live || 'Listening… say one or more things, like “essay due Friday at 5, then gym every Monday at 6”' }}</span>
        <button type="button" class="ibtn" title="Cancel" aria-label="Cancel" @click="dict.cancel()"><Icon name="x" /></button>
        <button type="button" class="ibtn primary" title="Done" aria-label="Done" data-test="voice-stop" @click="dict.stop()"><Icon name="check" /></button>
      </div>
      <div v-else-if="result" class="voice-done" role="status" data-test="voice-done">
        <p class="voice-head"><b>Added {{ result.made.length }} {{ result.made.length === 1 ? 'thing' : 'things' }}</b><span class="muted small">“{{ result.heard }}”</span></p>
        <ul>
          <li v-for="m in result.made" :key="m.id" :class="`to-${m.to}`">
            <button type="button" class="voice-item" :title="`Open ${DESTS[m.to].label}`" @click="open(m.to)">
              <Icon :name="DESTS[m.to].icon" :size="14" /><b>{{ m.label }}</b><span class="muted small">{{ m.sub }}</span><span class="voice-to">{{ DESTS[m.to].label }}</span>
            </button>
          </li>
        </ul>
        <div class="voice-acts">
          <button type="button" class="btn small" data-test="voice-undo" @click="undo"><Icon name="refresh" :size="14" />Undo</button>
          <button type="button" class="ibtn ghost" title="Close" aria-label="Close" @click="result = null"><Icon name="x" /></button>
        </div>
      </div>
      <div v-else-if="error" class="voice-done" role="alert">
        <p class="voice-head"><b>{{ error }}</b></p>
        <div class="voice-acts"><span /><button type="button" class="ibtn ghost" title="Close" aria-label="Close" @click="error = ''"><Icon name="x" /></button></div>
      </div>
    </Teleport>
  </span>
</template>
