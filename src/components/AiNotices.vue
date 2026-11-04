<script setup>
import { ref, computed, onMounted } from 'vue';
import { cards } from '../lib/advice';
import { store } from '../lib/store';

// Budgie's suggestions as small notifications in the corner, one at a time,
// each with its action. Dismissed ones do not come back.
const props = defineProps({ paused: { type: Boolean, default: false } });
const shown = ref(false);
const i = ref(0);
const list = computed(() => cards.value.filter(c => c.tone !== 'good' || c.action));
const card = computed(() => list.value[Math.min(i.value, list.value.length - 1)]);
onMounted(() => setTimeout(() => { shown.value = true; }, 1500));

const dismiss = c => { store.dismissed.push(c.id); i.value = 0; };
const run = c => { c.action.run(); store.dismissed.push(c.id); i.value = 0; };
const next = () => { i.value = (i.value + 1) % list.value.length; };
const hideAll = () => { list.value.forEach(c => store.dismissed.push(c.id)); };
</script>

<template>
  <transition name="notice">
    <aside v-if="shown && !props.paused && card" class="notice" :class="card.tone" role="status" aria-live="polite" data-test="notice">
      <div class="notice-top">
        <span class="notice-tag"><span aria-hidden="true">✦</span> Budgie</span>
        <span v-if="list.length > 1" class="muted small">{{ Math.min(i, list.length - 1) + 1 }} of {{ list.length }}</span>
        <button class="icon-x" type="button" aria-label="Dismiss" data-test="notice-dismiss" @click="dismiss(card)">×</button>
      </div>
      <b>{{ card.title }}</b>
      <p>{{ card.body }}</p>
      <div class="notice-acts">
        <button v-if="card.action" class="btn primary small" type="button" data-test="notice-action" @click="run(card)">{{ card.action.label }}</button>
        <button v-if="list.length > 1" class="btn small" type="button" @click="next">Next</button>
        <button class="notice-link" type="button" @click="hideAll">Hide all</button>
      </div>
    </aside>
  </transition>
</template>
