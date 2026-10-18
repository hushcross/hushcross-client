import { build } from 'vite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = process.env.HUSHCROSS_WALLETCONNECT_PROJECT_ID ?? '';
if (!/^[0-9a-f]{32}$/i.test(projectId)) throw new Error('Set the approved HUSHCROSS_WALLETCONNECT_PROJECT_ID before building the real-mode candidate.');
await build({ configFile: resolve(root, 'vite.config.ts') });
const output = resolve(root, 'dist');
const web = resolve(root, '../web/public');
for (const name of ['fonts', 'zk', 'deployments', 'licenses']) await cp(resolve(web, name), resolve(output, name), { recursive: true });
// The owned MV3 worker is copied last; the web distribution has no execution wrapper here.
await cp(resolve(root, 'public/zk/prover-worker.js'), resolve(output, 'zk/prover-worker.js'));
const vendor = JSON.parse(await readFile(resolve(root, '../web/src/zk/vendor.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, '../../packages/core/artifacts/MANIFEST.json'), 'utf8'));
const expected = { [vendor.snarkjs.file]: vendor.snarkjs.sha256, ...Object.fromEntries(Object.entries(manifest.artifacts).map(([name, v]) => ['zk/circuits/' + name, v.sha256])) };
for (const [path, digest] of Object.entries(expected)) {
  const actual = createHash('sha256').update(await readFile(resolve(output, path))).digest('hex');
  if (actual !== digest) throw new Error('Bundled proving asset mismatch: ' + path);
}
const html = await readFile(resolve(output, 'index.html'), 'utf8');
if (/<script(?![^>]*src=)[^>]*>/i.test(html)) throw new Error('Inline executable script in extension entry');
const csp = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8')).content_security_policy.extension_pages;
if (/script-src[^;]*(?:https:|blob:|'unsafe-eval')/.test(csp)) throw new Error('Unsafe extension script policy');
await mkdir(resolve(output, 'licenses'), { recursive: true });
await cp(resolve(root, '../../third-party/runtime/COPYING'), resolve(output, 'licenses/snarkjs-GPL-3.0.txt'));
await cp(resolve(root, '../../node_modules/@walletconnect/universal-provider/LICENSE'), resolve(output, 'licenses/WalletConnect-Apache-2.0.txt')).catch(async (error) => {
  if (error.code !== 'ENOENT') throw error;
  await cp(resolve(root, '../../node_modules/@walletconnect/universal-provider/LICENSE.md'), resolve(output, 'licenses/WalletConnect-Apache-2.0.txt'));
});
await writeFile(resolve(output, 'RELEASE-INFO.txt'), 'HushCross 0.1.0\nBNB Chain mainnet (chain 56), real public services.\nClient source and build instructions: https://github.com/hushcross/hushcross-client\nFirst-party client license: GPL-3.0-or-later. Original third-party licenses are retained in licenses/.\nLocal tests are not an independent security audit. Read the in-app privacy and safety notice before using funds.\n');
console.log('HushCross extension built; verify the release package, source and store configuration before publishing.');
