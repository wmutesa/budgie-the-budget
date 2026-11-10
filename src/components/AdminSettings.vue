<script setup>
import { ref, computed, onMounted } from 'vue';
import Icon from './Icon.vue';
import QrCode from './QrCode.vue';
import RecoveryCodes from './RecoveryCodes.vue';
import GeminiKey from './GeminiKey.vue';
import { toast } from '../lib/toast';
import { push, enablePush, disablePush, testPush } from '../lib/push';
import { store } from '../lib/store';
import { account, listPasskeys, removePasskey, deviceLink, recoveryStatus, newRecoveryCodes, signOutEverywhere } from '../lib/account';

// Settings in the Admin view, laid out like the other Admin pages: what the
// owner needs to run Taskie. Devices, recovery codes, AI, notifications and
// sessions. People are managed on the People page.
const passkeys = ref([]);
const codesLeft = ref(null);
const freshCodes = ref(null);
const link = ref('');
const copied = ref(false);
const busy = ref(false);
const date = t => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');
async function act(fn) { busy.value = true; try { await fn(); } catch (e) { toast(e.message || 'That did not work.', { kind: 'error' }); } finally { busy.value = false; } }
const load = () => act(async () => { const [pk, rc] = await Promise.all([listPasskeys(), recoveryStatus()]); passkeys.value = pk.passkeys; codesLeft.value = rc.left; });
onMounted(load);
const addDevice = () => act(async () => { link.value = (await deviceLink()).link; });
const dropPasskey = p => act(async () => { if (!confirm(`Remove the passkey "${p.label}"? That device will not be able to sign in.`)) return; await removePasskey(p.id); await load(); });
const makeCodes = () => act(async () => {
  if (codesLeft.value > 0 && !confirm('Make new recovery codes? Your current codes will stop working.')) return;
  freshCodes.value = (await newRecoveryCodes()).recoveryCodes; codesLeft.value = freshCodes.value.length;
});
async function copy() { try { await navigator.clipboard.writeText(link.value); copied.value = true; setTimeout(() => (copied.value = false), 1500); } catch { /* select it by hand */ } }
const notifyOn = computed(() => (push.supported ? push.on : !!store.planner.remind));
async function toggleNotify() {
  if (notifyOn.value) { if (push.supported) await disablePush(); store.planner.remind = false; return; }
  if (push.supported) { if (await enablePush()) store.planner.remind = true; }
}
const leaveEverywhere = () => act(async () => { if (!confirm('Sign out on every device, including this one? You will need your passkey to sign in again.')) return; await signOutEverywhere(); });
</script>

<template>
  <div class="adm adm-set" data-test="settings-page">
    <header class="adm-head">
      <div>
        <h1>Settings</h1>
        <p class="muted">Your devices, recovery codes, AI and notifications. People are on the People page.</p>
      </div>
    </header>

    <div class="adm-two">
      <section class="adm-card" data-test="admin-devices">
        <div class="adm-card-head"><div><h2>Your devices</h2><p class="adm-note">Passkeys that can sign in as {{ account.user?.name }}</p></div><button type="button" class="adm-btn dark" :disabled="busy" data-test="add-device" @click="addDevice"><Icon name="plus" :size="14" />Add a device</button></div>
        <div v-if="link" class="adm-linkbox">
          <p class="adm-note">Open this on your other device within 24 hours to add it.</p>
          <div class="adm-linkrow"><input class="adm-input" :value="link" readonly aria-label="Link" @focus="e => e.target.select()" /><button type="button" class="adm-btn" @click="copy"><Icon name="copy" :size="14" />{{ copied ? 'Copied' : 'Copy' }}</button></div>
          <QrCode :text="link" :size="110" />
        </div>
        <ul class="adm-rows">
          <li v-for="p in passkeys" :key="p.id">
            <span class="adm-av"><Icon name="shield" :size="14" /></span>
            <span><b>{{ p.label || 'Passkey' }}</b><span class="adm-note">Added {{ date(p.created_at) }} · last used {{ date(p.last_used_at) }}</span></span>
            <button v-if="passkeys.length > 1" type="button" class="adm-btn" :disabled="busy" @click="dropPasskey(p)"><Icon name="trash" :size="14" />Remove</button>
          </li>
        </ul>
      </section>

      <section class="adm-card" data-test="admin-codes">
        <div class="adm-card-head"><div><h2>Recovery codes</h2><p class="adm-note">A spare key if every device is lost</p></div><button type="button" class="adm-btn" :disabled="busy" data-test="new-codes" @click="makeCodes"><Icon name="sparkle" :size="14" />{{ codesLeft ? 'Make new codes' : 'Make codes' }}</button></div>
        <p class="adm-big" :class="{ warn: codesLeft !== null && codesLeft < 3 }" data-test="codes-left">{{ codesLeft ?? '–' }}<span class="adm-note"> unused {{ codesLeft === 1 ? 'code' : 'codes' }} left</span></p>
        <RecoveryCodes v-if="freshCodes" :codes="freshCodes" :name="account.user?.name" :confirm="false" />
      </section>
    </div>

    <section class="adm-card adm-ai"><GeminiKey /></section>

    <div class="adm-two">
      <section class="adm-card" data-test="admin-notify">
        <div class="adm-card-head"><div><h2>Notifications on this device</h2><p class="adm-note">Reminders, the 8 AM brief and deadlines, even with Taskie closed</p></div><button type="button" class="you-switch" role="switch" :aria-checked="notifyOn" :disabled="push.busy" aria-label="Notifications on this device" @click="toggleNotify"><i /></button></div>
        <p v-if="push.note" class="adm-note">{{ push.note }}</p>
        <button v-if="push.on" type="button" class="adm-btn" @click="testPush"><Icon name="bell" :size="14" />Send a test</button>
      </section>
      <section class="adm-card" data-test="admin-sessions">
        <div class="adm-card-head"><div><h2>Sessions</h2><p class="adm-note">Lost a device? Sign out everywhere, then sign back in with your passkey</p></div><button type="button" class="adm-btn danger" :disabled="busy" @click="leaveEverywhere"><Icon name="logout" :size="14" />Sign out everywhere</button></div>
      </section>
    </div>
  </div>
</template>
