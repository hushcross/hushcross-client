#!/usr/bin/env bash
# OWNER ONLY: run personally in an interactive terminal. Never run in an agent/CI.
# No password is collected by this script, put in argv/env, or written to a file.
set +x
set -euo pipefail
umask 077

die() { printf 'HushCross signing stopped: %s\n' "$*" >&2; exit 1; }
[ -t 0 ] && [ -t 1 ] && [ -t 2 ] || die 'Use your own interactive terminal, without piping or recording this session.'
BUNDLE=false
case "${1-}" in
  '') [ "$#" -eq 0 ] || die 'Usage: sign-release-owner.sh [--bundle]' ;;
  --bundle) [ "$#" -eq 1 ] || die 'Usage: sign-release-owner.sh [--bundle]'; BUNDLE=true ;;
  *) die 'Usage: sign-release-owner.sh [--bundle]' ;;
esac

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
REPO=$(CDPATH= cd -- "$ROOT/../.." && pwd -P)
JAVA_HOME=${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}
ANDROID_HOME=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
export JAVA_HOME ANDROID_HOME
TOOLS="$ANDROID_HOME/build-tools/35.0.0"
# Do not inherit JVM injection/debug agents or alternate password-handling options.
unset JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS _JAVA_OPTIONS
command -v node >/dev/null || die 'Node.js is required for path and artifact checks; install nothing automatically.'
command -v shasum >/dev/null || die 'The SHA-256 shasum tool is required.'
for tool in java keytool jarsigner jar; do
  [ -x "$JAVA_HOME/bin/$tool" ] || die 'Set JAVA_HOME to an existing reviewed JDK 21 installation.'
done
[ -f "$JAVA_HOME/release" ] && grep -q '^JAVA_VERSION="21\.' "$JAVA_HOME/release" || die 'Use the reviewed JDK 21 runtime.'
[ -f "$ANDROID_HOME/platforms/android-36/android.jar" ] || die 'The existing Android SDK API 36 is required.'
for tool in zipalign apksigner aapt; do
  [ -x "$TOOLS/$tool" ] || die 'Existing Android Build Tools 35.0.0 are required.'
done

INPUT="$ROOT/app/build/outputs/apk/release/app-release-unsigned.apk"
BUNDLE_INPUT="$ROOT/app/build/outputs/bundle/release/app-release.aab"
OUTPUT="$ROOT/app/build/outputs/apk/release/hushcross-0.1.0.apk"
BUNDLE_OUTPUT="$ROOT/app/build/outputs/bundle/release/hushcross-0.1.0.aab"
[ -f "$INPUT" ] && [ ! -L "$INPUT" ] || die 'Build the unsigned release APK first.'
[ ! -e "$OUTPUT" ] && [ ! -L "$OUTPUT" ] || die 'The signed APK already exists. Keep it; review or move it yourself before rerunning.'
if "$BUNDLE"; then
  [ -f "$BUNDLE_INPUT" ] && [ ! -L "$BUNDLE_INPUT" ] || die 'Build the unsigned release AAB first.'
  [ ! -e "$BUNDLE_OUTPUT" ] && [ ! -L "$BUNDLE_OUTPUT" ] || die 'The signed AAB already exists. Keep it; review or move it yourself before rerunning.'
  BUNDLE_ENTRIES=$("$JAVA_HOME/bin/jar" tf "$BUNDLE_INPUT")
  if grep -Eiq '^META-INF/[^/]+\.(SF|RSA|DSA|EC)$' <<< "$BUNDLE_ENTRIES"; then
    die 'The input AAB already contains a signature; do not silently re-sign it.'
  fi
fi
check_apk_identity() {
  local badging
  badging=$("$TOOLS/aapt" dump badging "$1")
  grep -Eq "^package: name='fun.hushcross.app' versionCode='1' versionName='0.1.0'([[:space:]]|$)" <<< "$badging" || die 'APK package or release version differs from this reviewed script.'
  grep -q "^targetSdkVersion:'36'$" <<< "$badging" || die 'APK target SDK is not 36.'
  if grep -q '^application-debuggable' <<< "$badging"; then die 'Refusing to sign a debuggable APK.'; fi
}
check_apk_identity "$INPUT"
if "$TOOLS/apksigner" verify "$INPUT" >/dev/null 2>&1; then
  die 'The input APK is already signed; build an unsigned release instead.'
fi

# This fixed default is outside the checkout. Resolve parents before creating it,
# and examine only metadata, never keystore bytes. Symlink/unsafe files fail closed.
SIGN_DIR="$HOME/.local/share/hushcross-signing"
KEYSTORE="$SIGN_DIR/hushcross-release.p12"
node - "$REPO" "$SIGN_DIR" "$KEYSTORE" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const [repo, dir, key] = process.argv.slice(2).map(p => path.resolve(p));
function fail() { throw new Error('Signing directory must be private, owner-controlled and outside the source checkout; symlink keystores are not accepted.'); }
let parent = dir;
const suffix = [];
while (!fs.existsSync(parent)) { suffix.unshift(path.basename(parent)); parent = path.dirname(parent); }
const resolved = path.join(fs.realpathSync(parent), ...suffix);
if (resolved === repo || resolved.startsWith(repo + path.sep)) fail();
if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) fail();
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const ds = fs.statSync(dir);
if (!ds.isDirectory() || ds.uid !== process.getuid() || (ds.mode & 0o077)) fail();
try {
  const ks = fs.lstatSync(key);
  if (!ks.isFile() || ks.isSymbolicLink() || ks.uid !== process.getuid() || (ks.mode & 0o077) || ks.nlink !== 1) fail();
} catch (error) { if (error.code !== 'ENOENT') throw error; }
JS

