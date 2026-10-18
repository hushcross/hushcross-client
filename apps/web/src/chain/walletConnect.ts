import { getAddress, isAddress, toHex } from 'viem';
import { DataSourceError } from '../data/DataSource';
import type { Eip1193Provider } from './wallet';

const METHODS = ['eth_sendTransaction', 'personal_sign'];
const CONNECT_TIMEOUT_MS = 120_000;
const CANCELLED = () => new DataSourceError('wallet_required', 'wallet connection cancelled');

export interface WalletConnectSession {
  readonly topic: string;
  readonly expiry: number;
  readonly transportType?: string;
  readonly namespaces: Readonly<Record<string, { readonly accounts: readonly string[]; readonly methods: readonly string[] }>>;
}

interface ConnectOptions {
  readonly optionalNamespaces: { readonly eip155: { readonly chains: string[]; readonly methods: string[]; readonly events: string[]; readonly rpcMap: Record<string, string> } };
}

/** Narrow, testable dapp boundary. No signing keys, auth, wallet-side responses or arbitrary RPC. */
export interface WalletConnectSdk {
  readonly session: WalletConnectSession | undefined;
  connect(options: ConnectOptions): Promise<WalletConnectSession | undefined>;
  request(args: { method: string; params?: unknown[] }, chain: string, expiry: number): Promise<unknown>;
  disconnect(): Promise<void>;
  cancelPairing(): Promise<void>;
  close(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WalletConnectConfig {
  readonly projectId: string;
  readonly chainId: number;
  readonly rpcUrl: string;
}

export interface PairingState {
  readonly phase: 'idle' | 'connecting' | 'pairing' | 'cancelling' | 'connected' | 'error';
  /** Pairing secret: render locally only; never persist, log, or put in our page URL. */
  readonly uri: string | null;
  readonly error: 'network' | 'unsupported' | 'cleanup' | null;
}

export type WalletConnectLoader = (config: WalletConnectConfig) => Promise<WalletConnectSdk>;

/** Isolated, volatile SDK storage. Refreshing the page requires connecting again. */
export function createWalletConnectMemoryStorage() {
  const values = new Map<string, unknown>();
  return {
    async getKeys(): Promise<string[]> { return [...values.keys()]; },
    async getEntries<T>(): Promise<[string, T][]> { return [...values.entries()] as [string, T][]; },
    async getItem<T>(key: string): Promise<T | undefined> { return values.get(key) as T | undefined; },
    async setItem<T>(key: string, value: T): Promise<void> { values.set(key, value); },
    async removeItem(key: string): Promise<void> { values.delete(key); },
  };
}

/** Bundled SDK loaded only after choosing WalletConnect. Its Verify attestation iframe is separate from our local QR UI. */
export const loadWalletConnectSdk: WalletConnectLoader = async (config) => {
  const { default: UniversalProvider } = await import('@walletconnect/universal-provider');
  const provider = await UniversalProvider.init({
    projectId: config.projectId,
    name: 'HushCross',
    metadata: { name: 'HushCross', description: 'HushCross self-custodial privacy tools', url: 'https://hushcross.fun', icons: [] },
    relayUrl: 'wss://relay.walletconnect.org',
    logger: 'silent',
    telemetryEnabled: false,
    disableProviderPing: true,
    storage: createWalletConnectMemoryStorage(),
    customStoragePrefix: `hushcross-${crypto.randomUUID()}`,
  });
  return {
    get session() { return provider.session; },
    connect: (options) => provider.connect(options),
    request: (args, chain, expiry) => provider.request(args, chain, expiry),
    disconnect: () => provider.disconnect(),
    async cancelPairing() {
      // 2.21.8 abortPairingAttempt() is a no-op. Expiry rejects its pending approval promise.
      for (const proposal of provider.client.proposal.getAll()) provider.client.core.expirer.set(proposal.id, 0);
      await provider.cleanupPendingPairings({ deletePairings: true });
    },
    async close() {
      provider.client.core.heartbeat.stop();
      await provider.client.core.relayer.transportClose();
    },
    on: (event, listener) => provider.on(event, listener),
    removeListener: (event, listener) => provider.removeListener(event, listener),
  };
};

/** Only accept the v2 relay URI format. Pairing keys never become app navigation state. */
export function isWalletConnectUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1024 || !/^wc:[0-9a-f]{64}@2\?/i.test(value)) return false;
  const params = new URLSearchParams(value.slice(value.indexOf('?') + 1));
  return params.getAll('relay-protocol').length === 1 && params.getAll('symKey').length === 1 && params.get('relay-protocol') === 'irn' && /^[0-9a-f]{64}$/i.test(params.get('symKey') ?? '');
}

