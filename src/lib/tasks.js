// The Planner's engine: tasks, routines, classes, assignments and events, with
// repeats, streaks, a priority score and links to goals. Everything here is
// plain rules that run on the device; the AI only adds on top (see ai.js).
//
// A task: {
//   id, title, notes, kind: task | assignment | exam | class | event | routine,
//   date: 'YYYY-MM-DD' or '', time: 'HH:MM' or '', mins: number or null,
//   priority: high | medium | low, project: '',
//   repeat: null or { every: day | weekdays | week | month, days: [0-6], until: 'YYYY-MM-DD' },
//   done, doneAt, doneDates: [dates done, for repeating tasks],
//   subtasks: [{ id, title, done }], goalId: the life goal it moves forward,
//   source: you | ai | routine | calendar | suggestion, feedId, uid, createdAt,
// }
import { store, newId } from './store';

export const KINDS = {
  task: { label: 'Task', color: '#52525b' },
  assignment: { label: 'Assignment', color: '#7c3aed' },
  exam: { label: 'Exam', color: '#e11d48' },
  class: { label: 'Class', color: '#2563eb' },
  event: { label: 'Event', color: '#d97706' },
  routine: { label: 'Routine', color: '#16a34a' },
};
export const PRIORITIES = ['high', 'medium', 'low'];
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ---------- dates (local time, not UTC) ----------
const pad = n => String(n).padStart(2, '0');
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return isoDay(d); };
export const dayDiff = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 864e5);
export const today = () => isoDay();
export const toMins = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMins = n => `${pad(Math.floor(((n % 1440) + 1440) % 1440 / 60))}:${pad(((n % 60) + 60) % 60)}`;
export function timeLabel(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${pad(m)}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
export function dayLabel(iso, now = today()) {
  const n = dayDiff(now, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const d = fromIso(iso);
  return d.toLocaleDateString('en-US', n > 0 && n < 7 ? { weekday: 'long' } : { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---------- a new task ----------
export function makeTask(fields = {}) {
  return {
    id: newId(), title: 'New task', notes: '', kind: 'task', date: '', time: '', mins: null,
    priority: 'medium', project: '', repeat: null, done: false, doneAt: null, doneDates: [],
    subtasks: [], source: 'you', createdAt: new Date().toISOString(),
    ...fields,
  };
}

// ---------- quick add: "essay due fri 5pm #english !" ----------
const KIND_RULES = [
  ['exam', /\b(exam|midterm|final exam|finals|quiz|test)\b/i],
  ['assignment', /\b(assignment|essay|homework|hw|problem set|pset|lab report|lab write-?up|write-?up|paper|report|project \d+|project due|project:|presentation|worksheet|case study|draft|outline|thesis|dissertation|portfolio|poster|submission|submit|reading response|response paper|discussion post|annotated bibliography|bibliography|exercises?)\b/i],
  ['class', /\b(class|lecture|seminar|lab|tutorial|program|workshop|course|attendance|attend|practice|rehearsal)\b/i],
  ['routine', /\b(wake up|wake|shower|breakfast|lunch|dinner|eat|gym|workout|work out|run|jog|walk|sleep|bed|meditate|journal|stretch|skincare|call (my )?(friends?|mom|dad|family|parents))\b/i],
  ['event', /\b(meeting|meet|appointment|dentist|doctor|interview|party|event|dinner with|lunch with|date|concert|game|birthday|wedding|flight|trip)\b/i],
];
const DEFAULT_MINS = { class: 60, exam: 120, event: 60, routine: 30, assignment: 60, task: 30 };
// Course codes like "MATH 101" or "CS101A" are classes.
const COURSE_RE = /\b[A-Z]{2,5}\s?\d{3}[A-Z]?\b/;
export function guessKind(text, hasRepeat = false) {
  if (COURSE_RE.test(text) && !/\b(exam|midterm|final|quiz|test|essay|assignment|homework|hw|due)\b/i.test(text)) return 'class';
  for (const [kind, re] of KIND_RULES) {
    if (!re.test(text)) continue;
    if (kind === 'routine' && !hasRepeat) continue; // a one-off "call mom" is just a task
    return kind;
  }
  return hasRepeat ? 'routine' : 'task';
}

const DAY_RE = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';
const dayIndex = w => DAY_NAMES.findIndex(d => d.startsWith(w.toLowerCase().slice(0, 3)));
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function readTime(h, m, ap) {
  let hour = Number(h);
  const min = Number(m || 0);
  if (hour > 23 || min > 59) return null;
  if (ap) {
    ap = ap.toLowerCase();
    if (hour > 12) return null;
    if (ap.startsWith('p') && hour < 12) hour += 12;
    if (ap.startsWith('a') && hour === 12) hour = 0;
  } else if (hour >= 1 && hour <= 6) hour += 12; // "at 5" means 5 PM
  return `${pad(hour)}:${pad(min)}`;
}

// Parse one line into task fields. Returns { title, date, time, mins, repeat, priority, project, kind, found: [...chips] }.
// ---------- categories from what was said ----------
// Common subjects, spoken short or long, to one name each.
const SUBJECTS = {
  chem: 'Chemistry', chemistry: 'Chemistry', ochem: 'Organic Chemistry', bio: 'Biology', biology: 'Biology', physics: 'Physics',
  psych: 'Psychology', psychology: 'Psychology', calc: 'Calculus', calculus: 'Calculus', math: 'Math', maths: 'Math', algebra: 'Algebra',
  geometry: 'Geometry', stats: 'Statistics', statistics: 'Statistics', econ: 'Economics', economics: 'Economics', english: 'English',
  lit: 'Literature', literature: 'Literature', writing: 'Writing', history: 'History', geography: 'Geography', spanish: 'Spanish',
  french: 'French', german: 'German', chinese: 'Chinese', mandarin: 'Mandarin', japanese: 'Japanese', latin: 'Latin', arabic: 'Arabic',
  philosophy: 'Philosophy', phil: 'Philosophy', sociology: 'Sociology', soc: 'Sociology', anthropology: 'Anthropology', anthro: 'Anthropology',
  gov: 'Government', government: 'Government', 'poli sci': 'Political Science', 'political science': 'Political Science',
  cs: 'Computer Science', 'comp sci': 'Computer Science', 'computer science': 'Computer Science', programming: 'Programming', coding: 'Programming',
  art: 'Art', music: 'Music', drama: 'Drama', accounting: 'Accounting', finance: 'Finance', marketing: 'Marketing', business: 'Business',
  engineering: 'Engineering', nursing: 'Nursing', anatomy: 'Anatomy', law: 'Law', health: 'Health', pe: 'PE',
  'art history': 'Art History', 'organic chemistry': 'Organic Chemistry', 'creative writing': 'Creative Writing', 'data science': 'Data Science',
  'public health': 'Public Health', 'environmental science': 'Environmental Science', 'world history': 'World History', 'us history': 'US History',
  'earth science': 'Earth Science', 'social studies': 'Social Studies', 'computer engineering': 'Computer Engineering', 'machine learning': 'Machine Learning',
};
const SUBJECT_RE = new RegExp(`\\b(${Object.keys(SUBJECTS).sort((a, b) => b.length - a.length).join('|').replace(/ /g, '\\s+')})\\b`, 'i');
// A course code said in passing: "CHEM 110", "English 101", "MATH201".
const COURSE_CODE = /\b([A-Z][A-Za-z]{1,11}|[A-Z]{2,5})\s?(\d{3,4}[A-Z]?|\d{2}[A-Z])\b/;
// The name a category should have: one you already use (any case, or what a
// short form starts: "bio" files under your "Biology"), a known subject, or
// the words as said.
export function categoryName(raw) {
  const said = String(raw || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!said) return '';
  const key = said.toLowerCase();
  const mine = [...new Set([...Object.keys(store.projects || {}), ...(store.tasks || []).map(t => t.project).filter(Boolean)])];
  const squash = x => x.toLowerCase().replace(/\s+/g, '');
  const exact = mine.find(p => squash(p) === squash(said));
  if (exact) return exact;
  const subject = SUBJECTS[key];
  const bySubject = subject && mine.find(p => squash(p) === squash(subject));
  if (bySubject) return bySubject;
  const starts = key.length >= 3 && mine.find(p => p.toLowerCase().startsWith(key));
  if (starts) return starts;
  if (subject) return subject;
  return said.replace(/^./, c => c.toUpperCase());
}

export function parseTask(raw, now = new Date()) {
  let text = ` ${String(raw).trim()} `;
  const out = { date: '', time: '', end: '', mins: null, repeat: null, priority: 'medium', project: '' };
  const found = [];
  const take = (re, fn) => { const m = text.match(re); if (!m) return false; const keep = fn(m); if (keep !== false) text = text.replace(m[0], ' '); return keep !== false; };
  const base = isoDay(now);

  // Priority: "!", "!!", "urgent", "important"; "someday" is low.
  take(/\s!{1,3}(?=\s)|\b(urgent|asap|important|high priority|top priority)\b/i, () => { out.priority = 'high'; found.push('High priority'); });
  take(/\b(low priority|someday|whenever|no rush)\b/i, () => { out.priority = 'low'; found.push('Low priority'); });
  // Project: "#english" or "#side-project".
  take(/\s#([\p{L}\d][\p{L}\d_-]*)/u, m => { out.project = categoryName(m[1]); found.push(`#${out.project}`); });
  // Duration: "for 30 min", "1.5h", "2 hours".
  take(/\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|m|mins?|minutes?)\b/i, m => {
    out.mins = Math.round(Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1));
    if (!out.mins || out.mins > 24 * 60) return false;
    found.push(out.mins >= 60 ? `${+(out.mins / 60).toFixed(1)} h` : `${out.mins} min`);
  });

  // Repeats.
  const repeatChip = r => found.push(r.every === 'day' ? 'Every day' : r.every === 'weekdays' ? 'Weekdays' : r.every === 'month' ? 'Every month' : `Every ${r.days.map(d => DAY_SHORT[d]).join(', ')}`);
  take(/\b(every\s?day|daily|each day|every morning|every night|every evening|nightly)\b/i, () => { out.repeat = { every: 'day' }; });
  if (!out.repeat) take(/\b(every\s+weekday|weekdays|mon(?:day)?\s*-\s*fri(?:day)?)\b/i, () => { out.repeat = { every: 'weekdays' }; });
  if (!out.repeat) take(new RegExp(`\\b(?:every|each|on)\\s+(${DAY_RE}s?(?:\\s*(?:,|and|&|\\/)\\s*${DAY_RE}s?)*)\\b`, 'i'), m => {
    const days = [...m[1].matchAll(new RegExp(DAY_RE, 'gi'))].map(x => dayIndex(x[0]));
    if (!days.length || (/^on\b/i.test(m[0]) && days.length < 2)) return false;
    out.repeat = { every: 'week', days: [...new Set(days)].sort() };
  });
  if (!out.repeat) take(new RegExp(`\\b(${DAY_RE}(?:\\s*(?:,|and|&|\\/|\\s)\\s*${DAY_RE}){1,6})\\b`, 'i'), m => {
    const days = [...m[1].matchAll(new RegExp(DAY_RE, 'gi'))].map(x => dayIndex(x[0]));
    if (new Set(days).size < 2) return false;
    out.repeat = { every: 'week', days: [...new Set(days)].sort() };
  });
  if (!out.repeat) take(/\b(mwf|tth|tr|mw|tuth)\b/i, m => { out.repeat = { every: 'week', days: { mwf: [1, 3, 5], tth: [2, 4], tr: [2, 4], tuth: [2, 4], mw: [1, 3] }[m[1].toLowerCase()] }; });
  if (!out.repeat) take(/\b(\d|one|two|three|four|five|six)\s*(?:x|times)\s*(?:a|per|\/)\s*week\b/i, m => {
    const n = NUM_WORDS[m[1].toLowerCase()] || Number(m[1]);
    out.repeat = { every: 'week', days: { 1: [1], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] }[n] || [1, 3, 5] };
  });
  if (!out.repeat) take(new RegExp(`\\b${DAY_RE}s\\b`, 'i'), m => { out.repeat = { every: 'week', days: [dayIndex(m[1])] }; });
  if (!out.repeat) take(/\b(every\s+week|weekly)\b/i, () => { out.repeat = { every: 'week', days: [now.getDay()] }; });
  if (!out.repeat) take(/\b(every\s+month|monthly)\b/i, () => { out.repeat = { every: 'month' }; });
  if (out.repeat) repeatChip(out.repeat);

  // Dates.
  const setDate = iso => { out.date = iso; };
  const dated =
    take(/\b(?:due|by|on|before)?\s*(today|tonight|this (?:morning|afternoon|evening))\b/i, m => { setDate(base); if (/tonight|evening/i.test(m[1]) && !out.time) out.time = /tonight/i.test(m[1]) ? '20:00' : '18:00'; }) ||
    take(/\b(?:due|by|on|before)?\s*(the )?day after (tomorrow|tmrw?)\b/i, () => setDate(addDays(base, 2))) ||
    take(/\b(?:due|by|on|before)?\s*(tomorrow|tmrw?|tmw)\b/i, () => setDate(addDays(base, 1))) ||
    take(/\b(?:due|by|on)?\s*(this )?weekend\b/i, () => setDate(addDays(base, (6 - now.getDay() + 7) % 7 || 0))) ||
    take(/\b(?:due|by|on)?\s*next week\b/i, () => setDate(addDays(base, ((8 - now.getDay()) % 7) || 7))) ||
    take(/\b(?:due|by|on)?\s*(?:end of (?:the )?month|eom)\b/i, () => setDate(isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)))) ||
    take(/\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|week|month)s?\b/i, m => {
      const n = NUM_WORDS[m[1].toLowerCase()] || Number(m[1]);
      const d = new Date(now); if (m[2] === 'day') d.setDate(d.getDate() + n); else if (m[2] === 'week') d.setDate(d.getDate() + 7 * n); else d.setMonth(d.getMonth() + n);
      setDate(isoDay(d));
    }) ||
    take(new RegExp(`\\b(?:due|by|on|before)?\\s*${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), m => monthDay(m[1], m[2])) ||
    take(new RegExp(`\\b(?:due|by|on|before)?\\s*(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`, 'i'), m => monthDay(m[2], m[1])) ||
    // "the 18th", "Friday the 21st", "due the 3rd": the number of the day wins over a weekday said with it.
    take(new RegExp(`\\b(?:(?:due|by|on|before)\\s+)?(?:(?:next|this)\\s+)?(?:${DAY_RE},?\\s+)?the\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s+(?:century|floor|amendment|edition|grade|place|time|chapter|page))`, 'i'), m => {
      const n = Number(m[m.length - 1]); // the weekday pattern has its own group; the day number is the last one
      if (n < 1 || n > 31) return false;
      const d = new Date(now.getFullYear(), now.getMonth(), n);
      if (d.getDate() !== n) return false;
      if (isoDay(d) < base) d.setMonth(d.getMonth() + 1);
      if (d.getDate() !== n) return false;
      setDate(isoDay(d));
    }) ||
    take(/\b(?:due|by|on|before)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i, m => {
      const d = new Date(now.getFullYear(), now.getMonth(), Number(m[1]));
      if (d.getDate() !== Number(m[1])) return false;
      if (isoDay(d) < base) d.setMonth(d.getMonth() + 1);
      setDate(isoDay(d));
    }) ||
    take(/\b(?:due|by|on|before)?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, m => {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
      const d = new Date(y, Number(m[1]) - 1, Number(m[2]));
      if (d.getMonth() !== Number(m[1]) - 1) return false;
      if (!m[3] && isoDay(d) < base) d.setFullYear(d.getFullYear() + 1);
      setDate(isoDay(d));
    }) ||
    take(new RegExp(`\\b(?:(due|by|on|before|next|this|until)\\s+)?${DAY_RE}\\b`, 'i'), m => {
      // Short names ("sat", "sun") count after a word like "due" or "on", or at the end or before a time.
      const after = text.slice(m.index + m[0].length);
      if (!m[1] && !/day$/i.test(m[2]) && !/^\s*($|\d|at\b|,|noon|morning|afternoon|evening|night)/i.test(after)) return false;
      const target = dayIndex(m[2]);
      let diff = (target - now.getDay() + 7) % 7;
      if (m[1] && /next/i.test(m[1]) && diff === 0) diff = 7;
      setDate(addDays(base, diff));
    });
  function monthDay(mon, day) {
    const mi = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
    const d = new Date(now.getFullYear(), mi, Number(day));
    if (d.getMonth() !== mi) return false;
    if (isoDay(d) < base) d.setFullYear(d.getFullYear() + 1);
    setDate(isoDay(d));
  }

  // Times: "5pm", "at 7:30", "10-12", "10am-12pm", "noon".
  take(/\b(?:from\s+|at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s)/i, m => {
    if (!m[3] && !m[6] && !m[2] && !m[5] && !/at|from/i.test(m[0])) {
      // "10-12" only counts as times when it looks like hours of the day.
      if (Number(m[1]) > 12 || Number(m[4]) > 12) return false;
    }
    const a = readTime(m[1], m[2], m[3] || (m[6] && Number(m[1]) <= Number(m[4]) ? m[6] : ''));
    const b = readTime(m[4], m[5], m[6]);
    if (!a || !b) return false;
    out.time = a; out.end = b;
    const span = toMins(b) - toMins(a);
    if (span > 0) out.mins = span;
  }) ||
    take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=[\s,.]|$)/i, m => { const t = readTime(m[1], m[2], m[3]); if (!t) return false; out.time = t; }) ||
    take(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i, m => { const t = readTime(m[1], m[2], ''); if (!t) return false; out.time = t; }) ||
    take(/\b(\d{1,2}):(\d{2})\b/, m => { if (Number(m[1]) > 23 || Number(m[2]) > 59) return false; out.time = /^0/.test(m[1]) || Number(m[1]) > 6 || Number(m[1]) === 0 ? `${pad(Number(m[1]))}:${m[2]}` : readTime(m[1], m[2], ''); }) ||
    take(/\b(?:at\s+)?(noon|midday|midnight)\b/i, m => { out.time = /midnight/i.test(m[1]) ? '23:59' : '12:00'; }) ||
    take(/\b(?:in the\s+)?(morning|afternoon|evening)\b/i, m => { if (!out.time) out.time = { morning: '09:00', afternoon: '14:00', evening: '18:00' }[m[1].toLowerCase()]; });

  if (out.date) found.unshift(dayLabel(out.date, base));
  if (out.time) found.splice(out.date ? 1 : 0, 0, out.end ? `${timeLabel(out.time)}–${timeLabel(out.end)}` : timeLabel(out.time));

  // What is left is the title.
  let title = text.replace(/\s+(due|by|on|at|for|from|every|before|until)\s*$/i, ' ').replace(/^\s*(remind me to|remember to|i need to|need to|i have to|have to|todo:?|to do:?)\s+/i, '');
  title = title.replace(/\s+(due|by|on|at)\s+(?=[,.;]|$)/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim();
  title = title.replace(/\s+(?:is|are|was|were|will be|that's|which is)$/i, '').trim();
  if (!title) title = 'New task';
  title = title.charAt(0).toUpperCase() + title.slice(1);
  // No #category said: a course code or a subject in the name gives one (the name itself stays whole).
  if (!out.project) {
    const code = ` ${raw} `.match(COURSE_CODE);
    const subj = title.match(SUBJECT_RE);
    if (code && !/^(?:room|page|chapter|unit|lab|set|homework|hw|exercise|problem|week|day|year|grade)$/i.test(code[1])) out.project = categoryName(`${code[1]} ${code[2]}`);
    else if (subj) out.project = categoryName(SUBJECTS[subj[1].toLowerCase().replace(/\s+/g, ' ')] || subj[1]);
    if (out.project) found.push(`#${out.project}`);
  }
  const kind = guessKind(` ${raw} `, Boolean(out.repeat));
  // A time is enough: the usual length fills in when none is given.
  if (out.time && !out.mins) out.mins = DEFAULT_MINS[kind] || 30;
  // Classes and routines that repeat need a start date: today.
  if (out.repeat && !out.date) out.date = base;
  // Assignments and exams due soon start as high priority.
  if (out.priority === 'medium' && ['assignment', 'exam'].includes(kind) && out.date && dayDiff(base, out.date) <= 2) out.priority = 'high';
  return { title, ...out, kind, found };
}

// Split pasted or dictated text into one task per line.
export const splitLines = text => String(text).split(/\n|;|\s+•\s+|\bthen\b/i).map(s => s.trim()).filter(Boolean);

export function addFromText(text, extra = {}) {
  const made = splitLines(text).map(line => {
    const p = parseTask(line);
    return makeTask({ title: p.title, date: p.date, time: p.time, mins: p.mins, repeat: p.repeat, priority: p.priority, project: p.project, kind: p.kind, ...extra });
  });
  store.tasks.unshift(...made);
  return made;
}

// ---------- repeats ----------
// Does this task happen on this day?
export function occursOn(t, iso) {
  if (!t.repeat) return t.date === iso;
  if (t.skipDates?.includes(iso)) return false;
  const start = t.date || (t.createdAt || '').slice(0, 10);
  if (start && iso < start) return false;
  if (t.repeat.until && iso > t.repeat.until) return false;
  const d = fromIso(iso);
  const wd = d.getDay();
  switch (t.repeat.every) {
    case 'day': return true;
    case 'weekdays': return wd >= 1 && wd <= 5;
    case 'week': return (t.repeat.days?.length ? t.repeat.days : [fromIso(start || iso).getDay()]).includes(wd);
    case 'month': return d.getDate() === fromIso(start || iso).getDate();
    default: return false;
  }
}
export const isDone = (t, iso = today()) => (t.repeat ? (t.doneDates || []).includes(iso) : Boolean(t.done));
export function nextOccurrence(t, from = today()) {
  if (!t.repeat) return t.date;
  for (let i = 0; i < 62; i++) { const d = addDays(from, i); if (occursOn(t, d) && !isDone(t, d)) return d; }
  return '';
}
// How many times in a row it was done, counting back from today (today only counts once done).
export function streak(t, now = today()) {
  if (!t.repeat) return 0;
  let n = 0;
  let d = isDone(t, now) ? now : addDays(now, -1);
  for (let i = 0; i < 400; i++) {
    if (occursOn(t, d)) { if (isDone(t, d)) n++; else break; }
    d = addDays(d, -1);
    if (t.date && d < t.date) break;
  }
  return n;
}
// Every item between two days (inclusive), one per occurrence: [{ task, date, done }].
export function occurrences(from, to, list = store.tasks) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const t of list) if ((t.date || t.repeat) && occursOn(t, d)) out.push({ task: t, date: d, done: isDone(t, d), key: `${t.id}:${d}` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.task.time || '00:00').localeCompare(b.task.time || '00:00'));
}

