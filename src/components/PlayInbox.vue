<script setup>
import { ref, computed, watch } from 'vue';
import { DESTS, routeAll, preview, sendAll, undoSend } from '../lib/router';
import { go } from '../lib/nav';
import { useDictation, canDictate } from '../lib/dictation';
import MicButton from './MicButton.vue';
import Icon from './Icon.vue';

// Write or say anything, one thing per line. Budgie works out whether each line
// is a task, a routine or a goal, and sends it there. Tap to change any choice.
const text = ref('');
const rows = ref([]);
const done = ref(null);
let timer = null;
watch(text, v => { clearTimeout(timer); timer = setTimeout(() => { rows.value = routeAll(v); }, 250); });
async function send() {
  if (!rows.value.length) return;
  done.value = await sendAll(rows.value);
  text.value = ''; rows.value = [];
}
const undo = () => { undoSend(done.value); done.value = null; };
let base = '';
const dict = useDictation({
  continuous: true,
  onCancel: () => { text.value = base; },
  onText: t => { text.value = `${base}${t}`; },
  onFinal: () => { text.value = `${text.value.trim()}\n`; },
});
const talk = () => { if (!dict.listening.value) base = text.value && !text.value.endsWith('\n') ? `${text.value}\n` : text.value; dict.toggle(); };
const EXAMPLE = 'Essay due Fri 5pm #English\ngym MWF 6pm\ncall mom every Sunday 5pm\nI want to land a summer internship by March\nread 12 books this year\ndentist tomorrow at 3';
const counts = computed(() => Object.fromEntries(Object.keys(DESTS).map(d => [d, rows.value.filter(r => r.dest === d).length])));
</script>

<template>
  <section class="card cell span-12 inbox" id="inbox" data-test="inbox">
    <div class="inbox-head">
      <div>
        <p class="label">Add anything</p>
        <h2 class="inbox-title">Write or say it. Budgie sorts tasks, routines and goals.</h2>
      </div>
      <div class="inbox-legend" aria-hidden="true">
        <span v-for="(d, id) in DESTS" :key="id" :class="`to-${id}`"><Icon :name="d.icon" :size="13" />{{ d.label }}<b v-if="counts[id]">{{ counts[id] }}</b></span>
      </div>
    </div>
    <div class="inbox-pad" :class="{ live: dict.listening.value }">
      <textarea v-model="text" rows="3" placeholder="One thing per line: “Essay due Fri 5pm”, “gym MWF 6pm”, “I want to run a 10K by March”" aria-label="Add anything" data-test="inbox-text" @keydown.meta.enter.prevent="send" @keydown.ctrl.enter.prevent="send" />
      <div class="inbox-tools">
        <button v-if="!text" type="button" class="btn small" @click="text = EXAMPLE"><Icon name="sparkle" :size="14" />Example</button>
        <MicButton v-if="canDictate" :listening="dict.listening.value" label="Say it" @toggle="talk" />
      </div>
    </div>
    <ul v-if="rows.length" class="inbox-rows" data-test="inbox-rows">
      <li v-for="r in rows" :key="r.id" class="inbox-row">
        <div class="inbox-line"><b>{{ r.text }}</b><span class="muted small">{{ r.why }}</span></div>
        <div class="inbox-dests" role="radiogroup" :aria-label="`What is this: ${r.text}`">
          <button v-for="(d, id) in DESTS" :key="id" type="button" role="radio" class="inbox-dest" :class="[`to-${id}`, { on: r.dest === id }]" :aria-checked="r.dest === id" :title="preview(r, id)" :data-test="`dest-${id}`" @click="r.dest = id">
            <Icon :name="d.icon" :size="13" /><span>{{ d.label }}</span>
          </button>
        </div>
        <p class="inbox-preview small"><span :class="`to-${r.dest}`"><Icon :name="DESTS[r.dest].icon" :size="12" />{{ preview(r, r.dest) }}</span></p>
      </li>
    </ul>
    <div class="inbox-foot">
      <p v-if="done" class="pln-ok small" role="status" data-test="inbox-done">
        Added {{ done.task }} {{ done.task === 1 ? 'task' : 'tasks' }}, {{ done.routine }} {{ done.routine === 1 ? 'routine' : 'routines' }} and {{ done.goal }} {{ done.goal === 1 ? 'goal' : 'goals' }}.
        <button type="button" class="link-btn" @click="go('Planner')">Open Planner</button>
        <button type="button" class="link-btn" data-test="inbox-undo" @click="undo">Undo</button>
      </p>
      <p v-else class="muted small">Dates, times, repeats (“every Mon”, “3x a week”), #projects and ! for priority are picked up for you. Ctrl or ⌘ + Enter sends.</p>
      <button type="button" class="ibtn primary" :disabled="!rows.length" data-test="inbox-send" @click="send"><Icon name="right" :size="15" />Add {{ rows.length || '' }}</button>
    </div>
  </section>
</template>
