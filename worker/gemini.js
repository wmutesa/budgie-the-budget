// Deeper research for a digest with the person's own Gemini key (Google's free
// tier, with Google Search grounding). The key comes from their account data
// and is sent only to Google. Everything returned is checked: plain text,
// https links only, known tags, dates in the right shape.
import { TAGS } from './digest.js';

const MODEL = 'gemini-2.5-flash';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

// Keys come in more than one format (the classic "AIza…" and newer ones with
// dots), and pasting can add spaces or quotes. Tidy it, then only check that
// it is a plausible token; Google decides whether it works.
export const tidyKey = raw => String(raw || '').replace(/\s+/g, '').replace(/^["'`]+|["'`]+$/g, '');
export const keyShapeOk = key => /^[A-Za-z0-9._~+\/=-]{20,256}$/.test(key);
const googleSays = (status, j) => {
  const m = String(j?.error?.message || '').slice(0, 160);
  if (status === 429) return 'Gemini free limit reached for now';
  if (status === 400 || status === 401 || status === 403) return `Google did not accept the key${m ? ` (${m})` : ''}`;
  return `Gemini answered ${status}${m ? ` (${m})` : ''}`;
};

// Ask Google whether a key works, without spending a request on research.
export async function checkKey(raw) {
  const key = tidyKey(raw);
  if (!keyShapeOk(key)) return { ok: false, message: 'That does not look like an API key. Copy it again from Google AI Studio.' };
  const res = await fetch(`${API}/${MODEL}`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  if (res.ok) return { ok: true, message: 'Google accepted the key. What you say in Add will be broken down by Gemini.' };
  const j = await res.json().catch(() => ({}));
  if (res.status === 429) return { ok: true, message: 'The key works, but its free limit is used up for now. Gemini takes over again when it resets; until then Budgie uses its own rules.' };
  return { ok: false, message: googleSays(res.status, j) };
}
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
  const res = await fetch(`${API}/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.3 } }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(googleSays(res.status, j));
  const raw = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  const m = raw.match(/<digest>([\s\S]*?)<\/digest>/) || [null, raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)];
  let out;
  try { out = JSON.parse(m[1]); } catch { throw new Error('Gemini sent something Budgie could not read'); }
  const story = s => (s && https(s.ctaLink) && s.headline ? {
    tag: TAGS.includes(String(s.tag).toUpperCase()) ? String(s.tag).toUpperCase() : 'PROGRAM',
    headline: text(s.headline, 160), desc: text(s.desc, 320), fit: text(s.fit, 200) || 'Check eligibility on the page',
    deadline: text(s.deadline, 60) || 'See the page', dueIso: isoDate(s.dueIso), ctaLabel: text(s.ctaLabel, 30) || 'Open', ctaLink: s.ctaLink,
    source: (() => { try { return new URL(s.ctaLink).hostname.replace(/^www\./, ''); } catch { return ''; } })(), fromAI: true, score: 85,
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

// ---------- breaking a recording into planner items ----------
// One recording can hold dozens of things. Gemini lists each one with its
// kind, exact date (worked out from "next Tuesday" and the like), time,
// length, repeat days and course, as JSON checked here before it is used.
const KINDS = ['task', 'assignment', 'exam', 'class', 'event', 'routine', 'goal'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SPLIT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          kind: { type: 'string', enum: KINDS },
          date: { type: 'string', description: 'YYYY-MM-DD, or empty' },
          time: { type: 'string', description: '24-hour HH:MM, or empty' },
          minutes: { type: 'integer' },
          repeat: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly'] },
          days: { type: 'array', items: { type: 'string', enum: DAYS } },
          course: { type: 'string', description: 'course, subject or project, or empty' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'] },
          action: { type: 'string', enum: ['add', 'done', 'delete', 'move', 'priority'] },
          target: { type: 'string', description: 'for done, delete, move and priority: the existing item, exactly as listed' },
        },
        required: ['title', 'kind'],
      },
    },
  },
  required: ['items'],
};
// Extra rules and worked examples, written against the real date so every
// relative date in them is right (a model copies the pattern of its examples).
const addIso = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextDow = (iso, dow) => { const d = new Date(`${iso}T12:00:00Z`); const k = ((dow - d.getUTCDay() + 7) % 7) || 7; return addIso(iso, k); };
function guide(today, existing = []) {
  const fri = nextDow(today, 5), tue = nextDow(today, 2), tom = addIso(today, 1);
  return `Priority: "high" when they say it is urgent, important, a must, asap, critical, "super" or "really" important, or "don't forget"; "low" for "no rush", "not important", "whenever", "someday", "if I have time"; otherwise "normal". Never put priority words in the title.
Length: minutes if a length was said ("for two hours" is 120). If they say it is quick ("won't take long", "real quick", "five minutes") use 15. Otherwise 0.
A list, board or category they name ("to my Work list", "on the Chemistry board") is the course.
A follow-up about the item just said ("move that to tomorrow", "make it high priority", "actually at 4") changes that item; it is not a new item.
Keep the language they spoke in for titles.
${existing.length ? `Their planner already has these open items:\n${existing.map(t => `- ${t}`).join('\n')}\nWhen they mark one done ("mark X as done", "I finished X", "X is done"), delete or cancel one, move one to another day, or change its priority, give action "done", "delete", "move" (with the new date) or "priority" (with the priority) and target set to that item exactly as listed. Anything else is action "add". Never use an action for something not in this list.\n` : 'Every item is action "add".\n'}Titles start with the action when one was said ("Call Aunt Beate back", "Take shirts to the dry cleaner", "Email Professor Kim about the extension") and drop "I have to", "I need to", "remind me to", "don't forget to".
Examples (today is ${today}):
Said: "I have to finish lab report 3 for chem by Friday at 5, super important, and call aunt Beate back tomorrow, that won't take long"
Items: [{"title":"Lab Report 3","kind":"assignment","date":"${fri}","time":"17:00","minutes":0,"repeat":"none","days":[],"course":"Chemistry","priority":"high"},{"title":"Call Aunt Beate back","kind":"task","date":"${tom}","time":"","minutes":15,"repeat":"none","days":[],"course":"","priority":"normal"}]
Said: "psych midterm next Tuesday at 10, gym Monday Wednesday Friday at 6 pm for an hour, take my shirts to the dry cleaner whenever"
Items: [{"title":"Psychology midterm","kind":"exam","date":"${tue}","time":"10:00","minutes":0,"repeat":"none","days":[],"course":"Psychology","priority":"normal"},{"title":"Gym","kind":"routine","date":"","time":"18:00","minutes":60,"repeat":"weekly","days":["mon","wed","fri"],"course":"","priority":"normal"},{"title":"Take shirts to the dry cleaner","kind":"task","date":"","time":"","minutes":0,"repeat":"none","days":[],"course":"","priority":"low"}]
`;
}
const SYSTEM = { parts: [{ text: 'You are a precise assistant for a student planner. You extract tasks, deadlines and plans from what someone said and reply only with correct JSON that matches the schema.' }] };
export async function geminiSplit(key, { text: said, today, weekday, timeZone, categories = [], hints = [], existing = [] }) {
  const prompt = `You turn a dictated or typed planner note into a list of separate items for a student's calendar.
Today is ${weekday}, ${today} (time zone ${timeZone || 'UTC'}).
People say many things at once (sometimes 50 or more) without pausing. List EVERY separate item, in the order said: assignments, exams, classes, tasks, errands, events, routines, habits and goals. Never merge two items and never drop one. Split lists like "an essay due Friday and a quiz Monday" into two items. When a course or subject is said once for several items ("for chemistry I have X and Y"), give each that course. Carry a shared verb ("call mom Sunday and dad Saturday" is two calls).
For each item: the title is the item's FULL name exactly as said, keeping numbers, chapter or section numbers and subtitles ("Lab Report 3: Titration Analysis", "Problem Set 7", "Essay on the French Revolution", "Read chapter 7 of the biology textbook"), but without the date, time, "due", "I have" or filler; kind (assignment for homework, essays, reports and problem sets; exam for tests, quizzes and midterms; class for lectures, seminars and labs that repeat; event for meetings, appointments and plans with a time; routine for habits that repeat; goal for something to achieve by a date; otherwise task); date as YYYY-MM-DD worked out from words like "tomorrow", "Friday", "next Tuesday" (the next such day after today), "the 18th" (the next 18th), "Friday the 21st" (the 21st: a day number wins over a weekday), "11/20" (month/day), "in two weeks" or "end of the month" (its last day); empty if none; time in 24-hour HH:MM ("midnight" or "end of day" is 23:59, "noon" is 12:00), empty if none; minutes if a length was said; repeat and days for things that recur; course: the category, taken from a spoken "hashtag X" or "#X", a course code ("CHEM 110", "CS 61A"), "for <subject>", or the subject in the name ("psych midterm" is Psychology).
${categories.length ? `The person already uses these categories; when an item belongs to one, use its exact name: ${categories.join(', ')}.
` : ''}Fix words speech recognition clearly misheard. Do not add anything that was not said.
${guide(today, existing)}${hints.length ? `
A simple splitter found these parts; use them only as a checklist so nothing is missed (the note itself is what counts):
${hints.map(h => `- ${h}`).join('\n')}
` : ''}
Note:
${said}`;
  const res = await fetch(`${API}/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: SYSTEM,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: SPLIT_SCHEMA, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 16000 },
    }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(googleSays(res.status, j));
  const raw = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  let out;
  try { out = JSON.parse(raw); } catch { throw new Error('Gemini sent something Budgie could not read'); }
  return cleanItems(out.items);
}
// Every item checked: plain text, known kinds and days, real dates and times.
function cleanItems(list) {
  const hhmm = s => (/^([01]\d|2[0-3]):[0-5]\d$/.test(s || '') ? s : '');
  return (Array.isArray(list) ? list : []).slice(0, 200).map(x => ({
    title: text(x.title, 120),
    kind: KINDS.includes(x.kind) ? x.kind : 'task',
    date: isoDate(x.date),
    time: hhmm(x.time),
    minutes: Number.isInteger(x.minutes) && x.minutes > 0 && x.minutes <= 1440 ? x.minutes : 0,
    repeat: ['daily', 'weekdays', 'weekly', 'monthly'].includes(x.repeat) ? x.repeat : '',
    days: Array.isArray(x.days) ? [...new Set(x.days.filter(d => DAYS.includes(d)))] : [],
    course: text(x.course, 40),
    priority: ['low', 'high'].includes(x.priority) ? x.priority : '',
    action: ['done', 'delete', 'move', 'priority'].includes(x.action) ? x.action : 'add',
    target: text(x.target, 120),
  })).filter(x => x.title || x.target);
}

// ---------- hearing a recording ----------
// The recording itself goes to Gemini, which hears names, numbers and accents
// better than a browser's speech recognition. In one step it writes down
// exactly what was said and lists every item, as checked JSON.
const AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/mp3', 'audio/mpeg', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm', 'audio/mp4'];
export const audioTypeOk = t => AUDIO_TYPES.includes(String(t || '').split(';')[0].trim().toLowerCase());
const VOICE_SCHEMA = { type: 'object', properties: { transcript: { type: 'string' }, items: SPLIT_SCHEMA.properties.items }, required: ['transcript', 'items'] };
export async function geminiVoice(key, { audio, mime, typed = '', today, weekday, timeZone, categories = [], existing = [] }) {
  const prompt = `This is a recording of someone telling their planner what they need to do. First write down exactly what they said, word for word, as "transcript" (fix nothing but obvious slips; keep names, numbers and course codes as spoken). Then list every separate item in "items".
Today is ${weekday}, ${today} (time zone ${timeZone || 'UTC'}).
People say many things at once (sometimes 50 or more) without pausing. List EVERY separate item, in the order said: assignments, exams, classes, tasks, errands, events, routines, habits and goals. Never merge two items and never drop one. Split lists like "an essay due Friday and a quiz Monday" into two items. A course said once for several items applies to each. Carry a shared verb ("call mom Sunday and dad Saturday" is two calls).
For each item: the title is the item's FULL name exactly as said, keeping numbers, chapter or section numbers and subtitles ("Lab Report 3: Titration Analysis", "Problem Set 7"), but without the date, time, "due", "I have" or filler; kind (assignment for homework, essays, reports, problem sets, projects and presentations; exam for tests, quizzes and midterms; class for lectures, seminars and labs that repeat; event for meetings, appointments and plans with a time; routine for habits that repeat; goal for something to achieve by a date; otherwise task); date as YYYY-MM-DD worked out from words like "tomorrow", "Friday", "next Tuesday", "the 18th", "Friday the 21st" (the day number wins), "11/20", "in two weeks" or "end of the month"; empty if none; time in 24-hour HH:MM ("midnight" or "end of day" is 23:59, "noon" is 12:00), empty if none; minutes if a length was said; repeat and days for things that recur; course: from a spoken "hashtag X", a course code, "for <subject>", or the subject in the name.
${categories.length ? `The person already uses these categories; when an item belongs to one, use its exact name: ${categories.join(', ')}.\n` : ''}${guide(today, existing)}${typed ? `While speaking, the person saw this live text and may have corrected it; prefer its spellings of names and words:\n${typed}\n` : ''}Do not add anything that was not said.`;
  const res = await fetch(`${API}/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: SYSTEM,
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: String(mime).split(';')[0], data: audio } }, { text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: VOICE_SCHEMA, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 20000 },
    }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(googleSays(res.status, j));
  const raw = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  let out;
  try { out = JSON.parse(raw); } catch { throw new Error('Gemini sent something Budgie could not read'); }
  return { transcript: String(out.transcript || '').replace(/[<>]/g, '').trim().slice(0, 12000), items: cleanItems(out.items) };
}

// ---------- live text: one short piece of a recording ----------
// Used for live words while someone talks, when Cloudflare's own speech model
// is not available. Only the words, nothing else.
export async function geminiWords(key, { audio, prompt = '' }) {
  const res = await fetch(`${API}/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'audio/wav', data: audio } }, { text: `Write down exactly what is said in this short recording, in the language spoken, with normal punctuation. Reply with only those words. If nothing is said, reply with nothing.${prompt ? ` It follows: "${prompt.slice(-200)}"` : ''}` }] }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 400 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(googleSays(res.status, j));
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}
