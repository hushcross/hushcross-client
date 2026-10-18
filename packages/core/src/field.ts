import { CoreError } from "./errors.js";

/** BN254 scalar field, the modulus used by the Groth16 circuits. */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** secp256k1 group order. */
export const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** Withdraw circuit parameter. Siblings are padded with zeros up to this depth. */
export const CIRCUIT_TREE_DEPTH = 32;

/**
 * Largest note value the pool accepts.
 * The contract rejects `value >= type(uint128).max`, so the maximum is 2^128 - 2.
 */
export const MAX_NOTE_VALUE = (1n << 128n) - 2n;

const UINT256_MODULUS = 1n << 256n;

export function bigintFromBytes(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

export function bigintToBytes(value: bigint, length: number): Uint8Array {
  if (value < 0n) throw new CoreError("field_range", "cannot encode a negative integer");
  const out = new Uint8Array(length);
  let rest = value;
  for (let index = length - 1; index >= 0; index -= 1) {
    out[index] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  if (rest !== 0n) throw new CoreError("field_range", "integer does not fit in the requested width");
  return out;
}

export function requireUint256(name: string, value: bigint): bigint {
  if (value < 0n || value >= UINT256_MODULUS) {
    throw new CoreError("field_range", `${name} must fit in uint256`);
  }
  return value;
}

export function requireField(name: string, value: bigint): bigint {
  if (value < 0n || value >= SNARK_SCALAR_FIELD) {
    throw new CoreError("field_range", `${name} must be a field element`);
  }
  return value;
}

/** Big-endian integer modulo the SNARK field. Rejects a zero result. */
export function fieldFromBytes(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) throw new CoreError("field_range", "field seed must be 32 bytes");
  const reduced = bigintFromBytes(bytes) % SNARK_SCALAR_FIELD;
  if (reduced === 0n) throw new CoreError("zero_scalar", "field element reduced to zero");
  return reduced;
}

/** Big-endian integer modulo the secp256k1 order. Rejects a zero result. */
export function secpScalarFromBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length !== 32) throw new CoreError("field_range", "scalar seed must be 32 bytes");
  const reduced = bigintFromBytes(bytes) % SECP256K1_ORDER;
  if (reduced === 0n) throw new CoreError("zero_scalar", "secp256k1 scalar reduced to zero");
  return bigintToBytes(reduced, 32);
}