/** Official HTTPS universal link; opened only by a user clicking the local QR dialog. */
export function walletConnectTrustWalletLink(uri: string): string | null {
  return isWalletConnectUri(uri) ? `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}` : null;
}

/** One live pairing/session. Cancellation never starts a second SDK attempt behind the first. */
export class WalletConnectProvider implements Eip1193Provider {
  private sdk: WalletConnectSdk | null = null;
  private loading: Promise<WalletConnectSdk> | null = null;
  private flight: Promise<readonly string[]> | null = null;
  private generation = 0;
  private pairingCancelled = false;
  private connectionResult: Promise<readonly string[]> | null = null;
  private disposed = false;
  private cleanupFailed = false;
  private signing = false;
  private disconnectAfterRequest = false;
  private cleaning: Promise<void> | null = null;
  private cleanAgain = false;
  private closeRequested = false;
  private address: string | null = null;
  private chainId: number | null = null;
  private topic: string | null = null;
  private cancelWait: (() => void) | null = null;
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private readonly subscribers = new Set<() => void>();
  private readonly sdkListeners: [string, (...args: unknown[]) => void][] = [];
  private state: PairingState = { phase: 'idle', uri: null, error: null };

  constructor(private readonly config: WalletConnectConfig, private readonly loader: WalletConnectLoader = loadWalletConnectSdk) {}

