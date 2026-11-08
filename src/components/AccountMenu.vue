<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';
import { avatar } from '../lib/profile';
import { account, signOut } from '../lib/account';
import { go, nav, setMode } from '../lib/nav';

// The avatar in the top right (the one round thing in Taskie) and its menu:
// Settings, Privacy, the tour, and Sign out.
const emit = defineEmits(['tour']);
const open = ref(false);
const root = ref(null);
const initial = computed(() => (account.user?.name || '?').trim()[0]?.toUpperCase() || '?');
const isOwner = computed(() => account.user?.role === 'owner');
// Going to the page you are on reloads it, so lists are fresh.
const to = page => { open.value = false; go(page); window.dispatchEvent(new CustomEvent('budgie:account-page', { detail: page })); };
const tour = () => { open.value = false; emit('tour'); };
const busy = ref(false);
async function leave() { busy.value = true; try { await signOut(); } finally { busy.value = false; open.value = false; } }
const outside = e => { if (open.value && root.value && !root.value.contains(e.target)) open.value = false; };
const esc = e => { if (e.key === 'Escape' && open.value) open.value = false; };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc); });
onUnmounted(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); });
</script>

<template>
  <span ref="root" class="acct">
    <button class="acct-btn" type="button" :aria-label="`Account: ${account.user?.name}`" :aria-expanded="open" aria-haspopup="menu" data-test="account" @click="open = !open">
      <span class="acct-initial" :style="{ background: avatar.bg, color: avatar.ink }">{{ initial }}</span>
      <i class="acct-dot" :class="account.sync" aria-hidden="true" />
    </button>
    <div v-if="open" class="am-menu" role="menu" data-test="account-menu">
      <div class="am-who">
        <b>{{ account.user?.name }}</b>
        <span class="muted small">{{ isOwner ? 'Owner' : 'Member' }} · {{ account.sync === 'offline' ? 'offline' : 'synced' }}</span>
      </div>
      <div v-if="isOwner" class="am-view" role="group" aria-label="View">
        <button type="button" :class="{ on: nav.mode !== 'admin' }" :aria-pressed="nav.mode !== 'admin'" data-test="view-user" @click="open = false; setMode('user')"><Icon name="user" :size="14" />User view</button>
        <button type="button" :class="{ on: nav.mode === 'admin' }" :aria-pressed="nav.mode === 'admin'" data-test="view-admin" @click="open = false; setMode('admin')"><Icon name="shield" :size="14" />Admin view</button>
      </div>
      <button type="button" role="menuitem" data-test="menu-settings" @click="to('Settings')"><Icon name="gear" :size="16" />Settings</button>
      <template v-if="nav.mode !== 'admin' || !isOwner">
        <button type="button" role="menuitem" data-test="replay-guide" @click="tour"><Icon name="play" :size="16" />Take the tour</button>
      </template>
      <button type="button" role="menuitem" class="am-out" data-test="sign-out" :disabled="busy" @click="leave"><Icon name="logout" :size="16" />Sign out</button>
    </div>
  </span>
</template>
