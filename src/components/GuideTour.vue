<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { account } from '../lib/account';
import PasskeyNote from './PasskeyNote.vue';

// A first-run guide: a welcome note, then one step per part of the app with
// the part highlighted. Shown once per person; the account menu can replay it.
const props = defineProps({ page: { type: String, required: true } });
const emit = defineEmits(['page', 'done']);

const steps = [
  { title: `Welcome to Budgie${account.user?.name ? `, ${account.user.name.split(' ')[0]}` : ''}`,
    body: 'Budgie plans your days, keeps your goals moving and writes you a twice-weekly digest of opportunities. This quick tour shows where everything is. It takes about a minute.',
    note: 'Budgie starts empty: everything comes from what you add. The quickest start is to say a few things out loud with the microphone at the top.' },
  { page: 'Today', target: '.nb-pages', title: 'Four pages',
    body: 'Today is your day at a glance. Planner holds tasks, classes and deadlines in lists, a calendar and focus mode. Digests is your brief of opportunities and news. Playground is where you add anything and shape goals, routines and projects.' },
  { page: 'Today', target: '#today', title: 'Your day in a sentence',
    body: 'Budgie writes what is on today, what is next, deadlines this week and your streaks. It updates as you tick things off.' },
  { page: 'Playground', target: '#inbox', title: 'Add anything',
    body: 'Write or say one thing per line, like "Essay due Fri 5pm", "gym MWF 6pm" or "I want to run a 10K by March". Budgie sorts tasks, routines and goals and puts them where they belong.' },
  { page: 'Playground', target: '#goals', title: 'Goals with milestones',
    body: 'Each goal is broken into milestones on your calendar, by the AI on your device or by Budgie\'s rules. Ticking them moves the goal forward.' },
  { page: 'Planner', target: '[data-test="planner"]', title: 'Plan your days',
    body: 'Tasks, an agenda, a calendar like the ones you know, and focus mode with a timer. Import your Canvas, Google, Apple or Outlook calendar and it stays up to date.' },
  { page: 'Digests', target: '[data-test="digests"]', title: 'Your digest',
    body: 'Tell Budgie what you study and what you are looking for. Every Monday and Thursday it writes a short brief from free sources: what to apply for, what is due, and draft emails you can copy.' },
  { target: '[data-test="voice"]', title: 'Say it from anywhere',
    body: 'Tap the microphone and say several things at once. Budgie splits them and adds each one, with Undo.' },
  { target: '[data-test="account"]', title: 'Keep your passkey safe', passkeys: true,
    body: 'You sign in with a passkey instead of a password. Read how it works and the few things that can go wrong. You can find this note again in the account menu.' },
  { target: '[data-test="account"]', title: 'Your account',
    body: 'Your data syncs to your account and follows you to every device. Open this menu to add a device, change your colour, take this tour again or sign out.' },
  { title: 'You are all set',
    body: 'Start by adding what is on your mind today. Budgie learns your routine as you go.',
    note: 'Tip: you can reopen this guide any time from the account menu.' },
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
          {{ i === 0 ? 'Show me around' : last ? 'Start using Budgie' : 'Next' }}
        </button>
      </div>
    </div>
  </div>
</template>
