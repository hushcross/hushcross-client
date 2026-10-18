import { getAddress, isAddress, type Address } from "viem";
import { commitmentOf, nullifierHash } from "./commitment.js";
import { CoreError, DuplicateNullifierError, DuplicatePrecommitmentError, RecoveryMismatchError } from "./errors.js";
import { deriveChangeSecrets, deriveDepositSecrets, deriveMasterKeys, type MasterKeys, type NoteSecrets } from "./keys.js";

export const RECOVERY_GAP_LIMIT = 128;

export type NoteStatus = "active" | "spent" | "exited";

export interface RecoveryPool {
  readonly poolId: string;
  readonly scope: bigint;
}

export interface DepositRecord {
  readonly poolId: string;
  readonly depositor: Address;
  readonly commitment: bigint;
  readonly label: bigint;
  readonly value: bigint;
  readonly precommitment: bigint;
}

export interface WithdrawalRecord {
  readonly poolId: string;
  readonly value: bigint;
  readonly spentNullifier: bigint;
  readonly newCommitment: bigint;
}

export interface ExitRecord {
  readonly poolId: string;
  readonly commitment: bigint;
  readonly label: bigint;
  readonly value: bigint;
}

export interface RecoveredNote {
  readonly poolId: string;
  readonly scope: bigint;
  readonly index: bigint;
  readonly label: bigint;
  readonly balance: bigint;
  readonly commitment: bigint;
  readonly nullifier: bigint;
  readonly secret: bigint;
  readonly precommitment: bigint;
  readonly status: NoteStatus;
  readonly withdrawalCount: number;
  readonly depositor: Address;
}

export interface RecoveryResult {
  readonly notes: readonly RecoveredNote[];
  readonly nextIndex: bigint;
  readonly highestUsedIndex: bigint | null;
}

export interface RecoveryInput {
  readonly phrase: string;
  readonly pools: readonly [RecoveryPool, RecoveryPool];
  readonly deposits: readonly DepositRecord[];
  readonly withdrawals: readonly WithdrawalRecord[];
  readonly exits: readonly ExitRecord[];
}

interface IndexedDeposit {
  readonly pool: RecoveryPool;
  readonly secrets: NoteSecrets;
  readonly deposit: DepositRecord;
}

/**
 * Rebuild notes from two pools. An index is used when either pool has its precommitment (derived with either
 * pool's scope).
 * Scanning stops after 128 consecutive unused indexes.
 */
export function recoverNotes(input: RecoveryInput): RecoveryResult {
  const pools = input.pools;
  if (pools[0].poolId === pools[1].poolId) throw new CoreError("pool", "the two pools must have distinct ids");
  const known = new Set(pools.map((pool) => pool.poolId));
  const keys = deriveMasterKeys(input.phrase);
  const deposits = indexDeposits(input.deposits, known);
  const withdrawals = indexWithdrawals(input.withdrawals, known);
  const exits = indexExits(input.exits, known);

  const notes: RecoveredNote[] = [];
  let index = 0n;
  let gap = 0;
  let highestUsedIndex: bigint | null = null;
  while (gap < RECOVERY_GAP_LIMIT) {
    // Secrets are normally derived with the pool's own scope. Book claims split one order's out-flows over
    // both pools from a single precommitment list, so a note may sit in the other pool: try both scopes.
    const derived = pools.map((pool) => deriveDepositSecrets(keys, pool.scope, index));
    const hits = pools.flatMap((pool) =>
      derived.flatMap((secrets) => {
        const deposit = deposits.get(key(pool.poolId, secrets.precommitment));
        return deposit ? [{ pool, secrets, deposit }] : [];
      }),
    );
    if (hits.length === 0) {
      gap += 1;
    } else {
      gap = 0;
      highestUsedIndex = index;
      for (const hit of hits) notes.push(walkNote(keys, hit, index, withdrawals, exits));
    }
    index += 1n;
  }
  return {
    notes,
    nextIndex: highestUsedIndex === null ? 0n : highestUsedIndex + 1n,
    highestUsedIndex,
  };
}

