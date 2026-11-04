// Optional local AI. If Ollama is running on this computer, receipts are read
// by a local model; otherwise Budgie uses its built-in rules. Nothing is sent
// to a cloud service.
import { reactive } from 'vue';
import { CATEGORIES } from './categorize';

const OLLAMA = 'http://localhost:11434';
export const ai = reactive({ status: 'unknown', model: '' }); // unknown | ollama | rules

export async function detectAI() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const j = await res.json();
    const model = (j.models || [])[0]?.name;
    if (model) { Object.assign(ai, { status: 'ollama', model }); return true; }
  } catch { /* not running */ }
  Object.assign(ai, { status: 'rules', model: '' });
  return false;
}

// Ask the local model to read receipt text. Returns null when unavailable.
export async function aiReadReceipt(text) {
  if (ai.status !== 'ollama') return null;
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: ai.model,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: `Read receipt text. Reply with JSON only: {"merchant": string, "date": "YYYY-MM-DD" or null, "total": number, "currency": ISO 4217 code, "category": one of ${JSON.stringify(CATEGORIES)}}. Use only facts in the text.` },
          { role: 'user', content: text.slice(0, 4000) },
        ],
      }),
    });
    const j = await res.json();
    const out = JSON.parse(j.message?.content || '{}');
    return out && typeof out.total === 'number' ? out : null;
  } catch { return null; }
}

// Ask the local model for a short read on the month. Returns null when unavailable.
export async function aiAdvise(facts) {
  if (ai.status !== 'ollama') return null;
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: ai.model,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          { role: 'system', content: 'You are a careful budgeting assistant. In three short sentences, say how the month is going and the single most useful next step. Use only the facts given. No made-up numbers, no bank rates.' },
          { role: 'user', content: facts.join('\n') },
        ],
      }),
    });
    const j = await res.json();
    return (j.message?.content || '').trim() || null;
  } catch { return null; }
}
