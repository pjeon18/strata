import { defineConfig } from 'vite';

// BASE_PATH is set by CI for repo-scoped GitHub Pages builds.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { port: 5500, strictPort: true },
});
