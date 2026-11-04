<script setup>
import AiHint from './AiHint.vue';
import { ref, computed, watch } from 'vue';
import { budgetRows } from '../lib/ledger';
import { store } from '../lib/store';
import { account } from '../lib/account';
import { ai, labelFor } from '../lib/ai';
import { draftBudgets, shouldDraft, budgetInputs, hasInputs } from '../lib/budgets';

// Monthly budgets: drafted by AI (or rules) from your income and spending,
// shown in the set colours, and editable by clicking an amount.
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = b => (b.budget ? Math.min(100, Math.round((b.spent / b.budget) * 100)) : 0);
const state = b => (b.spent > b.budget ? 'over' : pct(b) >= 80 ? 'near' : 'ok');
const editing = ref(null);
const editValue = ref('');
const income = ref('');
const busy = computed(() => Boolean(store.budgetMeta?.drafting));
const ready = computed(() => hasInputs(budgetInputs()));
const madeBy = computed(() => {
  const m = store.budgetMeta || {};
  if (busy.value) return 'Drafting…';
  if (m.source === 'ai') return `Made by AI · ${m.by}`;
  if (m.source === 'rules') return 'Drafted from your spending';
  if (m.source === 'plan') return 'From your plan';
  if (m.source === 'user') return 'Edited by you';
  return 'Updates as you add spending';
});

// Draft on its own when there are none yet, at a new month, or when a model becomes ready.
watch(() => [account.status, account.sync, ai.ready, store.transactions.length, store.plan?.income], () => {
  if (account.status === 'signed-in' && account.sync !== 'saving' && shouldDraft() && ready.value) draftBudgets();
}, { immediate: true });

function startEdit(b) { editing.value = b.name; editValue.value = String(b.budget); }
function saveEdit(b) {
  const v = Math.round(Number(editValue.value));
  const row = store.budgets.find(x => x.name === b.name);
  if (row && v > 0 && v !== row.budget) {
    Object.assign(row, { budget: v, edited: true });
    store.budgetMeta = { ...store.budgetMeta, source: 'user', at: new Date().toISOString() };
  }
  editing.value = null;
}
function redo() {
  if (store.budgetMeta?.source === 'user' && !confirm('Replace your edited budgets with a fresh draft?')) return;
  draftBudgets({ force: true });
}
function setIncome() {
  const v = Math.round(Number(income.value));
  if (v > 0) { store.plan = { ...(store.plan || {}), income: v }; income.value = ''; }
}
</script>

<template>
  <section class="card cell budgets-cell" data-test="budgets-card">
    <div class="cell-head">
      <p class="label">Monthly budgets</p>
      <span class="muted small" data-test="budgets-by">{{ madeBy }}</span>
    </div>
    <AiHint for="budgets" />

    <template v-if="budgetRows.length">
      <ul class="budget-fill">
        <li v-for="b in budgetRows" :key="b.name" class="bf-row" :class="state(b)">
          <div class="bf-top">
            <span class="budget-name"><i class="swatch" :style="{ background: b.color }" />{{ b.name }}</span>
            <form v-if="editing === b.name" class="bf-edit" @submit.prevent="saveEdit(b)">
              <input v-model="editValue" class="field" type="number" min="1" step="10" :aria-label="`Budget for ${b.name}`" autofocus @blur="saveEdit(b)" />
            </form>
            <span v-else class="budget-num"><b>{{ fmt(b.spent) }}</b><button class="bf-amt muted small" type="button" :title="`Change the ${b.name} budget`" @click="startEdit(b)"> / {{ fmt(b.budget) }}</button></span>
          </div>
          <div class="meter"><i :style="{ width: pct(b) + '%', background: b.color }" /></div>
          <span class="status-tag">{{ state(b) === 'over' ? 'Over' : state(b) === 'near' ? 'Close' : 'On track' }} · {{ pct(b) }}%</span>
        </li>
      </ul>
      <div class="bf-foot">
        <button class="btn small" type="button" data-test="redo-budgets" :disabled="busy || !ready" @click="redo">{{ busy ? 'Drafting…' : `Redo with ${ai.ready ? 'AI' : 'your spending'}` }}</button>
        <span class="muted small">Click an amount to change it. {{ labelFor('budget') }}</span>
      </div>
    </template>

    <div v-else class="bf-empty">
      <p v-if="busy" class="empty-note">Budgie is drafting your budgets…</p>
      <template v-else-if="ready">
        <p class="empty-note">Budgie can draft budgets from your income and spending.</p>
        <button class="btn primary small" type="button" data-test="draft-budgets" @click="draftBudgets({ force: true })">Draft my budgets</button>
      </template>
      <template v-else>
        <p class="empty-note">Budgie drafts your monthly budgets with AI from your income and spending. Add some spending, or enter your monthly income to start.</p>
        <form class="bf-income" @submit.prevent="setIncome">
          <input v-model="income" class="field" type="number" min="1" step="50" placeholder="Monthly income in USD" aria-label="Monthly income" data-test="budget-income" />
          <button class="btn primary small" type="submit">Draft budgets</button>
        </form>
      </template>
    </div>
  </section>
</template>
