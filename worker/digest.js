// Digests: a twice-weekly brief of opportunities and news, written for one
// person from free sources, with no AI service and no API keys:
//   - Google News searches built from their interests and what they look for
//   - open roles on the careers boards of companies they name (Greenhouse and
//     Lever publish these as free public lists)
//   - any RSS or Atom feeds they add (a department, a club, a blog)
//   - a "watch" topic they follow closely (for example visa rules)
// Rules turn those into an edition shaped like a newspaper: a lead story,
// new finds, deadlines, outreach drafts, a watch box and one action.
import { checkFeedUrl } from './ical.js';

const MAX_FEED_BYTES = 600_000;
const MAX_ITEMS_PER_FEED = 25;
export const TAGS = ['INTERNSHIP', 'PROGRAM', 'EVENT', 'PERK', 'AMBASSADOR', 'RESEARCH'];

// ---------- the profile ----------
const list = (v, n = 12, len = 60) => (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map(x => String(x).trim().slice(0, len)).filter(Boolean).slice(0, n);
// Keep only known fields, trimmed, so nothing odd is stored or fetched.
export function cleanProfile(p = {}) {
  return {
    name: String(p.name || '').trim().slice(0, 60),
    school: String(p.school || '').trim().slice(0, 80),
    study: String(p.study || '').trim().slice(0, 80),
    year: String(p.year || '').trim().slice(0, 40),
    location: String(p.location || '').trim().slice(0, 60),
    about: String(p.about || '').trim().slice(0, 400),
    interests: list(p.interests, 12),
    lookingFor: list(p.lookingFor, 8).filter(x => /^(internships|programs|scholarships|events|research|ambassador|perks|jobs|fellowships|hackathons)$/i.test(x)),
    companies: list(p.companies, 8, 40),
    feeds: list(p.feeds, 6, 500),
    watch: String(p.watch || '').trim().slice(0, 80),
    watchNote: String(p.watchNote || '').trim().slice(0, 140),
    exclude: list(p.exclude, 10),
    focus: String(p.focus || '').trim().slice(0, 120),
    auto: p.auto !== false,
  };
}

// Words that say nothing about a topic.
const STOP = new Set('a an the and or of to for in on at by with my your our i me be get got have make do go run up out about into from this that these those next new first last more less than then very really want would like need learn finish start keep stay try plan goal goals task tasks project projects class classes week weeks month months year years day days today tomorrow summer spring fall winter land become improve reach complete better able some every get-better master'.split(' '));
const keywords = text => String(text || '').toLowerCase().replace(/[^a-z0-9+#\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

// The profile a digest is written for, built from the person's account data:
// "You" in their profile, plus topics taken from their goals, projects and
// classes (no topic to choose). A digest with its own focus line uses that instead.
export function profileFromAccount(data = {}, stream = {}) {
  const me = { ...(data.digest?.profile || {}), ...Object.fromEntries(Object.entries(data.me || {}).filter(([, v]) => v)) };
  const counts = new Map();
  const add = (w, n = 1) => counts.set(w, (counts.get(w) || 0) + n);
  for (const g of data.goals || []) keywords(g.title).forEach(w => add(w, 3));
  for (const t of (data.tasks || []).slice(0, 300)) if (t.project && !/^digest$/i.test(t.project)) keywords(t.project).forEach(w => add(w, 2));
  keywords(me.study).forEach(w => add(w, 3));
  keywords(me.about).forEach(w => add(w, 1));
  (me.interests || []).forEach(i => add(String(i).toLowerCase(), 4));
  // Nothing yet to go on: a general brief for students, sharpened as goals and details are added.
  const topics = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 6);
  if (!topics.length && !stream.focus) topics.push('students', 'scholarships');
  return cleanProfile({ ...me, interests: topics, focus: stream.focus || '', lookingFor: me.lookingFor || [], companies: me.companies || [], feeds: me.feeds || [], exclude: me.exclude || [], auto: stream.auto !== false });
}

// ---------- fetching ----------
async function getText(url) {
  const u = checkFeedUrl(url);
  const res = await fetch(u.toString(), { headers: { Accept: 'application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.5', 'User-Agent': 'Budgie digest' }, signal: AbortSignal.timeout(8000), cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size > MAX_FEED_BYTES) { reader.cancel(); break; }
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c.subarray(0, Math.min(c.length, size - at)), at); at += c.length; }
  return new TextDecoder().decode(all);
}
const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };

