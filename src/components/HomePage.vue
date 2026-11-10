<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import SignIn from './SignIn.vue';

// Taskie's home page for anyone not signed in: one dark section on one screen.
// A four-column grid drawn in hairlines, a soft glow, a huge thin headline,
// the kinds of things Taskie sorts as a big list, mono labels, a strip of
// facts, and the sign-in card right there.
const KINDS = ['Assignments', 'Exams', 'Routines', 'Goals'];
const k = ref(0);
let t = null;
onMounted(() => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) t = setInterval(() => { k.value = (k.value + 1) % KINDS.length; }, 1800); });
onUnmounted(() => clearInterval(t));
const toSignIn = () => document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
const FACTS = [
  ['Nova-3', 'Deepgram hears the whole recording in about a second.'],
  ['Gemini', 'Fixes names, courses and dates from your own planner.'],
  ['8:00 AM', 'A brief on your phone, reminders ten minutes before.'],
  ['0 kept', 'Recordings are heard once and never stored.'],
];
</script>

<template>
  <div class="hp3" data-test="home">
    <div class="hp3-glow" aria-hidden="true"><i /><i /><i /><i /></div>
    <div class="hp3-lines" aria-hidden="true"><i /><i /><i /></div>

    <header class="hp3-top">
      <span class="hp3-logo"><svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true"><path d="M14 34 27 47 51 19" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" /><circle cx="52" cy="48" r="5" fill="#a78bfa" /></svg>taskie</span>
      <ul class="hp3-kinds" aria-label="What Taskie sorts">
        <li v-for="(x, i) in KINDS" :key="x" :class="{ on: i === k }">{{ x }}</li>
      </ul>
      <button type="button" class="hp3-menu" @click="toSignIn">Sign in<span aria-hidden="true" /></button>
    </header>

    <section class="hp3-hero">
      <div class="hp3-copy">
        <p class="hp3-mono">//2026 · A planner you talk to</p>
        <h1>Say it.<br />Taskie plans it.</h1>
        <p class="hp3-sub">Tell Taskie everything on your mind in one go. It hears you, fixes what it misheard from your own courses and names, and turns it into a clean week.</p>
        <button type="button" class="hp3-cta" @click="toSignIn"><span class="hp3-cta-ico" aria-hidden="true"><i /><i /></span>Start planning</button>
      </div>
      <div id="signin" class="hp3-signin"><SignIn embedded /></div>
    </section>

    <footer class="hp3-facts">
      <div v-for="f in FACTS" :key="f[0]" class="hp3-fact"><b>{{ f[0] }}</b><span>{{ f[1] }}</span><i aria-hidden="true" /></div>
    </footer>
  </div>
</template>
