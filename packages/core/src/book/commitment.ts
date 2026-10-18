import { encodeAbiParameters, encodeFunctionData, getAddress, isAddress, isHex, keccak256, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import { CoreError } from "../errors.js";
import { SNARK_SCALAR_FIELD } from "../field.js";
import type { TxRequest } from "../hushId.js";
import { MAX_REFUND_NOTES, MAX_UINT128, refundsHash } from "../launch/commitment.js";
import { SEALED_BOOK_ABI } from "./abi.js";

/** docs/mechanisms/BOOK.md section 2. */
export const BOOK_ORDER_TAG: Hex = keccak256(stringToHex("HushCross.Book.Order.v1"));

export type BookSide = "buy" | "sell";
export const SIDE_CODE: Readonly<Record<BookSide, number>> = { buy: 0, sell: 1 };
export const sideOf = (code: number): BookSide => (code === 0 ? "buy" : "sell");

/** Flag bit 0: on a band failure the contract carries the revealed order into the next epoch (content public). */
export const BOOK_FLAG_CARRY = 1;

/** Everything the trader keeps to reveal and claim. Never leaves the device except sealed to the relay. */
export interface BookOrderPreimage {
  readonly chainId: bigint;
  readonly book: Address;
  readonly marketId: bigint;
  readonly epochId: bigint;
  readonly side: BookSide;
  /** USDT base units per whole base token; a multiple of the market tick. */
  readonly limitPrice: bigint;
  /** Base units; a multiple of the market lot. */
  readonly quantity: bigint;
  /** Receives the fill proceeds (base bought, USDT from a sale) and every dust amount; normally a one-time address. */
  readonly recipient: Address;
  /** Vault notes for the order's own unspent escrow: USDT notes (buy), then BNB notes (WBNB sell); at most 16. */
  readonly refundPrecommitments: readonly bigint[];
  readonly flags: number;
  readonly salt: Hex;
}

/** Shape checks the contract enforces with a revert (BOOK.md 3): such an order could never be revealed. */
export function assertOrderShape(order: BookOrderPreimage): void {
  const fail = (message: string): never => {
    throw new CoreError("book_order", message);
  };
  if (order.side !== "buy" && order.side !== "sell") fail("side must be buy or sell");
  if (order.limitPrice < 0n || order.limitPrice > MAX_UINT128) fail("limit price must be in [0, 2^128 - 1]");
  if (order.quantity < 0n || order.quantity > MAX_UINT128) fail("quantity must be in [0, 2^128 - 1]");
  if (!isAddress(order.recipient, { strict: false }) || getAddress(order.recipient) === zeroAddress) fail("recipient must be a non-zero address");
  if (!Number.isInteger(order.flags) || order.flags < 0 || order.flags > 1) fail("flags must be 0 or 1");
  if (order.refundPrecommitments.length > MAX_REFUND_NOTES) fail(`at most ${MAX_REFUND_NOTES} refund precommitments`);
  for (const pc of order.refundPrecommitments) {
    if (pc <= 0n || pc >= SNARK_SCALAR_FIELD) fail("refund precommitment must be a non-zero field element");
  }
  if (!isHex(order.salt) || order.salt.length !== 66) fail("salt must be 32 bytes");
  if (order.marketId <= 0n || order.epochId < 0n) fail("market and epoch must be set");
}

/**
 * commitment = keccak256(abi.encode(BOOK_ORDER_TAG, chainId, book, marketId, epochId, uint8 side, limitPrice,
 *                                   quantity, recipient, refundsHash(refundPrecommitments), uint8 flags, salt))
 */
export function bookOrderCommitment(order: BookOrderPreimage): Hex {
  assertOrderShape(order);
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint8" },
        { type: "bytes32" },
      ],
      [
        BOOK_ORDER_TAG,
        order.chainId,
        getAddress(order.book),
        order.marketId,
        order.epochId,
        SIDE_CODE[order.side] as number,
        order.limitPrice,
        order.quantity,
        getAddress(order.recipient),
        refundsHash(order.refundPrecommitments),
        order.flags,
        order.salt,
      ],
    ),
  );
}

/** `SealedBook.reveal` / `claimUnrevealed` argument order. */
export function bookRevealArgs(order: BookOrderPreimage): readonly [bigint, bigint, number, bigint, bigint, Address, readonly bigint[], number, Hex] {
  return [order.marketId, order.epochId, SIDE_CODE[order.side] as number, order.limitPrice, order.quantity, getAddress(order.recipient), [...order.refundPrecommitments], order.flags, order.salt];
}

/** Self-reveal (reveal window) or `claimUnrevealed` (after the epoch is final, for an order that was never revealed). */
export function buildBookRevealTx(order: BookOrderPreimage, unrevealedClaim = false): TxRequest {
  const [marketId, epochId, side, limitPrice, quantity, recipient, pcs, flags, salt] = bookRevealArgs(order);
  return {
    to: getAddress(order.book),
    data: encodeFunctionData({ abi: SEALED_BOOK_ABI, functionName: unrevealedClaim ? "claimUnrevealed" : "reveal", args: [marketId, epochId, side, limitPrice, quantity, recipient, [...pcs], flags, salt] }),
    value: 0n,
  };
}
