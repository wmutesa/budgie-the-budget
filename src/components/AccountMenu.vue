<script setup>
import AvatarPicker from './AvatarPicker.vue';
import { avatar } from '../lib/profile';
import Icon from './Icon.vue';
import { ref, computed, watch } from 'vue';
import { toast } from '../lib/toast';
import PasskeyNote from './PasskeyNote.vue';
import { snapshot } from '../lib/store';
import QrCode from './QrCode.vue';
import RecoveryCodes from './RecoveryCodes.vue';
import AIPanel from './AIPanel.vue';
import ProfileYou from './ProfileYou.vue';
import DigestSettings from './DigestSettings.vue';
import GeminiKey from './GeminiKey.vue';
import { addSample, removeSample, hasSample } from '../lib/sample';
import { DIGESTS_LIVE } from '../lib/digest';
import {
  account, signOut, signOutEverywhere, deleteMyAccount, listPasskeys, removePasskey, deviceLink, recoveryStatus, newRecoveryCodes,
  listPeople, invitePerson, cancelInvite, removePerson,
} from '../lib/account';

// The account button in the navigation, and the sheet it opens: sync status,
// your devices, and (for the owner) the people who can use Budgie.
const open = ref(false);
// One page at a time, chosen from the menu on the left.
const tab = ref('profile');
// Sample data: fill the app to see it full, then take it back out.
const sampleOn = computed(() => hasSample());
function loadSample() { const t0 = performance.now(); const r = addSample(); toast(`${r.tasks} items and ${r.goals} goals added in ${Math.round(performance.now() - t0)} ms.`, { kind: 'success', title: 'Sample data' }); }
function clearSample() { const n = removeSample(); toast(`${n} sample items removed.`, { kind: 'success', title: 'Sample data' }); }
const TABS = computed(() => [
  ['profile', 'Profile', 'user'],
  ['digests', DIGESTS_LIVE ? 'Digests & AI' : 'AI', 'sparkle'],
  ['security', 'Devices & security', 'target'],
  ...(isOwner.value ? [['people', 'People', 'list']] : []),
  ['data', 'Your data', 'download'],
]);
const passkeys = ref([]);
const codesLeft = ref(null);
const freshCodes = ref(null);
const people = ref([]);
const invites = ref([]);
const inviteName = ref('');
const link = ref(null);       // { label, url, expires }
const copied = ref(false);
const error = ref('');
const busy = ref(false);
watch(error, e => { if (e) toast(e, { kind: 'error' }); });

