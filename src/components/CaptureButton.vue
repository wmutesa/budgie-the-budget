<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { capture, sortAndPlace } from '../lib/capture';
import { routeAll, splitSpoken, DESTS } from '../lib/router';
import { useDictation, canDictate } from '../lib/dictation';
import { tidyDictation } from '../lib/tidy';
import { store } from '../lib/store';
import { canRecord, startRecording, stopRecording, cancelRecording, toGeminiAudio } from '../lib/voicerec';
import Icon from './Icon.vue';

// The one way to add anything. Tap Add and talk: the words appear as you speak
// and you can edit them while it listens. Tap Stop and Budgie breaks what you
// said into separate things (the on-device AI when it is ready, rules
// otherwise) and puts each one in place. Typed text is added line by line.
let base = '';
const micNote = ref('');
const spoken = ref(false);
// New words go after what is there, with a space only when both sides have text.
const join = (a, b) => { const t = (b || '').trimStart(); return !t ? a : !a || /\s$/.test(a) ? `${a}${t}` : `${a} ${t}`; };
const dict = useDictation({
  continuous: true,
  // A blocked microphone is a quiet note in the sheet, not an alarm: typing works too.
  onError: m => { micNote.value = m; },
  onCancel: () => { capture.text = base; },
  onText: t => { spoken.value = true; capture.text = join(base, t); },
  onFinal: t => { capture.text = join(base, t).trim(); },
});
// With a Gemini key, the recording itself also goes to Gemini when you stop
// (it hears better than the browser). Without speech recognition in the
// browser (Firefox), recording alone still works: Gemini writes it down.
const geminiAudio = computed(() => canRecord && !!store.digest?.geminiKey && store.planner?.geminiAudio !== false);
const canSpeak = computed(() => canDictate || geminiAudio.value);
const recOnly = ref(false);
const listening = computed(() => dict.listening.value || recOnly.value);
const box = ref(null);
// How long you have been talking, shown on the top bar button.
const secs = ref(0);
let clockId = 0;
watch(listening, on => { clearInterval(clockId); secs.value = 0; if (on) clockId = setInterval(() => { secs.value++; }, 1000); });
onUnmounted(() => clearInterval(clockId));
const elapsed = computed(() => `${Math.floor(secs.value / 60)}:${String(secs.value % 60).padStart(2, '0')}`);
// Edit while you talk: what you typed stays, and new words land after it.
function onEdit() {
  if (!listening.value) return;
  base = capture.text;
  dict.commit();
}
const listen = () => {
  base = capture.text && !capture.text.endsWith('\n') ? `${capture.text}\n` : capture.text;
  if (geminiAudio.value) startRecording();
  if (canDictate) dict.start(); else recOnly.value = true;
};
const stopAll = () => { if (dict.listening.value) dict.stop(); recOnly.value = false; cancelRecording(); };

// Open: start listening straight away when the browser can.
function openSheet({ voice = canSpeak.value } = {}) {
  capture.open = true; spoken.value = false; micNote.value = '';
  nextTick(() => { if (voice && !listening.value) listen(); else box.value?.focus(); });
}
function close() { if (listening.value) stopAll(); capture.open = false; }
// How it will be split, shown as you go.
// How it will be split (the rules; the AI may tidy the wording), shown as you go.
const rows = computed(() => routeAll(tidyDictation(splitSpoken(capture.text).join('\n'))));
async function sortIt() {
  if (dict.listening.value) {
    dict.stop();
    // Wait for the last words before breaking it down.
    for (let i = 0; i < 30 && dict.listening.value; i++) await new Promise(r => setTimeout(r, 50));
  }
  recOnly.value = false;
  if (capture.sorting) return;
  capture.sorting = true;
  const blob = await stopRecording();
  const audio = blob ? await toGeminiAudio(blob).catch(() => null) : null;
  capture.sorting = false;
  if (!capture.text.trim() && !audio) return;
  await sortAndPlace(capture.text, { spoken: spoken.value, audio });
}
// The mic: Speak starts listening; Stop ends it and sorts what was said.
const micTap = () => (listening.value ? sortIt() : (spoken.value = true, listen()));
const onKey = e => {
  if (e.key === 'Escape' && capture.open) close();
  // "N" anywhere (not while typing) opens it.
  if (!capture.open && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); openSheet({ voice: false }); }
};
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
watch(() => capture.open, v => { if (!v && listening.value) stopAll(); });
defineExpose({ openSheet });
const EXAMPLES = ['Essay due Friday 5pm #English', 'Gym Mon Wed Fri 6pm', 'I want to run a 10K by March', 'Mark the lab report as done'];
</script>

