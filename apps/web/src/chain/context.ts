import {
  CoreError,
  RelayFeeAboveCapError,
  ServiceError,
  deriveDepositSecrets,
  proveSpend,
  quoteWithGasDrop,
  recoverNotes,
  type AccountSecrets,
  type Deployments,
  type GasDropQuote,
  type NoteSecrets,
  type RelayInfo,
  type RelayJobView,
  type RelayWithdrawRequest,
  type SolidityProof,
  type SpendNote,
  type Withdrawal,
} from '@hushcross/core';
import { AccountError, type AccountSession, type UnlockedAccount } from '../account/AccountManager';
import { DataSourceError, isDataSourceError } from '../data/DataSource';
import type { Address, Asset, DataListener, DataTopic, Hex, NoteStatus } from '../data/types';
import type { ZkLoader } from '../zk/loadProver';
import { relayGas } from './gas';
import { jobToJson, readJobs, readNextIndex, withMeta, type StoredJob } from './meta';
import { depositRecords, exitRecords, PoolSync, withdrawalRecords, type PoolSnapshot } from './poolState';
import type { MarketsPort } from './marketsPort';
import type { AssetConfig, ChainPort, ServicesPort, WalletPort } from './ports';

export interface ChainDeps {
  readonly chainId: number;
  readonly deployments: Deployments;
  readonly chain: ChainPort;
  readonly wallet: WalletPort;
  readonly services: ServicesPort;
  readonly zk: ZkLoader;
  readonly session: AccountSession;
  /** Book / Give contract reads (W4); Book and Give report `not_found` without it. */
  readonly markets?: MarketsPort;
  readonly now?: () => number;
  /** Cache lifetime for relay info / prices / gas price. */
  readonly cacheMs?: number;
}

export interface AccountNote extends SpendNote {
  readonly id: string;
  readonly asset: Asset;
  readonly scope: bigint;
  readonly pool: Address;
  readonly index: bigint;
  readonly balance: bigint;
  readonly commitment: bigint;
  readonly withdrawalCount: number;
  readonly depositor: Address;
  readonly depositTx: Hex;
  readonly depositBlock: bigint;
  readonly depositLogIndex: number;
  readonly status: NoteStatus;
}

export const ASSET_LIST: readonly Asset[] = ['BNB', 'USDT'];

interface Cached<T> {
  readonly at: number;
  readonly value: Promise<T>;
}

/** Shared state and helpers for the chain-backed operations. */
export class ChainContext {
  readonly now: () => number;
  readonly pools: Readonly<Record<Asset, PoolSync>>;
  private readonly listeners = new Set<DataListener>();
  private readonly labelStatus = new Map<string, 'approved' | 'rejected'>();
  private readonly cache = new Map<string, Cached<unknown>>();
  private readonly cacheMs: number;
  private nextIndexFromChain = 0n;

  constructor(readonly deps: ChainDeps) {
    this.now = deps.now ?? Date.now;
    this.cacheMs = deps.cacheMs ?? 30_000;
    const start = deps.deployments.startBlock;
    this.pools = {
      BNB: new PoolSync(deps.chain, 'BNB', deps.deployments.pools.BNB, start),
      USDT: new PoolSync(deps.chain, 'USDT', deps.deployments.pools.USDT, start),
    };
  }

  get deployments(): Deployments {
    return this.deps.deployments;
  }

