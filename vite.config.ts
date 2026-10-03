import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use relative base so the build works on GitHub Pages under
// https://USERNAME.github.io/REPOSITORY/ without hard-coding names.
// Override with e.g. BASE_PATH=/my-repo/ vite build if needed.
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
});
