import { CoreError } from "../errors.js";
import type { BookSide } from "./commitment.js";
import { bookWithinBand } from "./market.js";

/**
 * Browser-safe settlement certificate for `SealedBook.settle(pLow, pHigh, pivot, marginalLevel)` (BOOK.md 5-6),
 * computed from the valid revealed orders of one epoch. Cross-checked against the reference implementation
 * (`clearBook` in packages/clearing) in the core tests; the contract's `preview` stays the authority.
 */
export interface SettleOrder {
  readonly side: BookSide;
  readonly limitPrice: bigint;
  readonly quantity: bigint;
}

export type SettleProposal =
  | { readonly status: "no_cross" }
  | {
      readonly status: "cleared" | "band_fail";
      /** Uniform price p* (on band failure: the price that failed the guard). */
      readonly price: bigint;
      readonly volume: bigint;
      readonly pLow: bigint;
      readonly pHigh: bigint;
      readonly pivot: bigint;
      /** Long-side marginal level; 0 when balanced or on band failure. */
      readonly marginalLevel: bigint;
    };

export function bookSettleProposal(orders: readonly SettleOrder[], tick: bigint, referencePrice: bigint): SettleProposal {
  if (tick <= 0n) throw new CoreError("book_settle", "tick must be positive");
  const buys = orders.filter((o) => o.side === "buy" && o.quantity > 0n);
  const sells = orders.filter((o) => o.side === "sell" && o.quantity > 0n);
  if (buys.length === 0 || sells.length === 0) return { status: "no_cross" };
  const demand = (p: bigint): bigint => buys.reduce((sum, o) => (o.limitPrice >= p ? sum + o.quantity : sum), 0n);
  const supply = (p: bigint): bigint => sells.reduce((sum, o) => (o.limitPrice <= p ? sum + o.quantity : sum), 0n);
  const volumeAt = (p: bigint): bigint => {
    const d = demand(p);
    const s = supply(p);
    return d < s ? d : s;
  };
  const maxBuy = buys.reduce((m, o) => (o.limitPrice > m ? o.limitPrice : m), 0n);
  const minSell = sells.reduce((m, o) => (o.limitPrice < m ? o.limitPrice : m), sells[0]?.limitPrice ?? 0n);
  if (maxBuy < minSell) return { status: "no_cross" };

  const sellLimits = uniqueSorted(sells.map((o) => o.limitPrice));
  const buyLimits = uniqueSorted(buys.map((o) => o.limitPrice));
  // V rises only at sell limits and falls only just above buy limits, so both plateau ends are limits.
  let best = 0n;
  for (const p of [...sellLimits, ...buyLimits]) {
    const v = volumeAt(p);
    if (v > best) best = v;
  }
  if (best === 0n) return { status: "no_cross" };
  const pLow = sellLimits.find((p) => volumeAt(p) === best);
  const pHigh = [...buyLimits].reverse().find((p) => volumeAt(p) === best);
  if (pLow === undefined || pHigh === undefined || pLow > pHigh) throw new CoreError("book_settle", "plateau endpoints not found");
  const price = tick * ((pLow / tick + pHigh / tick + 1n) / 2n);

  // Pivot: the lowest tick where supply catches up with demand (the crossing).
  const candidates = uniqueSorted([...sellLimits, ...buyLimits.map((b) => b + tick)]);
  const pivot = candidates.find((c) => supply(c) >= demand(c));
  if (pivot === undefined) throw new CoreError("book_settle", "no pivot");

  if (!bookWithinBand(price, referencePrice)) return { status: "band_fail", price, volume: best, pLow, pHigh, pivot, marginalLevel: 0n };

  const d = demand(price);
  const s = supply(price);
  let marginalLevel = 0n;
  if (d > s) {
    const level = [...buyLimits].reverse().find((b) => b >= price && demand(b) >= best);
    if (level === undefined) throw new CoreError("book_settle", "no buy marginal level");
    marginalLevel = level;
  } else if (s > d) {
    const level = sellLimits.find((x) => x <= price && supply(x) >= best);
    if (level === undefined) throw new CoreError("book_settle", "no sell marginal level");
    marginalLevel = level;
  }
  return { status: "cleared", price, volume: best, pLow, pHigh, pivot, marginalLevel };
}

function uniqueSorted(values: readonly bigint[]): bigint[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
