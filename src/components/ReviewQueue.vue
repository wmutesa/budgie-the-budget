<script setup>
import { ref } from 'vue';
import { store } from '../lib/store';
import { CATEGORIES } from '../lib/categorize';
import BrandPicker from './BrandPicker.vue';

// Everything captured waits here until accepted, so nothing lands in the ledger by mistake.
const editing = ref(null);
const fmt = (n, c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c || 'USD' }).format(n);
const accept = d => {
  store.transactions.unshift({ ...d, amount: Number(d.amount) });
  store.drafts = store.drafts.filter(x => x.id !== d.id);
};
const discard = d => { store.drafts = store.drafts.filter(x => x.id !== d.id); };
const acceptAll = () => { [...store.drafts].forEach(accept); };
const pick = (d, brand) => {
  Object.assign(d, { merchant: brand.name, domain: brand.domain, logo: brand.logo, description: brand.description });
  editing.value = null;
};
const sourceLabel = { receipt: 'Receipt scan', pdf: 'PDF', csv: 'CSV', excel: 'Excel', quick: 'Note' };
</script>

<template>
  <section class="card cell review">
    <div class="cell-head">
      <p class="label">Review · {{ store.drafts.length }} waiting</p>
      <div class="chips">
        <button class="btn small" @click="store.drafts = []">Discard all</button>
        <button class="btn primary small" data-test="accept-all" @click="acceptAll">Accept all</button>
      </div>
    </div>
    <ul class="drafts">
      <li v-for="d in store.drafts" :key="d.id" class="draft" :class="{ low: d.confidence < 0.6 }">
        <button class="brand-btn" :title="`Change the company for ${d.merchant}`" @click="editing = editing === d.id ? null : d.id">
          <img v-if="d.logo" :src="d.logo" :alt="`${d.merchant} logo`" width="28" height="28" />
          <span v-else class="logo-fallback">{{ d.merchant[0] }}</span>
        </button>
        <div class="draft-main">
          <b>{{ d.merchant }}</b>
          <span class="muted small">{{ sourceLabel[d.source] || d.source }}<template v-if="d.domain"> · {{ d.domain }}</template><template v-if="d.confidence < 0.6"> · check this one</template></span>
          <div class="chips cat-chips">
            <button v-for="c in CATEGORIES" :key="c" class="chip-btn" :class="{ on: d.category === c }" @click="d.category = c">{{ c }}</button>
          </div>
        </div>
        <input v-model="d.date" class="field date-field" type="date" :aria-label="`Date for ${d.merchant}`" />
        <input v-model.number="d.amount" class="field amt-field" type="number" step="0.01" :aria-label="`Amount for ${d.merchant}`" />
        <span class="muted small">{{ d.currency }}</span>
        <div class="draft-acts">
          <button class="btn small" @click="discard(d)">Discard</button>
          <button class="btn primary small" @click="accept(d)">Accept</button>
        </div>
        <div v-if="editing === d.id" class="draft-picker"><BrandPicker :seed="d.merchant" @pick="b => pick(d, b)" /></div>
      </li>
    </ul>
    <p class="meta small">Amounts below zero are spending. Tap a logo to search for the right company.</p>
  </section>
</template>
