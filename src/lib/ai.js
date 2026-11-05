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
// The processor engine's WebAssembly file, served from Budgie's own site.
import wllamaWasm from '@wllama/wllama/esm/wasm/wllama.wasm?url';

const OLLAMA = 'http://localhost:11434';
const OFF_KEY = 'budgie.ai'; // 'off' when someone turned AI off on this device

// Each model comes in two builds: a lighter one for graphics chips with
// half-precision maths (most Chrome and Edge devices) and one for the rest
// (often Safari).
export const MODELS = {
  small: { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', id32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC', name: 'Qwen 2.5', size: 'about 300 MB', mb: 450, good: 'receipts' },
  medium: { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', id32: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', name: 'Llama 3.2', size: 'about 900 MB', mb: 1300, good: 'writing' },
  // Runs on the processor (llama.cpp in WebAssembly), so it works in any modern
  // browser, including those without WebGPU. Slower, used when the others cannot run.
  cpu: { url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf', name: 'Qwen 2.5 (processor)', size: 'about 490 MB', mb: 700, good: 'any browser' },
};
const FAIL_KEY = 'budgie.aiFailed'; // when the last automatic start failed, to avoid retrying on every visit
const STALL_MS = 90 * 1000;          // give up if a download makes no progress for this long
// For each task, which models to try, in order.
const ROUTES = {
  receipt: ['ollama', 'small', 'medium', 'cpu'],
  advice: ['ollama', 'medium', 'small', 'cpu'],
  budget: ['ollama', 'medium', 'small', 'cpu'],
  news: ['ollama', 'medium', 'small', 'cpu'],
  account: ['ollama', 'small', 'medium', 'cpu'],
};

const engineState = () => ({ state: 'idle', progress: 0, text: '', error: '', detail: '' }); // idle | loading | ready | error | skipped | waiting
export const ai = reactive({
  enabled: true,
  ollama: { state: 'checking', model: '' }, // checking | ready | absent
  small: engineState(),
  medium: engineState(),
  cpu: engineState(),
  ready: false,                  // any model can answer
  label: 'Built-in rules',       // what is available right now
  used: { receipt: '', advice: '', budget: '', news: '', account: '' }, // which model last did each task
  note: '',                      // e.g. waiting for a faster connection
});

const engines = { small: null, medium: null, cpu: null };
const loading = { small: null, medium: null, cpu: null };

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
const nameOf = key => (key === 'ollama' ? `Ollama · ${ai.ollama.model}` : key === 'cpu' ? 'Qwen 2.5 (in browser, processor)' : `${MODELS[key].name} (in browser)`);
function refreshLabel() {
  const ready = ['ollama', 'medium', 'small', 'cpu'].filter(isReady);
  ai.ready = ready.length > 0;
  ai.label = ready.length ? `AI · ${ready.map(k => (k === 'ollama' ? 'Ollama' : MODELS[k].name)).join(' + ')}` : 'Built-in rules';
}

// The label for a card: which model handles this task now.
export function labelFor(task) {
  if (!ai.enabled) return 'Built-in rules';
  const key = ROUTES[task].find(isReady);
  if (key) return nameOf(key);
  const busy = ['small', 'cpu'].find(k => ai[k].state === 'loading');
  return busy ? `Built-in rules · AI loading ${ai[busy].progress}%` : 'Built-in rules';
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
// Can this device run a model? Checks the graphics chip, half-precision support and storage.
let gpuInfo = null;
async function checkDevice() {
  if (gpuInfo) return gpuInfo;
  if (!browserAISupported()) return (gpuInfo = { ok: false, why: 'This browser cannot run AI on the device. Use an up-to-date Chrome, Edge or Safari on a recent device.' });
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return (gpuInfo = { ok: false, why: 'This device did not offer its graphics chip to the browser, so the AI cannot run here. Budgie uses its built-in rules.' });
    gpuInfo = { ok: true, f16: adapter.features.has('shader-f16') };
  } catch {
    return (gpuInfo = { ok: false, why: 'The graphics chip could not be reached, so the AI cannot run here.' });
  }
  try {
    const { quota = 0, usage = 0 } = await navigator.storage?.estimate?.() || {};
    gpuInfo.freeMB = quota ? Math.round((quota - usage) / 1048576) : null;
  } catch { gpuInfo.freeMB = null; }
  return gpuInfo;
}
const modelId = (key, info) => (info?.f16 ? MODELS[key].id : MODELS[key].id32);

// Plain words for what went wrong.
function explain(e) {
  const m = String(e?.message || e || '');
  if (/shader-f16|f16/i.test(m)) return 'This graphics chip does not support the faster model build.';
  if (/quota|storage|QuotaExceeded/i.test(m)) return 'Not enough free storage in this browser for the model. Free up space, then try again.';
  if (/network|fetch|Failed to fetch|Load failed|NetworkError/i.test(m)) return 'The model could not download. Check your connection, then try again.';
  if (/memory|out of memory|allocation/i.test(m)) return 'This device ran out of memory loading the model.';
  if (/stalled/i.test(m)) return 'The download stopped making progress. Try again on a steadier connection.';
  return `The AI could not start (${m.slice(0, 120) || 'unknown reason'}).`;
}

export function loadModel(key) {
  if (engines[key]) return Promise.resolve(true);
  if (loading[key]) return loading[key];
  Object.assign(ai[key], { state: 'loading', progress: 0, text: 'Checking this device…', error: '' });
  loading[key] = (async () => {
    let worker = null;
    let stall = null;
    try {
      const info = await checkDevice();
      if (!info.ok) throw Object.assign(new Error(info.why), { plain: true });
      if (info.freeMB !== null && info.freeMB < MODELS[key].mb) throw Object.assign(new Error(`Not enough free storage in this browser for ${MODELS[key].name} (needs about ${MODELS[key].mb} MB).`), { plain: true });
      const webllm = await import('@mlc-ai/web-llm');
      worker = new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' });
      // Stop if the download makes no progress for a while, or the worker crashes.
      let last = Date.now();
      const watchdog = new Promise((_, reject) => {
        stall = setInterval(() => { if (Date.now() - last > STALL_MS) reject(new Error('stalled')); }, 5000);
        worker.addEventListener('error', ev => { ev.preventDefault?.(); reject(new Error(ev.message || 'the AI worker stopped')); });
      });
      const engine = webllm.CreateWebWorkerMLCEngine(worker, modelId(key, info), {
        initProgressCallback: p => { last = Date.now(); Object.assign(ai[key], { progress: Math.round((p.progress || 0) * 100), text: p.text || '' }); },
      });
      engines[key] = await Promise.race([engine, watchdog]);
      Object.assign(ai[key], { state: 'ready', progress: 100, text: '' });
      write(FAIL_KEY, null);
      return true;
    } catch (e) {
      engines[key] = null;
      try { worker?.terminate(); } catch { /* already gone */ }
      Object.assign(ai[key], { state: 'error', error: e?.plain ? e.message : explain(e), detail: String(e?.message || e || '').slice(0, 300) });
      if (key === 'small') write(FAIL_KEY, String(Date.now()));
      return false;
    } finally {
      clearInterval(stall);
      loading[key] = null;
      refreshLabel();
    }
  })();
  return loading[key];
}

// Errors from inside the AI library must never break the page.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', ev => {
    const m = String(ev.reason?.message || ev.reason || '');
    if (/webgpu|gpu|mlc|tvm|shader|wasm|model|adapter|device lost|wllama|llama|gguf/i.test(m)) {
      ev.preventDefault();
      for (const key of ['small', 'medium', 'cpu']) if (ai[key].state === 'loading' || ai[key].state === 'ready') {
        engines[key] = null;
        Object.assign(ai[key], { state: 'error', error: explain(ev.reason) });
      }
      refreshLabel();
    }
  });
}

