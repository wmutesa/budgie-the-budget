// The Planner's 25-minute focus timer, shared by every view.
import { reactive } from 'vue';
import { isDone, toggleDone } from './tasks';

export const focus = reactive({ task: null, left: 25 * 60, running: false });
let countdown = null;
export function startFocus(t, mins = 25) {
  Object.assign(focus, { task: t, left: mins * 60, running: true });
  clearInterval(countdown);
  countdown = setInterval(() => {
    if (!focus.running) return;
    focus.left -= 1;
    if (focus.left <= 0) {
      focus.running = false; clearInterval(countdown);
      try { new Notification('Focus session done', { body: focus.task?.title || '' }); } catch { /* notifications off */ }
    }
  }, 1000);
}
export function finishFocus() {
  if (focus.task && !isDone(focus.task)) toggleDone(focus.task);
  stopFocus();
}
export function stopFocus() { clearInterval(countdown); Object.assign(focus, { task: null, left: 25 * 60, running: false }); }
export const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
