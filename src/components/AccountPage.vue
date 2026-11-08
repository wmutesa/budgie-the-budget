<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import AvatarPicker from './AvatarPicker.vue';
import Icon from './Icon.vue';
import PasskeyNote from './PasskeyNote.vue';
import QrCode from './QrCode.vue';
import RecoveryCodes from './RecoveryCodes.vue';
import AIPanel from './AIPanel.vue';
import ProfileYou from './ProfileYou.vue';
import DigestSettings from './DigestSettings.vue';
import GeminiKey from './GeminiKey.vue';
import PlanCalendars from './PlanCalendars.vue';
import { toast } from '../lib/toast';
import { snapshot } from '../lib/store';
import { addSample, removeSample, hasSample } from '../lib/sample';
import { DIGESTS_LIVE } from '../lib/digest';
import { nav } from '../lib/nav';
import {
  account, signOutEverywhere, deleteMyAccount, listPasskeys, removePasskey, deviceLink, recoveryStatus, newRecoveryCodes,
  listPeople, invitePerson, cancelInvite, removePerson,
} from '../lib/account';

// Settings and Privacy, each a page of its own, opened from the avatar menu.
// Square everywhere; only your avatar is round.
const props = defineProps({ kind: { type: String, default: 'settings' } });
const emit = defineEmits(['tour']);

const isOwner = computed(() => account.user?.role === 'owner');
const SETTINGS = computed(() => [
  ['profile', 'Profile', 'user', 'Who you are, so Taskie plans like it knows you. Because it does.'],
  ['digests', DIGESTS_LIVE ? 'Digests & AI' : 'AI', 'sparkle', 'The brains of the operation. Pick how much thinking happens on your device.'],
  ['calendars', 'Calendars', 'calendar', 'Every calendar you brought along, in one tidy drawer.'],
  ['security', 'Devices & security', 'shield', 'Passkeys, devices and a spare key under the mat (recovery codes).'],
  ...(isOwner.value ? [['people', 'People', 'list', 'Who else gets to use your Taskie.']] : []),
]);
const PRIVACY = [
  ['data', 'Your data', 'download', 'It is yours. Take a copy, fill it with samples, or clear them out.'],
  ['sessions', 'Sessions', 'logout', 'Everywhere you are signed in, and the big red button for all of them.'],
  ['delete', 'Delete account', 'trash', 'The nuclear option. We will miss you, quietly.'],
];
// In the Admin view, Settings shows only what is about running Taskie: people and devices.
const adminView = computed(() => nav.mode === 'admin' && isOwner.value);
// One Settings page: your settings, then privacy (your data, sessions, deleting the account).
const tabs = computed(() => (adminView.value ? SETTINGS.value.filter(t => ['people', 'security'].includes(t[0])) : [...SETTINGS.value, ...PRIVACY]));
watch(tabs, t => { if (!t.some(x => x[0] === tab.value)) tab.value = t[0][0]; });
const tab = ref(nav.anchor === '#calendars' ? 'calendars' : props.kind === 'privacy' ? 'data' : tabs.value[0][0]);
watch(() => props.kind, k => { tab.value = k === 'privacy' ? 'data' : tabs.value[0][0]; });
watch(() => nav.anchor, a => { if (a === '#calendars' && props.kind === 'settings') tab.value = 'calendars'; });
const current = computed(() => tabs.value.find(t => t[0] === tab.value) || tabs.value[0]);

const sampleOn = computed(() => hasSample());
function loadSample() { const t0 = performance.now(); const r = addSample(); toast(`${r.tasks} items and ${r.goals} goals added in ${Math.round(performance.now() - t0)} ms.`, { kind: 'success', title: 'Sample data' }); }
function clearSample() { const n = removeSample(); toast(`${n} sample items removed.`, { kind: 'success', title: 'Sample data' }); }

const passkeys = ref([]);
const codesLeft = ref(null);
const freshCodes = ref(null);
const people = ref([]);
const invites = ref([]);
const inviteName = ref('');
const link = ref(null);
const copied = ref(false);
const error = ref('');
const busy = ref(false);
watch(error, e => { if (e) toast(e, { kind: 'error' }); });

