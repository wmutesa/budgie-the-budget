<script setup>
import { ref, computed } from 'vue';
import PasskeyNote from './PasskeyNote.vue';
import { snapshot } from '../lib/store';
import QrCode from './QrCode.vue';
import RecoveryCodes from './RecoveryCodes.vue';
import AIPanel from './AIPanel.vue';
import {
  account, signOut, listPasskeys, removePasskey, deviceLink, recoveryStatus, newRecoveryCodes,
  listPeople, invitePerson, cancelInvite, removePerson,
} from '../lib/account';

// The account button in the navigation, and the sheet it opens: sync status,
// your devices, and (for the owner) the people who can use Budgie.
const open = ref(false);
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
function show() { open.value = true; link.value = null; freshCodes.value = null; load(); }

async function act(fn) {
  busy.value = true;
  error.value = '';
  try { await fn(); } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
const makeDeviceLink = () => act(async () => {
  const r = await deviceLink();
  link.value = { label: 'Open this on your other device within 24 hours to add it', url: r.link };
});
const sendInvite = () => act(async () => {
  if (!inviteName.value.trim()) return;
  const r = await invitePerson(inviteName.value.trim());
  link.value = { label: `Send this to ${inviteName.value.trim()}. It works once and expires in ${r.expiresInDays} days`, url: r.link };
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
const leave = () => act(async () => { await signOut(); open.value = false; });
const emit = defineEmits(['tour']);
const tour = () => { open.value = false; emit('tour'); };
</script>

<template>
  <span class="acct">
    <button class="acct-btn" type="button" :aria-label="`Account: ${account.user?.name}`" data-test="account" @click="show">
      <span class="acct-initial">{{ initial }}</span>
      <i class="acct-dot" :class="account.sync" aria-hidden="true" />
    </button>

    <!-- On <body>, so the top bar's blur does not trap the full-window backdrop. -->
    <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="open = false">
      <div class="sheet acct-sheet" role="dialog" aria-label="Account">
        <div class="cell-head">
          <p class="label">{{ account.user?.name }} <span class="muted small">· {{ isOwner ? 'Owner' : 'Member' }}</span></p>
          <button class="icon-x" aria-label="Close" @click="open = false">×</button>
        </div>

        <p class="acct-sync" :class="account.sync">{{ syncText }}<template v-if="account.note"> · {{ account.note }}</template></p>
        <p v-if="error" class="si-error" role="alert">{{ error }}</p>

        <div v-if="link" class="acct-link">
          <p class="small">{{ link.label }}</p>
          <div class="acct-link-row">
            <input class="field" :value="link.url" readonly aria-label="Link" @focus="e => e.target.select()" />
            <button class="btn primary small" type="button" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
          </div>
          <div class="acct-qr">
            <QrCode :text="link.url" :size="148" />
            <p class="small muted">Or scan this with the other device's camera.</p>
          </div>
        </div>

        <section class="acct-sec">
          <div class="acct-sec-head"><p class="kicker">Your devices</p><button class="btn small" :disabled="busy" @click="makeDeviceLink">Add a device</button></div>
          <ul class="acct-list">
            <li v-for="p in passkeys" :key="p.id">
              <span>{{ p.label || 'Passkey' }}</span>
              <span class="muted small">Added {{ date(p.created_at) }} · last used {{ date(p.last_used_at) }}</span>
              <button v-if="passkeys.length > 1" class="btn small" :disabled="busy" @click="dropPasskey(p)">Remove</button>
            </li>
          </ul>
        </section>

        <section class="acct-sec">
          <div class="acct-sec-head">
            <p class="kicker">Recovery codes</p>
            <button class="btn small" :disabled="busy" data-test="new-codes" @click="makeCodes">{{ codesLeft ? 'Make new codes' : 'Make codes' }}</button>
          </div>
          <p class="small" :class="{ 'acct-warn': codesLeft !== null && codesLeft < 3 }" data-test="codes-left">
            {{ codesLeft === null ? '' : codesLeft === 0 ? 'No recovery codes. That is fine if your passkey syncs with iCloud or Google, or you have added a second device. Otherwise, make some.' : `${codesLeft} unused ${codesLeft === 1 ? 'code' : 'codes'} left.` }}
          </p>
          <RecoveryCodes v-if="freshCodes" :codes="freshCodes" :name="account.user?.name" :confirm="false" />
        </section>

        <section v-if="isOwner" class="acct-sec">
          <div class="acct-sec-head"><p class="kicker">People</p><span class="muted small">{{ people.length }} with access</span></div>
          <ul class="acct-list">
            <li v-for="p in people" :key="p.id">
              <span>{{ p.name }}<span v-if="p.id === account.user.id" class="muted small"> · you</span></span>
              <span class="muted small">{{ p.role === 'owner' ? 'Owner' : 'Member' }} · last seen {{ date(p.last_seen) }}</span>
              <button v-if="p.role !== 'owner'" class="btn small" :disabled="busy" @click="dropPerson(p)">Remove</button>
            </li>
            <li v-for="i in invites" :key="i.id" class="pending">
              <span>{{ i.name }}</span>
              <span class="muted small">Invited · expires {{ date(i.expires_at) }}</span>
              <button class="btn small" :disabled="busy" @click="dropInvite(i.id)">Cancel</button>
            </li>
          </ul>
          <form class="acct-invite" @submit.prevent="sendInvite">
            <input v-model="inviteName" class="field" placeholder="Name of the person to invite" aria-label="Name of the person to invite" maxlength="60" />
            <button class="btn primary small" type="submit" :disabled="busy || !inviteName.trim()">Create invite link</button>
          </form>
        </section>

        <section class="acct-sec">
          <div class="acct-sec-head"><p class="kicker">Your data</p><button class="btn small" type="button" data-test="download-data" @click="downloadData">Download a copy</button></div>
          <p class="small muted">Everything you have added, as one file: entries, budgets, accounts, goals, subscriptions and plans.</p>
        </section>

        <!-- Below People: its progress updates must not shift the lists above. -->
        <AIPanel />

        <PasskeyNote :owner="isOwner" />

        <div class="acct-foot">
          <button class="btn small" type="button" data-test="replay-guide" @click="tour">Take the tour again</button>
          <button class="btn acct-out" data-test="sign-out" :disabled="busy" @click="leave">Sign out</button>
        </div>
      </div>
    </div>
    </Teleport>
  </span>
</template>
