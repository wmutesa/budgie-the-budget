<script setup>
// How passkeys work and what can go wrong, in plain words. Used on the
// sign-in screen, in the account menu and in the first-run guide.
defineProps({ open: { type: Boolean, default: false }, owner: { type: Boolean, default: false } });
</script>

<template>
  <details class="pk-note" :open="open" data-test="passkey-note">
    <summary>How passkeys work, and the risks</summary>

    <p class="pk-h">How it works</p>
    <ul>
      <li>When you create a passkey, your device makes a pair of keys. The private key stays on your device, or in your Apple, Google or Microsoft password manager. Budgie only keeps the public key, which cannot be used to sign in.</li>
      <li>To sign in, you unlock your device with your fingerprint, face or PIN, and it proves to Budgie that it holds the private key. Your fingerprint and face never leave your device.</li>
      <li>A passkey only works on Budgie's own address, so a fake look-alike site cannot trick you into using it. There is no password to steal or reuse.</li>
    </ul>

    <p class="pk-h">The risks, and how to stay safe</p>
    <ul>
      <li><b>Losing your device.</b> If you lose every device that has your passkey, you cannot sign in. Add a second device from the account menu, or keep passkey syncing on (iCloud Keychain, Google Password Manager) so a new phone gets it too. Your recovery codes are the last resort: each one lets you back in once to make a new passkey.</li>
      <li><b>Recovery codes are as powerful as a passkey.</b> Anyone with one can add their own passkey to your account, so keep them private and make new ones from the account menu if they might have been seen.</li>
      <li><b>Someone who can unlock your device can open Budgie.</b> Use a strong device PIN or password and do not share it.</li>
      <li><b>Synced passkeys are only as safe as the account they sync with.</b> Turn on two-step verification for your Apple, Google or Microsoft account.</li>
      <li><b>Shared or public computers.</b> Do not create a passkey on them. If you sign in on one, sign out when you finish; that also removes Budgie's copy of your data from it.</li>
      <li><b>Invite and device links work like a key until used.</b> Send them privately. Each works once, invites expire after 7 days and device links after 24 hours.</li>
      <li v-if="!owner"><b>Locked out with no recovery codes?</b> Ask the owner for a new invite link to set up a passkey again.</li>
      <li v-else><b>You are the owner.</b> Nobody can send you a new invite from inside the app, so add a second device and keep your recovery codes safe. Without either, a new owner invite has to be written into the database (see the README).</li>
    </ul>
  </details>
</template>
