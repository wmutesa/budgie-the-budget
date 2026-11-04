// AI for reading receipts and writing suggestions. It runs on Cloudflare
// Workers AI (open models such as Meta's Llama, the same family Ollama runs),
// through Budgie's own Worker, for signed-in people. Without it, Budgie uses
// its built-in rules.
import { reactive } from 'vue';
import { CATEGORIES } from './categorize';

export const ai = reactive({ status: 'unknown', model: '', label: 'Built-in rules' }); // unknown | cloud | rules

async function post(body, timeout = 30000) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) return null;
  return (await res.json()).result ?? null;
}

// Ask the Worker whether AI is available. Called after signing in.
export async function detectAI() {
  try {
    const res = await fetch('/api/ai', { credentials: 'same-origin', signal: AbortSignal.timeout(5000) });
    const j = res.ok ? await res.json() : {};
    if (j.available) { Object.assign(ai, { status: 'cloud', model: j.model, label: `Cloudflare AI · ${j.name || j.model}` }); return true; }
  } catch { /* offline or not signed in */ }
  Object.assign(ai, { status: 'rules', model: '', label: 'Built-in rules' });
  return false;
}

// Read receipt text into { merchant, date, total, currency, category }. Returns null when unavailable.
export async function aiReadReceipt(text) {
  if (ai.status !== 'cloud') return null;
  try {
    const out = await post({ task: 'receipt', text: text.slice(0, 4000), categories: CATEGORIES }, 45000);
    return out && typeof out.total === 'number' ? out : null;
  } catch { return null; }
}

// A short read on the month from the given facts. Returns null when unavailable.
export async function aiAdvise(facts) {
  if (ai.status !== 'cloud') return null;
  try {
    const out = await post({ task: 'advice', facts: facts.slice(0, 20) });
    return typeof out === 'string' && out.trim() ? out.trim() : null;
  } catch { return null; }
}
