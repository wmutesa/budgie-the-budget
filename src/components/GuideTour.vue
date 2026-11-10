<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { account } from '../lib/account';
import PasskeyNote from './PasskeyNote.vue';

// A first-run guide: a welcome note, then one step per part of the app with
// the part highlighted. Shown once per person; the account menu can replay it.
const props = defineProps({ page: { type: String, required: true } });
const emit = defineEmits(['page', 'done']);

const steps = [
  { title: `Welcome to Taskie${account.user?.name ? `, ${account.user.name.split(' ')[0]}` : ''}`,
    body: 'Taskie plans your days and keeps your goals moving, so your brain can do the fun parts. This tour shows every part of it in about two minutes.',
    note: 'Taskie starts empty, like a fresh notebook. The quickest start: tap Add and say a few things out loud.' },
  // The Overview
  { page: 'Overview', target: '.nb-pages', title: 'Two pages, zero clutter',
    body: 'Overview is your day at a glance. Schedule is your day, week and month. Settings and the tour live in your avatar.' },
  { page: 'Overview', target: '#today', title: 'Your day in a sentence',
    body: 'What is on today, what is next, this week’s deadlines and your streaks, with a ring that fills as you tick things off.' },
  { page: 'Overview', target: '[data-test="today-list"]', title: 'What’s next, written for you',
    body: 'Taskie’s AI reads your planner and suggests the next best moves: start an essay early, prepare for a quiz, clear what slipped. Tap + to add one, × to skip it. They refresh by themselves.' },
  { page: 'Overview', target: '[data-test="today-goals"]', title: 'Goals with milestones',
    body: 'Say a goal like “run a 10K by March” and Taskie spreads milestones up to the date. Each one ticked moves the bar.' },
  { page: 'Overview', target: '#progress', title: 'How it is going',
    body: 'Things done over a week, a month or three months, where the effort went, and your month in numbers. Numbers, not guilt.' },
  // Adding
  { page: 'Overview', target: '[data-test="capture"]', title: 'Add anything',
    body: 'Tap Add (or press N) and just talk: “essay due Friday at 5, gym Monday Wednesday Friday at 6, I want to run a 10K by March”. Tap Stop and Taskie hears it all, fixes names and courses, and puts each thing in place. Typing works too.' },
  // The Schedule
  { page: 'Schedule', target: '[data-test="schedule"]', title: 'Plan your days',
    body: 'Day, week and month, with your activities by category beside the calendar. Click an empty spot to add something at that time.' },
  { page: 'Schedule', target: '[data-test="sch-list"]', title: 'Everything in one row',
    body: 'Click a title to rename it. The icons on each activity: the timer to Lock In for its own length, the calendar for its day and time, the link to attach a doc or Canvas page (double-click the title to open it), and Break down for small steps.' },
  { page: 'Schedule', target: '[data-test="calendars-open"]', title: 'Bring your calendars',
    body: 'Add Canvas, Google, Apple or Outlook links, or public calendars like holidays and school terms. They stay up to date on their own.' },
  { page: 'Schedule', target: '[data-test="export-open"]', title: 'Take it with you',
    body: 'Export the day, week or month as a PNG, JPG or a one-page PDF to print or send.' },
  { page: 'Schedule', target: '[data-test="schedule"]', title: 'Check before it counts',
    body: 'After you add, Taskie shows each new thing where it landed, highlighted. Keep it, switch it to a task, routine or goal, rename it or remove it.' },
  // Around the top bar
  { target: '.nb-search, [role="search"], input[type="search"]', title: 'Find anything',
    body: 'Search tasks, goals and calendars, or type something new to add it. Press / to jump here.' },
  { target: '.bell-btn', title: 'Notifications',
    body: 'What is due, what slipped and what is coming up. Turn on notifications in Settings to get reminders, an 8 AM brief and deadlines on your laptop and phone, even with Taskie closed.' },
  // Settings
  { page: 'Settings', target: '[data-test="settings-page"] .set-nav', title: 'Settings, your way',
    body: 'Profile helps Taskie plan for you. AI holds your own Gemini key (optional). Calendars, devices and passkeys, and under Privacy: download your data, sessions, or delete your account.' },
  { target: '[data-test="account"]', title: 'Keep your passkey safe', passkeys: true,
    body: 'You sign in with a passkey instead of a password. Read how it works and the few things that can go wrong. You can find this note again in Settings, Devices & security.' },
  { target: '[data-test="account"]', title: 'Your account',
    body: 'Your data follows you to every device. Tap your avatar for Settings, this tour, or to sign out.' },
  { page: 'Overview', title: 'You are all set',
    body: 'Start by adding what is on your mind today. Taskie learns your names, courses and routine as you go. No pressure. Well, a little.',
    note: 'Tip: the tour lives in the avatar menu, in case you miss it already.' },
];

