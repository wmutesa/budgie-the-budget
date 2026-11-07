<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { capture, sortAndPlace } from '../lib/capture';
import { routeAll, DESTS } from '../lib/router';
import { useDictation, canDictate, ACCENTS, defaultAccent } from '../lib/dictation';
import { store } from '../lib/store';
import { ai, aiRewriteDictation } from '../lib/ai';
import { tidyDictation } from '../lib/tidy';
import { toast } from '../lib/toast';
import Icon from './Icon.vue';

// The one way to add anything: tap, talk (or type), and Budgie sorts it.
let base = '';
const micNote = ref('');
let spoken = false;
// New words go after what is there, with a space only when both sides have text.
const join = (a, b) => { const t = (b || "").trimStart(); return !t ? a : !a || /\s$/.test(a) ? `${a}${t}` : `${a} ${t}`; };
// The accent to listen for, remembered per account.
const accent = computed({ get: () => store.planner.accent || defaultAccent(), set: v => { store.planner.accent = v; } });
const dict = useDictation({
  continuous: true,
  lang: () => accent.value,
  // A blocked microphone is a quiet note in the sheet, not an alarm: typing works too.
  onError: m => { micNote.value = m; },
  onCancel: () => { capture.text = base; },
  onText: t => { spoken = true; capture.text = join(base, t); },
  onFinal: t => { capture.text = join(base, t).trim(); },
});
const listening = computed(() => dict.listening.value);
const box = ref(null);
// Edit while you talk: what you typed stays, and new words land after it.
function onEdit() {
  if (!listening.value) return;
  base = capture.text;
  dict.commit();
}
// A new accent applies straight away when listening.
watch(accent, () => { if (listening.value) { dict.stop(); setTimeout(talk, 250); } });
// Tidy up: the on-device AI rewrites it when ready, otherwise simple rules do.
const tidying = ref(false);
async function tidy() {
  if (!capture.text.trim() || tidying.value) return;
  if (listening.value) { dict.toggle(); await new Promise(r => setTimeout(r, 200)); }
  tidying.value = true;
  const was = capture.text;
  let next = null;
  if (ai.enabled && ai.ready) next = await aiRewriteDictation(was).catch(() => null);
  const byAI = !!next;
  next = next || tidyDictation(was);
  tidying.value = false;
  if (!next || next === was) { toast('It already reads well.', { kind: 'info' }); return; }
  capture.text = next;
  toast(byAI ? 'Rewritten by the on-device AI.' : 'Tidied up.', { kind: 'success', action: { label: 'Undo', run: () => { capture.text = was; } } });
}
const talk = () => { if (!listening.value) base = capture.text && !capture.text.endsWith('\n') ? `${capture.text}\n` : capture.text; dict.toggle(); };

// Open: start listening straight away when the browser can.
function openSheet({ voice = canDictate } = {}) {
  capture.open = true; spoken = false;
  nextTick(() => { if (voice && !listening.value) talk(); else box.value?.focus(); });
}
function close() { if (listening.value) dict.toggle(); capture.open = false; }
const rows = computed(() => routeAll(capture.text));
async function sortIt() {
  if (listening.value) { dict.toggle(); await new Promise(r => setTimeout(r, 200)); }
  if (!capture.text.trim()) return;
  await sortAndPlace(capture.text, { spoken: spoken && !capture.text.includes('\n') });
}
const onKey = e => {
  if (e.key === 'Escape' && capture.open) close();
  // "N" anywhere (not while typing) opens it.
  if (!capture.open && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); openSheet({ voice: false }); }
};
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
watch(() => capture.open, v => { if (!v && listening.value) dict.toggle(); });
defineExpose({ openSheet });
const EXAMPLES = ['Essay due Friday 5pm #English', 'Gym Mon Wed Fri 6pm', 'Call mom Sunday afternoon', 'I want to run a 10K by March'];
</script>

<template>
  <button type="button" class="cap-fab" :class="{ live: listening, busy: capture.sorting, open: capture.open, away: capture.at >= 0 }" :aria-label="listening ? 'Recording: open' : 'Add anything (N)'" title="Add anything (N)" data-test="capture" @click="capture.open ? sortIt() : openSheet()">
    <span class="cap-glyph"><Icon :name="listening ? 'pause' : 'capture'" :size="15" /></span>
    <span class="cap-word">{{ listening ? 'Listening' : 'Add' }}</span>
  </button>

  <Teleport to="body">
    <div v-if="capture.open" class="cap-scrim" @click.self="close">
      <section class="cap-sheet" role="dialog" aria-modal="true" aria-label="Add anything" data-test="capture-sheet">
        <header class="cap-head">
          <div>
            <h2>{{ listening ? 'Listening…' : 'Add anything' }}</h2>
            <p class="muted small">Say or type several things, and edit as you go. Budgie sorts them into tasks, routines and goals, then shows you each one to keep or change.</p>
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
          <button v-if="canDictate" type="button" class="cap-mic" :class="{ on: listening }" :aria-pressed="listening" data-test="capture-mic" @click="talk">
            <Icon :name="listening ? 'pause' : 'capture'" :size="16" />{{ listening ? 'Stop' : 'Speak' }}
          </button>
          <label v-if="canDictate" class="cap-accent" title="Pick your accent so Budgie hears you better">
            <span class="sr-only">Accent</span>
            <select v-model="accent" data-test="capture-accent" aria-label="Accent"><option v-for="[code, name] in ACCENTS" :key="code" :value="code">{{ name }}</option></select>
          </label>
          <button type="button" class="cap-tidy" :disabled="!capture.text.trim() || tidying" :title="ai.enabled && ai.ready ? 'Rewrite with the on-device AI' : 'Tidy up: one thing per line, no filler'" data-test="capture-tidy" @click="tidy"><Icon :name="tidying ? 'refresh' : 'sparkle'" :size="14" />{{ tidying ? 'Rewriting…' : 'Tidy up' }}</button>
          <span class="muted small cap-keys">Ctrl or ⌘ + Enter</span>
          <button type="button" class="btn primary" :disabled="!capture.text.trim() || capture.sorting" data-test="capture-sort" @click="sortIt">
            <Icon :name="capture.sorting ? 'refresh' : 'sparkle'" :size="15" />{{ capture.sorting ? 'Sorting…' : rows.length > 1 ? `Sort ${rows.length} things` : 'Sort it' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