// ---------- doing things ----------
// Tick a task (or one day of a repeating one).
export function toggleDone(t, iso = today()) {
  if (t.repeat) {
    const set = new Set(t.doneDates || []);
    const was = set.has(iso);
    was ? set.delete(iso) : set.add(iso);
    t.doneDates = [...set].sort().slice(-400);
    return !was;
  }
  t.done = !t.done;
  t.doneAt = t.done ? new Date().toISOString() : null;
  if (t.done) (t.subtasks || []).forEach(s => { s.done = true; });
  return t.done;
}
// Skip one day of a repeating item ("not today").
export function skipDay(t, iso) { t.skipDates = [...new Set([...(t.skipDates || []), iso])].sort().slice(-200); }
export function duplicateTask(t) {
  const copy = makeTask({ ...JSON.parse(JSON.stringify(t)), id: newId(), done: false, doneAt: null, doneDates: [], skipDates: [], source: 'you', uid: undefined, feedId: undefined, createdAt: new Date().toISOString() });
  store.tasks.unshift(copy);
  return copy;
}

// ---------- breaking a task into steps ----------
// Steps from rules, by kind; the on-device AI writes better ones when ready (see breakdown.js).
export function ruleSteps(t) {
  const name = t.title.replace(/^(work on|finish|submit|do|prepare for|study for|review for)\s+/i, '');
  const by = {
    assignment: [`Read the brief for ${name} and note what is asked`, 'Gather sources and notes', 'Write an outline', 'Write the first draft', 'Revise and check against the brief', 'Submit and save a copy'],
    exam: ['List every topic that will be tested', 'Make a one-page summary per topic', 'Do practice questions', 'Review what you got wrong', 'Quick final review the day before'],
    class: ['Do the reading or prep', 'Pack what you need', 'Review notes afterwards'],
    event: ['Confirm the time and place', 'Prepare what to bring or say', 'Plan how to get there'],
    routine: ['Get ready', 'Do it', 'Tick it off'],
  }[t.kind];
  if (by) return by;
  if (/clean|tidy/i.test(t.title)) return ['Clear surfaces', 'Put things away', 'Wipe and vacuum', 'Take out the trash'];
  if (/apply|application|job/i.test(t.title)) return ['Read the posting and note requirements', 'Tailor your CV', 'Write the cover letter', 'Submit and note the date'];
  if (/move|trip|travel|pack/i.test(t.title)) return ['Make a list of what is needed', 'Book or confirm what is missing', 'Pack', 'Double-check documents'];
  return [`Decide what "done" means for ${name}`, 'Do the first 15 minutes', 'Finish the main part', 'Check it and wrap up'];
}

