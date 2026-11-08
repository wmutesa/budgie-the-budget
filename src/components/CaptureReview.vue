<script setup>
import EmojiPick from './EmojiPick.vue';
import { ref as emoRef } from 'vue';
const titleIn = emoRef(null);
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { capture, current, itemOf, placeOf, keep, drop, keepAll, later, switchTo, DESTS } from '../lib/capture';
import Icon from './Icon.vue';

// Review what Taskie sorted, one item at a time, highlighted where it now
// lives: keep it, switch what it is, rename it or drop it.
const x = computed(() => current());
const item = computed(() => (x.value ? itemOf(x.value) : null));
const place = computed(() => (x.value ? placeOf(x.value) : { where: '' }));
const rect = ref(null);
const card = ref(null);
const pos = ref({});
let tries = 0;
async function locate() {
  rect.value = null;
  if (!x.value) return;
  await nextTick();
  const el = place.value.target && document.querySelector(place.value.target);
  if (!el) { if (tries++ < 20) setTimeout(locate, 80); return; }
  tries = 0;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setTimeout(measure, 340);
}
function measure() {
  const el = x.value && place.value.target && document.querySelector(place.value.target);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pad = 6;
  rect.value = { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
  const vw = window.innerWidth; const vh = window.innerHeight;
  // Phones: the card sits at the bottom. Wider: beside or under the highlight.
  if (vw < 640) { pos.value = { left: '8px', right: '8px', bottom: '8px', top: 'auto' }; return; }
  const cw = 360; const ch = card.value?.offsetHeight || 260;
  let left = r.right + 16; let top = Math.max(16, Math.min(r.top, vh - ch - 16));
  if (left + cw > vw - 16) { left = Math.min(Math.max(16, r.left), vw - cw - 16); top = r.bottom + 14; if (top + ch > vh - 16) top = Math.max(16, r.top - ch - 14); }
  pos.value = { left: `${left}px`, top: `${top}px`, width: `${cw}px` };
}
watch(() => [capture.at, x.value?.id], () => { tries = 0; locate(); });
const onKey = e => {
  if (!x.value || e.target.closest('input, textarea')) return;
  if (e.key === 'Enter') { e.preventDefault(); keep(); } else if (e.key === 'Backspace' || e.key === 'Delete') drop(); else if (e.key === 'Escape') later();
};
onMounted(() => { locate(); window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true); window.addEventListener('keydown', onKey); });
onUnmounted(() => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); window.removeEventListener('keydown', onKey); });
</script>

<template>
  <div v-if="x && item" class="cr" role="dialog" aria-label="Review what Taskie added" data-test="capture-review">
    <div v-if="rect" class="cr-hole" :style="{ top: rect.top + 'px', left: rect.left + 'px', width: rect.width + 'px', height: rect.height + 'px' }" />
    <div v-else class="cr-dim" />
    <div ref="card" class="cr-card" :style="pos">
      <div class="cr-top">
        <span class="cr-count">Review {{ capture.at + 1 }} of {{ capture.review.length }}</span>
        <button type="button" class="cr-link" data-test="review-later" @click="later">Later</button>
      </div>
      <div class="emo-row">
        <input ref="titleIn" v-model="item.title" class="cr-title" aria-label="Name" maxlength="160" :data-test="x.to === 'goal' ? undefined : 'review-title'" />
        <EmojiPick v-model="item.title" :input="titleIn" />
      </div>
      <p class="cr-where"><Icon :name="x.to === 'goal' ? 'target' : x.to === 'routine' ? 'repeat' : 'calendar'" :size="14" />{{ place.where }}</p>
      <div class="cr-dests" role="radiogroup" aria-label="What is it">
        <button v-for="(d, id) in DESTS" :key="id" type="button" role="radio" :aria-checked="x.to === id" :class="[`to-${id}`, { on: x.to === id }]" :data-test="`review-${id}`" @click="switchTo(id)"><Icon :name="d.icon" :size="13" />{{ d.label }}</button>
      </div>
      <div class="cr-acts">
        <button type="button" class="btn small" data-test="review-drop" @click="drop"><Icon name="trash" :size="14" />Remove</button>
        <button type="button" class="btn primary small" data-test="review-keep" @click="keep"><Icon name="check" :size="14" />Keep</button>
      </div>
      <div class="cr-foot">
        <span class="cr-dots" aria-hidden="true"><i v-for="(r, n) in capture.review" :key="r.id" :class="{ on: n === capture.at }" /></span>
        <button v-if="capture.review.length > 1" type="button" class="cr-link" data-test="review-keep-all" @click="keepAll">Keep all {{ capture.review.length }}</button>
      </div>
    </div>
  </div>
</template>
