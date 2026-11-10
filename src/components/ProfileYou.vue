<script setup>
import { ref, computed } from 'vue';
import { push, enablePush, disablePush, testPush } from '../lib/push';
import { store } from '../lib/store';
import Icon from './Icon.vue';

// About you, for your digests and draft emails. Saved in your account as you
// type; never part of Taskie's code.
if (!store.me || typeof store.me !== 'object') store.me = {};
const me = store.me;

// Notifications on this device: reminders 10 minutes before timed items, a
// morning brief and deadlines the evening before, even with Taskie closed
// (Web Push). Browsers without push still get reminders while a tab is open.
const canNotify = typeof Notification !== 'undefined';
const remindNote = ref('');
const on = computed(() => (push.supported ? push.on : !!store.planner.remind));
async function toggleRemind() {
  remindNote.value = '';
  if (on.value) { if (push.supported) await disablePush(); store.planner.remind = false; return; }
  if (push.supported) { if (await enablePush()) store.planner.remind = true; return; }
  if (canNotify && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission().catch(() => 'denied');
    if (p !== 'granted') { remindNote.value = 'Notifications are blocked for this site in your browser settings.'; return; }
  }
  store.planner.remind = true;
}
</script>

<template>
  <section class="acct-sec t-b you" data-test="profile-you">
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="user" :size="12" /></span>About you</p><span class="muted small">Helps Taskie plan for you</span></div>
    <div class="you-grid">
      <label class="tk-f"><span>Name</span><input v-model="me.name" maxlength="60" autocomplete="name" data-test="you-name" /></label>
      <label class="tk-f"><span>School or work</span><input v-model="me.school" maxlength="80" placeholder="e.g. State University" /></label>
      <label class="tk-f"><span>What you study or do</span><input v-model="me.study" maxlength="80" placeholder="e.g. Electrical Engineering" data-test="you-study" /></label>
      <label class="tk-f"><span>Year or stage</span><input v-model="me.year" maxlength="40" placeholder="e.g. first-year" /></label>
      <label class="tk-f wide"><span>Where you are</span><input v-model="me.location" maxlength="60" placeholder="e.g. Boston" /></label>
      <label class="tk-f wide full"><span>A line about you</span><textarea v-model="me.about" rows="3" maxlength="400" placeholder="What you care about and what you are aiming for." /></label>
    </div>
  </section>
  <section class="acct-sec t-g" data-test="profile-remind">
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="bell" :size="12" /></span>Task reminders</p><span class="muted small">Laptop and phone</span></div>
    <div class="you-remind">
      <div>
        <b>Notifications on this device</b>
        <p class="muted small">10 minutes before anything with a time, a short brief at 8 AM and deadlines the evening before{{ push.supported ? ', even when Taskie is closed' : ', while a Taskie tab is open' }}. Turn it on for each laptop and phone.</p>
        <p v-if="!canNotify && !push.supported" class="muted small">This browser cannot show notifications. On iPhone or iPad, add Taskie to the Home Screen first (Share, Add to Home Screen).</p>
        <p v-if="remindNote || push.note" class="small" :class="push.on && !remindNote ? 'pln-ok' : 'pln-err'" role="status">{{ remindNote || push.note }}</p>
        <button v-if="push.on" type="button" class="btn small" data-test="push-test" @click="testPush"><Icon name="bell" :size="14" />Send a test</button>
      </div>
      <button type="button" class="you-switch" role="switch" :aria-checked="on" :disabled="push.busy" data-test="remind" @click="toggleRemind"><i /></button>
    </div>
  </section>
</template>
