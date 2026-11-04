<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

// A custom dropdown: a button that opens a small searchable list.
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true }, // [{ value, label, hint?, color? }]
  label: { type: String, default: 'Choose' },
  searchable: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const q = ref('');
const root = ref(null);
const list = ref(null);
const active = ref(0);
const current = computed(() => props.options.find(o => o.value === props.modelValue));
const shown = computed(() => props.options.filter(o => !q.value || o.label.toLowerCase().includes(q.value.toLowerCase())));

async function toggle() {
  open.value = !open.value;
  q.value = '';
  active.value = Math.max(0, shown.value.findIndex(o => o.value === props.modelValue));
  if (open.value) { await nextTick(); list.value?.focus(); }
}
function choose(o) { emit('update:modelValue', o.value); open.value = false; }
function onKey(e) {
  if (e.key === 'Escape') { open.value = false; return; }
  if (e.key === 'ArrowDown') { active.value = Math.min(shown.value.length - 1, active.value + 1); e.preventDefault(); }
  if (e.key === 'ArrowUp') { active.value = Math.max(0, active.value - 1); e.preventDefault(); }
  if (e.key === 'Enter' && shown.value[active.value]) { choose(shown.value[active.value]); e.preventDefault(); }
}
const outside = e => { if (root.value && !root.value.contains(e.target)) open.value = false; };
onMounted(() => document.addEventListener('mousedown', outside));
onUnmounted(() => document.removeEventListener('mousedown', outside));
</script>

<template>
  <div ref="root" class="pick" :class="{ open }">
    <button type="button" class="pick-btn" :aria-label="label" :aria-expanded="open" @click="toggle">
      <i v-if="current?.color" class="pick-dot" :style="{ background: current.color }" />
      <span class="pick-val">{{ current ? current.label : label }}</span>
      <span class="pick-caret" aria-hidden="true">⌄</span>
    </button>
    <div v-if="open" ref="list" class="pick-pop" tabindex="-1" role="listbox" @keydown="onKey">
      <input v-if="searchable" v-model="q" class="pick-search" placeholder="Filter" @keydown="onKey" />
      <button
        v-for="(o, i) in shown"
        :key="o.value"
        type="button"
        role="option"
        class="pick-opt"
        :class="{ on: o.value === modelValue, hot: i === active }"
        :aria-selected="o.value === modelValue"
        @click="choose(o)"
        @mouseenter="active = i"
      >
        <i v-if="o.color" class="pick-dot" :style="{ background: o.color }" />
        <span>{{ o.label }}</span>
        <span v-if="o.hint" class="muted small">{{ o.hint }}</span>
      </button>
    </div>
  </div>
</template>