  subscribe(listener: DataListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(topics: readonly DataTopic[]): void {
    for (const listener of this.listeners) listener(topics);
  }

  requireAccount(): UnlockedAccount {
    const account = this.deps.session.current();
    if (!account) throw new DataSourceError('locked');
    return account;
  }

  requireWallet(): Address {
    const address = this.deps.wallet.getAddress();
    if (!address) throw new DataSourceError('wallet_required');
    return address;
  }

  async updateAccount(mutate: (secrets: AccountSecrets) => AccountSecrets): Promise<UnlockedAccount> {
    return this.deps.session.update(mutate);
  }

  assetOfScope(scope: bigint): Asset | null {
    if (scope === this.deployments.pools.BNB.scope) return 'BNB';
    if (scope === this.deployments.pools.USDT.scope) return 'USDT';
    return null;
  }

  tokenOf(asset: Asset): Address | null {
    return asset === 'USDT' ? this.deployments.pools.USDT.asset : null;
  }

  async snapshots(): Promise<Record<Asset, PoolSnapshot>> {
    const [bnb, usdt] = await Promise.all([this.pools.BNB.sync(), this.pools.USDT.sync()]);
    return { BNB: bnb, USDT: usdt };
  }

  /** Rebuild this account's notes from both pools and attach Screen status. */
  async accountNotes(): Promise<AccountNote[]> {
    const { secrets } = this.requireAccount();
    const snaps = await this.snapshots();
    const all = ASSET_LIST.map((a) => snaps[a]);
    const result = recoverNotes({
      phrase: secrets.phrase,
      pools: [
        { poolId: 'BNB', scope: snaps.BNB.scope },
        { poolId: 'USDT', scope: snaps.USDT.scope },
      ],
      deposits: all.flatMap(depositRecords),
      withdrawals: all.flatMap(withdrawalRecords),
      exits: all.flatMap(exitRecords),
    });
    this.nextIndexFromChain = result.nextIndex;
    const notes = await Promise.all(
      result.notes.map(async (note): Promise<AccountNote> => {
        const asset = note.poolId as Asset;
        const snap = snaps[asset];
        const deposit = snap.deposits.find((d) => d.label === note.label);
        if (!deposit) throw new DataSourceError('network', 'deposit log missing for a recovered note');
        let status: NoteStatus = note.status === 'exited' ? 'exited' : note.status === 'spent' ? 'spent' : 'in_review';
        if (status === 'in_review') status = await this.screenStatus(asset, note.label);
        return {
          id: `${asset}:${note.index.toString()}:${note.label.toString()}`,
          asset,
          scope: note.scope,
          pool: snap.pool,
          index: note.index,
          balance: note.balance,
          value: note.balance,
          label: note.label,
          nullifier: note.nullifier,
          secret: note.secret,
          commitment: note.commitment,
          withdrawalCount: note.withdrawalCount,
          depositor: note.depositor,
          depositTx: deposit.tx,
          depositBlock: deposit.block,
          depositLogIndex: deposit.logIndex,
          status,
        };
      }),
    );
    return notes;
  }

  async screenStatus(asset: Asset, label: bigint): Promise<NoteStatus> {
    const key = `${asset}:${label.toString()}`;
    const known = this.labelStatus.get(key);
    if (known) return known === 'approved' ? 'approved' : 'declined';
    try {
      const status = await this.deps.services.screen.status(label);
      if (status === 'approved' || status === 'rejected') this.labelStatus.set(key, status);
      return status === 'approved' ? 'approved' : status === 'rejected' ? 'declined' : 'in_review';
    } catch {
      return 'in_review';
    }
  }

  /** Reserve fresh account indexes (shared index line across pools) and persist before use. */
  async reserveIndexes(count: number): Promise<bigint[]> {
    const { secrets } = this.requireAccount();
    const start = readNextIndex(secrets) > this.nextIndexFromChain ? readNextIndex(secrets) : this.nextIndexFromChain;
    const indexes = Array.from({ length: count }, (_, i) => start + BigInt(i));
    await this.updateAccount((s) => withMeta(s, { nextIndex: (start + BigInt(count)).toString() }));
    return indexes;
  }

  async freshDepositSecrets(asset: Asset, count: number): Promise<{ readonly index: bigint; readonly secrets: NoteSecrets }[]> {
    await this.accountNotes();
    const { keys } = this.requireAccount();
    const scope = this.deployments.pools[asset].scope;
    const indexes = await this.reserveIndexes(count);
    return indexes.map((index) => ({ index, secrets: deriveDepositSecrets(keys, scope, index) }));
  }

  cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as Cached<T> | undefined;
    if (hit && this.now() - hit.at < this.cacheMs) return hit.value;
    const value = load();
    value.catch(() => this.cache.delete(key));
    this.cache.set(key, { at: this.now(), value });
    return value;
  }

  requireMarkets(): MarketsPort {
    const markets = this.deps.markets;
    if (!markets) throw new DataSourceError('not_found', 'Book / Give reads are not configured');
    return markets;
  }

  relayInfo(): Promise<RelayInfo> {
    return this.cached('relayInfo', () => this.deps.services.relay.info());
  }

  assetConfig(asset: Asset): Promise<AssetConfig> {
    return this.cached(`assetConfig:${asset}`, () => this.deps.chain.getAssetConfig(this.deployments.entrypoint, this.deployments.pools[asset].asset));
  }

