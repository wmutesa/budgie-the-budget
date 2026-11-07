// Digests in the browser: load editions written by Budgie's server (Mondays,
// Thursdays and on "Generate now"), turn their deadlines into Planner tasks,
// let the on-device AI polish the lead, and, if you add your own free Gemini
// key, research deeper. The digest profile is saved in your account only.
import { reactive } from 'vue';
import { store } from './store';
import { makeTask, today, dayDiff } from './tasks';
import { readDigests, readDigest, writeDigest } from './account';
import { ai, aiPolishLead } from './ai';

export const digests = reactive({ list: [], current: null, loading: false, error: '', busy: false, polished: {}, research: null, researching: false });

export const LOOKING = ['internships', 'programs', 'scholarships', 'events', 'research', 'ambassador', 'perks', 'hackathons'];
export const blankProfile = () => ({ name: '', school: '', study: '', year: '', location: '', about: '', interests: [], lookingFor: ['internships', 'programs', 'events'], companies: [], feeds: [], watch: '', watchNote: '', exclude: [], auto: true });
export const profileReady = p => Boolean(p && ((p.interests || []).length || (p.companies || []).length || (p.feeds || []).length));

export async function loadDigests() {
  digests.loading = true; digests.error = '';
  try {
    const out = await readDigests();
    digests.list = out.list || [];
    if (!digests.current || digests.current.id === out.latest?.id || !digests.list.some(x => x.id === digests.current.id)) digests.current = out.latest;
    if (digests.current) afterRead(digests.current);
  } catch (e) { digests.error = e.message || 'Digests could not load.'; }
  digests.loading = false;
}
export async function openEdition(id) {
  try { digests.current = await readDigest(id); afterRead(digests.current); } catch (e) { digests.error = e.message; }
}
export async function generateNow() {
  digests.busy = true; digests.error = '';
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    store.digest.timeZone = tz;
    const ed = await writeDigest(store.digest.profile, tz);
    digests.current = ed;
    digests.list = [{ id: ed.id, edition: ed.edition, dateLong: ed.dateLong, preheader: ed.preheader }, ...digests.list.filter(x => x.id !== ed.id)];
    afterRead(ed);
  } catch (e) { digests.error = e.message || 'The digest could not be written. Try again in a minute.'; }
  digests.busy = false;
}

// Deadlines in the next two weeks become Planner tasks (once each; deleting
// one does not bring it back). Reading marks the edition as read.
function afterRead(ed) {
  const d = store.digest;
  d.read = [...new Set([...(d.read || []), ed.id])].slice(-60);
  if (d.autoTasks === false) return;
  d.used = d.used || [];
  for (const x of ed.deadlines || []) {
    const uid = `digest:${x.ctaLink}`;
    if (d.used.includes(uid) || store.tasks.some(t => t.uid === uid)) continue;
    if (dayDiff(today(), x.date) < 0) continue;
    store.tasks.push(makeTask({ title: x.name.slice(0, 120), date: x.date, kind: /event/i.test(x.desc) ? 'event' : 'assignment', project: 'Digest', link: x.ctaLink, uid, source: 'digest', notes: x.desc }));
    d.used.push(uid);
  }
  d.used = d.used.slice(-300);
  polish(ed);
}

// The on-device AI rewrites the lead's dek and body, keeping every fact.
async function polish(ed) {
  if (!ed?.lead || digests.polished[ed.id] || !ai.enabled || !ai.ready) return;
  const p = store.digest.profile || {};
  const line = [p.name, p.year, p.study, p.school && `at ${p.school}`, (p.interests || []).length && `interested in ${p.interests.slice(0, 4).join(', ')}`].filter(Boolean).join(' ');
  const out = await aiPolishLead(ed.lead, line).catch(() => null);
  if (out) digests.polished[ed.id] = { ...out, by: ai.used.digest };
}

// "Research deeper": Gemini's free tier with Google Search, using the
// person's own key (kept in their account; sent only to Google).
export async function researchDeeper() {
  const key = store.digest.geminiKey;
  if (!key) return;
  digests.researching = true; digests.research = null; digests.error = '';
  const p = store.digest.profile || {};
  const prompt = `Find up to 5 current, real opportunities (internships, programs, scholarships, events, research roles, ambassador programs) for: ${[p.year, p.study, p.school, p.location].filter(Boolean).join(', ')}. Interests: ${(p.interests || []).join(', ')}. Avoid: ${(p.exclude || []).join(', ') || 'nothing'}. Only include items with an official https link you found. Reply with JSON only: {"stories":[{"tag":"INTERNSHIP|PROGRAM|EVENT|PERK|AMBASSADOR|RESEARCH","headline":string,"desc":string,"fit":string,"deadline":string,"ctaLink":string}]}`;
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error?.message || `Gemini answered ${res.status}`);
    const text = (j.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
    const a = text.indexOf('{'); const b = text.lastIndexOf('}');
    const out = JSON.parse(text.slice(a, b + 1));
    digests.research = (out.stories || []).filter(s => /^https:\/\//.test(s.ctaLink || '') && s.headline).slice(0, 5)
      .map(s => ({ tag: String(s.tag || 'PROGRAM').toUpperCase(), headline: String(s.headline).slice(0, 160), desc: String(s.desc || '').slice(0, 300), fit: String(s.fit || '').slice(0, 160), deadline: String(s.deadline || 'See the page').slice(0, 60), ctaLabel: 'Open', ctaLink: s.ctaLink }));
  } catch (e) { digests.error = `Research deeper did not work: ${e.message || e}`; }
  digests.researching = false;
}
