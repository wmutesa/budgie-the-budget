/* Talks to a model server on your own machine (Ollama by default). Nothing leaves your computer. */
const LocalAI = (() => {
  const base = ep => String(ep || '').replace(/\/+$/, '');

  async function withTimeout(ms, fn) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try { return await fn(ctl.signal); } finally { clearTimeout(timer); }
  }

  async function ping(endpoint) {
    try {
      return await withTimeout(2500, async signal => {
        const r = await fetch(`${base(endpoint)}/api/tags`, { signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        return { ok: true, models: (j.models || []).map(m => m.name) };
      });
    } catch (e) {
      return { ok: false, error: e.name === 'AbortError' ? 'timed out' : (e.message || 'unreachable'), models: [] };
    }
  }

  async function chat({ endpoint, model, system, messages }) {
    return withTimeout(90000, async signal => {
      const r = await fetch(`${base(endpoint)}/api/chat`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          options: { temperature: 0.2 },
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return ((j.message && j.message.content) || '').trim() || 'The local model returned an empty answer.';
    });
  }

  return { ping, chat };
})();
