import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@tanktrouble/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 27492,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
