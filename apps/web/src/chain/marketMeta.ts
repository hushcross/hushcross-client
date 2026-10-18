import type { AccountSecrets, BookOrderPreimage, JsonValue } from '@hushcross/core';
import type { Asset, Funding, OrderSide } from '../data/types';

/**
 * Book orders and Give donations of this account, kept inside the encrypted vault. An order holds its
 * reveal preimage (limit, quantity, recipient, refund precommitments, salt): losing it means the escrow can
 * only come back once someone else's preimage is known, so it is written before anything is sent.
 */
export interface StoredOrder {
  /** The commitment (also the order id). */
  readonly id: `0x${string}`;
  readonly book: `0x${string}`;
  readonly marketId: string;
  readonly epoch: string;
  readonly side: OrderSide;
  readonly limitPrice: bigint;
  readonly quantity: bigint;
  readonly recipient: `0x${string}`;
  /** Ephemeral public key of the one-time recipient (re-derive its key with the view key). */
  readonly recipientEphemeral: `0x${string}`;
  readonly refundPrecommitments: readonly bigint[];
  readonly flags: number;
  readonly salt: `0x${string}`;
  readonly escrow: bigint;
  readonly funding: Funding;
  readonly delegatedReveal: boolean;
  readonly rollover: boolean;
  readonly rolledInto: `0x${string}` | null;
  readonly createdAt: number;
}

export interface StoredDonation {
  readonly id: string;
  readonly campaignId: string;
  readonly asset: Asset;
  /** Amount credited to the campaign (unit minus the absolute relay fee for vault donations). */
  readonly amount: bigint;
  readonly funding: Funding;
  readonly precommitments: readonly bigint[];
  /** Dust / public refund address (a one-time address of this account). */
  readonly payout: `0x${string}`;
  /** Ephemeral public key `payout` was derived with (null for donations stored before it was kept). */
  readonly payoutEphemeral: `0x${string}` | null;
  readonly receiptSecret: string | null;
  /** Escrow donation index once found on chain. */
  readonly index: number | null;
  readonly at: number;
}

/** Campaigns created here: the label shown for the recipient (a Hush ID resolves to a one-time address). */
export interface StoredCampaign {
  readonly id: string;
  readonly recipientLabel: string;
}

type Obj = { readonly [key: string]: JsonValue };
const isObj = (v: JsonValue | undefined): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: JsonValue | undefined): readonly JsonValue[] => (Array.isArray(v) ? (v as readonly JsonValue[]) : []);
const str = (v: JsonValue | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: JsonValue | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const hex = (v: JsonValue | undefined): `0x${string}` | null => (typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v) ? (v as `0x${string}`) : null);
const big = (v: JsonValue | undefined): bigint | null => (typeof v === 'string' && /^\d+$/.test(v) ? BigInt(v) : null);
const funding = (v: JsonValue | undefined): Funding | null => (v === 'vault' || v === 'public' ? v : null);

export const ORDERS_KEY = 'bookOrders';
export const DONATIONS_KEY = 'giveDonations';
export const CAMPAIGNS_KEY = 'giveCampaigns';

export function readOrders(secrets: AccountSecrets): StoredOrder[] {
  return list(secrets.meta[ORDERS_KEY]).flatMap((v): StoredOrder[] => {
    if (!isObj(v)) return [];
    const id = hex(v.id);
    const book = hex(v.book);
    const recipient = hex(v.recipient);
    const recipientEphemeral = hex(v.recipientEphemeral);
    const salt = hex(v.salt);
    const marketId = str(v.marketId);
    const epoch = str(v.epoch);
    const side = v.side === 'buy' || v.side === 'sell' ? v.side : null;
    const limitPrice = big(v.limitPrice);
    const quantity = big(v.quantity);
    const escrow = big(v.escrow);
    const createdAt = num(v.createdAt);
    const fund = funding(v.funding);
    const flags = num(v.flags);
    const pcs = list(v.refundPrecommitments).map(big);
    if (!id || !book || !recipient || !recipientEphemeral || !salt || !marketId || !epoch || !side || limitPrice === null || quantity === null || escrow === null || createdAt === null || !fund || flags === null || pcs.some((p) => p === null)) return [];
    return [{ id, book, marketId, epoch, side, limitPrice, quantity, recipient, recipientEphemeral, refundPrecommitments: pcs as bigint[], flags, salt, escrow, funding: fund, delegatedReveal: v.delegatedReveal === true, rollover: v.rollover === true, rolledInto: hex(v.rolledInto), createdAt }];
  });
}

export function orderToJson(o: StoredOrder): JsonValue {
  return {
    id: o.id,
    book: o.book,
    marketId: o.marketId,
    epoch: o.epoch,
    side: o.side,
    limitPrice: o.limitPrice.toString(),
    quantity: o.quantity.toString(),
    recipient: o.recipient,
    recipientEphemeral: o.recipientEphemeral,
    refundPrecommitments: o.refundPrecommitments.map(String),
    flags: o.flags,
    salt: o.salt,
    escrow: o.escrow.toString(),
    funding: o.funding,
    delegatedReveal: o.delegatedReveal,
    rollover: o.rollover,
    rolledInto: o.rolledInto,
    createdAt: o.createdAt,
  };
}

export function preimageOf(order: StoredOrder, chainId: number): BookOrderPreimage {
  return {
    chainId: BigInt(chainId),
    book: order.book,
    marketId: BigInt(order.marketId),
    epochId: BigInt(order.epoch),
    side: order.side,
    limitPrice: order.limitPrice,
    quantity: order.quantity,
    recipient: order.recipient,
    refundPrecommitments: order.refundPrecommitments,
    flags: order.flags,
    salt: order.salt,
  };
}

export function readDonations(secrets: AccountSecrets): StoredDonation[] {
  return list(secrets.meta[DONATIONS_KEY]).flatMap((v): StoredDonation[] => {
    if (!isObj(v)) return [];
    const id = str(v.id);
    const campaignId = str(v.campaignId);
    const asset = v.asset === 'BNB' || v.asset === 'USDT' ? v.asset : null;
    const amount = big(v.amount);
    const fund = funding(v.funding);
    const payout = hex(v.payout);
    const at = num(v.at);
    const pcs = list(v.precommitments).map(big);
    if (!id || !campaignId || !asset || amount === null || !fund || !payout || at === null || pcs.some((p) => p === null)) return [];
    return [{ id, campaignId, asset, amount, funding: fund, precommitments: pcs as bigint[], payout, payoutEphemeral: hex(v.payoutEphemeral), receiptSecret: str(v.receiptSecret), index: num(v.index), at }];
  });
}

export function donationToJson(d: StoredDonation): JsonValue {
  return { id: d.id, campaignId: d.campaignId, asset: d.asset, amount: d.amount.toString(), funding: d.funding, precommitments: d.precommitments.map(String), payout: d.payout, payoutEphemeral: d.payoutEphemeral, receiptSecret: d.receiptSecret, index: d.index, at: d.at };
}

export function readCampaigns(secrets: AccountSecrets): StoredCampaign[] {
  return list(secrets.meta[CAMPAIGNS_KEY]).flatMap((v): StoredCampaign[] => {
    if (!isObj(v)) return [];
    const id = str(v.id);
    const recipientLabel = str(v.recipientLabel);
    return id && recipientLabel ? [{ id, recipientLabel }] : [];
  });
}

export const campaignToJson = (c: StoredCampaign): JsonValue => ({ id: c.id, recipientLabel: c.recipientLabel });
