<script setup>
import AiHint from './AiHint.vue';
import { ref } from 'vue';
import { store, newId } from '../lib/store';
import { convert } from '../lib/rates';
import { accountTotal } from '../lib/ledger';
import PickMenu from './PickMenu.vue';
import { currentBalance, setBalance, accountIcon } from '../lib/accounts';

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
  const now = new Date().toISOString();
  store.balances.push({ id: newId(), name: name.slice(0, 40), kind: draft.value.kind, balance, base: balance, baseAt: now, currency: draft.value.currency, updatedAt: now, icon: null });
  draft.value = { name: '', kind: 'checking', balance: '', currency: draft.value.currency };
  adding.value = false;
}
function startEdit(a) { editing.value = a.id; editValue.value = String(Math.round(currentBalance(a) * 100) / 100); }
function saveEdit(a) {
  const v = Number(editValue.value);
  if (Number.isFinite(v) && v !== Math.round(currentBalance(a) * 100) / 100) setBalance(a, v);
  editing.value = null;
}
// Entries paid with an account since its balance was last set.
const linked = a => store.transactions.filter(t => t.accountId === a.id && String(t.date) >= String(a.baseAt || a.updatedAt).slice(0, 10)).length;

// Your own icon for an account, shrunk to a small square so it syncs quickly.
const picking = ref(null);
const fileInput = ref(null);
function chooseIcon(a) { picking.value = a; fileInput.value.value = ''; fileInput.value.click(); }
async function onIcon(e) {
  const file = e.target.files?.[0];
  const a = picking.value;
  if (!file || !a || !file.type.startsWith('image/')) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  try {
    await img.decode();
    const size = 96;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const s = Math.min(img.width, img.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    a.icon = c.toDataURL('image/png');
  } catch { /* not an image the browser can read */ } finally { URL.revokeObjectURL(img.src); }
}
const brokenIcon = ref({});

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
    <AiHint for="accounts" />

    <input ref="fileInput" type="file" accept="image/*" hidden data-test="account-icon-input" @change="onIcon" />
    <p v-if="!store.balances.length && !adding" class="empty-note">Add the accounts you want to track, such as your bank account, cards, cash or mobile money, with what is in them today. Spending you link to an account is taken off its balance, for example "lunch 12 with my Chase card". Click a balance to correct it, or an icon to upload your own.</p>

    <div v-if="store.balances.length" class="acc-grid">
      <article v-for="a in store.balances" :key="a.id" class="acc">
        <div class="acc-top">
          <button class="acc-icon" type="button" :title="`Upload an icon for ${a.name}`" :aria-label="`Upload an icon for ${a.name}`" @click="chooseIcon(a)">
            <img v-if="accountIcon(a) && !brokenIcon[a.id]" :src="accountIcon(a)" :alt="`${a.name} icon`" width="34" height="34" @error="brokenIcon[a.id] = true" />
            <span v-else class="icon-square">{{ a.name[0] }}</span>
            <span class="acc-icon-edit" aria-hidden="true">↑</span>
          </button>
          <div class="acc-name"><b>{{ a.name }}</b><span class="muted small">{{ kindLabel(a.kind) }} · {{ a.currency }}</span></div>
          <button class="icon-x" type="button" :aria-label="`Remove ${a.name}`" @click="remove(a)">×</button>
        </div>
        <form v-if="editing === a.id" class="acc-edit" @submit.prevent="saveEdit(a)">
          <input v-model="editValue" class="field" type="number" step="0.01" :aria-label="`New balance for ${a.name}`" autofocus @blur="saveEdit(a)" />
        </form>
        <button v-else class="acc-amount" type="button" :title="`Update the balance of ${a.name}`" @click="startEdit(a)">{{ a.kind === 'card' ? 'Owe ' : '' }}{{ fmt(currentBalance(a), a.currency) }}</button>
        <p class="muted small">
          <template v-if="a.currency !== 'USD' && convert(currentBalance(a), a.currency, 'USD') !== null">≈ {{ fmt(convert(currentBalance(a), a.currency, 'USD')) }} · </template>
          set {{ new Date(a.baseAt || a.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}<template v-if="linked(a)"> · {{ linked(a) }} {{ linked(a) === 1 ? 'entry' : 'entries' }} since</template>
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
