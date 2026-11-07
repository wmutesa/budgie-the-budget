<script setup>
import { computed } from 'vue';
import { store } from '../lib/store';
import { nav, PAGES } from '../lib/nav';
import { occurrences, today } from '../lib/tasks';
import { marketStatus } from '../lib/savings';
import Icon from './Icon.vue';

// Budgie's navigation: a floating dock. A colour blob slides to the page you
// are on, labels pop out on hover, and small live signs show what is waiting:
// today's progress on the Planner, entries to check in Transactions, whether
// markets are open. On phones it becomes a pill at the bottom of the screen.
const ICONS = { Overview: 'home', Planner: 'planner', Transactions: 'wallet', Markets: 'trend', Playground: 'shapes' };
const at = computed(() => Math.max(0, PAGES.indexOf(nav.page)));
const day = computed(() => {
  const list = occurrences(today(), today());
  return { done: list.filter(x => x.done).length, all: list.length };
});
const market = computed(() => { try { return marketStatus().open; } catch { return false; } });
const sign = p => {
  if (p === 'Planner' && day.value.all) return { ring: Math.round((day.value.done / day.value.all) * 100), text: `${day.value.done} of ${day.value.all} done today` };
  if (p === 'Transactions' && store.drafts.length) return { count: store.drafts.length, text: `${store.drafts.length} to check` };
  if (p === 'Markets' && market.value) return { live: true, text: 'US markets open' };
  return null;
};
const date = new Date();
const wd = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
</script>

<template>
  <aside class="dock" aria-label="Budgie">
    <span class="dock-mark" title="Budgie"><img src="/favicon.svg" alt="Budgie" width="26" height="26" /></span>
    <nav class="nb-pages dock-pages" aria-label="Pages" :style="{ '--at': at }">
      <span class="dock-blob" aria-hidden="true" />
      <button v-for="p in PAGES" :key="p" type="button" class="dock-btn" :class="{ on: nav.page === p }" :aria-current="nav.page === p ? 'page' : undefined" @click="nav.page = p">
        <span class="dock-ico" :style="sign(p)?.ring !== undefined ? { '--ring': sign(p).ring } : null" :class="{ ringed: sign(p)?.ring !== undefined }">
          <Icon :name="ICONS[p]" :size="17" />
        </span>
        <b v-if="sign(p)?.count" class="dock-count">{{ sign(p).count > 9 ? '9+' : sign(p).count }}</b>
        <i v-if="sign(p)?.live" class="dock-live" />
        <span class="dock-label">{{ p }}<small v-if="sign(p)">{{ sign(p).text }}</small></span>
      </button>
    </nav>
    <span class="dock-date" aria-hidden="true"><b>{{ date.getDate() }}</b>{{ wd }}</span>
  </aside>
</template>
