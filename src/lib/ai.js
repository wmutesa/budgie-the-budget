// AI for planning, goals and digests. It is on by default and runs
// on the person's own device: no cloud AI service, no API key.
//
// Models, best first, and Taskie picks per task from whichever are ready:
//   - Ollama, if it is running on this computer (usually the largest model).
//   - In the browser (WebLLM on the graphics chip), downloaded once and kept:
//       Qwen 2.5 small: quick and good at structured answers (steps, routines).
//       Qwen 2.5 1.5B: much better at turning what you said into tasks, dates
//       and categories, and at writing; on capable devices.
//   - Taskie's built-in rules, when no model is ready.
// If a model fails, the next one takes over.
import { reactive } from 'vue';
// The processor engine's WebAssembly file, from the jsDelivr CDN (same pinned
// version as the package), so the site itself stays small.
const wllamaWasm = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/wasm/wllama.wasm';
const WLLAMA_JS = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js';

const OLLAMA = 'http://localhost:11434';
const OFF_KEY = 'budgie.ai'; // 'off' when someone turned AI off on this device

// Each model comes in two builds: a lighter one for graphics chips with
// half-precision maths (most Chrome and Edge devices) and one for the rest
// (often Safari).
export const MODELS = {
  small: { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', id32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC', name: 'Qwen 2.5', size: 'about 300 MB', mb: 450, good: 'quick answers' },
  medium: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', id32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', name: 'Qwen 2.5 (1.5B)', size: 'about 1 GB', mb: 1700, good: 'what you say, and writing' },
  // Runs on the processor (llama.cpp in WebAssembly), so it works in any modern
  // browser, including those without WebGPU. Slower, used when the others cannot run.
  cpu: { url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    path: '/api/model/hf/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf', name: 'Qwen 2.5 (processor)', size: 'about 490 MB', mb: 700, good: 'any browser' },
};
const FAIL_KEY = 'budgie.aiFailed'; // when the last automatic start failed, to avoid retrying on every visit
const STALL_MS = 90 * 1000;          // give up if a download makes no progress for this long
// For each task, which models to try, in order.
const ROUTES = {
  advice: ['ollama', 'medium', 'small', 'cpu'],
  plan: ['ollama', 'medium', 'small', 'cpu'],
  voice: ['ollama', 'medium', 'small', 'cpu'],
  digest: ['ollama', 'medium', 'small', 'cpu'],
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
  used: { advice: '', plan: '', digest: '', voice: '' }, // which model last did each task
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
    if (!adapter) return (gpuInfo = { ok: false, why: 'This device did not offer its graphics chip to the browser, so the AI cannot run here. Taskie uses its built-in rules.' });
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

// Models download through Taskie's own address (the Worker fetches them from
// Hugging Face and GitHub), so content blockers, private relays and strict
// networks that block those sites do not stop the AI.
const viaTaskie = url => url.replace('https://huggingface.co/', `${location.origin}/api/model/hf/`).replace('https://raw.githubusercontent.com/', `${location.origin}/api/model/gh/`);
function budgieAppConfig(webllm) {
  const base = webllm.prebuiltAppConfig;
  return { ...base, model_list: base.model_list.map(m => ({ ...m, model: viaTaskie(m.model), model_lib: viaTaskie(m.model_lib) })) };
}
// Network hiccups get a second try before giving up.
const isNetwork = e => /Load failed|Failed to fetch|NetworkError|network/i.test(String(e?.message || e || ''));

// Plain words for what went wrong.
function explain(e) {
  const m = String(e?.message || e || '');
  if (/shader-f16|f16/i.test(m)) return 'This graphics chip does not support the faster model build.';
  if (/quota|storage|QuotaExceeded/i.test(m)) return 'Not enough free storage in this browser for the model. Free up space, then try again.';
  if (/network|fetch|Failed to fetch|Load failed|NetworkError/i.test(m)) return /iPhone|iPad|Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|Edg/.test(navigator.userAgent)
    ? 'Safari stopped the model download. Turn off content blockers for this site, check the connection (Low Data Mode or Lockdown Mode can block it), then try again.'
    : 'The model could not download. Check your connection, then try again.';
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
        appConfig: budgieAppConfig(webllm),
        initProgressCallback: p => { last = Date.now(); Object.assign(ai[key], { progress: Math.round((p.progress || 0) * 100), text: p.text || '' }); },
      });
      engines[key] = await Promise.race([engine, watchdog]);
      Object.assign(ai[key], { state: 'ready', progress: 100, text: '' });
      if (['error', 'idle', 'waiting'].includes(ai.cpu.state)) cpuNotNeeded();
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
// The processor engine is only a fallback: with a graphics-chip model ready, it is not needed.
const gpuReady = () => isReady('small') || isReady('medium');
function cpuNotNeeded() {
  if (engines.cpu || ai.cpu.state === 'loading') return;
  Object.assign(ai.cpu, { state: 'notneeded', progress: 0, text: '', error: '', detail: '' });
}

