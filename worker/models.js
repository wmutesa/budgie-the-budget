// AI model downloads through Budgie's own address. The in-browser models live
// on Hugging Face (weights) and GitHub (WebGPU code). Some browsers and
// networks block those sites (content blockers, private relays, school and
// work networks), so the app fetches them from /api/model/... instead and
// Cloudflare caches them at the edge. Only the exact files Budgie uses can be
// fetched: this is not an open proxy.

const HF_REPOS = [
  'mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'mlc-ai/Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  'mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
  'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
];
const GH_PREFIX = 'mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/';
const GGUF_FILE = 'Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';
const SAFE_FILE = /^[\w.-]+$/;

// Map /api/model/hf/<repo>/resolve/main/<file> or /api/model/gh/<path> to the
// real address, or return null when the path is not one of Budgie's files.
export function modelSource(path) {
  const m = path.match(/^\/api\/model\/(hf|gh)\/(.+)$/);
  if (!m || m[2].includes('..') || m[2].includes('//')) return null;
  const rest = m[2];
  if (m[1] === 'gh') {
    return rest.startsWith(GH_PREFIX) && /^[\w./-]+\.wasm$/.test(rest) ? `https://raw.githubusercontent.com/${rest}` : null;
  }
  if (rest.startsWith('Qwen/')) return rest === GGUF_FILE ? `https://huggingface.co/${rest}` : null;
  const repo = HF_REPOS.find(r => rest.startsWith(`${r}/resolve/main/`));
  if (!repo) return null;
  const file = rest.slice(`${repo}/resolve/main/`.length);
  return SAFE_FILE.test(file) ? `https://huggingface.co/${rest}` : null;
}

// Stream the file, passing byte ranges through (the processor engine
// downloads in parallel pieces).
export async function modelResponse(request, source) {
  const headers = {};
  const range = request.headers.get('Range');
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range;
  const res = await fetch(source, { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers, cf: { cacheEverything: true, cacheTtl: 30 * 86400 } });
  if (!res.ok && res.status !== 206) return new Response('Model file unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const out = new Headers();
  for (const h of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set('Content-Type', source.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  out.set('Cache-Control', 'private, max-age=86400');
  out.set('X-Content-Type-Options', 'nosniff');
  return new Response(request.method === 'HEAD' ? null : res.body, { status: res.status, headers: out });
}
