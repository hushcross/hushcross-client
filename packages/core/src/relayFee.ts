import { CoreError, RelayFeeAboveCapError } from "./errors.js";
import { BPS_DENOMINATOR, MAX_RELAY_FEE_BPS } from "./units.js";

export interface ChainlinkPrice {
  readonly answer: bigint;
  readonly decimals: number;
  /** Unix seconds from `latestRoundData().updatedAt`. */
  readonly updatedAt: bigint;
}

export interface RelayQuoteInput {
  readonly gas: bigint;
  readonly gasPriceWei: bigint;
  /** BNB attached by the relay for `send` (0 otherwise). */
  readonly gasDropWei: bigint;
  readonly bnbUsd: ChainlinkPrice;
  /** Price of the pool asset. For the BNB pool pass the BNB/USD feed again. */
  readonly assetUsd: ChainlinkPrice;
  /** Amount withdrawn from the pool (the fee base). */
  readonly amount: bigint;
  /** Relay's configured floor for this pool (`/v1/info`). */
  readonly minBps: bigint;
  readonly maxBps?: bigint;
  readonly nowSec: bigint;
  readonly maxPriceAgeSec?: bigint;
  /** Safety bump as a fraction, default 5/4 = x1.25 over the relay's own 1.2 check. */
  readonly bump?: { readonly numerator: bigint; readonly denominator: bigint };
}

export interface RelayQuote {
  readonly feeBps: bigint;
  readonly fee: bigint;
  /** Unbumped gas + gas drop cost in asset base units. */
  readonly costInAsset: bigint;
}

const WAD_DECIMALS = 18;

/**
 * Fee bump per SPEC 2 / INTERFACES 4: convert (gas x gasPrice + gasDrop) from BNB into the pool
 * asset with Chainlink, multiply by 1.25, round up to whole bps, never below the relay floor,
 * and refuse anything above the cap (default 150 bps).
 */
export function quoteRelayFee(input: RelayQuoteInput): RelayQuote {
  const maxBps = input.maxBps ?? MAX_RELAY_FEE_BPS;
  const bump = input.bump ?? { numerator: 5n, denominator: 4n };
  if (input.amount <= 0n) throw new CoreError("amount", "amount must be positive");
  if (input.gas < 0n || input.gasPriceWei < 0n || input.gasDropWei < 0n) throw new CoreError("relay_quote", "gas inputs must be non-negative");
  const bnb = normalize(input.bnbUsd, input.nowSec, input.maxPriceAgeSec);
  const asset = normalize(input.assetUsd, input.nowSec, input.maxPriceAgeSec);
  const costWei = input.gas * input.gasPriceWei + input.gasDropWei;
  const costInAsset = ceilDiv(costWei * bnb, asset);
  const bumped = ceilDiv(costInAsset * bump.numerator, bump.denominator);
  const needed = bumped === 0n ? 0n : ceilDiv(bumped * BPS_DENOMINATOR, input.amount);
  const feeBps = needed > input.minBps ? needed : input.minBps;
  if (feeBps > maxBps) throw new RelayFeeAboveCapError(feeBps, maxBps);
  return { feeBps, fee: (input.amount * feeBps) / BPS_DENOMINATOR, costInAsset };
}

function normalize(price: ChainlinkPrice, nowSec: bigint, maxAge: bigint = 3600n): bigint {
  if (price.answer <= 0n || price.updatedAt <= 0n || price.updatedAt > nowSec) throw new CoreError("bad_price", "Chainlink price is invalid");
  if (nowSec - price.updatedAt > maxAge) throw new CoreError("stale_price", "Chainlink price is stale");
  if (!Number.isInteger(price.decimals) || price.decimals < 0 || price.decimals > 36) throw new CoreError("bad_price", "Chainlink decimals are invalid");
  return price.decimals <= WAD_DECIMALS
    ? price.answer * 10n ** BigInt(WAD_DECIMALS - price.decimals)
    : price.answer / 10n ** BigInt(price.decimals - WAD_DECIMALS);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}
