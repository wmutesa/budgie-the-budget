<script setup>
import { ref } from 'vue';
import { linkPlaidAccount } from '../lib/accounts';
import { createPlaidHandler, exchangePlaidPublicToken } from '../lib/plaid';

const props = defineProps({ accountName: String });
const emit = defineEmits(['success', 'error']);
const loading = ref(false);
const error = ref('');

async function openPlaidLink() {
  try {
    loading.value = true;
    error.value = '';
    const handler = await createPlaidHandler(
      async (data) => {
        try {
          // Exchange public token for access token (server-side)
          const { accessToken, itemId } = await exchangePlaidPublicToken(data.public_token);
          const { metadata } = data;

          // Link the account
          const account = linkPlaidAccount(
            itemId,
            metadata.account_id,
            metadata.institution?.name || 'Bank',
            metadata.account.mask || '',
            metadata.account.mask,
            metadata.account.subtype
          );

          emit('success', account);
        } catch (e) {
          error.value = e.message;
          emit('error', e);
        }
      },
      (err, metadata) => {
        if (err) {
          error.value = `Plaid error: ${err.error_message || 'Unknown error'}`;
          emit('error', err);
        }
      }
    );
    handler.open();
  } catch (e) {
    error.value = e.message;
    emit('error', e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="plaid-link">
    <button class="btn primary" :disabled="loading" @click="openPlaidLink">
      <span v-if="loading">Connecting...</span>
      <span v-else>🔗 Connect {{ accountName || 'account' }}</span>
    </button>
    <p v-if="error" class="error small">{{ error }}</p>
  </div>
</template>

<style scoped>
.plaid-link { }
.error { color: #dc2626; margin: 8px 0 0; }
</style>
