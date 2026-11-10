import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Taskie is a static site: `npm run build` writes dist/, which Cloudflare serves.
export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true },
});
