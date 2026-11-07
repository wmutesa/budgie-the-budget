// Digests in the browser. Budgie's server writes each digest from free sources
// and, when you have added a Gemini key in your profile, Gemini with Google
// Search at the same time. "My brief" takes its topics from your goals,
// projects and studies; other digests follow a one-line focus. New editions
// arrive on Mondays and Thursdays, and a digest that is behind catches up on
// its own when you open it.
import { reactive, computed } from 'vue';
import { store, newId } from './store';
import { makeTask, today, dayDiff } from './tasks';
import { readDigests, readDigest, writeDigest, dropDigest, saveNow } from './account';
import { ai, aiPolishLead } from './ai';

export const digests = reactive({ editions: {}, editionsOf: {}, active: 'main', viewing: {}, busy: {}, error: '', loaded: false, polished: {}, current: null });

export const streams = computed(() => {
  const list = Array.isArray(store.digest.streams) ? store.digest.streams : [];
  return list.some(x => x.id === 'main') ? list : [{ id: 'main', name: 'My brief', auto: true }, ...list];
});
const ensureStreams = () => { if (!Array.isArray(store.digest.streams) || !store.digest.streams.some(x => x.id === 'main')) store.digest.streams = streams.value.map(x => ({ ...x })); };

// The newest Monday or Thursday 11:00 UTC that has passed: editions older than it are behind.
export function lastSlot(now = new Date()) {
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 11));
    if ([1, 4].includes(d.getUTCDay()) && d <= now) return d;
  }
  return new Date(now.getTime() - 4 * 864e5);
}
// Is there enough to write "My brief" about?
export const hasTopics = () => Boolean(store.me?.study || store.me?.about || store.goals.length || store.tasks.some(t => t.project) || store.digest.geminiKey);

export async function loadDigests() {
  digests.error = '';
  try {
    const out = await readDigests();
    digests.editions = out.editions || {};
    digests.loaded = true;
    await openStream(digests.active);
  } catch (e) { digests.error = e.message || 'Digests could not load.'; }
}

export async function openStream(id) {
  digests.active = id;
  const list = digests.editions[id] || [];
  const st = streams.value.find(x => x.id === id);
  const behind = !list.length || Date.parse(list[0].createdAt || 0) < lastSlot().getTime();
  if (st && st.auto !== false && behind && (id !== 'main' || hasTopics()) && !digests.busy[id]) {
    if (list.length) await openEdition(id, list[0].id);
    return generate(id);
  }
  if (list.length && digests.viewing[id]?.id !== list[0].id) await openEdition(id, list[0].id);
  else setCurrent();
}
export async function openEdition(stream, id) {
  try { digests.viewing[stream] = await readDigest(stream, id); setCurrent(); afterRead(digests.viewing[stream]); } catch (e) { digests.error = e.message; }
}
function setCurrent() { digests.current = digests.viewing[digests.active] || digests.viewing.main || null; }

export async function generate(id = digests.active) {
  const st = streams.value.find(x => x.id === id);
  if (!st) return;
  digests.busy[id] = true; digests.error = '';
  try {
    store.digest.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    await saveNow(); // the server reads your profile, goals and key from your account
    const ed = await writeDigest({ id: st.id, name: st.name, focus: st.focus || '' }, store.digest.timeZone);
    digests.viewing[id] = ed;
    digests.editions[id] = [{ id: ed.id, edition: ed.edition, dateLong: ed.dateLong, preheader: ed.preheader, createdAt: ed.createdAt }, ...(digests.editions[id] || []).filter(x => x.id !== ed.id)];
    setCurrent();
    afterRead(ed);
  } catch (e) { digests.error = e.message || 'The digest could not be written. It will try again on schedule.'; }
  delete digests.busy[id];
}

export async function addStream(name, focus = '') {
  ensureStreams();
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'digest';
  const id = store.digest.streams.some(x => x.id === base) ? `${base}-${newId().slice(-4)}` : base;
  store.digest.streams.push({ id, name: String(name).trim().slice(0, 60), focus: String(focus || name).trim().slice(0, 120), auto: true });
  digests.active = id;
  await generate(id);
  return id;
}
export async function removeStream(id) {
  if (id === 'main') return;
  ensureStreams();
  store.digest.streams = store.digest.streams.filter(x => x.id !== id);
  delete digests.editions[id]; delete digests.viewing[id];
  try { await dropDigest(id); } catch { /* removed from the list anyway */ }
  await openStream('main');
}

// Seen on the Digests page.
export function markRead(ed) {
  if (!ed || isRead(ed)) return;
  store.digest.read = [...new Set([...(store.digest.read || []), `${ed.stream || 'main'}:${ed.id}`])].slice(-80);
}
// Deadlines in the next two weeks become Planner tasks (once each; deleting
// one does not bring it back).
function afterRead(ed) {
  if (!ed) return;
  const d = store.digest;
  if (d.autoTasks !== false) {
    d.used = d.used || [];
    for (const x of ed.deadlines || []) {
      const uid = `digest:${x.ctaLink}`;
      if (d.used.includes(uid) || store.tasks.some(t => t.uid === uid) || dayDiff(today(), x.date) < 0) continue;
      store.tasks.push(makeTask({ title: x.name.slice(0, 120), date: x.date, kind: /event/i.test(x.desc) ? 'event' : 'assignment', project: 'Digest', link: x.ctaLink, uid, source: 'digest', notes: x.desc }));
      d.used.push(uid);
    }
    d.used = d.used.slice(-300);
  }
  polish(ed);
}
export const isRead = ed => Boolean(ed && store.digest.read?.includes(`${ed.stream || 'main'}:${ed.id}`));

// The on-device AI rewrites the lead's dek and body, keeping every fact.
async function polish(ed) {
  const key = `${ed.stream}:${ed.id}`;
  if (!ed?.lead || digests.polished[key] || !ai.enabled || !ai.ready || /Gemini/.test(ed.provider || '')) return;
  const me = store.me || {};
  const line = [me.name, me.year, me.study, me.school && `at ${me.school}`].filter(Boolean).join(' ');
  const out = await aiPolishLead(ed.lead, line).catch(() => null);
  if (out) digests.polished[key] = { ...out, by: ai.used.digest };
}
