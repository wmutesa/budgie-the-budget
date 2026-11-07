// Turn a task into steps: the on-device AI when it is ready, rules otherwise.
import { newId } from './store';
import { ruleSteps } from './tasks';
import { ai, aiBreakdown } from './ai';

export async function breakDown(t) {
  let steps = null;
  let by = 'Built-in rules';
  if (ai.enabled && ai.ready) {
    steps = await aiBreakdown(t).catch(() => null);
    if (steps) by = ai.used.plan || 'AI';
  }
  if (!steps) steps = ruleSteps(t);
  const have = new Set((t.subtasks || []).map(s => s.title.toLowerCase()));
  t.subtasks = [...(t.subtasks || []), ...steps.filter(s => !have.has(s.toLowerCase())).map(title => ({ id: newId(), title, done: false }))];
  return by;
}
