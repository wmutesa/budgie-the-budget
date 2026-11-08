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
  'hi', 'hello', 'hey', 'hey budgie', 'hi budgie', 'hello budgie', 'good morning', 'good afternoon', 'good evening', 'good night', 'bye', 'goodbye', 'bye bye', 'see you', 'see ya',
  'thanks', 'thank you', 'thank you so much', 'thanks a lot', 'cheers', 'please', 'sorry', 'excuse me', 'oops', 'my bad',
  'test', 'testing', 'testing testing', 'test test', 'one two three', 'testing one two three', 'mic check', 'can you hear me', 'is this working', 'is it working', 'is this on', 'hello hello',
  "that's it", 'that is it', "that's all", 'that is all', "that's everything", 'that is everything', 'done', "i'm done", 'i am done', 'all done', 'nothing else', "that's about it", 'the end', 'end', 'stop', 'stop recording', 'over',
  'let me think', 'let me see', 'let me think about it', 'what else', 'what was i saying', 'where was i', 'i forgot', 'i don\'t know', 'i dont know', 'never mind', 'nevermind', 'forget it', 'scratch that', 'wait', 'hold on', 'one sec', 'one second', 'just a second', 'hang on',
  'you', 'thank you for watching', 'thanks for watching', 'subscribe', 'music', 'applause', 'laughter', 'silence', 'inaudible', 'blank audio',
];
const CHATTER_SET = new Set(CHATTER);
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
  return false;
}

export const hasEmoji = s => EMOJI.test(String(s ?? ''));
