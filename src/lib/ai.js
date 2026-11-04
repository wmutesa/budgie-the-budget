// Optional AI for reading receipts and writing suggestions. Everything runs on
// the person's own device; nothing goes to a cloud AI service and no API key
// is needed. In order of preference:
//   1. Ollama, if it is running on this computer.
//   2. An open-source model running inside the browser (WebLLM, using the
//      device's graphics chip), once turned on from the account menu. The model
//      downloads once and the browser keeps it.
//   3. Budgie's built-in rules.
import { reactive } from 'vue';
import { CATEGORIES } from './categorize';

const OLLAMA = 'http://localhost:11434';
const SETTING = 'budgie.browserModel'; // per device: which in-browser model is turned on

// Small open models that run in a browser. Sizes are the one-time download.
export const BROWSER_MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 · small', size: 'about 300 MB', note: 'Quickest, works on most recent laptops and phones' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 · medium', size: 'about 900 MB', note: 'Better writing, needs a newer device' },
];

export const ai = reactive({
  status: 'unknown',   // unknown | ollama | browser | rules
  ready: false,        // true when a model can answer
  model: '',
  label: 'Built-in rules',
  browser: { state: 'off', progress: 0, text: '', error: '', model: '' }, // off | loading | ready | error
});

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage blocked */ } };

// WebGPU is what lets a browser run a model on the graphics chip.
export const browserAISupported = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

function settle() {
  if (ai.status === 'ollama') return;
  if (ai.browser.state === 'ready') {
    const m = BROWSER_MODELS.find(x => x.id === ai.browser.model);
    Object.assign(ai, { status: 'browser', ready: true, model: ai.browser.model, label: `In-browser AI · ${m ? m.name.split(' ·')[0] : 'open model'}` });
  } else {
    Object.assign(ai, { status: 'rules', ready: false, model: '', label: 'Built-in rules' });
  }
}

// ---------- Ollama ----------
async function detectOllama() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const j = await res.json();
    const model = (j.models || [])[0]?.name;
    if (model) { Object.assign(ai, { status: 'ollama', ready: true, model, label: `Ollama · ${model}` }); return true; }
  } catch { /* not running */ }
  return false;
}

async function ollamaChat(messages, { json = false, temperature = 0 } = {}) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: ai.model, stream: false, ...(json ? { format: 'json' } : {}), options: { temperature }, messages }),
  });
  return (await res.json()).message?.content || '';
}

// ---------- In-browser model (WebLLM) ----------
let engine = null;
let loading = null;

export async function startBrowserAI(modelId = BROWSER_MODELS[0].id) {
  if (!browserAISupported()) {
    Object.assign(ai.browser, { state: 'error', error: 'This browser cannot run AI on the device. Try an up-to-date Chrome, Edge or Safari on a recent device.' });
    return false;
  }
  if (engine && ai.browser.model === modelId) return true;
  if (loading) return loading;
  Object.assign(ai.browser, { state: 'loading', progress: 0, text: 'Starting…', error: '', model: modelId });
  loading = (async () => {
    try {
      const webllm = await import('@mlc-ai/web-llm');
      if (engine) { await engine.unload?.(); engine = null; }
      engine = await webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' }),
        modelId,
        { initProgressCallback: p => Object.assign(ai.browser, { progress: Math.round((p.progress || 0) * 100), text: p.text || '' }) },
      );
      write(SETTING, modelId);
      Object.assign(ai.browser, { state: 'ready', progress: 100, text: '' });
      settle();
      return true;
    } catch (e) {
      engine = null;
      Object.assign(ai.browser, { state: 'error', error: `The model could not start: ${e?.message || e}` });
      settle();
      return false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

// Turn the in-browser model off on this device and delete its download.
export async function removeBrowserAI() {
  const id = ai.browser.model || read(SETTING);
  try { await engine?.unload?.(); } catch { /* already gone */ }
  engine = null;
  write(SETTING, null);
  Object.assign(ai.browser, { state: 'off', progress: 0, text: '', error: '', model: '' });
  settle();
  if (id) {
    try { const webllm = await import('@mlc-ai/web-llm'); await webllm.deleteModelAllInfoInCache(id); } catch { /* nothing cached */ }
  }
}

async function browserChat(messages, { temperature = 0, max_tokens = 200 } = {}) {
  const out = await engine.chat.completions.create({ messages, temperature, max_tokens });
  return out.choices?.[0]?.message?.content || '';
}

// ---------- start ----------
export async function detectAI() {
  if (await detectOllama()) return true;
  settle();
  const chosen = read(SETTING);
  if (chosen && browserAISupported()) startBrowserAI(chosen); // the model is already downloaded, so this is quick
  return false;
}

// ---------- tasks ----------
function chat(messages, opts) {
  if (ai.status === 'ollama') return ollamaChat(messages, opts);
  if (ai.status === 'browser' && engine) return browserChat(messages, opts);
  return Promise.resolve('');
}
function firstJSON(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

// Read receipt text into { merchant, date, total, currency, category }. Returns null when unavailable.
export async function aiReadReceipt(text) {
  if (!ai.ready) return null;
  try {
    const reply = await chat([
      { role: 'system', content: `Read receipt text. Reply with JSON only: {"merchant": string, "date": "YYYY-MM-DD" or null, "total": number, "currency": ISO 4217 code, "category": one of ${JSON.stringify(CATEGORIES)}}. Use only facts in the text.` },
      { role: 'user', content: text.slice(0, 4000) },
    ], { json: true, temperature: 0, max_tokens: 200 });
    const out = firstJSON(reply);
    return out && typeof out.total === 'number' ? out : null;
  } catch { return null; }
}

// A short read on the month from the given facts. Returns null when unavailable.
export async function aiAdvise(facts) {
  if (!ai.ready) return null;
  try {
    const reply = await chat([
      { role: 'system', content: 'You are a careful budgeting assistant. In three short sentences, say how the month is going and the single most useful next step. Use only the facts given. No made-up numbers, no bank rates.' },
      { role: 'user', content: facts.join('\n') },
    ], { temperature: 0.2, max_tokens: 160 });
    return reply.trim() || null;
  } catch { return null; }
}
