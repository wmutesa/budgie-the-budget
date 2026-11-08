<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// Lock In's background: black, with colourful Tetris pieces and single
// blocks scattered across it. Still: nothing moves, so nothing distracts.
const canvas = ref(null);
const COLORS = ['#22d3ee', '#facc15', '#a855f7', '#22c55e', '#ef4444', '#3b82f6', '#f97316'];
const PIECES = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],         // I
  [[0, 0], [1, 0], [0, 1], [1, 1]],         // O
  [[0, 0], [1, 0], [2, 0], [1, 1]],         // T
  [[1, 0], [2, 0], [0, 1], [1, 1]],         // S
  [[0, 0], [1, 0], [1, 1], [2, 1]],         // Z
  [[0, 0], [0, 1], [1, 1], [2, 1]],         // J
  [[2, 0], [0, 1], [1, 1], [2, 1]],         // L
  [[0, 0]],                                 // a lone square
];
const CELL = 24;

function block(ctx, x, y, color, alpha) {
  const w = CELL - 3;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color; ctx.fillRect(x, y, w, w);
  // Tetris bevel: light top-left, dark bottom-right.
  ctx.fillStyle = 'rgba(255,255,255,.38)'; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y, 3, w);
  ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(x, y + w - 3, w, 3); ctx.fillRect(x + w - 3, y, 3, w);
}
function draw() {
  const el = canvas.value; if (!el) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  el.width = W * dpr; el.height = H * dpr;
  const ctx = el.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#f7f7fa'; ctx.fillRect(0, 0, W, H);
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
  // The same layout each time for this screen size, so a resize does not reshuffle it wildly.
  let seed = cols * 131 + rows * 7;
  const rand = n => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
  const taken = new Set();
  const count = Math.round((cols * rows) / 34);
  for (let i = 0; i < count; i++) {
    const shape = PIECES[rand(PIECES.length)];
    const rot = rand(4);
    const cells = shape.map(([a, b]) => [[a, b], [b, -a], [-a, -b], [-b, a]][rot]);
    const x0 = rand(cols), y0 = rand(rows);
    const at = cells.map(([a, b]) => [x0 + a, y0 + b]);
    if (at.some(([x, y]) => taken.has(`${x},${y}`) || taken.has(`${x + 1},${y}`) || taken.has(`${x},${y + 1}`))) continue;
    at.forEach(([x, y]) => taken.add(`${x},${y}`));
    const color = COLORS[rand(COLORS.length)];
    const alpha = 0.35 + rand(60) / 100;
    for (const [x, y] of at) block(ctx, x * CELL, y * CELL, color, alpha);
  }
  ctx.globalAlpha = 1;
}
onMounted(() => { draw(); window.addEventListener('resize', draw); });
onUnmounted(() => window.removeEventListener('resize', draw));
</script>

<template>
  <canvas ref="canvas" class="lk-field" aria-hidden="true" />
</template>