// ---------- Processor engine (wllama: llama.cpp in WebAssembly) ----------
export function loadCpuModel() {
  if (engines.cpu) return Promise.resolve(true);
  if (loading.cpu) return loading.cpu;
  Object.assign(ai.cpu, { state: 'loading', progress: 0, text: 'Starting…', error: '', detail: '' });
  loading.cpu = (async () => {
    try {
      if (typeof WebAssembly !== 'object') throw Object.assign(new Error('This browser cannot run WebAssembly.'), { plain: true });
      const { Wllama } = await import('@wllama/wllama');
      const w = new Wllama({ default: wllamaWasm }, { suppressNativeLog: true });
      let last = Date.now();
      const stall = new Promise((_, reject) => {
        const t = setInterval(() => { if (Date.now() - last > STALL_MS) { clearInterval(t); reject(new Error('stalled')); } }, 5000);
        loading.cpuTimer = t;
      });
      await Promise.race([
        w.loadModelFromUrl(MODELS.cpu.url, {
          n_ctx: 2048,
          progressCallback: ({ loaded, total }) => { last = Date.now(); Object.assign(ai.cpu, { progress: total ? Math.round((loaded / total) * 100) : 0, text: 'Downloading' }); },
        }),
        stall,
      ]);
      engines.cpu = w;
      Object.assign(ai.cpu, { state: 'ready', progress: 100, text: '' });
      return true;
    } catch (e) {
      engines.cpu = null;
      Object.assign(ai.cpu, { state: 'error', error: e?.plain ? e.message : explain(e), detail: String(e?.message || e || '').slice(0, 300) });
      return false;
    } finally {
      clearInterval(loading.cpuTimer);
      loading.cpu = null;
      refreshLabel();
    }
  })();
  return loading.cpu;
}

async function browserChat(key, messages, { temperature = 0, max_tokens = 200 } = {}) {
  if (key === 'cpu') {
    const out = await engines.cpu.createChatCompletion({ messages, temperature, max_tokens });
    return out.choices?.[0]?.message?.content || '';
  }
  const out = await engines[key].chat.completions.create({ messages, temperature, max_tokens });
  return out.choices?.[0]?.message?.content || '';
}

// Download and start the browser models in the background.
export async function startBrowserModels({ force = false } = {}) {
  if (!ai.enabled) return;
  const info = await checkDevice();
  if (!info.ok) {
    // No usable graphics chip: run on the processor instead.
    Object.assign(ai.small, { state: 'skipped', error: info.why });
    Object.assign(ai.medium, { state: 'skipped', error: '' });
    refreshLabel();
    if (!force && meteredConnection()) { ai.cpu.state = 'waiting'; ai.note = 'The AI model waits for a faster connection before downloading.'; return; }
    await loadCpuModel();
    return;
  }
  // After a failed automatic start, wait a day before trying again on its own.
  const failed = Number(read(FAIL_KEY)) || 0;
  if (!force && failed && Date.now() - failed < 864e5) {
    if (ai.small.state === 'idle') Object.assign(ai.small, { state: 'error', error: 'The AI did not start last time. Use Try again to retry now.' });
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
  else await loadCpuModel(); // the graphics chip failed: fall back to the processor
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
  for (const key of ['small', 'medium', 'cpu']) {
    try { await (key === 'cpu' ? engines.cpu?.exit?.() : engines[key]?.unload?.()); } catch { /* already gone */ }
    engines[key] = null;
    Object.assign(ai[key], engineState());
  }
  try { const { Wllama } = await import('@wllama/wllama'); await new Wllama({ default: wllamaWasm }).cacheManager?.clear?.(); } catch { /* nothing cached */ }
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
