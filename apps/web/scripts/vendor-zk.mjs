// Copies the GPL-3.0 prover (loaded at runtime, never bundled) and the circuit artifacts
// into public/zk/, refusing any file whose sha256 differs from the recorded value.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const repo = resolve(web, '../..');
const optional = process.argv.includes('--if-present');
const vendor = JSON.parse(readFileSync(join(web, 'src/zk/vendor.json'), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function copyChecked(source, target, expected) {
  if (!existsSync(source)) {
    if (optional) {
      process.stderr.write(`vendor-zk: ${source} not found, skipping (proofs unavailable until it is installed)\n`);
      return false;
    }
    throw new Error(`missing ${source}`);
  }
  const actual = sha256(source);
  if (actual !== expected) throw new Error(`sha256 mismatch for ${source}: ${actual}`);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target) || sha256(target) !== expected) copyFileSync(source, target);
  return true;
}

const prover = copyChecked(join(repo, vendor.snarkjs.source), join(web, 'public', vendor.snarkjs.file), vendor.snarkjs.sha256);
const artifacts = join(repo, 'packages/core/artifacts');
const manifest = JSON.parse(readFileSync(join(artifacts, 'MANIFEST.json'), 'utf8'));
let copied = 0;
for (const [name, entry] of Object.entries(manifest.artifacts)) {
  if (copyChecked(join(artifacts, name), join(web, 'public', vendor.circuits, name), entry.sha256)) copied += 1;
}
process.stdout.write(`vendor-zk: prover ${prover ? 'ok' : 'skipped'}, ${copied} circuit files verified\n`);
