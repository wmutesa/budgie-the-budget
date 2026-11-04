// Checks the logo of every company in the built-in directory and reports
// what changed since the last run. Used by .github/workflows/logo-refresh.yml.
// Usage: node scripts/check-logos.mjs [previous-state.json] > result.json
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const src = readFileSync(new URL('../src/data/directory.js', import.meta.url), 'utf8');
const raw = src.slice(src.indexOf('`') + 1, src.indexOf('`', src.indexOf('`') + 1));
const companies = [...new Map(raw.split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => l.split('|')).filter(p => p[1]).map(([name, domain]) => [domain, { name, domain }])).values()];

let previous = {};
try { if (process.argv[2]) previous = JSON.parse(readFileSync(process.argv[2], 'utf8')); } catch { previous = {}; }

// Same order as the app: Google first, then DuckDuckGo's icon service.
const sources = [
  d => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`,
  d => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(d)}.ico`,
];
async function fetchIcon(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status === 404) return null;           // no icon for this site
      if (!res.ok) throw new Error(String(res.status));
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 100) return null;          // empty placeholder
      return createHash('sha1').update(bytes).digest('hex').slice(0, 10);
    } catch { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
  }
  return 'error';
}
async function check({ domain }) {
  let sawError = false;
  for (const [i, src] of sources.entries()) {
    const hash = await fetchIcon(src(domain));
    if (hash === 'error') { sawError = true; continue; }
    if (hash) { if (i > 0) fallbackUsed.push(domain); return hash; }
  }
  return sawError ? 'error' : null;
}
const fallbackUsed = [];

const state = {};
const queue = [...companies];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) { const c = queue.shift(); state[c.domain] = await check(c); }
}));

const first = Object.keys(previous).length === 0;
const list = kind => companies.filter(c => {
  const now = state[c.domain], was = previous[c.domain];
  if (kind === 'missing') return now === null;
  if (kind === 'error') return now === 'error';
  if (first || now === 'error' || was === 'error') return false;
  if (kind === 'new') return (c.domain in previous) && now && !was;
  if (kind === 'updated') return now && was && now !== was;
  if (kind === 'lost') return !now && was;
  if (kind === 'added') return !(c.domain in previous) && now;
  return false;
}).map(c => `${c.name} (${c.domain})`);

const result = {
  checkedAt: new Date().toISOString(),
  total: companies.length,
  withLogo: companies.filter(c => state[c.domain] && state[c.domain] !== 'error').length,
  missing: list('missing'),
  errors: list('error'),
  updated: list('updated'),
  found: list('new'),
  lost: list('lost'),
  added: list('added'),
  firstRun: first,
  fromFallback: companies.filter(c => fallbackUsed.includes(c.domain)).map(c => `${c.name} (${c.domain})`),
  state,
};
process.stdout.write(JSON.stringify(result));
