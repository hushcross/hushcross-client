import { IndexerClient, MetaClient, RelayClient, ScreenClient, loadDeployments, type BytesFetch, type Deployments, type FetchLike, type JobStore } from '@hushcross/core';
import { vaultJobStore } from '../simple/jobs/jobStore';
import { AccountManager, browserStore } from '../account/AccountManager';
import { browserPasskeys } from '../account/passkey';
import type { AppConfig } from '../config';
import type { DataSource } from '../data/DataSource';
import { createZkLoader } from '../zk/loadProver';
import { createExtensionZkLoader, cancelExtensionProofs } from '../zk/extensionProver';
import { ChainDataSource } from './ChainDataSource';
import { composeDataSource } from './ComposedDataSource';
import { createViemMarketsPort } from './viemMarkets';
import { chainFor, createViemChainPort } from './viemPort';
import { WalletController } from './wallet';

export interface ChainRuntime {
  readonly source: DataSource;
  /** Releases discovery, event subscriptions and the external-wallet session. */
  readonly dispose: () => void;
  readonly chainSource: ChainDataSource;
  readonly manager: AccountManager;
  readonly wallet: WalletController;
  readonly deployments: Deployments;
  /** One-step jobs, sealed inside the vault. */
  readonly jobStore: JobStore;
  /** Fires on vault lock / unlock so the job runner pauses and reloads. */
  readonly subscribeJobStore: (listener: () => void) => () => void;
}

export const browserFetch: FetchLike = (url, init) =>
  fetch(url, { method: init?.method ?? 'GET', ...(init?.headers ? { headers: init.headers } : {}), ...(init?.body === undefined ? {} : { body: init.body }), credentials: 'omit', referrerPolicy: 'no-referrer' });

/** Byte-level fetch for the profile host (documents and logos are verified by hash). */
export const browserBytesFetch: BytesFetch = (url, init) =>
  fetch(url, { method: init?.method ?? 'GET', ...(init?.headers ? { headers: init.headers } : {}), ...(init?.body === undefined ? {} : { body: init.body }), credentials: 'omit', referrerPolicy: 'no-referrer' });

export async function loadAppDeployments(config: AppConfig, fetchLike: FetchLike = browserFetch): Promise<Deployments> {
  if (config.deploymentsUrl) return loadDeployments({ url: config.deploymentsUrl, fetch: fetchLike, expectedChainId: config.chainId });
  if (config.deploymentsJson) return loadDeployments({ json: config.deploymentsJson, expectedChainId: config.chainId });
  throw new Error('set VITE_DEPLOYMENTS_URL or VITE_DEPLOYMENTS_JSON');
}

/** Wire the real data source for the browser: viem RPC, EIP-6963 wallet, services, passkey vault. */
export async function createChainRuntime(config: AppConfig): Promise<ChainRuntime> {
  const deployments = await loadAppDeployments(config);
  const extension = import.meta.env.VITE_APP_TARGET === 'extension';
  const manager = new AccountManager(browserStore(), extension ? null : browserPasskeys());
  const cleanups: (() => void)[] = [];
  if (extension) {
    cleanups.push(manager.subscribe(() => { if (manager.status() !== 'unlocked') cancelExtensionProofs(); }));
    const onPageHide = (): void => { manager.lock(); };
    const onVisibility = (): void => { if (document.hidden) manager.lock(); };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => window.removeEventListener('pagehide', onPageHide), () => document.removeEventListener('visibilitychange', onVisibility));
  }
  const chain = chainFor(config.chainId, config.rpcUrl);
  const wallet = new WalletController({ chainId: config.chainId, chainName: chain.name, rpcUrl: config.rpcUrl, explorerUrl: chain.blockExplorers?.default.url ?? null }, window,
    config.walletConnectProjectId ? { config: { projectId: config.walletConnectProjectId, chainId: config.chainId, rpcUrl: config.rpcUrl } } : undefined);
  wallet.discover();
  const chainSource = new ChainDataSource({
    chainId: config.chainId,
    deployments,
    chain: createViemChainPort({ chainId: config.chainId, rpcUrl: config.rpcUrl }),
    markets: createViemMarketsPort({ chainId: config.chainId, rpcUrl: config.rpcUrl }),
    wallet,
    services: {
      relay: new RelayClient(config.relayUrl, browserFetch),
      screen: new ScreenClient(config.screenUrl, browserFetch),
      indexer: new IndexerClient(config.indexerUrl, browserFetch),
      meta: new MetaClient(config.metaUrl, browserBytesFetch),
    },
    zk: extension ? createExtensionZkLoader() : createZkLoader({ baseUrl: config.assetBase }),
    session: manager,
    passkeySupported: () => manager.passkeySupported(),
    exportBackupFile: async (protection, passphrase) => (protection === 'passkey' ? manager.exportPasskeyBackup() : manager.exportBackup(passphrase ?? '')),
  });
  const subscribeJobStore = (listener: () => void): (() => void) => {
    let unlocked = manager.status() === 'unlocked';
    return manager.subscribe(() => {
      const now = manager.status() === 'unlocked';
      if (now !== unlocked) {
        unlocked = now;
        listener();
      }
    });
  };
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    manager.lock();
    for (const cleanup of cleanups) cleanup();
    wallet.dispose();
    if (extension) cancelExtensionProofs();
  };
  return { dispose, source: composeDataSource(chainSource), chainSource, manager, wallet, deployments, jobStore: vaultJobStore(manager), subscribeJobStore };
}
