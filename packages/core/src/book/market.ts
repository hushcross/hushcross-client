import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { CoreError } from "../errors.js";
import type { TxRequest } from "../hushId.js";
import { SEALED_BOOK_ABI } from "./abi.js";

/** contracts/src/book/BookTypes.sol. */
export const BOOK_EPOCH_SECONDS = 600n;
export const BOOK_COMMIT_SECONDS = 480n;
/** After the reveal window anyone may settle for one more epoch, then anyone may void. */
export const BOOK_SETTLE_GRACE = 600n;
export const BOOK_FEE_BPS = 5n;
export const BOOK_BAND_BPS = 200n;
export const BOOK_MAX_ORDERS = 500;
/** Carry-flagged valid reveals per market and epoch that a band-fail settle carries (`maxCarry()`). */
export const BOOK_MAX_CARRY = 64;
/** Listing default of `minEscrow(marketId).minQuote`: a buy must escrow at least 5 USDT. Read the market for the live value. */
export const BOOK_DEFAULT_MIN_QUOTE = 5n * 10n ** 18n;
const E18 = 10n ** 18n;
const BPS = 10_000n;

export type BookPhase = "future" | "commit" | "reveal" | "settle" | "expired";

export interface EpochWindow {
  readonly epoch: bigint;
  /** Unix seconds. */
  readonly startsAt: bigint;
  readonly commitEndsAt: bigint;
  readonly revealEndsAt: bigint;
  readonly settleEndsAt: bigint;
}

/** `currentEpoch()` = block.timestamp / 600. */
export function bookEpochAt(nowSec: bigint): bigint {
  return nowSec / BOOK_EPOCH_SECONDS;
}

export function bookEpochWindow(epoch: bigint): EpochWindow {
  const startsAt = epoch * BOOK_EPOCH_SECONDS;
  return { epoch, startsAt, commitEndsAt: startsAt + BOOK_COMMIT_SECONDS, revealEndsAt: startsAt + BOOK_EPOCH_SECONDS, settleEndsAt: startsAt + BOOK_EPOCH_SECONDS + BOOK_SETTLE_GRACE };
}

/** `BookTypes.phaseAt`. */
export function bookPhaseAt(epoch: bigint, nowSec: bigint): BookPhase {
  const w = bookEpochWindow(epoch);
  if (nowSec < w.startsAt) return "future";
  if (nowSec < w.commitEndsAt) return "commit";
  if (nowSec < w.revealEndsAt) return "reveal";
  if (nowSec < w.settleEndsAt) return "settle";
  return "expired";
}

/**
 * The epoch an order placed now should target. A commitment names its epoch and `commit` must land inside
 * that epoch's commit window (the contract stores `currentEpoch()`), so a commit that might not land in time
 * — proving plus relaying take a while — waits for the next window instead.
 */
export function bookTargetEpoch(nowSec: bigint, minCommitLeftSec: bigint): { readonly epoch: bigint; readonly waitSec: bigint } {
  const epoch = bookEpochAt(nowSec);
  const w = bookEpochWindow(epoch);
  if (nowSec + minCommitLeftSec <= w.commitEndsAt) return { epoch, waitSec: 0n };
  return { epoch: epoch + 1n, waitSec: w.revealEndsAt - nowSec };
}

/** Buy escrow at the limit including the fee: ceil(q*limit/1e18) + floor(cost*5/10000). */
export function bookBuyEscrowRequired(quantity: bigint, limitPrice: bigint): bigint {
  const cost = (quantity * limitPrice + E18 - 1n) / E18;
  return cost + (cost * BOOK_FEE_BPS) / BPS;
}

export function bookEscrowRequired(side: "buy" | "sell", quantity: bigint, limitPrice: bigint): bigint {
  return side === "buy" ? bookBuyEscrowRequired(quantity, limitPrice) : quantity;
}

/** Economic validity in BOOK.md 3 order; `null` when valid. */
export function bookInvalidReason(input: { readonly side: "buy" | "sell"; readonly limitPrice: bigint; readonly quantity: bigint; readonly escrow: bigint; readonly tick: bigint; readonly lot: bigint }): string | null {
  if (input.limitPrice === 0n) return "zero_price";
  if (input.tick === 0n || input.limitPrice % input.tick !== 0n) return "price_not_on_tick";
  if (input.quantity === 0n) return "zero_quantity";
  if (input.lot === 0n || input.quantity % input.lot !== 0n) return "quantity_not_on_lot";
  if (input.escrow < bookEscrowRequired(input.side, input.quantity, input.limitPrice)) return "escrow_insufficient";
  return null;
}

/** `referencePriceFromFeeds`: floor(xUsd * 10^usdtDec * 1e18 / (usdtUsd * 10^xDec)). */
export function bookReferenceFromFeeds(xUsd: bigint, xDecimals: number, usdtUsd: bigint, usdtDecimals: number): bigint {
  if (xUsd <= 0n || usdtUsd <= 0n) throw new CoreError("book_oracle", "feed answers must be positive");
  return (xUsd * 10n ** BigInt(usdtDecimals) * E18) / (usdtUsd * 10n ** BigInt(xDecimals));
}

