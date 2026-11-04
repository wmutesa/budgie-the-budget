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

// Top navigation, no sidebar. Each tab shows a different set of panels.
const tabs = ['Overview', 'Transactions', 'Budgets', 'Reports'];
const active = ref('Overview');
const period = ref('This month');
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand"><span class="mark">B</span>Budgie</div>
      <nav class="tabs" aria-label="Sections">
        <button v-for="t in tabs" :key="t" :class="{ on: active === t }" @click="active = t">{{ t }}</button>
      </nav>
      <div class="tools">
        <label class="search">
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="Search transactions" aria-label="Search transactions" />
        </label>
        <select v-model="period" class="period" aria-label="Period">
          <option>This month</option><option>This year</option>
        </select>
        <span class="avatar">W</span>
      </div>
    </header>

    <main class="page">
      <div class="heading">
        <div>
          <p class="eyebrow">Welcome back</p>
          <h1>Financial overview</h1>
        </div>
        <div class="actions">
          <button class="btn primary">Receive money</button>
          <button class="btn">Send money</button>
          <button class="btn">Payment request</button>
        </div>
      </div>

      <template v-if="active === 'Overview'">
        <div class="grid">
          <BalanceCard class="span-4" />
          <AccountCards class="span-8" />
          <CashFlowChart class="span-8" />
          <SpendingCard class="span-4" />
          <WalletCards class="span-4" />
          <BillsList class="span-4" />
          <GoalsPanel class="span-4 dark" />
          <TransactionsTable class="span-8" />
        </div>
      </template>
      <template v-else-if="active === 'Transactions'">
        <TransactionsView />
      </template>
      <template v-else-if="active === 'Budgets'">
        <BudgetsView />
      </template>
      <template v-else>
        <ReportsView />
      </template>
    </main>
  </div>
</template>
