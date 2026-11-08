<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import Icon from './Icon.vue';

// Words Budgie should know: names, places, apps and course codes, spelled your
// way. Corrections you make to what Budgie heard are learned here too, which
// is how it gets used to your accent.
const draft = ref('');
const list = computed(() => store.vocab || []);
const taught = computed(() => list.value.filter(v => !v.heard));
const learned = computed(() => list.value.filter(v => v.heard));
function add() {
  const words = draft.value.split(/[,\n]/).map(w => w.trim()).filter(Boolean).slice(0, 50);
  if (!words.length) return;
  const have = new Set(list.value.filter(v => !v.heard).map(v => v.word.toLowerCase()));
  store.vocab = [...list.value, ...words.filter(w => !have.has(w.toLowerCase())).map(w => ({ word: w.slice(0, 40) }))].slice(-300);
  draft.value = '';
}
const remove = v => { store.vocab = list.value.filter(x => x !== v); };
</script>

<template>
  <section class="set-sec vc" data-test="vocab">
    <div class="set-sec-head"><h2>Words Budgie should know</h2><span class="muted small">{{ list.length }} words</span></div>
    <p class="small muted">Names, places, apps and course codes, spelled your way: Kigali, Notion, CHEM 110, Ms. Uwase. Budgie listens for them and writes them exactly like this.</p>
    <form class="vc-add" @submit.prevent="add">
      <input v-model="draft" class="field" placeholder="Add words, separated by commas" aria-label="Words to add" maxlength="600" data-test="vocab-input" />
      <button class="btn small primary" :disabled="!draft.trim()" data-test="vocab-add"><Icon name="plus" :size="14" />Add</button>
    </form>
    <ul v-if="taught.length" class="vc-list">
      <li v-for="v in taught" :key="`t-${v.word}`"><span>{{ v.word }}</span><button type="button" :aria-label="`Remove ${v.word}`" title="Remove" @click="remove(v)"><Icon name="x" :size="12" /></button></li>
    </ul>
    <template v-if="learned.length">
      <p class="small vc-kicker">Learned from your corrections</p>
      <ul class="vc-list learned" data-test="vocab-learned">
        <li v-for="v in learned" :key="`l-${v.heard}`"><span><s>{{ v.heard }}</s> → {{ v.word }}</span><button type="button" :aria-label="`Forget ${v.heard}`" title="Forget" @click="remove(v)"><Icon name="x" :size="12" /></button></li>
      </ul>
    </template>
  </section>
</template>
