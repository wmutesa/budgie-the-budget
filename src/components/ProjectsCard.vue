<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { GOAL_COLORS } from '../lib/goals';
import Icon from './Icon.vue';

// Projects and categories: the #tags on your tasks. Rename one and every task
// follows; give each a colour.
const projects = computed(() => {
  const m = new Map();
  for (const t of store.tasks) if (t.project) { const x = m.get(t.project) || { name: t.project, open: 0, done: 0 }; t.done ? x.done++ : x.open++; m.set(t.project, x); }
  return [...m.values()].sort((a, b) => b.open - a.open);
});
const colorOf = n => store.projects[n]?.color || '#a1a1aa';
const setColor = (n, c) => { store.projects = { ...store.projects, [n]: { ...(store.projects[n] || {}), color: c } }; };
const editing = ref('');
const draft = ref('');
function rename(from) {
  const to = draft.value.trim().slice(0, 40);
  editing.value = '';
  if (!to || to === from) return;
  store.tasks.forEach(t => { if (t.project === from) t.project = to; });
  if (store.projects[from]) { store.projects = { ...store.projects, [to]: store.projects[from] }; delete store.projects[from]; }
}
</script>

<template>
  <section class="card cell span-4" id="projects" data-test="projects">
    <div class="cell-head"><p class="label">Projects</p><span class="muted small">{{ projects.length }}</span></div>
    <ul v-if="projects.length" class="pj-list">
      <li v-for="p in projects" :key="p.name">
        <span class="pj-swatches" role="group" :aria-label="`Colour for ${p.name}`">
          <button v-for="c in GOAL_COLORS" :key="c" type="button" class="pj-sw" :class="{ on: colorOf(p.name) === c }" :style="{ background: c }" :aria-label="c" :aria-pressed="colorOf(p.name) === c" @click="setColor(p.name, c)" />
        </span>
        <form v-if="editing === p.name" class="pj-rename" @submit.prevent="rename(p.name)"><input v-model="draft" :aria-label="`New name for ${p.name}`" maxlength="40" @blur="rename(p.name)" /></form>
        <button v-else type="button" class="pj-name" title="Rename" @click="editing = p.name; draft = p.name"><i :style="{ background: colorOf(p.name) }" />#{{ p.name }}<Icon name="edit" :size="12" /></button>
        <span class="muted small">{{ p.open }} open</span>
      </li>
    </ul>
    <p v-else class="empty-note">Add #project to any task, like “essay due Fri #English”, and it shows up here.</p>
  </section>
</template>
