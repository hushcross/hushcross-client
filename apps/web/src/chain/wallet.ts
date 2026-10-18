import type { TxRequest } from '@hushcross/core';
import { getAddress, isAddress, toHex } from 'viem';
import { DataSourceError } from '../data/DataSource';
import type { Address, Hex } from '../data/types';
import { WalletConnectProvider, type PairingState, type WalletConnectConfig, type WalletConnectLoader } from './walletConnect';
import type { WalletPort } from './ports';

/** EIP-1193 provider surface we use. */
export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

/** EIP-6963 announcement payload. */
export interface WalletInfo {
  readonly uuid: string;
  readonly name: string;
  readonly icon: string;
  readonly rdns: string;
}

export interface WalletProviderDetail {
  readonly info: WalletInfo;
  readonly provider: Eip1193Provider;
}

export type WalletChooser = (wallets: readonly WalletProviderDetail[]) => Promise<WalletProviderDetail | null>;

export interface WalletState {
  readonly wallets: readonly WalletProviderDetail[];
  readonly address: Address | null;
  readonly walletName: string | null;
  /** Connected wallet's chain id, or null when unknown / not connected. */
  readonly chainId: number | null;
  readonly wrongNetwork: boolean;
  readonly walletConnect: PairingState | null;
}

interface ChainParams {
  readonly chainId: number;
  readonly chainName: string;
  readonly rpcUrl: string;
  readonly explorerUrl: string | null;
}

const ANNOUNCE = 'eip6963:announceProvider';
const REQUEST = 'eip6963:requestProvider';

function errorCode(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'number') return (error as { code: number }).code;
  return null;
}

/**
 * Injected wallets via EIP-6963 discovery (with a picker when several announce),
 * BSC chain checks plus an optional, lazily connected WalletConnect dapp transport.
 */
