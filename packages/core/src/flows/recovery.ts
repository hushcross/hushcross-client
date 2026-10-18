import type { Address } from "viem";
import type { GiftPacketRef } from "../gift.js";
import { nullifierHash } from "../commitment.js";
import { recoverNotes, type DepositRecord, type ExitRecord, type RecoveryResult, type WithdrawalRecord } from "../recovery.js";

export interface ScanPool {
  readonly poolId: string;
  readonly scope: bigint;
  readonly address: Address;
}

export interface PoolEvents {
  readonly deposits: readonly DepositRecord[];
  readonly withdrawals: readonly WithdrawalRecord[];
  readonly exits: readonly ExitRecord[];
}

/** Reads `Deposited`, `Withdrawn` and `Ragequit` for one pool (RPC logs or the indexer). */
export interface PoolEventSource {
  poolEvents(pool: ScanPool): Promise<PoolEvents>;
}

/** Recovery across both pools with the shared index line (an index used in either pool is used). */
export async function scanAccount(input: {
  readonly phrase: string;
  readonly pools: readonly [ScanPool, ScanPool];
  readonly source: PoolEventSource;
}): Promise<RecoveryResult> {
  const [first, second] = await Promise.all(input.pools.map((pool) => input.source.poolEvents(pool)));
  const events = [first, second].filter((value): value is PoolEvents => value !== undefined);
  return recoverNotes({
    phrase: input.phrase,
    pools: [
      { poolId: input.pools[0].poolId, scope: input.pools[0].scope },
      { poolId: input.pools[1].poolId, scope: input.pools[1].scope },
    ],
    deposits: events.flatMap((e) => e.deposits),
    withdrawals: events.flatMap((e) => e.withdrawals),
    exits: events.flatMap((e) => e.exits),
  });
}

export interface GiftPacketStatus {
  readonly ref: GiftPacketRef;
  readonly funded: boolean;
  readonly spent: boolean;
  readonly deposit: DepositRecord | null;
}

/** Locate gift packets in pool events: funded = deposit with its precommitment, spent = nullifier used. */
export function findGiftPacketStates(
  refs: readonly GiftPacketRef[],
  deposits: readonly DepositRecord[],
  spentNullifierHashes: ReadonlySet<bigint>,
): GiftPacketStatus[] {
  const byPrecommitment = new Map(deposits.map((d) => [d.precommitment, d]));
  return refs.map((ref) => {
    const deposit = byPrecommitment.get(ref.secrets.precommitment) ?? null;
    return { ref, funded: deposit !== null, spent: deposit !== null && spentNullifierHashes.has(nullifierHash(ref.secrets.nullifier)), deposit };
  });
}
