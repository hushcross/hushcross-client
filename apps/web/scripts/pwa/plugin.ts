import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import vendor from '../../src/zk/vendor.json';
import circuits from '../../../../packages/core/artifacts/MANIFEST.json';
import { appInstallMessages as en } from '../../src/i18n/locales/en/appInstall';
import { appInstallMessages as zh } from '../../src/i18n/locales/zh/appInstall';

const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function offlineHtml(): string {
  const sections = [en, zh].map(({ pwa }, i) => `<section lang="${i ? 'zh-CN' : 'en'}"><h1>${escape(pwa.offlineTitle)}</h1><p>${escape(pwa.offlineBody)}</p><a href="/app">${escape(pwa.offlineRetry)}</a></section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4f2ee"><title>HushCross — Offline</title><style>body{margin:0;background:#f4f2ee;color:#15161a;font:17px/1.6 system-ui,sans-serif}main{max-width:560px;padding:64px 24px;margin:auto}header{color:#4b47d6;font-weight:650}h1{font:36px/1.2 Georgia,serif}p{color:#6b6a66}section+section{border-top:1px solid #dad6ce;margin-top:36px;padding-top:12px}a{color:#4b47d6;text-underline-offset:4px}@media(prefers-color-scheme:dark){body{background:#0d0e11;color:#ecedef}p{color:#aeb1b7}header,a{color:#aaa7ff}}</style></head><body><main><header>HushCross</header>${sections}</main></body></html>`;
}
export function hushcrossPwa(): Plugin {
  return {
    name: 'hushcross-conservative-pwa',
    apply: 'build',
    writeBundle(output, bundle) {
      if (!output.dir) this.error('PWA build needs an output directory');
      const directory = resolve(output.dir!);
      const assets: Record<string, string> = {};
      for (const name of Object.keys(bundle)) {
        if (!/^assets\/.+-[\w-]{8,}\.[\w]+$/.test(name)) continue;
        // Vite's import-analysis and CSS plugins can still rewrite bytes in generateBundle.
        // Pin the final emitted bytes, not the earlier Rollup representation.
        assets['/' + name] = hash(readFileSync(resolve(directory, name)));
      }
      const zkAssets: Record<string, string> = { [vendor.snarkjs.file]: vendor.snarkjs.sha256 };
      for (const [name, info] of Object.entries(circuits.artifacts)) zkAssets[vendor.circuits + name] = info.sha256;
      for (const [path, expected] of Object.entries(zkAssets)) {
        const bytes = readFileSync(resolve(directory, path));
        if (hash(bytes) !== expected) this.error('PWA proof asset integrity mismatch: ' + path);
        assets['/' + path] = expected;
      }
      const body = readFileSync(fileURLToPath(new URL('./service-worker.js', import.meta.url)), 'utf8');
      const offline = offlineHtml();
      const version = hash(JSON.stringify(assets) + offline + body).slice(0, 20);
      const source = `const CONFIG = ${JSON.stringify({ version, assets, offlineHtml: offline })};\n${body}`;
      writeFileSync(resolve(directory, 'sw.js'), source);
    },
  };
}
