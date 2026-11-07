<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { ai, aiNewsBrief } from '../lib/ai';
import { store } from '../lib/store';
import { logoUrl } from '../lib/brands';
import { moneyToday, savingsAdvice, savingsIdeas, marketStatus } from '../lib/savings';
import GrowthCalc from './GrowthCalc.vue';

// Markets as a daily brief: the day's headline and what it means for you,
// a ticker, indexes, top stories, markets to watch and savings ideas.
// Prices and headlines come from Yahoo Finance through Budgie's Worker.
const data = ref(null);
const error = ref('');
const brief = ref('');
const status = ref(marketStatus());
let clock = null;

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
onMounted(() => { load(); clock = setInterval(() => { status.value = marketStatus(); }, 60000); });
onUnmounted(() => clearInterval(clock));

// ---------- formatting ----------
const sign = v => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`);
const tone = v => (v > 0 ? 'gain' : v < 0 ? 'loss' : '');
const usd = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const price = r => (r.symbol === '^TNX' ? `${r.price.toFixed(2)}%` : r.price.toLocaleString('en-US', { style: 'currency', currency: r.currency || 'USD', maximumFractionDigits: r.price > 1000 ? 0 : 2 }));
const plain = r => (r.symbol === '^TNX' ? `${r.price.toFixed(2)}%` : r.price.toLocaleString('en-US', { maximumFractionDigits: r.price > 1000 ? 0 : 2 }));
const spark = s => {
  if (!s || s.length < 2) return '';
  const min = Math.min(...s), max = Math.max(...s), span = max - min || 1;
  return s.map((v, i) => `${(i / (s.length - 1)) * 100},${36 - ((v - min) / span) * 30}`).join(' ');
};
const ago = d => {
  const t = Date.parse(d);
  if (!t) return '';
  const h = Math.round((Date.now() - t) / 36e5);
  return h < 1 ? 'just now' : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const updated = computed(() => (data.value?.updatedAt ? new Date(data.value.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''));
const by = s => data.value?.indexes.find(r => r.symbol === s);

// ---------- the day's headline and summary, written from the numbers ----------
const headline = computed(() => {
  const sp = by('^GSPC'), nq = by('^IXIC'), dj = by('^DJI'), ty = by('^TNX');
  if (!sp || sp.day === null) return 'Today in the markets';
  const led = nq && dj && nq.day !== null && dj.day !== null && Math.abs(nq.day - dj.day) > 0.3 ? (nq.day > dj.day ? ', led by tech' : ', with tech lagging') : '';
  const base = sp.day > 0.2 ? `Stocks rise${led}` : sp.day < -0.2 ? `Stocks slip${led}` : 'A quiet day for stocks';
  const rates = ty && ty.day !== null ? (ty.day < -0.3 ? ' as bond yields ease' : ty.day > 0.3 ? ' as bond yields climb' : '') : '';
  return base + rates;
});
const summary = computed(() => {
  const d = data.value;
  if (!d || !d.indexes.length) return '';
  const sp = by('^GSPC'), nq = by('^IXIC'), ty = by('^TNX');
  const parts = [];
  if (sp && sp.day !== null) parts.push(`The S&P 500 is ${sign(sp.day)} today${nq && nq.day !== null ? ` and the Nasdaq ${sign(nq.day)}` : ''}.`);
  if (ty) parts.push(`The 10-year Treasury yield is ${ty.price.toFixed(2)}%, which tends to move savings, CD and mortgage rates.`);
  const ranked = [...d.watch].filter(r => r.year !== null).sort((a, b) => b.year - a.year);
  if (ranked.length > 1) parts.push(`Over the past year, ${ranked[0].name.toLowerCase()} grew the most (${sign(ranked[0].year)}) and ${ranked[ranked.length - 1].name.toLowerCase()} the least (${sign(ranked[ranked.length - 1].year)}).`);
  return parts.join(' ');
});

// What the headlines mean for you, from the AI on this device.
async function makeBrief() {
  if (!data.value?.news?.length || !ai.ready) return;
  const m = moneyToday.value;
  const situation = [
    m.netWorth !== null ? `Holds about $${Math.round(m.netWorth)} across accounts.` : 'Has not added account balances.',
    m.cushion !== null ? `Emergency fund covers ${m.cushion.toFixed(1)} months of spending.` : 'Emergency fund size unknown.',
    m.toInvest !== null ? `About $${m.toInvest} is left after spending this month.` : '',
  ].join(' ');
  brief.value = (await aiNewsBrief(data.value.news.map(n => n.title), situation)) || '';
}
watch([data, () => ai.ready], makeBrief);

// ---------- stories ----------
const TOPICS = [
  ['Rates', /\bfed\b|rate|yield|treasur|inflation|bond|cpi|jobs/i],
  ['Crypto', /bitcoin|crypto|ether|btc/i],
  ['Gold', /gold|silver|oil|commodit/i],
  ['Stocks', /stock|nasdaq|s&p|dow|earnings|shares|ipo/i],
  ['World', /china|europe|japan|emerging|global|dollar|tariff/i],
];
const topic = t => (TOPICS.find(([, re]) => re.test(t)) || ['Markets'])[0];
const lead = computed(() => data.value?.news?.[0] || null);
const stories = computed(() => (data.value?.news || []).slice(1, 9));

// ---------- markets to watch ----------
const watchRanked = computed(() => [...(data.value?.watch || [])].sort((a, b) => (b.year ?? -99) - (a.year ?? -99)));
const maxYear = computed(() => Math.max(1, ...watchRanked.value.map(r => Math.abs(r.year || 0))));
const barWidth = v => Math.round((Math.abs(v || 0) / maxYear.value) * 100);
const tape = computed(() => [...(data.value?.indexes || []), ...(data.value?.watch || [])]);
const shortName = r => ({ '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^DJI': 'Dow', '^TNX': '10Y', 'GC=F': 'Gold', 'BTC-USD': 'Bitcoin' }[r.symbol] || r.symbol);

// ---------- savings ideas ----------
const ideaColor = k => ({ savings: '#93c5fd', cds: '#fcd34d', invest: '#fda4af' }[k] || '#c4b5fd');
const badLogo = ref({});
</script>

<template>
  <div class="mkt" data-test="markets-page">
    <!-- The brief -->
    <section class="mkt-brief">
      <div class="mkt-brief-main">
        <div class="mkt-dateline">
          <p class="label">Market brief</p>
          <span class="mkt-status" :class="{ open: status.open }" data-test="market-status"><i />{{ status.text }}</span>
          <span class="muted small">Yahoo Finance{{ updated ? ` · updated ${updated}` : '' }}</span>
        </div>
        <h1 class="mkt-h1" data-test="markets-headline">{{ headline }}</h1>
        <p v-if="summary" class="mkt-lede" data-test="markets-summary">{{ summary }}</p>
        <p v-else-if="!error" class="mkt-lede muted">Loading today's markets…</p>
        <p v-if="error" class="empty-note">{{ error }} <button class="si-link" type="button" @click="load">Try again</button></p>
        <p v-if="brief" class="mkt-ai"><span class="ai-spark" aria-hidden="true">✦</span><span><b>For you:</b> {{ brief }} <span class="muted small">· {{ ai.used.news }}, on your device</span></span></p>
        <p v-else class="mkt-ai quiet"><span class="ai-spark" aria-hidden="true">✦</span><span>{{ savingsAdvice }}</span></p>
      </div>
      <aside class="mkt-you" data-test="money-today">
        <p class="label">Your money today</p>
        <div class="mkt-you-row"><span>Net worth</span><b>{{ moneyToday.netWorth !== null ? usd(moneyToday.netWorth) : '—' }}</b></div>
        <div class="mkt-you-row"><span>Emergency cushion</span><b>{{ moneyToday.cushion !== null ? `${moneyToday.cushion.toFixed(1)} months` : '—' }}</b></div>
        <div class="mkt-you-row"><span>Left to invest this month</span><b :class="{ gain: moneyToday.toInvest > 0 }">{{ moneyToday.toInvest !== null ? usd(moneyToday.toInvest) : '—' }}</b></div>
        <span class="muted small">{{ moneyToday.netWorth === null && moneyToday.toInvest === null ? 'Add accounts, an emergency fund goal and some income to see these.' : 'From your accounts, goals and budgets. Not shared with anyone.' }}</span>
      </aside>
    </section>

    <!-- Ticker -->
    <div v-if="tape.length" class="mkt-tape" aria-label="Prices today">
      <span v-for="r in tape" :key="r.symbol"><b>{{ shortName(r) }}</b>{{ plain(r) }} <span :class="tone(r.day)">{{ sign(r.day) }}</span></span>
    </div>

    <!-- Indexes -->
    <section v-if="data?.indexes?.length" class="mkt-section">
      <div class="mkt-sec-head"><p class="label">Indexes</p><span class="muted small">Today · 1-month trend</span></div>
      <div class="mkt-idx">
        <div v-for="r in data.indexes" :key="r.symbol" class="mk-tile" :title="r.about">
          <span class="small muted">{{ r.name }}</span>
          <b>{{ price(r) }}</b>
          <span class="mk-pill" :class="tone(r.day)">{{ sign(r.day) }}</span>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <polygon v-if="spark(r.spark)" :points="`0,40 ${spark(r.spark)} 100,40`" :fill="r.month >= 0 ? '#dcfce7' : '#ffe4e6'" />
            <polyline :points="spark(r.spark)" fill="none" :stroke="r.month >= 0 ? '#16a34a' : '#e11d48'" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
    </section>

    <!-- Stories and markets to watch -->
    <section class="mkt-two">
      <div>
        <div class="mkt-sec-head"><p class="label">Top stories</p><span class="muted small">Yahoo Finance</span></div>
        <a v-if="lead" class="mkt-lead" :href="lead.link" target="_blank" rel="noopener noreferrer">
          <span class="mkt-art" :data-topic="topic(lead.title)">{{ topic(lead.title) }}</span>
          <span>
            <span class="tag">Lead story{{ ago(lead.date) ? ` · ${ago(lead.date)}` : '' }}</span>
            <h3>{{ lead.title }}</h3>
            <span class="muted small">{{ lead.source }}</span>
          </span>
        </a>
        <ul class="mkt-stories mk-news">
          <li v-for="n in stories" :key="n.link">
            <a :href="n.link" target="_blank" rel="noopener noreferrer">{{ n.title }}</a>
            <span class="muted small">{{ n.source }}{{ ago(n.date) ? ` · ${ago(n.date)}` : '' }}</span>
            <span class="mkt-topic">{{ topic(n.title) }}</span>
          </li>
          <li v-if="data && !data.news.length" class="muted small">No headlines right now.</li>
        </ul>
      </div>
      <div>
        <div class="mkt-sec-head"><p class="label">Markets to watch</p><span class="muted small">Past year · 1 month</span></div>
        <ul class="mkt-watch">
          <li v-for="r in watchRanked" :key="r.symbol">
            <span class="mk-name"><b>{{ r.name }}</b> <span class="muted small">{{ r.symbol }}</span><span class="muted small mk-about">{{ r.about }}</span></span>
            <span class="mk-bar"><i :class="tone(r.year)" :style="{ width: barWidth(r.year) + '%' }" /></span>
            <span class="mk-num"><b :class="tone(r.year)">{{ sign(r.year) }}</b><span class="muted small" :class="tone(r.month)">{{ sign(r.month) }} 1 mo</span></span>
          </li>
          <li v-if="data && !data.watch.length" class="muted small">Fund data is not available right now.</li>
        </ul>
        <p class="muted small mkt-note">Broad funds many people use to grow savings. Past growth does not predict future growth.</p>
        <GrowthCalc />
      </div>
    </section>

    <!-- Savings ideas -->
    <section id="opportunities" class="mkt-section">
      <div class="mkt-sec-head"><p class="label">Savings ideas for your banks</p><span class="muted small">Rates change daily · check the bank's page</span></div>
      <div class="mkt-ideas">
        <a v-for="o in savingsIdeas" :key="o.p.url" class="mkt-idea" :href="o.p.url" target="_blank" rel="noopener noreferrer" :style="{ '--c': ideaColor(o.kind) }">
          <span class="mkt-idea-bank">
            <img v-if="!badLogo[o.bank.domain]" :src="logoUrl(o.bank.domain)" :alt="`${o.bank.name} logo`" width="16" height="16" @error="badLogo[o.bank.domain] = true" />
            {{ o.bank.name }}
          </span>
          <h4>{{ o.title }}</h4>
          <span class="muted small">{{ o.body }}</span>
          <span class="mkt-idea-link">Today's rate on {{ o.bank.domain }} ↗</span>
        </a>
      </div>
      <p class="meta small">Information, not financial advice. Prices may be delayed. Past performance does not predict future results.</p>
    </section>
  </div>
</template>