export function loadCpuModel() {
  if (engines.cpu) return Promise.resolve(true);
  if (loading.cpu) return loading.cpu;
  if (gpuReady()) { cpuNotNeeded(); return Promise.resolve(false); }
  Object.assign(ai.cpu, { state: 'loading', progress: 0, text: 'Starting…', error: '', detail: '' });
  loading.cpu = (async () => {
    try {
      if (typeof WebAssembly !== 'object') throw Object.assign(new Error('This browser cannot run WebAssembly.'), { plain: true });
      const { Wllama } = await import(/* @vite-ignore */ WLLAMA_JS);
      let w = null;
      let last = Date.now();
      const stall = new Promise((_, reject) => {
        const t = setInterval(() => { if (Date.now() - last > STALL_MS) { clearInterval(t); reject(new Error('stalled')); } }, 5000);
        loading.cpuTimer = t;
      });
      // A new engine for each attempt: an engine that failed once cannot start again.
      const download = async url => {
        try { await w?.exit?.(); } catch { /* already stopped */ }
        w = new Wllama({ default: wllamaWasm }, { suppressNativeLog: true });
        return w.loadModelFromUrl(url, {
          n_ctx: 2048,
          progressCallback: ({ loaded, total }) => { last = Date.now(); Object.assign(ai.cpu, { progress: total ? Math.round((loaded / total) * 100) : 0, text: 'Downloading' }); },
        });
      };
      // Through Taskie first; if that fails on the network, wait and try once more.
      const attempt = async () => {
        try { return await download(`${location.origin}${MODELS.cpu.path}`); } catch (e) {
          if (!isNetwork(e)) throw e;
          ai.cpu.text = 'Retrying';
          await new Promise(r => setTimeout(r, 3000));
          return download(`${location.origin}${MODELS.cpu.path}`);
        }
      };
      await Promise.race([attempt(), stall]);
      engines.cpu = w;
      Object.assign(ai.cpu, { state: 'ready', progress: 100, text: '' });
      return true;
    } catch (e) {
      engines.cpu = null;
      // A graphics-chip model came up meanwhile: the fallback was not needed.
      if (gpuReady()) cpuNotNeeded();
      else Object.assign(ai.cpu, { state: 'error', error: e?.plain ? e.message : explain(e), detail: String(e?.message || e || '').slice(0, 300) });
      return false;
    } finally {
      clearInterval(loading.cpuTimer);
      loading.cpu = null;
      refreshLabel();
    }
  })();
  return loading.cpu;
}

