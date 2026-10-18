import { RelayFeeAboveCapError } from "./errors.js";
import { quoteRelayFee, type RelayQuote, type RelayQuoteInput } from "./relayFee.js";

/**
 * Gas-drop rules (decided 2026-10-17), shared by sends and gift claims to an address:
 * - BNB withdrawals never offer a gas drop (the recipient already receives BNB for gas).
 * - USDT withdrawals offer it; it defaults ON only from 100 USDT per withdrawal, otherwise OFF.
 * - A drop is never requested when it would push the relay fee above the cap (`gas_drop_over_cap`).
 */
export const GAS_DROP_DEFAULT_MIN_USDT = 100n * 10n ** 18n;

export type GasDropAsset = "BNB" | "USDT";
export type GasDropReason = "bnb_never" | "below_default_minimum" | "gas_drop_over_cap";

export interface GasDropPolicy {
  /** The option may be shown / chosen for this withdrawal. */
  readonly offered: boolean;
  /** Initial state of the switch. */
  readonly defaultOn: boolean;
  /** Why it is not offered or not on by default (null when offered and on). */
  readonly reason: GasDropReason | null;
}

export function gasDropPolicy(asset: GasDropAsset, withdrawn: bigint): GasDropPolicy {
  if (asset === "BNB") return { offered: false, defaultOn: false, reason: "bnb_never" };
  if (withdrawn < GAS_DROP_DEFAULT_MIN_USDT) return { offered: true, defaultOn: false, reason: "below_default_minimum" };
  return { offered: true, defaultOn: true, reason: null };
}

export interface GasDropQuote extends RelayQuote {
  /** BNB wei the relay will attach (0 when the drop is not applied). */
  readonly gasDropWei: bigint;
  readonly gasDropApplied: boolean;
  /** Set when a drop was wanted but not applied. */
  readonly gasDropReason: GasDropReason | null;
}

/**
 * Quote a relayed withdrawal and decide whether the drop is attached. `wantDrop` is the user's switch;
 * the drop is applied only when the policy offers it and the fee including it stays within the cap.
 * Without the drop the quote may still throw `RelayFeeAboveCapError` (the withdrawal itself is too small).
 */
export function quoteWithGasDrop(asset: GasDropAsset, wantDrop: boolean, input: Omit<RelayQuoteInput, "gasDropWei"> & { readonly gasDropWei: bigint }): GasDropQuote {
  const policy = gasDropPolicy(asset, input.amount);
  const base = { ...input, gasDropWei: 0n };
  if (!wantDrop) return { ...quoteRelayFee(base), gasDropWei: 0n, gasDropApplied: false, gasDropReason: null };
  if (!policy.offered) return { ...quoteRelayFee(base), gasDropWei: 0n, gasDropApplied: false, gasDropReason: policy.reason };
  try {
    return { ...quoteRelayFee(input), gasDropWei: input.gasDropWei, gasDropApplied: input.gasDropWei > 0n, gasDropReason: null };
  } catch (error: unknown) {
    if (!(error instanceof RelayFeeAboveCapError)) throw error;
    return { ...quoteRelayFee(base), gasDropWei: 0n, gasDropApplied: false, gasDropReason: "gas_drop_over_cap" };
  }
}