  getState = (): PairingState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.subscribers.add(listener); return () => this.subscribers.delete(listener); };
  on(event: string, listener: (...args: unknown[]) => void): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
  }
  removeListener(event: string, listener: (...args: unknown[]) => void): void { this.listeners.get(event)?.delete(listener); }

  async request({ method, params }: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown> {
    if (this.disposed || this.cleanupFailed || this.disconnectAfterRequest) throw new DataSourceError('wallet_required');
    if (method === 'eth_requestAccounts') return this.connect();
    if (method === 'eth_accounts') return this.address ? [this.address] : [];
    if (method === 'eth_chainId') return this.chainId === null ? null : toHex(this.chainId);
    if (!METHODS.includes(method)) throw new DataSourceError('wrong_network', 'method unavailable for this WalletConnect session');
    if (!this.sdk || !this.address || !this.topic || this.sdk.session?.topic !== this.topic) throw new DataSourceError('wallet_required');
    if (this.chainId !== this.config.chainId) throw new DataSourceError('wrong_network');
    if (this.signing) throw new DataSourceError('network', 'a wallet request is already pending; do not resubmit');
    const accounts = this.sessionAccounts(this.sdk.session);
    if (!accounts.includes(this.address)) throw new DataSourceError('wallet_required');
    const from = method === 'personal_sign' ? params?.[1] : (params?.[0] as { from?: unknown } | undefined)?.from;
    if (typeof from !== 'string' || from.toLowerCase() !== this.address.toLowerCase()) throw new DataSourceError('wallet_required');
    this.signing = true;
    try {
      // One SDK request only. An expiry/network failure is not permission to resend a transaction.
      return await this.sdk.request({ method, params: params ? [...params] : [] }, `eip155:${this.config.chainId}`, 300);
    } catch {
      // SDK transport errors can contain payloads; expose only a stable, non-sensitive error.
      throw new DataSourceError('network', 'wallet response not confirmed; check the wallet history before retrying');
    } finally {
      this.signing = false;
      if (this.disposed || this.disconnectAfterRequest) {
        // Deliver an already received hash before network-dependent cleanup finishes.
        // Keep the disconnect gate until cleanup settles; cleanup failures remain fail-closed.
        void this.cleanup(this.disposed).then(() => { this.disconnectAfterRequest = false; });
      }
    }
  }

  cancelConnection(): void {
    if (!this.flight || this.state.phase === 'cancelling') return;
    this.generation += 1;
    this.pairingCancelled = true;
    this.update({ phase: 'cancelling', uri: null, error: null });
    this.cancelWait?.();
    void this.cleanup(false);
  }

  disconnect(): void {
    this.cancelConnection();
    this.invalidate();
    this.disconnectAfterRequest = this.signing;
    if (!this.signing) void this.cleanup(false);
  }

  /** Detach immediately, but do not interrupt a potentially broadcast transaction's response. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelConnection();
    this.address = null;
    this.topic = null;
    this.chainId = null;
    this.update({ phase: 'idle', uri: null, error: null });
    this.emit('disconnect');
    if (!this.signing) void this.cleanup(true);
  }

  private connect(): Promise<readonly string[]> {
    if (this.cleaning || this.disconnectAfterRequest) return Promise.reject(CANCELLED());
    if (this.flight) return this.pairingCancelled ? Promise.reject(CANCELLED()) : this.connectionResult ?? this.flight;
    if (this.address && this.sdk?.session?.topic === this.topic) return Promise.resolve([this.address]);
    const generation = ++this.generation;
    this.pairingCancelled = false;
    this.update({ phase: 'connecting', uri: null, error: null });
    let rejectCancel: (error: Error) => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => { rejectCancel = reject; });
    this.cancelWait = () => rejectCancel(CANCELLED());
    const timer = setTimeout(() => this.cancelConnection(), CONNECT_TIMEOUT_MS);
    const work = this.open(generation).finally(() => {
      clearTimeout(timer);
      this.flight = null;
      this.connectionResult = null;
      this.cancelWait = null;
      if (this.state.phase === 'cancelling' && !this.cleanupFailed) this.update({ phase: 'idle', uri: null, error: null });
    });
    // The caller can close immediately, but the single-flight gate lasts until SDK cleanup/approval settles.
    this.flight = work;
    this.connectionResult = Promise.race([work, cancelled]);
    return this.connectionResult;
  }

  private async open(generation: number): Promise<readonly string[]> {
    try {
      this.loading ??= this.loader(this.config).catch((error: unknown) => { this.loading = null; throw error; });
      const sdk = await this.loading;
      if (!this.sdk) { this.sdk = sdk; this.attach(sdk); }
      if (generation !== this.generation || this.disposed) { await this.cleanup(this.disposed); throw CANCELLED(); }
      if (sdk.session) await this.cleanup(false);
      if (this.cleanupFailed || generation !== this.generation || this.disposed) throw CANCELLED();
      const session = await sdk.connect({ optionalNamespaces: { eip155: { chains: [`eip155:${this.config.chainId}`], methods: [...METHODS], events: ['accountsChanged', 'chainChanged'], rpcMap: { [this.config.chainId]: this.config.rpcUrl } } } });
      if (generation !== this.generation || this.disposed) { await this.cleanup(this.disposed); throw CANCELLED(); }
      if (!session) throw new DataSourceError('wallet_required');
      const accounts = this.sessionAccounts(session);
      const first = accounts[0];
      if (!first) throw new DataSourceError('wallet_required', 'wallet did not approve the requested chain and methods');
      this.address = first;
      this.topic = session.topic;
      this.chainId = this.config.chainId;
      this.update({ phase: 'connected', uri: null, error: null });
      return [first];
    } catch (error: unknown) {
      await this.cleanup(this.disposed);
      if (generation === this.generation && !this.disposed) this.update({ phase: 'error', uri: null, error: this.cleanupFailed ? 'cleanup' : 'network' });
      // Avoid surfacing SDK errors that may contain a pairing URI or transport payload.
      throw generation !== this.generation || this.disposed ? CANCELLED() : new DataSourceError('network', 'wallet connection failed');
    }
  }

  private sessionAccounts(session: WalletConnectSession): string[] {
    if (typeof session.topic !== 'string' || !session.topic || !Number.isFinite(session.expiry) || session.expiry * 1000 <= Date.now() || (session.transportType !== undefined && session.transportType !== 'relay')) return [];
    const scope = `eip155:${this.config.chainId}`;
    const ns = session.namespaces.eip155 ?? session.namespaces[scope];
    if (!ns || !Array.isArray(ns.accounts) || !Array.isArray(ns.methods) || METHODS.some((method) => !ns.methods.includes(method))) return [];
    return ns.accounts.filter((account) => typeof account === 'string' && account.startsWith(`${scope}:`)).map((account) => account.slice(scope.length + 1)).filter((account) => isAddress(account, { strict: false })).map((account) => getAddress(account));
  }

  private attach(sdk: WalletConnectSdk): void {
    const on = (event: string, listener: (...args: unknown[]) => void): void => { sdk.on(event, listener); this.sdkListeners.push([event, listener]); };
    on('display_uri', (uri) => {
      if (this.state.phase === 'cancelling' || this.disposed) { void this.cleanup(this.disposed); return; }
      if (!isWalletConnectUri(uri)) { this.cancelConnection(); return; }
      this.update({ phase: 'pairing', uri, error: null });
    });
    on('accountsChanged', (value) => {
      if (!this.topic || !sdk.session || sdk.session.topic !== this.topic) return;
      const approved = this.sessionAccounts(sdk.session);
      const first = Array.isArray(value) ? value[0] : null;
      this.address = typeof first === 'string' && isAddress(first, { strict: false }) && approved.includes(getAddress(first)) ? getAddress(first) : null;
      this.emit('accountsChanged', this.address ? [this.address] : []);
    });
    on('chainChanged', (value) => {
      if (!this.topic) return;
      this.chainId = typeof value === 'number' || typeof value === 'string' ? Number(value) : null;
      this.emit('chainChanged', this.chainId);
    });
    on('session_update', () => {
      if (sdk.session?.topic !== this.topic || !this.address || !this.sessionAccounts(sdk.session).includes(this.address)) this.invalidate();
    });
    on('disconnect', () => this.invalidate());
  }

  private invalidate(): void {
    this.address = null;
    this.topic = null;
    this.chainId = null;
    this.update({ phase: 'idle', uri: null, error: null });
    this.emit('disconnect');
  }

  private cleanup(close: boolean): Promise<void> {
    this.cleanAgain = true;
    this.closeRequested ||= close;
    if (this.cleaning) return this.cleaning;
    const run = async (): Promise<void> => {
      do {
        this.cleanAgain = false;
        const sdk = this.sdk;
        if (!sdk) continue;
        try {
          await sdk.cancelPairing();
          if (sdk.session) await sdk.disconnect();
        } catch {
          // Fail closed: do not create another session after an unconfirmed cleanup.
          this.cleanupFailed = true;
          if (!this.disposed) this.update({ phase: 'error', uri: null, error: 'cleanup' });
        } finally {
          if (this.closeRequested) {
            for (const [event, listener] of this.sdkListeners.splice(0)) sdk.removeListener(event, listener);
            try { await sdk.close(); } catch { this.cleanupFailed = true; }
          }
        }
      } while (this.cleanAgain);
    };
    this.cleaning = run().finally(() => { this.cleaning = null; });
    return this.cleaning;
  }

  private emit(event: string, ...args: unknown[]): void { for (const listener of this.listeners.get(event) ?? []) listener(...args); }
  private update(state: PairingState): void { this.state = state; for (const listener of this.subscribers) listener(); }
}