  /**
   * Relay fee quote. `gasDrop` is the user's wish; the decided rules apply (none on BNB, never over the
   * fee cap), so check `gasDropApplied` before asking the relay for a drop.
   */
  async quote(asset: Asset, target: 'send' | 'gift' | 'direct' | 'launch' | 'book' | 'give', amount: bigint, options: { readonly packets?: number; readonly gasDrop?: boolean } = {}): Promise<GasDropQuote> {
    const feeds = this.deployments.feeds;
    const [info, gasPrice, bnbUsd, assetUsd, config] = await Promise.all([
      this.relayInfo(),
      this.cached('gasPrice', () => this.deps.chain.getGasPrice()),
      this.cached('price:BNB', () => this.deps.chain.getPrice(feeds.BNB_USD)),
      asset === 'BNB' ? this.cached('price:BNB', () => this.deps.chain.getPrice(feeds.BNB_USD)) : this.cached('price:USDT', () => this.deps.chain.getPrice(feeds.USDT_USD)),
      this.assetConfig(asset),
    ]);
    try {
      return quoteWithGasDrop(asset, target === 'send' && options.gasDrop === true, {
        gas: relayGas(target, options.packets),
        gasPriceWei: gasPrice,
        gasDropWei: info.gasDropWei,
        bnbUsd,
        assetUsd,
        amount,
        minBps: info.feeBpsForScope(this.deployments.pools[asset].scope),
        maxBps: config.maxRelayFeeBps,
        nowSec: BigInt(Math.floor(this.now() / 1000)),
      });
    } catch (error: unknown) {
      if (error instanceof RelayFeeAboveCapError) throw new DataSourceError('invalid_input', `relay fee for ${target} exceeds the cap: ${error.message}`);
      throw error;
    }
  }

  /** Prove one withdrawal of `withdrawn` from `note` and return the Solidity proof. */
  async prove(asset: Asset, note: SpendNote, withdrawn: bigint, next: { readonly nullifier: bigint; readonly secret: bigint }, withdrawal: Withdrawal): Promise<SolidityProof> {
    const snap = await this.pools[asset].sync();
    const status = await this.screenStatus(asset, note.label);
    if (status !== 'approved') throw new DataSourceError('in_review');
    const [asp, prover, artifacts] = await Promise.all([this.deps.services.screen.proof(note.label), this.deps.zk.getProver(), this.deps.zk.getArtifacts()]);
    const result = await proveSpend({ note, withdrawnValue: withdrawn, next, withdrawal, scope: snap.scope, stateLeaves: snap.leaves, asp, prover, artifacts });
    return result.proof;
  }

  /** Submit to the relay and remember the job locally (encrypted with the vault when unlocked). */
  async submit(request: RelayWithdrawRequest, job: Omit<StoredJob, 'id'>): Promise<RelayJobView> {
    let view: RelayJobView;
    try {
      view = await this.deps.services.relay.withdraw(request);
    } catch (error: unknown) {
      if (error instanceof ServiceError) throw new DataSourceError('relay_rejected', error.message);
      throw error;
    }
    if (this.deps.session.current()) {
      const stored: StoredJob = { ...job, id: view.jobId };
      await this.updateAccount((s) => withMeta(s, { jobs: [...readJobs(s).map(jobToJson), jobToJson(stored)] }));
    }
    return view;
  }

  /** Send wallet transactions one after another, waiting for each receipt. */
  async sendWalletTxs(txs: readonly { readonly to: Address; readonly data: Hex; readonly value: bigint }[]): Promise<Hex> {
    let last: Hex | null = null;
    for (const tx of txs) {
      last = await this.deps.wallet.sendTransaction(tx);
      if ((await this.deps.chain.waitForReceipt(last)) !== 'success') throw new DataSourceError('tx_failed');
    }
    if (!last) throw new DataSourceError('invalid_input');
    return last;
  }
}

/** Translate library / service failures into DataSource error codes. */
export function toDataError(error: unknown): DataSourceError {
  if (isDataSourceError(error)) return error;
  if (error instanceof AccountError) return new DataSourceError(error.code === 'no_vault' ? 'locked' : 'invalid_input', error.message);
  if (error instanceof ServiceError) return new DataSourceError('relay_rejected', error.message);
  if (error instanceof CoreError) {
    if (error.code === 'insufficient_vault') return new DataSourceError('insufficient_vault', error.message);
    if (['below_minimum', 'gift_split', 'gift_link', 'gift_memo', 'base64', 'meta_address', 'not_expired', 'amount', 'deposit_count', 'sweep_minimum', 'sweep_gas', 'sweep_order', 'one_time_gas', 'address'].includes(error.code)) {
      return new DataSourceError('invalid_input', error.message);
    }
  }
  return new DataSourceError('network', error instanceof Error ? error.message : String(error));
}

export async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    throw toDataError(error);
  }
}
