import { defineConfig } from 'vite';

// In dev, Vite serves the UI on 5173 and proxies /api to the Node server on 8080.
// In production the same Node server serves dist/ and the API together.
export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
