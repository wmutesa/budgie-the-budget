<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { capture, sortAndPlace } from '../lib/capture';
import { routeAll, splitSpoken, DESTS } from '../lib/router';
import { useDictation, canDictate } from '../lib/dictation';
import { tidyDictation } from '../lib/tidy';
import { canCapture, prime, createRecorder } from '../lib/recorder';
import { account } from '../lib/account';
import Icon from './Icon.vue';
import { spokenMarks } from '../lib/titles';
import { diag, from, flush } from '../lib/diag';

// The one way to add anything. Tap Add and talk: Taskie records, and when you
// tap Stop it hears the whole recording at once (Deepgram Nova-3 writes it
// down, Gemini fixes names and words from your context), breaks it into
// separate things and puts each in place for a quick review. You can also type.
const note = ref('');
const level = ref(0);
const secs = ref(0);
const phase = ref('idle'); // idle | recording | hearing
let lastAudio = null;       // kept until it is heard, so a failed try can be retried
const rec = createRecorder({
  onLevel: v => { level.value = v; },
  onTime: s => { secs.value = s; },
  onError: (m, code) => {
    diag('rec-error', { code, msg: m.slice(0, 160) });
    note.value = m;
    if (code === 'mic' || code === 'unsupported') { phase.value = 'idle'; note.value = `${m} You can type instead.`; }
  },
});
// Very old browsers without audio capture: their own dictation, if they have it.
let base = '';
const join = (a, b) => { const t = (b || '').trimStart(); return !t ? a : !a || /\s$/.test(a) ? `${a}${t}` : `${a} ${t}`; };
const dict = useDictation({
  continuous: true,
  onError: m => { note.value = `${m} You can type instead.`; },
  onText: t => { capture.text = join(base, spokenMarks(t)); },
  onFinal: t => { capture.text = join(base, spokenMarks(t)).trim(); },
});
const canSpeak = computed(() => canCapture || canDictate);
const recording = computed(() => phase.value === 'recording' || dict.listening.value);
const clock = computed(() => `${Math.floor(secs.value / 60)}:${String(secs.value % 60).padStart(2, '0')}`);
const box = ref(null);

async function listen() {
  note.value = '';
  if (canCapture) {
    phase.value = 'recording'; secs.value = 0;
    const ok = await rec.start();
    if (!ok) phase.value = 'idle';
    return;
  }
  base = capture.text;
  dict.start();
}
// Stop: hear the whole recording and put everything in place.
async function stopAndHear() {
  if (dict.listening.value) { dict.stop(); return; }
  phase.value = 'hearing';
  const audio = await rec.stop();
  if (!audio) { phase.value = 'idle'; note.value = 'Nothing was heard. Check that the microphone is allowed and not muted, then tap Speak again, or type instead.'; return; }
  lastAudio = audio;
  await heard();
}
async function heard() {
  phase.value = 'hearing'; note.value = '';
  try {
    const n = await sortAndPlace(capture.text, { audio: lastAudio });
    lastAudio = null;
    if (!n && capture.open) note.value = capture.heard ? `Taskie heard “${capture.heard.slice(0, 140)}” but found nothing to add. Say it again, or type it.` : 'Nothing was heard in that. Speak a little closer to the microphone and try again.';
  } catch (e) {
    note.value = `${e?.message || 'Taskie could not hear that right now.'}`;
  } finally {
    phase.value = 'idle';
  }
}
const stopAll = () => { if (phase.value === 'recording') rec.cancel(); phase.value = 'idle'; if (dict.listening.value) dict.stop(); };

// Open: start recording straight away when the browser can. Called from the tap,
// so the microphone can start (Safari only allows sound to start inside a tap).
function openSheet({ voice = canSpeak.value } = {}) {
  diag('open-sheet', { voice, already: capture.open });
  if (capture.open) { box.value?.focus(); return; }
  if (voice) prime();
  capture.open = true; note.value = ''; lastAudio = null;
  nextTick(() => { if (voice) listen(); else box.value?.focus(); });
}
// While recording or hearing, the card stays open.
function close() { if (phase.value !== 'idle' || dict.listening.value) return; capture.open = false; }
const rows = computed(() => routeAll(tidyDictation(splitSpoken(capture.text).join('\n'))));
async function addTyped() {
  if (!capture.text.trim() || capture.sorting) return;
  const n = await sortAndPlace(capture.text);
  if (!n && capture.open) note.value = 'Nothing to add was found in that. Edit the words and tap Add again.';
}
const micTap = () => (recording.value ? stopAndHear() : (prime(), listen()));
const onKey = e => {
  if (e.key === 'Escape' && capture.open) close();
  if (!capture.open && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); openSheet({ voice: false }); }
};
onMounted(() => { window.addEventListener('keydown', onKey); diag('mounted', { canCapture, canDictate, secure: window.isSecureContext }); });
onUnmounted(() => { stopAll(); capture.open = false; flush(); window.removeEventListener('keydown', onKey); });
watch(() => capture.open, v => { diag(v ? 'card-open' : 'card-closed', { phase: phase.value, from: from() }); if (!v && phase.value === 'recording') stopAll(); }, { flush: 'sync' });
watch(() => [account.status, account.sync], ([status, sync]) => diag('account', { status, sync }), { flush: 'sync' });
defineExpose({ openSheet });
const EXAMPLES = ['Essay due Friday 5pm #English', 'Gym Mon Wed Fri 6pm', 'I want to run a 10K by March', 'Mark the lab report as done', 'Call mom tomorrow 📞'];
const BARS = 24;
</script>

