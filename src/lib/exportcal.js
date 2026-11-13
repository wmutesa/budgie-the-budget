// Export the calendar as a picture (PNG, JPG or JPEG) or a one-page PDF.
// The whole calendar is drawn to a canvas, not only the part on screen, with a
// title band on top. Phones are stricter than laptops: iPhone Safari refuses
// canvases bigger than 4096 px a side or 16 million pixels, so the sharpness
// is lowered to fit. The file is saved as a blob; if the browser blocks the
// automatic save, a Save button in the notice saves it with a tap.
import { toast } from './toast';

const MAX_SIDE = 4096;
const MAX_AREA = 16 * 1024 * 1024;
const BAND = 96; // height of the title band, in CSS pixels

// The sharpest scale (up to 2x) that the device can still draw.
function scaleFor(w, h) {
  const s = Math.min(2, MAX_SIDE / w, MAX_SIDE / (h + BAND), Math.sqrt(MAX_AREA / (w * (h + BAND))));
  return Math.max(0.5, Math.floor(s * 100) / 100);
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('This picture is too large for this device. Try a day or a week.'))), type, 0.92));
}

// Save a file: automatically where the browser allows it, and always offer a tap-to-save.
function deliver(blob, name) {
  const url = URL.createObjectURL(blob);
  const save = () => { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  try { save(); } catch { /* the notice below still saves it */ }
  toast(`${name} is ready.`, { kind: 'success', title: 'Export', id: 'export-file', action: { label: 'Save', run: save }, ms: 20000 });
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
}

export async function exportCalendar(node, { format = 'png', title = 'Calendar', file = 'taskie-calendar' } = {}) {
  if (!node) throw new Error('Nothing to export.');
  const { toCanvas } = await import('html-to-image');
  const w = node.scrollWidth, h = node.scrollHeight;
  const ratio = scaleFor(w, h);
  const shot = await toCanvas(node, {
    pixelRatio: ratio, backgroundColor: '#ffffff', skipFonts: true, cacheBust: true, width: w, height: h,
    style: { overflow: 'visible', maxHeight: 'none', height: `${h}px`, width: `${w}px` },
    // Hover buttons and popovers are not part of the picture.
    filter: n => !(n instanceof Element) || !n.matches?.('.sch-row-acts, .pk-pop, .cal-pop, [data-export="skip"]'),
  });
  const band = Math.round(BAND * ratio);
  const out = document.createElement('canvas');
  out.width = shot.width; out.height = shot.height + band;
  const g = out.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, out.width, out.height);
  const px = n => Math.round(n * ratio);
  g.fillStyle = '#09090b'; g.font = `800 ${px(36)}px Inter, system-ui, sans-serif`; g.fillText('TASKIE', px(36), px(58));
  g.font = `600 ${px(30)}px Inter, system-ui, sans-serif`; g.fillText(title, px(220), px(58));
  g.fillStyle = '#71717a'; g.font = `400 ${px(22)}px Inter, system-ui, sans-serif`;
  const stamp = `Exported ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  g.fillText(stamp, out.width - px(36) - g.measureText(stamp).width, px(58));
  g.fillStyle = '#e4e4e7'; g.fillRect(0, band - px(2) / 2, out.width, Math.max(1, px(2)));
  g.drawImage(shot, 0, band);

  if (format === 'pdf') {
    const { jsPDF } = await import('jspdf');
    // One page the shape of the calendar, A4 wide, so nothing is cut or squeezed.
    const pageW = 842, pageH = Math.round(pageW * (out.height / out.width));
    const pdf = new jsPDF({ orientation: pageW > pageH ? 'landscape' : 'portrait', unit: 'pt', format: [pageW, pageH], compress: true });
    const jpeg = await canvasToBlob(out, 'image/jpeg');
    const dataUrl = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(jpeg); });
    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, pageH);
    pdf.setProperties({ title: `Taskie · ${title}`, creator: 'Taskie' });
    deliver(pdf.output('blob'), `${file}.pdf`);
    return;
  }
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : format === 'jpg' ? 'jpg' : 'jpeg';
  deliver(await canvasToBlob(out, type), `${file}.${ext}`);
}
