import { encodeFunctionData, getAddress, zeroAddress, type Address, type Hex } from "viem";
import { CoreError } from "../errors.js";
import type { TxRequest } from "../hushId.js";
import { LAUNCH_FACTORY_ABI, SEALED_SALE_ABI } from "./abi.js";
import { MAX_UINT128, revealArgs, type LaunchBidPreimage } from "./commitment.js";

/** SPEC 4 bounds as enforced by `LaunchFactory.validateParams` (contracts/src/launch/LaunchTypes.sol). */
export const LAUNCH_BOUNDS = {
  commitSecondsMin: 3600,
  commitSecondsMax: 72 * 3600,
  revealSecondsMin: 3600,
  revealSecondsMax: 7 * 24 * 3600,
  liquidityBpsMin: 3000,
  liquidityBpsMax: 8000,
  /** LP token reserve >= 10% of total supply. */
  lpReserveMinBps: 1000,
  /** Creator allocation <= 10% of total supply. */
  creatorMaxBps: 1000,
  vestingSecondsMin: 90 * 24 * 3600,
  vestingSecondsMax: 4 * 365 * 24 * 3600,
  maxBidsLimit: 1000,
} as const;

/** `LaunchParams` struct of `LaunchFactory.createSale`. */
export interface LaunchParams {
  readonly name: string;
  readonly symbol: string;
  /** zero address = BNB. */
  readonly quoteAsset: Address;
  readonly saleSupply: bigint;
  readonly liquiditySupply: bigint;
  readonly creatorSupply: bigint;
  readonly floorPrice: bigint;
  readonly minRaise: bigint;
  readonly commitDuration: bigint;
  readonly revealDuration: bigint;
  readonly liquidityBps: number;
  readonly vestingDuration: bigint;
  readonly maxBids: number;
}

export type LaunchParamIssue =
  | "name"
  | "symbol"
  | "supply"
  | "floor_price"
  | "min_raise"
  | "duration"
  | "liquidity"
  | "creator_share"
  | "vesting"
  | "max_bids"
  | "quote_asset";

export interface SaleDraft {
  readonly name: string;
  readonly symbol: string;
  /** zero address for BNB, the USDT address otherwise. */
  readonly quoteAsset: Address;
  readonly totalSupply: bigint;
  readonly saleSupply: bigint;
  readonly creatorShareBps: number;
  readonly floorPrice: bigint;
  readonly minRaise: bigint;
  readonly commitSeconds: number;
  readonly revealSeconds: number;
  readonly liquidityBps: number;
  readonly vestingSeconds: number;
  readonly maxBids?: number;
}

/**
 * Turn a creator draft into `LaunchParams`. The token supply is exactly `totalSupply`: the creator gets
 * `creatorShareBps` of it, the pool reserve is the remainder after the sale and creator parts and must be
 * at least 10%. Returns every SPEC 4 violation (empty list = the factory accepts it).
 */
export function buildLaunchParams(draft: SaleDraft, usdt: Address): { readonly params: LaunchParams | null; readonly issues: readonly LaunchParamIssue[] } {
  const issues: LaunchParamIssue[] = [];
  const b = LAUNCH_BOUNDS;
  const quote = getAddress(draft.quoteAsset);
  if (quote !== zeroAddress && quote !== getAddress(usdt)) issues.push("quote_asset");
  if (draft.name.trim().length === 0 || new TextEncoder().encode(draft.name).length > 64) issues.push("name");
  if (!/^[A-Z0-9]{2,11}$/u.test(draft.symbol)) issues.push("symbol");
  const creatorOk = Number.isInteger(draft.creatorShareBps) && draft.creatorShareBps >= 0 && draft.creatorShareBps <= b.creatorMaxBps;
  if (!creatorOk) issues.push("creator_share");
  const creatorSupply = creatorOk ? (draft.totalSupply * BigInt(draft.creatorShareBps)) / 10_000n : 0n;
  const liquiditySupply = draft.totalSupply - draft.saleSupply - creatorSupply;
  if (draft.totalSupply <= 0n || draft.totalSupply > MAX_UINT128 || draft.saleSupply <= 0n || liquiditySupply < 0n) issues.push("supply");
  else if (liquiditySupply * 10_000n < draft.totalSupply * BigInt(b.lpReserveMinBps)) issues.push("liquidity");
  if (draft.floorPrice <= 0n || draft.floorPrice > MAX_UINT128) issues.push("floor_price");
  if (draft.minRaise < 0n || draft.minRaise > MAX_UINT128) issues.push("min_raise");
  const inRange = (v: number, lo: number, hi: number): boolean => Number.isInteger(v) && v >= lo && v <= hi;
  if (!inRange(draft.commitSeconds, b.commitSecondsMin, b.commitSecondsMax) || !inRange(draft.revealSeconds, b.revealSecondsMin, b.revealSecondsMax)) issues.push("duration");
  if (!inRange(draft.liquidityBps, b.liquidityBpsMin, b.liquidityBpsMax) && !issues.includes("liquidity")) issues.push("liquidity");
  if (creatorSupply > 0n && !inRange(draft.vestingSeconds, b.vestingSecondsMin, b.vestingSecondsMax)) issues.push("vesting");
  const maxBids = draft.maxBids ?? b.maxBidsLimit;
  if (!inRange(maxBids, 1, b.maxBidsLimit)) issues.push("max_bids");
  if (issues.length > 0) return { params: null, issues };
  return {
    params: {
      name: draft.name.trim(),
      symbol: draft.symbol,
      quoteAsset: quote,
      saleSupply: draft.saleSupply,
      liquiditySupply,
      creatorSupply,
      floorPrice: draft.floorPrice,
      minRaise: draft.minRaise,
      commitDuration: BigInt(draft.commitSeconds),
      revealDuration: BigInt(draft.revealSeconds),
      liquidityBps: draft.liquidityBps,
      vestingDuration: creatorSupply > 0n ? BigInt(draft.vestingSeconds) : 0n,
      maxBids,
    },
    issues,
  };
}

