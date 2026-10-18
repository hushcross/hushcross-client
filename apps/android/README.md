# HushCross Android TWA shell

This shell opens `https://hushcross.fun` in a supporting browser as a Trusted Web Activity. It is not an embedded WebView or an independent native wallet. The browser owns the website-origin storage; an APK hash does not freeze future website content.

Package: `fun.hushcross.app`. Version: `0.1.0`, versionCode `1`. Minimum Android API: `28`; compile/target API: `36`.

## Build prerequisites

Use JDK 21, Gradle 8.14.3, Android SDK API 36 and Build Tools 35.0.0. Android Gradle Plugin 8.13.0 and Android Browser Helper 2.7.4 are pinned. Node.js is needed for the build/resource helpers; Python 3 is needed only for the optional managed-signing helper. System toolchains are not included or installed automatically.

On macOS the unsigned-build helper can locate Android Studio's bundled JDK, the usual SDK location and an existing cached Gradle distribution. Otherwise set `JAVA_HOME`, `ANDROID_HOME` and `HUSHCROSS_GRADLE_BIN` to your existing installations.

```sh
node scripts/check-config.mjs
node scripts/build-unsigned.mjs
```

Resolution is offline by default. To retrieve the declared fixed Maven dependencies from Google Maven and Maven Central, use:

```sh
node scripts/build-unsigned.mjs --resolve-dependencies
```

Outputs are `app/build/outputs/apk/release/app-release-unsigned.apk` and `app/build/outputs/bundle/release/app-release.aab`. These are unsigned. The helper does not install, sign or publish them; debug tasks and automatic SDK installation are disabled.

## Branding and resource verification

The canonical mark is `../web/src/assets/brand/hushcross-mark.png`, a 1254 × 1254 RGBA PNG with SHA-256 `e6bc955a95a511101ffa9161854018e25769b92dd50bdd5128ce0a3269f631a3`. The generator copies its bytes without tracing, trimming or editing pixels:

```sh
node scripts/generate-icons.mjs --check
```

`icon-source.json` records the native layout and output hashes. The alpha is tinted indigo over paper, with a monochrome variant for system theming. Visible strokes with alpha ≥ 8 fit the configured safe circle; faint lower-alpha noise is preserved and may be clipped by launcher masks. This is not a guarantee for every pixel under every launcher.

## Signing your own build

Android installation and in-place updates depend on a signing identity. A self-built APK signed with another identity is not an official update and cannot normally replace an installed release with a different signer. Back up recovery material before making any installation changes involving a funded account.

Two optional helpers are included; neither is run by the client/Web/extension build:

- `bash scripts/sign-release-owner.sh`: interactive APK signing, with `--bundle` for an additional AAB. Password prompts stay in your terminal; it supports existing `JAVA_HOME` and `ANDROID_HOME` tool locations.
- `python3 scripts/sign-release-managed.py`: local APK identity/password generation and retention, using its reviewed macOS Android Studio/SDK paths. Review those paths and `release-signing.json` before using it on another system or a new unsigned build. `--verify-only` inspects an existing public signed APK without entering the credential directory.

The managed helper requires the unsigned baseline hash in `release-signing.json`; a different self-built baseline must be reviewed and that public metadata updated deliberately. Do not replace a long-term identity just because a new build hash differs. Its generated key and password remain under your home directory, outside the source tree, with restrictive permissions. Keep secure backups, never upload credentials, and do not record password prompts or enable shell tracing. These source files contain no release private key or password.

Signing establishes package identity, not wallet safety, store approval or completion of device testing. An AAB is not directly installable.

## Website association and runtime behavior

The website must serve `/.well-known/assetlinks.json` for the real installed app-signing certificate and package over HTTPS. This source contains the release's public certificate metadata, not its private identity. If you change the origin, package or certificate, use your own correct association. A failed association must retain browser-origin UI; do not bypass validation to hide it. No WebView fallback or extra trusted origins are configured.

The TWA follows the website's deployed mode and service availability. WebAuthn support alone does not establish PRF support for decrypting a Passkey-protected vault. Verify on actual devices: origin association, installation/update behavior, locking, password/PRF support, local proof generation, encrypted backup/recovery, and network/offline behavior. An offline shell must not imply fresh balances or a successful transaction.

See [third-party dependencies and provenance](THIRD_PARTY_NOTICES.md). Bubblewrap v1.27.0 templates were a reference; this project is hand-authored and does not require running its CLI or accepting a toolchain-install prompt.
