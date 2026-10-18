import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const androidRoot = fileURLToPath(new URL('../', import.meta.url));
const canonicalRelative = '../web/src/assets/brand/hushcross-mark.png';
const rasterRelative = 'app/src/main/res/drawable-nodpi/hushcross_mark.png';
export const APPROVED_SOURCE_SHA256 = 'e6bc955a95a511101ffa9161854018e25769b92dd50bdd5128ce0a3269f631a3';
export const ICON_GEOMETRY = Object.freeze({
  nominalCanvasDp: 108, bitmapSizeDp: 76, insetDp: 16,
  insetPercent: '14.814815%', safeCircleDiameterDp: 66,
  visibleAlphaThreshold: 8,
  // Read-only measurements of the approved PNG; right/bottom are exclusive.
  visibleSourceBounds: Object.freeze({ left: 242, top: 300, right: 1011, bottom: 1003 }),
});
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function parseCanonicalMark(png) {
  assert.ok(Buffer.isBuffer(png) && png.length >= 45 && png.length <= 2 * 1024 * 1024, 'Invalid PNG input size.');
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Expected PNG bytes, not a traced SVG.');
  assert.equal(png.readUInt32BE(8), 13, 'Invalid PNG IHDR length.');
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(width, 1254, 'Unexpected source width; review the new geometry first.');
  assert.equal(height, 1254, 'Unexpected source height; review the new geometry first.');
  assert.equal(png[24], 8, 'Expected 8-bit PNG.');
  assert.equal(png[25], 6, 'Expected an RGBA PNG with the original alpha.');
  assert.equal(png[26], 0); assert.equal(png[27], 0); assert.equal(png[28], 0);
  const sourceSha256 = sha256(png);
  assert.equal(sourceSha256, APPROVED_SOURCE_SHA256, 'Source bytes changed; no trimming, tracing or pixel editing is accepted.');
  const { visibleSourceBounds: b, bitmapSizeDp, insetDp, nominalCanvasDp, safeCircleDiameterDp } = ICON_GEOMETRY;
  const center = nominalCanvasDp / 2, scale = bitmapSizeDp / width;
  const maxVisibleBoundingCornerRadius = Math.max(...[b.left, b.right].flatMap(x => [b.top, b.bottom].map(y => Math.hypot(insetDp + x * scale - center, insetDp + y * scale - center))));
  assert.ok(maxVisibleBoundingCornerRadius < safeCircleDiameterDp / 2, 'Visible strokes exceed the adaptive safe circle.');
  return { width, height, sourceSha256, bytes: png.length, maxVisibleBoundingCornerRadius };
}

function bitmap(monochrome = false) {
  // Fractional insets preserve the 76/108 ratio at every launcher density/size.
  // BitmapDrawable's SRC_IN tint uses the original alpha without rewriting PNGs.
  const tint = monochrome ? '#FF000000' : '#FF4B47D6';
  const inset = ICON_GEOMETRY.insetPercent;
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated wrapper for the unchanged v3 crossed-arcs PNG. Do not trace/redraw. -->\n<inset xmlns:android="http://schemas.android.com/apk/res/android"\n    android:insetLeft="${inset}" android:insetTop="${inset}"\n    android:insetRight="${inset}" android:insetBottom="${inset}">\n    <bitmap android:src="@drawable/hushcross_mark"\n        android:gravity="fill" android:filter="true"\n        android:tint="${tint}" android:tintMode="src_in" />\n</inset>\n`;
}
function adaptive(monochrome = false) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated v3 crossed-arcs adaptive icon. -->\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/paper" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n${monochrome ? '    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n' : ''}</adaptive-icon>\n`;
}

export function renderAndroidIcons(png) {
  const mark = parseCanonicalMark(png);
  const files = new Map([
    [rasterRelative, Buffer.from(png)],
    ['app/src/main/res/drawable/ic_launcher_foreground.xml', bitmap()],
    ['app/src/main/res/drawable/ic_launcher_monochrome.xml', bitmap(true)],
    ['app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', adaptive()],
    ['app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml', adaptive(true)],
  ]);
  files.set('icon-source.json', JSON.stringify({
    schemaVersion: 2, name: 'HushCross crossed arcs', brandRevision: 'v3-crossed-arcs',
    canonicalSource: canonicalRelative, sourceSha256: mark.sourceSha256,
    sourceDimensions: [mark.width, mark.height], sourceBytes: mark.bytes,
    sourceCopiedWithoutPixelOrByteChanges: true, geometry: ICON_GEOMETRY,
    maxVisibleBoundingCornerRadius: Number(mark.maxVisibleBoundingCornerRadius.toFixed(6)),
    background: '#F4F2EE', foregroundTint: '#4B47D6', monochromeTint: '#000000',
    alphaBoundary: 'Only alpha>=8 visible-stroke bounds are guaranteed inside the 66dp circle. Original faint nonzero-alpha noise is preserved and may be clipped by launcher masks; no zero-all-pixel-loss claim.',
    generatedFiles: [...files].map(([path, content]) => ({ path, sha256: sha256(content) })),
  }, null, 2) + '\n');
  return files;
}

async function readCanonical(root) {
  const path = resolve(root, canonicalRelative);
  assert.ok((await lstat(path)).isFile(), 'Canonical mark must be a regular file, not a symlink.');
  return readFile(path);
}
export async function checkIcons(root = androidRoot) {
  const expected = renderAndroidIcons(await readCanonical(root));
  for (const [name, content] of expected) {
    const path = resolve(root, name);
    assert.ok((await lstat(path)).isFile(), `Generated icon is not a regular file: ${name}`);
    assert.ok((await readFile(path)).equals(Buffer.isBuffer(content) ? content : Buffer.from(content)), `Stale icon resource: ${name}; run icons:generate.`);
  }
  const colors = await readFile(resolve(root, 'app/src/main/res/values/colors.xml'), 'utf8');
  assert.match(colors, /<color name="paper">#F4F2EE<\/color>/, 'Unexpected launcher paper background.');
  assert.doesNotMatch(colors, /name="launcher_background"/, 'Remove the retired H-only launcher color.');
  return expected.size;
}
export async function generateIcons(root = androidRoot) {
  const files = renderAndroidIcons(await readCanonical(root));
  for (const [name, content] of files) {
    const path = resolve(root, name);
    await mkdir(dirname(path), { recursive: true });
    try { assert.ok((await lstat(path)).isFile(), `Refusing non-regular output: ${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(path, content);
  }
  return files.size;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'Usage: generate-icons.mjs [--check]');
  const check = args[0] === '--check';
  const count = await (check ? checkIcons() : generateIcons());
  console.log(`${check ? 'Verified' : 'Generated'} ${count} HushCross v3 crossed-arcs files; PNG bytes unchanged. No build or signing.`);
}
