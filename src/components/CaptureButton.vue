<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { capture, sortAndPlace, hear } from '../lib/capture';
import { routeAll, splitSpoken, DESTS } from '../lib/router';
import { useDictation, canDictate } from '../lib/dictation';
import { tidyDictation } from '../lib/tidy';
import { store } from '../lib/store';
import { canCapture, prime, createLive } from '../lib/livevoice';
import { liveWords, account } from '../lib/account';
import Icon from './Icon.vue';
import { diag, from, flush } from '../lib/diag';

// The one way to add anything. Tap Add and talk: Budgie listens to the
// microphone itself and your words appear in the card as you speak (written
// down by Budgie's server at each pause), and you can edit them while it
// listens. Only Stop, on the card, ends it: Budgie then breaks what you said
// into separate things and puts each one in place. Typed text is added line by line.
const micNote = ref('');
const spoken = ref(false);
const level = ref(0);
// New words go after what is there, with a space only when both sides have text.
const join = (a, b) => { const t = (b || '').trimStart(); return !t ? a : !a || /\s$/.test(a) ? `${a}${t}` : `${a} ${t}`; };
const hasKey = computed(() => !!store.digest?.geminiKey);
// With a Gemini key the whole recording also goes to Gemini on Stop: it reads it in full.
const geminiAudio = computed(() => canCapture && hasKey.value && store.planner?.geminiAudio !== false);

// Budgie's own listening (every modern browser).
const recLive = ref(false);
let liveFailed = false;
const live = createLive({
  send: liveWords,
  onLevel: v => { level.value = v; },
  onText: t => { spoken.value = true; liveFailed = false; capture.text = join(capture.text, t); nextTick(() => { if (box.value && document.activeElement !== box.value) box.value.scrollTop = box.value.scrollHeight; }); },
  onError: (m, code) => {
    diag('live-error', { code, msg: m.slice(0, 160) });
    if (code === 'mic' || code === 'unsupported') { recLive.value = false; micNote.value = `${m} You can type instead.`; return; }
    liveFailed = true;
    micNote.value = hasKey.value
      ? `${m} Keep talking: Budgie is still recording, and Gemini writes it all down when you tap Stop.`
      : `${m} Keep talking: Budgie is still recording and tries each phrase again. You can also type.`;
  },
});
// Older browsers without audio capture: their own dictation, if they have it.
const dict = useDictation({
  continuous: true,
  onError: m => { diag('dict-error', { msg: m.slice(0, 160) }); micNote.value = `${m} You can type instead.`; },
  onText: t => { spoken.value = true; capture.text = join(base, t); },
  onFinal: t => { capture.text = join(base, t).trim(); },
});
let base = '';
const canSpeak = computed(() => canCapture || canDictate);
const listening = computed(() => recLive.value || dict.listening.value);
const box = ref(null);
// Editing while it listens is fine: new words are added at the end.
function onEdit() { if (dict.listening.value) { base = capture.text; dict.commit(); } }

async function listen() {
  diag('listen', { canCapture, canDictate });
  micNote.value = ''; liveFailed = false;
  if (capture.text && !capture.text.endsWith('\n')) capture.text += '\n';
  if (canCapture) {
    recLive.value = true;
    const ok = await live.start();
    diag('started', { ok, open: capture.open });
    if (!ok) recLive.value = false;
    return;
  }
  base = capture.text;
  dict.start();
}
const stopAll = () => { if (recLive.value) live.cancel(); recLive.value = false; if (dict.listening.value) dict.stop(); };

