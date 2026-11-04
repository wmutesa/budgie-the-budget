<script setup>
import { ref, watch, onMounted } from 'vue';
import { cards, facts } from '../lib/advice';
import { ai, aiAdvise } from '../lib/ai';
import { store } from '../lib/store';

// What Budgie thinks: a short read from the local model when available, plus action cards from your data.
const read = ref('');
const reading = ref(false);
let key = '';
async function refresh() {
  const next = facts.value.join('|');
  if (next === key) return;
  key = next;
  reading.value = true;
  read.value = (await aiAdvise(facts.value)) || '';
  reading.value = false;
}
onMounted(refresh);
watch([facts, () => ai.status], () => { key = ''; refresh(); });
const dismiss = id => store.dismissed.push(id);
const apply = c => { c.action.run(); store.dismissed.push(c.id); };
</script>

<template>
  <section class="card cell insights">
    <div class="cell-head">
      <p class="label">What Budgie thinks</p>
      <span class="muted small">{{ ai.label }} · updates as you add spending</span>
    </div>
    <p class="think">
      <template v-if="read">{{ read }}</template>
      <template v-else-if="reading">Reading your month…</template>
      <template v-else>{{ facts.slice(0, 2).join(' ') }}</template>
    </p>
    <div class="insight-grid">
      <article v-for="c in cards" :key="c.id" class="insight" :class="c.tone">
        <b>{{ c.title }}</b>
        <p>{{ c.body }}</p>
        <div class="insight-acts">
          <button v-if="c.action" class="btn primary small" @click="apply(c)">{{ c.action.label }}</button>
          <button class="btn small" @click="dismiss(c.id)">Dismiss</button>
        </div>
      </article>
      <p v-if="!cards.length" class="muted">Nothing to act on right now.</p>
    </div>
  </section>
</template>
