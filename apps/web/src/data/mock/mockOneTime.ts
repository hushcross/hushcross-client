import { DataSourceError } from '../DataSource';
import type { Address, Asset, DataTopic, OneTimeFunds, OneTimeHolding, OneTimeSendRequest, OneTimeSendResult } from '../types';
import { WAD } from '../units';
import type { ActivityRecord } from './mockSeed';
import { REDEPOSIT_MS, REVIEW_MS } from './mockSeed';
import { HOUR, randomTxHash } from './mockUtil';
import { mockSaleAddress } from './mockProfiles';

/** What the one-time ledger needs from the main mock. */
export interface OneTimeHost {
  readonly now: () => number;
  readonly rng: () => number;
  readonly appendVaultNote: (asset: Asset, amount: bigint, approvedAt: number) => void;
  readonly record: (activity: ActivityRecord | null, topics: readonly DataTopic[]) => void;
  readonly log: (kind: ActivityRecord['kind'], module: ActivityRecord['module'], asset: string, amount: bigint, resolveInMs: number) => ActivityRecord;
}

interface Holding {
  readonly symbol: string;
  readonly amount: bigint;
}

interface AddressRecord {
  readonly address: Address;
  readonly source: OneTimeFunds['source'];
  readonly market: string | null;
  readonly sale?: Address;
  readonly at: number;
  readonly holdings: readonly Holding[];
  readonly canMove: boolean;
}

const MILLI = WAD / 1000n;
/** Same rules as core `oneTimeVaultOptions` with a 0.1 gwei gas price. */
const STIPEND = 50_000_000_000_000n;
const GAS_PRICE = 100_000_000n;
const TOKEN_TRANSFER_GAS = 70_000n;
const NATIVE_TRANSFER_GAS = 21_000n;
const SWEEP_TOKEN_GAS = 480_000n;
const SWEEP_NATIVE_GAS = 400_000n;
const USDT_MIN = 20n * WAD;
const BNB_MIN = 2n * 10n ** 16n;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Book trade proceeds, Launch bid payouts and Give refunds on one-time addresses (seeded with a few plausible ones). */
export class MockOneTime {
  private records: AddressRecord[];

  constructor(private readonly host: OneTimeHost) {
    const t0 = host.now();
    this.records = [
      { address: '0x5f1a0c27b9d84e3f6a21c0d97e44b8a1c3d2e9f0', source: 'trade', market: 'BTCB/USDT', at: t0 - 2 * HOUR, holdings: [{ symbol: 'BTCB', amount: 2n * MILLI }, { symbol: 'USDT', amount: 19_179_750_000_000_000_000n }, { symbol: 'BNB', amount: STIPEND }], canMove: true },
      { address: '0x8c3e7d41a2b05f96e1c48a7d30b2f5e9a6c1d047', source: 'trade', market: 'ETH/USDT', at: t0 - 26 * HOUR, holdings: [{ symbol: 'ETH', amount: 40n * MILLI }, { symbol: 'BNB', amount: STIPEND }], canMove: true },
      // A won Orbit Mail bid: the sale token and its USDT dust (the rest of the escrow went back to the vault as notes).
      { address: '0x7d4a19c3e8b2f05a6c91d3e7b40f28a5c6e1d93b', source: 'sale', market: 'ORBT', sale: mockSaleAddress('orbit'), at: t0 - 30 * HOUR, holdings: [{ symbol: 'ORBT', amount: 580_000n * WAD }, { symbol: 'USDT', amount: 3_200_000_000_000_000_000n }, { symbol: 'BNB', amount: STIPEND }], canMove: true },
      { address: '0x2b9f4e6a1c7d03e58f2a9b6c4d1e7f30a5b8c962', source: 'refund', market: null, at: t0 - 3 * 24 * HOUR, holdings: [{ symbol: 'USDT', amount: 30n * WAD }, { symbol: 'BNB', amount: STIPEND }], canMove: true },
    ];
  }

  list(): OneTimeFunds[] {
    return this.records.filter((r) => r.holdings.some((h) => h.amount > 0n)).map((r) => this.view(r)).sort((a, b) => b.at - a.at);
  }

