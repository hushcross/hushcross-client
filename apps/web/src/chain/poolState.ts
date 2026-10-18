import type { DepositRecord, ExitRecord, PoolDeployment, WithdrawalRecord } from '@hushcross/core';
import type { Address, Asset, Hex } from '../data/types';
import type { ChainPort, PoolLog } from './ports';

export type DepositLog = Extract<PoolLog, { kind: 'deposit' }>;
export type WithdrawalLog = Extract<PoolLog, { kind: 'withdrawal' }>;
export type RagequitLog = Extract<PoolLog, { kind: 'ragequit' }>;

export interface PoolSnapshot {
  readonly asset: Asset;
  readonly pool: Address;
  readonly scope: bigint;
  readonly deposits: readonly DepositLog[];
  readonly withdrawals: readonly WithdrawalLog[];
  readonly ragequits: readonly RagequitLog[];
  /** State-tree leaves in insertion order. */
  readonly leaves: readonly bigint[];
  readonly syncedTo: bigint;
}

/** Incremental log sync for one pool (from the deployment start block to the head). */
export class PoolSync {
  private logs: PoolLog[] = [];
  private syncedTo: bigint;
  private inflight: Promise<PoolSnapshot> | null = null;
  private snapshot: PoolSnapshot | null = null;

  constructor(
    private readonly chain: ChainPort,
    readonly asset: Asset,
    readonly deployment: PoolDeployment,
    startBlock: bigint,
  ) {
    this.syncedTo = startBlock - 1n;
  }

  sync(): Promise<PoolSnapshot> {
    this.inflight ??= this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async run(): Promise<PoolSnapshot> {
    const head = await this.chain.getBlockNumber();
    if (head > this.syncedTo || !this.snapshot) {
      if (head > this.syncedTo) {
        const fresh = await this.chain.getPoolLogs(this.deployment.pool, this.syncedTo + 1n, head);
        this.logs = [...this.logs, ...fresh];
        this.syncedTo = head;
      }
      this.snapshot = build(this.asset, this.deployment, this.logs, this.syncedTo);
    }
    return this.snapshot;
  }
}

function build(asset: Asset, deployment: PoolDeployment, logs: readonly PoolLog[], syncedTo: bigint): PoolSnapshot {
  const deposits: DepositLog[] = [];
  const withdrawals: WithdrawalLog[] = [];
  const ragequits: RagequitLog[] = [];
  const leaves: { index: bigint; leaf: bigint }[] = [];
  for (const log of logs) {
    if (log.kind === 'deposit') deposits.push(log);
    else if (log.kind === 'withdrawal') withdrawals.push(log);
    else if (log.kind === 'ragequit') ragequits.push(log);
    else leaves.push({ index: log.index, leaf: log.leaf });
  }
  leaves.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));
  return { asset, pool: deployment.pool, scope: deployment.scope, deposits, withdrawals, ragequits, leaves: leaves.map((l) => l.leaf), syncedTo };
}

export function depositRecords(snapshot: PoolSnapshot): DepositRecord[] {
  return snapshot.deposits.map((d) => ({ poolId: snapshot.asset, depositor: d.depositor, commitment: d.commitment, label: d.label, value: d.value, precommitment: d.precommitment }));
}

export function withdrawalRecords(snapshot: PoolSnapshot): WithdrawalRecord[] {
  return snapshot.withdrawals.map((w) => ({ poolId: snapshot.asset, value: w.value, spentNullifier: w.spentNullifier, newCommitment: w.newCommitment }));
}

export function exitRecords(snapshot: PoolSnapshot): ExitRecord[] {
  return snapshot.ragequits.map((r) => ({ poolId: snapshot.asset, commitment: r.commitment, label: r.label, value: r.value }));
}

export function depositByPrecommitment(snapshot: PoolSnapshot, precommitment: bigint): DepositLog | undefined {
  return snapshot.deposits.find((d) => d.precommitment === precommitment);
}

export function spentNullifiers(snapshot: PoolSnapshot): Map<bigint, WithdrawalLog> {
  return new Map(snapshot.withdrawals.map((w) => [w.spentNullifier, w]));
}

/** Deposits into the same pool after `tx` / `logIndex` (the anonymity set growth). */
export function depositsAfter(snapshot: PoolSnapshot, block: bigint, logIndex: number): number {
  return snapshot.deposits.filter((d) => d.block > block || (d.block === block && d.logIndex > logIndex)).length;
}

export function depositsInTx(snapshot: PoolSnapshot, tx: Hex): readonly DepositLog[] {
  return snapshot.deposits.filter((d) => d.tx === tx);
}
