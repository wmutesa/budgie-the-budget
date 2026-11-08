<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// An emoji button for title fields: pick one and it goes where the cursor
// was in the title (or at the end). Typing emojis from the keyboard works too.
const props = defineProps({ modelValue: { type: String, default: '' }, input: { type: Object, default: null } });
const emit = defineEmits(['update:modelValue']);
const open = ref(false);
const root = ref(null);
const EMOJIS = ['📚', '📝', '✏️', '📖', '🧪', '🔬', '🧮', '💻', '🎓', '📅', '⏰', '📌', '✅', '⭐', '🔥', '❗', '💡', '🧠', '🎯', '🏆', '🏋️', '🏃', '🧘', '⚽', '🎵', '🎨', '🍽️', '☕', '🛒', '💰', '🏠', '🧹', '🚗', '✈️', '📞', '📧', '❤️', '🎉', '🎂', '😊'];
let caret = null;
function toggle() {
  const el = props.input; // the title's <input> element
  caret = el && typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd] : null;
  open.value = !open.value;
}
function pick(e) {
  const v = props.modelValue || '';
  const [a, b] = caret || [v.length, v.length];
  const before = v.slice(0, a), after = v.slice(b);
  const pad = before && !/\s$/.test(before) ? ' ' : '';
  emit('update:modelValue', `${before}${pad}${e}${after && !/^\s/.test(after) ? ' ' : ''}${after}`);
  open.value = false;
}
const outside = e => { if (open.value && root.value && !root.value.contains(e.target)) open.value = false; };
const esc = e => { if (e.key === 'Escape' && open.value) { e.stopPropagation(); open.value = false; } };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc, true); });
onUnmounted(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc, true); });
</script>

<template>
  <span ref="root" class="emo">
    <button type="button" class="emo-btn" :aria-expanded="open" aria-label="Add an emoji" title="Add an emoji" data-test="emoji-btn" @mousedown.prevent @click="toggle">😊</button>
    <div v-if="open" class="emo-pop" role="listbox" aria-label="Emojis">
      <button v-for="e in EMOJIS" :key="e" type="button" role="option" :aria-label="e" data-test="emoji-option" @mousedown.prevent @click="pick(e)">{{ e }}</button>
    </div>
  </span>
</template>
