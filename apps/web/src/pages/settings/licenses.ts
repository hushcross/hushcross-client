/** Third-party software and fonts shipped in the web bundle. */
export interface LicenseEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly url: string;
}

export const LICENSES: readonly LicenseEntry[] = [
  { name: 'HushCross client', version: '0.1.0', license: 'GPL-3.0-or-later', url: 'https://github.com/hushcross/hushcross-client' },
  { name: 'Complete third-party notices', version: '0.1.0', license: 'Original component licenses', url: 'https://github.com/hushcross/hushcross-client/blob/v0.1.0/THIRD-PARTY-NOTICES.md' },
  { name: 'React', version: '18.3.1', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'React DOM', version: '18.3.1', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'scheduler', version: '0.23.2', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'React Router', version: '7.18.4', license: 'MIT', url: 'https://github.com/remix-run/react-router' },
  { name: 'cookie', version: '1.1.1', license: 'MIT', url: 'https://github.com/jshttp/cookie' },
  { name: 'set-cookie-parser', version: '2.7.2', license: 'MIT', url: 'https://github.com/nfriedly/set-cookie-parser' },
  { name: 'node-qrcode', version: '1.5.4', license: 'MIT', url: 'https://github.com/soldair/node-qrcode' },
  { name: 'dijkstrajs', version: '1.0.3', license: 'MIT', url: 'https://github.com/tcort/dijkstrajs' },
  { name: '@walletconnect/universal-provider', version: '2.21.8', license: 'Apache-2.0', url: 'https://github.com/WalletConnect/walletconnect-monorepo' },
  { name: 'viem', version: '2.57.7', license: 'MIT', url: 'https://github.com/wevm/viem' },
  { name: 'ox', version: '0.14.56', license: 'MIT', url: 'https://github.com/wevm/ox' },
  { name: 'abitype', version: '1.2.3', license: 'MIT', url: 'https://github.com/wevm/abitype' },
  { name: '@noble/curves', version: '2.4.0 / 1.9.1', license: 'MIT', url: 'https://github.com/paulmillr/noble-curves' },
  { name: '@noble/hashes', version: '2.4.0 / 1.8.0', license: 'MIT', url: 'https://github.com/paulmillr/noble-hashes' },
  { name: '@scure/bip39', version: '2.4.0 / 1.6.0', license: 'MIT', url: 'https://github.com/paulmillr/scure-bip39' },
  { name: '@scure/bip32', version: '1.7.0', license: 'MIT', url: 'https://github.com/paulmillr/scure-bip32' },
  { name: '@scure/base', version: '1.2.6', license: 'MIT', url: 'https://github.com/paulmillr/scure-base' },
  { name: '@adraffy/ens-normalize', version: '1.11.1', license: 'MIT', url: 'https://github.com/adraffy/ens-normalize.js' },
  { name: 'poseidon-lite', version: '0.3.0', license: 'MIT', url: 'https://github.com/vimwitch/poseidon-lite' },
  { name: '@zk-kit/lean-imt', version: '2.2.5', license: 'MIT', url: 'https://github.com/privacy-scaling-explorations/zk-kit' },
  { name: '@zk-kit/utils', version: '1.4.1', license: 'MIT', url: 'https://github.com/privacy-scaling-explorations/zk-kit' },
  { name: 'Privacy Pools circuits v1.3.0 (wasm, zkey, vkey)', version: 'c312dcd', license: 'Apache-2.0', url: 'https://github.com/0xbow-io/privacy-pools-core' },
  { name: 'snarkjs (local prover; separately loaded JavaScript)', version: '0.7.5', license: 'GPL-3.0', url: 'https://github.com/iden3/snarkjs' },
  { name: 'Inter', version: '4 (Fontsource 5.3.0)', license: 'SIL OFL 1.1', url: '/fonts/OFL-Inter.txt' },
  { name: 'Instrument Serif', version: 'Fontsource 5.3.0', license: 'SIL OFL 1.1', url: '/fonts/OFL-InstrumentSerif.txt' },
  { name: 'JetBrains Mono', version: 'Fontsource 5.3.0', license: 'SIL OFL 1.1', url: '/fonts/OFL-JetBrainsMono.txt' },
];