const i = ref(0);
const step = computed(() => steps[i.value]);
const rect = ref(null);
const card = ref(null);
const cardPos = ref({});
const last = computed(() => i.value === steps.length - 1);

async function place() {
  rect.value = null;
  const s = step.value;
  if (s.page && s.page !== props.page) { emit('page', s.page); await nextTick(); }
  await nextTick();
  if (!s.target) { cardPos.value = {}; return; }
  const el = document.querySelector(s.target);
  if (!el) { cardPos.value = {}; return; }
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  await new Promise(r => setTimeout(r, 320));
  measure();
}

function measure() {
  const s = step.value;
  const el = s.target && document.querySelector(s.target);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const pad = 6;
  rect.value = { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
  // Put the note below the highlight if it fits, otherwise above; keep it on screen.
  const cw = Math.min(340, window.innerWidth - 32);
  const ch = card.value?.offsetHeight || 200;
  let top = r.bottom + 14;
  if (top + ch > window.innerHeight - 16) top = Math.max(16, r.top - ch - 14);
  if (top + ch > window.innerHeight - 16) top = window.innerHeight - ch - 16;
  const left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), window.innerWidth - cw - 16);
  cardPos.value = { top: `${top}px`, left: `${left}px`, width: `${cw}px` };
}

const next = () => (last.value ? finish() : i.value++);
const back = () => { if (i.value > 0) i.value--; };
function finish() { emit('done'); }
function onKey(e) {
  if (e.key === 'Escape') finish();
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') back();
}

watch(i, place);
onMounted(() => {
  place();
  window.addEventListener('resize', measure);
  window.addEventListener('scroll', measure, true);
  window.addEventListener('keydown', onKey);
  nextTick(() => card.value?.querySelector('.gt-next')?.focus());
});
onUnmounted(() => {
  window.removeEventListener('resize', measure);
  window.removeEventListener('scroll', measure, true);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div class="gt" role="dialog" aria-modal="true" :aria-label="step.title" data-test="guide">
    <!-- Dimmed page with a window around the highlighted part. -->
    <div v-if="rect" class="gt-hole" :style="{ top: rect.top + 'px', left: rect.left + 'px', width: rect.width + 'px', height: rect.height + 'px' }" />
    <div v-else class="gt-dim" />

    <div ref="card" class="gt-card" :class="{ centered: !rect }" :style="rect ? cardPos : {}">
      <div class="gt-top">
        <span class="gt-count">{{ i + 1 }} / {{ steps.length }}</span>
        <button v-if="!last" class="gt-skip" type="button" data-test="guide-skip" @click="finish">Skip tour</button>
      </div>
      <h2>{{ step.title }}</h2>
      <p>{{ step.body }}</p>
      <p v-if="step.note" class="gt-note">{{ step.note }}</p>
      <PasskeyNote v-if="step.passkeys" open :owner="account.user?.role === 'owner'" class="gt-pk" />
      <div class="gt-dots" aria-hidden="true"><i v-for="(s, n) in steps" :key="n" :class="{ on: n === i, past: n < i }" /></div>
      <div class="gt-acts">
        <button v-if="i > 0" class="btn small" type="button" @click="back">Back</button>
        <button class="btn primary small gt-next" type="button" data-test="guide-next" @click="next">
          {{ i === 0 ? 'Show me around' : last ? 'Start using Taskie' : 'Next' }}
        </button>
      </div>
    </div>
  </div>
</template>
