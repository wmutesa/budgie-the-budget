<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { store } from '../lib/store';
import { nav } from '../lib/nav';
import { search, actionsFor, HINTS } from '../lib/search';
import Icon from './Icon.vue';

// The search in the top bar: finds anything in Budgie and turns what you
// type into an action. Press / to jump here; arrows and Enter to choose.
const q = ref('');
const open = ref(false);
const at = ref(0);
const root = ref(null);
const input = ref(null);
const actions = computed(() => actionsFor(q.value, nav.page));
const groups = computed(() => search(q.value, nav.page));
const flat = computed(() => [...actions.value, ...groups.value.flatMap(g => g.items)]);
watch(q, v => { at.value = 0; open.value = Boolean(v.trim()); });
watch(() => nav.page, () => { open.value = false; });
async function choose(item) {
  if (!item) return;
  open.value = false;
  q.value = '';
  await item.run();
}
function onKey(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); at.value = Math.min(flat.value.length - 1, at.value + 1); open.value = true; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); at.value = Math.max(0, at.value - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); choose(flat.value[at.value]); }
  else if (e.key === 'Escape') { open.value = false; input.value?.blur(); }
}
const idx = item => flat.value.indexOf(item);
const outside = e => { if (root.value && !root.value.contains(e.target)) open.value = false; };
const slash = e => { if (e.key === '/' && !e.target.closest?.('input, textarea, select, [contenteditable]')) { e.preventDefault(); input.value?.focus(); } };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', slash); });
onUnmounted(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', slash); });
</script>

<template>
  <div ref="root" class="nb-search gs">
    <Icon name="search" :size="15" class="gs-ico" />
    <input ref="input" v-model="q" type="search" :placeholder="HINTS[nav.page] || 'Search Budgie'" :aria-label="HINTS[nav.page] || 'Search Budgie'" role="combobox" :aria-expanded="open" aria-controls="gs-list" autocomplete="off" data-test="search" @keydown="onKey" @focus="open = Boolean(q.trim())" />
    <kbd class="gs-kbd" aria-hidden="true">/</kbd>
    <div v-if="open && flat.length" id="gs-list" class="gs-pop" role="listbox" data-test="search-pop">
      <template v-if="actions.length">
        <p class="gs-group">Do</p>
        <button v-for="a in actions" :key="a.id" type="button" role="option" class="gs-item act" :class="{ on: idx(a) === at }" :aria-selected="idx(a) === at" :data-test="a.id" @mousemove="at = idx(a)" @click="choose(a)">
          <span class="gs-i"><Icon :name="a.icon" :size="15" /></span><span class="gs-t"><b>{{ a.title }}</b><small>{{ a.sub }}</small></span><kbd v-if="idx(a) === at">↵</kbd>
        </button>
      </template>
      <template v-for="g in groups" :key="g.name">
        <p class="gs-group">{{ g.name }}</p>
        <button v-for="r in g.items" :key="r.id" type="button" role="option" class="gs-item" :class="{ on: idx(r) === at }" :aria-selected="idx(r) === at" data-test="search-result" @mousemove="at = idx(r)" @click="choose(r)">
          <span class="gs-i" :style="r.color ? { color: r.color } : null"><Icon :name="r.icon" :size="15" /></span><span class="gs-t"><b>{{ r.title }}</b><small>{{ r.sub }}</small></span><kbd v-if="idx(r) === at">↵</kbd>
        </button>
      </template>
    </div>
  </div>
</template>
