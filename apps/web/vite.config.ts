import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { hushcrossPwa } from './scripts/pwa/plugin';
import { fileURLToPath } from 'node:url';

const coreEntry = fileURLToPath(new URL('../../packages/core/src/browser.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), hushcrossPwa()],
  resolve: {
    alias: [{ find: /^@hushcross\/core$/, replacement: coreEntry }],
  },
  server: { port: 8841, strictPort: true },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
  preview: { port: 8831, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          motion: ['framer-motion'],
          qrcode: ['qrcode'],
          viem: ['viem'],
        },
      },
    },
  },
});
