<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { cleanLink } from '../lib/tasks';
import Icon from './Icon.vue';

// A link on a task or a step: the icon opens a small card to paste, open or
// remove it. The title itself then opens the link, looking just the same.
const props = defineProps({ modelValue: { type: String, default: '' }, label: { type: String, default: '' }, small: { type: Boolean, default: false } });
const emit = defineEmits(['update:modelValue']);
const open = ref(false);
const btn = ref(null);
const pop = ref(null);
const draft = ref('');
const bad = ref(false);
const pos = ref({});
async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  draft.value = props.modelValue; bad.value = false;
  await nextTick();
  const r = btn.value.getBoundingClientRect();
  const w = 300;
  pos.value = { left: `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`, top: `${r.bottom + 6 + 120 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - 126)}px` };
  pop.value?.querySelector('input')?.focus();
}
function save() {
  if (!draft.value.trim()) { emit('update:modelValue', ''); open.value = false; return; }
  const u = cleanLink(draft.value);
  if (!u) { bad.value = true; return; }
  emit('update:modelValue', u); open.value = false;
}
const remove = () => { emit('update:modelValue', ''); open.value = false; };
const outside = e => { if (open.value && !pop.value?.contains(e.target) && !btn.value?.contains(e.target)) open.value = false; };
const esc = e => { if (e.key === 'Escape' && open.value) { open.value = false; e.stopPropagation(); } };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc, true); });
onUnmounted(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc, true); });
</script>

<template>
  <button ref="btn" type="button" class="sch-icon lf-btn" :class="{ on: modelValue, small }" :aria-label="`${modelValue ? 'Edit the link' : 'Add a link'}${label ? ` for ${label}` : ''}`" :title="modelValue ? modelValue : 'Add a link'" data-test="row-link" @click.stop.prevent="toggle"><Icon name="link" :size="small ? 13 : 15" /></button>
  <Teleport to="body">
    <form v-if="open" ref="pop" class="pk-pop lf" :style="pos" role="dialog" aria-label="Link" data-test="link-pop" novalidate @submit.prevent="save">
      <label class="lf-row"><Icon name="link" :size="14" /><input v-model="draft" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Paste a link (docs, Canvas, Zoom…)" aria-label="Link" data-test="link-input" @input="bad = false" /></label>
      <p v-if="bad" class="lf-bad">That does not look like a web address.</p>
      <div class="lf-foot">
        <a v-if="modelValue" class="lf-open" :href="modelValue" target="_blank" rel="noopener noreferrer"><Icon name="external" :size="13" />Open</a>
        <button v-if="modelValue" type="button" class="lf-remove" data-test="link-remove" @click="remove">Remove</button>
        <button type="submit" class="lf-save" data-test="link-save">Save</button>
      </div>
    </form>
  </Teleport>
</template>
