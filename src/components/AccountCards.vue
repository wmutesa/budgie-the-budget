<script setup>
import { ref } from 'vue';
import { store, newId } from '../lib/store';
import { convert } from '../lib/rates';
import { accountTotal } from '../lib/ledger';
import PickMenu from './PickMenu.vue';

// Accounts you track by hand (bank, cash, cards, savings), with their balances.
const kinds = [
  { value: 'checking', label: 'Checking' }, { value: 'savings', label: 'Savings' },
  { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Credit card' },
  { value: 'mobile', label: 'Mobile money' }, { value: 'investment', label: 'Investments' },
];
const currencies = ['USD', 'EUR', 'GBP', 'RWF', 'THB', 'KES', 'CAD', 'JPY', 'INR', 'NGN'].map(c => ({ value: c, label: c }));
const adding = ref(false);
const draft = ref({ name: '', kind: 'checking', balance: '', currency: 'USD' });
const editing = ref(null);
const editValue = ref('');
const fmt = (n, c = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: c === 'RWF' || c === 'JPY' ? 0 : 2 }).format(n);
const kindLabel = k => kinds.find(x => x.value === k)?.label || k;

function add() {
  const name = draft.value.name.trim();
  const balance = Number(draft.value.balance);
  if (!name || !Number.isFinite(balance)) return;
  store.balances.push({ id: newId(), name: name.slice(0, 40), kind: draft.value.kind, balance, currency: draft.value.currency, updatedAt: new Date().toISOString() });
  draft.value = { name: '', kind: 'checking', balance: '', currency: draft.value.currency };
  adding.value = false;
}
function startEdit(a) { editing.value = a.id; editValue.value = String(a.balance); }
function saveEdit(a) {
  const v = Number(editValue.value);
  if (Number.isFinite(v)) Object.assign(a, { balance: v, updatedAt: new Date().toISOString() });
  editing.value = null;
}
function remove(a) {
  if (confirm(`Remove ${a.name}? Its balance will no longer count toward your net worth.`)) store.balances = store.balances.filter(x => x.id !== a.id);
}
</script>

<template>
  <section class="card cell accounts-cell" data-test="accounts">
    <div class="cell-head">
      <p class="label">Accounts</p>
      <span class="muted small">{{ store.balances.length ? `${fmt(accountTotal)} in all` : 'Bank, cash, cards, mobile money' }}</span>
    </div>

    <p v-if="!store.balances.length && !adding" class="empty-note">Add the accounts you want to track, such as your bank account, cash or mobile money, with what is in them today. Update a balance any time by clicking it.</p>

    <div v-if="store.balances.length" class="acc-grid">
      <article v-for="a in store.balances" :key="a.id" class="acc">
        <div class="acc-top">
          <span class="icon-square">{{ a.name[0] }}</span>
          <div class="acc-name"><b>{{ a.name }}</b><span class="muted small">{{ kindLabel(a.kind) }} · {{ a.currency }}</span></div>
          <button class="icon-x" type="button" :aria-label="`Remove ${a.name}`" @click="remove(a)">×</button>
        </div>
        <form v-if="editing === a.id" class="acc-edit" @submit.prevent="saveEdit(a)">
          <input v-model="editValue" class="field" type="number" step="0.01" :aria-label="`New balance for ${a.name}`" autofocus @blur="saveEdit(a)" />
        </form>
        <button v-else class="acc-amount" type="button" :title="`Update the balance of ${a.name}`" @click="startEdit(a)">{{ fmt(a.balance, a.currency) }}</button>
        <p class="muted small">
          <template v-if="a.currency !== 'USD' && convert(a.balance, a.currency, 'USD') !== null">≈ {{ fmt(convert(a.balance, a.currency, 'USD')) }} · </template>
          updated {{ new Date(a.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
        </p>
      </article>
    </div>

    <form v-if="adding" class="acc-form" @submit.prevent="add">
      <input v-model="draft.name" class="field" placeholder="Name, e.g. Chase checking" aria-label="Account name" maxlength="40" required />
      <PickMenu v-model="draft.kind" :options="kinds" label="Type" />
      <input v-model="draft.balance" class="field" type="number" step="0.01" placeholder="Balance today" aria-label="Balance today" required />
      <PickMenu v-model="draft.currency" :options="currencies" label="Currency" searchable />
      <div class="acc-form-acts">
        <button class="btn primary small" type="submit">Add account</button>
        <button class="btn small" type="button" @click="adding = false">Cancel</button>
      </div>
    </form>
    <button v-else class="btn small acc-add" type="button" data-test="add-account" @click="adding = true">+ Add account</button>
  </section>
</template>
