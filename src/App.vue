<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import HeadlineCell from './components/HeadlineCell.vue';
import GoalCell from './components/GoalCell.vue';
import NetWorthCell from './components/NetWorthCell.vue';
import MonthCell from './components/MonthCell.vue';
import PlanCell from './components/PlanCell.vue';
import FlowCapsules from './components/FlowCapsules.vue';
import RatesCell from './components/RatesCell.vue';
import SubscriptionsCell from './components/SubscriptionsCell.vue';
import ExpenseStripes from './components/ExpenseStripes.vue';
import AccountCards from './components/AccountCards.vue';
import SignalsCell from './components/SignalsCell.vue';
import WalletCards from './components/WalletCards.vue';
import ReportsView from './components/ReportsView.vue';
import BudgetsView from './components/BudgetsView.vue';
import TransactionsView from './components/TransactionsView.vue';
import SubscriptionSearch from './components/SubscriptionSearch.vue';
import { loadRates, ratesLabel, rates } from './lib/rates';
import { store } from './lib/store';

// Two pages. Overview holds the dashboard and reports; Transactions holds budgets and the ledger.
const tabs = ['Overview', 'Transactions'];
const active = ref('Overview');
const searching = ref(false);
const seed = ref('');
const openSearch = (q = '') => { seed.value = q; searching.value = true; };
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

let timer = null;
onMounted(() => {
  loadRates(store.base);
  timer = setInterval(() => loadRates(store.base, { force: true }), 30 * 60 * 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand-line"><span class="brand-word">BUDGIE</span><span class="muted small">{{ today }}</span></div>
      <nav class="pages" aria-label="Pages">
        <button v-for="t in tabs" :key="t" :class="{ on: active === t }" @click="active = t">{{ t.toUpperCase() }}</button>
      </nav>
      <div class="tools">
        <label class="search">
          <input v-model="store.query" type="search" placeholder="Search transactions" aria-label="Search transactions" @keydown.enter="active = 'Transactions'" />
        </label>
        <span class="ai-pill" :class="rates.status">FX · {{ ratesLabel() || 'idle' }}</span>
        <button class="btn primary" @click="openSearch('')">+ Subscription</button>
      </div>
    </header>

    <main class="page">
      <template v-if="active === 'Overview'">
        <div class="grid hl">
          <HeadlineCell class="span-8" id="overview" />
          <GoalCell class="span-4" id="goals" />
          <NetWorthCell class="span-5" />
          <MonthCell class="span-3" />
          <PlanCell class="span-4" id="plan" />
          <FlowCapsules class="span-8" />
          <RatesCell class="span-4" id="rates" />
          <SubscriptionsCell class="span-8" id="subscriptions" @add="openSearch" />
          <ExpenseStripes class="span-4" />
          <AccountCards class="span-8" id="accounts" />
          <SignalsCell class="span-4" />
          <WalletCards class="span-12" />
          <ReportsView class="span-12" id="reports" />
        </div>
      </template>
      <template v-else>
        <div class="stack-pages">
          <BudgetsView />
          <TransactionsView />
        </div>
      </template>
    </main>

    <SubscriptionSearch v-if="searching" :seed="seed" @close="searching = false" />
  </div>
</template>