const initial = computed(() => (account.user?.name || '?').trim()[0]?.toUpperCase() || '?');
const syncText = computed(() => ({
  saving: 'Saving…',
  saved: account.syncedAt ? `Synced ${new Date(account.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Synced',
  offline: 'Offline · saved on this device',
  error: 'Not synced',
  idle: '',
}[account.sync]));
const date = t => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');

let loadSeq = 0;
async function load() {
  error.value = '';
  const seq = ++loadSeq;
  try {
    const [pk, rc, pp] = await Promise.all([listPasskeys(), recoveryStatus(), isOwner.value ? listPeople() : null]);
    if (seq !== loadSeq) return;
    passkeys.value = pk.passkeys;
    codesLeft.value = rc.left;
    if (pp) ({ people: people.value, invites: invites.value } = pp);
  } catch (e) { if (seq === loadSeq) error.value = e.message; }
}
watch(() => props.kind, load, { immediate: true });
// Fresh each time a tab opens: someone may have joined, or a device been added, since.
watch(tab, load);
if (typeof window !== 'undefined') { const again = () => load(); window.addEventListener('budgie:account-page', again); onUnmounted(() => window.removeEventListener('budgie:account-page', again)); }

async function act(fn) {
  busy.value = true;
  error.value = '';
  try { await fn(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
const makeDeviceLink = () => act(async () => { const r = await deviceLink(); link.value = { kind: 'device', label: 'Open this on your other device within 24 hours to add it', url: r.link }; });
const sendInvite = () => act(async () => {
  if (!inviteName.value.trim()) return;
  const r = await invitePerson(inviteName.value.trim());
  link.value = { kind: 'invite', label: `Send this to ${inviteName.value.trim()}. It works once and expires in ${r.expiresInDays} days`, url: r.link };
  inviteName.value = '';
  await load();
});
const makeCodes = () => act(async () => {
  if (codesLeft.value > 0 && !confirm('Make new recovery codes? Your current codes will stop working.')) return;
  freshCodes.value = (await newRecoveryCodes()).recoveryCodes;
  codesLeft.value = freshCodes.value.length;
});
const dropInvite = id => act(async () => { await cancelInvite(id); await load(); });
const dropPasskey = p => act(async () => { if (!confirm(`Remove the passkey "${p.label}"? That device will not be able to sign in.`)) return; await removePasskey(p.id); await load(); });
const dropPerson = p => act(async () => { if (!confirm(`Remove ${p.name}? Their account and all of their Taskie data will be deleted. This cannot be undone.`)) return; await removePerson(p.id); await load(); });
async function copy() { try { await navigator.clipboard.writeText(link.value.url); copied.value = true; setTimeout(() => (copied.value = false), 1500); } catch { /* select it by hand */ } }
function downloadData() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Taskie', user: account.user?.name, data: snapshot() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `taskie-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const leaveEverywhere = () => act(async () => { if (!confirm('Sign out on every device, including this one? You will need your passkey to sign in again.')) return; await signOutEverywhere(); });
const removeMe = () => act(async () => { const typed = prompt('This deletes your Taskie account and all of your data for good. Type DELETE to confirm.'); if (typed !== 'DELETE') return; await deleteMyAccount(); });
</script>

<template>
  <div class="set span-12" :data-kind="kind" :data-test="kind === 'privacy' ? 'privacy-page' : 'settings-page'">
    <aside class="set-rail">
      <div class="set-who">
        <AvatarPicker :initial="initial" :name="account.user?.name" />
        <div>
          <p class="set-name">{{ account.user?.name }}</p>
          <p class="set-sync small" :class="account.sync"><span class="set-role">{{ isOwner ? 'Owner' : 'Member' }}</span>{{ syncText }}</p>
        </div>
      </div>
      <nav class="set-nav" :aria-label="kind === 'privacy' ? 'Privacy' : 'Settings'">
        <p class="set-kicker">Settings</p>
        <template v-for="[id, label, ic] in tabs" :key="id">
        <p v-if="id === 'data'" class="set-kicker set-kicker-2">Privacy</p>
        <button type="button" :class="{ on: tab === id }" :aria-current="tab === id ? 'page' : undefined" :data-test="`acct-tab-${id}`" @click="tab = id"><Icon :name="ic" :size="16" />{{ label }}</button>
        </template>
      </nav>
    </aside>

    <div class="set-page" :data-page="tab">
      <header class="set-head">
        <h1>{{ current[1] }}</h1>
        <p class="muted">{{ current[3] }}</p>
      </header>

      <template v-if="tab === 'profile'"><ProfileYou /></template>

      <template v-else-if="tab === 'digests'">
        <GeminiKey />
        <DigestSettings v-if="DIGESTS_LIVE" />
        <AIPanel />
      </template>

      <template v-else-if="tab === 'calendars'"><PlanCalendars show="both" /></template>

      <template v-else-if="tab === 'security'">
        <section class="set-sec">
          <div class="set-sec-head acct-sec-head"><h2>Your devices</h2><button class="btn small" :disabled="busy" @click="makeDeviceLink"><Icon name="plus" :size="14" />Add a device</button></div>
          <div v-if="link?.kind === 'device'" class="set-link acct-link">
            <p class="small">{{ link.label }}</p>
            <div class="set-link-row"><input class="field" :value="link.url" readonly aria-label="Link" @focus="e => e.target.select()" /><button class="btn primary small" type="button" @click="copy"><Icon name="copy" :size="14" />{{ copied ? 'Copied' : 'Copy' }}</button></div>
            <div class="set-qr acct-qr"><QrCode :text="link.url" :size="110" /><p class="small muted">Or scan it with the other device's camera.</p></div>
          </div>
          <ul class="set-list acct-list">
            <li v-for="p in passkeys" :key="p.id">
              <span>{{ p.label || 'Passkey' }}</span>
              <span class="muted small">Added {{ date(p.created_at) }} · last used {{ date(p.last_used_at) }}</span>
              <button v-if="passkeys.length > 1" class="btn small" :disabled="busy" @click="dropPasskey(p)"><Icon name="trash" :size="14" />Remove</button>
            </li>
          </ul>
        </section>
        <section class="set-sec">
          <div class="set-sec-head acct-sec-head"><h2>Recovery codes</h2><button class="btn small" :disabled="busy" data-test="new-codes" @click="makeCodes"><Icon name="sparkle" :size="14" />{{ codesLeft ? 'Make new codes' : 'Make codes' }}</button></div>
          <p class="small" :class="{ 'set-warn': codesLeft !== null && codesLeft < 3 }" data-test="codes-left">
            {{ codesLeft === null ? '' : codesLeft === 0 ? 'No recovery codes. That is fine if your passkey syncs with iCloud or Google, or you have added a second device. Otherwise, make some.' : `${codesLeft} unused ${codesLeft === 1 ? 'code' : 'codes'} left.` }}
          </p>
          <RecoveryCodes v-if="freshCodes" :codes="freshCodes" :name="account.user?.name" :confirm="false" />
        </section>
        <PasskeyNote :owner="isOwner" />
      </template>

      <template v-else-if="tab === 'people'">
        <section class="set-sec">
          <div class="set-sec-head acct-sec-head"><h2>People</h2><span class="muted small">{{ people.length }} with access</span></div>
          <ul class="set-list acct-list">
            <li v-for="p in people" :key="p.id">
              <span>{{ p.name }}<span v-if="p.id === account.user.id" class="muted small"> · you</span></span>
              <span class="muted small">{{ p.role === 'owner' ? 'Owner' : 'Member' }} · last seen {{ date(p.last_seen) }}</span>
              <button v-if="p.role !== 'owner'" class="btn small" :disabled="busy" @click="dropPerson(p)"><Icon name="trash" :size="14" />Remove</button>
            </li>
            <li v-for="i in invites" :key="i.id" class="pending">
              <span>{{ i.name }}</span>
              <span class="muted small">Invited · expires {{ date(i.expires_at) }}</span>
              <button class="btn small btn-icon" :disabled="busy" title="Cancel" aria-label="Cancel" @click="dropInvite(i.id)"><Icon name="x" :size="14" /></button>
            </li>
          </ul>
          <form class="acct-invite set-invite" @submit.prevent="sendInvite">
            <input v-model="inviteName" class="field" placeholder="Name of the person to invite" aria-label="Name of the person to invite" maxlength="60" />
            <button class="btn primary small" type="submit" :disabled="busy || !inviteName.trim()"><Icon name="plus" :size="14" />Create invite link</button>
          </form>
          <div v-if="link?.kind === 'invite'" class="set-link acct-link">
            <p class="small">{{ link.label }}</p>
            <div class="set-link-row"><input class="field" :value="link.url" readonly aria-label="Link" @focus="e => e.target.select()" /><button class="btn primary small" type="button" @click="copy"><Icon name="copy" :size="14" />{{ copied ? 'Copied' : 'Copy' }}</button></div>
            <div class="set-qr acct-qr"><QrCode :text="link.url" :size="110" /><p class="small muted">Or scan it with the other device's camera.</p></div>
          </div>
        </section>
      </template>

      <template v-else-if="tab === 'data'">
        <section class="set-sec">
          <div class="set-sec-head acct-sec-head"><h2>Download a copy</h2><button class="btn small" type="button" data-test="download-data" @click="downloadData"><Icon name="download" :size="14" />Download</button></div>
          <p class="small muted">Everything you have added, as one file: tasks, routines, goals, calendars, details about you and settings.</p>
        </section>
        <section class="set-sec">
          <div class="set-sec-head acct-sec-head"><h2>Sample data</h2>
            <button v-if="!sampleOn" class="btn small" type="button" data-test="sample-add" @click="loadSample"><Icon name="sparkle" :size="14" />Fill with sample data</button>
            <button v-else class="btn small" type="button" data-test="sample-remove" @click="clearSample"><Icon name="trash" :size="14" />Remove sample data</button>
          </div>
          <p class="small muted">See Taskie full: about 300 made-up tasks, classes, routines and goals. Removing them leaves everything you added yourself.</p>
        </section>
        <section class="set-sec">
          <div class="set-sec-head acct-sec-head"><h2>What Taskie keeps</h2></div>
          <p class="small muted">Your planner lives in your account and on this device. Your calendar links stay private, like a password to that calendar. When you record, only short pieces of audio go to Taskie's server to be written down, and they are not kept.</p>
          <p class="small muted" data-test="privacy-diag">To keep recording working, Taskie notes what the Add card did (opened, microphone on, words heard or not, errors), never the words themselves. Those notes are deleted after 30 days. The owner of this Taskie sees counts and states for each person, never anyone's tasks or words.</p>
        </section>
      </template>

      <template v-else-if="tab === 'sessions'">
        <section class="set-sec">
          <div class="set-sec-head acct-sec-head"><h2>Sign out everywhere</h2><button class="btn small" type="button" data-test="sign-out-everywhere" :disabled="busy" @click="leaveEverywhere"><Icon name="logout" :size="14" />Sign out everywhere</button></div>
          <p class="small muted">Ends every session, on every device, including this one. You will need your passkey to get back in.</p>
        </section>
      </template>

      <template v-else-if="tab === 'delete'">
        <section class="set-sec">
          <div class="set-sec-head acct-sec-head"><h2>Delete my account</h2><button v-if="!isOwner" class="btn small set-danger" type="button" data-test="delete-account" :disabled="busy" @click="removeMe"><Icon name="trash" :size="14" />Delete</button></div>
          <p class="small muted">{{ isOwner ? 'You own this Taskie, so it cannot be deleted from here. Every other person can delete their own account.' : 'Removes your account and all of your data for good. There is no undo, not even a sad one.' }}</p>
        </section>
      </template>
    </div>
  </div>
</template>
