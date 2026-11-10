<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import SignIn from './SignIn.vue';
import Icon from './Icon.vue';

// Taskie's home page for anyone not signed in: one section, one screen. What it
// does, a live example of what was heard and what it became, and sign in.
// Clean and technical: mono labels, square cards, fully rounded buttons.
const DEMOS = [
  { heard: 'lab report three for kem due friday at five', fixed: 'Lab Report 3 for Chem due Friday at 5', swap: ['kem', 'Chem'], items: [['Lab Report 3', 'Assignment', 'Fri · 5:00 PM', '#7c3aed'], ['Chemistry', 'Course', '#Chem', '#a78bfa']] },
  { heard: 'jim monday wednesday friday at six and call grandma tomorrow', fixed: 'Gym Monday, Wednesday, Friday at 6 and call Grandma tomorrow', swap: ['jim', 'Gym'], items: [['Gym', 'Routine', 'Mon Wed Fri · 6:00 PM', '#059669'], ['Call Grandma', 'Task', 'Tomorrow', '#db2777']] },
  { heard: 'i want to run a 10 k by march and the psych midterm is on the 18th', fixed: 'I want to run a 10K by March, and the Psych midterm is on the 18th', swap: ['10 k', '10K'], items: [['Run A 10K', 'Goal', '5 milestones', '#d97706'], ['Psychology Midterm', 'Exam', 'Wed 18', '#2563eb']] },
];
const n = ref(0);
let t = null;
onMounted(() => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) t = setInterval(() => { n.value = (n.value + 1) % DEMOS.length; }, 4200); });
onUnmounted(() => clearInterval(t));
const go = id => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

</script>

<template>
  <div class="hp2" data-test="home">
    <header class="hp2-nav">
      <span class="hp2-logo"><svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#18181b" /><path d="M17 33.5 27.5 44 47.5 21" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" /><circle cx="49" cy="46" r="4.5" fill="#a78bfa" /></svg>TASKIE</span>
      <button type="button" class="hp2-btn dark small hp2-nav-cta" @click="go('signin')">Sign in</button>
    </header>

    <section class="hp2-hero">
      <div class="hp2-copy">
        <p class="hp2-tag"><span class="hp2-dot" />A planner you talk to</p>
        <h1>Say everything.<br /><span>Get a plan.</span></h1>
        <p class="hp2-lead">Taskie turns one long ramble into a clean week: every assignment, exam, errand and goal, with the right name, day and time. Built for students who have too much on their mind.</p>
        <div class="hp2-acts">
          <button type="button" class="hp2-btn dark" @click="go('signin')">Get started<Icon name="right" :size="16" /></button>
        </div>
        <p class="hp2-stack"><span>Deepgram Nova-3</span><span>Gemini 2.5 Flash</span><span>Cloudflare</span><span>Passkeys</span></p>
      </div>

      <!-- A live-looking example: what was heard, what it became -->
      <div class="hp2-demo" aria-live="polite">
        <div class="hp2-demo-bar"><span><i /><i /><i /></span><b>Add</b><em>0:{{ String(8 + n * 5).padStart(2, '0') }}</em></div>
        <div class="hp2-demo-body">
          <p class="hp2-label">Heard</p>
          <p class="hp2-heard">“{{ DEMOS[n].heard }}”</p>
          <p class="hp2-label">Understood</p>
          <p class="hp2-fixed">{{ DEMOS[n].fixed.split(DEMOS[n].swap[1])[0] }}<mark>{{ DEMOS[n].swap[1] }}</mark>{{ DEMOS[n].fixed.split(DEMOS[n].swap[1]).slice(1).join(DEMOS[n].swap[1]) }}</p>
          <ul class="hp2-items">
            <li v-for="it in DEMOS[n].items" :key="it[0]" :style="{ '--c': it[3] }"><b>{{ it[0] }}</b><span class="hp2-kind">{{ it[1] }}</span><span class="hp2-when">{{ it[2] }}</span></li>
          </ul>
        </div>
        <div class="hp2-dots" role="tablist" aria-label="Examples"><button v-for="(d, k) in DEMOS" :key="k" type="button" :class="{ on: k === n }" :aria-label="`Example ${k + 1}`" @click="n = k" /></div>
      </div>
      <div id="signin" class="hp2-card hp2-signin"><SignIn embedded /></div>
    </section>

    <footer class="hp2-foot"><span>TASKIE</span><span>Say it. Taskie sorts it.</span><span>© {{ new Date().getFullYear() }}</span></footer>
  </div>
</template>
