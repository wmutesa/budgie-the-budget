<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { cards } from '../lib/advice';
import { store } from '../lib/store';
import Icon from './Icon.vue';

// Budgie's suggestions behind a bell in the top bar: a count of new ones, a
// dropdown with every notification, and a tooltip with the full message.
const open = ref(false);
// The tooltip sits beside the dropdown (outside the scrolling list, so it is never clipped).
const tip = ref(null); // { text, top }
const pop = ref(null);
function showTip(c, e) {
  const item = e.currentTarget.getBoundingClientRect();
  const box = pop.value.getBoundingClientRect();
  tip.value = { text: c.body, top: Math.max(0, item.top - box.top) };
}
const root = ref(null);
const list = computed(() => cards.value);
const seen = computed(() => new Set(store.seenNotices || []));
const unread = computed(() => list.value.filter(c => !seen.value.has(c.id)).length);

function toggle() {
  open.value = !open.value;
  if (open.value) store.seenNotices = [...new Set([...(store.seenNotices || []), ...list.value.map(c => c.id)])].slice(-200);
}
const dismiss = c => store.dismissed.push(c.id);
const run = c => { c.action.run(); store.dismissed.push(c.id); };
const clearAll = () => { list.value.forEach(c => store.dismissed.push(c.id)); open.value = false; };
const outside = e => { if (root.value && !root.value.contains(e.target)) open.value = false; };
const onKey = e => { if (e.key === 'Escape') open.value = false; };
onMounted(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', onKey); });
onUnmounted(() => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', onKey); });
</script>

<template>
  <span ref="root" class="bell">
    <button class="bell-btn" type="button" :aria-label="unread ? `Notifications, ${unread} new` : 'Notifications'" :aria-expanded="open" data-test="bell" @click="toggle">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 10a6 6 0 1 1 12 0v4l2 3H4l2-3z M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /></svg>
      <span v-if="unread" class="bell-count" data-test="bell-count">{{ unread > 9 ? '9+' : unread }}</span>
    </button>

    <div v-if="open" ref="pop" class="bell-pop" role="dialog" aria-label="Notifications" data-test="bell-pop" @mouseleave="tip = null">
      <div class="bell-head">
        <span class="bell-title"><span aria-hidden="true">✦</span> Budgie</span>
        <button v-if="list.length" class="notice-link" type="button" @click="clearAll">Clear all</button>
      </div>
      <ul v-if="list.length" class="bell-list">
        <li v-for="c in list" :key="c.id" class="bell-item" :class="c.tone" tabindex="0" data-test="bell-item" :aria-description="c.body" @mouseenter="e => showTip(c, e)" @focus="e => showTip(c, e)" @blur="tip = null">
          <i class="bell-dot" aria-hidden="true" />
          <div class="bell-text">
            <b>{{ c.title }}</b>
            <span class="bell-body">{{ c.body }}</span>
            <div class="bell-acts">
              <button v-if="c.action" class="btn primary small" type="button" @click="run(c)">{{ c.action.label }}</button>
              <button class="ibtn ghost" type="button" title="Dismiss" :aria-label="`Dismiss: ${c.title}`" @click="dismiss(c)"><Icon name="x" :size="14" /></button>
            </div>
          </div>
        </li>
      </ul>
      <span v-if="tip" class="bell-tip" role="tooltip" data-test="bell-tip" :style="{ top: tip.top + 'px' }">{{ tip.text }}</span>
      <p v-else-if="!list.length" class="bell-empty">You are all caught up. Budgie will let you know when something needs a look.</p>
    </div>
  </span>
</template>
