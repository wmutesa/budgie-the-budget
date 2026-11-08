<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { cards } from '../lib/notices';
import { store } from '../lib/store';
import { inFocus, focusAllow } from '../lib/focus';
import Icon from './Icon.vue';

// Taskie's suggestions behind a bell in the top bar: a count of unread ones, a
// dropdown of short cards: click one to go where it is about (the Schedule).
// Opening the bell reads nothing: a notification counts as read once you rest
// on it, focus it or act on it.
const open = ref(false);
const pop = ref(null);
const root = ref(null);
const list = computed(() => cards.value);
const seen = computed(() => new Set(store.seenNotices || []));
const unread = computed(() => list.value.filter(c => !seen.value.has(c.id)).length);
// During focus the count stays quiet (unless everything is let through); it comes back after.
const quiet = computed(() => inFocus() && focusAllow() !== 'all');

const markRead = ids => { store.seenNotices = [...new Set([...(store.seenNotices || []), ...ids])].slice(-200); };
const isUnread = c => !seen.value.has(c.id);
let dwell = null;
const readSoon = c => { clearTimeout(dwell); if (isUnread(c)) dwell = setTimeout(() => markRead([c.id]), 700); };
const stopRead = () => clearTimeout(dwell);
const markAll = () => markRead(list.value.map(c => c.id));
function toggle() { open.value = !open.value; if (!open.value) stopRead(); }
const dismiss = c => { markRead([c.id]); store.dismissed.push(c.id); };
// Clicking a notification takes you where it is about (the Schedule), marks it read and closes the list.
const openIt = c => { markRead([c.id]); open.value = false; c.action?.run(); };
const clearAll = () => { list.value.forEach(c => store.dismissed.push(c.id)); open.value = false; };
const outside = e => { if (root.value && !root.value.contains(e.target)) open.value = false; };
const onKey = e => { if (e.key === 'Escape') open.value = false; };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', onKey); });
onUnmounted(() => { stopRead(); document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', onKey); });
</script>

<template>
  <span ref="root" class="bell">
    <button class="bell-btn" type="button" :aria-label="unread ? `Notifications, ${unread} new` : 'Notifications'" :aria-expanded="open" data-test="bell" @click="toggle">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 10a6 6 0 1 1 12 0v4l2 3H4l2-3z M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /></svg>
      <span v-if="unread && !quiet" class="bell-count" data-test="bell-count">{{ unread > 9 ? '9+' : unread }}</span>
    </button>

    <div v-if="open" ref="pop" class="bell-pop" role="dialog" aria-label="Notifications" data-test="bell-pop">
      <div class="bell-head">
        <span class="bell-title">Notifications<span v-if="unread" class="bell-new">{{ unread }} new</span></span>
        <span class="bell-head-acts">
          <button v-if="unread" class="bell-link" type="button" data-test="bell-read-all" @click="markAll">Mark all read</button>
          <button v-if="list.length" class="bell-link" type="button" @click="clearAll">Clear all</button>
        </span>
      </div>
      <ul v-if="list.length" class="bell-list">
        <li v-for="c in list" :key="c.id" class="bell-item" :class="[c.tone, { unread: isUnread(c) }]" data-test="bell-item" @mouseenter="readSoon(c)" @mouseleave="stopRead">
          <button type="button" class="bell-main" :title="c.body" :aria-label="`${c.title}. ${c.body}${c.action ? ` Opens ${c.action.label.replace(/^Open /, '')}.` : ''}`" @focus="markRead([c.id])" @click="openIt(c)">
            <span class="bell-ic" aria-hidden="true"><Icon :name="c.tone === 'warn' ? 'clock' : c.tone === 'good' ? 'check' : 'calendar'" :size="14" /></span>
            <span class="bell-text"><b>{{ c.title }}</b><span class="bell-body">{{ c.body }}</span></span>
            <i v-if="isUnread(c)" class="bell-dot" aria-label="Unread" />
          </button>
          <button class="bell-x" type="button" title="Dismiss" :aria-label="`Dismiss: ${c.title}`" @click="dismiss(c)"><Icon name="x" :size="12" /></button>
        </li>
      </ul>
      <div v-else class="bell-empty"><span class="bell-ic" aria-hidden="true"><Icon name="check" :size="14" /></span><span><b>You are all caught up</b><span>Taskie will let you know when something needs a look.</span></span></div>
    </div>
  </span>
</template>
