<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { suggestions, plannerFacts } from '../lib/suggest';
import { makeTask, today } from '../lib/tasks';
import { ai, aiSuggestTasks } from '../lib/ai';
import Icon from './Icon.vue';
import { toast } from '../lib/toast';
import { planGoal } from '../lib/goals';

// Ideas Budgie spots from your planner and goals. One tap to add.
const extra = ref([]);
const asking = ref(false);
const note = ref('');
function accept(s) {
  if (s.run) s.run();
  if (s.goal) planGoal(s.goal);
  if (s.task) store.tasks.unshift(makeTask({ ...s.task, source: 'suggestion' }));
  store.dismissed.push(s.id);
  toast(s.goal ? `Milestones planned for “${s.goal.title}”.` : s.run ? 'Done.' : 'Added to your schedule.', { kind: 'success' });
}
const dismiss = s => store.dismissed.push(s.id);
async function askAI() {
  asking.value = true; note.value = '';
  const list = await aiSuggestTasks(plannerFacts()).catch(() => null);
  if (list?.length) extra.value = list.map((x, i) => ({ ...x, id: `ai-${Date.now()}-${i}` }));
  else toast(ai.ready ? 'The AI had no new ideas this time.' : 'The AI is still starting on this device. Try again in a minute.', { kind: 'info' });
  asking.value = false;
}
// A few at a time, no repeats.
const allIdeas = ref(false);
const unique = computed(() => { const seen = new Set(); return suggestions.value.filter(x => { const k = x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); });
const shownIdeas = computed(() => (allIdeas.value ? unique.value : unique.value.slice(0, 3)));
const acceptAI = x => { store.tasks.unshift(makeTask({ title: x.title, notes: x.why, date: today(), source: 'ai' })); extra.value = extra.value.filter(y => y !== x); };
</script>

<template>
  <section class="pln-card" id="suggestions" data-test="suggestions">
    <div class="pln-card-head"><h3>Suggested for you</h3><button v-if="ai.enabled" type="button" class="ibtn ai" :disabled="asking" title="Ask the on-device AI for more ideas" data-test="ask-ai" @click="askAI"><Icon name="sparkle" :size="14" />{{ asking ? 'Thinking…' : 'More ideas' }}</button></div>
    <ul v-if="suggestions.length || extra.length" class="pln-ideas">
      <li v-for="s in shownIdeas" :key="s.id" :class="s.tone" data-test="suggestion">
        <div><b>{{ s.title }}</b><span class="muted small">{{ s.why }}</span></div>
        <div class="pln-idea-acts"><button type="button" class="ibtn primary" :title="s.run ? 'Do it' : 'Add to planner'" :aria-label="s.run ? `Do it: ${s.title}` : `Add: ${s.title}`" data-test="suggestion-add" @click="accept(s)"><Icon name="check" /></button><button type="button" class="ibtn ghost" title="Not now" :aria-label="`Not now: ${s.title}`" @click="dismiss(s)"><Icon name="x" /></button></div>
      </li>
      <li v-for="x in extra" :key="x.id" class="ai">
        <div><b><span class="pln-ai-tag">AI</span> {{ x.title }}</b><span class="muted small">{{ x.why }}</span></div>
        <div class="pln-idea-acts"><button type="button" class="ibtn primary" title="Add to planner" :aria-label="`Add: ${x.title}`" @click="acceptAI(x)"><Icon name="check" /></button><button type="button" class="ibtn ghost" title="Not now" :aria-label="`Not now: ${x.title}`" @click="extra = extra.filter(y => y !== x)"><Icon name="x" /></button></div>
      </li>
    </ul>
    <button v-if="unique.length > 3" type="button" class="pln-more" @click="allIdeas = !allIdeas">{{ allIdeas ? 'Show fewer' : `Show all ${unique.length}` }}</button>
    <p v-else-if="!suggestions.length && !extra.length" class="empty-note">No ideas right now. Add deadlines, a routine or a calendar, and Budgie will spot what to prepare for.</p>
    <p v-if="note" class="muted small">{{ note }}</p>
  </section>
</template>
