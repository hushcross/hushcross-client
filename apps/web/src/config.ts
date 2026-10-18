/**
 * Runtime configuration from Vite env variables. The default data source stays `mock`
 * until the lead flips VITE_DATA_SOURCE to `chain`.
 */
export type DataSourceKind = 'mock' | 'chain';

export interface AppConfig {
  readonly dataSource: DataSourceKind;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly relayUrl: string;
  readonly screenUrl: string;
  readonly indexerUrl: string;
  /** Sale profile host (services/meta). */
  readonly metaUrl: string;
  /** URL of contracts/deployments/<chainId>.json, or null when embedded JSON is used. */
  readonly deploymentsUrl: string | null;
  /** Inline deployments JSON (VITE_DEPLOYMENTS_JSON), used when no URL is set. */
  readonly deploymentsJson: string | null;
  /** Base URL that serves zk/ (prover script and circuit files). */
  readonly assetBase: string;
  readonly idleLockMinutes: number;
  /** Public source repository (VITE_GITHUB_URL). */
  readonly githubUrl: string;
  /** X profile (VITE_X_URL); empty until the account exists, which shows the X mark as "coming soon". */
  readonly xUrl: string;
  /** Public Reown project identifier. Empty configuration disables WalletConnect. */
  readonly walletConnectProjectId: string | null;
}

export const DEFAULT_GITHUB_URL = 'https://github.com/hushcross/hushcross-protocol';

export type EnvRecord = Readonly<Record<string, string | boolean | undefined>>;

/** Only absolute https links are used for outbound social links. */
const httpsUrl = (value: string | undefined): string | undefined => (value && /^https:\/\/[^\s]+$/i.test(value) ? value : undefined);

const text = (env: EnvRecord, key: string): string | undefined => {
  const value = env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

export function readConfig(env: EnvRecord): AppConfig {
  const dataSource: DataSourceKind = text(env, 'VITE_DATA_SOURCE') === 'chain' ? 'chain' : 'mock';
  const chainId = Number(text(env, 'VITE_CHAIN_ID') ?? '56');
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error('VITE_CHAIN_ID must be a positive integer');
  const walletConnectProjectId = text(env, 'VITE_WALLETCONNECT_PROJECT_ID') ?? null;
  if (walletConnectProjectId !== null && !/^[0-9a-f]{32}$/i.test(walletConnectProjectId)) throw new Error('VITE_WALLETCONNECT_PROJECT_ID must be a 32-character public project identifier');
  const idle = Number(text(env, 'VITE_IDLE_LOCK_MINUTES') ?? '15');
  return {
    dataSource,
    chainId,
    walletConnectProjectId,
    rpcUrl: text(env, 'VITE_RPC_URL') ?? (chainId === 56 ? 'https://bsc-dataseed.bnbchain.org' : 'http://127.0.0.1:8545'),
    relayUrl: text(env, 'VITE_RELAY_URL') ?? 'http://127.0.0.1:8788',
    screenUrl: text(env, 'VITE_SCREEN_URL') ?? 'http://127.0.0.1:8787',
    indexerUrl: text(env, 'VITE_INDEXER_URL') ?? 'http://127.0.0.1:8789',
    metaUrl: text(env, 'VITE_META_URL') ?? 'http://127.0.0.1:8790',
    deploymentsUrl: text(env, 'VITE_DEPLOYMENTS_URL') ?? null,
    deploymentsJson: text(env, 'VITE_DEPLOYMENTS_JSON') ?? null,
    assetBase: text(env, 'VITE_ASSET_BASE') ?? '/',
    idleLockMinutes: Number.isFinite(idle) && idle >= 1 ? Math.min(240, Math.round(idle)) : 15,
    githubUrl: httpsUrl(text(env, 'VITE_GITHUB_URL')) ?? DEFAULT_GITHUB_URL,
    xUrl: httpsUrl(text(env, 'VITE_X_URL')) ?? '',
  };
}

export const appConfig: AppConfig = readConfig(import.meta.env as unknown as EnvRecord);