export const removeTask = t => { store.tasks = store.tasks.filter(x => x.id !== t.id); };
export function moveTo(t, iso) { t.date = iso; }

// ---------- priority ----------
const P_WEIGHT = { high: 30, medium: 15, low: 4 };
// Higher means do it sooner: urgency from the due date, then priority and kind.
export function score(t, now = today()) {
  let s = P_WEIGHT[t.priority] ?? 15;
  const date = t.repeat ? nextOccurrence(t, now) : t.date;
  if (date) {
    const n = dayDiff(now, date);
    s += n < 0 ? 40 + Math.min(20, -n * 2) : n === 0 ? 30 : n === 1 ? 20 : n <= 3 ? 12 : n <= 7 ? 6 : 0;
  }
  if (['assignment', 'exam'].includes(t.kind)) s += 8;
  if (t.kind === 'routine') s -= 10;
  if (t.subtasks?.length) s += Math.min(6, 2 * t.subtasks.filter(x => !x.done).length);
  return s;
}
export function urgency(t, now = today()) {
  const s = score(t, now);
  return s >= 55 ? 'high' : s >= 30 ? 'medium' : 'low';
}

// Open, one-off tasks and the next run of repeating ones, most urgent first.
export function openTasks(now = today()) {
  return store.tasks.filter(t => (t.repeat ? Boolean(nextOccurrence(t, now)) : !t.done)).sort((a, b) => score(b, now) - score(a, now));
}

