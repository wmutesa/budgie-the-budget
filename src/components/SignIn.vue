<script setup>
import { ref } from 'vue';
import { account, signIn, registerWithInvite, passkeyError, canUsePasskeys } from '../lib/account';

// The first screen for anyone not signed in: sign in with a passkey, or
// create one from an invite link.
const busy = ref(false);
const error = ref('');
const supported = canUsePasskeys();

async function run(fn) {
  busy.value = true;
  error.value = '';
  try { await fn(); } catch (e) { error.value = passkeyError(e); } finally { busy.value = false; }
}
</script>

<template>
  <main class="signin">
    <section class="si-card">
      <p class="brand-word">BUDGIE</p>

      <template v-if="account.invite?.token">
        <h1>{{ account.invite.addsDevice ? `Add this device, ${account.invite.name}` : `Welcome, ${account.invite.name}` }}</h1>
        <p class="si-lead">
          {{ account.invite.addsDevice
            ? 'Create a passkey on this device so you can sign in here too.'
            : 'You have been invited to Budgie. Create a passkey to set up your account. It uses your fingerprint, face or device PIN, so there is no password to remember.' }}
        </p>
        <button class="btn primary si-btn" data-test="create-passkey" :disabled="busy || !supported" @click="run(registerWithInvite)">
          {{ busy ? 'Waiting for your passkey…' : 'Create a passkey' }}
        </button>
      </template>

      <template v-else>
        <h1>Sign in</h1>
        <p class="si-lead">Use the passkey you created when you joined. Budgie is invite-only, so ask the owner for an invite link if you do not have one.</p>
        <p v-if="account.invite?.error" class="si-error" role="alert">{{ account.invite.error }}</p>
        <button class="btn primary si-btn" data-test="sign-in" :disabled="busy || !supported" @click="run(signIn)">
          {{ busy ? 'Waiting for your passkey…' : 'Sign in with a passkey' }}
        </button>
      </template>

      <p v-if="!supported" class="si-error" role="alert">This browser cannot use passkeys. Try an up-to-date Chrome, Safari, Edge or Firefox.</p>
      <p v-if="error" class="si-error" role="alert">{{ error }}</p>

      <ul class="si-points">
        <li>Your data syncs to your account, so it follows you to every device.</li>
        <li>Each person sees only their own data.</li>
        <li>No passwords: passkeys cannot be phished or reused.</li>
      </ul>
    </section>
  </main>
</template>
