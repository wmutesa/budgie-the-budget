// Live exchange rates. Tries ExchangeRate-API's open endpoint first (160+
// currencies, refreshed daily), then Frankfurter (European Central Bank rates).
// The last good response is cached so the app still converts when offline.
import { reactive, ref } from 'vue';

// A clock that ticks every 30 seconds so relative times stay current.
export const now = ref(Date.now());
if (typeof window !== 'undefined') setInterval(() => { now.value = Date.now(); }, 30000);

const CACHE_KEY = 'budgie.rates';
const MAX_AGE_MS = 60 * 60 * 1000;

export const rates = reactive({
  base: 'USD',
  values: {},
  updated: null,
  fetchedAt: null,
  source: '',
  status: 'idle', // idle | loading | live | cached | stale | error
});

const SOURCES = [
  {
    name: 'ExchangeRate-API',
    url: base => `https://open.er-api.com/v6/latest/${base}`,
    parse: j => (j && j.result === 'success' && j.rates ? { values: j.rates, updated: j.time_last_update_utc } : null),
  },
  {
    name: 'Frankfurter (ECB)',
    url: base => `https://api.frankfurter.app/latest?from=${base}`,
    parse: j => (j && j.rates ? { values: { ...j.rates, [j.base]: 1 }, updated: j.date } : null),
  },
];

function readCache(base) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    return c && c.base === base ? c : null;
  } catch { return null; }
}

function apply(data, status) {
  Object.assign(rates, { base: data.base, values: data.values, updated: data.updated, fetchedAt: data.fetchedAt, source: data.source, status });
}

export async function loadRates(base = 'USD', { force = false } = {}) {
  const cached = readCache(base);
  if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) {
    apply(cached, 'cached');
    return;
  }
  rates.status = 'loading';
  for (const s of SOURCES) {
    try {
      const res = await fetch(s.url(base), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = s.parse(await res.json());
      if (!parsed) throw new Error('unexpected response');
      const data = { base, values: parsed.values, updated: parsed.updated, fetchedAt: Date.now(), source: s.name };
      apply(data, 'live');
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
      return;
    } catch { /* try the next source */ }
  }
  if (cached) apply(cached, 'stale');
  else rates.status = 'error';
}

// Convert between any two currencies the loaded rates know about.
export function convert(amount, from, to = rates.base) {
  if (from === to) return amount;
  const v = rates.values;
  if (!v[from] || !v[to]) return null;
  return (amount / v[from]) * v[to];
}

export function ratesLabel() {
  const mins = rates.fetchedAt ? Math.max(0, Math.round((now.value - rates.fetchedAt) / 60000)) : null;
  const t = mins === null ? '' : mins < 1 ? 'just now' : `${mins} min ago`;
  switch (rates.status) {
    case 'loading': return 'Fetching live rates…';
    case 'live': return `Live · ${t} · ${rates.source}`;
    case 'cached': return `Updated ${t} · ${rates.source}`;
    case 'stale': return `Offline · last saved ${t}`;
    case 'error': return 'Rates unavailable right now';
    default: return '';
  }
}
