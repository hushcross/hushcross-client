import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const resolveDependencies = process.argv.slice(2).includes('--resolve-dependencies');
assert.ok(process.argv.slice(2).every(arg => arg === '--resolve-dependencies'), 'Unknown build option.');
const javaHome = process.env.JAVA_HOME || (platform() === 'darwin' ? '/Applications/Android Studio.app/Contents/jbr/Contents/Home' : '');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (platform() === 'darwin' ? join(homedir(), 'Library/Android/sdk') : '');
assert.ok(javaHome && sdk, 'Set JAVA_HOME and ANDROID_HOME for an existing toolchain.');
await access(join(javaHome, 'bin/java'), constants.X_OK);
await access(join(sdk, 'platforms/android-36/android.jar'));
await access(join(sdk, 'build-tools/35.0.0/aapt'));
const release = await readFile(join(javaHome, 'release'), 'utf8');
assert.match(release, /JAVA_VERSION="21\./, 'This build path requires the reviewed JDK 21 runtime.');
let gradle = process.env.HUSHCROSS_GRADLE_BIN;
if (!gradle) {
  const distributions = join(homedir(), '.gradle/wrapper/dists/gradle-8.14.3-all');
  for (const hash of await readdir(distributions).catch(() => [])) {
    const candidate = join(distributions, hash, 'gradle-8.14.3/bin/gradle');
    try { await access(candidate, constants.X_OK); gradle = candidate; break; } catch { /* Try another installed distribution. */ }
  }
}
assert.ok(gradle, 'Set HUSHCROSS_GRADLE_BIN to the existing Gradle 8.14.3 executable.');
const toolEnv = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };
const version = await promisify(execFile)(gradle, ['--version'], { env: toolEnv });
assert.match(version.stdout, /Gradle 8\.14\.3\b/, 'Use the reviewed Gradle 8.14.3 distribution.');
const props = await readFile(join(root, 'gradle.properties'), 'utf8');
assert.match(props, /android\.builder\.sdkDownload=false/);
const args = ['--no-daemon', '--no-configuration-cache', '--no-build-cache', '-p', resolve(root),
  ...(resolveDependencies ? [] : ['--offline']), ':app:assembleRelease', ':app:bundleRelease'];
console.log(`Building unsigned release APK and AAB (${resolveDependencies ? 'approved Maven dependency resolution' : 'offline'}). No signing or publication.`);
const child = spawn(gradle, args, { cwd: root, stdio: 'inherit', env: toolEnv });
child.once('error', () => { console.error('Could not start the reviewed Gradle executable.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
