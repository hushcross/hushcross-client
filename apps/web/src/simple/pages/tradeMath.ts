import type { OrderSide, Pair } from '../../data/types';

/** The clearing price must sit within ±2% of the oracle reference (SPEC §5). */
export const BAND_BPS = 200n;
/** The "near" preset: 0.5% on the willing side of the reference. */
export const NEAR_BPS = 50n;

export type PricePreset = 'near' | 'edge' | 'custom';

export const snapDown = (value: bigint, step: bigint): bigint => (step > 0n ? value - (value % step) : value);
export const snapUp = (value: bigint, step: bigint): bigint => (step > 0n && value % step !== 0n ? value - (value % step) + step : value);

export function bandOf(pair: Pair): { readonly low: bigint; readonly high: bigint } {
  const width = (pair.referencePrice * BAND_BPS) / 10_000n;
  return { low: snapUp(pair.referencePrice - width, pair.tick), high: snapDown(pair.referencePrice + width, pair.tick) };
}

/**
 * Limit presets. A buy is willing to pay a little above the reference, a sell to take a little below,
 * so a batch that clears near the reference fills them. "edge" goes to the band limit, the most
 * willing price that can still clear.
 */
export function presetPrices(pair: Pair, side: OrderSide): { readonly near: bigint; readonly edge: bigint } {
  const ref = pair.referencePrice;
  const near = (ref * NEAR_BPS) / 10_000n;
  const band = bandOf(pair);
  return side === 'buy' ? { near: snapDown(ref + near, pair.tick), edge: band.high } : { near: snapUp(ref - near, pair.tick), edge: band.low };
}

/** A limit that can never fill: a buy below the band or a sell above it. */
export function cannotFill(pair: Pair, side: OrderSide, price: bigint): boolean {
  const band = bandOf(pair);
  return side === 'buy' ? price < band.low : price > band.high;
}
