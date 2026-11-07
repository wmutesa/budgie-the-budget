<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
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
import WalletCards from './components/WalletCards.vue';
import BudgetsView from './components/BudgetsView.vue';
import TransactionsView from './components/TransactionsView.vue';
import SubscriptionSearch from './components/SubscriptionSearch.vue';
import CaptureCell from './components/CaptureCell.vue';
import ReviewQueue from './components/ReviewQueue.vue';
import SpendSummary from './components/SpendSummary.vue';
import KpiStrip from './components/KpiStrip.vue';
import PlaygroundView from './components/PlaygroundView.vue';
import SignIn from './components/SignIn.vue';
import AccountMenu from './components/AccountMenu.vue';
import NoticeBell from './components/NoticeBell.vue';
import UpcomingCell from './components/UpcomingCell.vue';
import RecurringCell from './components/RecurringCell.vue';
import MarketsView from './components/MarketsView.vue';
import GuideTour from './components/GuideTour.vue';
import RecoveryCodes from './components/RecoveryCodes.vue';
import SignInBackdrop from './components/SignInBackdrop.vue';
import PlannerView from './components/PlannerView.vue';
import GlobalSearch from './components/GlobalSearch.vue';
import VoiceAdd from './components/VoiceAdd.vue';
import Icon from './components/Icon.vue';
import PlayInbox from './components/PlayInbox.vue';
import { nextTick } from 'vue';
import { nav, PAGES, go } from './lib/nav';
import { refreshFeeds } from './lib/calendar';
import { ensureColor } from './lib/profile';
import { startReminders } from './lib/reminders';
import { account, startAccount, dropRecoveryCodes } from './lib/account';
import { detectAI } from './lib/ai';
import { loadRates, ratesLabel, rates } from './lib/rates';
import { store } from './lib/store';

// Five pages: Overview (dashboard), Planner (tasks, routines, calendars), Transactions (capture, review, budgets, accounts),
// Markets (news and savings ideas), Playground (build a plan).
const active = computed({ get: () => nav.page, set: v => { nav.page = v; } });
const searching = ref(false);
const seed = ref('');
const openSearch = (q = '') => { seed.value = q; searching.value = true; };
// First-run guide: once per person, after their data has loaded; replayable from the account menu.
const touring = ref(false);
// AI starts once someone is signed in, so the sign-in page downloads nothing.
watch(() => account.status, s => { if (s === 'signed-in') detectAI(); }, { immediate: true });
// Calendars refresh and reminders run once your data has loaded.
watch(() => account.sync, s => { if (account.status === 'signed-in' && s === 'saved') { refreshFeeds(); startReminders(); ensureColor(); } });
watch(() => [account.status, account.sync, store.guide?.done, account.recoveryCodes], () => {
  if (account.status === 'signed-in' && account.sync !== 'saving' && !account.recoveryCodes && store.guide && !store.guide.done) touring.value = true;
}, { immediate: true });
// Skipping recovery codes cancels them so unseen codes cannot be used.
const skipCodes = async () => { try { await dropRecoveryCodes(); } catch { /* still hidden; they can be remade later */ } account.recoveryCodes = null; };
const endTour = () => { touring.value = false; store.guide = { done: true, at: new Date().toISOString() }; };
const fxShort = { loading: 'FX loading', live: 'FX live', cached: 'FX updated', stale: 'FX offline', error: 'FX unavailable' };
// The + button adds what fits the page you are on.
const PAGE_ICONS = { Overview: 'home', Planner: 'planner', Transactions: 'wallet', Markets: 'trend', Playground: 'shapes' };
const newLabel = computed(() => ({ Planner: '+ Task', Transactions: '+ Spending', Playground: '+ Anything' }[active.value] || '+ Subscription'));
async function newThing() {
  // Tasks are added in the Playground's inbox, which sends them to the Planner.
  if (active.value === 'Planner' || active.value === 'Playground') { go('Playground', { anchor: '#inbox' }); await nextTick(); return document.querySelector('[data-test="inbox-text"]')?.focus(); }
  if (active.value === 'Transactions') { const el = document.querySelector('[data-test="quick-note"]'); el?.scrollIntoView({ block: 'center' }); return el?.focus(); }
  openSearch('');
}
// Jump to a part of a page when something asks for it (search, notices).
watch(() => [nav.page, nav.anchor], async ([, anchor]) => {
  if (!anchor) return;
  await nextTick(); await nextTick();
  document.querySelector(anchor)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  nav.anchor = '';
});
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

let timer = null;
onMounted(() => {
  startAccount();
  loadRates(store.base);
  timer = setInterval(() => { loadRates(store.base, { force: true }); if (account.status === 'signed-in') refreshFeeds(); }, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', onVisible);
});
// Coming back to the tab refreshes rates if they are older than an hour.
const onVisible = () => { if (document.visibilityState === 'visible') loadRates(store.base); };
onUnmounted(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); });
</script>

<template>
  <div v-if="account.status === 'loading'" class="boot" aria-busy="true"><span class="brand-word">BUDGIE</span></div>
  <SignIn v-else-if="account.status === 'signed-out'" />
  <main v-else-if="account.recoveryCodes" class="signin">
    <SignInBackdrop />
    <section class="si-card">
      <p class="brand-word">BUDGIE</p>
      <h1>Save your recovery codes</h1>
      <RecoveryCodes :codes="account.recoveryCodes" :name="account.user?.name" @done="account.recoveryCodes = null" @skip="skipCodes" />
    </section>
  </main>
  <div v-else class="app">
    <main class="grid hl canvas">
      <!-- The navigation is the first row of the grid: one slim bar that adapts to the width. -->
      <header class="cell nav-bar span-12">
        <div class="nb-brand">
          <span class="brand-word">BUDGIE</span>
          <span class="muted small nb-date">{{ today }}</span>
        </div>
        <nav class="nb-pages" aria-label="Pages">
          <button v-for="p in PAGES" :key="p" :class="{ on: active === p }" :aria-current="active === p ? 'page' : undefined" @click="active = p">
            <Icon :name="PAGE_ICONS[p]" :size="15" />{{ p }}
          </button>
        </nav>
        <GlobalSearch />
        <div class="nb-actions">
          <span class="ai-pill" :class="rates.status" :title="ratesLabel()">{{ fxShort[rates.status] || 'FX' }}</span>
          <button class="btn primary small" data-test="new" @click="newThing">{{ newLabel }}</button>
          <VoiceAdd />
          <NoticeBell />
          <AccountMenu @tour="touring = true" />
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
        <WalletCards class="span-8" />
        <UpcomingCell class="span-4" id="upcoming" />
      </template>
      <template v-else-if="active === 'Transactions'">
        <KpiStrip />
        <CaptureCell class="span-5" id="capture" />
        <AccountCards class="span-3 accounts-side" id="accounts" />
        <SpendSummary class="span-4" />
        <ReviewQueue v-if="store.drafts.length" class="span-12" id="review" />
        <BudgetsView class="span-4" id="budgets" />
        <TransactionsView class="span-8" id="ledger" :limit="40" fill />
        <RecurringCell class="span-12" id="recurring" />
      </template>
      <template v-else-if="active === 'Planner'">
        <PlannerView />
      </template>
      <template v-else-if="active === 'Playground'">
        <PlayInbox />
        <PlaygroundView />
      </template>
      <template v-else>
        <MarketsView class="span-12" id="markets" />
      </template>
    </main>

    <SubscriptionSearch v-if="searching" :seed="seed" @close="searching = false" />
    <GuideTour v-if="touring" :page="active" @page="p => (active = p)" @done="endTour" />
  </div>
</template>