function walkNote(
  keys: MasterKeys,
  hit: IndexedDeposit,
  index: bigint,
  withdrawals: ReadonlyMap<string, WithdrawalRecord>,
  exits: ReadonlyMap<string, ExitRecord>,
): RecoveredNote {
  const { pool, deposit } = hit;
  const opened = commitmentOf(deposit.value, deposit.label, hit.secrets.nullifier, hit.secrets.secret);
  if (opened.commitment !== deposit.commitment || opened.precommitment !== deposit.precommitment) {
    throw new RecoveryMismatchError("deposit commitment does not match the derived secrets");
  }
  if (!isAddress(deposit.depositor)) throw new CoreError("address", "depositor is not an address");

  let balance = deposit.value;
  let nullifier = hit.secrets.nullifier;
  let secret = hit.secrets.secret;
  let precommitment = hit.secrets.precommitment;
  let commitment = deposit.commitment;
  let withdrawalCount = 0;
  let status: NoteStatus = balance === 0n ? "spent" : "active";
  const spent: bigint[] = [];

  for (;;) {
    const withdrawal = withdrawals.get(key(pool.poolId, nullifierHash(nullifier)));
    const exit = exits.get(key(pool.poolId, commitment));
    if (withdrawal && exit) {
      throw new RecoveryMismatchError("withdrawal and exit both spend the current commitment");
    }
    if (withdrawal) {
      if (withdrawal.value < 0n || withdrawal.value > balance) {
        throw new RecoveryMismatchError("withdrawn value exceeds the note balance");
      }
      if (withdrawalCount > 1024) throw new RecoveryMismatchError("withdrawal chain is too long");
      const next = deriveChangeSecrets(keys, deposit.label, BigInt(withdrawalCount));
      if (next.nullifier === nullifier) throw new RecoveryMismatchError("change nullifier did not advance");
      const remaining = balance - withdrawal.value;
      const nextNote = commitmentOf(remaining, deposit.label, next.nullifier, next.secret);
      if (nextNote.commitment !== withdrawal.newCommitment) {
        throw new RecoveryMismatchError("change commitment does not match the withdrawal event");
      }
      spent.push(commitment);
      balance = remaining;
      nullifier = next.nullifier;
      secret = next.secret;
      precommitment = next.precommitment;
      commitment = nextNote.commitment;
      withdrawalCount += 1;
      status = balance === 0n ? "spent" : "active";
      continue;
    }
    if (exit) {
      if (exit.label !== deposit.label || exit.value !== balance) {
        throw new RecoveryMismatchError("exit does not match the current note");
      }
      status = "exited";
      balance = 0n;
      break;
    }
    break;
  }

  for (const previous of spent) {
    if (exits.has(key(pool.poolId, previous))) {
      throw new RecoveryMismatchError("exit spends a commitment that was already withdrawn");
    }
  }

  return {
    poolId: pool.poolId,
    scope: pool.scope,
    index,
    label: deposit.label,
    balance,
    commitment,
    nullifier,
    secret,
    precommitment,
    status,
    withdrawalCount,
    depositor: getAddress(deposit.depositor),
  };
}

function indexDeposits(records: readonly DepositRecord[], known: ReadonlySet<string>): Map<string, DepositRecord> {
  const indexed = new Map<string, DepositRecord>();
  for (const record of records) {
    requirePool(record.poolId, known);
    const id = key(record.poolId, record.precommitment);
    if (indexed.has(id)) throw new DuplicatePrecommitmentError(record.poolId);
    indexed.set(id, record);
  }
  return indexed;
}

function indexWithdrawals(
  records: readonly WithdrawalRecord[],
  known: ReadonlySet<string>,
): Map<string, WithdrawalRecord> {
  const indexed = new Map<string, WithdrawalRecord>();
  for (const record of records) {
    requirePool(record.poolId, known);
    const id = key(record.poolId, record.spentNullifier);
    if (indexed.has(id)) throw new DuplicateNullifierError(record.poolId);
    indexed.set(id, record);
  }
  return indexed;
}

function indexExits(records: readonly ExitRecord[], known: ReadonlySet<string>): Map<string, ExitRecord> {
  const indexed = new Map<string, ExitRecord>();
  for (const record of records) {
    requirePool(record.poolId, known);
    const id = key(record.poolId, record.commitment);
    if (indexed.has(id)) throw new RecoveryMismatchError("duplicate exit for one commitment");
    indexed.set(id, record);
  }
  return indexed;
}

function requirePool(poolId: string, known: ReadonlySet<string>): void {
  if (!known.has(poolId)) throw new CoreError("pool", `unknown pool ${poolId}`);
}

function key(poolId: string, value: bigint): string {
  return `${poolId}:${value.toString()}`;
}