async function browserChat(key, messages, { temperature = 0, max_tokens = 200, json = false } = {}) {
  if (key === 'cpu') {
    const out = await engines.cpu.createChatCompletion({ messages, temperature, max_tokens });
    return out.choices?.[0]?.message?.content || '';
  }
  // JSON mode keeps a small model to valid JSON.
  const out = await engines[key].chat.completions.create({ messages, temperature, max_tokens, ...(json ? { response_format: { type: 'json_object' } } : {}) });
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
    // The graphics chip failed recently: skip it and go straight to the processor engine.
    if (ai.small.state === 'idle') Object.assign(ai.small, { state: 'skipped', error: 'The graphics chip did not work last time, so Taskie uses the processor instead.' });
    if (ai.medium.state === 'idle') Object.assign(ai.medium, { state: 'skipped', error: '' });
    refreshLabel();
    if (!meteredConnection()) await loadCpuModel();
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
  try { const { Wllama } = await import(/* @vite-ignore */ WLLAMA_JS); await new Wllama({ default: wllamaWasm }).cacheManager?.clear?.(); } catch { /* nothing cached */ }
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

// A short, warm read on the day from the given facts. Returns null when no model is ready.
export async function aiAdvise(facts) {
  const reply = await route('advice', [
    { role: 'system', content: 'You are a calm planning coach. In two short sentences, say how the day and week look and the single most useful next step. Use only the facts given. Do not invent tasks, times or numbers.' },
    { role: 'user', content: facts.join('\n') },
  ], { temperature: 0.2, max_tokens: 160 });
  return reply ? reply.trim() : null;
}

// ---------- Planner ----------
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Adjust a rules-built routine to what the person wrote. Returns the new list or null.
export async function aiRefineRoutine(items, { wake, sleep, text }) {
  const reply = await route('plan', [
    { role: 'system', content: 'You plan a realistic daily routine. Adjust the draft to fit what the person wrote: change times, add missing habits they mention, remove clashes. Keep meals, sleep and their commitments. Reply with JSON only: {"routine": [{"title": string, "time": "HH:MM" 24-hour, "minutes": number, "days": ["mon".."sun"] or "daily"}]}' },
    { role: 'user', content: `Wake ${wake}, sleep ${sleep}. About my week: ${String(text || 'nothing more').slice(0, 600)}\nDraft: ${JSON.stringify(items.map(i => ({ title: i.title, time: i.time, minutes: i.mins, days: i.repeat?.every === 'week' ? i.repeat.days.map(d => DAYS[d]) : 'daily' })))}` },
  ], { json: true, temperature: 0.2, max_tokens: 700 });
  const list = firstJSON(reply)?.routine;
  if (!Array.isArray(list) || list.length < 3) return null;
  const clean = list.slice(0, 24).map(x => {
    const title = String(x.title || '').replace(/[<>]/g, '').trim().slice(0, 60);
    const time = HHMM.test(x.time) ? x.time : '';
    const days = Array.isArray(x.days) ? [...new Set(x.days.map(d => DAYS.indexOf(String(d).slice(0, 3).toLowerCase())).filter(d => d >= 0))].sort() : [];
    const mins = Number(x.minutes) > 0 && Number(x.minutes) <= 600 ? Math.round(Number(x.minutes)) : null;
    const known = items.find(i => i.title.toLowerCase() === title.toLowerCase());
    return title && { title, time, mins, kind: known?.kind || 'routine', repeat: days.length && days.length < 7 ? { every: 'week', days } : { every: 'day' } };
  }).filter(Boolean);
  return clean.length >= 3 ? clean.sort((a, b) => (a.time || '99').localeCompare(b.time || '99')) : null;
}

// Break a task into 3 to 7 concrete steps. Returns [string] or null.
export async function aiBreakdown(task) {
  const reply = await route('plan', [
    { role: 'system', content: 'Break the task into 3 to 7 concrete, ordered steps a student or young professional can tick off. Each step starts with a verb and is under 60 characters. Reply with JSON only: {"steps": [string]}' },
    { role: 'user', content: `Task: ${task.title}. Kind: ${task.kind}.${task.date ? ` Due ${task.date}.` : ''}${task.notes ? ` Notes: ${String(task.notes).slice(0, 300)}` : ''}` },
  ], { json: true, temperature: 0.2, max_tokens: 260 });
  const list = firstJSON(reply)?.steps;
  if (!Array.isArray(list)) return null;
  const clean = list.map(s => String(s || '').replace(/[<>]/g, '').replace(/^\s*\d+[.)]\s*/, '').trim().slice(0, 80)).filter(Boolean).slice(0, 7);
  return clean.length >= 2 ? clean : null;
}

// Up to three task ideas the person has not listed. Returns [{ title, why }] or null.
export async function aiSuggestTasks(facts) {
  const reply = await route('plan', [
    { role: 'system', content: 'You help a student and young professional plan their life. Suggest up to 3 useful tasks they have not listed: preparation for what is coming, healthy habits, people to keep in touch with, or steps toward their goals. Each must be specific and doable in one sitting. Use only the facts given. Reply with JSON only: {"tasks": [{"title": string under 60 characters, "why": one short sentence}]}' },
    { role: 'user', content: facts.join('\n') },
  ], { json: true, temperature: 0.4, max_tokens: 300 });
  const list = firstJSON(reply)?.tasks;
  if (!Array.isArray(list)) return null;
  return list.slice(0, 3).map(x => ({ title: String(x.title || '').replace(/[<>]/g, '').trim().slice(0, 60), why: String(x.why || '').replace(/[<>]/g, '').trim().slice(0, 160) })).filter(x => x.title);
}

