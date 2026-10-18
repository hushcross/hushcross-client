import { CoreError } from "./errors.js";
import { MAX_NOTE_VALUE, requireField } from "./field.js";
import { poseidon1, poseidon2, poseidon3 } from "./poseidon.js";

export interface Commitment {
  readonly commitment: bigint;
  readonly nullifierHash: bigint;
  readonly precommitment: bigint;
}

export function nullifierHash(nullifier: bigint): bigint {
  return poseidon1(requireNonZero("nullifier", nullifier));
}

export function precommitmentHash(nullifier: bigint, secret: bigint): bigint {
  return poseidon2(requireNonZero("nullifier", nullifier), requireNonZero("secret", secret));
}

/**
 * commitment = Poseidon(value, label, Poseidon(nullifier, secret))
 * nullifierHash = Poseidon(nullifier)
 * This is the upstream CommitmentHasher, then PoseidonT4 in the pool.
 */
export function commitmentOf(value: bigint, label: bigint, nullifier: bigint, secret: bigint): Commitment {
  if (value < 0n || value > MAX_NOTE_VALUE) {
    throw new CoreError("note_value", "value must be below 2^128 - 1");
  }
  const precommitment = precommitmentHash(nullifier, secret);
  return {
    precommitment,
    nullifierHash: nullifierHash(nullifier),
    commitment: poseidon3(value, requireField("label", label), precommitment),
  };
}

function requireNonZero(name: string, value: bigint): bigint {
  const reduced = requireField(name, value);
  if (reduced === 0n) throw new CoreError("zero_scalar", `${name} must be non-zero`);
  return reduced;
}
