// Export the calendar as a picture (PNG or JPG) or a PDF. The calendar on screen
// is drawn to a canvas at twice its size, the whole of it (not only what is
// scrolled into view), with a title band on top. The libraries load only when
// someone exports, so the app itself stays small.
export async function exportCalendar(node, { format = 'png', title = 'Calendar', file = 'taskie-calendar' } = {}) {
  if (!node) throw new Error('Nothing to export.');
  const { toCanvas } = await import('html-to-image');
  const w = node.scrollWidth, h = node.scrollHeight;
  const shot = await toCanvas(node, {
    pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true, cacheBust: true, width: w, height: h,
    style: { overflow: 'visible', maxHeight: 'none', height: `${h}px`, width: `${w}px` },
    // Hover buttons and popovers are not part of the picture.
    filter: n => !(n instanceof Element) || !n.matches?.('.sch-row-acts, .pk-pop, .cal-pop, [data-export="skip"]'),
  });
  // A title band: Taskie, what is shown, and when it was exported.
  const band = 96;
  const out = document.createElement('canvas');
  out.width = shot.width; out.height = shot.height + band;
  const g = out.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = '#09090b'; g.font = '800 36px Inter, system-ui, sans-serif'; g.fillText('TASKIE', 36, 58);
  g.font = '600 30px Inter, system-ui, sans-serif'; g.fillText(title, 220, 58);
  g.fillStyle = '#71717a'; g.font = '400 22px Inter, system-ui, sans-serif';
  const stamp = `Exported ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  g.fillText(stamp, out.width - 36 - g.measureText(stamp).width, 58);
  g.fillStyle = '#e4e4e7'; g.fillRect(0, band - 2, out.width, 2);
  g.drawImage(shot, 0, band);

  if (format === 'pdf') {
    const { jsPDF } = await import('jspdf');
    // One page the shape of the calendar, A4 wide, so nothing is cut or squeezed.
    const pageW = 842, pageH = Math.round(pageW * (out.height / out.width));
    const pdf = new jsPDF({ orientation: pageW > pageH ? 'landscape' : 'portrait', unit: 'pt', format: [pageW, pageH], compress: true });
    pdf.addImage(out.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, pageH);
    pdf.setProperties({ title: `Taskie · ${title}`, creator: 'Taskie' });
    pdf.save(`${file}.pdf`);
    return;
  }
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const url = out.toDataURL(type, 0.92);
  const a = document.createElement('a');
  a.href = url; a.download = `${file}.${format === 'png' ? 'png' : format}`;
  document.body.appendChild(a); a.click(); a.remove();
}
