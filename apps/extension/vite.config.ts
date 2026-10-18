import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('../web/', import.meta.url));
const fixed: Record<string, string> = {
  VITE_APP_TARGET: 'extension', VITE_DATA_SOURCE: 'chain', VITE_CHAIN_ID: '56',
  VITE_RPC_URL: 'https://rpc.hushcross.fun/public', VITE_RELAY_URL: 'https://relay.hushcross.fun',
  VITE_SCREEN_URL: 'https://screen.hushcross.fun', VITE_INDEXER_URL: 'https://indexer.hushcross.fun',
  VITE_META_URL: 'https://meta.hushcross.fun', VITE_DEPLOYMENTS_URL: '/deployments/56.json',
  VITE_WALLETCONNECT_PROJECT_ID: process.env.HUSHCROSS_WALLETCONNECT_PROJECT_ID ?? '',
  VITE_ASSET_BASE: '/', VITE_GITHUB_URL: 'https://github.com/hushcross/hushcross-protocol', VITE_X_URL: 'https://x.com/hushcross',
};
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), base: './', envDir: false,
  envPrefix: 'HUSHCROSS_EXTENSION_UNUSED_', plugins: [react()],
  define: Object.fromEntries(Object.entries(fixed).map(([key, value]) => ['import.meta.env.' + key, JSON.stringify(value)])),
  resolve: { alias: [{ find: /^@hushcross\/core$/, replacement: web + '../../packages/core/src/browser.ts' }] },
  css: { modules: { localsConvention: 'camelCaseOnly' } },
  build: { target: 'es2022', sourcemap: false, outDir: 'dist', emptyOutDir: true },
});
