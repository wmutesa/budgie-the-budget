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
          <BalanceCard class="a-hero" />
          <AccountCards class="a-accts" />
          <GoalsPanel class="a-goals dark" />
          <CashFlowChart class="a-chart" />
          <WalletCards class="a-wallet" />
          <SpendingCard class="a-spend" />
          <BillsList class="a-bills" />
          <TransactionsTable class="a-act" />
        </div>
      </template>
      <template v-else>
        <div class="card">
          <p class="muted">{{ active }} is in the next build stage. The overview shows the full layout today.</p>
        </div>
      </template>
    </main>
  </div>
</template>
