// AI for reading receipts and writing suggestions. It is on by default and runs
// on the person's own device: no cloud AI service, no API key.
//
// Models, best first, and Budgie picks per task from whichever are ready:
//   - Ollama, if it is running on this computer (usually the largest model).
//   - In the browser (WebLLM on the graphics chip), downloaded once and kept:
//       Qwen 2.5 small: quick and good at structured answers (receipts).
//       Llama 3.2 medium: better writing (suggestions), on capable devices.
//   - Budgie's built-in rules, when no model is ready.
// If a model fails, the next one takes over.
import { reactive } from 'vue';
import { CATEGORIES } from './categorize';

const OLLAMA = 'http://localhost:11434';
const OFF_KEY = 'budgie.ai'; // 'off' when someone turned AI off on this device

export const MODELS = {
  small: { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5', size: 'about 300 MB', good: 'receipts' },
  medium: { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2', size: 'about 900 MB', good: 'writing' },
};
// For each task, which models to try, in order.
const ROUTES = {
  receipt: ['ollama', 'small', 'medium'],
  advice: ['ollama', 'medium', 'small'],
  budget: ['ollama', 'medium', 'small'],
  news: ['ollama', 'medium', 'small'],
  account: ['ollama', 'small', 'medium'],
};

const engineState = () => ({ state: 'idle', progress: 0, text: '', error: '' }); // idle | loading | ready | error | skipped | waiting
export const ai = reactive({
  enabled: true,
  ollama: { state: 'checking', model: '' }, // checking | ready | absent
  small: engineState(),
  medium: engineState(),
  ready: false,                  // any model can answer
  label: 'Built-in rules',       // what is available right now
  used: { receipt: '', advice: '', budget: '', news: '', account: '' }, // which model last did each task
  note: '',                      // e.g. waiting for a faster connection
});

const engines = { small: null, medium: null };
const loading = { small: null, medium: null };

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage blocked */ } };

export const browserAISupported = () => typeof navigator !== 'undefined' && 'gpu' in navigator;
// Large downloads wait on slow or data-saving connections.
const meteredConnection = () => {
  const c = navigator.connection;
  return Boolean(c && (c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType)));
};
// The medium model only on devices that report enough memory (or do not say).
const capableDevice = () => !navigator.deviceMemory || navigator.deviceMemory >= 8;

const isReady = key => (key === 'ollama' ? ai.ollama.state === 'ready' : ai[key].state === 'ready' && Boolean(engines[key]));
const nameOf = key => (key === 'ollama' ? `Ollama · ${ai.ollama.model}` : `${MODELS[key].name} (in browser)`);
function refreshLabel() {
  const ready = ['ollama', 'medium', 'small'].filter(isReady);
  ai.ready = ready.length > 0;
  ai.label = ready.length ? `AI · ${ready.map(k => (k === 'ollama' ? 'Ollama' : MODELS[k].name)).join(' + ')}` : 'Built-in rules';
}

// The label for a card: which model handles this task now.
export function labelFor(task) {
  if (!ai.enabled) return 'Built-in rules';
  const key = ROUTES[task].find(isReady);
  if (key) return nameOf(key);
  return ai.small.state === 'loading' ? `Built-in rules · AI loading ${ai.small.progress}%` : 'Built-in rules';
}

// ---------- Ollama ----------
async function detectOllama() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const j = await res.json();
    const model = (j.models || [])[0]?.name;
    Object.assign(ai.ollama, model ? { state: 'ready', model } : { state: 'absent', model: '' });
  } catch { Object.assign(ai.ollama, { state: 'absent', model: '' }); }
  refreshLabel();
}

async function ollamaChat(messages, { json = false, temperature = 0 } = {}) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: ai.ollama.model, stream: false, ...(json ? { format: 'json' } : {}), options: { temperature }, messages }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  return (await res.json()).message?.content || '';
}

// ---------- In-browser models ----------
export function loadModel(key) {
  if (!browserAISupported()) { Object.assign(ai[key], { state: 'error', error: 'This browser cannot run AI on the device.' }); return Promise.resolve(false); }
  if (engines[key]) return Promise.resolve(true);
  if (loading[key]) return loading[key];
  Object.assign(ai[key], { state: 'loading', progress: 0, text: 'Starting…', error: '' });
  loading[key] = (async () => {
    try {
      const webllm = await import('@mlc-ai/web-llm');
      engines[key] = await webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' }),
        MODELS[key].id,
        { initProgressCallback: p => Object.assign(ai[key], { progress: Math.round((p.progress || 0) * 100), text: p.text || '' }) },
      );
      Object.assign(ai[key], { state: 'ready', progress: 100, text: '' });
      return true;
    } catch (e) {
      engines[key] = null;
      Object.assign(ai[key], { state: 'error', error: String(e?.message || e).slice(0, 200) });
      return false;
    } finally {
      loading[key] = null;
      refreshLabel();
    }
  })();
  return loading[key];
}

async function browserChat(key, messages, { temperature = 0, max_tokens = 200 } = {}) {
  const out = await engines[key].chat.completions.create({ messages, temperature, max_tokens });
  return out.choices?.[0]?.message?.content || '';
}

// Download and start the browser models in the background.
export async function startBrowserModels({ force = false } = {}) {
  if (!ai.enabled) return;
  if (!browserAISupported()) {
    Object.assign(ai.small, { state: 'error', error: 'This browser cannot run AI on the device, so Budgie uses its built-in rules.' });
    return;
  }
  if (!force && meteredConnection()) {
    if (ai.small.state !== 'ready') ai.small.state = 'waiting';
    ai.note = 'The AI model waits for a faster connection before downloading.';
    return;
  }
  ai.note = '';
  const ok = await loadModel('small');
  if (ok && (force || capableDevice())) loadModel('medium');
  else if (ok) Object.assign(ai.medium, { state: 'skipped', error: '' });
}

