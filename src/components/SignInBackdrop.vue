<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// A quiet grid that lights up in pastel squares under the pointer and fades.
// With no pointer around, a square wanders on its own. Decoration only.
const canvas = ref(null);
const CELL = 48;
const LIFE = 1400; // ms a square takes to fade
const COLORS = ['#ddd6fe', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#cffafe'];
const cells = new Map(); // "x,y" -> { x, y, born, color }
let ctx, w = 0, h = 0, raf = 0, lastMove = 0, walker = null, lastStep = 0, colorIndex = 0;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = window.innerWidth; h = window.innerHeight;
  canvas.value.width = w * dpr; canvas.value.height = h * dpr;
  canvas.value.style.width = `${w}px`; canvas.value.style.height = `${h}px`;
  ctx = canvas.value.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (still) drawStill();
}

function light(x, y, now) {
  const key = `${x},${y}`;
  if (cells.has(key) && now - cells.get(key).born < LIFE / 3) return;
  cells.set(key, { x, y, born: now, color: COLORS[colorIndex++ % COLORS.length] });
}

function onMove(e) {
  lastMove = performance.now();
  light(Math.floor(e.clientX / CELL), Math.floor(e.clientY / CELL), lastMove);
}

// When idle, a square takes a slow walk around the grid.
function wander(now) {
  if (now - lastMove < 2500 || now - lastStep < 160) return;
  lastStep = now;
  const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
  if (!walker) walker = { x: Math.floor(cols * 0.2), y: Math.floor(rows * 0.7), dx: 1, dy: 0 };
  if (Math.random() < 0.3) { const turn = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)]; walker.dx = turn[0]; walker.dy = turn[1]; }
  walker.x = (walker.x + walker.dx + cols) % cols;
  walker.y = (walker.y + walker.dy + rows) % rows;
  light(walker.x, walker.y, now);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (document.hidden) return;
  wander(now);
  ctx.clearRect(0, 0, w, h);
  for (const [key, c] of cells) {
    const age = (now - c.born) / LIFE;
    if (age >= 1) { cells.delete(key); continue; }
    ctx.globalAlpha = 1 - age * age;
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x * CELL + 1, c.y * CELL + 1, CELL - 1, CELL - 1);
  }
  ctx.globalAlpha = 1;
}

// For reduced motion: a few fixed squares instead of animation.
function drawStill() {
  ctx.clearRect(0, 0, w, h);
  const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
  [[0.1, 0.2], [0.14, 0.2], [0.82, 0.3], [0.86, 0.72], [0.2, 0.8], [0.7, 0.12]].forEach(([fx, fy], i) => {
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fillRect(Math.floor(fx * cols) * CELL + 1, Math.floor(fy * rows) * CELL + 1, CELL - 1, CELL - 1);
  });
}

onMounted(() => {
  resize();
  window.addEventListener('resize', resize);
  if (!still) {
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(frame);
  }
});
onUnmounted(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', resize);
  window.removeEventListener('pointermove', onMove);
});
</script>

<template>
  <div class="si-backdrop" aria-hidden="true">
    <canvas ref="canvas" />
  </div>
</template>
