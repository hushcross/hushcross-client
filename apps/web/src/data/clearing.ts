import { quoteValue, WAD } from './units';

export interface SealedBid {
  readonly id: string;
  readonly price: bigint;
  readonly maxSpend: bigint;
}

export interface SaleClearingInput {
  readonly saleAmount: bigint;
  readonly floorPrice: bigint;
  readonly minRaise: bigint;
  readonly bids: readonly SealedBid[];
}

export interface BidAllocation {
  readonly id: string;
  readonly tokens: bigint;
  readonly spent: bigint;
}

export interface SaleClearingResult {
  readonly price: bigint;
  readonly tokensSold: bigint;
  readonly raised: bigint;
  readonly succeeded: boolean;
  readonly allocations: readonly BidAllocation[];
}

const demandAt = (bid: SealedBid, price: bigint): bigint => (bid.maxSpend * WAD) / price;

/**
 * Uniform-price clearing (SPEC §4): p* is the highest bid price at which
 * demand from bids priced ≥ p* covers the sale amount; bids above p* fill in
 * full, the p* level is pro-rated. Short demand clears at the floor.
 */
export function clearSale(input: SaleClearingInput): SaleClearingResult {
  const eligible = input.bids.filter((bid) => bid.price >= input.floorPrice && bid.maxSpend > 0n);
  const levels = [...new Set(eligible.map((bid) => bid.price))].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  let clearing: bigint | null = null;
  for (const level of levels) {
    const demand = eligible.filter((bid) => bid.price >= level).reduce((sum, bid) => sum + demandAt(bid, level), 0n);
    if (demand >= input.saleAmount) {
      clearing = level;
      break;
    }
  }
  const price = clearing ?? input.floorPrice;
  const allocations: BidAllocation[] = [];
  if (clearing === null) {
    for (const bid of eligible) {
      const tokens = demandAt(bid, price);
      allocations.push({ id: bid.id, tokens, spent: quoteValue(tokens, price) });
    }
  } else {
    const above = eligible.filter((bid) => bid.price > price);
    const atLevel = eligible.filter((bid) => bid.price === price);
    const aboveTokens = above.reduce((sum, bid) => sum + demandAt(bid, price), 0n);
    const remaining = input.saleAmount - aboveTokens;
    const levelDemand = atLevel.reduce((sum, bid) => sum + demandAt(bid, price), 0n);
    for (const bid of above) {
      const tokens = demandAt(bid, price);
      allocations.push({ id: bid.id, tokens, spent: quoteValue(tokens, price) });
    }
    for (const bid of atLevel) {
      const tokens = levelDemand === 0n ? 0n : (demandAt(bid, price) * remaining) / levelDemand;
      allocations.push({ id: bid.id, tokens, spent: quoteValue(tokens, price) });
    }
  }
  const tokensSold = allocations.reduce((sum, a) => sum + a.tokens, 0n);
  const raised = allocations.reduce((sum, a) => sum + a.spent, 0n);
  const succeeded = raised >= input.minRaise && tokensSold > 0n;
  return {
    price,
    tokensSold: succeeded ? tokensSold : 0n,
    raised: succeeded ? raised : 0n,
    succeeded,
    allocations: succeeded ? allocations : allocations.map((a) => ({ id: a.id, tokens: 0n, spent: 0n })),
  };
}

export interface LimitOrder {
  readonly id: string;
  readonly price: bigint;
  readonly amount: bigint;
}

export interface BatchInput {
  readonly referencePrice: bigint;
  readonly bandBps: number;
  readonly buys: readonly LimitOrder[];
  readonly sells: readonly LimitOrder[];
}

export interface BatchResult {
  readonly outcome: 'cleared' | 'outside_band' | 'no_cross';
  readonly price: bigint | null;
  readonly volume: bigint;
}

/**
 * Two-sided call auction (SPEC §5): the clearing price maximises matched
 * volume; ties take the midpoint of the max-volume price range. The result
 * must sit within ±band of the reference price or the epoch does not trade.
 */
export function clearBatchAuction(input: BatchInput): BatchResult {
  const candidates = [...new Set([...input.buys, ...input.sells].map((o) => o.price))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let best = 0n;
  let low: bigint | null = null;
  let high: bigint | null = null;
  for (const price of candidates) {
    const demand = input.buys.filter((o) => o.price >= price).reduce((s, o) => s + o.amount, 0n);
    const supply = input.sells.filter((o) => o.price <= price).reduce((s, o) => s + o.amount, 0n);
    const volume = demand < supply ? demand : supply;
    if (volume > best) {
      best = volume;
      low = price;
      high = price;
    } else if (volume === best && volume > 0n) {
      high = price;
    }
  }
  if (best === 0n || low === null || high === null) return { outcome: 'no_cross', price: null, volume: 0n };
  const price = (low + high) / 2n;
  const band = (input.referencePrice * BigInt(input.bandBps)) / 10_000n;
  if (price < input.referencePrice - band || price > input.referencePrice + band) {
    return { outcome: 'outside_band', price, volume: 0n };
  }
  return { outcome: 'cleared', price, volume: best };
}