// Open: start listening straight away when the browser can. Called from the tap,
// so the microphone can start (Safari only allows sound to start inside a tap).
function openSheet({ voice = canSpeak.value } = {}) {
  diag('open-sheet', { voice, already: capture.open, at: capture.at, sorting: capture.sorting });
  if (capture.open) { box.value?.focus(); return; }
  if (voice) prime();
  capture.open = true; spoken.value = false; micNote.value = '';
  nextTick(() => { if (voice && !listening.value) listen(); else box.value?.focus(); });
}
// While recording, the card stays open: only Stop ends it.
function close() { diag('close-asked', { listening: listening.value }); if (listening.value) return; capture.open = false; }
// How it will be split (the rules; the AI may tidy the wording), shown as you go.
const rows = computed(() => routeAll(tidyDictation(splitSpoken(capture.text).join('\n'))));
const NOTHING = 'Nothing was heard. Check that the microphone is allowed for this site and not muted, then tap Speak again, or type instead.';
async function sortIt() {
  diag('sort', { listening: listening.value, chars: capture.text.length, spoken: spoken.value });
  if (capture.sorting) return;
  const wasListening = listening.value;
  capture.sorting = true; // Stop shows at once that it is working
  try {
    let audio = null;
    if (recLive.value) { recLive.value = false; audio = await live.stop(); } // waits for the last words
    if (dict.listening.value) {
      dict.stop();
      for (let i = 0; i < 30 && dict.listening.value; i++) await new Promise(r => setTimeout(r, 50));
    }
    // Live words failed but Gemini can hear: it writes the recording down first, so you can check and edit it.
    if (wasListening && audio && hasKey.value && (liveFailed || !spoken.value)) {
      let said = '';
      try { said = await hear(audio); } catch (e) { micNote.value = `Gemini could not write it down (${e.message || 'no answer'}). Type it instead, or try again.`; return; }
      if (!said) { micNote.value = NOTHING; return; }
      capture.text = join(capture.text.trim() ? `${capture.text.trim()}\n` : '', said);
      micNote.value = 'Here is what Gemini heard. Fix any word, then tap Add.';
      nextTick(() => box.value?.focus());
      return;
    }
    if (!capture.text.trim()) { if (wasListening) micNote.value = liveFailed ? `${micNote.value.split(' Keep talking')[0]} Nothing could be written down. Add a free Gemini key in Profile, or type instead.` : NOTHING; return; }
    capture.sorting = false;
    const n = await sortAndPlace(capture.text, { spoken: spoken.value, audio: geminiAudio.value ? audio : null });
    if (!n && capture.open) micNote.value = 'Nothing to add was found in that. Edit the words and tap Add again.';
  } finally {
    capture.sorting = false;
  }
}
// The mic on the card: Speak starts listening; Stop ends it and sorts what was said.
const micTap = () => { if (listening.value) return sortIt(); prime(); spoken.value = true; return listen(); };
const onKey = e => {
  if (e.key === 'Escape' && capture.open) close();
  // "N" anywhere (not while typing) opens it.
  if (!capture.open && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); openSheet({ voice: false }); }
};
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => { diag('unmounted', { open: capture.open, listening: listening.value }); flush(); window.removeEventListener('keydown', onKey); });
// Who opens and closes the card, as it happens.
watch(() => capture.open, v => diag(v ? 'card-open' : 'card-closed', { listening: listening.value, from: from() }), { flush: 'sync' });
watch(listening, v => diag(v ? 'listening-on' : 'listening-off', { open: capture.open }), { flush: 'sync' });
watch(() => [account.status, account.sync, account.note], ([status, sync, note]) => diag('account', { status, sync, note: note || '' }), { flush: 'sync' });
onMounted(() => diag('mounted', { canCapture, canDictate, secure: window.isSecureContext }));
watch(() => capture.open, v => { if (!v && listening.value) stopAll(); });
defineExpose({ openSheet });
const EXAMPLES = ['Essay due Friday 5pm #English', 'Gym Mon Wed Fri 6pm', 'I want to run a 10K by March', 'Mark the lab report as done'];
</script>

<template>
  <button type="button" class="cap-fab" :class="{ live: listening, busy: capture.sorting, open: capture.open, away: capture.at >= 0 }" :aria-label="listening ? 'Recording: open the card' : 'Add anything (N)'" :title="listening ? 'Recording: open the card' : 'Add anything (N)'" data-test="capture" @click="openSheet()">
    <span v-if="listening" class="cap-live" aria-hidden="true" data-test="capture-live"><i class="cap-rec" /></span>
    <span v-else class="cap-glyph"><Icon name="capture" :size="15" /></span>
    <span class="cap-word">{{ listening ? 'Recording' : 'Add' }}</span>
  </button>

  <Teleport to="body">
    <div v-if="capture.open" class="cap-scrim" @click.self="close">
      <section class="cap-sheet" role="dialog" aria-modal="true" aria-label="Add anything" data-test="capture-sheet">
        <header class="cap-head">
          <div>
            <h2>{{ capture.sorting ? (hasKey ? 'Breaking it down with Gemini…' : 'Breaking it down…') : listening ? 'Listening…' : 'Add anything' }}</h2>
            <p class="muted small">{{ listening ? 'Say everything on your mind. Your words appear here as you speak, and you can fix any of them. Tap Stop when you are done: Budgie splits it into tasks, routines, events and goals.' : 'Say or type several things. Budgie sorts them into tasks, routines, events and goals, then shows you each one to keep or change.' }}</p>
          </div>
          <button v-if="!listening" type="button" class="sch-icon" aria-label="Close" title="Close (Esc)" @click="close"><Icon name="x" :size="18" /></button>
        </header>

        <div class="cap-pad" :class="{ live: listening }">
          <textarea ref="box" v-model="capture.text" rows="4" placeholder="“Essay due Friday at 5, gym Monday Wednesday Friday at 6, and I want to run a 10K by March”" aria-label="What to add" data-test="capture-text" @input="onEdit" @keydown.meta.enter.prevent="sortIt" @keydown.ctrl.enter.prevent="sortIt" />
          <div class="cap-wave" aria-hidden="true" :style="{ '--lv': level }"><i v-for="n in 5" :key="n" /></div>
        </div>

        <p v-if="micNote" class="cap-note small" role="status" data-test="capture-note"><Icon name="help" :size="14" />{{ micNote }}</p>
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
