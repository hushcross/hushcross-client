import { DataSourceError } from '../DataSource';
import { decodeGiftFragment, encodeGiftFragment, splitPackets } from '../gift';
import { decideGasDrop } from '../gasDrop';
import type { CreateGiftInput, DataTopic, Funding, Gift, GiftClaimResult, GiftDestination, GiftMode, GiftView, Asset, GasDropNote, Hex } from '../types';
import { splitIntoUnits, UNIT_VALUES, WAD } from '../units';
import type { ActivityRecord } from './mockSeed';
import { BNB_USD, MIX_TICK_MS, RELAY_FEE_BPS, REVIEW_MS } from './mockSeed';

const CLAIM_GAS_DROP = 400_000_000_000_000n;
import { HOUR, randomHex, randomTxHash, SECOND } from './mockUtil';

/** What the gift ledger needs from the main mock. */
export interface GiftHost {
  readonly now: () => number;
  readonly rng: () => number;
  readonly fund: (asset: Asset, amount: bigint, funding: Funding) => void;
  readonly appendVaultNote: (asset: Asset, amount: bigint, approvedAt: number) => void;
  readonly record: (activity: ActivityRecord | null, topics: readonly DataTopic[]) => void;
  readonly log: (kind: ActivityRecord['kind'], asset: string, amount: bigint, resolveInMs: number, subject?: string) => ActivityRecord;
}

interface PacketRecord {
  readonly amount: bigint;
  readonly claimedAt: number | null;
  /** Simulated claim by someone else (group links in the demo). */
  readonly simulatedAt: number | null;
  readonly reclaimed: boolean;
}

interface GiftRecord {
  readonly id: string;
  readonly mode: GiftMode;
  readonly asset: Asset;
  readonly message: string;
  readonly funding: Funding;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly key: string;
  readonly packets: readonly PacketRecord[];
}

export interface GiftDepositFacts {
  readonly amount: bigint;
  readonly createdAt: number;
}

const CHAIN_ID = 56;
const SIM_CLAIM_MS = 20 * SECOND;

const packet = (amount: bigint, claimedAt: number | null = null): PacketRecord => ({ amount, claimedAt, simulatedAt: null, reclaimed: false });

export class MockGifts {
  private gifts: readonly GiftRecord[];
  private counter = 0;

  constructor(private readonly host: GiftHost) {
    const t0 = host.now();
    const usdt = (n: bigint): bigint => n * WAD;
    this.gifts = [
      {
        id: 'gift-new-year',
        mode: 'group',
        asset: 'USDT',
        message: 'For the group chat. One each, please.',
        funding: 'vault',
        createdAt: t0 - 5 * HOUR,
        expiresAt: t0 + 19 * HOUR,
        key: randomHex(host.rng, 32),
        packets: [packet(usdt(60n), t0 - 4 * HOUR), packet(usdt(20n), t0 - 3 * HOUR), packet(usdt(40n), t0 - HOUR), packet(usdt(20n)), packet(usdt(60n))],
      },
      { id: 'gift-thanks', mode: 'single', asset: 'BNB', message: 'Thanks for the help with the move.', funding: 'vault', createdAt: t0 - 30 * HOUR, expiresAt: t0 - 6 * HOUR, key: randomHex(host.rng, 32), packets: [packet(WAD / 10n)] },
      { id: 'gift-team', mode: 'personal', asset: 'USDT', message: '', funding: 'vault', createdAt: t0 - 3 * 24 * HOUR, expiresAt: t0 - 2 * 24 * HOUR, key: randomHex(host.rng, 32), packets: [packet(usdt(100n), t0 - 70 * HOUR), packet(usdt(100n), t0 - 66 * HOUR), { ...packet(usdt(100n)), reclaimed: true }] },
    ];
  }

  private claimed(p: PacketRecord): boolean {
    return p.claimedAt !== null || (p.simulatedAt !== null && p.simulatedAt <= this.host.now());
  }

