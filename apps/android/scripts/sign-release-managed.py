#!/usr/bin/env python3
"""Authorized HushCross managed signing. Never prints or accepts password text."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
JDK = Path('/Applications/Android Studio.app/Contents/jbr/Contents/Home')
TOOLS = Path.home() / 'Library/Android/sdk/build-tools/35.0.0'
IDENTITY_DIR = Path.home() / '.local/share/hushcross-signing'
KEY_NAME = 'hushcross-managed-release.p12'
PASS_NAME = 'hushcross-managed-release.password'
ALIAS = 'hushcross-managed-release'
STAGE = 'preflight'


def need(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def regular(path):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and not path.is_symlink(), 'Expected a regular file.')
    return info


def safe_private_file(path):
    info = regular(path)
    need(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1,
         'Managed credential file permissions or ownership are unsafe.')


def run(argv, sensitive=False):
    global STAGE
    STAGE = Path(argv[0]).name + (' private operation' if sensitive else ' public artifact verification')
    env = dict(os.environ)
    env['JAVA_HOME'] = str(JDK)
    for name in ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS']:
        env.pop(name, None)
    result = subprocess.run([str(x) for x in argv], capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL, timeout=120)
    # Neither successful credential-tool output nor errors are echoed to logs.
    need(result.returncode == 0, f'{Path(argv[0]).name} failed; no credential output was disclosed.')
    return result.stdout


def verify(apk, unsigned, config):
    regular(apk)
    # Check both cryptographic schemes even though this app itself requires API 28.
    cert = run([TOOLS / 'apksigner', 'verify', '--min-sdk-version', '24', '--verbose', '--print-certs', apk])
    need(bool(re.search(r'^Number of signers: 1$', cert, re.M)), 'Unexpected signer count.')
    schemes = {version: bool(re.search(rf'^Verified using v{version} scheme .*: true$', cert, re.M)) for version in [2, 3]}
    need(all(schemes.values()), f'Public scheme verification failed: v2={schemes[2]}, v3={schemes[3]}.')
    need(bool(re.search(r'^Signer #1 certificate DN: CN=HushCross$', cert, re.M)) and 'android debug' not in cert.lower(), 'Unexpected certificate subject.')
    cert_sha = re.search(r'^Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]{64})$', cert, re.M)
    need(cert_sha is not None, 'Public certificate fingerprint unavailable.')
    badging = run([TOOLS / 'aapt', 'dump', 'badging', apk])
    identity = f"package: name='{config['applicationId']}' versionCode='{config['versionCode']}' versionName='{config['versionName']}'"
    need(identity in badging and 'application-debuggable' not in badging and "targetSdkVersion:'36'" in badging, 'APK package/version/debug state differs from the release configuration.')
    run([TOOLS / 'zipalign', '-c', '-P', '16', '4', apk])
    def signing_entry(name):
        return name == 'META-INF/MANIFEST.MF' or re.fullmatch(r'META-INF/[^/]+\.(SF|RSA|DSA|EC)', name, re.I)
    with zipfile.ZipFile(unsigned) as original, zipfile.ZipFile(apk) as signed:
        need(len(original.namelist()) == len(set(original.namelist())) and len(signed.namelist()) == len(set(signed.namelist())), 'Duplicate ZIP entry.')
        before = {n for n in original.namelist() if not signing_entry(n)}
        after = {n for n in signed.namelist() if not signing_entry(n)}
        need(before == after, 'APK payload entry set changed.')
        logo_matches = 0
        for name in before:
            need(original.getinfo(name).file_size == signed.getinfo(name).file_size, 'APK payload size changed.')
            data = signed.read(name)
            need(sha(original.read(name)) == sha(data), 'APK payload bytes changed.')
            if name.endswith('.png') and sha(data) == config['sourcePngSha256']:
                logo_matches += 1
        need(logo_matches >= 1, 'Approved crossed-arcs logo is missing.')
    digest = cert_sha.group(1).lower()
    return {'package': config['applicationId'], 'versionName': config['versionName'], 'versionCode': config['versionCode'],
            'brandRevision': config['brandRevision'], 'certificateSha256': digest,
            'digitalAssetLinksFingerprint': ':'.join(digest[i:i+2].upper() for i in range(0, 64, 2)),
            'apkSha256': sha(apk.read_bytes()), 'apkBytes': apk.stat().st_size,
            'signatureV2AndV3Verified': True, 'debuggable': False, 'aligned': True,
            'payloadMatchesUnsigned': True, 'originalLogoBytesPreserved': True}


def private_directory():
    # Inspect only the known directory chain, never enumerate old identities.
    current = Path.home()
    for component in ['.local', 'share', 'hushcross-signing']:
        current /= component
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            pass
        info = current.lstat()
        need(stat.S_ISDIR(info.st_mode) and not current.is_symlink() and info.st_uid == os.getuid(), 'Unsafe managed directory ownership/type.')
        need(not (stat.S_IMODE(info.st_mode) & 0o022), 'Managed parent directory is writable by others.')
    need(stat.S_IMODE(current.stat().st_mode) == 0o700, 'Managed signing directory must already be mode 0700.')


def exclusive_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def main():
    global STAGE
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true', help='Read public APK only; never inspect the credential directory.')
    args = parser.parse_args()
    config = json.loads((ROOT / 'release-signing.json').read_text())
    unsigned = ROOT / 'app/build/outputs/apk/release/app-release-unsigned.apk'
    output = unsigned.parent / f"hushcross-{config['versionName']}.apk"
    regular(unsigned)
    need(sha(unsigned.read_bytes()) == config['unsignedApkSha256'], 'Unsigned baseline changed; review/update the public release configuration first.')
    need('JAVA_VERSION="21.' in (JDK / 'release').read_text(), 'Reviewed JDK 21 is required.')
    # Existing signed artifacts are verified before any credential-directory access.
    if output.exists() or output.is_symlink():
        result = verify(output, unsigned, config)
        print(json.dumps({**result, 'apkPath': str(output), 'existingSignedArtifact': True,
                          'credentialsAccessed': False, 'installed': False, 'published': False}, indent=2))
        return
    need(not args.verify_only, 'No signed APK exists yet.')
    STAGE = 'private-directory checks'
    private_directory()
    key = IDENTITY_DIR / KEY_NAME
    password = IDENTITY_DIR / PASS_NAME
    # New managed names never target the earlier owner-only signing identity.
    key_exists = key.exists() or key.is_symlink()
    pass_exists = password.exists() or password.is_symlink()
    if key_exists:
        safe_private_file(key)
        need(pass_exists, 'Managed password file is missing; existing identity was not changed.')
    if pass_exists:
        safe_private_file(password)
    lock = IDENTITY_DIR / '.managed-sign.lock'
    lock.mkdir(mode=0o700)  # Atomic exclusive session lock; never remove an unknown lock.
    try:
        if not pass_exists:
            STAGE = 'exclusive managed password creation'
            exclusive_write(password, (secrets.token_hex(32) + '\n').encode('ascii'))
        if not key_exists:
            with tempfile.TemporaryDirectory(prefix='.managed-key-', dir=IDENTITY_DIR) as private_temp:
                staged_key = Path(private_temp) / 'new-release.p12'
                run([JDK / 'bin/keytool', '-genkeypair', '-storetype', 'PKCS12', '-keystore', staged_key,
                     '-alias', ALIAS, '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-dname', 'CN=HushCross',
                     '-storepass:file', password, '-keypass:file', password], sensitive=True)
                safe_private_file(staged_key)
                # Only this local helper transfers the newly created private bytes.
                # O_EXCL and O_NOFOLLOW prevent replacement of any existing file.
                STAGE = 'exclusive managed keystore save'
                fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, 'wb') as dest, staged_key.open('rb') as source:
                    shutil.copyfileobj(source, dest)
                    dest.flush()
                    os.fsync(dest.fileno())
        safe_private_file(key)
        safe_private_file(password)
        with tempfile.TemporaryDirectory(prefix='.managed-apk-', dir=unsigned.parent) as public_temp:
            aligned = Path(public_temp) / 'aligned.apk'
            signed = Path(public_temp) / 'signed.apk'
            run([TOOLS / 'zipalign', '-P', '16', '-f', '4', unsigned, aligned])
            # PKCS12 key/store share one password; avoid consuming the same file twice.
            # DEVNULL makes any unexpected password prompt fail closed.
            run([TOOLS / 'apksigner', 'sign', '--ks', key, '--ks-type', 'PKCS12', '--ks-key-alias', ALIAS,
                 '--ks-pass', 'file:' + str(password),
                 '--debuggable-apk-permitted', 'false', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true',
                 '--v4-signing-enabled', 'false', '--out', signed, aligned], sensitive=True)
            result = verify(signed, unsigned, config)
            os.link(signed, output)  # Exclusive final output; never overwrite an earlier signed APK.
        receipt = ROOT / 'app/build/outputs/apk/release' / f"hushcross-{config['versionName']}-public-signing.json"
        receipt.write_text(json.dumps({**result, 'apkPath': str(output), 'credentialStorage': 'local managed identity outside the repository',
                                       'identityCreated': not key_exists, 'installed': False, 'published': False}, indent=2) + '\n')
        print(receipt.read_text(), end='')
    finally:
        lock.rmdir()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never echo subprocess stderr/stdout or credential contents on failure.
        print(json.dumps({'ok': False, 'stage': STAGE, 'errorType': type(error).__name__,
                          'message': str(error) if isinstance(error, RuntimeError) else 'Managed operation stopped; private details suppressed.'}), file=sys.stderr)
        sys.exit(1)
