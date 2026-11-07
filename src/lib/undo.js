// Deleting without a "are you sure?" box: things go at once, and a notification
// offers Undo, which puts them back where they were.
import { store } from './store';
import { removeTask } from './tasks';
import { removeGoal } from './goals';
import { toast } from './toast';

const clone = x => JSON.parse(JSON.stringify(x));

export function deleteTask(t) {
  const i = store.tasks.indexOf(t);
  const copy = clone(t);
  removeTask(t);
  toast(`“${copy.title}” deleted.`, { kind: 'info', action: { label: 'Undo', run: () => store.tasks.splice(Math.max(0, i), 0, copy) } });
}

export function deleteGoal(g) {
  const gi = store.goals.indexOf(g);
  const goal = clone(g);
  const before = clone(store.tasks);
  removeGoal(g);
  toast(`Goal “${goal.title}” and its open milestones deleted.`, { kind: 'info', action: { label: 'Undo', run: () => { store.goals.splice(Math.max(0, gi), 0, goal); store.tasks = before; } } });
}

// A project is a #tag on tasks: removing it clears the tag, the tasks stay.
export function deleteProject(name) {
  const tagged = store.tasks.filter(t => t.project === name).map(t => t.id);
  const color = store.projects[name];
  store.tasks.forEach(t => { if (t.project === name) t.project = ''; });
  if (color) { const p = { ...store.projects }; delete p[name]; store.projects = p; }
  toast(`#${name} removed from ${tagged.length} task${tagged.length === 1 ? '' : 's'}. The tasks are kept.`, { kind: 'info', action: { label: 'Undo', run: () => { store.tasks.forEach(t => { if (tagged.includes(t.id)) t.project = name; }); if (color) store.projects = { ...store.projects, [name]: color }; } } });
}