export function buildCreateSaleTx(factory: Address, params: LaunchParams): TxRequest {
  return { to: getAddress(factory), data: encodeFunctionData({ abi: LAUNCH_FACTORY_ABI, functionName: "createSale", args: [params] }), value: 0n };
}

export function buildRevealTx(preimage: LaunchBidPreimage, late = false): TxRequest {
  const [price, maxSpend, recipient, pcs, salt] = revealArgs(preimage);
  return { to: getAddress(preimage.sale), data: encodeFunctionData({ abi: SEALED_SALE_ABI, functionName: late ? "lateReveal" : "reveal", args: [price, maxSpend, recipient, pcs, salt] }), value: 0n };
}

export function buildFinalizeTx(sale: Address, clearingPrice: bigint): TxRequest {
  return { to: getAddress(sale), data: encodeFunctionData({ abi: SEALED_SALE_ABI, functionName: "finalize", args: [clearingPrice] }), value: 0n };
}

/** Anyone may submit a claim: tokens go to the bid's recipient, refunds to its vault notes (vault-funded) plus dust. */
export function buildClaimTx(sale: Address, commitment: Hex, refundPrecommitments: readonly bigint[]): TxRequest {
  return { to: getAddress(sale), data: encodeFunctionData({ abi: SEALED_SALE_ABI, functionName: "claim", args: [commitment, [...refundPrecommitments]] }), value: 0n };
}

export function buildCollectFeesTx(factory: Address, saleId: bigint): TxRequest {
  return { to: getAddress(factory), data: encodeFunctionData({ abi: LAUNCH_FACTORY_ABI, functionName: "collectFees", args: [saleId] }), value: 0n };
}

/** SealedSale.BidStatus. */
export const BID_STATUS = ["none", "committed", "evicted", "revealed", "claimed"] as const;
export type OnchainBidStatus = (typeof BID_STATUS)[number];

export function bidStatusName(code: number): OnchainBidStatus {
  const name = BID_STATUS[code];
  if (name === undefined) throw new CoreError("launch_bid", `unknown bid status ${code}`);
  return name;
}

/** SealedSale.Outcome. */
export type SaleOutcome = "pending" | "cleared" | "failed";

export function saleOutcomeName(code: number): SaleOutcome {
  if (code === 0) return "pending";
  if (code === 1) return "cleared";
  if (code === 2) return "failed";
  throw new CoreError("launch_sale", `unknown sale outcome ${code}`);
}

export type LaunchPhase = "commit" | "reveal" | "clearing" | "cleared" | "failed";

/** Phase from chain time (seconds) and the stored outcome. */
export function launchPhase(nowSec: bigint, commitEnd: bigint, revealEnd: bigint, outcome: SaleOutcome): LaunchPhase {
  if (outcome === "cleared") return "cleared";
  if (outcome === "failed") return "failed";
  if (nowSec < commitEnd) return "commit";
  if (nowSec < revealEnd) return "reveal";
  return "clearing";
}

/** Validity reason codes emitted by `BidValidity` (LAUNCH.md 4.2). */
export const BID_VALIDITY = ["valid", "price_below_floor", "escrow_below_minimum", "max_spend_exceeds_escrow", "zero_quantity"] as const;
