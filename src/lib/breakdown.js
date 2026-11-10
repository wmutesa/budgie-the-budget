// Turn a task into steps: Taskie's server AI (Gemini, or its own Llama), then the
// on-device AI, then rules when offline.
import { newId } from './store';
import { ruleSteps } from './tasks';
import { ai, aiBreakdown } from './ai';
import { aiSteps } from './account';

async function serverSteps(t, parent = '') {
  try {
    const r = await aiSteps({ title: t.title, kind: t.kind, date: t.date, notes: t.notes, parent, have: (t.subtasks || []).map(s => s.title) });
    return r?.steps?.length >= 2 ? { steps: r.steps, by: r.via === 'gemini' ? 'Gemini' : 'Taskie AI' } : null;
  } catch { return null; }
}

export async function breakDown(t) {
  let steps = null;
  let by = 'Built-in rules';
  const fromServer = t.subtasks?.length ? null : await serverSteps(t);
  if (fromServer) ({ steps, by } = fromServer);
  if (!steps && ai.enabled && ai.ready) {
    steps = await aiBreakdown(t).catch(() => null);
    if (steps) by = ai.used.plan || 'AI';
  }
  if (!steps) steps = ruleSteps(t);
  const have = new Set((t.subtasks || []).map(s => s.title.toLowerCase()));
  const fresh = steps.filter(s => !have.has(s.toLowerCase()));
  if (fresh.length || !t.subtasks?.length) {
    t.subtasks = [...(t.subtasks || []), ...fresh.map(title => ({ id: newId(), title, done: false }))];
    return by;
  }
  // Broken down already: go one level deeper. The first unfinished step is split into
  // smaller steps, placed right after it, so Break down can be used again and again.
  const i = t.subtasks.findIndex(s => !s.done);
  if (i < 0) return by;
  const step = t.subtasks[i];
  let smaller = null;
  const deeper = await serverSteps({ ...t, title: step.title, subtasks: [] }, t.title);
  if (deeper) ({ steps: smaller, by } = deeper);
  if (!smaller && ai.enabled && ai.ready) smaller = await aiBreakdown({ ...t, title: step.title, subtasks: [] }).catch(() => null);
  if (!smaller) smaller = finer(step.title);
  const known = new Set(t.subtasks.map(s => s.title.toLowerCase()));
  const add = smaller.map(x => `${step.title}: ${x}`).filter(x => !known.has(x.toLowerCase())).slice(0, 4);
  if (add.length) t.subtasks.splice(i + 1, 0, ...add.map(title => ({ id: newId(), title, done: false })));
  return by;
}

// Smaller pieces for any step, when no AI is around: the shape of getting one thing done.
function finer(title) {
  const t = title.toLowerCase();
  if (/draft|write|outline/.test(t)) return ['Jot the main points', 'Write the first paragraph', 'Fill in the rest', 'Read it once, out loud'];
  if (/read|brief|research|sources/.test(t)) return ['Skim the headings', 'Note three key ideas', 'Save the quotes you need'];
  if (/revise|check|review/.test(t)) return ['Check against the brief', 'Fix the biggest gap', 'Proofread'];
  if (/submit|send|save/.test(t)) return ['Export the final file', 'Upload or send it', 'Confirm it went through'];
  return ['Get what you need ready', 'Do the first ten minutes', 'Finish and check it'];
}
