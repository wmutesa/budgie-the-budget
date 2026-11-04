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
    body: 'Budgie keeps track of your spending, subscriptions, savings and goals, with live exchange rates. This quick tour shows where everything is. It takes about a minute.',
    note: 'Budgie starts empty: every number comes from what you add. Start with one thing you spent today, your account balances, or a bank statement.' },
  { page: 'Overview', target: '.nb-pages', title: 'Four pages',
    body: 'Overview is your month at a glance. Transactions is where you add spending. Markets has investment news and savings ideas. Playground turns rough notes into a plan.' },
  { page: 'Overview', target: '#overview', title: 'Your month in a sentence',
    body: 'Budgie writes a short brief of your month: what you hold, what you spent and how your plan is going. It updates as you add things.' },
  { page: 'Overview', target: '#subscriptions', title: 'Subscriptions',
    body: 'Every subscription, its cost per month in your currency and when it renews. Use + Subscription in the top bar to search for any company.' },
  { page: 'Transactions', target: '#capture', title: 'Add spending your way',
    body: 'Type a sentence like "12.50 lunch at Chipotle yesterday", tap the mic and say it, or upload a receipt photo, PDF or bank statement. Budgie fills in the details.' },
  { page: 'Transactions', target: '#budgets', title: 'Check it, then keep it',
    body: 'New entries wait in a review list so you can fix anything first. Monthly budgets here fill up as spending comes in.' },
  { page: 'Markets', target: '#markets', title: 'Markets and news',
    body: 'Market prices and investment headlines from Yahoo Finance, with savings ideas for your banks. Budgie also leaves short notes next to each section and suggestions in the corner as you go.' },
  { page: 'Playground', target: '.scratch', title: 'Think out loud',
    body: 'Write or say your plans as messily as you like, such as "rent 1200, netflix, saving for a laptop by June". Budgie sorts them into needs, wants, savings and goals.' },
  { target: '[data-test="account"]', title: 'Keep your passkey safe', passkeys: true,
    body: 'You sign in with a passkey instead of a password. Read how it works and the few things that can go wrong. You can find this note again in the account menu.' },
  { target: '[data-test="account"]', title: 'Your account',
    body: 'Your data syncs to your account and follows you to every device. Open this menu to add a device, see sync status, take this tour again or sign out.' },
  { title: 'You are all set',
    body: 'Start by adding one thing you spent today. Budgie learns your categories as you go.',
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
