// Your avatar colour: chosen at random the first time, then yours to change
// in the profile card. Saved in your account so every device matches.
import { computed } from 'vue';
import { store } from './store';

export const SWATCHES = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d', '#ca8a04',
  '#ea580c', '#dc2626', '#db2777', '#9333ea', '#475569', '#0f172a',
];
export const randomColor = () => SWATCHES[Math.floor(Math.random() * (SWATCHES.length - 1))];
export function ensureColor() { if (!/^#[0-9a-f]{6}$/i.test(store.profile?.color || '')) store.profile = { ...(store.profile || {}), color: randomColor() }; }
// Dark or light initials, whichever reads better on the colour.
export function inkFor(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0d0c12' : '#ffffff';
}
export const avatar = computed(() => {
  const bg = /^#[0-9a-f]{6}$/i.test(store.profile?.color || '') ? store.profile.color : '#7c3aed';
  return { bg, ink: inkFor(bg) };
});
