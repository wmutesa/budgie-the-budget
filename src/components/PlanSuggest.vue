<script setup>
import { ref } from 'vue';
import { store } from '../lib/store';
import { suggestions, plannerFacts } from '../lib/suggest';
import { makeTask, today } from '../lib/tasks';
import { ai, aiSuggestTasks } from '../lib/ai';
import Icon from './Icon.vue';

// Ideas Budgie spots from your planner, money and goals. One tap to add.
const extra = ref([]);
const asking = ref(false);
const note = ref('');
function accept(s) {
  if (s.run) s.run();
  if (s.task) store.tasks.unshift(makeTask({ ...s.task, source: 'suggestion' }));
  store.dismissed.push(s.id);
}
const dismiss = s => store.dismissed.push(s.id);
async function askAI() {
  asking.value = true; note.value = '';
  const list = await aiSuggestTasks(plannerFacts()).catch(() => null);
  if (list?.length) extra.value = list.map((x, i) => ({ ...x, id: `ai-${Date.now()}-${i}` }));
  else note.value = ai.ready ? 'The AI had no new ideas this time.' : 'The AI is still starting on this device. Try again in a minute.';
  asking.value = false;
}
const acceptAI = x => { store.tasks.unshift(makeTask({ title: x.title, notes: x.why, date: today(), source: 'ai' })); extra.value = extra.value.filter(y => y !== x); };
</script>

<template>
  <section class="pln-card" id="suggestions" data-test="suggestions">
    <div class="pln-card-head"><h3>Suggested for you</h3><button v-if="ai.enabled" type="button" class="ibtn ai" :disabled="asking" title="Ask the on-device AI for more ideas" data-test="ask-ai" @click="askAI"><Icon name="sparkle" :size="14" />{{ asking ? 'Thinking…' : 'More ideas' }}</button></div>
    <ul v-if="suggestions.length || extra.length" class="pln-ideas">
      <li v-for="s in suggestions" :key="s.id" :class="s.tone" data-test="suggestion">
        <div><b>{{ s.title }}</b><span class="muted small">{{ s.why }}</span></div>
        <div class="pln-idea-acts"><button type="button" class="ibtn primary" :title="s.run ? 'Do it' : 'Add to planner'" :aria-label="s.run ? `Do it: ${s.title}` : `Add: ${s.title}`" data-test="suggestion-add" @click="accept(s)"><Icon :name="s.run ? 'check' : 'plus'" /></button><button type="button" class="ibtn ghost" title="Not now" :aria-label="`Not now: ${s.title}`" @click="dismiss(s)"><Icon name="x" /></button></div>
      </li>
      <li v-for="x in extra" :key="x.id" class="ai">
        <div><b><span class="pln-ai-tag">AI</span> {{ x.title }}</b><span class="muted small">{{ x.why }}</span></div>
        <div class="pln-idea-acts"><button type="button" class="ibtn primary" title="Add to planner" :aria-label="`Add: ${x.title}`" @click="acceptAI(x)"><Icon name="plus" /></button><button type="button" class="ibtn ghost" title="Not now" :aria-label="`Not now: ${x.title}`" @click="extra = extra.filter(y => y !== x)"><Icon name="x" /></button></div>
      </li>
    </ul>
    <p v-else class="empty-note">No ideas right now. Add deadlines, a routine or a calendar, and Budgie will spot what to prepare for.</p>
    <p v-if="note" class="muted small">{{ note }}</p>
  </section>
</template>
