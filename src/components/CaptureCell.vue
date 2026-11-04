<script setup>
import { ref } from 'vue';
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
      <input v-model="note" class="field note-field" data-test="quick-note" placeholder="Type it like you'd say it: Uber 23.40 yesterday" />
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
    <p v-if="busy" class="status-line">{{ busy }}<template v-if="progress && progress < 100"> {{ progress }}%</template></p>
    <p v-else-if="message" class="status-line done">{{ message }}</p>
  </section>
</template>
