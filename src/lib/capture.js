// From any file or note to reviewed-ready drafts, then enriched from the web.
import { receiptToDraft, rowsToDrafts, parseCSV, statementToDrafts, quickToDraft } from './parse';
import { aiReadReceipt, ai } from './ai';
import { searchBrands } from './brands';
import { guessCategory, CATEGORIES } from './categorize';

const brandCache = new Map();

export async function brandFor(name) {
  const key = name.trim().toLowerCase();
  if (!key || key === 'unknown' || key === 'unknown merchant') return null;
  if (brandCache.has(key)) return brandCache.get(key);
  let hit = null;
  try { hit = (await searchBrands(name))[0] || null; } catch { hit = null; }
  brandCache.set(key, hit);
  return hit;
}

// Attach logo, website and a better category when the web knows the merchant.
export async function enrich(draft) {
  const hit = await brandFor(draft.merchant);
  if (!hit) return draft;
  const fromWeb = guessCategory(`${hit.name} ${hit.description}`, draft.amount);
  return {
    ...draft,
    merchant: hit.name,
    domain: hit.domain,
    logo: hit.logo,
    description: hit.description,
    category: draft.category === 'Other' ? fromWeb : draft.category,
  };
}

async function ocrImage(file, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: m => m.status === 'recognizing text' && onProgress?.(Math.round(m.progress * 100)) });
  try { return (await worker.recognize(file)).data.text; } finally { await worker.terminate(); }
}

async function pdfText(file) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    // Group text items into lines by their vertical position.
    const lines = new Map();
    content.items.forEach(it => { const y = Math.round(it.transform[5]); lines.set(y, `${lines.get(y) || ''} ${it.str}`); });
    text += [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, l]) => l.trim()).join('\n') + '\n';
  }
  return text;
}

async function fromReceiptText(text, base, source) {
  const ruled = receiptToDraft(text, { base, source });
  const read = await aiReadReceipt(text);
  if (!read) return ruled;
  return {
    ...ruled,
    merchant: read.merchant || ruled.merchant,
    amount: -Math.abs(read.total),
    currency: read.currency || ruled.currency,
    date: read.date || ruled.date,
    category: CATEGORIES.includes(read.category) ? read.category : ruled.category,
    confidence: 0.85,
    readBy: ai.model,
  };
}

// Returns an array of drafts for any supported file.
export async function captureFile(file, { base = 'USD', onProgress } = {}) {
  const name = file.name.toLowerCase();
  if (/\.(csv|txt)$/.test(name) || file.type === 'text/csv') {
    return rowsToDrafts(parseCSV(await file.text()), { base, source: 'csv' });
  }
  if (/\.(xlsx|xls)$/.test(name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const result = await readSheet(file);
    const rows = Array.isArray(result) ? result : result.data || [];
    return rowsToDrafts(rows, { base, source: 'excel' });
  }
  if (/\.pdf$/.test(name) || file.type === 'application/pdf') {
    const text = await pdfText(file);
    const rows = statementToDrafts(text, { base });
    return rows.length ? rows : [await fromReceiptText(text, base, 'pdf')];
  }
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/.test(name)) {
    const text = await ocrImage(file, onProgress);
    return [await fromReceiptText(text, base, 'receipt')];
  }
  throw new Error(`Budgie can't read ${file.name} yet. Use a photo, PDF, CSV or Excel file.`);
}

export function captureNote(text, base = 'USD') {
  const d = quickToDraft(text, { base });
  return d ? [d] : [];
}
