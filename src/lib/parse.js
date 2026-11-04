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

// "Uber 23.40 yesterday" or "Salary +2350 Nov 1" -> one draft.
export function quickToDraft(text, { base = 'USD' } = {}) {
  const s = String(text).trim();
  if (!s) return null;
  const moneyMatch = s.match(/([+-])?\s*[$€£]?\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  if (!moneyMatch) return null;
  const value = parseMoney(moneyMatch[2]);
  let rest = s.replace(moneyMatch[0], ' ');
  let date = null;
  for (const word of ['today', 'yesterday']) if (new RegExp(`\\b${word}\\b`, 'i').test(rest)) { date = parseDate(word); rest = rest.replace(new RegExp(`\\b${word}\\b`, 'i'), ' '); }
  const dm = rest.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|[A-Za-z]{3}\s+\d{1,2}(?:,?\s+\d{4})?)/);
  if (!date && dm) { const withYear = /\d{4}/.test(dm[0]) ? dm[0] : `${dm[0]}, ${new Date().getFullYear()}`; date = parseDate(withYear); if (date) rest = rest.replace(dm[0], ' '); }
  const merchant = rest.replace(/\s+/g, ' ').trim() || 'Unknown';
  const income = moneyMatch[1] === '+' || /salary|payroll|refund|deposit/i.test(merchant);
  const amount = income ? Math.abs(value) : -Math.abs(value);
  return { merchant, amount, currency: detectCurrency(s, base), date: date || todayISO(), source: 'quick', category: guessCategory(merchant, amount), confidence: 0.8 };
}
