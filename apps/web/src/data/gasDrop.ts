import { gasDropPolicy } from '@hushcross/core';
import type { Asset, GasDropNote } from './types';

/** Relay fee cap (Entrypoint `maxRelayFeeBPS`). */
export const MAX_RELAY_FEE_BPS = 150n;

export interface GasDropDecision {
  readonly gasDrop: bigint;
  readonly offered: boolean;
  readonly defaultOn: boolean;
  readonly note: GasDropNote | null;
}

/**
 * The decided gas-drop rules for one withdrawal, for sources that price fees themselves (the mock):
 * no drop on BNB, default on from 100 USDT, and never a drop that would lift the fee above the cap.
 * `dropCostInAsset` is the drop's value in the withdrawn asset.
 */
export function decideGasDrop(input: { readonly asset: Asset; readonly amount: bigint; readonly wanted: boolean; readonly gasDropWei: bigint; readonly relayFee: bigint; readonly dropCostInAsset: bigint }): GasDropDecision {
  const policy = gasDropPolicy(input.asset, input.amount);
  const base = { offered: policy.offered, defaultOn: policy.defaultOn };
  if (!policy.offered) return { ...base, gasDrop: 0n, note: policy.reason };
  const overCap = (input.relayFee + input.dropCostInAsset) * 10_000n > input.amount * MAX_RELAY_FEE_BPS;
  if (overCap) return { ...base, gasDrop: 0n, note: 'gas_drop_over_cap' };
  if (!input.wanted) return { ...base, gasDrop: 0n, note: policy.reason };
  return { ...base, gasDrop: input.gasDropWei, note: null };
}
