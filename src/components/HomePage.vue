<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import SignIn from './SignIn.vue';
import Icon from './Icon.vue';

// Taskie's home page, for anyone not signed in: what it is, how it works, and
// the sign-in card right in the first screen (invite-only, passkeys).
const said = [
  ['“Essay due Friday at 5 for English”', 'Assignment', 'Fri · 5 PM', '#a78bfa'],
  ['“Gym Monday, Wednesday and Friday at 6”', 'Routine', 'Mon Wed Fri', '#34d399'],
  ['“Call grandma tomorrow”', 'Task', 'Tomorrow', '#f9a8d4'],
  ['“I want to run a 10K by March”', 'Goal', '5 milestones', '#fcd34d'],
  ['“Chem quiz on the 18th”', 'Exam', 'Wed 18', '#93c5fd'],
];
const i = ref(0);
let t = null;
onMounted(() => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) t = setInterval(() => { i.value = (i.value + 1) % said.length; }, 2600); });
onUnmounted(() => clearInterval(t));
const go = id => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
const FEATURES = [
  ['mic', 'Say it all at once', 'One long ramble, thirty things. Taskie writes it down live and splits it into tasks, assignments, routines, events and goals.'],
  ['calendar', 'Lands in your week', 'Every item finds its day and time. Bring Canvas, Google, Apple or Outlook, plus holidays from 80 countries.'],
  ['timer', 'Lock In', 'Tap the timer on anything and the world goes quiet: a chunky little timer, and nothing else on screen.'],
  ['trend', 'See how it went', 'What got done, when you are sharpest, and where your time actually went. No guilt, just numbers.'],
  ['split', 'Break it down', 'Big scary thing? One tap turns it into steps. Tap again for smaller steps. Repeat until it is not scary.'],
  ['shield', 'Private by design', 'Passkeys instead of passwords. Your words are never kept. Invite-only, so it stays yours.'],
];
</script>

<template>
  <div class="hp" data-test="home">
    <div class="hp-glow" aria-hidden="true"><i /><i /><i /></div>
    <header class="hp-nav">
      <span class="hp-logo"><svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true"><defs><linearGradient id="hp-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa" /><stop offset="1" stop-color="#6d28d9" /></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#hp-g)" /><path d="M17 33.5 27.5 44 47.5 21" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" /><circle cx="49" cy="46" r="4.5" fill="#fde68a" /></svg>TASKIE</span>
      <nav class="hp-links" aria-label="Home page">
        <button type="button" @click="go('how')">How it works</button>
        <button type="button" @click="go('features')">Features</button>
        <button type="button" @click="go('privacy')">Privacy</button>
      </nav>
      <button type="button" class="hp-cta-sm" @click="go('signin')">Sign in</button>
    </header>

    <section class="hp-hero">
      <div class="hp-copy">
        <p class="hp-kicker">Your planner, out loud</p>
        <h1>Say it.<br /><span>Taskie sorts it.</span></h1>
        <p class="hp-lead">Tell Taskie everything on your mind in one go. It writes it down as you speak, splits it into the right things, and puts each one in its place, so your head can get back to the interesting stuff.</p>
        <div class="hp-demo" aria-live="polite">
          <p class="hp-said">{{ said[i][0] }}</p>
          <p class="hp-became"><Icon name="right" :size="14" /><b :style="{ '--c': said[i][3] }">{{ said[i][1] }}</b><span>{{ said[i][2] }}</span></p>
        </div>
        <div class="hp-acts">
          <button type="button" class="hp-cta" @click="go('signin')">Get started<Icon name="right" :size="16" /></button>
          <button type="button" class="hp-ghost" @click="go('how')">See how it works</button>
        </div>
      </div>
      <div id="signin" class="hp-card"><SignIn embedded /></div>
    </section>

    <section id="how" class="hp-sec">
      <p class="hp-kicker">How it works</p>
      <h2>Three steps. One of them is talking.</h2>
      <ol class="hp-steps">
        <li><b>1</b><h3>Talk</h3><p>Tap Add and ramble. Words appear as you speak, in your accent, with your names spelled right.</p></li>
        <li><b>2</b><h3>Check</h3><p>Taskie shows each thing where it landed. Keep it, switch it, or bin it. Nonsense never makes it in.</p></li>
        <li><b>3</b><h3>Do</h3><p>Your day, week and month, sorted by subject. Lock In on the next thing and get it done.</p></li>
      </ol>
    </section>

    <section id="features" class="hp-sec">
      <p class="hp-kicker">Features</p>
      <h2>Small app. Serious about your time.</h2>
      <div class="hp-grid">
        <article v-for="[ic, title, body] in FEATURES" :key="title" class="hp-feat"><span class="hp-ic"><Icon :name="ic" :size="18" /></span><h3>{{ title }}</h3><p>{{ body }}</p></article>
      </div>
    </section>

    <section id="privacy" class="hp-sec hp-priv">
      <div>
        <p class="hp-kicker">Privacy</p>
        <h2>Yours. Not ours.</h2>
      </div>
      <ul>
        <li><Icon name="shield" :size="16" />Sign in with a passkey: your fingerprint, face or device PIN. No password to leak.</li>
        <li><Icon name="mic" :size="16" />What you say is written down and the audio is not kept.</li>
        <li><Icon name="download" :size="16" />Download everything, any time. Delete your account, any time.</li>
      </ul>
    </section>

    <footer class="hp-foot">
      <span>TASKIE</span>
      <span class="muted">Invite-only. Made for students with too many tabs open.</span>
      <button type="button" class="hp-ghost" @click="go('signin')">Sign in</button>
    </footer>
  </div>
</template>
