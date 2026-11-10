// Recording: Taskie listens to the microphone itself, in every browser,
// without the browser's own speech recognition (which needs Dictation on in
// Safari, cannot share the microphone and fails silently). Nothing is written
// down while you talk: Stop hands back the whole recording, as 16 kHz mono
// WAV, and Taskie's server hears it in one go (Deepgram Nova-3, then Gemini
// corrects it from context). One pass over the whole recording is more
// accurate than piece-by-piece live text, and just as fast to the result.

import { diag } from './diag';

export const canCapture = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!(window.AudioContext || window.webkitAudioContext);
// Safari on a Mac: Safari > Settings for this website; macOS: Privacy & Security > Microphone.
const BLOCKED = 'The microphone is blocked for Taskie. On a Mac in Safari: Safari menu, Settings for this website, Microphone: Allow (and System Settings, Privacy & Security, Microphone: Safari on). On iPhone: Settings, Apps, Safari or Chrome, Microphone: on. Then tap Speak again.';
export const MAX_SECONDS = 5 * 60;
const RATE = 16000;

let ctx = null;
const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
// Call from the tap itself. Tells iOS this page records as well as plays
// (Safari 16.4+), so it does not hand over a muted microphone. The audio
// graph itself is built only after the microphone is on: on iPhone, an
// AudioContext started first leaves the microphone muted (pure silence).
export function prime() {
  if (!canCapture) return;
  try { if (navigator.audioSession && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'play-and-record'; } catch { /* older Safari */ }
  diag('prime', { session: navigator.audioSession?.type || 'none', ctx: ctx?.state || 'none' });
}
function freshContext() {
  try { if (ctx && ctx.state !== 'closed') ctx.close(); } catch { /* gone */ }
  ctx = null;
  try { ctx = new Ctx(); } catch (e) { diag('ctx-failed', { err: e?.name || String(e) }); }
  return ctx;
}

// onLevel(0..1) while recording; onError(message, code); onTime(seconds).
export function createRecorder({ onLevel, onError, onTime }) {
  let stream = null, src = null, proc = null;
  let all = [];            // every 16 kHz sample so far, in blocks
  let total = 0;
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

  let ticks = 0, peak = 0, heardAny = false, rebuilt = false, silentTold = false, watchdog = null;
  function wire() {
    try { proc?.disconnect(); src?.disconnect(); } catch { /* fine */ }
    src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = e => {
      if (!live) return;
      const input = e.inputBuffer.getChannelData(0);
      let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const level = Math.sqrt(sum / input.length);
      if (level > 0) heardAny = true;
      peak = Math.max(peak, level);
      if (++ticks === 1 || ticks % 12 === 0) { diag('audio', { ticks, peak: +peak.toFixed(4), ctx: ctx.state, muted: stream?.getAudioTracks()[0]?.muted }); peak = 0; }
      onLevel?.(Math.min(1, level * 12));
      const block = down(input, ctx.sampleRate);
      all.push(block);
      const before = Math.floor(total);
      total += block.length / RATE;
      if (Math.floor(total) !== before) onTime?.(Math.floor(total));
      if (total >= MAX_SECONDS) stop();
    };
    src.connect(proc);
    proc.connect(ctx.destination); // Safari only runs the processor when it is connected
  }
  // Exact silence (every sample 0) is a muted microphone, never a quiet room:
  // rebuild the audio once, then say so if it is still silent.
  function checkSilence() {
    watchdog = null;
    if (!live || heardAny) return;
    if (!rebuilt) {
      rebuilt = true;
      diag('silent-rebuild', { muted: stream?.getAudioTracks()[0]?.muted, ctx: ctx?.state });
      if (freshContext()) { ctx.resume?.().catch(() => {}); wire(); }
      watchdog = setTimeout(checkSilence, 2500);
      return;
    }
    if (!silentTold) {
      silentTold = true;
      diag('silent');
      onError?.('Your device is giving Taskie a muted microphone (no sound at all). Close anything else using the microphone (a call, Voice Memos, Siri or another tab), then tap Stop and Speak again.', 'silent');
    }
  }

  let starting = null; // one start at a time: two taps must not open the microphone twice
  function start() {
    if (live) return Promise.resolve(true);
    if (!starting) starting = begin().finally(() => { starting = null; });
    return starting;
  }
  async function begin() {
    diag('start', { canCapture, ctx: ctx?.state || 'none' });
    prime();
    if (!Ctx) { onError?.('This browser cannot use the microphone here.', 'unsupported'); return false; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      diag('mic-failed', { err: e?.name, msg: String(e?.message || '').slice(0, 200) });
      onError?.(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? BLOCKED : e?.name === 'NotFoundError' ? 'No microphone was found.' : 'The microphone could not be started.', 'mic');
      return false;
    }
    { const tr = stream.getAudioTracks()[0]; diag('mic-ok', { label: !!tr?.label, state: tr?.readyState, muted: tr?.muted, settings: JSON.stringify(tr?.getSettings?.() || {}).slice(0, 200) }); tr?.addEventListener('ended', () => diag('track-ended')); tr?.addEventListener('mute', () => diag('track-muted')); tr?.addEventListener('unmute', () => diag('track-unmuted')); }
    // The audio graph starts only now, with the microphone already on.
    if (!ctx || ctx.state === 'closed') freshContext();
    if (!ctx) { teardown(); onError?.('This browser cannot use the microphone here.', 'unsupported'); return false; }
    try { await ctx.resume?.(); } catch { /* fine */ }
    diag('ctx', { state: ctx.state, rate: ctx.sampleRate });
    ticks = 0; peak = 0; heardAny = false; rebuilt = false; silentTold = false;
    all = []; total = 0; onTime?.(0);
    wire();
    live = true;
    clearTimeout(watchdog); watchdog = setTimeout(checkSilence, 2500);
    diag('listening');
    return true;
  }

  // Stop and hand back the whole recording ({ data, mime, secs }), or null when nothing was heard.
  async function stop() {
    if (!live) return null;
    live = false;
    diag('stop', { secs: Math.round(total) });
    teardown();
    const pcm = join(all);
    all = [];
    if (!heardAny || pcm.length < RATE * 0.6) return null;
    return { data: b64(wav(normalize(pcm))), mime: 'audio/wav', secs: +(pcm.length / RATE).toFixed(1) };
  }
  function cancel() { diag('cancel', { was: live }); live = false; all = []; teardown(); }
  function teardown() {
    clearTimeout(watchdog); watchdog = null;
    try { proc?.disconnect(); src?.disconnect(); } catch { /* fine */ }
    if (proc) proc.onaudioprocess = null;
    stream?.getTracks().forEach(t => t.stop());
    proc = null; src = null; stream = null;
    onLevel?.(0);
  }
  return { start, stop, cancel, get live() { return live; } };
}

// Quiet microphones: raise the level so the peak is near full scale (at most 30x).
function normalize(pcm) {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
  if (!peak || peak > 0.5) return pcm;
  const g = Math.min(30, 0.9 / peak);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * g;
  return out;
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
