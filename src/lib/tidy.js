// Tidy dictated text without AI: drop filler words, put each thing on its own
// line, and write times the way the planner reads them. The AI version
// (aiRewriteDictation) goes further when the on-device model is ready.
import { splitSpoken } from './router';

const TWO_WORD = ['computer science', 'comp sci', 'political science', 'poli sci', 'art history', 'organic chemistry', 'creative writing', 'data science', 'public health', 'environmental science', 'world history', 'us history', 'earth science', 'social studies', 'computer engineering', 'machine learning', 'side project'];

const FILLER = /\b(?:um+|uh+|erm+|hmm+|you know|i mean|kind of|sort of|like,|so yeah|okay so|ok so|basically|actually)\b[,]?\s*/gi;

// Lines often start with a filler word too.
const LEAD = /^(?:so|well|okay|ok|right|and|also)\b[,]?\s+/i;

export function tidyDictation(text) {
  // Times first, so "5 p.m." is not read as the end of a sentence.
  const norm = String(text)
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?(?=\W|$)/gi, (_, h, m, ap) => `${h}${m ? `:${m}` : ''}${ap.toLowerCase()}m`)
    // "hashtag computer science" is one category; one word otherwise.
    .replace(new RegExp(`\\bhashtag\\s+(${TWO_WORD.join('|')})\\b`, 'gi'), (_, w) => `#${w.replace(/\s+/g, '-')}`)
    .replace(/\bhashtag\s+(\w+)/gi, '#$1')
    .replace(FILLER, '');
  const lines = norm.split('\n').flatMap(l => (/[.!?]\s|\b(?:and then|then|also|after that)\b/i.test(l) ? splitSpoken(l) : [l]));
  return lines
    .map(l => {
      let x = l.replace(/\s{2,}/g, ' ').replace(/^[\s,.;]+|[\s,;.]+$/g, '').trim();
      while (LEAD.test(x)) x = x.replace(LEAD, '');
      return x;
    })
    .filter(l => l.length > 1)
    .map(l => l[0].toUpperCase() + l.slice(1))
    .join('\n');
}