  moveToVault(id: string, asset: Asset): OneTimeFunds {
    const record = this.find(id);
    const options = vaultOptions(record);
    if (!options.includes(asset)) throw new DataSourceError('invalid_input');
    const gas = (asset === 'USDT' ? SWEEP_TOKEN_GAS : SWEEP_NATIVE_GAS) * GAS_PRICE;
    const amount = asset === 'USDT' ? amountOf(record, 'USDT') : amountOf(record, 'BNB') - gas;
    const next = withHoldings(record, (symbol, current) => (symbol === asset ? 0n : symbol === 'BNB' ? current - gas : current));
    this.replace(next);
    this.host.appendVaultNote(asset, (amount * 9970n) / 10_000n, this.host.now() + REDEPOSIT_MS + REVIEW_MS);
    this.host.record(this.host.log('deposit', 'vault', asset, amount, REDEPOSIT_MS + REVIEW_MS), ['send', 'notes', 'balances', 'activity']);
    return this.view(next);
  }

  send(request: OneTimeSendRequest): OneTimeSendResult {
    if (!ADDRESS.test(request.to) || /^0x0{40}$/i.test(request.to)) throw new DataSourceError('invalid_input');
    const record = this.find(request.id);
    if (request.to.toLowerCase() === record.address.toLowerCase()) throw new DataSourceError('invalid_input');
    const current = amountOf(record, request.symbol);
    if (current === 0n) throw new DataSourceError('invalid_input');
    const native = request.symbol === 'BNB';
    const gas = (native ? NATIVE_TRANSFER_GAS : TOKEN_TRANSFER_GAS) * GAS_PRICE;
    if (amountOf(record, 'BNB') < gas || (native && current <= gas)) throw new DataSourceError('invalid_input');
    const amount = native ? current - gas : current;
    this.replace(withHoldings(record, (symbol, value) => (symbol === request.symbol ? 0n : symbol === 'BNB' ? value - gas : value)));
    this.host.record(this.host.log('send', 'send', request.symbol, amount, 4000), ['send', 'balances', 'activity']);
    return { txHash: randomTxHash(this.host.rng), symbol: request.symbol, amount };
  }

  private view(record: AddressRecord): OneTimeFunds {
    const options = record.canMove ? vaultOptions(record) : [];
    const holdings: OneTimeHolding[] = record.holdings
      .filter((h) => h.amount > 0n)
      .map((h) => ({ symbol: h.symbol, amount: h.amount, toVault: (h.symbol === 'USDT' || h.symbol === 'BNB') && options.includes(h.symbol) ? h.symbol : null }));
    return { id: record.address.toLowerCase(), source: record.source, address: record.address, market: record.market, sale: record.sale ?? null, at: record.at, holdings, gas: amountOf(record, 'BNB'), canMove: record.canMove };
  }

  private find(id: string): AddressRecord {
    const record = this.records.find((r) => r.address.toLowerCase() === id.toLowerCase());
    if (!record) throw new DataSourceError('not_found');
    if (!record.canMove) throw new DataSourceError('invalid_input');
    return record;
  }

  private replace(next: AddressRecord): void {
    this.records = this.records.map((r) => (r.address === next.address ? next : r));
  }
}

function amountOf(record: AddressRecord, symbol: string): bigint {
  return record.holdings.find((h) => h.symbol === symbol)?.amount ?? 0n;
}

function withHoldings(record: AddressRecord, map: (symbol: string, amount: bigint) => bigint): AddressRecord {
  return { ...record, holdings: record.holdings.map((h) => ({ ...h, amount: map(h.symbol, h.amount) })) };
}

function vaultOptions(record: AddressRecord): Asset[] {
  const bnb = amountOf(record, 'BNB');
  const usdt = amountOf(record, 'USDT');
  const others = record.holdings.some((h) => h.symbol !== 'BNB' && h.symbol !== 'USDT' && h.amount > 0n);
  const out: Asset[] = [];
  if (usdt >= USDT_MIN && bnb >= SWEEP_TOKEN_GAS * GAS_PRICE) out.push('USDT');
  if (usdt === 0n && !others && bnb - SWEEP_NATIVE_GAS * GAS_PRICE >= BNB_MIN) out.push('BNB');
  return out;
}
