<script setup>
import { ref } from 'vue';
import { store } from '../lib/store';
import Icon from './Icon.vue';

// About you, for your digests and draft emails. Saved in your account as you
// type; never part of Budgie's code.
if (!store.me || typeof store.me !== 'object') store.me = {};
const me = store.me;

// Task reminders on this device: a notification 10 minutes before timed items.
const canNotify = typeof Notification !== 'undefined';
const remindNote = ref('');
async function toggleRemind() {
  remindNote.value = '';
  if (!store.planner.remind && canNotify && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission().catch(() => 'denied');
    if (p !== 'granted') { remindNote.value = 'Notifications are blocked for this site in your browser settings.'; return; }
  }
  store.planner.remind = !store.planner.remind;
}
</script>

<template>
  <section class="acct-sec t-b you" data-test="profile-you">
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="user" :size="12" /></span>About you</p><span class="muted small">Helps Budgie plan for you</span></div>
    <div class="you-grid">
      <label class="tk-f"><span>Name</span><input v-model="me.name" maxlength="60" autocomplete="name" data-test="you-name" /></label>
      <label class="tk-f"><span>School or work</span><input v-model="me.school" maxlength="80" placeholder="e.g. State University" /></label>
      <label class="tk-f"><span>What you study or do</span><input v-model="me.study" maxlength="80" placeholder="e.g. Electrical Engineering" data-test="you-study" /></label>
      <label class="tk-f"><span>Year or stage</span><input v-model="me.year" maxlength="40" placeholder="e.g. first-year" /></label>
      <label class="tk-f wide"><span>Where you are</span><input v-model="me.location" maxlength="60" placeholder="e.g. Boston" /></label>
      <label class="tk-f wide"><span>A line about you</span><textarea v-model="me.about" rows="3" maxlength="400" placeholder="What you care about and what you are aiming for." /></label>
    </div>
  </section>
  <section class="acct-sec t-g" data-test="profile-remind">
    <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true"><Icon name="bell" :size="12" /></span>Task reminders</p><span class="muted small">On this device</span></div>
    <div class="you-remind">
      <div>
        <b>Remind me before timed items</b>
        <p class="muted small">A notification 10 minutes before anything with a time, while a Budgie tab is open.</p>
        <p v-if="!canNotify" class="muted small">This browser cannot show notifications.</p>
        <p v-if="remindNote" class="small pln-err" role="alert">{{ remindNote }}</p>
      </div>
      <button v-if="canNotify" type="button" class="you-switch" role="switch" :aria-checked="!!store.planner.remind" data-test="remind" @click="toggleRemind"><i /></button>
    </div>
  </section>
</template>
