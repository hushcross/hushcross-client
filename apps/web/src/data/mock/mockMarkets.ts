import type { BidAllocation } from '../clearing';
import type { Bid, BidStatus, Donation, EpochClearing, EpochPhase, Order, Pair, SalePhase } from '../types';
import { UNIT_VALUES, WAD } from '../units';
import { COMMIT_MS, EPOCH_MS, type BidRecord, type CampaignRecord, type OrderRecord } from './mockSeed';
import { createRng, hashString, HOUR, pick, scalePpm } from './mockUtil';

export interface EpochWindow {
  readonly epoch: number;
  readonly phase: EpochPhase;
  readonly startsAt: number;
  readonly commitEndsAt: number;
  readonly revealEndsAt: number;
}

/** 10-minute epochs aligned to wall-clock time: 8 min commit + 2 min reveal. */
export function currentEpoch(now: number): EpochWindow {
  const epoch = Math.floor(now / EPOCH_MS);
  const startsAt = epoch * EPOCH_MS;
  return {
    epoch,
    phase: now < startsAt + COMMIT_MS ? 'commit' : 'reveal',
    startsAt,
    commitEndsAt: startsAt + COMMIT_MS,
    revealEndsAt: startsAt + EPOCH_MS,
  };
}

/** Deterministic synthetic clearing for a finished epoch. */
export function bookClearing(pair: Pair, epoch: number, now: number): EpochClearing {
  const rng = createRng(hashString(pair.id) ^ epoch);
  const roll = rng();
  const at = Math.min(now, (epoch + 1) * EPOCH_MS);
  const orderCount = 3 + Math.floor(rng() * 24);
  if (roll < 0.07) return { pairId: pair.id, epoch, outcome: 'no_cross', price: null, volume: 0n, orderCount, at };
  const drift = (rng() - 0.5) * 30_000;
  if (roll < 0.12) return { pairId: pair.id, epoch, outcome: 'outside_band', price: scalePpm(pair.referencePrice, drift > 0 ? 26_000 : -26_000), volume: 0n, orderCount, at };
  const price = scalePpm(pair.referencePrice, drift);
  const notional = BigInt(2_000 + Math.floor(rng() * 90_000)) * WAD;
  return { pairId: pair.id, epoch, outcome: 'cleared', price, volume: (notional * WAD) / price, orderCount, at };
}

export function orderStatus(order: OrderRecord, pair: Pair, now: number): Order {
  const current = currentEpoch(now);
  const base = { ...order, filled: 0n, clearingPrice: null };
  if (order.epoch === current.epoch) return { ...base, status: current.phase === 'commit' ? 'sealed' : 'revealed' };
  const clearing = bookClearing(pair, order.epoch, now);
  const crosses =
    clearing.outcome === 'cleared' &&
    clearing.price !== null &&
    (order.side === 'buy' ? order.limitPrice >= clearing.price : order.limitPrice <= clearing.price);
  if (crosses) return { ...base, status: 'filled', filled: order.amount, clearingPrice: clearing.price };
  return { ...base, status: order.rollover ? 'rolled' : 'refunded', clearingPrice: clearing.price };
}

/** Public donation history for a campaign (amounts and times only). */
export function syntheticDonations(record: CampaignRecord, count: number, now: number): Donation[] {
  const rng = createRng(hashString(record.id));
  const units = UNIT_VALUES[record.asset].slice(0, 3);
  const end = Math.min(now, record.deadline ?? now);
  const span = Math.max(HOUR, end - record.createdAt);
  const n = Math.min(count, record.baseCount);
  return Array.from({ length: n }, (_, i) => ({
    id: `${record.id}-d${i}`,
    campaignId: record.id,
    amount: pick(rng, units) * BigInt(1 + Math.floor(rng() * 2)),
    at: end - Math.floor(((i + rng()) / (n + 1)) * span),
    hasReceipt: rng() > 0.6,
  }));
}

/** Bid status and settlement figures derived from the sale phase. */
export function deriveBid(bid: BidRecord, phase: SalePhase, revealed: boolean, allocation: BidAllocation | undefined): Bid {
  const { revealedAt: _r, claimedAt, ...clean } = bid;
  let status: BidStatus = 'sealed';
  const tokensAllocated = allocation?.tokens ?? 0n;
  const spent = allocation?.spent ?? 0n;
  const settled = phase === 'claim' || phase === 'failed';
  if (phase === 'reveal' || phase === 'settle') status = revealed ? 'revealed' : phase === 'settle' ? 'unrevealed' : 'sealed';
  if (settled) {
    if (!revealed) status = claimedAt ? 'refunded' : 'unrevealed';
    else if (tokensAllocated === 0n) status = claimedAt ? 'refunded' : 'lost';
    else if (claimedAt) status = 'claimed';
    else status = spent * 100n >= bid.maxSpend * 99n ? 'won' : 'partial';
  }
  return { ...clean, status, tokensAllocated: settled ? tokensAllocated : 0n, spent: settled ? spent : 0n, refund: settled ? bid.deposit - spent : 0n };
}
