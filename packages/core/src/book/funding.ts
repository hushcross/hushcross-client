import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { ERC20_ABI } from "../abi.js";
import { CoreError } from "../errors.js";
import type { TxRequest } from "../hushId.js";
import { MAX_REFUND_NOTES } from "../launch/commitment.js";
import { planPrivateBid, refundNoteBound } from "../launch/funding.js";
import type { Withdrawal } from "../withdrawData.js";
import { SEALED_BOOK_ABI } from "./abi.js";
import { SIDE_CODE, type BookSide } from "./commitment.js";
import { bookEscrowRequired } from "./market.js";

/** `BookAdapter.FundData` (withdrawal.data = abi.encode(FundData)); `relayFee` is absolute, in the pool asset. */
export interface BookFundData {
  readonly marketId: bigint;
  readonly commitment: Hex;
  readonly side: BookSide;
  readonly feeRecipient: Address;
  readonly relayFee: bigint;
}

export const BOOK_FUND_DATA_ABI = [
  {
    type: "tuple",
    components: [
      { name: "marketId", type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "side", type: "uint8" },
      { name: "feeRecipient", type: "address" },
      { name: "relayFee", type: "uint256" },
    ],
  },
] as const;

export function encodeBookFundData(data: BookFundData): Hex {
  if (data.relayFee < 0n) throw new CoreError("book_fund", "relay fee must be non-negative");
  return encodeAbiParameters(BOOK_FUND_DATA_ABI, [{ marketId: data.marketId, commitment: data.commitment, side: SIDE_CODE[data.side] as number, feeRecipient: getAddress(data.feeRecipient), relayFee: data.relayFee }]);
}

export function decodeBookFundData(encoded: Hex): BookFundData {
  const [v] = decodeAbiParameters(BOOK_FUND_DATA_ABI, encoded);
  return { marketId: v.marketId, commitment: v.commitment, side: v.side === 0 ? "buy" : "sell", feeRecipient: v.feeRecipient, relayFee: v.relayFee };
}

/** BookAdapter withdrawal (relay target `book`). */
export function buildFundOrderWithdrawal(input: { readonly adapter: Address } & BookFundData): Withdrawal {
  return { processooor: getAddress(input.adapter), data: encodeBookFundData(input) };
}

/** Which vault pool can fund an order: buys spend USDT; sells only on the WBNB market (BNB notes are wrapped). */
export function bookFundingAsset(side: BookSide, baseIsWbnb: boolean): "USDT" | "BNB" | null {
  if (side === "buy") return "USDT";
  return baseIsWbnb ? "BNB" : null;
}

export interface PrivateOrderPlan {
  /** Whole vault units withdrawn from one note (escrow + relay fee). */
  readonly withdrawn: bigint;
  readonly relayFee: bigint;
  /** What the book credits; >= the required escrow, the excess is refunded at claim. */
  readonly escrow: bigint;
  readonly required: bigint;
}

/** Vault-funded order: one note, one BookAdapter call, the withdrawal rounded up to whole units. */
export async function planPrivateOrder(input: {
  readonly side: BookSide;
  readonly quantity: bigint;
  readonly limitPrice: bigint;
  /** Unit table of the funding pool (USDT for buys, BNB for WBNB sells). */
  readonly units: readonly bigint[];
  readonly feeFor: (withdrawn: bigint) => bigint | Promise<bigint>;
}): Promise<PrivateOrderPlan> {
  const required = bookEscrowRequired(input.side, input.quantity, input.limitPrice);
  if (required <= 0n) throw new CoreError("book_order", "order needs a positive escrow");
  const plan = await planPrivateBid({ maxSpend: required, units: input.units, feeFor: input.feeFor });
  return { withdrawn: plan.withdrawn, relayFee: plan.relayFee, escrow: plan.escrow, required };
}

/**
 * How many vault-note precommitments a vault-funded order should carry so `claim` can return its unspent escrow
 * to the vault. Only the order's own escrow goes back (SECURITY-FIX-1 M4): a buy's USDT refund (<= escrow) as USDT
 * notes; a WBNB sell's unsold base (<= escrow) as BNB notes. Fill proceeds (base bought, USDT from a sale) always go
 * to the one-time recipient and need no notes. Capped at 16; anything beyond becomes dust to the recipient.
 * `referencePrice` and `limitPrice` are kept in the signature for callers; they no longer change the count.
 */
export function bookRefundNoteCount(input: {
  readonly side: BookSide;
  readonly quantity: bigint;
  readonly limitPrice: bigint;
  readonly escrow: bigint;
  readonly baseIsWbnb: boolean;
  readonly referencePrice: bigint;
  readonly usdtUnits: readonly bigint[];
  readonly bnbUnits: readonly bigint[];
  readonly vaultFeeBps: bigint;
}): { readonly quote: number; readonly base: number; readonly total: number } {
  let quote = 0;
  let base = 0;
  if (input.side === "buy") quote = refundNoteBound(input.escrow, input.usdtUnits, input.vaultFeeBps);
  else if (input.baseIsWbnb) base = refundNoteBound(input.escrow, input.bnbUnits, input.vaultFeeBps);
  if (quote > MAX_REFUND_NOTES) quote = MAX_REFUND_NOTES;
  if (quote + base > MAX_REFUND_NOTES) base = MAX_REFUND_NOTES - quote;
  return { quote, base, total: quote + base };
}

/** Public-wallet order: exact escrow, approval of the escrow token first when needed, then `commit`. */
export function buildPublicOrderTxs(input: {
  readonly book: Address;
  readonly marketId: bigint;
  readonly commitment: Hex;
  readonly side: BookSide;
  readonly escrow: bigint;
  /** USDT for buys, the base token for sells. */
  readonly token: Address;
  readonly allowance?: bigint;
}): TxRequest[] {
  const book = getAddress(input.book);
  const txs: TxRequest[] = [];
  if ((input.allowance ?? 0n) < input.escrow) {
    txs.push({ to: getAddress(input.token), data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [book, input.escrow] }), value: 0n });
  }
  txs.push({ to: book, data: encodeFunctionData({ abi: SEALED_BOOK_ABI, functionName: "commit", args: [input.marketId, input.commitment, SIDE_CODE[input.side] as number, input.escrow] }), value: 0n });
  return txs;
}