<template>
  <button type="button" class="cap-fab" :class="{ live: listening, busy: capture.sorting, open: capture.open, away: capture.at >= 0 }" :aria-label="listening ? 'Recording: tap to stop and sort' : 'Add anything (N)'" :title="listening ? 'Tap to stop recording' : 'Add anything (N)'" data-test="capture" @click="capture.open ? sortIt() : openSheet()">
    <span v-if="listening" class="cap-live" aria-hidden="true" data-test="capture-live">
      <i class="cap-rec" /><span class="cap-time">{{ elapsed }}</span><span class="cap-bars"><i v-for="n in 4" :key="n" /></span>
    </span>
    <span v-else class="cap-glyph"><Icon name="capture" :size="15" /></span>
    <span class="cap-word">{{ listening ? `Recording ${elapsed}: tap to stop` : 'Add' }}</span>
  </button>

  <Teleport to="body">
    <div v-if="capture.open" class="cap-scrim" @click.self="close">
      <section class="cap-sheet" role="dialog" aria-modal="true" aria-label="Add anything" data-test="capture-sheet">
        <header class="cap-head">
          <div>
            <h2>{{ capture.sorting ? (store.digest?.geminiKey ? 'Breaking it down with Gemini…' : 'Breaking it down…') : recOnly ? 'Recording…' : listening ? 'Listening…' : 'Add anything' }}</h2>
            <p class="muted small">{{ recOnly ? 'Recording. Say everything on your mind, then tap Stop: Gemini writes it down and splits it into tasks, routines, events and goals.' : listening ? `Say everything on your mind, and fix any word as you go. Tap Stop when you are done: ${geminiAudio ? 'Gemini listens to the recording and ' : 'Budgie '}splits it into tasks, routines, events and goals.` : 'Say or type several things. Budgie sorts them into tasks, routines, events and goals, then shows you each one to keep or change.' }}</p>
          </div>
          <button type="button" class="sch-icon" aria-label="Close" title="Close (Esc)" @click="close"><Icon name="x" :size="18" /></button>
        </header>

        <div class="cap-pad" :class="{ live: listening }">
          <textarea ref="box" v-model="capture.text" rows="4" placeholder="“Essay due Friday at 5, gym Monday Wednesday Friday at 6, and I want to run a 10K by March”" aria-label="What to add" data-test="capture-text" @input="onEdit" @keydown.meta.enter.prevent="sortIt" @keydown.ctrl.enter.prevent="sortIt" />
          <div class="cap-wave" aria-hidden="true"><i v-for="n in 5" :key="n" /></div>
        </div>

        <p v-if="micNote" class="cap-note small" role="status"><Icon name="help" :size="14" />{{ micNote }} You can type instead.</p>
        <ul v-if="rows.length" class="cap-rows" aria-label="How Budgie will sort it">
          <li v-for="r in rows" :key="r.id" :class="`to-${r.dest}`"><Icon :name="DESTS[r.dest].icon" :size="13" /><b>{{ DESTS[r.dest].label }}</b><span>{{ r.task.title }}</span></li>
        </ul>
        <div v-else class="cap-examples">
          <span class="muted small">Try:</span>
          <button v-for="x in EXAMPLES" :key="x" type="button" class="chip-btn" @click="capture.text = capture.text ? `${capture.text}\n${x}` : x">{{ x }}</button>
        </div>

        <footer class="cap-foot">
          <button v-if="canSpeak" type="button" class="cap-mic" :class="{ on: listening }" :aria-pressed="listening" :disabled="capture.sorting" data-test="capture-mic" @click="micTap">
            <Icon :name="listening ? 'pause' : 'capture'" :size="16" />{{ listening ? 'Stop' : 'Speak' }}
          </button>
          <span class="muted small cap-keys">{{ listening ? 'Stop sorts it for you' : 'Ctrl or ⌘ + Enter' }}</span>
          <button v-if="!listening" type="button" class="btn primary" :disabled="!capture.text.trim() || capture.sorting" data-test="capture-sort" @click="sortIt">
            <Icon :name="capture.sorting ? 'refresh' : 'plus'" :size="15" />{{ capture.sorting ? 'Breaking it down…' : rows.length > 1 ? `Add ${rows.length} things` : 'Add' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
