// Turn receipts, statements and quick notes into draft transactions.
// Each draft: { merchant, amount (negative = spending), currency, date, category, source, confidence }.
import { guessCategory } from './categorize';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => iso(new Date());

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseDate(text) {
  if (!text) return null;
  const s = String(text).trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(new Date(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let [a, b, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    // Month first unless the first number cannot be a month.
    const [mon, day] = a > 12 ? [b, a] : [a, b];
    return iso(new Date(y, mon - 1, day));
  }
  m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS.includes(m[1].toLowerCase())) return iso(new Date(+m[3], MONTHS.indexOf(m[1].toLowerCase()), +m[2]));
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(new Date(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1]));
  if (/^today$/i.test(s)) return todayISO();
  if (/^yesterday$/i.test(s)) { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); }
  return null;
}

export function parseMoney(text) {
  if (text === null || text === undefined || text === '') return null;
  if (typeof text === 'number') return text;
  let s = String(text).trim();
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s) || /\bdr\b/i.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  // 1.234,56 -> 1234.56 ; 1,234.56 -> 1234.56
  if (/,\d{2}$/.test(s) && s.indexOf('.') < s.lastIndexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function detectCurrency(text, fallback = 'USD') {
  if (/€|\beur\b/i.test(text)) return 'EUR';
  if (/£|\bgbp\b/i.test(text)) return 'GBP';
  if (/ksh|\bkes\b/i.test(text)) return 'KES';
  if (/₦|\bngn\b/i.test(text)) return 'NGN';
  if (/\brwf\b|\bfrw\b|\brf\b|rwandan? francs?/i.test(text)) return 'RWF';
  if (/฿|\bthb\b|\bbaht\b/i.test(text)) return 'THB';
  if (/\$|\busd\b/i.test(text)) return 'USD';
  return fallback;
}

// Receipt text (from OCR or a PDF) -> one draft.
export function receiptToDraft(text, { base = 'USD', source = 'receipt' } = {}) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const merchant = (lines.find(l => /[A-Za-z]{3,}/.test(l) && l.length <= 40 && !/receipt|invoice|tel|phone|www\.|http/i.test(l)) || 'Unknown merchant')
    .replace(/[^\w&'’ .-]/g, '').trim();
  let total = null;
  for (const l of lines) {
    if (/(grand\s*)?total|amount\s*due|balance\s*due|to pay/i.test(l) && !/sub\s*-?total/i.test(l)) {
      const nums = l.match(/-?[\d.,]+\d/g);
      if (nums) total = parseMoney(nums[nums.length - 1]);
    }
  }
  if (total === null) {
    const all = (String(text).match(/\d+[.,]\d{2}\b/g) || []).map(parseMoney).filter(n => n !== null);
    total = all.length ? Math.max(...all) : null;
  }
  const dateLine = lines.find(l => parseDate(l));
  const draft = {
    merchant,
    amount: total !== null ? -Math.abs(total) : null,
    currency: detectCurrency(text, base),
    date: (dateLine && parseDate(dateLine)) || todayISO(),
    source,
    confidence: total !== null && merchant !== 'Unknown merchant' ? 0.7 : 0.4,
  };
  draft.category = guessCategory(merchant, draft.amount || -1);
  return draft;
}

// CSV text -> rows (handles quotes and commas or semicolons).
export function parseCSV(text) {
  const firstLine = String(text).split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

// Table rows (from CSV or Excel) -> drafts, by finding the useful columns.
export function rowsToDrafts(rows, { base = 'USD', source = 'csv' } = {}) {
  if (!rows.length) return [];
  const header = rows[0].map(h => String(h ?? '').toLowerCase().trim());
  const find = re => header.findIndex(h => re.test(h));
  let iDate = find(/date|posted|time/);
  let iDesc = find(/desc|merchant|payee|name|narration|details|memo|particular/);
  let iAmt = find(/^amount|amount$|value|sum|total/);
  const iDebit = find(/debit|withdraw|paid out|money out/);
  const iCredit = find(/credit|deposit|paid in|money in/);
  const iCur = find(/currency|ccy/);
  const iCat = find(/category/);
  const hasHeader = iDate >= 0 || iDesc >= 0 || iAmt >= 0 || iDebit >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  if (!hasHeader) { iDate = 0; iDesc = 1; iAmt = 2; }

  return body.map(r => {
    let amount = iAmt >= 0 ? parseMoney(r[iAmt]) : null;
    if (amount === null && (iDebit >= 0 || iCredit >= 0)) {
      const d = iDebit >= 0 ? parseMoney(r[iDebit]) : null;
      const c = iCredit >= 0 ? parseMoney(r[iCredit]) : null;
      amount = d ? -Math.abs(d) : c ? Math.abs(c) : null;
    }
    const merchant = String(r[iDesc] ?? '').trim() || 'Unknown';
    const raw = r[iDate];
    const date = raw instanceof Date ? iso(raw) : parseDate(String(raw ?? '')) || todayISO();
    const currency = iCur >= 0 && /^[A-Za-z]{3}$/.test(String(r[iCur]).trim()) ? String(r[iCur]).trim().toUpperCase() : base;
    const known = iCat >= 0 ? String(r[iCat] ?? '').trim() : '';
    return {
      merchant, amount, currency, date, source,
      category: known || guessCategory(merchant, amount ?? -1),
      confidence: amount !== null ? 0.9 : 0.3,
    };
  }).filter(d => d.amount !== null && d.amount !== 0);
}

// Bank statement text from a PDF: lines that start with a date and end with an amount.
export function statementToDrafts(text, opts = {}) {
  const re = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s+(.+?)\s+(\(?-?[$€£]?[\d,]+\.\d{2}\)?)\s*$/;
  const rows = String(text).split(/\r?\n/).map(l => l.trim().match(re)).filter(Boolean).map(m => [m[1], m[2], m[3]]);
  return rows.length >= 2 ? rowsToDrafts([['date', 'description', 'amount'], ...rows], { ...opts, source: 'pdf' }) : [];
}

// Relative dates in plain language. Returns { date, phrase } or null.
// "a week ago", "3 days ago", "in a month", "last friday", "next week", "on the 3rd", "the day before yesterday"...
const NUMS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3 };
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const shift = (d, unit, n) => {
  const x = new Date(d);
  if (unit === 'day') x.setDate(x.getDate() + n);
  if (unit === 'week') x.setDate(x.getDate() + 7 * n);
  if (unit === 'month') x.setMonth(x.getMonth() + n);
  if (unit === 'year') x.setFullYear(x.getFullYear() + n);
  return x;
};

export function parseRelative(text, now = new Date()) {
  const t = String(text).toLowerCase();
  let m;
  if ((m = t.match(/\b(the\s+)?day\s+before\s+yesterday\b/))) return { date: iso(shift(now, 'day', -2)), phrase: m[0] };
  if ((m = t.match(/\b(the\s+)?day\s+after\s+tomorrow\b/))) return { date: iso(shift(now, 'day', 2)), phrase: m[0] };
  if ((m = t.match(/\byesterday(\s+(morning|afternoon|evening|night))?\b|\blast\s+night\b/))) return { date: iso(shift(now, 'day', -1)), phrase: m[0] };
  if ((m = t.match(/\btomorrow(\s+(morning|afternoon|evening|night))?\b/))) return { date: iso(shift(now, 'day', 1)), phrase: m[0] };
  if ((m = t.match(/\b(today|tonight|this\s+(morning|afternoon|evening)|just\s+now|right\s+now)\b/))) return { date: iso(now), phrase: m[0] };
  const num = '(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple(?:\\s+of)?|few|\\d+)';
  if ((m = t.match(new RegExp(`\\b${num}\\s+(day|week|month|year)s?\\s+ago\\b`)))) {
    const n = NUMS[m[1].replace(/\s+of$/, '')] ?? Number(m[1]);
    return { date: iso(shift(now, m[2], -n)), phrase: m[0] };
  }
  if ((m = t.match(new RegExp(`\\bin\\s+${num}\\s+(day|week|month|year)s?\\b`)))) {
    const n = NUMS[m[1].replace(/\s+of$/, '')] ?? Number(m[1]);
    return { date: iso(shift(now, m[2], n)), phrase: m[0] };
  }
  if ((m = t.match(/\b(last|next|this)\s+(week|month|year)\b/))) {
    const n = m[1] === 'last' ? -1 : m[1] === 'next' ? 1 : 0;
    return { date: iso(shift(now, m[2], n)), phrase: m[0] };
  }
  if ((m = t.match(/\b(?:(last|next|this|on)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    const target = DAYS.indexOf(m[2]);
    const today = now.getDay();
    let diff;
    if (m[1] === 'next') diff = ((target - today + 7) % 7) || 7;
    else if (m[1] === 'last') diff = -(((today - target + 7) % 7) || 7);
    else diff = -((today - target + 7) % 7); // most recent, including today
    return { date: iso(shift(now, 'day', diff)), phrase: m[0] };
  }
  if ((m = t.match(/\b(?:on\s+)?the\s+(\d{1,2})(st|nd|rd|th)\b/))) {
    const d = new Date(now.getFullYear(), now.getMonth(), Number(m[1]));
    if (d > now) d.setMonth(d.getMonth() - 1);
    return { date: iso(d), phrase: m[0] };
  }
  return null;
}

const titleCase = s => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s.charAt(0).toUpperCase() + s.slice(1));
const FILLER = /\b(i|we|just|spent|spend|paid|pay|paying|bought|buy|got|get|purchased|charged|ordered|for|on|at|to|from|my|the|some|of|with|via|using|by|card|cash|about|around|roughly|like|approx|dollars?|bucks|usd|eur|euros?|gbp|pounds?|ksh|shillings?|naira)\b/gi;

// "Uber 23.40 a week ago", "spent 12.50 on lunch at Chipotle last friday",
// "got paid 2350 salary on the 1st", "Netflix 15.49 in a month" -> one draft.
export function quickToDraft(text, { base = 'USD', match = null } = {}) {
  const s = String(text).trim();
  if (!s) return null;
  const moneyMatch = s.match(/([+-])?\s*[$€£₦]?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k\b)?/i);
  if (!moneyMatch) return null;
  const value = parseMoney(moneyMatch[2]) * (moneyMatch[3] ? 1000 : 1);
  let rest = s.replace(moneyMatch[0], ' ');

  let date = null;
  const rel = parseRelative(rest);
  if (rel) { date = rel.date; rest = rest.replace(new RegExp(rel.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' '); }
  if (!date) {
    const dm = rest.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/);
    if (dm) {
      const clean = dm[0].replace(/(\d)(st|nd|rd|th)/, '$1');
      const withYear = /\d{4}/.test(clean) ? clean : `${clean}, ${new Date().getFullYear()}`;
      const parsed = parseDate(withYear);
      if (parsed) { date = parsed; rest = rest.replace(dm[0], ' '); }
    }
  }

  const income = moneyMatch[1] === '+' || /\b(salary|payroll|paycheck|refund|deposit|received|got paid|earned|income|wage|bonus)\b/i.test(s);

  // Prefer the place after "at" / "from" as the merchant, keep the item as a note: "lunch at Chipotle".
  let note = '';
  let merchant = rest;
  const at = rest.match(/\b(?:at|from)\s+(.+)$/i);
  if (at) { note = rest.slice(0, at.index).replace(FILLER, ' ').replace(/\s+/g, ' ').trim(); merchant = at[1]; }
  merchant = merchant.replace(FILLER, ' ').replace(/[^\w&'’+ .-]/g, ' ').replace(/\s+/g, ' ').trim();
  const known = match ? match(s) : null;
  if (known) { if (!note && merchant && merchant.toLowerCase() !== known.name.toLowerCase()) note = merchant; merchant = known.name; }
  merchant = merchant ? titleCase(merchant) : income ? 'Income' : 'Unknown';

  const amount = income ? Math.abs(value) : -Math.abs(value);
  return {
    merchant, amount, note: note ? titleCase(note) : '',
    currency: detectCurrency(s, base), date: date || todayISO(), source: 'quick',
    category: known ? (income ? 'Income' : known.category) : guessCategory(`${merchant} ${note}`, amount),
    confidence: 0.8,
  };
}
