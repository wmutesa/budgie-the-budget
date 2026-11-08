// A soft mechanical click, like an old watch's crown turning: a very short
// burst of filtered noise plus a tiny metallic ping. Made with Web Audio, so
// there is no sound file to load. Quiet, and silent when the device asks for
// reduced motion (people who opt out of motion rarely want ticking either).
let ctx = null;
let last = 0;
export function tick(strength = 1) {
  if (typeof window === 'undefined') return;
  if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const now = performance.now();
  if (now - last < 28) return; // a fast spin still sounds like separate clicks
  last = now;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    // The click: 18 ms of noise, shaped by a band-pass around a tinny 3.2 kHz.
    const len = Math.floor(ctx.sampleRate * 0.018);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 3200; band.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.22 * strength, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    noise.connect(band).connect(g).connect(ctx.destination);
    noise.start(t); noise.stop(t + 0.03);
    // The ping: a tiny high sine, gone in 10 ms.
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2100;
    const og = ctx.createGain(); og.gain.setValueAtTime(0.05 * strength, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    o.connect(og).connect(ctx.destination);
    o.start(t); o.stop(t + 0.015);
  } catch { /* no sound is fine */ }
}