// A short sentence for the top of the page.
export function summary(now = today()) {
  const items = occurrences(now, now);
  const left = items.filter(x => !x.done);
  const overdue = store.tasks.filter(t => !t.repeat && !t.done && t.date && t.date < now).length;
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const next = left.find(x => x.task.time && toMins(x.task.time) >= nowMins);
  const parts = [];
  parts.push(left.length ? `${left.length} thing${left.length === 1 ? '' : 's'} left today` : items.length ? 'Everything for today is done' : 'Nothing planned for today yet');
  if (overdue) parts.push(`${overdue} overdue`);
  if (next) parts.push(`next: ${next.task.title} at ${timeLabel(next.task.time)}`);
  return parts.join(' · ');
}

// ---------- routine ----------
// Build a daily routine from wake and sleep times and a few words about your
// week ("gym 3x a week at 6pm, classes mwf 10-12, call friends sundays").
export function buildRoutine({ wake = '07:00', sleep = '23:00', text = '' } = {}) {
  const w = toMins(wake) ?? 420;
  const s = toMins(sleep) ?? 1380;
  const extras = splitLines(text.replace(/,\s*(?=[a-z])/gi, '\n')).map(l => parseTask(l)).filter(p => p.title && p.title !== 'New task');
  const has = re => extras.some(p => re.test(p.title));
  const base = [
    ['Wake up', w, 5, /wake/i],
    ['Shower', w + 15, 15, /shower/i],
    ['Breakfast', w + 35, 20, /breakfast/i],
    ['Lunch', Math.max(w + 240, 12 * 60 + 30), 30, /lunch/i],
    ['Dinner', Math.min(s - 180, 19 * 60), 40, /dinner|supper/i],
    ['Wind down, no screens', s - 30, 30, /wind|screen|read/i],
    ['Sleep', s, null, /sleep|bed/i],
  ].filter(([, , , re]) => !has(re));
  const items = base.map(([title, at, mins]) => ({ title, time: fromMins(at), mins, repeat: { every: 'day' }, kind: 'routine' }));
  for (const p of extras) {
    items.push({ title: p.title, time: p.time || '', mins: p.mins, repeat: p.repeat || { every: 'day' }, kind: p.kind === 'task' ? 'routine' : p.kind, project: p.project });
  }
  return items.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}
// Swap the routine in the planner for a new one, keeping streaks of anything with the same name.
export function saveRoutine(items) {
  const old = new Map(store.tasks.filter(t => t.source === 'routine').map(t => [t.title.toLowerCase(), t]));
  const start = today();
  // Skip habits you already added yourself ("Gym MWF 6pm").
  const yours = new Set(store.tasks.filter(t => t.source !== 'routine' && t.repeat).map(t => t.title.toLowerCase()));
  const made = items.filter(i => !yours.has(i.title.toLowerCase())).map(i => {
    const prev = old.get(i.title.toLowerCase());
    return makeTask({ ...i, date: prev?.date || start, source: 'routine', priority: 'medium', doneDates: prev?.doneDates || [], id: prev?.id || newId() });
  });
  store.tasks = [...store.tasks.filter(t => t.source !== 'routine'), ...made];
  return made;
}