// Milestones for a life goal: 3 to 6 ordered, concrete checkpoints. Returns [string] or null.
export async function aiMilestones(goal) {
  const reply = await route('plan', [
    { role: 'system', content: 'Break a personal goal into 3 to 6 ordered milestones a student or young professional can reach one by one. Each starts with a verb and is under 60 characters. Reply with JSON only: {"milestones": [string]}' },
    { role: 'user', content: `Goal: ${goal.title}.${goal.by ? ` By ${goal.by}.` : ''}${goal.why ? ` Why: ${String(goal.why).slice(0, 200)}` : ''}` },
  ], { json: true, temperature: 0.2, max_tokens: 260 });
  const list = firstJSON(reply)?.milestones;
  if (!Array.isArray(list)) return null;
  const clean = list.map(x => String(x || '').replace(/[<>]/g, '').replace(/^\s*\d+[.)]\s*/, '').trim().slice(0, 80)).filter(Boolean).slice(0, 6);
  return clean.length >= 2 ? clean : null;
}

// Rewrite a digest's lead and a draft email more naturally, keeping every fact.
// Returns { dek, body } or null.
export async function aiPolishLead(lead, profileLine) {
  const reply = await route('digest', [
    { role: 'system', content: 'You are a newspaper editor. Rewrite the dek (one sentence) and body (two or three sentences) of this story for the reader described. Keep every fact, name, date and link exactly; add nothing new. Plain text. Reply with JSON only: {"dek": string, "body": string}' },
    { role: 'user', content: `Reader: ${String(profileLine).slice(0, 300)}\nHeadline: ${lead.headline}\nDek: ${lead.dek}\nBody: ${lead.body}` },
  ], { json: true, temperature: 0.3, max_tokens: 300 });
  const out = firstJSON(reply);
  return out && typeof out.dek === 'string' && typeof out.body === 'string' ? { dek: out.dek.replace(/[<>]/g, '').slice(0, 300), body: out.body.replace(/[<>]/g, '').slice(0, 900) } : null;
}

// Break a dictated recording into every separate thing said, one per line:
// fix misheard words, drop filler, keep every date, time, person, place and
// #tag. Long recordings go in chunks (`chunks`, already split at natural
// breaks) so a small model reads each part fully. Returns a string or null.
const SPLIT_PROMPT = 'You turn a dictated planner recording into a list of separate items. People say many things at once (sometimes 50 or more) without pausing: assignments, exams, classes, tasks, errands, events, routines, habits and goals. List EVERY separate item, one per line, in the order said; never merge two items and never drop one. Split lists like "an essay due Friday and a quiz Monday" into two lines. When a course or subject is said once for several items ("for chemistry I have X and Y"), add it to each as #Course. Carry a shared verb ("call mom Sunday and dad Saturday" becomes "Call mom Sunday" and "Call dad Saturday"). Keep every date, day, time, duration, person, place and #tag exactly; fix words speech recognition clearly misheard; remove filler (um, uh, like, you know, so yeah). Do not add anything that was not said. Reply with JSON only: {"items": [string]}';
export async function aiRewriteDictation(text, chunks = null) {
  const parts = chunks && chunks.length ? chunks : [String(text)];
  const out = [];
  for (const part of parts) {
    const reply = await route('plan', [
      { role: 'system', content: SPLIT_PROMPT },
      { role: 'user', content: String(part).slice(0, 1500) },
    ], { json: true, temperature: 0.1, max_tokens: 900 });
    const got = firstJSON(reply);
    const list = got?.items || got?.lines;
    if (!Array.isArray(list)) return null;
    out.push(...list.map(x => String(x || '').replace(/[<>]/g, '').trim()).filter(Boolean));
  }
  return out.length ? out.slice(0, 200).join('\n') : null;
}

