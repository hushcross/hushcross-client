import { smallestUnitAtLeast, type Job, type JobDraft } from '@hushcross/core';
import type { Asset, OrderSide } from './types';
import { UNIT_VALUES } from './units';

/** Params of a one-step "Place a sealed order" job (Book, vault-funded, relay reveal and claim). */
export interface OrderParams {
  readonly pairId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly limitPrice: bigint;
  readonly amount: bigint;
  readonly rollover: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const big = (v: unknown): bigint => (typeof v === 'string' && /^\d+$/.test(v) ? BigInt(v) : 0n);

export function orderParams(job: Job): OrderParams {
  return { pairId: str(job.params.pairId), symbol: str(job.params.symbol), side: job.params.side === 'sell' ? 'sell' : 'buy', limitPrice: big(job.params.limitPrice), amount: big(job.params.amount), rollover: job.params.rollover === true };
}

/**
 * One vault note must cover `withdrawn` (from `quoteOrder`); when the vault has none, the smallest unit that
 * covers it is deposited from the wallet first.
 */
export function orderDraft(input: { readonly asset: Asset; readonly pairId: string; readonly symbol: string; readonly side: OrderSide; readonly limitPrice: bigint; readonly amount: bigint; readonly withdrawn: bigint; readonly rollover?: boolean }): JobDraft | null {
  const fundUnit = smallestUnitAtLeast(input.withdrawn, UNIT_VALUES[input.asset]);
  if (fundUnit === null || input.withdrawn <= 0n) return null;
  return {
    kind: 'order',
    asset: input.asset,
    pieces: [input.withdrawn],
    fundPieces: [fundUnit],
    params: { pairId: input.pairId, symbol: input.symbol, side: input.side, limitPrice: input.limitPrice.toString(), amount: input.amount.toString(), rollover: input.rollover === true },
  };
}
