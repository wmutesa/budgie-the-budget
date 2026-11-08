// How titles are written, for every way something is added (typed, spoken,
// or sorted by an AI):
//  - Title Case: the first letter of every word is a capital ("Call Mom About
//    The Trip"), keeping words that already have capitals inside them
//    ("iPhone", "CS61A", "McDonald's"), numbers, #categories, links and emojis.
//  - Emojis are kept, typed or spoken ("heart emoji" becomes ❤️).
//  - Spoken punctuation ("comma", "full stop", "question mark", "new line")
//    becomes the mark itself, so "call mom comma dad" reads "call mom, dad".
//  - Lines that are not things to do ("okay", "thank you", "testing testing",
//    "that's it") are dropped before anything is added.

const EMOJI = /\p{Extended_Pictographic}/u;
const LETTER = /\p{L}/u;

export function titleCase(raw) {
  return String(raw ?? '').split(/(\s+)/).map(word => {
    if (!word.trim()) return word;
    if (/^(?:#|@|https?:|www\.)/i.test(word) || /\S+@\S+\.\S+/.test(word)) return word; // categories, people, links, emails
    // Keep words that already mix capitals inside ("iPhone", "McDonald's", "CS61A").
    const at = word.search(LETTER);
    if (at < 0) return word; // numbers, emojis, punctuation
    if (/\p{Lu}/u.test(word.slice(at + 1)) && /\p{Ll}/u.test(word)) return word;
    // Every part of a hyphenated or slashed word gets a capital: "Follow-Up", "Read/Write".
    return word.replace(/(^|[-/(["'“‘])(\p{Ll})/gu, (m, before, c) => (before === "'" || before === '’' ? m : before + c.toUpperCase()))
      .replace(new RegExp(`^([^\\p{L}]*)(\\p{Ll})`, 'u'), (_, pre, c) => pre + c.toUpperCase());
  }).join('');
}

// ---------- spoken emoji ----------
const SPOKEN_EMOJI = {
  'smiley face': '😊', smiley: '😊', smile: '😊', 'happy face': '😊', 'sad face': '😢', sad: '😢', crying: '😭', laughing: '😂', 'thumbs up': '👍', 'thumbs down': '👎',
  heart: '❤️', 'red heart': '❤️', fire: '🔥', star: '⭐', check: '✅', 'check mark': '✅', checkmark: '✅', cross: '❌', warning: '⚠️', party: '🎉', celebration: '🎉',
  book: '📚', books: '📚', pencil: '✏️', pen: '🖊️', notebook: '📓', laptop: '💻', computer: '💻', calendar: '📅', clock: '⏰', alarm: '⏰', 'alarm clock': '⏰',
  graduation: '🎓', 'graduation cap': '🎓', school: '🏫', science: '🔬', microscope: '🔬', 'test tube': '🧪', math: '➗', calculator: '🧮', globe: '🌍', music: '🎵',
  gym: '🏋️', 'weight lifting': '🏋️', running: '🏃', runner: '🏃', basketball: '🏀', soccer: '⚽', football: '🏈', bike: '🚴', yoga: '🧘', swimming: '🏊',
  food: '🍽️', pizza: '🍕', coffee: '☕', shopping: '🛒', 'shopping cart': '🛒', money: '💰', phone: '📱', email: '📧', mail: '📧', car: '🚗', plane: '✈️', house: '🏠', home: '🏠',
  dog: '🐶', cat: '🐱', sun: '☀️', moon: '🌙', sleep: '😴', sleeping: '😴', brain: '🧠', idea: '💡', 'light bulb': '💡', rocket: '🚀', trophy: '🏆', pin: '📌', pushpin: '📌',
  'hundred': '💯', '100': '💯', clap: '👏', pray: '🙏', 'praying hands': '🙏', muscle: '💪', flex: '💪', eyes: '👀', thinking: '🤔', 'thinking face': '🤔', cake: '🎂', gift: '🎁', present: '🎁',
};
const EMOJI_NAMES = Object.keys(SPOKEN_EMOJI).sort((a, b) => b.length - a.length).map(k => k.replace(/ /g, '\\s+'));
const EMOJI_SAID = new RegExp(`\\b(${EMOJI_NAMES.join('|')})\\s+emoji\\b|\\bemoji\\s+(?:of\\s+(?:a\\s+|an\\s+)?)?(${EMOJI_NAMES.join('|')})\\b`, 'gi');

// ---------- spoken punctuation ----------
// "period" is punctuation unless it names a class period, a time span or a
// menstrual period ("third period", "free period", "my period", "trial period").
const NOT_PERIOD = /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|1st|2nd|3rd|4th|5th|6th|7th|8th|\d+|free|study|lunch|class|trial|grace|waiting|time|my|her|the|a|this|that|next|last|each|every|per|sample|cooling|notice|reporting|billing|holiday|exam|testing|probation|rest|recovery)\s*$/i;
const MARKS = [
  [/\s*\b(?:new|next)\s+(?:line|paragraph)\b[\s,.]*/gi, '\n'],
  [/\s*\b(?:full\s+stop|end\s+of\s+sentence)\b/gi, '.'],
  [/\s*\b(?:question\s+mark)\b/gi, '?'],
  [/\s*\b(?:exclamation\s+(?:mark|point))\b/gi, '!'],
  [/\s*\bsemi-?\s?colon\b/gi, ';'],
  [/\s*\bellipsis\b/gi, '…'],
  [/\s*\b(?:open\s+(?:bracket|parenthesis|paren))\s*/gi, ' ('],
  [/\s*\b(?:close\s+(?:bracket|parenthesis|paren))\b/gi, ')'],
  [/\s*\bopen\s+quote\b\s*/gi, ' “'],
  [/\s*\b(?:close\s+quote|end\s+quote|unquote)\b/gi, '”'],
];

export function spokenMarks(raw) {
  let s = String(raw ?? '');
  if (!s) return s;
  s = s.replace(EMOJI_SAID, (_, a, b) => SPOKEN_EMOJI[(a || b).toLowerCase().replace(/\s+/g, ' ')] || _);
  for (const [re, mark] of MARKS) s = s.replace(re, mark);
  // "comma" and "colon": the word on its own, between other words or at the end.
  s = s.replace(/(\S)\s+comma\b[,.]?/gi, '$1,').replace(/^comma\b\s*/i, '');
  s = s.replace(/(\S)\s+colon\b[,.:]?(?!\s+(?:cancer|surgery|health|cleanse))/gi, '$1:');
  // "period" only when it is not a class period or a span of time.
  s = s.replace(/(\S+)(\s+)period\b[,.]?/gi, (m, before, sp, at, all) => (NOT_PERIOD.test(all.slice(0, at) + before) ? m : `${before}.`));
  // Tidy the spaces around marks.
  return s.replace(/[ \t]+([,.;:!?…)”])/g, '$1').replace(/([,;:!?])(?=[^\s\d”)\n])/g, '$1 ').replace(/[ \t]{2,}/g, ' ').replace(/ *\n */g, '\n');
}

// ---------- what is not a task ----------
// Whole lines that are talk, not things to do: greetings, fillers, thanks,
// sign-offs and checking the microphone.
const CHATTER = [
  'ok', 'okay', 'k', 'alright', 'all right', 'right', 'yes', 'yeah', 'yep', 'yup', 'no', 'nope', 'nah', 'sure', 'cool', 'great', 'nice', 'good', 'fine', 'perfect', 'awesome', 'got it',
  'um', 'uh', 'umm', 'uhh', 'hmm', 'mm', 'mhm', 'uh huh', 'ah', 'oh', 'eh', 'er', 'so', 'well', 'like', 'and', 'but', 'also', 'then', 'anyway', 'anyways', 'whatever', 'basically',
  'hi', 'hello', 'hey', 'hey budgie', 'hi budgie', 'hello budgie', 'hey taskie', 'hi taskie', 'hello taskie', 'good morning', 'good afternoon', 'good evening', 'good night', 'bye', 'goodbye', 'bye bye', 'see you', 'see ya',
  'thanks', 'thank you', 'thank you so much', 'thanks a lot', 'cheers', 'please', 'sorry', 'excuse me', 'oops', 'my bad',
  'test', 'testing', 'testing testing', 'test test', 'one two three', 'testing one two three', 'mic check', 'can you hear me', 'is this working', 'is it working', 'is this on', 'hello hello',
  "that's it", 'that is it', "that's all", 'that is all', "that's everything", 'that is everything', 'done', "i'm done", 'i am done', 'all done', 'nothing else', "that's about it", 'the end', 'end', 'stop', 'stop recording', 'over',
  'let me think', 'let me see', 'let me think about it', 'what else', 'what was i saying', 'where was i', 'i forgot', 'i don\'t know', 'i dont know', 'never mind', 'nevermind', 'forget it', 'scratch that', 'wait', 'hold on', 'one sec', 'one second', 'just a second', 'hang on',
  'you', 'thank you for watching', 'thanks for watching', 'subscribe', 'music', 'applause', 'laughter', 'silence', 'inaudible', 'blank audio',
];
const CHATTER_SET = new Set(CHATTER);
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'so', 'then', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'it', 'its', "it's", 'is', 'was', 'be', 'that', 'this', 'there', 'just', 'like', 'um', 'uh', 'yeah', 'okay', 'ok', 'well', 'i', "i'm", 'me', 'my', 'we', 'you', 'they', 'he', 'she', 'also', 'too', 'very', 'really', 'kind', 'sort', 'thing', 'things', 'stuff', 'something', 'anything', 'what', 'um', 'hmm', 'oh', 'ah', 'right', 'gonna', 'wanna', 'gotta', 'do', 'did', 'does', 'have', 'has', 'had', 'are', 'were', 'been', 'if', 'as', 'by', 'up', 'out', 'about', 'from', 'into', 'now']);
const WHEN = new Set(['today', 'tomorrow', 'tonight', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'morning', 'afternoon', 'evening', 'night', 'next', 'week', 'month', 'year', 'weekend', 'noon', 'midnight', 'due', 'every', 'day', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
const squash = s => String(s ?? '').toLowerCase().replace(/[’`]/g, "'").replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/[^\p{L}\p{N}'\s]+/gu, ' ').replace(/\s+/g, ' ').trim();

export function isNotTask(line) {
  const raw = String(line ?? '').trim();
  if (!raw) return true;
  if (!LETTER.test(raw) && !/\d/.test(raw)) return true; // only marks or emojis
  const s = squash(raw);
  if (!s) return true;
  if (CHATTER_SET.has(s)) return true;
  // The same filler said several times ("okay okay", "um um so").
  const words = s.split(' ');
  if (words.every(w => CHATTER_SET.has(w))) return true;
  // [Music], (silence) and other captions a speech model writes for sounds.
  if (/^[[(].*[\])]$/.test(raw)) return true;
  // Nothing left but little words ("and then the", "so it was like"), or only a when ("on Friday").
  const content = words.filter(w => !STOP.has(w));
  if (!content.length) return true;
  if (content.every(w => WHEN.has(w) || /^\d+(?:st|nd|rd|th|am|pm)?$/.test(w))) return true;
  return false;
}

export const hasEmoji = s => EMOJI.test(String(s ?? ''));

// ---------- hearing well: no repeats, your words spelled your way ----------
const norm = s => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}'\s]+/gu, ' ').replace(/\s+/g, ' ').trim();

// Speech models sometimes loop ("I need to I need to finish"); keep one of each run.
export function unloop(text) {
  let s = String(text ?? '');
  for (let n = 6; n >= 1; n--) {
    const re = new RegExp(`\\b((?:[\\p{L}\\p{N}']+[\\s,]+){${n - 1}}[\\p{L}\\p{N}']+)(?:[\\s,.]+\\1\\b)+`, 'giu');
    s = s.replace(re, '$1');
  }
  return s;
}

// New words heard, minus anything already at the end of what was written:
// pieces of speech overlap, and a repeat should never be written twice.
export function newWords(before, heard) {
  const next = unloop(heard).trim();
  if (!next) return '';
  const b = norm(before).split(' ').filter(Boolean);
  const nRaw = next.split(/\s+/);
  const n = nRaw.map(w => norm(w));
  const tail = norm(before).slice(-Math.max(200, norm(next).length + 20));
  if (norm(next).length > 8 && tail.includes(norm(next))) return ''; // said again: already there
  for (let k = Math.min(14, b.length, n.length); k >= 2; k--) {
    if (b.slice(-k).join(' ') === n.slice(0, k).join(' ')) return nRaw.slice(k).join(' ');
  }
  return next;
}

// Corrections you made to what Taskie heard become rules for next time
// (that is how it learns your accent and your names): [{ heard, word }].
export function applyVocab(text, vocab = []) {
  let s = String(text ?? '');
  for (const v of vocab) {
    if (!v?.heard || !v?.word) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${v.heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
    s = s.replace(re, v.word);
  }
  return s;
}

// What changed between what was heard and what you kept: short replaced
// phrases (1 to 3 words), the corrections worth remembering.
export function learnCorrections(heard, kept) {
  const a = String(heard ?? '').split(/\s+/).filter(Boolean), b = String(kept ?? '').split(/\s+/).filter(Boolean);
  if (!a.length || !b.length || a.length > 600 || b.length > 600) return [];
  const clean = w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const A = a.map(w => norm(w)), B = b.map(w => norm(w));
  // Longest common subsequence, walked from the start: equal words line up,
  // and each gap between them is one replacement (what was heard, what you kept).
  const L = Array.from({ length: A.length + 1 }, () => new Int16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0, hi = [], wi = [];
  const flush = () => {
    const h = hi.map(clean).join(' ').trim(), w = wi.map(clean).join(' ').trim();
    if (h && w && hi.length <= 3 && wi.length <= 3 && norm(h) !== norm(w) && /\p{L}/u.test(w)) out.push({ heard: h, word: w });
    hi = []; wi = [];
  };
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { flush(); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) hi.push(a[i++]);
    else wi.push(b[j++]);
  }
  while (i < A.length) hi.push(a[i++]);
  while (j < B.length) wi.push(b[j++]);
  flush();
  return out.slice(0, 20);
}

// Titles the way a syllabus names them: "paper of English" is "English paper".
export function tidyTitle(raw) {
  const KIND = '(?:paper|essay|report|quiz|exam|test|midterm|final|homework|assignment|project|presentation|reading|lab|problem set|worksheet)';
  return String(raw ?? '').trim()
    // "Work on a paper of English": the assignment itself is the title.
    .replace(new RegExp(`^(?:work on|do|finish|start|write|submit|complete)\\s+(?=(?:a|an|the|my)?\\s*(?:[\\p{L}-]+\\s+){0,3}${KIND}\\b)`, 'iu'), '')
    .replace(/^(?:a|an|the|my)\s+/i, '')
    .replace(/^(paper|essay|report|quiz|exam|test|midterm|final|homework|assignment|project|presentation|reading|lab)\s+(?:of|for|in|on)\s+([\p{L}][\p{L}\d&-]*(?:\s+[\p{L}\d&-]+)?)$/iu, (_, kind, subject) => `${subject} ${kind}`);
}
