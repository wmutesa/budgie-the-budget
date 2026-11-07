// Categories: your #projects, or the kind of thing when there is no project.
// One colour per category, the same in the day, week and month views and the
// task columns.
import { store } from './store';
import { KINDS } from './tasks';

const PALETTE = ['#7c3aed', '#0ea5e9', '#f59e0b', '#16a34a', '#e11d48', '#6366f1', '#0d9488', '#db2777', '#ea580c', '#65a30d', '#9333ea', '#0891b2'];
// A project without a saved colour always gets the same one, from its name.
const hashColor = name => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

export const catKey = t => (t.project ? `#${t.project}` : KINDS[t.kind]?.label || 'Task');
export const catLabel = t => t.project || KINDS[t.kind]?.label || 'Task';
export const catColor = t => (t.project ? store.projects?.[t.project]?.color || hashColor(t.project) : KINDS[t.kind]?.color || '#52525b');