  private link(record: GiftRecord, index: number | null): string {
    const key = index === null ? record.key : `${record.key}.${index}`;
    return `/gift${encodeGiftFragment({ v: 1, chainId: CHAIN_ID, scope: record.asset.toLowerCase(), key, message: record.message })}`;
  }

  private toGift(record: GiftRecord): Gift {
    return {
      id: record.id,
      mode: record.mode,
      asset: record.asset,
      total: record.packets.reduce((sum, p) => sum + p.amount, 0n),
      message: record.message,
      funding: record.funding,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      packets: record.packets.map((p, index) => ({
        index,
        amount: p.amount,
        status: p.reclaimed ? 'reclaimed' : this.claimed(p) ? 'claimed' : 'unclaimed',
        claimedAt: p.claimedAt ?? (p.simulatedAt !== null && p.simulatedAt <= this.host.now() ? p.simulatedAt : null),
      })),
      links: record.mode === 'personal' ? record.packets.map((_, i) => this.link(record, i)) : [this.link(record, null)],
    };
  }

  list(): readonly Gift[] {
    return [...this.gifts].sort((a, b) => b.createdAt - a.createdAt).map((g) => this.toGift(g));
  }

  create(input: CreateGiftInput): Gift {
    const packetsOk = input.mode === 'single' ? input.packets === 1 : input.packets >= 2 && input.packets <= 50;
    const valid =
      UNIT_VALUES[input.asset].includes(input.unit) &&
      Number.isInteger(input.units) &&
      input.units >= input.packets &&
      input.units <= 100 &&
      packetsOk &&
      input.expiryHours >= 1 &&
      input.expiryHours <= 168 &&
      input.message.length <= 140;
    if (!valid) throw new DataSourceError('invalid_input');
    const total = input.unit * BigInt(input.units);
    this.host.fund(input.asset, total, input.funding);
    const now = this.host.now();
    const sizes = input.packets === 1 ? [input.units] : splitPackets(input.units, input.packets, this.host.rng);
    const simulate = input.mode === 'group' ? Math.ceil(sizes.length * 0.6) : 0;
    this.counter += 1;
    const record: GiftRecord = {
      id: `gift-${this.counter}`,
      mode: input.mode,
      asset: input.asset,
      message: input.message.trim(),
      funding: input.funding,
      createdAt: now,
      expiresAt: now + input.expiryHours * HOUR,
      key: randomHex(this.host.rng, 32),
      packets: sizes.map((n, i) => ({ ...packet(input.unit * BigInt(n)), simulatedAt: i < simulate ? now + SIM_CLAIM_MS * (i + 1) : null })),
    };
    this.gifts = [record, ...this.gifts];
    this.host.record(this.host.log('gift', input.asset, total, 4000), ['gifts', 'notes', 'balances', 'activity']);
    return this.toGift(record);
  }

  reclaim(id: string): Gift {
    const record = this.gifts.find((g) => g.id === id);
    if (!record) throw new DataSourceError('not_found');
    if (this.host.now() < record.expiresAt) throw new DataSourceError('phase_closed');
    const open = record.packets.filter((p) => !p.reclaimed && !this.claimed(p));
    if (open.length === 0) throw new DataSourceError('invalid_input');
    const amount = open.reduce((sum, p) => sum + p.amount, 0n);
    for (const value of splitIntoUnits(record.asset, amount)) this.host.appendVaultNote(record.asset, value, this.host.now());
    const updated = { ...record, packets: record.packets.map((p) => (this.claimed(p) || p.reclaimed ? p : { ...p, reclaimed: true })) };
    this.gifts = this.gifts.map((g) => (g.id === id ? updated : g));
    this.host.record(this.host.log('gift_reclaim', record.asset, amount, 4000), ['gifts', 'notes', 'balances', 'activity']);
    return this.toGift(updated);
  }

