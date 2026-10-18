import { bytesToHex } from "@noble/hashes/utils.js";
import { encodeAbiParameters, encodePacked, getAddress, isAddress, isHex, keccak256, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { randomBytes } from "../bytes.js";
import { CoreError } from "../errors.js";
import { SNARK_SCALAR_FIELD } from "../field.js";

/** docs/mechanisms/LAUNCH.md section 2. */
export const LAUNCH_BID_TAG: Hex = keccak256(stringToHex("HushCross.Launch.Bid.v1"));
export const MAX_REFUND_NOTES = 16;
export const MAX_UINT128 = (1n << 128n) - 1n;

/** Everything the bidder must keep to reveal and claim. Never leaves the device except encrypted to the relay. */
export interface LaunchBidPreimage {
  readonly chainId: bigint;
  readonly sale: Address;
  readonly saleId: bigint;
  /** Quote base units per whole token. */
  readonly price: bigint;
  /** Quote base units. */
  readonly maxSpend: bigint;
  /** Receives tokens and refund dust; normally a one-time address. */
  readonly recipient: Address;
  readonly refundPrecommitments: readonly bigint[];
  readonly salt: Hex;
}

/** keccak256(abi.encodePacked(uint256[])); keccak256("") for an empty list. */
export function refundsHash(precommitments: readonly bigint[]): Hex {
  return keccak256(precommitments.length === 0 ? "0x" : encodePacked(precommitments.map(() => "uint256"), [...precommitments]));
}

/**
 * Reject preimages the contract could never reveal (LAUNCH.md 4.1): their escrow would be stuck.
 * Economic validity (floor, escrow) is checked separately and only refunds the bid.
 */
export function assertRevealable(preimage: LaunchBidPreimage): void {
  const fail = (message: string): never => {
    throw new CoreError("launch_bid", message);
  };
  if (preimage.price <= 0n || preimage.price > MAX_UINT128) fail("price must be in [1, 2^128 - 1]");
  if (preimage.maxSpend <= 0n || preimage.maxSpend > MAX_UINT128) fail("max spend must be in [1, 2^128 - 1]");
  if (!isAddress(preimage.recipient, { strict: false }) || getAddress(preimage.recipient) === zeroAddress) fail("recipient must be a non-zero address");
  if (preimage.refundPrecommitments.length > MAX_REFUND_NOTES) fail(`at most ${MAX_REFUND_NOTES} refund precommitments`);
  for (const pc of preimage.refundPrecommitments) {
    if (pc <= 0n || pc >= SNARK_SCALAR_FIELD) fail("refund precommitment must be a non-zero field element");
  }
  if (!isHex(preimage.salt) || preimage.salt.length !== 66) fail("salt must be 32 bytes");
}

/**
 * commitment = keccak256(abi.encode(LAUNCH_BID_TAG, chainId, sale, saleId, price, maxSpend, recipient,
 *                                   refundsHash(refundPrecommitments), salt))
 */
export function launchBidCommitment(preimage: LaunchBidPreimage): Hex {
  assertRevealable(preimage);
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [LAUNCH_BID_TAG, preimage.chainId, getAddress(preimage.sale), preimage.saleId, preimage.price, preimage.maxSpend, getAddress(preimage.recipient), refundsHash(preimage.refundPrecommitments), preimage.salt],
    ),
  );
}

export function randomSalt(): Hex {
  return `0x${bytesToHex(randomBytes(32))}`;
}

/** The reveal call's own argument order (SealedSale.reveal / lateReveal). */
export function revealArgs(preimage: LaunchBidPreimage): readonly [bigint, bigint, Address, readonly bigint[], Hex] {
  return [preimage.price, preimage.maxSpend, getAddress(preimage.recipient), [...preimage.refundPrecommitments], preimage.salt];
}
