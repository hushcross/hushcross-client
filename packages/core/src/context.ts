import { encodeAbiParameters, encodePacked, getAddress, isAddress, isHex, keccak256, type Address, type Hex } from "viem";
import { CoreError } from "./errors.js";
import { SNARK_SCALAR_FIELD, requireUint256 } from "./field.js";

export interface WithdrawalContextInput {
  readonly processooor: Address;
  readonly data: Hex;
}

/**
 * context = keccak256(abi.encode(withdrawal, scope)) mod p.
 * `withdrawal` is the pool struct `{ address processooor; bytes data; }`.
 */
export function encodeWithdrawalContext(withdrawal: WithdrawalContextInput, scope: bigint): Hex {
  if (!isAddress(withdrawal.processooor)) throw new CoreError("address", "processooor is not an address");
  if (!isHex(withdrawal.data)) throw new CoreError("bytes", "withdrawal data is not hex");
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "processooor", type: "address" },
          { name: "data", type: "bytes" },
        ],
      },
      { name: "scope", type: "uint256" },
    ],
    [{ processooor: getAddress(withdrawal.processooor), data: withdrawal.data }, requireUint256("scope", scope)],
  );
}

export function withdrawalContext(withdrawal: WithdrawalContextInput, scope: bigint): bigint {
  return BigInt(keccak256(encodeWithdrawalContext(withdrawal, scope))) % SNARK_SCALAR_FIELD;
}

/** label = keccak256(abi.encodePacked(scope, nonce)) mod p. The pool's first nonce is 1. */
export function encodeDepositLabel(scope: bigint, nonce: bigint): Hex {
  return encodePacked(
    ["uint256", "uint256"],
    [requireUint256("scope", scope), requireUint256("nonce", nonce)],
  );
}

export function depositLabel(scope: bigint, nonce: bigint): bigint {
  return BigInt(keccak256(encodeDepositLabel(scope, nonce))) % SNARK_SCALAR_FIELD;
}
