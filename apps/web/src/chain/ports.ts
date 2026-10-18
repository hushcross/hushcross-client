import type { ChainlinkPrice, IndexerClient, MetaClient, RelayClient, SaleProfilePointer, ScreenClient, TxRequest } from '@hushcross/core';
import type { Address, Hex } from '../data/types';

/** Small, fakeable boundaries between ChainDataSource and the outside world. */

interface PoolLogBase {
  readonly block: bigint;
  readonly logIndex: number;
  readonly tx: Hex;
}

export type PoolLog =
  | (PoolLogBase & { readonly kind: 'deposit'; readonly depositor: Address; readonly commitment: bigint; readonly label: bigint; readonly value: bigint; readonly precommitment: bigint })
  | (PoolLogBase & { readonly kind: 'withdrawal'; readonly processooor: Address; readonly value: bigint; readonly spentNullifier: bigint; readonly newCommitment: bigint })
  | (PoolLogBase & { readonly kind: 'ragequit'; readonly ragequitter: Address; readonly commitment: bigint; readonly label: bigint; readonly value: bigint })
  | (PoolLogBase & { readonly kind: 'leaf'; readonly index: bigint; readonly leaf: bigint; readonly root: bigint });

export interface AssetConfig {
  readonly pool: Address;
  readonly minimumDeposit: bigint;
  readonly vettingFeeBps: bigint;
  readonly maxRelayFeeBps: bigint;
}

export type FirstFunding = { readonly kind: 'found'; readonly from: Address } | { readonly kind: 'unknown' };

/** SealedSale state read directly from the contract (contracts/src/launch/SealedSale.sol). */
export interface OnchainSale {
  readonly address: Address;
  readonly saleId: bigint;
  readonly creator: Address;
  readonly token: Address;
  /** zero address = BNB. */
  readonly quoteAsset: Address;
  readonly saleSupply: bigint;
  readonly lpTokenReserve: bigint;
  readonly floorPrice: bigint;
  readonly minRaise: bigint;
  readonly minEscrow: bigint;
  /** Unix seconds. */
  readonly commitEnd: bigint;
  readonly revealEnd: bigint;
  readonly liquidityBps: number;
  readonly bidCount: bigint;
  readonly totalEscrow: bigint;
  /** 0 pending, 1 cleared, 2 failed. */
  readonly outcome: number;
  readonly raise: bigint;
  readonly lpPool: Address;
  readonly lpTokenId: bigint;
  readonly entryCount: bigint;
  readonly clearingPrice: bigint;
  readonly undersubscribed: boolean;
  readonly tokensSold: bigint;
  readonly units: readonly bigint[];
}

export interface OnchainBid {
  readonly escrow: bigint;
  readonly prefix: bigint;
  readonly recipient: Address;
  readonly entry: number;
  readonly status: number;
  readonly vaultFunded: boolean;
}

export interface TxLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

/** Launch and Hush ID reads (W3). */
export interface LaunchPort {
  getSale(sale: Address): Promise<OnchainSale>;
  /** Revealed valid entries (price, q) in reveal order. */
  getSaleEntries(sale: Address, count: bigint): Promise<readonly { readonly price: bigint; readonly quantity: bigint }[]>;
  getBid(sale: Address, commitment: Hex): Promise<OnchainBid>;
  getAllocation(sale: Address, commitment: Hex): Promise<{ readonly tokens: bigint; readonly paid: bigint }>;
  getTokenInfo(token: Address): Promise<{ readonly name: string; readonly symbol: string; readonly totalSupply: bigint }>;
  /** `previewFinalize(price)` as an eth_call: true when the contract would accept that clearing price. */
  previewFinalize(sale: Address, price: bigint): Promise<boolean>;
  /** Latest block timestamp, unix seconds. */
  getLatestTimestamp(): Promise<bigint>;
  getRegistryNonce(registry: Address, owner: Address): Promise<bigint>;
  /** `LaunchFactory.sales(id)`; null when the id does not exist. */
  getSaleAddress(factory: Address, saleId: bigint): Promise<Address | null>;
  /** OpenZeppelin `VestingWallet.duration()` in seconds. */
  getVestingDuration(vesting: Address): Promise<bigint>;
  /** `LaunchFactory.profileOf(sale)` as a pointer; null when never set or cleared. Untrusted until verified. */
  getSaleProfilePointer(factory: Address, sale: Address): Promise<SaleProfilePointer | null>;
  waitForReceiptLogs(hash: Hex): Promise<{ readonly status: 'success' | 'reverted'; readonly logs: readonly TxLog[] }>;
}

export interface ChainPort extends LaunchPort {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
  /** Block timestamp in milliseconds. */
  getBlockTime(block: bigint): Promise<number>;
  getNativeBalance(address: Address): Promise<bigint>;
  getTokenBalance(token: Address, owner: Address): Promise<bigint>;
  getAllowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  getAssetConfig(entrypoint: Address, asset: Address): Promise<AssetConfig>;
  getPrice(feed: Address): Promise<ChainlinkPrice>;
  /** Decoded Deposited / Withdrawn / Ragequit / LeafInserted logs, in chain order. */
  getPoolLogs(pool: Address, fromBlock: bigint, toBlock: bigint): Promise<readonly PoolLog[]>;
  getRegisteredMeta(registry: Address, owner: Address): Promise<Hex>;
  /** Earliest recent ERC-20 transfer into `to` (bounded look-back window). */
  getFirstTokenFunding(token: Address, to: Address): Promise<FirstFunding>;
  /** Sign locally with a one-time key and broadcast (used for sweeping one-time addresses). */
  sendFromKey(privateKey: Hex, tx: TxRequest): Promise<Hex>;
  /** Pending nonce of an address (for transactions signed locally with a one-time key). */
  getTransactionCount(address: Address): Promise<number>;
  /** Broadcast a transaction signed locally (core `signOneTimeTransfer`). */
  sendRawTransaction(raw: Hex): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<'success' | 'reverted'>;
  /** Receipt status without waiting; null while pending or unknown. */
  getReceipt(hash: Hex): Promise<'success' | 'reverted' | null>;
}

export interface WalletPort {
  getAddress(): Address | null;
  connect(): Promise<Address>;
  sendTransaction(tx: TxRequest): Promise<Hex>;
  /** EIP-191 `personal_sign` of a UTF-8 message by the connected wallet. */
  signMessage(message: string): Promise<Hex>;
}

export interface ServicesPort {
  readonly relay: RelayClient;
  readonly screen: ScreenClient;
  readonly indexer: IndexerClient;
  /** Sale profile host; without it profiles are not shown and cannot be published. */
  readonly meta?: MetaClient;
}
