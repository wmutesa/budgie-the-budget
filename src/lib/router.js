// The Add button (and voice): write or say anything, one thing per
// line, and Taskie decides what each line is: a task (or event, class,
// deadline), a routine (something that repeats), or a life goal. You can
// change any choice before sending.
import { store, newId } from './store';
import { parseTask, makeTask, splitLines, dayLabel, timeLabel, today, KINDS, DAY_SHORT } from './tasks';
import { parseGoal, makeGoal, planGoal, GOAL_WORDS } from './goals';
import { isNotTask } from './titles';

export const DESTS = {
  task: { label: 'Task', icon: 'planner' },
  routine: { label: 'Routine', icon: 'repeat' },
  goal: { label: 'Goal', icon: 'target' },
};

// Read one line and pick what it is.
export function route(line) {
  const text = line.trim();
  const task = parseTask(text);
  const goal = parseGoal(text);
  let dest = 'task';
  if (task.repeat) dest = 'routine';
  else if (GOAL_WORDS.test(text) && !task.time) dest = 'goal';
  const why = { task: task.date ? 'Something to do on a day' : 'Something to do', routine: 'Something that repeats', goal: 'Something you are working towards: Taskie adds milestones' }[dest];
  return { id: newId(), text, dest, task, goal, why };
}
// Comma lists ("gym mwf 6pm, call mom sundays") become one line each when every part has a time or day.
const splitCommas = line => { const parts = line.split(/,\s*/).map(x => x.trim()).filter(Boolean); return parts.length > 1 && parts.every(x => parseTask(x).date || parseTask(x).repeat || parseTask(x).time) ? parts : [line]; };
// Lines that are talk, not things to do ("okay", "thank you", "testing"), are left out.
export const routeAll = text => splitLines(text).flatMap(splitCommas).filter(l => !isNotTask(l)).map(route);

// Speech has no line breaks, and one recording can hold dozens of things.
// Split at sentence ends; at spoken numbering ("first", "number two",
// "next", "another one", "oh and"); at "then / also / plus / after that /
// as well as"; and at "and" or a comma when what follows starts a new thing:
// a verb ("call", "finish", "submit"…), "I have / I need / I want", or a
// listed item ("a lab report due Monday", "my essay on Friday"). It does not
// split "Monday and Wednesday", "mom and dad" or "between 2 and 4".
const VERBS = 'call|email|text|message|pay|buy|book|study|finish|submit|start|go|meet|gym|add|schedule|learn|read|run|clean|write|review|prepare|prep|practice|practise|send|reply|plan|pick|drop|fix|watch|cook|wash|visit|see|ask|check|update|apply|register|sign|print|order|return|bring|take|make|do|attend|work|revise|research|draft|edit|record|upload|walk|train|swim|cycle|meditate|journal|organize|organise|tidy|vacuum|water|feed|renew|cancel|file|translate|interview|present|teach|tutor|help|remind|remember|need|have|want|must|should|gotta|got';
const STARTS = `(?:i\\s|i'm\\s|i've\\s|i'll\\s|i'd\\s|we\\s|there's\\s|there\\sis\\s|(?:${VERBS})\\b|(?:a|an|the|my|our)\\s+[\\w#'-]+(?:\\s+[\\w#'-]+){0,4}\\s+(?:due|on|at|by|for|tomorrow|today|tonight|next|this|every|before|after|until)\\b)`;
const AND_SPLIT = new RegExp(`(?:,|;)?\\s+(?:and|&)\\s+(?=${STARTS})`, 'gi');
const COMMA_SPLIT = new RegExp(`\\s*[,;]\\s+(?=${STARTS})`, 'gi');
const NUMBERED = /(?:,?\s*\band\s+)?\b(?:(?:number|item|task)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)|firstly|secondly|thirdly|(?:first|second|third|next|last)\s+(?:thing|one|of\s+all)|another\s+(?:one|thing)|one\s+more\s+thing|oh\s+and|also|as\s+well\s+as|on\s+top\s+of\s+that|lastly|finally)\b\s*,?\s*/gi;
// A new thing often starts right after a day or time, with no word between: "…on Saturday gym every Monday".
const WHEN_WORD = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|morning|afternoon|evening|night|week|month|year|weekend|[ap]m|\\d)';
// "for chemistry I have X and Y" or "in history: X, Y": the course carries to each part.
const CONTEXT = /^(?:(?:for|in)\s+(?:my\s+)?([a-z][\w&-]*(?:\s+\d{2,4})?)(?:\s+(?:class|course|module|unit))?\s*[,:]?\s+(?=(?:i|we|there|a|an|the|my)\b)|([a-z][\w&-]*(?:\s+\d{2,4})?)\s+(?:class|course|homework)\s*[:,]\s*)/i;
const NOT_COURSE = /^(?:the|a|an|this|next|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|work|home|now|then|me|it)$/i;

