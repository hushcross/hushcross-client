# HushCross client

HushCross provides an encrypted local account and privacy-pool tools for BNB Chain. This repository contains the Web/PWA interface, the independent Manifest V3 extension, the browser-reachable core library, and the Android Trusted Web Activity shell. Server implementations, first-party protocol contracts, credentials, wallet data and signing identities are not included.

## License and source

The first-party client, included browser library and client build files are **GPL-3.0-or-later**. See [LICENSE](LICENSE), [license scope](LICENSE-SCOPE.md) and [third-party notices](THIRD-PARTY-NOTICES.md). Third-party components retain their original copyright notices and license choices; this does not relicense the protocol contracts or server code.

`SOURCE-MANIFEST.json` lists the distributed source files with sizes and SHA-256 hashes. The original image-model logo PNG is included unchanged; the SVG assets wrap that PNG rather than claiming to be hand-drawn vectors.

## Web/PWA and extension prerequisites

Use Node.js 22.12 or newer and npm. Vite 6.4.4 and TypeScript 5.9.3 are pinned in the client-only lockfile. Install dependencies without package lifecycle scripts:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
```

The three npm workspaces are `packages/core`, `apps/web` and `apps/extension`. No server or clearing-service workspace is required. A populated npm cache can be used with `npm ci --offline --ignore-scripts`; otherwise the lockfile resolves its exact versions and integrity-checked archives from the public npm registry.

### Web/PWA

```sh
npm run build
```

This builds the browser core and the Web/PWA output in `apps/web/dist`. Without explicit configuration the web app defaults to demonstration data. To build against the public chain-56 services, set the following non-secret configuration in your terminal:

```sh
VITE_DATA_SOURCE=chain \
VITE_CHAIN_ID=56 \
VITE_RPC_URL=https://rpc.hushcross.fun/public \
VITE_RELAY_URL=https://relay.hushcross.fun \
VITE_SCREEN_URL=https://screen.hushcross.fun \
VITE_INDEXER_URL=https://indexer.hushcross.fun \
VITE_META_URL=https://meta.hushcross.fun \
VITE_DEPLOYMENTS_URL=/deployments/56.json \
VITE_ASSET_BASE=/ \
npm run build
```

The same public settings are recorded in `BUILD-CONFIG.example.json`. To enable WalletConnect on the web, also supply your own approved public project identifier as `VITE_WALLETCONNECT_PROJECT_ID`; no provider project identifier value is included in this source tree. If it is omitted, the optional transport is disabled.

For a local preview after building:

```sh
npm run preview -w @hushcross/web
```

PWA installation requires a supporting browser and a suitable secure origin. The service worker caches the permitted static application/proof resources, not API/RPC balances or metadata responses. Updates are applied through the app's explicit update action; an offline shell does not establish fresh account state.

### Browser extension

The published HushCross extension is available in the [Chrome Web Store](https://chromewebstore.google.com/detail/hushcross/jbbbihekbjmjkciailegmcjkdkaaapmm).

```sh
HUSHCROSS_WALLETCONNECT_PROJECT_ID="<YOUR_APPROVED_PUBLIC_PROJECT_ID>" \
npm run build:extension
```

The extension fixes chain 56 and the public endpoints in `apps/extension/vite.config.ts`. The build requires a correctly formatted public WalletConnect project identifier; replace the placeholder with your own. Load `apps/extension/dist` as an unpacked extension in an isolated test browser profile, or package that built directory through your distribution workflow. Do not package the source tree, dependencies or local test profiles as the extension.

The toolbar action opens the extension's own full page. It does not inject a wallet provider or content script into websites. Its local account store is separate from the website. Packaged static workers generate and verify proofs locally. WalletConnect is loaded only after the user chooses it; its official relay and separate Verify iframe have their own network/data boundaries.

A self-built or store-issued extension can have a different origin. Supplying a project identifier does not establish that WalletConnect or every service accepts that origin. Configure your project and verify precise allowed origins separately; do not replace origin restrictions with a wildcard. When changing service endpoints, review both the build configuration and manifest host/CSP entries. Builds do not publish a website or submit a store listing.

## Fixed proof resources and rebuilding upstream components

The client uses the six public proving files in `packages/core/artifacts`, pinned by [their manifest](packages/core/artifacts/MANIFEST.json). The browser runtime `third-party/runtime/snarkjs-0.7.5.min.js` is the supplied snarkjs 0.7.5 release file. `apps/web/scripts/vendor-zk.mjs`, the PWA build and the extension build verify recorded hashes before using these assets. The copied `apps/web/public/zk` directory is generated during a build and need not be present in a clean source checkout.

Corresponding preferred source, original notices and build inputs are included under [third-party/prover](third-party/prover/README.md). The standalone manifest/lock in `third-party/runtime` records an optional restoration path for the released snarkjs package. Restoring a runtime must reproduce its recorded SHA-256 before replacement; an install is not permission to accept changed bytes.

See [circuit source and includes](third-party/CIRCUIT-SOURCE.md) for the fixed circuit sources, circomlib closure and build-time include mapping. These independent upstream builds have their own tool requirements. The documented Circom-version discrepancy in the preserved upstream inputs must be resolved when rebuilding those circuits rather than silently editing their source. Normal client builds use the fixed public artifacts; they do not rerun a trusted-setup ceremony or claim that new parameters reproduce the deployed verifier.

## Android

The Android project is a TWA for `https://hushcross.fun`, not an embedded copy of the Web/PWA bundle or a native wallet engine. It follows the website's currently deployed code and service state. The browser handles website-origin storage; installing the APK does not migrate or back up the extension's local account.

