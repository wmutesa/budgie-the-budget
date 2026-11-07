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
import DigestsView from './components/DigestsView.vue';
import PlayInbox from './components/PlayInbox.vue';
import GoalsBoard from './components/GoalsBoard.vue';
import ProjectsCard from './components/ProjectsCard.vue';
import PlanRoutine from './components/PlanRoutine.vue';
import GlobalSearch from './components/GlobalSearch.vue';
import VoiceAdd from './components/VoiceAdd.vue';
import Icon from './components/Icon.vue';
import { nav, PAGES, go } from './lib/nav';
import { refreshFeeds } from './lib/calendar';
import { loadDigests } from './lib/digest';
import { ensureColor } from './lib/profile';
import { startReminders } from './lib/reminders';
import { account, startAccount, dropRecoveryCodes } from './lib/account';
import { detectAI } from './lib/ai';
import { store } from './lib/store';

// Four pages: Today (your day, goals, latest digest), Planner (tasks, calendar,
// focus), Digests (opportunities and news, twice a week) and Playground (add
// anything; goals, routines and projects).
const active = computed({ get: () => nav.page, set: v => { nav.page = v; } });
const PAGE_ICONS = { Today: 'home', Planner: 'planner', Digests: 'list', Playground: 'shapes' };
// First-run guide: once per person, after their data has loaded; replayable from the account menu.
const touring = ref(false);
// AI starts once someone is signed in, so the sign-in page downloads nothing.
watch(() => account.status, s => { if (s === 'signed-in') detectAI(); }, { immediate: true });
// Calendars and digests refresh, and reminders run, once your data has loaded.
let started = false;
watch(() => account.sync, s => {
  if (account.status !== 'signed-in' || s !== 'saved') return;
  refreshFeeds(); startReminders(); ensureColor();
  if (!started) { started = true; loadDigests(); }
});
watch(() => [account.status, account.sync, store.guide?.done, account.recoveryCodes], () => {
  if (account.status === 'signed-in' && account.sync !== 'saving' && !account.recoveryCodes && store.guide && !store.guide.done) touring.value = true;
}, { immediate: true });
// Skipping recovery codes cancels them so unseen codes cannot be used.
const skipCodes = async () => { try { await dropRecoveryCodes(); } catch { /* still hidden; they can be remade later */ } account.recoveryCodes = null; };
const endTour = () => { touring.value = false; store.guide = { done: true, at: new Date().toISOString() }; };
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
          <button v-for="p in PAGES" :key="p" :class="{ on: active === p }" :aria-current="active === p ? 'page' : undefined" @click="active = p">
            <Icon :name="PAGE_ICONS[p]" :size="15" />{{ p }}
          </button>
        </nav>
        <GlobalSearch />
        <div class="nb-actions">
          <VoiceAdd />
          <NoticeBell />
          <AccountMenu @tour="touring = true" />
        </div>
      </header>

      <template v-if="active === 'Today'">
        <TodayView />
      </template>
      <template v-else-if="active === 'Planner'">
        <PlannerView />
      </template>
      <template v-else-if="active === 'Digests'">
        <DigestsView />
      </template>
      <template v-else>
        <PlayInbox />
        <GoalsBoard />
        <ProjectsCard />
        <PlanRoutine class="span-12" />
      </template>
    </main>

    <GuideTour v-if="touring" :page="active" @page="p => (active = p)" @done="endTour" />
  </div>
</template>
