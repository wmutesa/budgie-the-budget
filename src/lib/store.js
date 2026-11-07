// App state that belongs to the signed-in person: their planner, goals,
// digest settings and preferences. It syncs to their account (see account.js)
// and a copy is kept in this browser so the app opens instantly and works offline.
import { reactive, watch } from 'vue';

// Data saved before personal accounts existed; moved into the first account
// that signs in on this device.
export const LEGACY_KEY = 'budgie.v2';
const userKey = id => `budgie.v3:${id}`;
let activeKey = null;

function readKey(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}

const pickMe = p => (p && typeof p === 'object' ? Object.fromEntries(['name', 'school', 'study', 'year', 'location', 'about'].map(k => [k, String(p[k] || '')])) : {});
// Build the saved part of the state from a stored object, filling gaps with defaults.
// Anything else in the stored object (such as money data from older versions
// of Budgie) is left out, so it is removed from the account on the next save.
function fromSaved(saved = {}) {
  return {
    guide: saved.guide && typeof saved.guide === 'object' ? saved.guide : { done: false },
    dismissed: Array.isArray(saved.dismissed) ? saved.dismissed.slice(-400) : [],
    // Notifications already shown in the bell's dropdown.
    seenNotices: Array.isArray(saved.seenNotices) ? saved.seenNotices.slice(-200) : [],
    // Planner: tasks, classes, assignments, events and routines (see tasks.js).
    tasks: Array.isArray(saved.tasks) ? saved.tasks.filter(t => t && t.id && t.title) : [],
    // Calendar links to import from: { id, name, url, kind, lastSync, count, error }. Private to the account.
    feeds: Array.isArray(saved.feeds) ? saved.feeds.slice(0, 12) : [],
    // What the routine was built from: { wake, sleep, text, builtAt }.
    routine: saved.routine && typeof saved.routine === 'object' ? saved.routine : { wake: '07:00', sleep: '23:00', text: '' },
    // Planner settings: { view, cal, remind }.
    planner: saved.planner && typeof saved.planner === 'object' ? saved.planner : { view: 'Tasks', remind: false },
    // Focus sessions for Reports: { id, taskId, title, project, kind, mins, at }.
    focusLog: Array.isArray(saved.focusLog) ? saved.focusLog.slice(-2000) : [],
    // Life goals: { id, title, why, by, color, milestones: [{ id, title, date, taskId }] } (see goals.js).
    // Savings goals from older versions (no milestones) are dropped.
    goals: Array.isArray(saved.goals) ? saved.goals.filter(g => g && g.id && g.title && Array.isArray(g.milestones)) : [],
    // Projects and categories for the planner: { name: { color } }.
    projects: saved.projects && typeof saved.projects === 'object' ? saved.projects : {},
    // Digests: the digests you follow ({ id, name, focus, auto }), your own Gemini key (optional),
    // settings and what was already used (see digest.js).
    digest: saved.digest && typeof saved.digest === 'object' ? saved.digest : { autoTasks: true, used: [], streams: [{ id: 'main', name: 'My brief', auto: true }] },
    // About you, for digests and drafts: { name, school, study, year, location, about }.
    me: saved.me && typeof saved.me === 'object' ? saved.me : pickMe(saved.digest?.profile),
    // How you look in Budgie: { color } for your avatar, picked at random at first and editable.
    profile: saved.profile && typeof saved.profile === 'object' ? saved.profile : {},
  };
}
const SAVED_FIELDS = Object.keys(fromSaved());

export const store = reactive({ ...fromSaved(), query: '' });

// The saved part of the state, as a plain object.
export const snapshot = () => JSON.parse(JSON.stringify(Object.fromEntries(SAVED_FIELDS.map(k => [k, store[k]]))));

// Replace the saved part of the state, for example with data from the server.
export function applySnapshot(data) {
  Object.assign(store, fromSaved(data || {}));
}

// Switch to a person's local copy. Returns what was stored for them, if anything.
export function openLocal(userId) {
  activeKey = userId ? userKey(userId) : null;
  return activeKey ? readKey(activeKey) : null;
}
export const readLegacy = () => readKey(LEGACY_KEY);
export function clearLegacy() { try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ } }
export function clearLocal(userId) { try { localStorage.removeItem(userKey(userId)); } catch { /* storage blocked */ } }

watch(snapshot, value => {
  if (!activeKey) return;
  try { localStorage.setItem(activeKey, JSON.stringify(value)); } catch { /* storage blocked */ }
}, { deep: true });

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

