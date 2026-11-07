// Small notifications in the corner for errors, work in progress and messages.
//   toast('Copied')                                   → info, fades
//   toast('Done', { kind: 'success' })                → fades
//   toast('It failed', { kind: 'error', title })      → stays until closed
//   const id = loading('Importing…'); finish(id, 'Imported 4 items')  → spinner, then result
import { reactive } from 'vue';

export const toasts = reactive([]);
let seq = 0;
const timers = new Map();
const LIFE = { info: 3500, success: 4500, warn: 9000, error: 0, loading: 0 };

function schedule(t) {
  clearTimeout(timers.get(t.id));
  const ms = t.ms ?? LIFE[t.kind];
  if (ms) timers.set(t.id, setTimeout(() => dismiss(t.id), ms));
}
export function toast(text, { kind = 'info', title = '', ms, action = null, id } = {}) {
  const existing = id && toasts.find(t => t.id === id);
  if (existing) { Object.assign(existing, { text, kind, title, action, ms }); schedule(existing); return id; }
  const t = { id: id || `t${++seq}`, text: String(text || ''), kind, title, action, ms };
  toasts.push(t);
  if (toasts.length > 5) toasts.splice(0, toasts.length - 5);
  schedule(t);
  return t.id;
}
export const loading = (text, opts = {}) => toast(text, { ...opts, kind: 'loading' });
// Turn a loading notification into its result.
export function finish(id, text, opts = {}) { return toast(text, { kind: 'success', ...opts, id }); }
export function fail(id, text, opts = {}) { return toast(text, { kind: 'error', ...opts, id }); }
export function dismiss(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const i = toasts.findIndex(t => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
