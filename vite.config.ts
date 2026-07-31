import { defineConfig } from 'vite';

// Relative base works for GitHub Pages project sites and Vercel alike.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
});
