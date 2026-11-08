// Gemini's items as lines Budgie's own reader understands, e.g.
// "Lab report due Nov 12 at 5pm 90 min #Chemistry" or "Gym Mon Wed at 6pm".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYNAME = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const FULL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const md = iso => { const [, m, d] = iso.split('-').map(Number); return `${MON[m - 1]} ${d}`; };
const ampm = hm => { let [h, m] = hm.split(':').map(Number); const pm = h >= 12; h = h % 12 || 12; return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${pm ? 'pm' : 'am'}`; };
export function itemLine(x) {
  const course = x.course ? ` #${x.course.replace(/\s+/g, '-').replace(/[^\w-]+/g, '')}` : '';
  if (x.kind === 'goal') return `I want to ${x.title.replace(/^(?:to\s+)/i, '').replace(/^\w/, c => c.toLowerCase())}${x.date ? ` by ${md(x.date)}` : ''}${course}`;
  let when = '';
  if (x.repeat === 'daily') when = ' every day';
  else if (x.repeat === 'weekdays') when = ' every weekday';
  else if (x.repeat === 'monthly') when = x.date ? ` monthly on the ${Number(x.date.slice(8))}${['th', 'st', 'nd', 'rd'][Number(x.date.slice(8)) % 10 > 3 || [11, 12, 13].includes(Number(x.date.slice(8))) ? 0 : Number(x.date.slice(8)) % 10]}` : ' monthly';
  // Several days read as one repeat when listed without commas ("Mon Wed Fri"); one day needs "every Monday".
  else if (x.repeat === 'weekly' || x.days?.length) when = x.days?.length > 1 ? ` ${x.days.map(d => DAYNAME[d]).join(' ')}` : x.days?.length ? ` every ${FULL[x.days[0]]}` : ' every week';
  else if (x.date) when = `${['assignment', 'exam'].includes(x.kind) ? ' due' : ' on'} ${md(x.date)}`;
  return `${x.title}${when}${x.time ? ` at ${ampm(x.time)}` : ''}${x.minutes ? ` ${x.minutes} min` : ''}${pri(x)}${course}`;
}
// Said priority, in words Budgie's reader knows.
const pri = x => (x.priority === 'high' ? ' high priority' : x.priority === 'low' ? ' low priority' : '');

// Words of 3+ letters, or numbers, from a title must appear in what was said: no made-up items.
export const saidIn = text => { const w = new Set(String(text).toLowerCase().match(/[a-z]{3,}|\d+/g) || []); return title => (String(title).toLowerCase().match(/[a-z]{3,}|\d+/g) || []).some(x => w.has(x)); };
export const localLine = x => {
  const course = x.course ? ` #${x.course.replace(/\s+/g, '-')}` : '';
  if (x.kind === 'goal') return `I want to ${x.title.replace(/^(?:to\s+)/i, '').replace(/^\w/, c => c.toLowerCase())}${x.when ? ` ${x.when}` : ''}${course}`;
  const due = x.when && ['assignment', 'exam'].includes(x.kind) && !/^(?:due|by|on|every|each|this|next|in)\b/i.test(x.when) ? ' due' : '';
  return `${x.title}${x.when ? `${due} ${x.when}` : ''}${x.time ? ` at ${x.time.replace(/^at\s+/i, '')}` : ''}${pri(x)}${course}`;
};

// Apply the kind an AI decided: an exam stays an exam, a goal becomes a goal.
export function withKind(r, kind) {
  if (!kind) return r;
  if (kind === 'goal') return { ...r, dest: 'goal' };
  const task = { ...r.task, kind: kind === 'routine' && !r.task.repeat ? 'task' : kind };
  return { ...r, task, dest: r.dest === 'goal' ? (task.repeat ? 'routine' : 'task') : r.dest };
}