// ---------- what you said, as planner items (on this device) ----------
// A free Hugging Face model in the browser (Qwen 2.5) reads what was said and
// lists each item: a clear title, its kind, the date and time words copied
// exactly as said, and the course. Taskie's own reader then works out the
// exact dates from those words, which small models get wrong. Returns
// [{ title, kind, when, time, course }] or null.
const ITEM_KINDS = ['task', 'assignment', 'exam', 'class', 'event', 'routine', 'goal'];
const EXTRACT_PROMPT = `You turn what someone said to their planner into a list of separate items. They may list many things at once without pausing.
For EVERY separate thing said, in order, give:
- "title": a short, clear title. Tidy the wording (start tasks with a verb: "Call mom", "Book dentist appointment"), but keep names, numbers, course codes and subtitles exactly ("Lab Report 3: Titration Analysis", "Problem Set 7", "CS 61A Project 2"). No dates, times, "due", "I have" or filler in the title.
- "kind": assignment (homework, essays, papers, reports, problem sets, projects, presentations), exam (tests, quizzes, midterms, finals), class (lectures, seminars, labs that repeat), event (meetings, appointments, plans with a time), routine (habits that repeat), goal (something to achieve by a date, like "I want to run a 10K"), or task.
- "when": the date or repeat words exactly as said ("Friday", "the 18th", "Friday the 21st", "November 14th", "11/20", "tomorrow", "next week", "every Monday and Wednesday", "by March"), or "".
- "time": the time exactly as said ("5 pm", "11:59 pm", "noon", "at 6"), or "".
- "course": the subject or course when one is said or clear ("Chemistry", "CHEM 110", "Biology"), or "". A course said once ("for chemistry I have X and Y") applies to each of its items.
- "priority": "high" if they say it is urgent, important, a must or "super important"; "low" for "no rush", "whenever" or "not important"; otherwise "normal". Keep these words out of the title.
Never merge two things and never drop one. Do not add anything that was not said.
Reply with JSON only: {"items": [{"title": string, "kind": string, "when": string, "time": string, "course": string, "priority": string}]}

Example 1. Said: "for chemistry I have lab report 3 due friday at 5 pm super important and a quiz on the 18th, also call mom tomorrow and gym every monday and wednesday"
{"items": [{"title": "Lab Report 3", "kind": "assignment", "when": "Friday", "time": "5 pm", "course": "Chemistry", "priority": "high"}, {"title": "Quiz", "kind": "exam", "when": "the 18th", "time": "", "course": "Chemistry", "priority": "normal"}, {"title": "Call mom", "kind": "task", "when": "tomorrow", "time": "", "course": "", "priority": "normal"}, {"title": "Gym", "kind": "routine", "when": "every Monday and Wednesday", "time": "", "course": "", "priority": "normal"}]}

Example 2. Said: "I need to take my shirts to the dry cleaner whenever and remind me to email professor kim about the extension today"
{"items": [{"title": "Take shirts to the dry cleaner", "kind": "task", "when": "", "time": "", "course": "", "priority": "low"}, {"title": "Email Professor Kim about the extension", "kind": "task", "when": "today", "time": "", "course": "", "priority": "normal"}]}`;
export async function aiExtractItems(chunks, categories = []) {
  const out = [];
  const cats = categories.length ? `\nThe person's categories (use the exact name when one fits): ${categories.slice(0, 40).join(', ')}.` : '';
  for (const part of chunks) {
    const reply = await route('voice', [
      { role: 'system', content: EXTRACT_PROMPT + cats },
      { role: 'user', content: `Said: "${String(part).slice(0, 1200)}"` },
    ], { json: true, temperature: 0, max_tokens: 900 });
    const list = firstJSON(reply)?.items;
    if (!Array.isArray(list)) return null;
    const clean = (v, n) => String(v ?? '').replace(/[<>#]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
    out.push(...list.map(x => ({ title: clean(x?.title, 120), kind: ITEM_KINDS.includes(x?.kind) ? x.kind : 'task', when: clean(x?.when, 60), time: clean(x?.time, 20), course: clean(x?.course, 40), priority: ['low', 'high'].includes(x?.priority) ? x.priority : '' })).filter(x => x.title));
  }
  return out.length ? out.slice(0, 200) : null;
}