export class WalletController implements WalletPort {
  private wallets: WalletProviderDetail[] = [];
  private active: WalletProviderDetail | null = null;
  private address: Address | null = null;
  private chainId: number | null = null;
  private chooser: WalletChooser | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: WalletState;
  private readonly remote: WalletConnectProvider | null;
  private readonly remoteDetail: WalletProviderDetail | null;
  private remoteUnsubscribe: (() => void) | null = null;
  private discoveryCleanup: (() => void) | null = null;
  private providerCleanup: (() => void) | null = null;
  private connection: Promise<Address> | null = null;
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly params: ChainParams,
    private readonly target: EventTarget = window,
    remote?: { readonly config: WalletConnectConfig; readonly loader?: WalletConnectLoader },
  ) {
    this.remote = remote ? new WalletConnectProvider(remote.config, remote.loader) : null;
    this.remoteDetail = this.remote ? { info: { uuid: 'hushcross:walletconnect', name: 'WalletConnect', icon: '', rdns: 'com.walletconnect' }, provider: this.remote } : null;
    if (this.remote) this.remoteUnsubscribe = this.remote.subscribe(() => this.emit());
    this.snapshot = this.buildState();
  }

  /** Start listening for announcements and ask wallets to announce themselves. */
  discover(): () => void {
    if (this.discoveryCleanup) return this.discoveryCleanup;
    const onAnnounce = (event: Event): void => {
      const detail = (event as CustomEvent<WalletProviderDetail>).detail;
      if (this.disposed || !detail?.info?.uuid || detail.info.uuid === this.remoteDetail?.info.uuid || typeof detail.provider?.request !== 'function') return;
      if (this.wallets.some((w) => w.info.uuid === detail.info.uuid)) return;
      this.wallets = [...this.wallets, detail];
      this.emit();
    };
    this.target.addEventListener(ANNOUNCE, onAnnounce);
    this.target.dispatchEvent(new Event(REQUEST));
    this.discoveryCleanup = () => { this.target.removeEventListener(ANNOUNCE, onAnnounce); this.discoveryCleanup = null; };
    return this.discoveryCleanup;
  }

  setChooser(chooser: WalletChooser | null): void {
    this.chooser = chooser;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): WalletState {
    return this.snapshot;
  }

  getAddress(): Address | null {
    return this.address;
  }

  connect(): Promise<Address> {
    if (this.disposed) return Promise.reject(new DataSourceError('wallet_required'));
    if (this.connection) return this.connection;
    const generation = this.generation;
    this.connection = this.open(generation).finally(() => { this.connection = null; });
    return this.connection;
  }

  private async open(generation: number): Promise<Address> {
    const chosen = await this.pick();
    if (this.disposed || generation !== this.generation) throw new DataSourceError('wallet_required');
    const accounts = await chosen.provider.request({ method: 'eth_requestAccounts' });
    if (this.disposed || generation !== this.generation) throw new DataSourceError('wallet_required');
    const first = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof first !== 'string' || !isAddress(first, { strict: false })) throw new DataSourceError('wallet_required');
    this.attach(chosen);
    this.address = getAddress(first);
    await this.ensureChain();
    if (this.disposed || generation !== this.generation || !this.address) throw new DataSourceError('wallet_required');
    this.emit();
    return this.address;
  }

  cancelConnection(): void {
    this.generation += 1;
    this.remote?.cancelConnection();
  }

  /** Ask the wallet to switch to the configured chain, adding it first if the wallet does not know it. */
  async ensureChain(): Promise<void> {
    const provider = this.requireProvider();
    this.chainId = Number(await provider.request({ method: 'eth_chainId' }));
    if (this.chainId === this.params.chainId) return this.emit();
    const hexId = toHex(this.params.chainId);
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
    } catch (error: unknown) {
      if (errorCode(error) !== 4902) {
        this.emit();
        throw new DataSourceError('wrong_network');
      }
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hexId,
            chainName: this.params.chainName,
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: [this.params.rpcUrl],
            ...(this.params.explorerUrl ? { blockExplorerUrls: [this.params.explorerUrl] } : {}),
          },
        ],
      });
    }
    this.chainId = Number(await provider.request({ method: 'eth_chainId' }));
    this.emit();
    if (this.chainId !== this.params.chainId) throw new DataSourceError('wrong_network');
  }

  async sendTransaction(tx: TxRequest): Promise<Hex> {
    const provider = this.requireProvider();
    const address = this.address;
    if (!address) throw new DataSourceError('wallet_required');
    await this.ensureChain();
    if (this.address !== address || this.active?.provider !== provider) throw new DataSourceError('wallet_required');
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: address, to: tx.to, data: tx.data, value: toHex(tx.value), ...(tx.gas === undefined ? {} : { gas: toHex(tx.gas) }) }],
    });
    if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new DataSourceError('network', 'wallet returned no transaction hash');
    return hash as Hex;
  }

  async signMessage(message: string): Promise<Hex> {
    const provider = this.requireProvider();
    const address = this.address;
    if (!address) throw new DataSourceError('wallet_required');
    await this.ensureChain();
    if (this.address !== address || this.active?.provider !== provider) throw new DataSourceError('wallet_required');
    const signature = await provider.request({ method: 'personal_sign', params: [toHex(message), address] });
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130,}$/.test(signature)) throw new DataSourceError('network', 'wallet returned no signature');
    return signature as Hex;
  }

  disconnect(): void {
    this.cancelConnection();
    this.providerCleanup?.();
    this.remote?.disconnect();
    this.active = null;
    this.address = null;
    this.chainId = null;
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelConnection();
    this.discoveryCleanup?.();
    this.providerCleanup?.();
    this.remoteUnsubscribe?.();
    this.remote?.dispose();
    this.active = null;
    this.address = null;
    this.chainId = null;
    this.chooser = null;
    this.emit();
    this.listeners.clear();
  }

  private async pick(): Promise<WalletProviderDetail> {
    if (this.active) return this.active;
    const options = this.remoteDetail ? [...this.wallets, this.remoteDetail] : this.wallets;
    if (options.length === 1 && !this.remoteDetail) return options[0] as WalletProviderDetail;
    if (!this.chooser) {
      if (this.wallets.length > 0) return this.wallets[0] as WalletProviderDetail;
      throw new DataSourceError('wallet_required');
    }
    const chosen = await this.chooser(options);
    if (chosen && !options.includes(chosen)) throw new DataSourceError('wallet_required');
    if (!chosen) throw new DataSourceError('wallet_required', 'wallet selection cancelled');
    return chosen;
  }

  private attach(detail: WalletProviderDetail): void {
    if (this.active === detail) return;
    this.providerCleanup?.();
    this.active = detail;
    const onAccounts = (accounts: unknown): void => {
      if (this.active !== detail || this.disposed) return;
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      this.address = typeof first === 'string' && isAddress(first, { strict: false }) ? getAddress(first) : null;
      this.emit();
    };
    const onChain = (id: unknown): void => {
      if (this.active !== detail || this.disposed) return;
      this.chainId = typeof id === 'string' || typeof id === 'number' ? Number(id) : null;
      this.emit();
    };
    const onDisconnect = (): void => {
      if (this.active !== detail) return;
      this.providerCleanup?.();
      this.active = null;
      this.address = null;
      this.chainId = null;
      this.emit();
    };
    detail.provider.on?.('accountsChanged', onAccounts);
    detail.provider.on?.('chainChanged', onChain);
    detail.provider.on?.('disconnect', onDisconnect);
    this.providerCleanup = () => {
      detail.provider.removeListener?.('accountsChanged', onAccounts);
      detail.provider.removeListener?.('chainChanged', onChain);
      detail.provider.removeListener?.('disconnect', onDisconnect);
      this.providerCleanup = null;
    };
  }

  private requireProvider(): Eip1193Provider {
    if (!this.active) throw new DataSourceError('wallet_required');
    return this.active.provider;
  }

  private buildState(): WalletState {
    return {
      wallets: this.remoteDetail ? [...this.wallets, this.remoteDetail] : this.wallets,
      address: this.address,
      walletName: this.active?.info.name ?? null,
      chainId: this.chainId,
      wrongNetwork: this.address !== null && this.chainId !== null && this.chainId !== this.params.chainId,
      walletConnect: this.remote?.getState() ?? null,
    };
  }

  private emit(): void {
    this.snapshot = this.buildState();
    for (const listener of this.listeners) listener();
  }
}
