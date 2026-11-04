<script setup>
import { ref, computed } from 'vue';
import { store, newId } from '../lib/store';
import { GOAL_COLORS } from '../data/defaults';

// Savings goals you set: the first one gets the gauge.
const pct = g => Math.min(100, g.target ? (g.saved / g.target) * 100 : 0);
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const main = computed(() => store.goals[0]);
const adding = ref(false);
const draft = ref({ name: '', target: '', saved: '' });
const editing = ref(null);
const editValue = ref('');

function add() {
  const name = draft.value.name.trim();
  const target = Number(draft.value.target);
  if (!name || !(target > 0)) return;
  store.goals.push({ id: newId(), name: name.slice(0, 40), target, saved: Math.max(0, Number(draft.value.saved) || 0), color: GOAL_COLORS[store.goals.length % GOAL_COLORS.length] });
  draft.value = { name: '', target: '', saved: '' };
  adding.value = false;
}
function startEdit(g) { editing.value = g.id; editValue.value = String(g.saved); }
function saveEdit(g) { const v = Number(editValue.value); if (Number.isFinite(v) && v >= 0) g.saved = v; editing.value = null; }
function remove(g) { if (confirm(`Remove the goal "${g.name}"?`)) store.goals = store.goals.filter(x => x.id !== g.id); }
</script>

<template>
  <section class="card cell goal-card" data-test="goals">
    <div class="cell-head"><p class="label">Savings goals</p><span class="tag-light">{{ store.goals.length }} {{ store.goals.length === 1 ? 'goal' : 'goals' }}</span></div>

    <div v-if="main" class="gauge-wrap">
      <svg viewBox="0 0 220 124" class="gauge" aria-hidden="true">
        <path d="M20 112 A90 90 0 0 1 200 112" class="g-track" />
        <path d="M20 112 A90 90 0 0 1 200 112" class="g-fill" pathLength="100" :stroke-dasharray="`${pct(main).toFixed(1)} 100`" />
      </svg>
      <div class="gauge-val"><b>{{ fmt(main.saved) }}</b><span>{{ main.name }} · {{ fmt(main.target) }} target</span></div>
    </div>
    <p v-else-if="!adding" class="empty-note">Set a goal, such as an emergency fund or a trip, and track how much you have put aside.</p>

    <ul v-if="store.goals.length" class="goal-lines">
      <li v-for="g in store.goals" :key="g.id">
        <div class="row-line">
          <span>{{ g.name }}</span>
          <form v-if="editing === g.id" class="goal-edit" @submit.prevent="saveEdit(g)">
            <input v-model="editValue" class="field" type="number" min="0" step="1" :aria-label="`Amount saved for ${g.name}`" autofocus @blur="saveEdit(g)" />
          </form>
          <button v-else class="goal-amt" type="button" :title="`Update how much is saved for ${g.name}`" @click="startEdit(g)">{{ fmt(g.saved) }} · {{ Math.round(pct(g)) }}%</button>
          <button class="icon-x" type="button" :aria-label="`Remove ${g.name}`" @click="remove(g)">×</button>
        </div>
        <div class="thin"><i :style="{ width: pct(g) + '%' }" /></div>
      </li>
    </ul>

    <form v-if="adding" class="goal-form" @submit.prevent="add">
      <input v-model="draft.name" class="field" placeholder="Goal, e.g. Emergency fund" aria-label="Goal name" maxlength="40" required />
      <input v-model="draft.target" class="field" type="number" min="1" step="1" placeholder="Target in USD" aria-label="Target" required />
      <input v-model="draft.saved" class="field" type="number" min="0" step="1" placeholder="Saved so far" aria-label="Saved so far" />
      <div class="acc-form-acts">
        <button class="btn primary small" type="submit">Add goal</button>
        <button class="btn small" type="button" @click="adding = false">Cancel</button>
      </div>
    </form>
    <button v-else class="btn small acc-add" type="button" data-test="add-goal" @click="adding = true">+ Add goal</button>
  </section>
</template>