// Assignments listed without a verb or "a": "Lab Report 3 due Friday and Problem Set 7 due the 18th".
// Split at "and" or a comma when both sides have their own "due", so "Homework 5.2 and 5.3 due Monday" stays one.
function splitDue(part) {
  const bits = part.split(/\s*,\s*(?:and\s+)?|\s+and\s+/i);
  if (bits.length < 2) return [part];
  const seps = part.match(/\s*,\s*(?:and\s+)?|\s+and\s+/gi) || [];
  const out = [bits[0]];
  bits.slice(1).forEach((b, i) => {
    const last = out[out.length - 1];
    if (/\bdue\b/i.test(last) && /\bdue\b/i.test(b)) out.push(b); else out[out.length - 1] = `${last}${seps[i]}${b}`;
  });
  return out;
}

// Lists said in one breath: "A paper of English due Friday Consuming cultures paper
// due December 15 Reading for history due Tuesday". Each due date ends an item, unless
// what follows is about that item ("at 5", "for chemistry", "and", a time).
const DUE_AT = new RegExp(String.raw`\bdue\s+(?:on\s+|by\s+)?(?:(?:next|this)\s+)?(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?(?:\s+the\s+\d{1,2}(?:st|nd|rd|th)?)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|the\s+\d{1,2}(?:st|nd|rd|th)|\d{1,2}\/\d{1,2}|tomorrow|today|tonight|next\s+week)(?:\s+(?:at|by)\s+\d{1,2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?)?`, 'gi');
const KEEPS_GOING = /^(?:at|by|for|in|on|before|after|until|around|from|to|and|or|with|which|that|it|[,;.]|\d|#|noon|midnight|in the|[ap]\.?m\b)/i;
function splitAfterDue(part) {
  const out = [];
  let rest = part, m;
  DUE_AT.lastIndex = 0;
  while ((m = DUE_AT.exec(rest))) {
    const end = m.index + m[0].length;
    const after = rest.slice(end).trim();
    if (after.split(/\s+/).length >= 2 && !KEEPS_GOING.test(after)) {
      out.push(rest.slice(0, end).trim());
      rest = after; DUE_AT.lastIndex = 0;
    }
  }
  out.push(rest.trim());
  return out.filter(Boolean);
}

export function splitSpoken(text) {
  const sentences = String(text)
    .replace(/\r/g, '')
    .replace(/(\d)\.(\d)/g, '$1·$2')                              // keep "5.30" whole
    .replace(/\b([ap])\.\s?m\./gi, '$1m')                          // "5 p.m." is not a sentence end
    .replace(/[.!?]+(?:\s+|$)/g, '\n')
    .replace(NUMBERED, '\n')
    .replace(/,?\s+\b(?:and then|then|after that|plus)\b\s+/gi, '\n')
    .replace(new RegExp(`(?<=\\b${WHEN_WORD}\\b)\\s+(?=(?:${VERBS})\\b)`, 'gi'), '\n')
    .split('\n');
  const out = [];
  for (const sentence of sentences) {
    let s = sentence.trim().replace(/^(?:(?:okay|ok|so|um+|uh+|well|right|alright)\b[,\s]*)+/i, '');
    if (!s) continue;
    // A course said once applies to every thing in the sentence.
    let tag = '';
    const m = s.match(CONTEXT);
    const course = m && (m[1] || m[2]);
    if (course && !NOT_COURSE.test(course)) { tag = ` #${course.replace(/\s+/g, '')}`; s = s.slice(m[0].length); }
    const parts = s.replace(AND_SPLIT, '\n').replace(COMMA_SPLIT, '\n').split('\n').flatMap(splitAfterDue).flatMap(splitDue);
    for (const p of parts) {
      const clean = p.trim()
        .replace(/^(?:and|so|okay|ok|um+|uh+|well)\b[,\s]*/i, '')
        .replace(/^(?:add|remind me to|remember to|don't forget to|i need to|i have to|i've got to|i gotta|i must|i should)\s+/i, '')
        .replace(/^(?:i have|i've got|i got|i also have|there's|there is|we have)\s+(?!to\b)/i, '')
        .replace(/^(?:have|has|got)\s+(?=(?:a|an|the|my|our)\b)/i, '')
        .replace(/^(?:a|an|the)\s+(?=\S)/i, '')
        .replace(/[.,;]+$/, '')
        .replace(/·/g, '.')
        .trim();
      if (clean.length <= 1) continue;
      // "call mom on Sunday and dad on Saturday": the verb carries to the second person or thing.
      const carry = !clean.includes(',') && clean.match(new RegExp(`^((?:${VERBS}))\\s+(.+?\\b(?:on|at|by|this|next|every|tomorrow|today|tonight)\\b.*?)\\s+and\\s+([\\w'-]+(?:\\s+[\\w'-]+)?\\s+(?:on|at|by|this|next|every|tomorrow|today|tonight)\\b.*)$`, 'i'));
      const pieces = carry ? [`${carry[1]} ${carry[2]}`, `${carry[1]} ${carry[3]}`] : [clean];
      for (const piece of pieces) out.push(tag && !/#\w/.test(piece) ? `${piece}${tag}` : piece);
    }
  }
  return out;
}
export const routeSpoken = text => splitSpoken(text).map(route);

// What each choice will create.
export function preview(r, d) {
  const t = r.task;
  if (d === 'goal') return [r.goal.title, r.goal.by ? `by ${dayLabel(r.goal.by)}` : 'no date', 'milestones added for you'].join(' · ');
  const when = t.repeat ? (t.repeat.every === 'day' ? 'every day' : t.repeat.every === 'weekdays' ? 'weekdays' : t.repeat.every === 'month' ? 'monthly' : t.repeat.days?.map(x => DAY_SHORT[x]).join(' ')) : t.date && dayLabel(t.date);
  return [d === 'routine' ? 'Routine' : KINDS[t.kind].label, t.title, when, t.time && timeLabel(t.time), t.project && `#${t.project}`].filter(Boolean).join(' · ');
}

// Send the lines. Returns what was made, for the note and for Undo.
export async function sendAll(list) {
  const n = { task: 0, routine: 0, goal: 0, made: [] };
  for (const r of list) {
    const p = r.task;
    if (r.dest === 'goal') {
      const g = makeGoal({ title: r.goal.title, by: r.goal.by });
      await planGoal(g);
      n.made.push({ r, to: 'goal', id: g.id, label: g.title, sub: `${g.milestones.length} milestones${g.by ? ` · by ${dayLabel(g.by)}` : ''}` });
    } else {
      const routine = r.dest === 'routine';
      const t = makeTask({ title: p.title, date: p.date || (routine ? today() : ''), time: p.time, mins: p.mins, repeat: routine ? (p.repeat || { every: 'day' }) : null, priority: p.priority, project: p.project, kind: routine && p.kind === 'task' ? 'routine' : p.kind, source: 'playground' });
      store.tasks.unshift(t);
      n.made.push({ r, to: r.dest, id: t.id, label: t.title, sub: preview({ ...r, task: { ...p, repeat: t.repeat } }, r.dest).split(' · ').slice(2).join(' · ') });
    }
    n[r.dest]++;
  }
  return n;
}

// Take back everything one send created (goals take their milestone tasks with them).
export function undoSend(n) {
  const ids = new Set(n.made.map(m => m.id));
  store.goals = store.goals.filter(g => !ids.has(g.id));
  store.tasks = store.tasks.filter(t => !ids.has(t.id) && !ids.has(t.goalId));
}

// Switch something already added: a task becomes a routine or a goal, and so on.
// Returns the new entry for the list of what was added.
export async function switchMade(m, dest) {
  if (m.to === dest || !m.r) return m;
  undoSend({ made: [m] });
  const out = await sendAll([{ ...m.r, dest }]);
  return out.made[0];
}
