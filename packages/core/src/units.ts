import { CoreError, RelayFeeAboveCapError } from "./errors.js";

export const VETTING_FEE_BPS = 30n;
export const MAX_RELAY_FEE_BPS = 150n;
export const BPS_DENOMINATOR = 10_000n;

const WEI = 10n ** 18n;

/** Pool net amounts, smallest first. Both assets use 18 decimals. */
export const BNB_UNITS = [2n * 10n ** 16n, 10n ** 17n, 5n * 10n ** 17n, 2n * WEI, 10n * WEI] as const;
export const USDT_UNITS = [20n * WEI, 100n * WEI, 500n * WEI, 2000n * WEI, 10_000n * WEI] as const;

export interface UnitCount {
  readonly unit: bigint;
  readonly count: bigint;
}

export interface UnitSplit {
  readonly counts: readonly UnitCount[];
  readonly remainder: bigint;
}

export interface RelayFeeInput {
  readonly gas: bigint;
  readonly gasPriceWei: bigint;
  readonly assetPerBnb: bigint;
  readonly amount: bigint;
  readonly maxBps?: bigint;
}

/** Matches Entrypoint._deductFee: amount - floor(amount * bps / 10_000). */
export function netAfterFee(gross: bigint, feeBps: bigint): bigint {
  assertBps(feeBps);
  if (gross < 0n) throw new CoreError("amount", "gross must be non-negative");
  return gross - (gross * feeBps) / BPS_DENOMINATOR;
}

/** Smallest gross whose fee-adjusted net is exactly `net`. */
export function grossForNet(net: bigint, feeBps: bigint): bigint {
  assertBps(feeBps);
  if (net < 0n) throw new CoreError("amount", "net must be non-negative");
  if (feeBps === 0n) return net;
  const keep = BPS_DENOMINATOR - feeBps;
  const product = net * feeBps;
  const feeMax = product / keep;
  const feeMin = product >= BPS_DENOMINATOR ? ceilDiv(product - (BPS_DENOMINATOR - 1n), keep) : 0n;
  for (let fee = feeMin; fee <= feeMax; fee += 1n) {
    const gross = net + fee;
    if (netAfterFee(gross, feeBps) === net) return gross;
  }
  throw new CoreError("no_exact_gross", "no gross amount nets to the requested unit");
}

/** Greedy split, largest denomination first. The input list is not modified. */
export function splitIntoUnits(amount: bigint, units: readonly bigint[]): UnitSplit {
  if (amount < 0n) throw new CoreError("amount", "amount must be non-negative");
  const ordered = [...units].sort((left, right) => (left > right ? -1 : left < right ? 1 : 0));
  const seen = new Set<bigint>();
  const counts: UnitCount[] = [];
  let remainder = amount;
  for (const unit of ordered) {
    if (unit <= 0n) throw new CoreError("unit", "unit must be positive");
    if (seen.has(unit)) continue;
    seen.add(unit);
    const count = remainder / unit;
    if (count > 0n) {
      counts.push({ unit, count });
      remainder -= count * unit;
    }
  }
  return { counts, remainder };
}

/**
 * Relay quote: ceil(gas * gasPrice * assetPerBnb * 1.25 / 1e18), then ceil to basis points.
 * `assetPerBnb` is the asset's base units equal to 1 BNB (1e18 for the BNB pool).
 */
export function relayFeeBps(input: RelayFeeInput): bigint {
  const maxBps = input.maxBps ?? MAX_RELAY_FEE_BPS;
  assertBps(maxBps);
  if (input.amount <= 0n) throw new CoreError("amount", "amount must be positive");
  if (input.gas < 0n || input.gasPriceWei < 0n || input.assetPerBnb <= 0n) {
    throw new CoreError("relay_quote", "gas price inputs must be non-negative");
  }
  const numerator = input.gas * input.gasPriceWei * input.assetPerBnb * 5n;
  const denominator = WEI * 4n;
  const cost = numerator === 0n ? 0n : ceilDiv(numerator, denominator);
  const bps = cost === 0n ? 0n : ceilDiv(cost * BPS_DENOMINATOR, input.amount);
  if (bps > maxBps) throw new RelayFeeAboveCapError(bps, maxBps);
  return bps;
}

function assertBps(feeBps: bigint): void {
  if (feeBps < 0n || feeBps >= BPS_DENOMINATOR) {
    throw new CoreError("fee_bps", "bps must be in [0, 10000)");
  }
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
