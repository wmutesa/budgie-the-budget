<script setup>
import AiHint from './AiHint.vue';
import { computed, ref } from 'vue';
import { store, monthly, daysUntil, fixLogo } from '../lib/store';
import LogoFix from './LogoFix.vue';
import { convert } from '../lib/rates';

const emit = defineEmits(['add']);
const items = computed(() => [...store.subscriptions].sort((a, b) => String(a.next).localeCompare(String(b.next))));
const total = computed(() => store.subscriptions.reduce((s, x) => s + (convert(monthly(x), x.currency, store.base) ?? 0), 0));
const fmt = (n, c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
const when = d => { const n = daysUntil(d); return n < 0 ? `${-n}d overdue` : n === 0 ? 'today' : `in ${n}d`; };
const remove = id => { store.subscriptions = store.subscriptions.filter(s => s.id !== id); };
const ideas = ['Netflix', 'Spotify', 'YouTube Premium', 'Claude'];
// Long lists stay compact: the first few, then the rest behind a toggle, scrolling inside.
const LIMIT = 6;
const expanded = ref(false);
const visible = computed(() => (expanded.value ? items.value : items.value.slice(0, LIMIT)));
const hidden = computed(() => Math.max(0, items.value.length - LIMIT));
const hiddenTotal = computed(() => items.value.slice(LIMIT).reduce((s, x) => s + (convert(monthly(x), x.currency, store.base) ?? 0), 0));
</script>

<template>
  <section class="card cell">
    <div class="cell-head">
      <div><p class="label">Subscriptions</p><p class="big sm">{{ fmt(total, store.base) }} <span class="muted small">a month</span></p></div>
      <button class="btn primary small" data-test="add-sub" @click="emit('add', '')">+ Add from the web</button>
    </div>
    <AiHint for="subscriptions" />
    <div v-if="!items.length" class="empty">
      <p>Search any service by name. Budgie finds it on the web, adds its logo and site, and tracks the cost in your currency.</p>
      <div class="chips"><button v-for="i in ideas" :key="i" class="chip-btn" @click="emit('add', i)">{{ i }}</button></div>
    </div>
    <ul v-else class="subs" :class="{ 'subs-scroll': expanded && items.length > LIMIT }" data-test="subs-list">
      <li v-for="s in visible" :key="s.id" class="sub-row">
        <LogoFix :name="s.name" :logo="s.logo || ''" :size="28" @pick="p => fixLogo(s.name, p)" />
        <div class="grow">
          <b>{{ s.name }}</b>
          <span class="muted small">{{ s.domain || 'added manually' }} · {{ s.cycle }} · {{ when(s.next) }}</span>
        </div>
        <div class="sub-amt">
          <b>{{ fmt(s.amount, s.currency) }}</b>
          <span v-if="s.currency !== store.base && convert(s.amount, s.currency, store.base) !== null" class="muted small">≈ {{ fmt(convert(s.amount, s.currency, store.base), store.base) }}</span>
        </div>
        <button class="icon-x" :aria-label="`Stop tracking ${s.name}`" @click="remove(s.id)">×</button>
      </li>
    </ul>
    <button v-if="hidden" class="more-btn" data-test="subs-more" @click="expanded = !expanded">
      {{ expanded ? 'Show fewer' : `Show ${hidden} more · ${fmt(hiddenTotal, store.base)} a month` }}
    </button>
  </section>
</template>
