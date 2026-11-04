<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { ai, aiNewsBrief, labelFor } from '../lib/ai';
import { store } from '../lib/store';
import { accountTotal } from '../lib/ledger';

// Markets and investment news from Yahoo Finance, through Budgie's Worker.
// Information, not advice.
const data = ref(null);
const error = ref('');
const brief = ref('');
const tab = ref('watch');

async function load() {
  error.value = '';
  try {
    const res = await fetch('/api/markets', { credentials: 'same-origin', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`(${res.status})`);
    data.value = await res.json();
    if (!data.value.indexes.length && !data.value.news.length) error.value = 'Yahoo Finance did not answer just now. Try again in a few minutes.';
  } catch (e) {
    error.value = `Market data could not be loaded ${e.message || ''}`.trim();
  }
}
onMounted(load);

async function makeBrief() {
  if (!data.value?.news?.length || !ai.ready) return;
  const goal = store.goals[0];
  const situation = [
    store.balances.length ? `Holds about $${Math.round(accountTotal.value)} across accounts.` : 'Has not added account balances.',
    goal ? `Saving for ${goal.name}: $${goal.saved} of $${goal.target}.` : 'No savings goal yet.',
  ].join(' ');
  brief.value = (await aiNewsBrief(data.value.news.map(n => n.title), situation)) || '';
}
watch([data, () => ai.ready], makeBrief);

const sign = v => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`);
const tone = v => (v > 0 ? 'gain' : v < 0 ? 'loss' : '');
const price = (r) => (r.symbol === '^TNX' ? `${r.price.toFixed(2)}%` : r.price.toLocaleString('en-US', { style: 'currency', currency: r.currency || 'USD', maximumFractionDigits: r.price > 1000 ? 0 : 2 }));
const spark = s => {
  if (!s || s.length < 2) return '';
  const min = Math.min(...s), max = Math.max(...s), span = max - min || 1;
  return s.map((v, i) => `${(i / (s.length - 1)) * 100},${22 - ((v - min) / span) * 20}`).join(' ');
};
const ago = d => {
  const t = Date.parse(d);
  if (!t) return '';
  const h = Math.round((Date.now() - t) / 36e5);
  return h < 1 ? 'just now' : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const updated = computed(() => (data.value?.updatedAt ? new Date(data.value.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''));
</script>

<template>
  <section class="card cell markets" data-test="markets">
    <div class="cell-head">
      <p class="label">Markets and investment news</p>
      <span class="muted small">Yahoo Finance{{ updated ? ` · ${updated}` : '' }}</span>
    </div>

    <p v-if="error" class="empty-note">{{ error }} <button class="si-link" type="button" @click="load">Try again</button></p>
    <p v-else-if="!data" class="muted small">Loading markets…</p>

    <template v-else>
      <div v-if="data.indexes.length" class="mk-strip">
        <div v-for="r in data.indexes" :key="r.symbol" class="mk-tile" :title="r.about">
          <span class="small">{{ r.name }}</span>
          <b>{{ price(r) }}</b>
          <span class="small" :class="tone(r.day)">{{ sign(r.day) }} today</span>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline :points="spark(r.spark)" fill="none" :stroke="r.month >= 0 ? '#16a34a' : '#e11d48'" stroke-width="1.3" vector-effect="non-scaling-stroke" /></svg>
        </div>
      </div>

      <div class="mk-body">
        <div class="mk-col">
          <div class="mk-tabs" role="tablist">
            <button role="tab" :class="{ on: tab === 'watch' }" :aria-selected="tab === 'watch'" @click="tab = 'watch'">Markets to watch</button>
            <button role="tab" :class="{ on: tab === 'news' }" :aria-selected="tab === 'news'" @click="tab = 'news'">News</button>
          </div>

          <template v-if="tab === 'watch'">
            <p class="muted small">Broad funds many people use to grow savings, ranked by the past year. Past growth does not predict future growth.</p>
            <ul class="mk-watch">
              <li v-for="r in [...data.watch].sort((a, b) => (b.year ?? -99) - (a.year ?? -99))" :key="r.symbol">
                <span><b>{{ r.name }}</b> <span class="muted small">{{ r.symbol }}</span><span class="muted small mk-about">{{ r.about }}</span></span>
                <span class="mk-num"><span :class="tone(r.month)">{{ sign(r.month) }}</span><span class="muted small">1 month</span></span>
                <span class="mk-num"><b :class="tone(r.year)">{{ sign(r.year) }}</b><span class="muted small">1 year</span></span>
              </li>
              <li v-if="!data.watch.length" class="muted small">Fund data is not available right now.</li>
            </ul>
          </template>

          <ul v-else class="mk-news">
            <li v-for="n in data.news" :key="n.link">
              <a :href="n.link" target="_blank" rel="noopener noreferrer">{{ n.title }}</a>
              <span class="muted small">{{ n.source }}{{ ago(n.date) ? ` · ${ago(n.date)}` : '' }}</span>
            </li>
            <li v-if="!data.news.length" class="muted small">No headlines right now.</li>
          </ul>
        </div>

        <aside class="mk-ai">
          <span class="opp-ai-tag">What this means for you</span>
          <p v-if="brief">{{ brief }}</p>
          <p v-else-if="ai.ready" class="muted small">Reading the headlines…</p>
          <p v-else class="muted small">When the AI model on this device is ready, Budgie sums up the headlines for your savings here.</p>
          <span class="muted small">{{ brief ? ai.used.news : labelFor('news') }} · on your device</span>
          <p class="meta small">Information, not financial advice. Prices may be delayed.</p>
        </aside>
      </div>
    </template>
  </section>
</template>
