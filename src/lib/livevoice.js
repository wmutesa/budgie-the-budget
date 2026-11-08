// Live voice: Budgie listens to the microphone itself, in every browser,
// without the browser's own speech recognition (which needs Dictation on in
// Safari, cannot share the microphone and fails silently). While you talk,
// each phrase is cut at a natural pause and written down by Budgie's server
// (Cloudflare's Whisper, or your Gemini key), so the words appear in the card
// a moment after you say them. Stop hands back the whole recording, as 16 kHz
// mono WAV, for Gemini to read in full when you have a key.

import { diag } from './diag';

export const canCapture = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!(window.AudioContext || window.webkitAudioContext);
export const MAX_SECONDS = 5 * 60;
const RATE = 16000;
const QUIET = 0.012;      // below this level counts as silence
const PAUSE = 0.55;       // seconds of silence that end a phrase
const MIN_PIECE = 1.2;    // seconds before a phrase may be cut
const MAX_PIECE = 9;      // seconds: cut even without a pause

let ctx = null;
// Call from the click itself: Safari only lets sound start inside a tap.
export function prime() {
  if (!canCapture) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!ctx || ctx.state === 'closed') ctx = new Ctx();
    ctx.resume?.();
    diag('prime', { state: ctx.state, rate: ctx.sampleRate });
  } catch (e) { diag('prime-failed', { err: e?.name || String(e) }); ctx = null; }
}

// send(wavBase64, prompt) → text; onText(newWords); onLevel(0..1); onError(message, code)
export function createLive({ send, onText, onLevel, onError }) {
  let stream = null, src = null, proc = null;
  let all = [];            // every 16 kHz sample so far, in blocks
  let piece = [];          // samples of the phrase being spoken
  let pieceLen = 0, quietFor = 0, loud = false, total = 0;
  let chain = Promise.resolve();
  let said = '';
  let failures = 0;
  let live = false;

  const down = (input, from) => {
    if (from === RATE) return Float32Array.from(input);
    const ratio = from / RATE;
    const out = new Float32Array(Math.floor(input.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio));
      let s = 0; for (let j = a; j < b; j++) s += input[j];
      out[i] = s / Math.max(1, b - a);
    }
    return out;
  };

  function cut() {
    const blocks = piece; const hadVoice = loud;
    piece = []; pieceLen = 0; quietFor = 0; loud = false;
    if (!hadVoice || !send) return; // silence: nothing to write down
    const audio = b64(wav(join(blocks)));
    diag('piece', { secs: +(blocks.reduce((a, b) => a + b.length, 0) / RATE).toFixed(1) });
    chain = chain.then(async () => {
      try {
        const text = String(await send(audio, said.slice(-200)) || '').trim();
        failures = 0;
        diag('piece-text', { chars: text.length });
        if (text) { said = `${said} ${text}`.trim(); onText?.(text); }
      } catch (e) {
        failures++;
        diag('piece-failed', { status: e?.status, msg: String(e?.message || '').slice(0, 200) });
        if (failures === 1 || e?.status === 503) onError?.(e?.message || 'Live words could not be written down.', e?.status === 503 ? 'unavailable' : 'failed');
      }
    });
  }

  async function start() {
    if (live) return true;
    diag('start', { canCapture, ctx: ctx?.state });
    prime();
    if (!ctx) { onError?.('This browser cannot use the microphone here.', 'unsupported'); return false; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      diag('mic-failed', { err: e?.name, msg: String(e?.message || '').slice(0, 200) });
      onError?.(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'The microphone is blocked for this site. Allow it in the browser (the icon in the address bar, or Settings for this website), then tap Speak again.' : e?.name === 'NotFoundError' ? 'No microphone was found.' : 'The microphone could not be started.', 'mic');
      return false;
    }
    { const tr = stream.getAudioTracks()[0]; diag('mic-ok', { label: !!tr?.label, state: tr?.readyState, muted: tr?.muted, settings: JSON.stringify(tr?.getSettings?.() || {}).slice(0, 200) }); tr?.addEventListener('ended', () => diag('track-ended')); tr?.addEventListener('mute', () => diag('track-muted')); tr?.addEventListener('unmute', () => diag('track-unmuted')); }
    try { await ctx.resume?.(); } catch { /* fine */ }
    diag('ctx', { state: ctx.state, rate: ctx.sampleRate });
    let ticks = 0, peak = 0;
    all = []; piece = []; pieceLen = 0; quietFor = 0; loud = false; total = 0; said = ''; failures = 0;
    src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = e => {
      if (!live) return;
      const input = e.inputBuffer.getChannelData(0);
      let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const level = Math.sqrt(sum / input.length);
      peak = Math.max(peak, level);
      if (++ticks === 1 || ticks % 12 === 0) { diag('audio', { ticks, peak: +peak.toFixed(4), ctx: ctx.state }); peak = 0; }
      onLevel?.(Math.min(1, level * 12));
      const block = down(input, ctx.sampleRate);
      all.push(block); piece.push(block);
      const secs = block.length / RATE;
      pieceLen += secs; total += secs;
      if (level >= QUIET) { loud = true; quietFor = 0; } else quietFor += secs;
      if ((pieceLen >= MIN_PIECE && quietFor >= PAUSE && loud) || pieceLen >= MAX_PIECE) cut();
      else if (!loud && pieceLen >= 3) { piece = []; pieceLen = 0; quietFor = 0; } // long silence: drop it
      if (total >= MAX_SECONDS) stop();
    };
    src.connect(proc);
    proc.connect(ctx.destination); // Safari only runs the processor when it is connected
    live = true;
    diag('listening');
    return true;
  }

  // Stop, wait for the last words, and hand back the whole recording (or null).
  async function stop() {
    if (!live) return null;
    live = false;
    diag('stop', { secs: Math.round(total) });
    if (pieceLen) cut();
    teardown();
    await chain;
    const pcm = join(all);
    all = [];
    return pcm.length > RATE * 0.6 ? { data: b64(wav(pcm)), mime: 'audio/wav' } : null;
  }
  function cancel() { diag('cancel', { was: live }); live = false; piece = []; all = []; teardown(); }
  function teardown() {
    try { proc?.disconnect(); src?.disconnect(); } catch { /* fine */ }
    if (proc) proc.onaudioprocess = null;
    stream?.getTracks().forEach(t => t.stop());
    proc = null; src = null; stream = null;
    onLevel?.(0);
  }
  return { start, stop, cancel, get live() { return live; } };
}

function join(blocks) {
  const n = blocks.reduce((a, b) => a + b.length, 0);
  const out = new Float32Array(n);
  let o = 0; for (const b of blocks) { out.set(b, o); o += b.length; }
  return out;
}
function wav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Uint8Array(buf);
}
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
