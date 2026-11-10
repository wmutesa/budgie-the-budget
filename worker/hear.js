// Hearing a recording, in two steps (Generative Error Correction):
//  1. Deepgram Nova-3 on Cloudflare writes down what was said, boosted with the
//     person's own words (keyterms: course codes, names, places, categories).
//  2. Gemini listens to the same recording with Nova-3's text in hand, plus the
//     person's planner, and fixes what was misheard from context (a name that
//     sounds like a common word, an accent, a course code), then lists every item.
// Research behind this: LLM "generative error correction" over an ASR hypothesis
// (HyPoradise, NeurIPS 2023; Whispering-LLaMA, EMNLP 2023), contextual biasing
// with a user's own vocabulary (Deepgram keyterm prompting; CLAS), and giving the
// LLM the audio as well as the text so it can check a guess against the sound
// (audio-grounded correction, e.g. "Listen Again and Choose the Right Answer", 2024).
import { splitPrompt, SPLIT_SCHEMA, cleanItems, geminiPost } from './gemini.js';

export const NOVA = '@cf/deepgram/nova-3';

// Nova-3, batch: the whole recording at once (fast: about a second for a minute of speech).
export async function novaHear(env, bytes, mime, keyterms = []) {
  const terms = keyterms.filter(Boolean).slice(0, 50);
  const base = { smart_format: true, punctuate: true, numerals: true, language: 'en' };
  const run = extra => env.AI.run(NOVA, { audio: { body: new Response(bytes).body, contentType: mime || 'audio/wav' }, ...base, ...extra });
  let out;
  try { out = await run(terms.length ? { keyterm: terms.join(', ') } : {}); } catch (e) {
    // Keyterms are a boost, never a reason to fail: try once without them.
    if (!terms.length) throw e;
    out = await run({});
  }
  const alt = out?.results?.channels?.[0]?.alternatives?.[0] || {};
  const words = Array.isArray(alt.words) ? alt.words : [];
  return {
    text: String(alt.transcript || '').trim(),
    confidence: typeof alt.confidence === 'number' ? alt.confidence : null,
    // Words Nova-3 was unsure of: Gemini looks at these first.
    unsure: [...new Set(words.filter(w => typeof w.confidence === 'number' && w.confidence < 0.6).map(w => w.punctuated_word || w.word).filter(Boolean))].slice(0, 40),
  };
}

const HEAR_SCHEMA = { type: 'object', properties: { transcript: { type: 'string' }, items: SPLIT_SCHEMA.properties.items }, required: ['transcript', 'items'] };

// Gemini corrects Nova-3's text against the recording and the person's context, then lists the items.
export async function geminiCorrect(key, { audio, mime, heard, unsure = [], ...args }) {
  const prompt = `A speech recognizer (Deepgram Nova-3) wrote down this recording as:
"""${heard}"""
${unsure.length ? `It was unsure of these words: ${unsure.join(', ')}.\n` : ''}Listen to the recording yourself. In "transcript", write what the person actually meant to say: keep their words, but fix every word the recognizer got wrong, using the sound, the sentence around it and what you know about this person (their categories, open items and words below). People have many accents; a word that is spelled like something else but makes no sense in a student's planner is almost always a mishearing of a name, course, place or app they use. Never invent content, never summarise, and keep their language.
Then list the items from that corrected transcript, following these instructions:

${splitPrompt({ ...args, text: heard })}`;
  const res = await geminiPost(key, {
      systemInstruction: { parts: [{ text: 'You correct speech recognition with context and turn it into a student planner\'s items. Reply only with JSON that matches the schema.' }] },
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: String(mime || 'audio/wav').split(';')[0], data: audio } }, { text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: HEAR_SCHEMA, maxOutputTokens: 20000 },
    }, 45000);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${String(j?.error?.message || j?.error?.status || 'no details').slice(0, 220)}`);
  const raw = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  const out = JSON.parse(raw);
  return { transcript: String(out.transcript || '').replace(/[<>]/g, '').trim().slice(0, 12000), items: cleanItems(out.items) };
}

// Fast text-only Gemini call for small jobs (What's next ideas, notifications).
export async function geminiJson(key, prompt, schema, { timeout = 20000, temperature = 0.6 } = {}) {
  const res = await geminiPost(key, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 4000 },
    }, timeout);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${String(j?.error?.message || j?.error?.status || 'no details').slice(0, 220)}`);
  return JSON.parse((j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''));
}
