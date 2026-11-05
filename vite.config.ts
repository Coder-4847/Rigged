import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under /<repo>/ without extra config.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { host: true },
});
