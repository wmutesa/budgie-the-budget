<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import SignIn from './components/SignIn.vue';
import HomePage from './components/HomePage.vue';
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
import AdminSettings from './components/AdminSettings.vue';
import { refreshFeeds } from './lib/calendar';
import { ensureColor } from './lib/profile';
import { startReminders } from './lib/reminders';
import { setupPush } from './lib/push';
import { account, startAccount, dropRecoveryCodes } from './lib/account';
import { focus, mmss } from './lib/focus';
import { capture } from './lib/capture';
import { detectAI } from './lib/ai';
import { store } from './lib/store';

// Two pages: Overview (your day, goals and how the week went) and Schedule
// (day, week and month, with your activity). Settings and Privacy open
// from the avatar. The Add button adds anything from anywhere; Lock In (the
// timer) starts from any activity.
const active = computed({ get: () => nav.page, set: v => { nav.page = v; } });
const PAGE_ICONS = { Overview: 'home', Schedule: 'calendar', Dashboard: 'home', People: 'user', Voice: 'mic', Models: 'sparkle', Training: 'trend', Errors: 'help', Sync: 'refresh', Calendars: 'calendar', Settings: 'gear' };
// The Admin sidebar, in groups like a dashboard's.
const USER_GROUPS = [['Planner', ['Overview', 'Schedule']], ['Account', ['Settings']]];
const ADMIN_GROUPS = [['General', ['Dashboard', 'People']], ['AI', ['Voice', 'Models', 'Training']], ['Health', ['Errors', 'Sync', 'Calendars']], ['Account', ['Settings']]];
// The owner can switch to the Admin view (from the avatar menu); everyone else sees their planner.
const adminView = computed(() => nav.mode === 'admin' && account.user?.role === 'owner');
// The line between the views: each view opens only its own pages. Settings is shared (a reduced
// version in the Admin view); Privacy belongs to the user view. Anything else lands on the view's first page.
const ADMIN_OK = [...ADMIN_PAGES, 'Settings'];
const USER_OK = [...PAGES, 'Settings', 'Privacy'];
watch([() => nav.page, adminView, () => account.status], () => {
  if (account.status !== 'signed-in') return;
  if (adminView.value && !ADMIN_OK.includes(nav.page)) nav.page = ADMIN_PAGES[0];
  else if (!adminView.value && !USER_OK.includes(nav.page)) nav.page = 'Overview';
}, { immediate: true });
// Switching to the Admin view puts the planner away: the Add card closes (stopping any
// recording), and Lock In keeps counting quietly until you are back.
watch(adminView, on => { if (!on) return; capture.open = false; if (focus.task) focus.min = true; });
// First-run guide: once per person, after their data has loaded; replayable from the account menu.
const touring = ref(false);
// AI starts once someone is signed in, so the sign-in page downloads nothing.
watch(() => account.status, s => { if (s === 'signed-in') detectAI(); }, { immediate: true });
// Calendars refresh, and reminders run, once your data has loaded.
let started = false;
watch(() => account.sync, s => {
  if (account.status !== 'signed-in' || s !== 'saved') return;
  refreshFeeds(); startReminders(); setupPush(); ensureColor();
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
  else if (s === 'error') toast('Your latest changes could not be saved to your account. They are kept on this device; Taskie will try again.', { kind: 'error', title: 'Not synced', id: 'sync' });
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
  <div v-if="account.status === 'loading'" class="boot" aria-busy="true"><span class="brand-word">TASKIE</span></div>
  <!-- Not signed in: the home page, with the sign-in card in its first screen; an invite goes straight to joining -->
  <SignIn v-else-if="account.status === 'signed-out' && account.invite?.token" />
  <HomePage v-else-if="account.status === 'signed-out'" />
  <main v-else-if="account.recoveryCodes" class="signin">
    <SignInBackdrop />
    <section class="si-card">
      <p class="brand-word">TASKIE</p>
      <h1>Save your recovery codes</h1>
      <RecoveryCodes :codes="account.recoveryCodes" :name="account.user?.name" @done="account.recoveryCodes = null" @skip="skipCodes" />
    </section>
  </main>
  <div v-else class="app">
    <main class="grid hl canvas">
      <!-- The navigation is the first row of the grid: one slim bar that adapts to the width. -->
      <header ref="navBar" class="cell nav-bar span-12">
        <div class="nb-brand">
          <span class="brand-word">TASKIE</span>
          <span v-if="adminView" class="nb-admin" data-test="admin-badge">Admin</span>
          <span v-else class="muted small nb-date">{{ today }}</span>
        </div>
        <GlobalSearch v-if="!adminView" />
        <span v-else class="nb-spacer" aria-hidden="true" />
        <div class="nb-actions">
          <!-- Lock In, minimised: a pill with the time left, like a status icon in a menu bar -->
          <button v-if="focus.task && !adminView" type="button" class="nb-focus" :class="{ paused: !focus.running && !focus.ended, ended: focus.ended }" :title="`Locked in on ${focus.task.title}`" :aria-label="focus.ended ? 'Lock In ended: open it' : `Locked in, ${mmss(focus.left)} left: open Lock In`" data-test="nb-focus" @click="focus.min = false"><Icon name="timer" :size="13" />{{ focus.ended ? 'Done' : mmss(focus.left) }}</button>
          <!-- The planner's tools live in the user view only: no Add, no recording, no notices in the Admin view -->
          <CaptureButton v-if="account.status === 'signed-in' && !adminView" />
          <NoticeBell v-if="!adminView" />
          <AccountMenu @tour="touring = true" />
        </div>
      </header>

      <!-- One shell for both views: a sidebar of pages beside the page itself. -->
      <div class="adm-shell span-12" :class="{ 'user-shell': !adminView }">
        <aside class="adm-side" :class="{ 'nb-pages': !adminView }" :aria-label="adminView ? 'Admin pages' : 'Pages'">
          <template v-for="[group, pages] in (adminView ? ADMIN_GROUPS : USER_GROUPS)" :key="group">
            <p class="adm-group">{{ group }}</p>
            <button v-for="p in pages" :key="p" type="button" :class="{ on: active === p }" :aria-current="active === p ? 'page' : undefined" :data-test="`nav-${p.toLowerCase().replace(/\s+/g, '-')}`" @click="active = p"><Icon :name="PAGE_ICONS[p]" :size="15" />{{ p }}</button>
          </template>
        </aside>
        <div class="adm-main">
          <template v-if="adminView">
            <AdminPage v-if="ADMIN_PAGES.includes(active)" :section="active" />
            <AdminSettings v-else />
          </template>
          <div v-else-if="active === 'Overview'" class="grid hl user-page"><TodayView /></div>
          <div v-else-if="active === 'Schedule'" class="grid hl user-page"><PlannerView /></div>
          <div v-else-if="active === 'Settings' || active === 'Privacy'" class="grid hl user-page"><AccountPage :kind="active === 'Privacy' ? 'privacy' : 'settings'" /></div>
        </div>
      </div>
    </main>

    <Toasts />
 <LockIn v-if="account.status === 'signed-in' && !adminView" />
    <CaptureReview v-if="account.status === 'signed-in' && !adminView" />
    <GuideTour v-if="touring && !adminView" :page="active" @page="p => (active = p)" @done="endTour" />
  </div>
</template>
