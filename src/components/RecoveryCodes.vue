<script setup>
import Icon from './Icon.vue';
import { ref } from 'vue';

// Shows new recovery codes once, with ways to keep them, and asks the person
// to confirm they saved them.
const props = defineProps({ codes: { type: Array, required: true }, name: { type: String, default: '' }, confirm: { type: Boolean, default: true } });
const emit = defineEmits(['done', 'skip']);
const saved = ref(false);
const copied = ref(false);

const text = () => [
  `Taskie recovery codes${props.name ? ` for ${props.name}` : ''}`,
  `Made ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
  '',
  ...props.codes,
  '',
  'Each code works once. Use one on the sign-in page ("Lost your device?") to add a new passkey.',
  `${location.origin}`,
].join('\n');

async function copy() {
  try { await navigator.clipboard.writeText(text()); copied.value = true; setTimeout(() => (copied.value = false), 1500); } catch { /* select by hand */ }
}
function download() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text()], { type: 'text/plain' }));
  a.download = 'budgie-recovery-codes.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>

<template>
  <div class="rc" data-test="recovery-codes">
    <p class="rc-lead">If you lose every device with your passkey, one of these codes lets you back in to add a new passkey. Each code works once. Keep them somewhere safe and private, such as your password manager or a printed copy. They will not be shown again.</p>
    <ol class="rc-list">
      <li v-for="c in codes" :key="c"><code>{{ c }}</code></li>
    </ol>
    <div class="rc-acts">
      <button class="btn small" type="button" @click="copy"><Icon name="copy" :size="14" />{{ copied ? 'Copied' : 'Copy all' }}</button>
      <button class="btn small" type="button" @click="download"><Icon name="download" :size="14" />Download .txt</button>
    </div>
    <template v-if="confirm">
      <label class="rc-check"><input v-model="saved" type="checkbox" data-test="codes-saved" /> I have saved these codes somewhere safe</label>
      <button class="btn primary si-btn" type="button" data-test="codes-done" :disabled="!saved" @click="emit('done')"><Icon name="check" :size="14" />Continue to Taskie</button>
      <div class="rc-skip">
        <button class="si-link" type="button" data-test="codes-skip" @click="emit('skip')">Skip, my passkey syncs (iCloud or Google)</button>
        <p>Choose this if your passkey is saved to iCloud Keychain or Google Password Manager, or you will add a second device. These codes are then cancelled, and you can make new ones any time from the account menu.</p>
      </div>
    </template>
  </div>
</template>
