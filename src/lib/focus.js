// The focus timer, shared by every page.
//
// Time is counted against an end time, not by ticks, so it stays exact when
// the tab is in the background (browsers slow timers there). While it runs,
// the tab shows it: the title counts down ("⏱ 24:13 · Essay") and the tab icon
// becomes a shrinking ring. On Chrome and Edge it can also float in a small
// always-on-top window. When it ends: a soft chime, a notification that stays
// until you answer it, and the tab title flashes until you come back.
//
// A web page cannot add an icon to the Mac menu bar; the tab and the floating
// window are the closest it can get.
import { reactive, watch } from 'vue';
import { isDone, toggleDone } from './tasks';
import { store, newId } from './store';
import { toast } from './toast';

// `spent` counts the seconds actually focused, for Reports. `ended` is true from
// the moment the time is up until the session is closed.
// `min`: Lock In is minimised to the pill in the top bar.
export const focus = reactive({ task: null, total: 25 * 60, left: 25 * 60, running: false, spent: 0, ended: false, mini: false, min: false, held: [] });

// ---------- what gets through while you focus ----------
// 'all': everything; 'starting': only events and classes about to start; 'none': nothing.
export const ALLOW = [
  ['starting', 'Only what is starting', 'Events and classes about to begin still reach you; task reminders wait.'],
  ['none', 'Nothing', 'Every Taskie reminder waits until the session ends.'],
  ['all', 'Everything', 'Reminders arrive as usual.'],
];
export const focusAllow = () => (ALLOW.some(([k]) => k === store.planner?.focusAllow) ? store.planner.focusAllow : 'starting');
export const inFocus = () => !!focus.task && !focus.ended;
// May a reminder of this kind ('starting' or 'other') reach you now? If not, it is held for the summary.
export function focusGate(kind, note) {
  if (!inFocus()) return true;
  const allow = focusAllow();
  if (allow === 'all' || (allow === 'starting' && kind === 'starting')) return true;
  if (note) focus.held.push({ ...note, at: new Date().toISOString() });
  return false;
}
// When a session ends, say what was held back.
function releaseHeld() {
  const held = focus.held.splice(0);
  if (!held.length) return;
  toast(held.slice(0, 4).map(h => h.title).join(', ') + (held.length > 4 ? ` and ${held.length - 4} more.` : '.'), { kind: 'info', title: `While you focused: ${held.length} held` });
}
let endsAt = 0;
let lastTick = 0;
let countdown = null;

// Keep a session of a minute or more in the focus log.
function logSession() {
  const t = focus.task;
  const mins = Math.round(focus.spent / 60);
  if (!t || mins < 1) return;
  store.focusLog = [...(store.focusLog || []), { id: newId(), taskId: t.id, title: t.title, project: t.project || '', kind: t.kind, mins, at: new Date().toISOString() }].slice(-2000);
  focus.spent = 0;
}

function tick() {
  if (!focus.running) return;
  const now = Date.now();
  focus.spent += Math.max(0, Math.round((now - lastTick) / 1000));
  lastTick = now;
  focus.left = Math.max(0, Math.round((endsAt - now) / 1000));
  if (focus.left <= 0) timeUp();
}
function run() {
  clearInterval(countdown);
  countdown = setInterval(tick, 1000);
}

export function startFocus(t, mins = 25) {
  if (focus.task) logSession();
  stopAlarm();
  askToNotify();
  Object.assign(focus, { task: t, total: mins * 60, left: mins * 60, running: true, spent: 0, ended: false, min: false });
  endsAt = Date.now() + mins * 60 * 1000;
  lastTick = Date.now();
  run();
}
export function pauseFocus() { tick(); focus.running = false; }
export function resumeFocus() { if (!focus.task || focus.ended) return; endsAt = Date.now() + focus.left * 1000; lastTick = Date.now(); focus.running = true; run(); }
export const toggleFocus = () => (focus.running ? pauseFocus() : resumeFocus());
// Five more minutes, from the alarm or any time.
export function extendFocus(mins = 5) {
  if (!focus.task) return;
  stopAlarm();
  focus.ended = false;
  focus.left += mins * 60;
  focus.total += mins * 60;
  resumeFocus();
}
export function finishFocus() {
  if (focus.task && !isDone(focus.task)) toggleDone(focus.task);
  stopFocus();
}
export function stopFocus() {
  if (focus.running) tick();
  clearInterval(countdown);
  logSession();
  releaseHeld();
  stopAlarm();
  closeMini();
  Object.assign(focus, { task: null, total: 25 * 60, left: 25 * 60, running: false, spent: 0, ended: false, min: false });
}
export const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// ---------- the end of a session ----------
function timeUp() {
  focus.running = false;
  focus.left = 0;
  focus.ended = true;
  clearInterval(countdown);
  logSession();
  chime();
  notifyEnd();
  flashTitle();
  releaseHeld();
}