The native build requires JDK 21, Gradle 8.14.3, Android SDK API 36 and Build Tools 35.0.0. Node.js runs its build/resource helpers; Python 3 is needed only for the optional managed-signing helper. No system SDK, signing key or password is supplied.

```sh
cd apps/android
node scripts/check-config.mjs
node scripts/build-unsigned.mjs
```

See the [Android build/signing guide](apps/android/README.md) for existing-toolchain locations, fixed Maven dependency restoration, signing your own build, and Digital Asset Links. Unsigned APKs are not installable release packages; a self-signed package does not normally replace an official installation signed with a different identity. AAB files are not directly installable. Never include a keystore or password in a source archive or support message.

The public download and certificate data are in `apps/web/src/releases/android.json` and `apps/web/public/.well-known/assetlinks.json`. The `published: false` flag means the APK download is still being prepared; leave it false while the release is draft or private. Set it to true only after the official download URL is publicly accessible and its APK hash and signing certificate have been verified. Verify the remote artifact, its digest and its actual signing certificate before installation. The TWA association must be served by the configured HTTPS site; including this JSON in a checkout does not establish that the remote website currently serves it. Do not bypass association validation to hide the browser origin UI.

### Hosting the official APK on the website

The source tree intentionally excludes APK binaries. Before building a deployment that serves `/downloads/hushcross-0.1.0.apk`, obtain the already-signed official APK from the verified official release (the `fallbackUrl` in `apps/web/src/releases/android.json`), verify its size, SHA-256 and signing certificate against that metadata and `apps/web/public/downloads/hushcross-0.1.0.apk.sha256`, then place it at `apps/web/public/downloads/hushcross-0.1.0.apk`. Keep the signed binary out of Git/source archives; do not rebuild or re-sign it merely to host the download. The portable Vercel configuration includes exact APK/checksum response headers, but source/build configuration alone does not prove that a deployed URL is live.

## Trust, privacy and recovery boundaries

Recovery material and account private keys are generated/imported and encrypted locally. An unlocked compromised device can still expose them. RPC, screening, relay, indexer and metadata providers can observe IP/connection information and the public request data needed for an operation. Relays see submitted transaction/recipient details; delegated-reveal encryption does not prevent the receiving relay from decrypting before public reveal. WalletConnect providers and external wallets have separate records and privacy practices.

Proofs hide a direct cryptographic link within an approved set, not every correlation through timing, amounts, recipients, address reuse or network metadata. Contract-owner powers, approved-set root decisions, service availability and contract correctness remain trust dependencies. Some contract-created redeposit notes do not have an emergency exit that bypasses screening.

Builds, local proof checks and package signatures are not an independent security audit or proof that a funded transaction completed. Check the actual wallet/chain state before retrying an unknown result. Before clearing local storage, changing an installation or uninstalling, preserve and verify your recovery phrase and encrypted backup. Deletion does not withdraw funds, cancel chain actions or erase public blockchain records.
