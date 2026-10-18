import { encodeFunctionData, getAddress, type Address } from "viem";
import { ENTRYPOINT_ABI, ERC20_ABI } from "../abi.js";
import { CoreError } from "../errors.js";
import type { TxRequest } from "../hushId.js";
import { deriveDepositSecrets, type MasterKeys, type NoteSecrets } from "../keys.js";
import { grossForNet } from "../units.js";

export type DepositAsset = { readonly kind: "native" } | { readonly kind: "erc20"; readonly token: Address };

export interface DepositPlanInput {
  readonly asset: DepositAsset;
  readonly entrypoint: Address;
  /** Net unit that should land in the pool per note. */
  readonly unit: bigint;
  readonly count: number;
  readonly vettingFeeBps: bigint;
  readonly keys: MasterKeys;
  readonly scope: bigint;
  /** First unused account index (shared across both pools). */
  readonly startIndex: bigint;
  /** Current ERC-20 allowance of the wallet for the Entrypoint. */
  readonly allowance?: bigint;
}

export interface PlannedNote {
  readonly index: bigint;
  readonly secrets: NoteSecrets;
  readonly value: bigint;
}

export interface DepositPlan {
  readonly txs: readonly TxRequest[];
  readonly notes: readonly PlannedNote[];
  readonly grossEach: bigint;
  readonly grossTotal: bigint;
}

/**
 * Public deposit from the connected wallet: one Entrypoint deposit per unit (one note each),
 * gross amount grossed up so the pool keeps exactly `unit` after the vetting fee.
 * ERC-20 deposits are preceded by an approval of exactly the total, only when needed.
 */
export function planDeposit(input: DepositPlanInput): DepositPlan {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 100) throw new CoreError("deposit_count", "deposit count must be 1-100");
  if (input.unit <= 0n) throw new CoreError("amount", "unit must be positive");
  const entrypoint = getAddress(input.entrypoint);
  const grossEach = grossForNet(input.unit, input.vettingFeeBps);
  const grossTotal = grossEach * BigInt(input.count);
  const notes: PlannedNote[] = Array.from({ length: input.count }, (_, offset) => {
    const index = input.startIndex + BigInt(offset);
    return { index, secrets: deriveDepositSecrets(input.keys, input.scope, index), value: input.unit };
  });
  const { txs } = planPrecommitmentDeposits({
    asset: input.asset,
    entrypoint,
    deposits: notes.map((note) => ({ precommitment: note.secrets.precommitment, gross: grossEach })),
    ...(input.allowance === undefined ? {} : { allowance: input.allowance }),
  });
  return { txs, notes, grossEach, grossTotal };
}

export interface PrecommitmentDeposit {
  readonly precommitment: bigint;
  /** Amount sent to the Entrypoint (net + vetting fee). */
  readonly gross: bigint;
}

/** Entrypoint deposits for arbitrary precommitments (account notes or gift packets). */
export function planPrecommitmentDeposits(input: {
  readonly asset: DepositAsset;
  readonly entrypoint: Address;
  readonly deposits: readonly PrecommitmentDeposit[];
  readonly allowance?: bigint;
}): { readonly txs: readonly TxRequest[]; readonly total: bigint } {
  if (input.deposits.length === 0) throw new CoreError("deposit_count", "nothing to deposit");
  const entrypoint = getAddress(input.entrypoint);
  const total = input.deposits.reduce((sum, d) => sum + d.gross, 0n);
  const txs: TxRequest[] = [];
  if (input.asset.kind === "erc20") {
    const token = getAddress(input.asset.token);
    if ((input.allowance ?? 0n) < total) {
      txs.push({ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [entrypoint, total] }), value: 0n });
    }
    for (const d of input.deposits) {
      txs.push({ to: entrypoint, data: encodeFunctionData({ abi: ENTRYPOINT_ABI, functionName: "deposit", args: [token, d.gross, d.precommitment] }), value: 0n });
    }
  } else {
    for (const d of input.deposits) {
      txs.push({ to: entrypoint, data: encodeFunctionData({ abi: ENTRYPOINT_ABI, functionName: "deposit", args: [d.precommitment] }), value: d.gross });
    }
  }
  return { txs, total };
}
