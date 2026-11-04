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
import CaptureCell from './components/CaptureCell.vue';
import ReviewQueue from './components/ReviewQueue.vue';
import SpendSummary from './components/SpendSummary.vue';
import KpiStrip from './components/KpiStrip.vue';
import InsightsCell from './components/InsightsCell.vue';
import OpportunitiesCell from './components/OpportunitiesCell.vue';
import PlaygroundView from './components/PlaygroundView.vue';
import { detectAI } from './lib/ai';
import { loadRates, ratesLabel, rates } from './lib/rates';
import { store } from './lib/store';

// Four pages: Overview (dashboard), Transactions (capture, review, budgets), Reports (analysis, advice, full ledger), Playground (build a plan).
const tabs = ['Overview', 'Transactions', 'Reports', 'Playground'];
const active = ref('Overview');
const searching = ref(false);
const seed = ref('');
const openSearch = (q = '') => { seed.value = q; searching.value = true; };
const fxShort = { loading: 'FX loading', live: 'FX live', cached: 'FX updated', stale: 'FX offline', error: 'FX unavailable' };
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

let timer = null;
onMounted(() => {
  loadRates(store.base);
  detectAI();
  timer = setInterval(() => loadRates(store.base, { force: true }), 30 * 60 * 1000);
  document.addEventListener('visibilitychange', onVisible);
});
// Coming back to the tab refreshes rates if they are older than an hour.
const onVisible = () => { if (document.visibilityState === 'visible') loadRates(store.base); };
onUnmounted(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); });
</script>

<template>
  <div class="app">
    <main class="grid hl canvas">
      <!-- The navigation is the first row of the grid: one slim bar that adapts to the width. -->
      <header class="cell nav-bar span-12">
        <div class="nb-brand">
          <span class="brand-word">BUDGIE</span>
          <span class="muted small nb-date">{{ today }}</span>
        </div>
        <nav class="nb-pages" aria-label="Pages">
          <button v-for="(t, i) in tabs" :key="t" :class="{ on: active === t }" :aria-current="active === t ? 'page' : undefined" @click="active = t">
            <sup>0{{ i + 1 }}</sup>{{ t }}
          </button>
        </nav>
        <label class="nb-search">
          <span aria-hidden="true">⌕</span>
          <input v-model="store.query" type="search" placeholder="Search transactions" aria-label="Search transactions" @keydown.enter="active = 'Transactions'" />
        </label>
        <div class="nb-actions">
          <span class="ai-pill" :class="rates.status" :title="ratesLabel()">{{ fxShort[rates.status] || 'FX' }}</span>
          <button class="btn primary small" @click="openSearch('')">+ Subscription</button>
        </div>
      </header>

      <template v-if="active === 'Overview'">
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
      </template>
      <template v-else-if="active === 'Transactions'">
        <KpiStrip />
        <CaptureCell class="span-8" id="capture" />
        <SpendSummary class="span-4" />
        <ReviewQueue v-if="store.drafts.length" class="span-12" id="review" />
        <BudgetsView class="span-4" id="budgets" />
        <TransactionsView class="span-8" id="ledger" :limit="8" />
      </template>
      <template v-else-if="active === 'Playground'">
        <PlaygroundView />
      </template>
      <template v-else>
        <InsightsCell class="span-8" id="insights" />
        <OpportunitiesCell class="span-4" id="opportunities" />
        <ReportsView class="span-12" id="reports" />
        <TransactionsView class="span-12" id="activity" full title="All activity" />
      </template>
    </main>

    <SubscriptionSearch v-if="searching" :seed="seed" @close="searching = false" />
  </div>
</template>
