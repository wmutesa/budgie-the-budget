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
import AccountPage from './components/AccountPage.vue';
import LockIn from './components/LockIn.vue';
import CaptureButton from './components/CaptureButton.vue';
import CaptureReview from './components/CaptureReview.vue';
import GlobalSearch from './components/GlobalSearch.vue';
import Icon from './components/Icon.vue';
import Toasts from './components/Toasts.vue';
import { toast } from './lib/toast';
import { nav, PAGES, ADMIN_PAGES, go } from './lib/nav';
import AdminPage from './components/AdminPage.vue';
import { refreshFeeds } from './lib/calendar';
import { ensureColor } from './lib/profile';
import { startReminders } from './lib/reminders';
import { account, startAccount, dropRecoveryCodes } from './lib/account';
import { focus, mmss } from './lib/focus';
import { detectAI } from './lib/ai';
import { store } from './lib/store';

// Two pages: Overview (your day, goals and how the week went) and Schedule
// (day, week and month, with your activity). Settings and Privacy open
// from the avatar. The Add button adds anything from anywhere; Lock In (the
// timer) starts from any activity.
const active = computed({ get: () => nav.page, set: v => { nav.page = v; } });
const PAGE_ICONS = { Overview: 'home', Schedule: 'calendar', People: 'user', Voice: 'mic', Errors: 'help', Sync: 'refresh', 'AI usage': 'sparkle', Calendars: 'calendar' };
// The owner can switch to the Admin view (from the avatar menu); everyone else sees their planner.
const adminView = computed(() => nav.mode === 'admin' && account.user?.role === 'owner');
const tabs = computed(() => (adminView.value ? ADMIN_PAGES : PAGES));
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
// The top bar's height, for anything that sticks just below it.
const navBar = ref(null);
let navRo = null;
watch(navBar, el => {
  navRo?.disconnect();
  if (!el || typeof ResizeObserver === 'undefined') return;
  navRo = new ResizeObserver(() => document.documentElement.style.setProperty('--nav-h', `${el.offsetHeight}px`));
  navRo.observe(el);
});
onMounted(() => {
  startAccount();
  timer = setInterval(() => { if (account.status === 'signed-in') refreshFeeds(); }, 30 * 60 * 1000);
});
onUnmounted(() => { clearInterval(timer); navRo?.disconnect(); });
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
      <header ref="navBar" class="cell nav-bar span-12">
        <div class="nb-brand">
          <span class="brand-word">BUDGIE</span>
          <span class="muted small nb-date">{{ today }}</span>
        </div>
        <nav class="nb-pages" aria-label="Pages">
          <button v-for="p in tabs" :key="p" :class="{ on: active === p }" :aria-current="active === p ? 'page' : undefined" :data-test="`nav-${p.toLowerCase().replace(/\s+/g, '-')}`" @click="active = p">
            <Icon :name="PAGE_ICONS[p]" :size="15" />{{ p }}
          </button>
        </nav>
        <GlobalSearch />
        <div class="nb-actions">
          <!-- Lock In, minimised: a pill with the time left, like a status icon in a menu bar -->
          <button v-if="focus.task" type="button" class="nb-focus" :class="{ paused: !focus.running && !focus.ended, ended: focus.ended }" :title="`Locked in on ${focus.task.title}`" :aria-label="focus.ended ? 'Lock In ended: open it' : `Locked in, ${mmss(focus.left)} left: open Lock In`" data-test="nb-focus" @click="focus.min = false"><Icon name="timer" :size="13" />{{ focus.ended ? 'Done' : mmss(focus.left) }}</button>
          <CaptureButton v-if="account.status === 'signed-in'" />
          <NoticeBell />
          <AccountMenu @tour="touring = true" />
        </div>
      </header>

      <template v-if="active === 'Overview'">
        <TodayView />
      </template>
      <template v-else-if="active === 'Schedule'">
        <PlannerView />
      </template>
      <template v-else-if="ADMIN_PAGES.includes(active)">
        <AdminPage :section="active" />
      </template>
      <template v-else-if="active === 'Settings'">
        <AccountPage kind="settings" />
      </template>
      <template v-else-if="active === 'Privacy'">
        <AccountPage kind="privacy" />
      </template>
    </main>

    <Toasts />
    <LockIn v-if="account.status === 'signed-in'" />
    <CaptureReview v-if="account.status === 'signed-in'" />
    <GuideTour v-if="touring" :page="active" @page="p => (active = p)" @done="endTour" />
  </div>
</template>
