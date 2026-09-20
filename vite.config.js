import { defineConfig } from 'vite';

// Static SPA. Assets under /public are served as-is and copied to dist on build.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    port: 5173,
  },
});
