import type { LeanIMT } from "@zk-kit/lean-imt";
import { commitmentOf } from "./commitment.js";
import { CoreError } from "./errors.js";
import { CIRCUIT_TREE_DEPTH, requireField } from "./field.js";
import { inclusionAt, type InclusionWitness } from "./merkle.js";
import type { CircuitArtifacts, CircuitFiles } from "./artifactCheck.js";
import { formatProofForSolidity, type Groth16Prover, type ProofBundle } from "./prover.js";

export { formatProofForSolidity };
export type { ProofBundle, SolidityProof } from "./prover.js";

export interface WithdrawalProofInput {
  readonly withdrawnValue: bigint;
  readonly label: bigint;
  readonly existingValue: bigint;
  readonly existingNullifier: bigint;
  readonly existingSecret: bigint;
  readonly newNullifier: bigint;
  readonly newSecret: bigint;
  readonly stateTree: LeanIMT<bigint>;
  readonly stateIndex: number;
  readonly aspTree: LeanIMT<bigint>;
  readonly aspIndex: number;
  readonly context: bigint;
}

export interface CommitmentProofInput {
  readonly value: bigint;
  readonly label: bigint;
  readonly nullifier: bigint;
  readonly secret: bigint;
}

type Witness = Readonly<Record<string, string | readonly string[]>>;

export async function proveWithdrawal(
  input: WithdrawalProofInput,
  prover: Groth16Prover,
  artifacts: CircuitArtifacts,
): Promise<ProofBundle> {
  const { stateTree, stateIndex, aspTree, aspIndex, ...rest } = input;
  return proveWithdrawalWithWitnesses(
    { ...rest, state: inclusionAt(stateTree, stateIndex), asp: inclusionAt(aspTree, aspIndex) },
    prover,
    artifacts,
  );
}

export interface WithdrawalWitnessInput {
  readonly withdrawnValue: bigint;
  readonly label: bigint;
  readonly existingValue: bigint;
  readonly existingNullifier: bigint;
  readonly existingSecret: bigint;
  readonly newNullifier: bigint;
  readonly newSecret: bigint;
  /** State-tree inclusion of the existing commitment. */
  readonly state: InclusionWitness;
  /** ASP-tree inclusion of the label, e.g. straight from the Screen service. */
  readonly asp: InclusionWitness;
  readonly context: bigint;
}

/** Same circuit input as `proveWithdrawal`, with precomputed (padded) inclusion witnesses. */
export async function proveWithdrawalWithWitnesses(
  input: WithdrawalWitnessInput,
  prover: Groth16Prover,
  artifacts: CircuitArtifacts,
): Promise<ProofBundle> {
  if (input.newNullifier === input.existingNullifier) {
    throw new CoreError("nullifier", "new nullifier must differ from the spent nullifier");
  }
  if (input.withdrawnValue < 0n || input.withdrawnValue > input.existingValue) {
    throw new CoreError("note_value", "withdrawn value exceeds the note");
  }
  const state = input.state;
  const asp = input.asp;
  if (state.siblings.length !== CIRCUIT_TREE_DEPTH || asp.siblings.length !== CIRCUIT_TREE_DEPTH) {
    throw new CoreError("tree_depth", "siblings were not padded to the circuit depth");
  }
  const witness: Witness = {
    withdrawnValue: decimal(input.withdrawnValue),
    stateRoot: decimal(state.root),
    stateTreeDepth: decimal(BigInt(state.depth)),
    ASPRoot: decimal(asp.root),
    ASPTreeDepth: decimal(BigInt(asp.depth)),
    context: decimal(requireField("context", input.context)),
    label: decimal(requireField("label", input.label)),
    existingValue: decimal(input.existingValue),
    existingNullifier: decimal(requireField("existingNullifier", input.existingNullifier)),
    existingSecret: decimal(requireField("existingSecret", input.existingSecret)),
    newNullifier: decimal(requireField("newNullifier", input.newNullifier)),
    newSecret: decimal(requireField("newSecret", input.newSecret)),
    stateSiblings: state.siblings.map(decimal),
    stateIndex: decimal(BigInt(state.index)),
    ASPSiblings: asp.siblings.map(decimal),
    ASPIndex: decimal(BigInt(asp.index)),
  };
  commitmentOf(input.existingValue, input.label, input.existingNullifier, input.existingSecret);
  commitmentOf(input.existingValue - input.withdrawnValue, input.label, input.newNullifier, input.newSecret);
  return prove(artifacts.withdraw, witness, prover);
}

export async function proveCommitment(
  input: CommitmentProofInput,
  prover: Groth16Prover,
  artifacts: CircuitArtifacts,
): Promise<ProofBundle> {
  const witness: Witness = {
    value: decimal(input.value),
    label: decimal(requireField("label", input.label)),
    nullifier: decimal(requireField("nullifier", input.nullifier)),
    secret: decimal(requireField("secret", input.secret)),
  };
  commitmentOf(input.value, input.label, input.nullifier, input.secret);
  return prove(artifacts.commitment, witness, prover);
}

async function prove(files: CircuitFiles, witness: Witness, prover: Groth16Prover): Promise<ProofBundle> {
  return prover.prove({ wasm: files.wasm, zkey: files.zkey, witness });
}

function decimal(value: bigint): string {
  return value.toString();
}
