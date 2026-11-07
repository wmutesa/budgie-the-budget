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
    body: 'Budgie plans your days, and keeps your goals moving. This quick tour shows where everything is. It takes about a minute.',
    note: 'Budgie starts empty: everything comes from what you add. The quickest start is to tap Add and say a few things out loud.' },
  { page: 'Overview', target: '.nb-pages', title: 'Four pages',
    body: 'Overview is your day at a glance. Planner holds your schedule by day, week and month, and your tasks. Focus shows what matters now, with a timer. Reports shows what got done and where your time went.' },
  { page: 'Overview', target: '#today', title: 'Your day in a sentence',
    body: 'Budgie writes what is on today, what is next, deadlines this week and your streaks. It updates as you tick things off.' },
  { page: 'Overview', target: '[data-test="capture"]', title: 'Add anything',
    body: 'Tap Add and just talk: "essay due Friday at 5, gym Monday Wednesday Friday at 6, and I want to run a 10K by March". Budgie sorts each thing into a task, routine or goal and puts it in place.' },
  { page: 'Planner', target: '[data-test="planner"]', title: 'Plan your days',
    body: 'Tasks, an agenda and a calendar like the ones you know. Import your Canvas, Google, Apple or Outlook calendar and it stays up to date.' },
  { page: 'Planner', target: '[data-test="schedule"]', title: 'Check before it counts',
    body: 'After you add, Budgie shows each new thing where it landed, highlighted. Keep it, switch it to a task, routine or goal, rename it or remove it.' },
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