// A soft three-note chime, played twice, made in the browser (no sound file).
let audio = null;
export function chime() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const notes = [659.25, 783.99, 987.77];
    const start = audio.currentTime + 0.05;
    [0, 1.4].forEach(round => notes.forEach((f, i) => {
      const t0 = start + round + i * 0.22;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0);
      osc.stop(t0 + 1.2);
    }));
  } catch { /* no sound on this device */ }
}
// Ask once, when a session starts (a tap, so browsers allow the prompt).
function askToNotify() {
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission(); } catch { /* not supported */ }
  // Unlock sound on Safari, which only plays audio started from a tap.
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { /* no sound */ }
}
let note = null;
function notifyEnd() {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    note = new Notification('Focus session done', { body: `${focus.task?.title || 'Your session'} · time for a short break`, tag: 'taskie-focus', requireInteraction: true, renotify: true });
    note.onclick = () => { window.focus(); note?.close(); };
  } catch { /* notifications off */ }
}
let flasher = null;
function flashTitle() {
  clearInterval(flasher);
  if (typeof document !== 'undefined') document.title = '✓ Time is up';
  let on = true;
  flasher = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) { clearInterval(flasher); flasher = null; setTitle(); return; }
    on = !on;
    document.title = on ? '✓ Time is up' : `${focus.task?.title || 'Lock In'} · Taskie`;
  }, 1000);
}
function stopAlarm() { clearInterval(flasher); flasher = null; try { note?.close(); } catch { /* gone */ } note = null; }

// ---------- the tab: title and icon ----------
const BASE_TITLE = typeof document !== 'undefined' ? document.title : 'Taskie';
let icons = null;
function setTitle() {
  if (typeof document === 'undefined' || flasher) return;
  if (!focus.task) { document.title = BASE_TITLE; return; }
  const t = focus.task.title.length > 28 ? `${focus.task.title.slice(0, 27)}…` : focus.task.title;
  document.title = focus.ended ? `✓ Done · ${t}` : `${focus.running ? '⏱' : '⏸'} ${mmss(focus.left)} · ${t}`;
}
// The tab icon becomes a ring that empties as the session goes.
let lastRing = -1;
function setIcon() {
  if (typeof document === 'undefined') return;
  icons = icons || [...document.querySelectorAll('link[rel="icon"]')].map(l => ({ l, href: l.getAttribute('href') }));
  if (!focus.task) { icons.forEach(({ l, href }) => l.setAttribute('href', href)); lastRing = -1; return; }
  const p = focus.ended ? 0 : focus.left / Math.max(1, focus.total);
  const step = Math.round(p * 60);
  if (step === lastRing && !focus.ended) return;
  lastRing = step;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineWidth = 9;
  g.strokeStyle = '#ede9fe';
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = focus.ended ? '#16a34a' : focus.running ? '#7c3aed' : '#a1a1aa';
  g.beginPath(); g.arc(32, 32, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (focus.ended ? 1 : p)); g.stroke();
  const url = c.toDataURL('image/png');
  icons.forEach(({ l }) => l.setAttribute('href', url));
}
if (typeof window !== 'undefined') {
  watch(() => [focus.task, focus.left, focus.running, focus.ended], () => { setTitle(); setIcon(); renderMini(); });
  // Catch up at once when the tab comes back.
  document.addEventListener('visibilitychange', tick);
}

// ---------- a small always-on-top window (Chrome and Edge) ----------
export const canMini = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
let mini = null;
export async function openMini() {
  if (!canMini || !focus.task) return;
  if (mini && !mini.closed) { mini.focus(); return; }
  try {
    mini = await window.documentPictureInPicture.requestWindow({ width: 260, height: 132 });
  } catch { return; }
  focus.mini = true;
  const d = mini.document;
  d.title = 'Taskie focus';
  d.head.innerHTML = `<style>
    body { margin: 0; font: 13px/1.3 system-ui, -apple-system, sans-serif; background: #faf8ff; color: #18181b; display: grid; gap: 6px; padding: 12px 14px; }
    .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .c { font: 700 30px/1 ui-monospace, SFMono-Regular, monospace; color: #4c1d95; }
    .bar { height: 4px; border-radius: 4px; background: #ede9fe; overflow: hidden; } .bar i { display: block; height: 100%; background: #a78bfa; }
    .row { display: flex; gap: 6px; } button { flex: 1; height: 26px; border: 1px solid #ddd6fe; border-radius: 999px; background: #fff; color: #4c1d95; font: 600 12px system-ui, sans-serif; cursor: pointer; }
    button:hover { background: #ede9fe; } .done .c { color: #15803d; }
  </style>`;
  d.body.innerHTML = '<div class="t"></div><div class="c"></div><div class="bar"><i></i></div><div class="row"><button data-a="toggle"></button><button data-a="more">+5 min</button><button data-a="done">Done</button></div>';
  d.body.addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'toggle') { if (focus.ended) startFocus(focus.task); else toggleFocus(); } else if (a === 'more') extendFocus(5); else if (a === 'done') finishFocus();
  });
  mini.addEventListener('pagehide', () => { mini = null; focus.mini = false; });
  renderMini();
}
function renderMini() {
  if (!mini || mini.closed) return;
  if (!focus.task) { closeMini(); return; }
  const d = mini.document;
  d.body.classList.toggle('done', focus.ended);
  d.querySelector('.t').textContent = focus.task.title;
  d.querySelector('.c').textContent = focus.ended ? 'Time is up' : mmss(focus.left);
  d.querySelector('.bar i').style.width = `${(focus.left / Math.max(1, focus.total)) * 100}%`;
  d.querySelector('[data-a="toggle"]').textContent = focus.ended ? 'Again' : focus.running ? 'Pause' : 'Resume';
}
export function closeMini() { try { mini?.close(); } catch { /* gone */ } mini = null; focus.mini = false; }