/** Inclusive band guard: ref*(1 - 2%) <= p <= ref*(1 + 2%). */
export function bookWithinBand(price: bigint, reference: bigint): boolean {
  const scaled = price * BPS;
  return scaled >= reference * (BPS - BOOK_BAND_BPS) && scaled <= reference * (BPS + BOOK_BAND_BPS);
}

/** Round a price to the market tick (down for buys keeps the escrow sufficient; callers choose). */
export function roundToTick(price: bigint, tick: bigint, mode: "down" | "up" | "nearest" = "nearest"): bigint {
  if (tick <= 0n) throw new CoreError("book_tick", "tick must be positive");
  const down = (price / tick) * tick;
  if (mode === "down" || down === price) return down;
  if (mode === "up") return down + tick;
  return price - down >= tick / 2n + (tick % 2n) ? down + tick : down;
}

/* ------------------------------------------------------------ epoch state */

export type EpochStatus = "pending" | "cleared" | "voided";
export type VoidReason = "no_cross" | "band" | "no_reveals" | "timeout";
const EPOCH_STATUS: readonly EpochStatus[] = ["pending", "cleared", "voided"];
const VOID_REASON: readonly VoidReason[] = ["no_cross", "band", "no_reveals", "timeout"];
export const epochStatusName = (code: number): EpochStatus => EPOCH_STATUS[code] ?? "pending";
export const voidReasonName = (code: number): VoidReason => VOID_REASON[code] ?? "timeout";

export type OrderValidity = "unrevealed" | "valid" | "zero_price" | "price_not_on_tick" | "zero_quantity" | "quantity_not_on_lot" | "escrow_insufficient";
const VALIDITY: readonly OrderValidity[] = ["unrevealed", "valid", "zero_price", "price_not_on_tick", "zero_quantity", "quantity_not_on_lot", "escrow_insufficient"];
export const orderValidityName = (code: number): OrderValidity => VALIDITY[code] ?? "unrevealed";

/** `SealedBook.previewPayment` result. */
export interface BookPayment {
  readonly fill: bigint;
  readonly quoteAmount: bigint;
  readonly fee: bigint;
  readonly baseOut: bigint;
  readonly quoteOut: bigint;
  readonly baseRefund: bigint;
  readonly quoteRefund: bigint;
}

/* ------------------------------------------------------------------- txs */

export function buildBookSettleTx(book: Address, marketId: bigint, epoch: bigint, proposal: { readonly pLow: bigint; readonly pHigh: bigint; readonly pivot: bigint; readonly marginalLevel: bigint }): TxRequest {
  return { to: getAddress(book), data: encodeFunctionData({ abi: SEALED_BOOK_ABI, functionName: "settle", args: [marketId, epoch, proposal.pLow, proposal.pHigh, proposal.pivot, proposal.marginalLevel] }), value: 0n };
}

export function buildBookSettleNoCrossTx(book: Address, marketId: bigint, epoch: bigint): TxRequest {
  return { to: getAddress(book), data: encodeFunctionData({ abi: SEALED_BOOK_ABI, functionName: "settleNoCross", args: [marketId, epoch] }), value: 0n };
}

export function buildBookVoidExpiredTx(book: Address, marketId: bigint, epoch: bigint): TxRequest {
  return { to: getAddress(book), data: encodeFunctionData({ abi: SEALED_BOOK_ABI, functionName: "voidExpired", args: [marketId, epoch] }), value: 0n };
}

/**
 * Below the market minimum (`SealedBook.minEscrow`), `commit` reverts `EscrowTooSmall`. Buys escrow USDT, sells base.
 * Returns null when the escrow is enough.
 */
export function bookMinEscrowIssue(side: "buy" | "sell", escrow: bigint, min: { readonly minQuote: bigint; readonly minBase: bigint }): "below_min_quote" | "below_min_base" | null {
  if (side === "buy") return escrow < min.minQuote ? "below_min_quote" : null;
  return escrow < min.minBase ? "below_min_base" : null;
}

/**
 * Claim after the epoch is final. For orders funded through BookAdapter, `claim` deposits only the order's own
 * unspent escrow (USDT for a buy, WBNB-as-BNB for a WBNB sell) back into the vault; fill proceeds (base bought,
 * USDT received) always go to the order's one-time recipient. Anyone may send `claim`. `claimToRecipient` pays
 * everything to the recipient and, for a vault-funded order, only the recipient itself may send it.
 */
export function buildBookClaimTx(book: Address, commitment: Hex, precommitments: readonly bigint[], toRecipient = false): TxRequest {
  return { to: getAddress(book), data: encodeFunctionData({ abi: SEALED_BOOK_ABI, functionName: toRecipient ? "claimToRecipient" : "claim", args: [commitment, [...precommitments]] }), value: 0n };
}
