<script setup>
import { ref } from 'vue';
import { store, newId } from '../lib/store';
import { captureFile, captureNote, enrich } from '../lib/capture';
import { ai } from '../lib/ai';
import { useDictation, canDictate } from '../lib/dictation';
import MicButton from './MicButton.vue';
import RecordingStrip from './RecordingStrip.vue';

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
let before = '';
const dict = useDictation({
  onText: t => { note.value = t; },
  onFinal: () => onNote(),
  onError: m => { message.value = m; },
  onCancel: () => { note.value = before; },
});
const startNote = () => { message.value = ''; before = note.value; dict.toggle(); };

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
    <form class="say-bar" :class="{ live: dict.listening.value }" @submit.prevent="onNote">
      <span class="say-icon" aria-hidden="true">+</span>
      <input v-model="note" class="say-input" data-test="quick-note" autocomplete="off"
        :placeholder="dict.listening.value ? 'Listening…' : 'Type or say it: 12.50 lunch at Chipotle last friday'" aria-label="Describe a payment" />
      <MicButton v-if="canDictate" :listening="dict.listening.value" @toggle="startNote" />
      <button class="say-add" type="submit" :disabled="!note.trim()">Add <span aria-hidden="true">↵</span></button>
    </form>
    <RecordingStrip v-if="dict.listening.value" :elapsed="dict.elapsed.value" :transcript="dict.transcript.value"
      hint="Say it like “12.50 for lunch at Chipotle yesterday”." stop-label="Add it" @stop="dict.stop()" @cancel="dict.cancel()" />
    <div class="ways">
      <button class="way" @click="camera.click()"><b>Scan receipt</b><span>Take a photo with your camera</span></button>
      <button class="way" @click="files.click()"><b>Upload</b><span>Receipt photo, PDF or invoice</span></button>
      <button class="way" @click="files.click()"><b>Import statement</b><span>CSV or Excel from your bank</span></button>
      <div class="way drop"><b>Drop files here</b><span>Any of the above, several at once</span></div>
    </div>
    <input ref="camera" type="file" accept="image/*" capture="environment" hidden @change="onFiles" />
    <input ref="files" data-test="file-input" type="file" multiple accept="image/*,.pdf,.csv,.txt,.xlsx,.xls" hidden @change="onFiles" />
    <p class="hint-line"><span>Try</span> <button type="button" class="eg" @click="note = 'Uber 23.40 a week ago'">Uber 23.40 a week ago</button> <button type="button" class="eg" @click="note = 'spent 64 on groceries at Trader Joe\'s yesterday'">groceries at Trader Joe’s yesterday</button> <button type="button" class="eg" @click="note = 'got paid 2350 salary on the 1st'">salary on the 1st</button></p>
    <p v-if="busy" class="status-line">{{ busy }}<template v-if="progress && progress < 100"> {{ progress }}%</template></p>
    <p v-else-if="message" class="status-line done">{{ message }}</p>
  </section>
</template>
