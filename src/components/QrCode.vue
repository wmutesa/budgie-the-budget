<script setup>
import { computed } from 'vue';
import qrcode from 'qrcode-generator';

// A QR code drawn as one SVG path, so a phone can open a link by scanning the screen.
const props = defineProps({ text: { type: String, required: true }, size: { type: Number, default: 168 } });
const qr = computed(() => {
  const q = qrcode(0, 'M');
  q.addData(props.text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return { d, box: n + 4 };
});
</script>

<template>
  <svg class="qr" :width="size" :height="size" :viewBox="`0 0 ${qr.box} ${qr.box}`" shape-rendering="crispEdges" role="img" aria-label="QR code for the link">
    <rect :width="qr.box" :height="qr.box" fill="#fff" />
    <path :d="qr.d" fill="#000" />
  </svg>
</template>
