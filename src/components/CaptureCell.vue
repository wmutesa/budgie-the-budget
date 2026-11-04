<script setup>
import { ref, onUnmounted } from 'vue';
import { store, newId } from '../lib/store';
import { captureFile, captureNote, enrich } from '../lib/capture';
import { ai } from '../lib/ai';

// Four ways in: camera, any file, a statement, or one line of text.
const busy = ref('');
const progress = ref(0);
const message = ref('');
const note = ref('');
const dragging = ref(false);
const camera = ref(null);
const files = ref(null);

async function addDrafts(drafts, label) {
  if (!drafts.length) { message.value = `Nothing to add from ${label}.`; return; }
  busy.value = 'Matching merchants on the web…';
  const enriched = [];
  for (const d of drafts.slice(0, 200)) enriched.push({ id: newId(), ...(await enrich(d)) });
  store.drafts.unshift(...enriched);
  message.value = `${enriched.length} item${enriched.length === 1 ? '' : 's'} from ${label} ready to review.`;
}

async function handle(list) {
  message.value = '';
  for (const file of list) {
    busy.value = `Reading ${file.name}…`;
    progress.value = 0;
    try {
      const drafts = await captureFile(file, { base: store.base, onProgress: p => { progress.value = p; } });
      await addDrafts(drafts, file.name);
    } catch (e) {
      message.value = e.message || `Could not read ${file.name}.`;
    }
  }
  busy.value = '';
}

const onFiles = e => { handle([...e.target.files]); e.target.value = ''; };
const onDrop = e => { dragging.value = false; handle([...e.dataTransfer.files]); };
// Live dictation with the browser's own speech recognition (Chrome, Edge, Safari).
const Speech = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const canDictate = !!Speech;
const listening = ref(false);
let rec = null;
function toggleDictation() {
  if (listening.value) { rec?.stop(); return; }
  rec = new Speech();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    note.value = (finalText + interim).trim();
  };
  rec.onerror = e => { message.value = e.error === 'not-allowed' ? 'Allow the microphone to dictate.' : 'Dictation stopped. Try again.'; };
  rec.onend = () => { listening.value = false; if (finalText.trim()) onNote(); };
  listening.value = true;
  message.value = 'Listening… say it like “twelve fifty for lunch at Chipotle yesterday”.';
  rec.start();
}
onUnmounted(() => rec?.abort());

async function onNote() {
  const drafts = captureNote(note.value, store.base);
  if (!drafts.length) { message.value = 'Add an amount, for example “Uber 23.40 yesterday”.'; return; }
  note.value = '';
  await addDrafts(drafts, 'your note');
  busy.value = '';
}
</script>

<template>
  <section class="card cell capture" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
    <div class="cell-head">
      <p class="label">Add spending</p>
      <span class="muted small">Reader · {{ ai.status === 'ollama' ? `local AI (${ai.model})` : 'on-device rules' }}</span>
    </div>
    <form class="note" @submit.prevent="onNote">
      <div class="note-wrap">
        <input v-model="note" class="field note-field" data-test="quick-note" placeholder="Type or say it: 12.50 lunch at Chipotle last friday" />
        <button v-if="canDictate" type="button" class="mic" :class="{ on: listening }" :aria-label="listening ? 'Stop dictation' : 'Dictate'" :title="listening ? 'Stop' : 'Dictate'" @click="toggleDictation">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" fill="currentColor"/></svg>
        </button>
      </div>
      <button class="btn primary" type="submit">Add</button>
    </form>
    <div class="ways">
      <button class="way" @click="camera.click()"><b>Scan receipt</b><span>Take a photo with your camera</span></button>
      <button class="way" @click="files.click()"><b>Upload</b><span>Receipt photo, PDF or invoice</span></button>
      <button class="way" @click="files.click()"><b>Import statement</b><span>CSV or Excel from your bank</span></button>
      <div class="way drop"><b>Drop files here</b><span>Any of the above, several at once</span></div>
    </div>
    <input ref="camera" type="file" accept="image/*" capture="environment" hidden @change="onFiles" />
    <input ref="files" data-test="file-input" type="file" multiple accept="image/*,.pdf,.csv,.txt,.xlsx,.xls" hidden @change="onFiles" />
    <p class="hint-line">Understands dates like “a week ago”, “last friday”, “in a month”, “on the 3rd”.</p>
    <p v-if="busy" class="status-line">{{ busy }}<template v-if="progress && progress < 100"> {{ progress }}%</template></p>
    <p v-else-if="message" class="status-line done">{{ message }}</p>
  </section>
</template>
