// The Planner's 25-minute focus timer, shared by every view.
import { reactive } from 'vue';
import { isDone, toggleDone } from './tasks';
import { store, newId } from './store';

// `spent` counts the seconds actually focused, for Reports.
export const focus = reactive({ task: null, left: 25 * 60, running: false, spent: 0 });
// Keep a session of a minute or more in the focus log.
function logSession() {
  const t = focus.task;
  const mins = Math.round(focus.spent / 60);
  if (!t || mins < 1) return;
  store.focusLog = [...(store.focusLog || []), { id: newId(), taskId: t.id, title: t.title, project: t.project || '', kind: t.kind, mins, at: new Date().toISOString() }].slice(-2000);
}
let countdown = null;
export function startFocus(t, mins = 25) {
  if (focus.task) logSession();
  Object.assign(focus, { task: t, left: mins * 60, running: true, spent: 0 });
  clearInterval(countdown);
  countdown = setInterval(() => {
    if (!focus.running) return;
    focus.left -= 1; focus.spent += 1;
    if (focus.left <= 0) {
      focus.running = false; clearInterval(countdown);
      logSession(); focus.spent = 0;
      try { new Notification('Focus session done', { body: focus.task?.title || '' }); } catch { /* notifications off */ }
    }
  }, 1000);
}
export function finishFocus() {
  if (focus.task && !isDone(focus.task)) toggleDone(focus.task);
  stopFocus();
}
export function stopFocus() { clearInterval(countdown); logSession(); Object.assign(focus, { task: null, left: 25 * 60, running: false, spent: 0 }); }
export const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
