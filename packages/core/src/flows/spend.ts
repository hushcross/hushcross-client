import type { Address, Hex } from "viem";
import type { CircuitArtifacts } from "../artifactCheck.js";
import { commitmentOf } from "../commitment.js";
import { withdrawalContext } from "../context.js";
import { CoreError } from "../errors.js";
import { createNoteTree, inclusionAt, padSiblings, type InclusionWitness } from "../merkle.js";
import { poseidon2 } from "../poseidon.js";
import { proveWithdrawalWithWitnesses } from "../proof.js";
import { formatProofForSolidity, type Groth16Prover, type ProofBundle, type SolidityProof } from "../prover.js";
import type { AspInclusion, RelayWithdrawRequest } from "../services.js";
import type { Withdrawal, WithdrawTarget } from "../withdrawData.js";

export interface SpendNote {
  readonly value: bigint;
  readonly label: bigint;
  readonly nullifier: bigint;
  readonly secret: bigint;
}

export interface SpendInput {
  readonly note: SpendNote;
  readonly withdrawnValue: bigint;
  /** Secrets of the change note (value = note.value - withdrawnValue, possibly 0). */
  readonly next: { readonly nullifier: bigint; readonly secret: bigint };
  readonly withdrawal: Withdrawal;
  readonly scope: bigint;
  /** All pool leaves (LeafInserted order). */
  readonly stateLeaves: readonly bigint[];
  readonly asp: AspInclusion;
  readonly prover: Groth16Prover;
  readonly artifacts: CircuitArtifacts;
}

export interface SpendProof {
  readonly proof: SolidityProof;
  readonly bundle: ProofBundle;
  readonly context: bigint;
}

export function stateInclusion(leaves: readonly bigint[], commitment: bigint): InclusionWitness {
  const index = leaves.indexOf(commitment);
  if (index < 0) throw new CoreError("state_tree", "commitment is not in the state tree yet");
  return inclusionAt(createNoteTree(leaves), index);
}

/** Fold a LeanIMT proof (0 sibling = no sibling) and compare with its root. */
export function aspRootMatches(asp: AspInclusion, label: bigint): boolean {
  let node = label;
  let bit = 0;
  for (const sibling of asp.siblings) {
    if (sibling === 0n) continue;
    node = ((asp.index >> bit) & 1) === 1 ? poseidon2(sibling, node) : poseidon2(node, sibling);
    bit += 1;
  }
  return node === asp.root;
}

/** Build the withdraw-circuit witness for one note and prove it with the injected prover. */
export async function proveSpend(input: SpendInput): Promise<SpendProof> {
  const opened = commitmentOf(input.note.value, input.note.label, input.note.nullifier, input.note.secret);
  const state = stateInclusion(input.stateLeaves, opened.commitment);
  if (!aspRootMatches(input.asp, input.note.label)) throw new CoreError("asp_proof", "ASP proof does not fold to its root");
  const asp: InclusionWitness = { root: input.asp.root, depth: input.asp.depth, index: input.asp.index, siblings: padSiblings(input.asp.siblings) };
  const context = withdrawalContext(input.withdrawal, input.scope);
  const bundle = await proveWithdrawalWithWitnesses(
    {
      withdrawnValue: input.withdrawnValue,
      label: input.note.label,
      existingValue: input.note.value,
      existingNullifier: input.note.nullifier,
      existingSecret: input.note.secret,
      newNullifier: input.next.nullifier,
      newSecret: input.next.secret,
      state,
      asp,
      context,
    },
    input.prover,
    input.artifacts,
  );
  return { proof: formatProofForSolidity(bundle.proof, bundle.publicSignals), bundle, context };
}

export function buildRelayRequest(input: {
  readonly target: WithdrawTarget;
  readonly pool: Address;
  readonly scope: bigint;
  readonly withdrawal: { readonly processooor: Address; readonly data: Hex };
  readonly proof: SolidityProof;
  readonly gasDrop: boolean;
  readonly delaySeconds: number;
}): RelayWithdrawRequest {
  if (!Number.isInteger(input.delaySeconds) || input.delaySeconds < 0 || input.delaySeconds > 1800) {
    throw new CoreError("relay_delay", "delay must be 0-1800 seconds");
  }
  const s = (value: bigint): string => value.toString();
  return {
    target: input.target,
    pool: input.pool,
    scope: s(input.scope),
    withdrawal: { processooor: input.withdrawal.processooor, data: input.withdrawal.data },
    proof: {
      pA: [s(input.proof.pA[0]), s(input.proof.pA[1])],
      pB: [
        [s(input.proof.pB[0][0]), s(input.proof.pB[0][1])],
        [s(input.proof.pB[1][0]), s(input.proof.pB[1][1])],
      ],
      pC: [s(input.proof.pC[0]), s(input.proof.pC[1])],
      pubSignals: input.proof.pubSignals.map(s),
    },
    gasDrop: input.target === "send" ? input.gasDrop : false,
    delaySeconds: input.delaySeconds,
  };
}
