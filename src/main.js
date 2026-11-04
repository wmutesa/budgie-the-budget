import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { swapToFallback } from './lib/brands';

// Logos come from Google first; when Google has none, fall back to a second icon source.
document.addEventListener('error', e => { if (e.target instanceof HTMLImageElement) swapToFallback(e.target); }, true);

createApp(App).mount('#app');