const initial = computed(() => (account.user?.name || '?').trim()[0]?.toUpperCase() || '?');
const isOwner = computed(() => account.user?.role === 'owner');
const syncText = computed(() => ({
  saving: 'Saving…',
  saved: account.syncedAt ? `Synced ${new Date(account.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Synced',
  offline: 'Offline · saved on this device',
  error: 'Not synced',
  idle: '',
}[account.sync]));
const date = t => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');

// Loads run together; only the newest result is shown, so an older, slower
// load cannot bring back someone who was just removed.
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
function show() { open.value = true; tab.value = 'profile'; link.value = null; freshCodes.value = null; load(); }

async function act(fn) {
  busy.value = true;
  error.value = '';
  try { await fn(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
const makeDeviceLink = () => act(async () => {
  const r = await deviceLink();
  link.value = { kind: 'device', label: 'Open this on your other device within 24 hours to add it', url: r.link };
});
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
const dropPasskey = p => act(async () => {
  if (!confirm(`Remove the passkey "${p.label}"? That device will not be able to sign in.`)) return;
  await removePasskey(p.id); await load();
});
const dropPerson = p => act(async () => {
  if (!confirm(`Remove ${p.name}? Their account and all of their Budgie data will be deleted. This cannot be undone.`)) return;
  await removePerson(p.id); await load();
});
async function copy() {
  try { await navigator.clipboard.writeText(link.value.url); copied.value = true; setTimeout(() => (copied.value = false), 1500); } catch { /* select it by hand */ }
}
// A full copy of your Budgie data, as a file you keep.
function downloadData() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Budgie', user: account.user?.name, data: snapshot() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `budgie-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const leaveEverywhere = () => act(async () => {
  if (!confirm('Sign out on every device, including this one? You will need your passkey to sign in again.')) return;
  await signOutEverywhere(); open.value = false;
});
const removeMe = () => act(async () => {
  const typed = prompt('This deletes your Budgie account and all of your data for good. Type DELETE to confirm.');
  if (typed !== 'DELETE') return;
  await deleteMyAccount(); open.value = false;
});
const leave = () => act(async () => { await signOut(); open.value = false; });
const emit = defineEmits(['tour']);
const tour = () => { open.value = false; emit('tour'); };
</script>

<template>
  <span class="acct">
    <button class="acct-btn" type="button" :aria-label="`Account: ${account.user?.name}`" data-test="account" @click="show">
      <span class="acct-initial" :style="{ background: avatar.bg, color: avatar.ink }">{{ initial }}</span>
      <i class="acct-dot" :class="account.sync" aria-hidden="true" />
    </button>

    <!-- On <body>, so the top bar's blur does not trap the full-window backdrop. -->
    <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="open = false">
      <div class="sheet acct-sheet abnb" role="dialog" aria-label="Account">
        <button class="icon-x abnb-x" aria-label="Close" @click="open = false">×</button>
        <div class="acct-body">
        <aside class="abnb-rail">
          <div class="acct-top">
            <AvatarPicker :initial="initial" :name="account.user?.name" />
            <div class="acct-who">
              <p class="abnb-name">{{ account.user?.name }}</p>
              <p class="acct-sync" :class="account.sync"><span class="acct-role">{{ isOwner ? 'Owner' : 'Member' }}</span> {{ syncText }}<template v-if="account.note"> · {{ account.note }}</template></p>
            </div>
          </div>
          <nav class="acct-nav" aria-label="Settings">
            <button v-for="[id, label, ic] in TABS" :key="id" type="button" :class="{ on: tab === id }" :aria-current="tab === id ? 'page' : undefined" :data-test="`acct-tab-${id}`" @click="tab = id"><Icon :name="ic" :size="16" />{{ label }}</button>
          </nav>
          <div class="acct-foot">
            <span class="muted small">Changes save as you type.</span>
            <button class="btn acct-out" data-test="sign-out" :disabled="busy" @click="leave"><Icon name="logout" :size="14" />Sign out</button>
          </div>
        </aside>

        <div class="acct-page" :data-page="tab">
        <h2 class="abnb-title">{{ TABS.find(t => t[0] === tab)?.[1] }}</h2>
        <template v-if="tab === 'profile'">
          <ProfileYou />
        </template>

        <template v-else-if="tab === 'digests'">
          <GeminiKey />
          <DigestSettings v-if="DIGESTS_LIVE" />
          <AIPanel class="t-violet" />
        </template>

        <template v-else-if="tab === 'security'">
          <section class="acct-sec t-a">
            <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true">◎</span>Your devices</p><button class="btn small" :disabled="busy" @click="makeDeviceLink"><Icon name="plus" :size="14" />Add a device</button></div>
          <div v-if="link?.kind === 'device'" class="acct-link">
            <p class="small">{{ link.label }}</p>
            <div class="acct-link-row">
              <input class="field" :value="link.url" readonly aria-label="Link" @focus="e => e.target.select()" />
              <button class="btn primary small" type="button" @click="copy"><Icon name="copy" :size="14" />{{ copied ? 'Copied' : 'Copy' }}</button>
            </div>
            <div class="acct-qr">
              <QrCode :text="link.url" :size="110" />
              <p class="small muted">Or scan this with the other device's camera.</p>
            </div>
          </div>
            <ul class="acct-list">
              <li v-for="p in passkeys" :key="p.id">
                <span>{{ p.label || 'Passkey' }}</span>
                <span class="muted small">Added {{ date(p.created_at) }} · last used {{ date(p.last_used_at) }}</span>
                <button v-if="passkeys.length > 1" class="btn small" :disabled="busy" @click="dropPasskey(p)"><Icon name="trash" :size="14" />Remove</button>
              </li>
            </ul>
          </section>
          <section class="acct-sec t-b">
            <div class="acct-sec-head">
              <p class="kicker"><span class="acct-ico" aria-hidden="true">✳</span>Recovery codes</p>
              <button class="btn small" :disabled="busy" data-test="new-codes" @click="makeCodes"><Icon name="sparkle" :size="14" />{{ codesLeft ? 'Make new codes' : 'Make codes' }}</button>
            </div>
            <p class="small" :class="{ 'acct-warn': codesLeft !== null && codesLeft < 3 }" data-test="codes-left">
              {{ codesLeft === null ? '' : codesLeft === 0 ? 'No recovery codes. That is fine if your passkey syncs with iCloud or Google, or you have added a second device. Otherwise, make some.' : `${codesLeft} unused ${codesLeft === 1 ? 'code' : 'codes'} left.` }}
            </p>
            <RecoveryCodes v-if="freshCodes" :codes="freshCodes" :name="account.user?.name" :confirm="false" />
          </section>
          <PasskeyNote :owner="isOwner" />
          <section class="acct-sec t-a">
            <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true">⇥</span>Sessions</p><button class="btn small" type="button" data-test="sign-out-everywhere" :disabled="busy" @click="leaveEverywhere"><Icon name="logout" :size="14" />Sign out everywhere</button></div>
            <p class="small muted">Ends every session, on every device, including this one.</p>
          </section>
        </template>

        <template v-else-if="tab === 'people'">
          <section class="acct-sec t-b">
            <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true">☺</span>People</p><span class="muted small">{{ people.length }} with access</span></div>
            <ul class="acct-list">
              <li v-for="p in people" :key="p.id">
                <span>{{ p.name }}<span v-if="p.id === account.user.id" class="muted small"> · you</span></span>
                <span class="muted small">{{ p.role === 'owner' ? 'Owner' : 'Member' }} · last seen {{ date(p.last_seen) }}</span>
                <button v-if="p.role !== 'owner'" class="btn small" :disabled="busy" @click="dropPerson(p)"><Icon name="trash" :size="14" />Remove</button>
              </li>
              <li v-for="i in invites" :key="i.id" class="pending">
                <span>{{ i.name }}</span>
                <span class="muted small">Invited · expires {{ date(i.expires_at) }}</span>
                <button class="btn small btn-icon" :disabled="busy" @click="dropInvite(i.id)" title="Cancel" aria-label="Cancel"><Icon name="x" :size="14" /></button>
              </li>
            </ul>
            <form class="acct-invite" @submit.prevent="sendInvite">
              <input v-model="inviteName" class="field" placeholder="Name of the person to invite" aria-label="Name of the person to invite" maxlength="60" />
              <button class="btn primary small" type="submit" :disabled="busy || !inviteName.trim()"><Icon name="plus" :size="14" />Create invite link</button>
            </form>
          <div v-if="link?.kind === 'invite'" class="acct-link">
            <p class="small">{{ link.label }}</p>
            <div class="acct-link-row">
              <input class="field" :value="link.url" readonly aria-label="Link" @focus="e => e.target.select()" />
              <button class="btn primary small" type="button" @click="copy"><Icon name="copy" :size="14" />{{ copied ? 'Copied' : 'Copy' }}</button>
            </div>
            <div class="acct-qr">
              <QrCode :text="link.url" :size="110" />
              <p class="small muted">Or scan this with the other device's camera.</p>
            </div>
          </div>
          </section>
        </template>

        <template v-else>
          <section class="acct-sec t-a">
            <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true">⇩</span>Download a copy</p><button class="btn small" type="button" data-test="download-data" @click="downloadData"><Icon name="download" :size="14" />Download</button></div>
            <p class="small muted">Everything you have added, as one file: tasks, routines, goals, calendars, details about you and settings.</p>
          </section>
          <section class="acct-sec t-a">
            <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true">◇</span>Sample data</p>
              <button v-if="!sampleOn" class="btn small" type="button" data-test="sample-add" @click="loadSample"><Icon name="sparkle" :size="14" />Fill with sample data</button>
              <button v-else class="btn small" type="button" data-test="sample-remove" @click="clearSample"><Icon name="trash" :size="14" />Remove sample data</button></div>
            <p class="small muted">See Budgie full: about 300 made-up tasks, classes, routines and goals. Removing it leaves everything you added yourself.</p>
          </section>
          <section class="acct-sec t-b">
            <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true">▶</span>The tour</p><button class="btn small" type="button" data-test="replay-guide" @click="tour"><Icon name="play" :size="14" />Take the tour again</button></div>
            <p class="small muted">A one-minute walk through the three pages.</p>
          </section>
          <section v-if="!isOwner" class="acct-sec t-a">
            <div class="acct-sec-head"><p class="kicker"><span class="acct-ico" aria-hidden="true">✕</span>Delete my account</p><button class="btn small acct-danger" type="button" data-test="delete-account" :disabled="busy" @click="removeMe"><Icon name="trash" :size="14" />Delete</button></div>
            <p class="small muted">Removes your account and all of your data for good.</p>
          </section>
        </template>
        </div>
        </div>

      </div>
    </div>
    </Teleport>
  </span>
</template>