# A private lock prevents two owner sessions from creating/replacing an identity.
LOCK="$SIGN_DIR/.owner-sign.lock"
mkdir "$LOCK" 2>/dev/null || die 'Another signing session or a stale lock exists. Resolve it personally; this script will not remove an unknown lock.'
WORK=''
cleanup() {
  if [ -n "$WORK" ]; then rm -rf -- "$WORK"; fi
  rmdir "$LOCK" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
WORK=$(mktemp -d "$ROOT/app/build/outputs/.owner-sign.XXXXXX")

printf '\nOwner-only signing. Password prompts are handled directly by the JDK/Android tools.\n'
printf 'Keep an encrypted backup of your signing identity and password; never send them in chat.\n\n'
if [ ! -e "$KEYSTORE" ]; then
  printf 'Creating your long-term HushCross identity once (public subject: CN=HushCross).\n'
  "$JAVA_HOME/bin/keytool" -genkeypair -storetype PKCS12 \
    -keystore "$KEYSTORE" -alias hushcross-release \
    -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=HushCross'
else
  printf 'Reusing the existing identity without changing or overwriting it.\n'
fi
[ -f "$KEYSTORE" ] && [ ! -L "$KEYSTORE" ] || die 'No regular signing identity was created.'

# Align BEFORE signing; -P 16 also supports future uncompressed native libraries.
"$TOOLS/zipalign" -P 16 -f 4 "$INPUT" "$WORK/aligned.apk"
"$TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-type PKCS12 \
  --ks-key-alias hushcross-release --debuggable-apk-permitted false \
  --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false \
  --out "$WORK/signed.apk" "$WORK/aligned.apk"
"$TOOLS/zipalign" -c -P 16 4 "$WORK/signed.apk"
check_apk_identity "$WORK/signed.apk"
CERT_INFO=$("$TOOLS/apksigner" verify --verbose --print-certs "$WORK/signed.apk")
grep -q '^Number of signers: 1$' <<< "$CERT_INFO" || die 'Expected exactly one APK signer.'
grep -q '^Verified using v2 scheme .*: true$' <<< "$CERT_INFO" || die 'APK v2 signature was not verified.'
grep -q '^Signer #1 certificate DN: CN=HushCross$' <<< "$CERT_INFO" || die 'The certificate is not the expected HushCross release identity (debug/personal subjects are rejected).'
if grep -Eiq 'Android Debug' <<< "$CERT_INFO"; then die 'Android Debug certificates are forbidden.'; fi
CERT_SHA=$(printf '%s\n' "$CERT_INFO" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | tr '[:upper:]' '[:lower:]')
[[ "$CERT_SHA" =~ ^[0-9a-f]{64}$ ]] || die 'Could not verify the public APK certificate SHA-256 digest.'

if "$BUNDLE"; then
  "$JAVA_HOME/bin/jarsigner" -J-Duser.language=en -J-Duser.country=US \
    -keystore "$KEYSTORE" -storetype PKCS12 \
    -signedjar "$WORK/signed.aab" "$BUNDLE_INPUT" hushcross-release
  JAR_CHECK=$("$JAVA_HOME/bin/jarsigner" -J-Duser.language=en -J-Duser.country=US -verify "$WORK/signed.aab")
  grep -q '^jar verified\.$' <<< "$JAR_CHECK" || die 'AAB signature verification failed.'
  BUNDLE_CERT=$("$JAVA_HOME/bin/keytool" -J-Duser.language=en -J-Duser.country=US -printcert -jarfile "$WORK/signed.aab")
  BUNDLE_SHA=$(printf '%s\n' "$BUNDLE_CERT" | sed -n 's/^[[:space:]]*SHA256: //p' | tr -d ':' | tr '[:upper:]' '[:lower:]')
  [ "$BUNDLE_SHA" = "$CERT_SHA" ] || die 'AAB and APK signing certificates differ.'
fi

# Same-filesystem hard links publish verified bytes without overwriting a prior file.
ln "$WORK/signed.apk" "$OUTPUT"
printf '\nVerified release APK: %s\n' "$OUTPUT"
printf 'Public signing certificate SHA-256: %s\n' "$CERT_SHA"
shasum -a 256 "$OUTPUT"
if "$BUNDLE"; then
  ln "$WORK/signed.aab" "$BUNDLE_OUTPUT"
  printf '\nVerified signed AAB: %s\n' "$BUNDLE_OUTPUT"
  shasum -a 256 "$BUNDLE_OUTPUT"
fi
printf '\nSigning is local only. No upload, installation, store submission or website association was performed.\n'