// ---------- on and off ----------
export async function detectAI() {
  ai.enabled = read(OFF_KEY) !== 'off';
  if (!ai.enabled) { refreshLabel(); return; }
  await detectOllama();
  startBrowserModels();
}

export async function setAIEnabled(on) {
  ai.enabled = on;
  write(OFF_KEY, on ? null : 'off');
  if (on) return detectAI();
  // Off: stop the models and delete their downloads from this device.
  for (const key of ['small', 'medium']) {
    try { await engines[key]?.unload?.(); } catch { /* already gone */ }
    engines[key] = null;
    Object.assign(ai[key], engineState());
  }
  ai.note = '';
  refreshLabel();
  try {
    const webllm = await import('@mlc-ai/web-llm');
    for (const m of Object.values(MODELS)) await webllm.deleteModelAllInfoInCache(m.id).catch(() => {});
  } catch { /* nothing cached */ }
}

// ---------- tasks: the router ----------
async function route(task, messages, opts) {
  if (!ai.enabled) return null;
  for (const key of ROUTES[task]) {
    if (!isReady(key)) continue;
    try {
      const reply = key === 'ollama' ? await ollamaChat(messages, opts) : await browserChat(key, messages, opts);
      if (reply && reply.trim()) { ai.used[task] = nameOf(key); return reply; }
    } catch { /* try the next model */ }
  }
  ai.used[task] = 'Built-in rules';
  return null;
}
function firstJSON(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

// Read receipt text into { merchant, date, total, currency, category }. Returns null when no model is ready.
export async function aiReadReceipt(text) {
  const reply = await route('receipt', [
    { role: 'system', content: `Read receipt text. Reply with JSON only: {"merchant": string, "date": "YYYY-MM-DD" or null, "total": number, "currency": ISO 4217 code, "category": one of ${JSON.stringify(CATEGORIES)}}. Use only facts in the text.` },
    { role: 'user', content: text.slice(0, 4000) },
  ], { json: true, temperature: 0, max_tokens: 200 });
  const out = firstJSON(reply);
  return out && typeof out.total === 'number' ? out : null;
}

// Draft monthly budgets from income and spending. Returns [{ name, budget }] or null.
export async function aiDraftBudgets(input) {
  const subs = Object.fromEntries(Object.entries(input.subs).map(([k, v]) => [k, Math.round(v)]));
  const facts = [
    `Monthly income: ${input.income ? `$${input.income}` : 'unknown'}.`,
    `Average monthly spending by category: ${JSON.stringify(input.spend)}.`,
    `Subscriptions per month by category: ${JSON.stringify(subs)}.`,
    `Planned monthly amounts: ${JSON.stringify(input.planned)}.`,
  ].join(' ');
  const reply = await route('budget', [
    { role: 'system', content: `You set realistic monthly budgets in US dollars. Choose 4 to 8 categories, only from this list: ${JSON.stringify(input.allowed)}. Base amounts on the facts: cover real spending with a little room, follow planned amounts, and keep the total under 90% of income when income is known. Reply with JSON only: {"budgets": [{"category": string, "amount": number}]}` },
    { role: 'user', content: facts },
  ], { json: true, temperature: 0.1, max_tokens: 300 });
  const out = firstJSON(reply);
  const list = Array.isArray(out?.budgets) ? out.budgets : null;
  return list ? list.map(b => ({ name: String(b.category || b.name || ''), budget: Number(b.amount ?? b.budget) })) : null;
}

// Two plain sentences on what today's market headlines mean for someone saving.
export async function aiNewsBrief(headlines, situation) {
  if (!headlines.length) return null;
  const reply = await route('news', [
    { role: 'system', content: 'You explain market news to a careful saver. In two short sentences, say what these headlines mean for someone building savings, using only the headlines and situation given. Do not recommend specific investments, do not predict prices, and do not invent numbers.' },
    { role: 'user', content: `Situation: ${situation}\nHeadlines:\n${headlines.slice(0, 8).map(h => `- ${h}`).join('\n')}` },
  ], { temperature: 0.2, max_tokens: 140 });
  return reply ? reply.trim() : null;
}

// Which of the person's accounts a note says they paid with. Returns the account text or null.
export async function aiPickAccount(text, accounts) {
  if (!ai.ready || accounts.length < 2) return null;
  const reply = await route('account', [
    { role: 'system', content: `Which account paid for this? Accounts: ${JSON.stringify(accounts)}. Reply with JSON only: {"account": one of the accounts exactly, or null if the text does not say}.` },
    { role: 'user', content: String(text).slice(0, 300) },
  ], { json: true, temperature: 0, max_tokens: 40 });
  const out = firstJSON(reply);
  return typeof out?.account === 'string' && accounts.includes(out.account) ? out.account : null;
}

// A short read on the month from the given facts. Returns null when no model is ready.
export async function aiAdvise(facts) {
  const reply = await route('advice', [
    { role: 'system', content: 'You are a careful budgeting assistant. In three short sentences, say how the month is going and the single most useful next step. Use only the facts given. No made-up numbers, no bank rates.' },
    { role: 'user', content: facts.join('\n') },
  ], { temperature: 0.2, max_tokens: 160 });
  return reply ? reply.trim() : null;
}