// RSS and Atom items as { title, link, date, desc, source }.
export function parseFeed(xml, fallbackSource = '') {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks.slice(0, MAX_ITEMS_PER_FEED)) {
    const atomLink = b.match(/<link[^>]*href="([^"]+)"/i);
    const link = decode(tag(b, 'link')) || (atomLink ? atomLink[1] : '');
    let title = decode(tag(b, 'title'));
    const source = decode(tag(b, 'source')) || fallbackSource;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    if (!title || !/^https:\/\//i.test(link)) continue;
    items.push({ title: title.slice(0, 200), link: link.slice(0, 600), date: decode(tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published')), desc: decode(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 400), source: source.slice(0, 60) });
  }
  return items;
}
const news = q => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:14d`)}&hl=en-US&gl=US&ceid=US:en`;
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

const ROLE = /intern|student|co-?op|new grad|graduate|apprentice|fellow|university|campus|early career|summer|junior|entry/i;
async function companyJobs(company) {
  const s = slug(company);
  const out = [];
  try {
    const gh = JSON.parse(await getText(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs`));
    for (const j of (gh.jobs || []).slice(0, 300)) if (ROLE.test(j.title)) out.push({ title: `${company}: ${j.title}`, link: j.absolute_url, date: j.updated_at || '', desc: j.location?.name ? `Location: ${j.location.name}.` : '', source: company, kind: 'job' });
  } catch { /* not on Greenhouse */ }
  if (!out.length) {
    try {
      const lv = JSON.parse(await getText(`https://api.lever.co/v0/postings/${s}?mode=json`));
      for (const j of (Array.isArray(lv) ? lv : []).slice(0, 300)) if (ROLE.test(j.text)) out.push({ title: `${company}: ${j.text}`, link: j.hostedUrl, date: j.createdAt ? new Date(j.createdAt).toISOString() : '', desc: [j.categories?.location, j.categories?.commitment].filter(Boolean).join(' · '), source: company, kind: 'job' });
    } catch { /* not on Lever */ }
  }
  return out.filter(j => /^https:\/\//.test(j.link || '')).slice(0, 6);
}

// Everything the profile asks for, fetched in parallel. Failures are skipped.
export async function collect(profile) {
  const p = cleanProfile(profile);
  const topics = p.interests.slice(0, 4);
  const looking = (p.lookingFor.length ? p.lookingFor : ['internships', 'programs', 'events']).slice(0, 4);
  const queries = [];
  if (p.focus) queries.push(p.focus, `${p.focus} students`, `${p.focus} deadline apply`);
  else {
    for (const l of looking) queries.push(`${l.replace(/s$/, '')} ${topics.slice(0, 2).join(' OR ') || ''} students ${p.location || ''}`.replace(/\s+/g, ' ').trim());
    if (p.school) queries.push(`"${p.school}" ${topics[0] || 'students'}`);
  }
  const jobs = [];
  const tasks = [
    ...queries.slice(0, 5).map(q => getText(news(q)).then(x => parseFeed(x, 'Google News')).catch(() => [])),
    ...p.feeds.map(f => getText(f).then(x => parseFeed(x, (() => { try { return new URL(f).hostname.replace(/^www\./, ''); } catch { return ''; } })())).catch(() => [])),
    ...p.companies.slice(0, 6).map(c => companyJobs(c).then(r => { jobs.push(...r); return []; }).catch(() => [])),
  ];
  const watchTopic = p.watch || (p.focus ? '' : topics[0] ? `${topics[0]} news` : '');
  const watch = watchTopic ? getText(news(watchTopic)).then(x => parseFeed(x, 'Google News')).catch(() => []) : Promise.resolve([]);
  const [lists, watchItems] = await Promise.all([Promise.all(tasks), watch]);
  return { items: [...lists.flat(), ...jobs], watch: watchItems, profile: { ...p, watch: watchTopic } };
}

// ---------- reading items ----------
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = d => d.toISOString().slice(0, 10);
// A deadline written in the text: "apply by December 1", "deadline: Nov 30, 2026", "due 2026-12-01".
export function findDeadline(text, now = new Date()) {
  const t = String(text);
  let m = t.match(/\b(?:deadline|apply by|applications? (?:close|due|open until)|due|closes?|register by|until|before)\s*:?\s*(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    let y = m[3] ? Number(m[3]) : now.getUTCFullYear();
    let d = new Date(Date.UTC(y, mi, Number(m[2])));
    if (!m[3] && d < new Date(now.getTime() - 864e5)) d = new Date(Date.UTC(y + 1, mi, Number(m[2])));
    return iso(d);
  }
  m = t.match(/\b(?:deadline|due|apply by|closes?)\s*:?\s*(\d{4}-\d{2}-\d{2})\b/i);
  return m ? m[1] : '';
}
export function tagFor(text, kind) {
  const t = text.toLowerCase();
  if (/ambassador|campus expert|student lead|developer group/.test(t)) return 'AMBASSADOR';
  if (kind === 'job' || /\bintern(ship)?s?\b|co-?op|new grad|\bjob\b|hiring/.test(t)) return 'INTERNSHIP';
  if (/research|lab\b|laborator|undergraduate research|\breu\b|paper/.test(t)) return 'RESEARCH';
  if (/hackathon|conference|summit|webinar|workshop|meetup|career fair|\bevent\b|expo/.test(t)) return 'EVENT';
  if (/free|credits?|discount|perk|student pack|offer/.test(t)) return 'PERK';
  return 'PROGRAM';
}
const CTA = { INTERNSHIP: 'Apply', PROGRAM: 'Read and apply', EVENT: 'Register', PERK: 'Claim it', AMBASSADOR: 'Apply', RESEARCH: 'Read the project' };

function score(item, p, seen) {
  const text = `${item.title} ${item.desc}`.toLowerCase();
  if (p.exclude.some(x => text.includes(x.toLowerCase()))) return -1;
  if (seen.has(item.link) || seen.has(item.title.toLowerCase())) return -1;
  let s = 0;
  const hits = p.interests.filter(i => text.includes(i.toLowerCase()));
  s += hits.length * 4;
  if (item.kind === 'job') s += 6;
  if (/student|undergrad|first-year|sophomore|freshman|early career|international/.test(text)) s += 3;
  if (findDeadline(text)) s += 3;
  const age = Date.parse(item.date);
  if (!Number.isNaN(age)) s += Math.max(0, 4 - Math.floor((Date.now() - age) / (3 * 864e5)));
  return { s, hits };
}
// Flags readers should know before applying.
function fitFor(item, p, hits) {
  const t = `${item.title} ${item.desc}`.toLowerCase();
  const bits = [];
  if (hits.length) bits.push(`Matches ${hits.slice(0, 3).join(', ')}`);
  if (/citizen|clearance|green card|permanent resident/.test(t)) bits.push('may need US citizenship: check eligibility');
  if (/sophomore|junior|senior|year 2|second-year/.test(t)) bits.push('check the year it is open to');
  if (/international/.test(t)) bits.push('mentions international students');
  return bits.join('; ') || 'Check eligibility on the page';
}

// ---------- writing ----------
const fmtDay = isoDay => new Date(`${isoDay}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
function draftFor(n, story, p) {
  const who = story.org || story.source || 'the team';
  const name = p.name || 'Your name';
  const intro = [p.year, p.study ? `${p.study} student` : 'student', p.school ? `at ${p.school}` : ''].filter(Boolean).join(' ');
  const interest = p.interests.slice(0, 2).join(' and ') || 'this area';
  const body = [
    `Hello,`,
    '',
    `I'm ${name}, ${/^[aeiou]/i.test(intro) ? 'an' : 'a'} ${intro}. I came across "${story.headline}" and it connects closely with my interest in ${interest}.`,
    `${p.about ? `${p.about.split(/(?<=\.)\s/)[0]} ` : ''}I would love to learn what the people who do well here have in common, and whether someone at my stage could take part.`,
    '',
    `Could we have a 15-minute call in the next two weeks? I'm happy to work around your schedule.`,
    '',
    `Thank you for your time,`,
    name,
  ].join('\n');
  return {
    no: String(n), to: who, purpose: `Ask about ${story.headline.slice(0, 70)}`, status: 'Needs a contact',
    sendBy: `by ${fmtDay(story.dueIso || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10))}`,
    subject: `${p.study ? `${p.study} student` : 'Student'} interested in ${story.tag === 'RESEARCH' ? 'your research' : story.headline.slice(0, 50)}`,
    body,
  };
}

// Build one edition from collected items. `previous` keeps stories from
// repeating and draft numbers going up.
export function writeEdition({ items, watch, profile, research = null }, previous = null, now = new Date()) {
  const p = cleanProfile(profile);
  const seen = new Set([...(previous?.stories || []).flatMap(s => [s.ctaLink, s.headline.toLowerCase()]), previous?.lead?.ctaLink].filter(Boolean));
  const unique = [];
  const keys = new Set();
  for (const it of items) { const k = it.title.toLowerCase().slice(0, 80); if (!keys.has(k) && !keys.has(it.link)) { keys.add(k); keys.add(it.link); unique.push(it); } }
  const ranked = unique.map(it => ({ it, r: score(it, p, seen) })).filter(x => x.r !== -1).sort((a, b) => b.r.s - a.r.s);
  const today = iso(now);
  const in14 = iso(new Date(now.getTime() + 14 * 864e5));
  const stories = ranked.slice(0, 9).map(({ it, r }) => {
    const text = `${it.title} ${it.desc}`;
    const t = tagFor(text, it.kind);
    const dueIso = findDeadline(text, now);
    return {
      tag: t, headline: it.title, desc: it.desc ? it.desc.slice(0, 260) : `From ${it.source || 'the web'}.`, fit: fitFor(it, p, r.hits),
      deadline: dueIso ? `${t === 'EVENT' ? 'On' : 'Apply by'} ${fmtDay(dueIso)}` : (it.kind === 'job' ? 'Open now' : 'See the page'),
      ctaLabel: CTA[t], ctaLink: it.link, link2Label: 'More like this', link2: `https://news.google.com/search?q=${encodeURIComponent(it.title.split(/[:|–-]/)[0].slice(0, 60))}`,
      dueIso, org: it.kind === 'job' ? it.source : '', source: it.source,
    };
  });
  // Research (Gemini) goes first; free finds fill in after, without repeats.
  if (research?.stories?.length) {
    const have = new Set(research.stories.map(x => x.ctaLink));
    stories.splice(0, stories.length, ...research.stories.filter(x => !seen.has(x.ctaLink)), ...stories.filter(x => !have.has(x.ctaLink)));
    stories.length = Math.min(stories.length, 10);
  }
  const [top, ...rest] = research?.lead && !seen.has(research.lead.ctaLink) ? [{ ...research.lead, isLead: true }, ...stories] : stories;
  const lead = top?.isLead ? (({ isLead, ...l }) => l)(top) : top ? {
    kicker: `${top.tag.charAt(0)}${top.tag.slice(1).toLowerCase()} · ${top.deadline}`, headline: top.headline,
    dek: top.desc.split(/(?<=\.)\s/)[0].slice(0, 220), body: `${top.desc} ${top.fit}.`.replace(/\.\./g, '.'),
    ctaLabel: top.ctaLabel, ctaLink: top.ctaLink, link2Label: 'More like this', link2: top.link2,
  } : null;
  const deadlines = stories.filter(s => s.dueIso && s.dueIso >= today && s.dueIso <= in14)
    .map(s => ({ date: s.dueIso, name: s.headline.slice(0, 90), desc: `${s.tag.charAt(0)}${s.tag.slice(1).toLowerCase()} · ${s.source || 'web'}`, ctaLabel: s.ctaLabel, ctaLink: s.ctaLink }))
    .sort((a, b) => a.date.localeCompare(b.date));
  let no = Math.max(0, ...(previous?.drafts || []).map(d => Number(d.no) || 0)) + 1;
  const drafts = stories.filter(s => ['INTERNSHIP', 'RESEARCH', 'PROGRAM', 'AMBASSADOR'].includes(s.tag)).slice(0, 2).map(s => draftFor(no++, s, p));
  const okWatch = watch.filter(x => !p.exclude.some(e => `${x.title} ${x.desc}`.toLowerCase().includes(e.toLowerCase())));
  const w = okWatch[0];
  const watchBox = research?.watch ? { ...research.watch, note: p.watchNote } : p.watch && w ? { headline: w.title, body: `${w.desc || `Reported by ${w.source}.`}${okWatch[1] ? ` Also: ${okWatch[1].title}.` : ''}`.slice(0, 500), linkLabel: 'Read it', link: w.link, topic: p.watch, note: p.watchNote } : null;
  const soonest = [...stories].filter(s => s.dueIso && s.dueIso >= today).sort((a, b) => a.dueIso.localeCompare(b.dueIso))[0];
  const action = research?.action ? research.action : soonest ? { text: `${soonest.ctaLabel}: ${soonest.headline} (${soonest.deadline.toLowerCase()}).`, label: soonest.ctaLabel, link: soonest.ctaLink }
    : drafts[0] ? { text: `Send draft #${drafts[0].no} to ${drafts[0].to}.`, label: 'Open the outbox', link: '' }
      : lead ? { text: `Read the lead story and decide if it is for you.`, label: lead.ctaLabel, link: lead.ctaLink } : null;
  const sources = [...(research?.sources || []), ...[...new Map(stories.map(s => [s.source, s])).values()].filter(s => s.source).map(s => ({ title: s.source, url: s.ctaLink }))].slice(0, 12);
  const clean = s => { const { dueIso, org, source, isLead, ...rest2 } = s; return { ...rest2, dueIso }; };
  return {
    preheader: `${stories.length} new find${stories.length === 1 ? '' : 's'}, ${deadlines.length} deadline${deadlines.length === 1 ? '' : 's'} in the next two weeks.`,
    lead, stories: rest.map(clean), deadlines, drafts, watch: watchBox, action, sources,
  };
}

// Edition name and dates. Time zone is the reader's (sent by their browser).
export function editionMeta(now = new Date(), timeZone = 'UTC') {
  let tz = timeZone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'UTC'; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).formatToParts(now).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return {
    id: `${parts.year}-${parts.month}-${parts.day}`,
    edition: `${parts.weekday} Edition`,
    dateLong: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now),
    timeZone: tz,
  };
}

// Collect and write, ready to store. With a Gemini key, Gemini researches at
// the same time as the free sources are read; if it fails, the edition is
// still written from the free sources and says why.
export async function makeDigest(profile, previous, { timeZone = 'UTC', now = new Date(), geminiKey = '', research: researchFn = null, name = '' } = {}) {
  const meta = editionMeta(now, timeZone);
  const p = cleanProfile(profile);
  const who = [p.name, p.year, p.study && `studying ${p.study}`, p.school && `at ${p.school}`, p.location && `in ${p.location}`, p.about].filter(Boolean).join(', ') || 'a student';
  const [collected, research] = await Promise.all([
    collect(p),
    geminiKey && researchFn ? researchFn(geminiKey, { who, focus: p.focus, topics: p.interests, today: meta.dateLong, previous }).then(r => ({ ok: r }), e => ({ error: String(e?.message || e) })) : Promise.resolve(null),
  ]);
  const content = writeEdition({ ...collected, research: research?.ok || null }, previous, now);
  const provider = research?.ok ? 'Gemini with Google Search and free sources' : 'free sources';
  return { ...meta, name, createdAt: now.toISOString(), provider, researchError: research?.error || '', topics: p.focus ? [p.focus] : p.interests, counts: { fetched: collected.items.length, researched: research?.ok?.stories?.length || 0 }, ...content };
}
