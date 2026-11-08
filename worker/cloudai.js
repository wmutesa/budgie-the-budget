// Budgie's own AI, on Cloudflare (no key for anyone): a capable open model
// breaks what was said into every separate task, class, routine, event and
// goal, with the same instructions and checks as Gemini.
import { splitPrompt, SPLIT_SCHEMA, SYSTEM_TEXT, cleanItems } from './gemini.js';

export const SPLIT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export async function cloudSplit(env, args) {
  if (!env.AI) throw new Error('Budgie AI is not set up on this server.');
  const out = await env.AI.run(SPLIT_MODEL, {
    messages: [
      { role: 'system', content: `${SYSTEM_TEXT} Reply with a JSON object {"items": [...]} and nothing else.` },
      { role: 'user', content: splitPrompt(args) },
    ],
    response_format: { type: 'json_schema', json_schema: SPLIT_SCHEMA },
    temperature: 0.1,
    max_tokens: 4096,
  });
  let data = out?.response ?? out;
  if (typeof data === 'string') {
    const m = data.match(/\{[\s\S]*\}/);
    try { data = JSON.parse(m ? m[0] : data); } catch { throw new Error('Budgie AI sent something that could not be read.'); }
  }
  return cleanItems(Array.isArray(data) ? data : data?.items);
}
