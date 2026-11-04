<script setup>
import { ref, computed } from 'vue';
import { store } from '../lib/store';
import { createAccount, accountStats, ACCOUNT_TYPES } from '../lib/accounts';
import PickMenu from './PickMenu.vue';

const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const showNew = ref(false);
const newName = ref('');
const newType = ref('checking');
const newCurrency = ref('USD');
const newBalance = ref(0);

const typeOptions = ACCOUNT_TYPES.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));
const stats = accountStats;

const deleteAccount = id => {
  store.accounts = store.accounts.filter(a => a.id !== id);
  store.transactions = store.transactions.filter(t => t.accountId !== id);
};

const addAccount = () => {
  if (!newName.value) return;
  createAccount(newName.value, newType.value, newCurrency.value, Number(newBalance.value) || 0);
  newName.value = '';
  newType.value = 'checking';
  newCurrency.value = 'USD';
  newBalance.value = 0;
  showNew.value = false;
};
</script>

<template>
  <section class="card cell accounts-manager">
    <div class="cell-head">
      <p class="label">Connected accounts</p>
      <span class="muted small">{{ store.accounts.length }} account{{ store.accounts.length !== 1 ? 's' : '' }}</span>
    </div>

    <div v-if="!store.accounts.length" class="am-empty">
      <p class="muted">No accounts connected yet.</p>
      <p class="small">Connect your bank accounts to auto-sync transactions and balance.</p>
    </div>

    <div v-else class="am-list">
      <article v-for="a in store.accounts" :key="a.id" class="am-card">
        <div class="am-head">
          <div><h4>{{ a.name }}</h4><p class="muted small">{{ a.institution || 'Manual' }} · {{ a.type }}</p></div>
          <button class="btn icon-x" @click="deleteAccount(a.id)">×</button>
        </div>
        <p class="am-balance">{{ a.currency }} {{ fmt(a.balance) }}</p>
        <div class="am-meta">
          <span class="small">{{ stats[a.id]?.count || 0 }} transaction{{ (stats[a.id]?.count || 0) !== 1 ? 's' : '' }}</span>
          <span v-if="a.lastSync" class="small muted">Synced {{ new Date(a.lastSync).toLocaleDateString() }}</span>
        </div>
      </article>
    </div>

    <div v-if="!showNew" class="am-actions">
      <button class="btn primary small" @click="showNew = true">+ Connect account</button>
      <p class="small muted">Plaid or manual entry</p>
    </div>

    <form v-else class="am-form" @submit.prevent="addAccount">
      <p class="kicker">Add account manually</p>
      <input v-model="newName" class="field" placeholder="Account name" required />
      <PickMenu v-model="newType" :options="typeOptions" label="Type" />
      <input v-model="newCurrency" class="field" placeholder="Currency (USD)" maxlength="3" />
      <input v-model="newBalance" class="field" type="number" placeholder="Starting balance" step="0.01" />
      <div class="am-form-acts">
        <button class="btn primary small" type="submit">Add</button>
        <button class="btn small" type="button" @click="showNew = false">Cancel</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.accounts-manager { }
.am-empty { padding: 20px 0; text-align: center; color: #a1a1aa; }
.am-empty p { margin: 0 0 8px; }
.am-list { display: grid; gap: 12px; margin-bottom: 16px; }
.am-card { border: 1px solid var(--line); padding: 12px; border-radius: 6px; background: #fafafa; }
.am-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.am-head h4 { margin: 0; font-size: 14px; font-weight: 600; }
.am-balance { margin: 0; font-family: var(--display); font-size: 18px; font-weight: 600; }
.am-meta { display: flex; gap: 16px; margin-top: 8px; font-size: 11px; }
.am-actions { text-align: center; padding: 12px 0; border-top: 1px solid var(--line); }
.am-form { padding: 12px 0; border-top: 1px solid var(--line); display: grid; gap: 10px; }
.am-form-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
