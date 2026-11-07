<script setup>
import Icon from './Icon.vue';
import { ref } from 'vue';
import { account, signIn, registerWithInvite, recoverWithCode, openInvite, inviteToken, passkeyError, canUsePasskeys } from '../lib/account';
import SignInBackdrop from './SignInBackdrop.vue';
import PasskeyNote from './PasskeyNote.vue';

// The first screen for anyone not signed in: sign in with a passkey, or
// create one from an invite link.
const busy = ref(false);
const error = ref('');
const supported = canUsePasskeys();
const recovering = ref(false);
const pasting = ref(false);
const pasted = ref('');
const useInvite = () => run(async () => {
  const token = inviteToken(pasted.value);
  if (!token) throw new Error('That does not look like a Budgie invite link. Copy the whole link, including everything after the # sign.');
  await openInvite(token);
  pasted.value = '';
  pasting.value = false;
});
const code = ref('');
const useCode = () => run(async () => { await recoverWithCode(code.value); code.value = ''; recovering.value = false; });

async function run(fn) {
  busy.value = true;
  error.value = '';
  try { await fn(); } catch (e) { error.value = passkeyError(e); } finally { busy.value = false; }
}
</script>

<template>
  <main class="signin">
    <SignInBackdrop />

    <section class="si-card">
      <!-- A small pixel budgie perched on the card. -->
      <svg class="si-bird" :class="{ busy }" viewBox="0 0 10 10" width="60" height="60" shape-rendering="crispEdges" aria-hidden="true">
        <g fill="#fde047"><rect x="3" y="1" width="3" height="1" /><rect x="2" y="2" width="5" height="1" /><rect x="2" y="3" width="4" height="1" /></g>
        <rect class="si-eye" x="5" y="2" width="1" height="1" fill="#18181b" />
        <rect x="6" y="3" width="1" height="1" fill="#fb923c" />
        <g fill="#86efac"><rect x="2" y="4" width="4" height="1" /><rect x="1" y="5" width="5" height="2" /><rect x="2" y="7" width="3" height="1" /></g>
        <g fill="#22c55e"><rect x="2" y="5" width="2" height="1" /><rect x="3" y="6" width="2" height="1" /></g>
        <g fill="#93c5fd"><rect x="0" y="7" width="2" height="1" /><rect x="0" y="8" width="1" height="1" /></g>
        <g fill="#18181b"><rect x="3" y="8" width="1" height="1" /><rect x="5" y="8" width="1" height="1" /></g>
      </svg>
      <p class="brand-word">BUDGIE</p>

      <template v-if="account.invite?.token">
        <h1>{{ account.invite.addsDevice ? `Add this device, ${account.invite.name}` : `Welcome, ${account.invite.name}` }}</h1>
        <p v-if="account.invite.recovered" class="si-ok" role="status">Recovery code accepted. {{ account.invite.codesLeft }} {{ account.invite.codesLeft === 1 ? 'code' : 'codes' }} left. Create a new passkey within 15 minutes.</p>
        <p class="si-lead">
          {{ account.invite.addsDevice
            ? 'Create a passkey on this device so you can sign in here too.'
            : 'You have been invited to Budgie. Create a passkey to set up your account. It uses your fingerprint, face or device PIN, so there is no password to remember.' }}
        </p>
        <button class="btn primary si-btn" data-test="create-passkey" :disabled="busy || !supported" @click="run(registerWithInvite)"><Icon name="sparkle" :size="14" />{{ busy ? 'Waiting for your passkey…' : 'Create a passkey' }}</button>
      </template>

      <template v-else>
        <h1>Sign in</h1>
        <p class="si-lead">Use the passkey you created when you joined. Budgie is invite-only, so ask the owner for an invite link if you do not have one.</p>
        <p v-if="account.invite?.error" class="si-error" role="alert">{{ account.invite.error }}</p>
        <button class="btn primary si-btn" data-test="sign-in" :disabled="busy || !supported" @click="run(signIn)"><Icon name="sparkle" :size="14" />{{ busy ? 'Waiting for your passkey…' : 'Sign in with a passkey' }}</button>
        <p class="si-tip">On someone else's computer? In the passkey prompt, choose <b>Use a phone or tablet</b> and scan the code with your phone.</p>

        <button v-if="!pasting" class="si-link" type="button" data-test="have-invite" @click="pasting = true; recovering = false">Have an invite link? Paste it here</button>
        <form v-else class="si-recover" @submit.prevent="useInvite">
          <label class="si-k" for="inv-input">Invite link</label>
          <div class="acct-link-row">
            <input id="inv-input" v-model="pasted" class="field" placeholder="https://…/invite#…" autocomplete="off" spellcheck="false" data-test="invite-input" />
            <button class="btn primary small" type="submit" data-test="invite-use" :disabled="busy || !pasted.trim()"><Icon name="check" :size="14" />Continue</button>
          </div>
          <button class="si-link" type="button" @click="pasting = false">Cancel</button>
        </form>

        <button v-if="!recovering" class="si-link" type="button" data-test="lost-device" @click="recovering = true; pasting = false">Lost your device? Use a recovery code</button>
        <form v-else class="si-recover" @submit.prevent="useCode">
          <label class="si-k" for="rc-input">Recovery code</label>
          <div class="acct-link-row">
            <input id="rc-input" v-model="code" class="field" placeholder="XXXXX-XXXXX" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" data-test="recovery-input" />
            <button class="btn primary small" type="submit" data-test="recovery-use" :disabled="busy || code.replace(/[^a-z0-9]/gi, '').length < 10"><Icon name="check" :size="14" />Use code</button>
          </div>
          <button class="si-link" type="button" @click="recovering = false">Cancel</button>
        </form>
      </template>

      <p v-if="!supported" class="si-error" role="alert">This browser cannot use passkeys. Try an up-to-date Chrome, Safari, Edge or Firefox.</p>
      <p v-if="error" class="si-error" role="alert">{{ error }}</p>

      <PasskeyNote :open="Boolean(account.invite?.token)" :owner="account.invite?.role === 'owner'" />
    </section>
  </main>
</template>
