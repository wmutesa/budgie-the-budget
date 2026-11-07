<script setup>
// Small line icons drawn on a 24px grid. Decorative: the button around an
// icon carries the label (aria-label and title).
defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 16 } });
const P = {
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5v14M16 5v14',
  bell: 'M6 10a6 6 0 1 1 12 0v4l2 3H4l2-3zM10 20a2 2 0 0 0 4 0',
  'bell-off': 'M6 10a6 6 0 0 1 9.5-4.9M18 10v4l2 3H8M4 17l2-3v-4M10 20a2 2 0 0 0 4 0M3 3l18 18',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  agenda: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M8 14h3M8 17h6',
  week: 'M3 5h18v14H3zM8.25 5v14M13.5 5v14M18.75 5v14',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  flame: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.4 3.6-8.3.4 1.9 1.5 3 2.7 3.6.3-2.7 1.6-4.9 3.6-6.1-.2 2.8 3.1 5.4 3.1 9.4 0 4.6-2.6 7.6-6.5 7.6z',
  steps: 'M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9',
  split: 'M4 6h6l4 6-4 6H4M14 12h6M17 9l3 3-3 3',
  calendar: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  planner: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M9 15l2 2 4-4',
  wallet: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7V6a2 2 0 0 1 2-2h10M16 13.5h.01',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  shapes: 'M12 3l3.5 6h-7zM7 21a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM14 14h7v7h-7z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H15a2 2 0 0 0-1.5 3.3c.6.8-.2 2.7-1.5 2.7zM7.5 11h.01M10 7h.01M14.5 7h.01M17 11h.01',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  money: 'M12 3v18M16.5 7.5c-.8-1.3-2.5-2-4.5-2-2.5 0-4.5 1.3-4.5 3.2 0 4.3 9 2.3 9 6.6 0 1.9-2 3.2-4.5 3.2-2.1 0-3.9-.8-4.7-2.2',
};
</script>

<template>
  <svg class="ico" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path :d="P[name] || P.plus" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