  private locate(fragment: string): { record: GiftRecord; index: number | null } {
    const payload = decodeGiftFragment(fragment);
    if (!payload) throw new DataSourceError('invalid_input');
    const [master, suffix] = payload.key.split('.');
    const record = this.gifts.find((g) => g.key === master);
    if (!record) throw new DataSourceError('not_found');
    const index = suffix === undefined ? null : Number(suffix);
    if (index !== null && (record.mode !== 'personal' || index >= record.packets.length)) throw new DataSourceError('not_found');
    return { record, index };
  }

  private nextPacket(record: GiftRecord, index: number | null): number | null {
    if (index !== null) {
      const p = record.packets[index];
      return p && !p.reclaimed && !this.claimed(p) ? index : null;
    }
    const found = record.packets.findIndex((p) => !p.reclaimed && !this.claimed(p));
    return found < 0 ? null : found;
  }

  open(fragment: string): GiftView {
    const { record, index } = this.locate(fragment);
    const now = this.host.now();
    const next = this.nextPacket(record, index);
    const left = record.packets.filter((p) => !p.reclaimed && !this.claimed(p)).length;
    const status = now >= record.expiresAt ? 'expired' : next === null ? 'all_claimed' : record.funding === 'public' && now < record.createdAt + REVIEW_MS ? 'in_review' : 'ready';
    return {
      asset: record.asset,
      mode: record.mode,
      amount: next === null ? 0n : (record.packets[next]?.amount ?? 0n),
      message: record.message,
      status,
      packetsTotal: record.packets.length,
      packetsLeft: left,
      expiresAt: record.expiresAt,
      ...this.dropFor(record.asset, next === null ? 0n : (record.packets[next]?.amount ?? 0n), true),
    };
  }

  private dropFor(asset: Asset, amount: bigint, wanted: boolean): { gasDropOffered: boolean; gasDropDefaultOn: boolean; gasDropNote: GasDropNote | null; gasDrop: bigint } {
    const d = decideGasDrop({ asset, amount, wanted, gasDropWei: CLAIM_GAS_DROP, relayFee: (amount * BigInt(RELAY_FEE_BPS)) / 10_000n, dropCostInAsset: CLAIM_GAS_DROP * BNB_USD });
    return { gasDropOffered: d.offered, gasDropDefaultOn: d.defaultOn, gasDropNote: d.note, gasDrop: d.gasDrop };
  }

  claim(fragment: string, destination: GiftDestination): GiftClaimResult {
    const view = this.open(fragment);
    if (view.status !== 'ready') throw new DataSourceError('phase_closed');
    const { record, index } = this.locate(fragment);
    const next = this.nextPacket(record, index);
    if (next === null) throw new DataSourceError('phase_closed');
    const amount = record.packets[next]?.amount ?? 0n;
    const now = this.host.now();
    this.gifts = this.gifts.map((g) => (g.id === record.id ? { ...g, packets: g.packets.map((p, i) => (i === next ? { ...p, claimedAt: now } : p)) } : g));
    if (destination.kind === 'vault') {
      for (const value of splitIntoUnits(record.asset, amount)) this.host.appendVaultNote(record.asset, value, now + REVIEW_MS);
    }
    this.host.record(this.host.log('gift_claim', record.asset, amount, 4000), ['gifts', 'notes', 'balances', 'activity']);
    const txHash: Hex = randomTxHash(this.host.rng);
    const gasDrop = destination.kind === 'address' ? this.dropFor(record.asset, amount, destination.gasDrop).gasDrop : 0n;
    return { amount, asset: record.asset, destination: destination.kind, txHash, gasDrop };
  }

  /** Deposit facts for the gift packet a link points at (used by the privacy check). */
  depositFacts(fragment: string): GiftDepositFacts & { readonly mixedAfter: number } {
    const { record, index } = this.locate(fragment);
    const next = this.nextPacket(record, index) ?? 0;
    const age = this.host.now() - record.createdAt;
    return { amount: record.packets[next]?.amount ?? 0n, createdAt: record.createdAt, mixedAfter: Math.floor(age / MIX_TICK_MS) };
  }
}
