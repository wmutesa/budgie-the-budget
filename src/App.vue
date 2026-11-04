<script setup>
import { ref } from 'vue';
import BalanceCard from './components/BalanceCard.vue';
import AccountCards from './components/AccountCards.vue';
import CashFlowChart from './components/CashFlowChart.vue';
import SpendingCard from './components/SpendingCard.vue';
import BillsList from './components/BillsList.vue';
import GoalsPanel from './components/GoalsPanel.vue';
import TransactionsTable from './components/TransactionsTable.vue';
import WalletCards from './components/WalletCards.vue';
import TransactionsView from './components/TransactionsView.vue';
import BudgetsView from './components/BudgetsView.vue';
import ReportsView from './components/ReportsView.vue';
import NetWorthCell from './components/NetWorthCell.vue';
import MonthCell from './components/MonthCell.vue';
import PlanCell from './components/PlanCell.vue';
import SignalsCell from './components/SignalsCell.vue';

// Two pages. Overview holds the dashboard and reports; Transactions holds budgets and the ledger.
const tabs = ['Overview', 'Transactions'];
const active = ref('Overview');
const period = ref('This month');
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand-line">
        <span class="brand-word">BUDGIE</span>
        <span class="muted small">Wednesday, Nov 4, 2026</span>
      </div>
      <nav class="pages" aria-label="Pages">
        <button v-for="t in tabs" :key="t" :class="{ on: active === t }" @click="active = t">{{ t.toUpperCase() }}</button>
      </nav>
      <div class="tools">
        <label class="search">
          <input type="search" placeholder="Search transactions" aria-label="Search transactions" />
        </label>
        <span class="ai-pill">AI · local ready</span>
        <div class="monthnav" aria-label="Month">
          <button aria-label="Previous month">‹</button><span>November 2026</span><button aria-label="Next month">›</button>
        </div>
        <button class="btn">+ Account</button>
        <button class="btn primary">+ Entry</button>
      </div>
    </header>

    <main class="page">
      <template v-if="active === 'Overview'">
        <div class="grid hl">
          <NetWorthCell class="span-5" id="overview" />
          <MonthCell class="span-3" />
          <PlanCell class="span-4" id="plan" />
          <CashFlowChart class="span-8" />
          <SignalsCell class="span-4" />
          <AccountCards class="span-8" id="accounts" />
          <GoalsPanel class="span-4 dark" id="goals" />
          <WalletCards class="span-4" />
          <BillsList class="span-4" />
          <SpendingCard class="span-4" />
          <ReportsView class="span-12" id="reports" />
        </div>
      </template>
      <template v-else>
        <div class="stack">
          <BudgetsView />
          <TransactionsView />
        </div>
      </template>
    </main>
  </div>
</template>
