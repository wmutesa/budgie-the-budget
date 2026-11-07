// Deeper research for a digest with the person's own Gemini key (Google's free
// tier, with Google Search grounding). The key comes from their account data
// and is sent only to Google. Everything returned is checked: plain text,
// https links only, known tags, dates in the right shape.
import { TAGS } from './digest.js';

const MODEL = 'gemini-2.5-flash';
const https = u => typeof u === 'string' && /^https:\/\/[^\s<>"]+$/i.test(u) && u.length < 600;
const text = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const isoDate = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');

export async function geminiResearch(key, { who, focus, topics, today, previous }) {
  const prev = previous ? `Do not repeat these earlier stories: ${[previous.lead?.headline, ...(previous.stories || []).map(s => s.headline)].filter(Boolean).slice(0, 12).join(' | ')}.` : '';
  const prompt = `You research opportunities and news for one reader and write a short newspaper-style digest.
Reader: ${who}
${focus ? `This digest is about: ${focus}.` : `Topics from the reader's goals and projects: ${topics.join(', ') || 'general opportunities for students'}.`}
Today is ${today}. Search the web now. Favour official pages, things open to the reader's stage, and anything with a deadline in the next weeks. Never invent links or dates; mark dates found only on third-party sites with "(3P)".
${prev}
Reply with one JSON object inside <digest></digest> tags and nothing after it:
{"lead":{"kicker":string,"headline":string,"dek":one sentence,"body":2-3 sentences,"ctaLabel":verb phrase,"ctaLink":https URL},
"stories":[{"tag":one of ${JSON.stringify(TAGS)},"headline":string,"desc":1-2 sentences,"fit":why it suits the reader and any eligibility limits,"deadline":e.g. "Apply by Dec 1" or "Rolling","dueIso":"YYYY-MM-DD" or "","ctaLabel":verb phrase,"ctaLink":https URL}] (3 to 6),
"watch":{"topic":short,"headline":string,"body":2 sentences,"link":https URL} or null (news the reader should keep an eye on, such as rules that affect them),
"action":{"text":the one thing to do this week,"link":https URL or ""},
"sources":[{"title":string,"url":https URL}]}
Plain text in every field, no markdown.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.3 } }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 429 ? 'Gemini free limit reached for now' : res.status === 400 || res.status === 403 ? 'Gemini did not accept the key' : `Gemini answered ${res.status}`);
  const raw = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  const m = raw.match(/<digest>([\s\S]*?)<\/digest>/) || [null, raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)];
  let out;
  try { out = JSON.parse(m[1]); } catch { throw new Error('Gemini sent something Budgie could not read'); }
  const story = s => (s && https(s.ctaLink) && s.headline ? {
    tag: TAGS.includes(String(s.tag).toUpperCase()) ? String(s.tag).toUpperCase() : 'PROGRAM',
    headline: text(s.headline, 160), desc: text(s.desc, 320), fit: text(s.fit, 200) || 'Check eligibility on the page',
    deadline: text(s.deadline, 60) || 'See the page', dueIso: isoDate(s.dueIso), ctaLabel: text(s.ctaLabel, 30) || 'Open', ctaLink: s.ctaLink,
    source: (() => { try { return new URL(s.ctaLink).hostname.replace(/^www\./, ''); } catch { return ''; } })(), fromAI: true,
  } : null);
  const lead = out.lead && https(out.lead.ctaLink) && out.lead.headline ? {
    kicker: text(out.lead.kicker, 60), headline: text(out.lead.headline, 160), dek: text(out.lead.dek, 260), body: text(out.lead.body, 700),
    ctaLabel: text(out.lead.ctaLabel, 30) || 'Read more', ctaLink: out.lead.ctaLink, link2Label: 'More like this', link2: `https://www.google.com/search?q=${encodeURIComponent(text(out.lead.headline, 80))}`,
  } : null;
  return {
    lead,
    stories: (Array.isArray(out.stories) ? out.stories : []).map(story).filter(Boolean).slice(0, 6),
    watch: out.watch && https(out.watch.link) && out.watch.headline ? { topic: text(out.watch.topic, 60), headline: text(out.watch.headline, 160), body: text(out.watch.body, 500), linkLabel: 'Read it', link: out.watch.link } : null,
    action: out.action?.text ? { text: text(out.action.text, 240), label: 'Open', link: https(out.action.link) ? out.action.link : '' } : null,
    sources: (Array.isArray(out.sources) ? out.sources : []).filter(s => https(s?.url)).map(s => ({ title: text(s.title, 80) || 'Source', url: s.url })).slice(0, 10),
  };
}
