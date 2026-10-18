import type { BookPayment } from '@hushcross/core';
import type { Address, Hex } from '../data/types';

/** SealedBook / GiveEscrow reads the Book and Give data layer needs (fakeable in tests). */

export interface BookEpochState {
  /** 0 pending, 1 cleared, 2 voided. */
  readonly status: number;
  readonly voidReason: number;
  readonly longSide: number;
  readonly finalizedAt: bigint;
  readonly price: bigint;
  readonly volume: bigint;
  readonly quoteVolume: bigint;
  readonly filledOrders: number;
  readonly orderCount: number;
}

export interface BookOrderBrief {
  readonly epoch: bigint;
  /** 0 buy, 1 sell. */
  readonly side: number;
  /** 0 unrevealed, 1 valid, 2+ invalid reasons. */
  readonly validity: number;
  readonly flags: number;
  readonly vaultFunded: boolean;
  readonly claimed: boolean;
  /** 0 when the commitment is unknown. */
  readonly escrow: bigint;
  readonly recipient: Address;
}

interface LogBase {
  readonly block: bigint;
  readonly logIndex: number;
  readonly tx: Hex;
}

export type BookLog =
  | (LogBase & { readonly kind: 'committed'; readonly marketId: bigint; readonly epoch: bigint; readonly commitment: Hex })
  | (LogBase & { readonly kind: 'revealed'; readonly commitment: Hex; readonly validity: number })
  | (LogBase & { readonly kind: 'settled'; readonly marketId: bigint; readonly epoch: bigint; readonly price: bigint; readonly volume: bigint; readonly quoteVolume: bigint; readonly filledOrders: number })
  | (LogBase & { readonly kind: 'voided'; readonly marketId: bigint; readonly epoch: bigint; readonly reason: number })
  | (LogBase & { readonly kind: 'carried'; readonly marketId: bigint; readonly fromEpoch: bigint; readonly toEpoch: bigint; readonly commitment: Hex })
  | (LogBase & { readonly kind: 'reference'; readonly marketId: bigint; readonly epoch: bigint; readonly price: bigint })
  | (LogBase & { readonly kind: 'claimed'; readonly commitment: Hex; readonly baseAmount: bigint; readonly quoteAmount: bigint });

export interface OnchainCampaign {
  readonly id: bigint;
  readonly beneficiary: Address;
  /** zero address = BNB. */
  readonly asset: Address;
  /** 0 tip, 1 goal. */
  readonly kind: number;
  readonly deadline: bigint;
  readonly goal: bigint;
  readonly creator: Address;
  readonly title: string;
  readonly metadataURI: string;
}

export interface CampaignFunds {
  readonly total: bigint;
  readonly escrowed: bigint;
  readonly donations: bigint;
  readonly settled: boolean;
  readonly reached: boolean;
  readonly released: boolean;
}

export interface OnchainDonation {
  readonly amount: bigint;
  readonly receiptHash: Hex;
  readonly payout: Address;
  readonly vaultFunded: boolean;
  readonly refunded: boolean;
}

export type GiveLog =
  | (LogBase & { readonly kind: 'created'; readonly campaignId: bigint })
  | (LogBase & { readonly kind: 'donated'; readonly campaignId: bigint; readonly amount: bigint; readonly receiptHash: Hex })
  | (LogBase & { readonly kind: 'settled'; readonly campaignId: bigint; readonly reached: boolean; readonly total: bigint })
  | (LogBase & { readonly kind: 'released'; readonly campaignId: bigint; readonly amount: bigint })
  | (LogBase & { readonly kind: 'refunded'; readonly campaignId: bigint; readonly amount: bigint });

export interface MarketsPort {
  getBookEpoch(book: Address, marketId: bigint, epoch: bigint): Promise<BookEpochState>;
  getOrderBrief(book: Address, commitment: Hex): Promise<BookOrderBrief>;
  /** `previewPayment`; null for an unknown order. */
  getOrderPayment(book: Address, commitment: Hex): Promise<BookPayment | null>;
  /** Live reference price; null when the oracle is stale or unreadable. */
  getReferencePrice(book: Address, marketId: bigint): Promise<bigint | null>;
  /** `minEscrow(marketId)`: smallest escrow `commit` accepts (USDT for a buy, base for a sell). */
  getMinEscrow(book: Address, marketId: bigint): Promise<{ readonly minQuote: bigint; readonly minBase: bigint }>;
  /** `preview(...)` diagnose code: 0 cleared, 1 no cross, 2 band failure, 3+ rejected. */
  previewSettle(book: Address, marketId: bigint, epoch: bigint, proposal: { readonly pLow: bigint; readonly pHigh: bigint; readonly pivot: bigint; readonly marginalLevel: bigint }): Promise<number>;
  /** `previewNoCross`: 1 when `settleNoCross` would be accepted. */
  previewNoCross(book: Address, marketId: bigint, epoch: bigint): Promise<number>;
  getBookLogs(book: Address, fromBlock: bigint, toBlock: bigint): Promise<readonly BookLog[]>;
  getTransactionInput(hash: Hex): Promise<Hex>;

  getCampaignCount(registry: Address): Promise<bigint>;
  getCampaign(registry: Address, id: bigint): Promise<OnchainCampaign>;
  getCampaignFunds(escrow: Address, id: bigint): Promise<CampaignFunds>;
  getDonation(escrow: Address, id: bigint, index: bigint): Promise<OnchainDonation>;
  getDonationNotes(escrow: Address, id: bigint, index: bigint): Promise<readonly bigint[]>;
  verifyReceipt(escrow: Address, secret: Hex, id: bigint): Promise<bigint>;
  getGiveLogs(escrow: Address, fromBlock: bigint, toBlock: bigint): Promise<readonly GiveLog[]>;
}
