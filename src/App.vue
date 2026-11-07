<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import SignIn from './components/SignIn.vue';
import AccountMenu from './components/AccountMenu.vue';
import NoticeBell from './components/NoticeBell.vue';
import GuideTour from './components/GuideTour.vue';
import RecoveryCodes from './components/RecoveryCodes.vue';
import SignInBackdrop from './components/SignInBackdrop.vue';
import TodayView from './components/TodayView.vue';
import PlannerView from './components/PlannerView.vue';
import FocusView from './components/FocusView.vue';
import ReportsView from './components/ReportsView.vue';
import CaptureButton from './components/CaptureButton.vue';
import CaptureReview from './components/CaptureReview.vue';
import GlobalSearch from './components/GlobalSearch.vue';
import Icon from './components/Icon.vue';
import Toasts from './components/Toasts.vue';
import { toast } from './lib/toast';
import { nav, PAGES, go } from './lib/nav';
import { refreshFeeds } from './lib/calendar';
import { ensureColor } from './lib/profile';
import { startReminders } from './lib/reminders';
import { account, startAccount, dropRecoveryCodes } from './lib/account';
import { detectAI } from './lib/ai';
import { store } from './lib/store';

// Three pages: Overview (your day and goals), Planner (schedule, tasks,
// agenda), Focus (what matters now) and Reports (what got done). The Add button adds anything from anywhere.
const active = computed({ get: () => nav.page, set: v => { nav.page = v; } });
const PAGE_ICONS = { Overview: 'home', Planner: 'planner', Focus: 'target', Reports: 'trend' };
// First-run guide: once per person, after their data has loaded; replayable from the account menu.
const touring = ref(false);
// AI starts once someone is signed in, so the sign-in page downloads nothing.
watch(() => account.status, s => { if (s === 'signed-in') detectAI(); }, { immediate: true });
// Calendars refresh, and reminders run, once your data has loaded.
let started = false;
watch(() => account.sync, s => {
  if (account.status !== 'signed-in' || s !== 'saved') return;
  refreshFeeds(); startReminders(); ensureColor();
  if (!started) { started = true; }
});
watch(() => [account.status, account.sync, store.guide?.done, account.recoveryCodes], () => {
  if (account.status === 'signed-in' && account.sync !== 'saving' && !account.recoveryCodes && store.guide && !store.guide.done) touring.value = true;
}, { immediate: true });
// Skipping recovery codes cancels them so unseen codes cannot be used.
const skipCodes = async () => { try { await dropRecoveryCodes(); } catch { /* still hidden; they can be remade later */ } account.recoveryCodes = null; };
const endTour = () => { touring.value = false; store.guide = { done: true, at: new Date().toISOString() }; };
// Sync problems and recovery, as notifications.
let wasOffline = false;
watch(() => account.sync, s => {
  if (s === 'offline') { wasOffline = true; toast('Your changes are saved on this device and sync when you are back online.', { kind: 'warn', title: 'Offline', id: 'sync' }); }
  else if (s === 'error') toast('Your latest changes could not be saved to your account. They are kept on this device; Budgie will try again.', { kind: 'error', title: 'Not synced', id: 'sync' });
  else if (s === 'saved' && wasOffline) { wasOffline = false; toast('Back online. All changes are saved.', { kind: 'success', id: 'sync' }); }
});
watch(() => account.note, n => { if (n) toast(n, { kind: 'info' }); });
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
  timer = setInterval(() => { if (account.status === 'signed-in') refreshFeeds(); }, 30 * 60 * 1000);
});
onUnmounted(() => clearInterval(timer));
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
          <button v-for="p in PAGES" :key="p" :class="{ on: active === p }" :aria-current="active === p ? 'page' : undefined" :data-test="`nav-${p.toLowerCase()}`" @click="active = p">
            <Icon :name="PAGE_ICONS[p]" :size="15" />{{ p }}
          </button>
        </nav>
        <GlobalSearch />
        <div class="nb-actions">
          <CaptureButton v-if="account.status === 'signed-in'" />
          <NoticeBell />
          <AccountMenu @tour="touring = true" />
        </div>
      </header>

      <template v-if="active === 'Overview'">
        <TodayView />
      </template>
      <template v-else-if="active === 'Planner'">
        <PlannerView />
      </template>
      <template v-else-if="active === 'Focus'">
        <FocusView />
      </template>
      <template v-else-if="active === 'Reports'">
        <ReportsView />
      </template>
    </main>

    <Toasts />
    <CaptureReview v-if="account.status === 'signed-in'" />
    <GuideTour v-if="touring" :page="active" @page="p => (active = p)" @done="endTour" />
  </div>
</template>