<template>
  <button type="button" class="cap-fab" :class="{ live: recording, busy: phase === 'hearing' || capture.sorting, open: capture.open, away: capture.at >= 0 }" :aria-label="recording ? 'Recording: open the card' : 'Add anything (N)'" :title="recording ? 'Recording: open the card' : 'Add anything (N)'" data-test="capture" @click="openSheet()">
    <span v-if="recording" class="cap-live" aria-hidden="true" data-test="capture-live"><i class="cap-rec" /></span>
    <span v-else class="cap-glyph"><Icon name="capture" :size="15" /></span>
    <span class="cap-word">{{ recording ? 'Recording' : 'Add' }}</span>
  </button>

  <Teleport to="body">
    <div v-if="capture.open" class="cap-scrim" @click.self="close">
      <section class="cap-sheet" :class="`is-${phase}`" role="dialog" aria-modal="true" aria-label="Add anything" data-test="capture-sheet">
        <!-- Recording and hearing: one calm view, no text to read while you talk. -->
        <div v-if="phase !== 'idle' || dict.listening.value" class="rec" data-test="capture-recording">
          <p class="rec-kicker">{{ phase === 'hearing' ? 'Taskie is listening back' : 'Recording' }}<span v-if="phase === 'recording'" class="rec-clock">{{ clock }}</span></p>
          <h2 class="rec-title">{{ phase === 'hearing' ? 'Turning it into your plan…' : 'Say everything on your mind.' }}</h2>
          <p class="rec-sub muted">{{ phase === 'hearing' ? 'Deepgram writes it down, Gemini checks every name, course and date against your planner.' : 'Assignments, exams, errands, plans, goals: all at once, in any order. Tap Stop when you are done.' }}</p>
          <div class="rec-wave" :class="{ hearing: phase === 'hearing' }" aria-hidden="true" :style="{ '--lv': level }">
            <i v-for="n in BARS" :key="n" :style="{ '--i': n, '--h': (0.35 + 0.65 * Math.abs(Math.sin(n * 1.7))).toFixed(2) }" />
          </div>
          <p v-if="note" class="cap-note small" role="status" data-test="capture-note"><Icon name="help" :size="14" />{{ note }}</p>
          <button v-if="phase === 'recording' || dict.listening.value" type="button" class="rec-stop" data-test="capture-mic" @click="stopAndHear"><Icon name="stop" :size="18" /><span>Stop</span></button>
          <span v-else class="rec-busy" data-test="capture-hearing"><Icon name="refresh" :size="16" />Hearing</span>
        </div>

        <template v-else>
          <header class="cap-head">
            <div>
              <h2>Add anything</h2>
              <p class="muted small">Talk or type several things at once. Taskie sorts them into tasks, routines, events and goals, and shows you each one.</p>
            </div>
            <button type="button" class="sch-icon" aria-label="Close" title="Close (Esc)" @click="close"><Icon name="x" :size="18" /></button>
          </header>
          <div class="cap-pad">
            <textarea ref="box" v-model="capture.text" rows="4" placeholder="“Essay due Friday at 5, gym Monday Wednesday Friday at 6, and I want to run a 10K by March”" aria-label="What to add" data-test="capture-text" @keydown.meta.enter.prevent="addTyped" @keydown.ctrl.enter.prevent="addTyped" />
          </div>
          <p v-if="note" class="cap-note small" role="status" data-test="capture-note"><Icon name="help" :size="14" />{{ note }}<button v-if="lastAudio" type="button" class="linkish" data-test="capture-retry" @click="heard">Try again</button></p>
          <ul v-if="rows.length" class="cap-rows" aria-label="How Taskie will sort it">
            <li v-for="r in rows" :key="r.id" :class="`to-${r.dest}`"><Icon :name="DESTS[r.dest].icon" :size="13" /><b>{{ DESTS[r.dest].label }}</b><span>{{ r.task.title }}</span></li>
          </ul>
          <div v-else class="cap-examples">
            <span class="muted small">Try:</span>
            <button v-for="x in EXAMPLES" :key="x" type="button" class="chip-btn" @click="capture.text = capture.text ? `${capture.text}\n${x}` : x">{{ x }}</button>
          </div>
          <footer class="cap-foot">
            <button v-if="canSpeak" type="button" class="cap-mic" :disabled="capture.sorting" data-test="capture-mic" @click="micTap"><Icon name="mic" :size="16" />Speak</button>
            <span class="muted small cap-keys">Ctrl or ⌘ + Enter</span>
            <button type="button" class="btn primary" :disabled="!capture.text.trim() || capture.sorting" data-test="capture-sort" @click="addTyped">
              <Icon :name="capture.sorting ? 'refresh' : 'plus'" :size="15" />{{ capture.sorting ? 'Breaking it down…' : rows.length > 1 ? `Add ${rows.length} things` : 'Add' }}
            </button>
          </footer>
        </template>
      </section>
    </div>
  </Teleport>
</template>
