import { LeanIMT } from "@zk-kit/lean-imt";
import { CoreError } from "./errors.js";
import { CIRCUIT_TREE_DEPTH } from "./field.js";
import { poseidon2 } from "./poseidon.js";

const hashPair = (left: bigint, right: bigint): bigint => poseidon2(left, right);

export interface InclusionWitness {
  readonly root: bigint;
  readonly depth: number;
  readonly index: number;
  readonly siblings: readonly bigint[];
}

export function createNoteTree(leaves: readonly bigint[] = []): LeanIMT<bigint> {
  const tree = new LeanIMT<bigint>(hashPair);
  for (const leaf of leaves) tree.insert(leaf);
  return tree;
}

/** Copy siblings and append zeros. A zero sibling means "no sibling" in the circuit. */
export function padSiblings(siblings: readonly bigint[], depth: number = CIRCUIT_TREE_DEPTH): readonly bigint[] {
  if (siblings.length > depth) {
    throw new CoreError("tree_depth", "inclusion proof is deeper than the circuit");
  }
  return Array.from({ length: depth }, (_, index) => siblings[index] ?? 0n);
}

export function inclusionAt(tree: LeanIMT<bigint>, index: number): InclusionWitness {
  const proof = tree.generateProof(index);
  return {
    root: proof.root,
    depth: tree.depth,
    index: proof.index,
    siblings: padSiblings(proof.siblings),
  };
}
