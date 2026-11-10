// What's next, written by AI: Taskie sends a short summary of the planner
// (titles, dates, kinds, goals and how the week is going, never notes) and
// Gemini (or Taskie's own Llama) answers with a few specific next moves. The
// ideas refresh by themselves when the planner changes, at most every 20
// minutes, and at least every 3 hours. The rules in suggest.js fill in when
// the AI cannot be reached.
import { ref, watch } from 'vue';
import { store } from './store';
import { today, addDays, isDone, occursOn } from './tasks';
import { aiNext, account } from './account';

const KEY = 'taskie.next';
const MIN_GAP = 20 * 60e3;
const MAX_AGE = 3 * 3600e3;
export const aiIdeas = ref([]);
export const aiState = ref('idle'); // idle | loading | ready | failed
let last = { at: 0, sig: '' };
try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.day === today()) { aiIdeas.value = c.ideas || []; last = { at: c.at, sig: c.sig }; aiState.value = 'ready'; } } catch { /* fresh */ }

// A compact, private-enough picture of the planner: what is open and when.
export function facts() {
  const d = today();
  const open = store.tasks.filter(t => !t.pending && !t.repeat && !t.done);
  const overdue = open.filter(t => t.date && t.date < d);
  const soon = open.filter(t => t.date && t.date >= d && t.date <= addDays(d, 14)).sort((a, b) => a.date.localeCompare(b.date));
  const loose = open.filter(t => !t.date).slice(0, 8);
  const routines = store.tasks.filter(t => t.repeat && !t.pending).slice(0, 12);
  const doneWeek = store.tasks.filter(t => !t.repeat && t.done && t.doneAt && Date.now() - new Date(t.doneAt).getTime() < 7 * 86400e3).length;
  const todayCount = store.tasks.filter(t => !t.pending && occursOn(t, d) && !isDone(t, d)).length;
  const line = t => `- ${t.title} (${t.kind || 'task'}${t.date ? `, ${t.date}` : ''}${t.time ? ` ${t.time}` : ''}${t.project ? `, #${t.project}` : ''}${t.priority === 'high' ? ', high priority' : ''}${t.subtasks?.length ? `, ${t.subtasks.filter(s => s.done).length}/${t.subtasks.length} steps done` : ''})`;
  const now = new Date();
  return [
    `Now: ${now.toLocaleDateString('en-US', { weekday: 'long' })} ${d}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`,
    `${store.me?.name ? `Name: ${store.me.name}. ` : ''}${store.me?.study ? `Studies: ${store.me.study}.` : ''}`,
    `Today: ${todayCount} things still open. Done in the last 7 days: ${doneWeek}.`,
    overdue.length ? `Overdue (${overdue.length}):\n${overdue.slice(0, 10).map(line).join('\n')}` : 'Nothing overdue.',
    soon.length ? `Coming up (next 14 days):\n${soon.slice(0, 25).map(line).join('\n')}` : 'Nothing dated in the next 14 days.',
    loose.length ? `No date yet:\n${loose.map(line).join('\n')}` : '',
    routines.length ? `Routines: ${routines.map(t => t.title).join(', ')}.` : '',
    store.goals.length ? `Goals: ${store.goals.slice(0, 8).map(g => `${g.title}${g.by ? ` by ${g.by}` : ''} (${store.tasks.filter(t => t.goalId === g.id && t.done).length}/${store.tasks.filter(t => t.goalId === g.id).length} milestones)`).join('; ')}.` : 'No goals yet.',
    (store.dismissed || []).length ? `They said "not now" to ideas recently; offer different ones.` : '',
  ].filter(Boolean).join('\n');
}
const sigOf = f => { let h = 0; const s = f.replace(/^Now:.*$/m, ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };

export async function refreshIdeas({ force = false } = {}) {
  if (account.status !== 'signed-in' || typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (!store.tasks.length && !store.goals.length) { aiIdeas.value = []; return; }
  const f = facts();
  const sig = sigOf(f);
  const age = Date.now() - last.at;
  if (!force && aiState.value !== 'failed' && ((sig === last.sig && age < MAX_AGE) || age < MIN_GAP)) return;
  aiState.value = 'loading';
  try {
    const r = await aiNext(f);
    aiIdeas.value = (r.ideas || []).map((x, i) => ({ ...x, id: `ai-${sig}-${i}` }));
    last = { at: Date.now(), sig };
    aiState.value = 'ready';
    try { localStorage.setItem(KEY, JSON.stringify({ day: today(), at: last.at, sig, ideas: aiIdeas.value })); } catch { /* fine */ }
  } catch { aiState.value = 'failed'; }
}

// Refresh on its own: when the planner changes (after a pause) and when the page comes back into view.
let timer = null;
export function watchIdeas() {
  watch(() => [account.status, store.tasks.length, store.tasks.filter(t => t.done).length, store.goals.length], () => { clearTimeout(timer); timer = setTimeout(() => refreshIdeas(), 4000); }, { immediate: true });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshIdeas(); });
}
