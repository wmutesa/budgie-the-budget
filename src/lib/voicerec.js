// Records the microphone while you speak, so the recording itself can go to
// Gemini (with your own key) when you stop: it hears names, numbers and
// accents better than a browser's live speech recognition. The audio is
// turned into 16 kHz mono WAV, a format Gemini reads, small enough to send
// (about 2 MB a minute). Nothing is recorded without a Gemini key, and the
// recording is not kept.

// Safari cannot record and show live text from the microphone at the same time.
export const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(navigator.userAgent);
export const canRecord = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
export const MAX_SECONDS = 5 * 60; // Gemini takes about 20 MB in one request: five minutes of WAV fits

let rec = null;
let stream = null;
let chunks = [];
let started = 0;
let cutoff = null;

export async function startRecording() {
  if (!canRecord || rec) return false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    rec.start(1000);
    started = Date.now();
    cutoff = setTimeout(() => { try { rec?.stop(); } catch { /* already stopped */ } }, MAX_SECONDS * 1000);
    return true;
  } catch { cleanup(); return false; }
}

// Stop and hand back the recording (a Blob), or null if there is none.
export function stopRecording() {
  return new Promise(resolve => {
    if (!rec) return resolve(null);
    const r = rec;
    const done = () => { const blob = chunks.length ? new Blob(chunks, { type: r.mimeType || 'audio/webm' }) : null; cleanup(); resolve(blob && Date.now() - started > 600 ? blob : null); };
    let over = false;
    const once = () => { if (!over) { over = true; done(); } };
    if (r.state === 'inactive') return once();
    r.onstop = once;
    // Some browsers never say they stopped: give up waiting after two seconds.
    setTimeout(once, 2000);
    try { r.stop(); } catch { once(); }
  });
}
export function cancelRecording() { try { rec?.stop(); } catch { /* fine */ } cleanup(); }
function cleanup() {
  clearTimeout(cutoff);
  stream?.getTracks().forEach(t => t.stop());
  rec = null; stream = null; chunks = [];
}

// The recording as base64 WAV (16 kHz, mono, 16-bit). If the browser cannot
// decode its own recording, the original goes instead, with its own type.
export async function toGeminiAudio(blob) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close?.();
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    return { data: b64(wav(pcm, rate)), mime: 'audio/wav' };
  } catch {
    return { data: b64(new Uint8Array(await blob.arrayBuffer())), mime: (blob.type || 'audio/webm').split(';')[0] };
  }
}
function wav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Uint8Array(buf);
}
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
