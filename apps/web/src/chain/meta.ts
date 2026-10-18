import { jobsFromJson, reservedNotes, type AccountSecrets, type JsonValue } from '@hushcross/core';
import type { ActivityItem, Asset, PaymentRequest, Recipient } from '../data/types';

/**
 * Typed views over `AccountSecrets.meta` (encrypted with the vault). Everything here is
 * either rebuildable from chain data or harmless local history; secrets live in `gifts`.
 */
export interface StoredJob {
  readonly id: string;
  readonly target: 'send' | 'gift' | 'direct' | 'launch' | 'book' | 'give';
  readonly purpose: 'send' | 'gift_fund' | 'gift_claim' | 'gift_reclaim' | 'launch_bid' | 'book_order' | 'give_donation';
  readonly createdAt: number;
  readonly executeAfter: number;
  readonly asset: Asset;
  readonly amount: bigint;
  readonly recipient: Recipient | null;
}

type JsonObject = { readonly [key: string]: JsonValue };

const isObject = (value: JsonValue | undefined): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: JsonValue | undefined): readonly JsonValue[] => (Array.isArray(value) ? (value as readonly JsonValue[]) : []);
const str = (value: JsonValue | undefined): string | null => (typeof value === 'string' ? value : null);
const num = (value: JsonValue | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const asset = (value: JsonValue | undefined): Asset | null => (value === 'BNB' || value === 'USDT' ? value : null);

function recipientFromJson(value: JsonValue | undefined): Recipient | null {
  if (!isObject(value)) return null;
  if (value.kind === 'hushId' && typeof value.hushId === 'string' && typeof value.metaAddress === 'string') return { kind: 'hushId', hushId: value.hushId, metaAddress: value.metaAddress };
  if (value.kind === 'address' && typeof value.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value.address)) return { kind: 'address', address: value.address as `0x${string}` };
  return null;
}

function recipientToJson(recipient: Recipient | null): JsonValue {
  if (!recipient) return null;
  return recipient.kind === 'hushId' ? { kind: 'hushId', hushId: recipient.hushId, metaAddress: recipient.metaAddress } : { kind: 'address', address: recipient.address };
}

export function readNextIndex(secrets: AccountSecrets): bigint {
  const raw = str(secrets.meta.nextIndex);
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : 0n;
}

export function withMeta(secrets: AccountSecrets, patch: JsonObject): AccountSecrets {
  return { ...secrets, meta: { ...secrets.meta, ...patch } };
}

export function readJobs(secrets: AccountSecrets): StoredJob[] {
  return list(secrets.meta.jobs).flatMap((item): StoredJob[] => {
    if (!isObject(item)) return [];
    const id = str(item.id);
    const a = asset(item.asset);
    const amount = str(item.amount);
    const createdAt = num(item.createdAt);
    const executeAfter = num(item.executeAfter);
    const target = item.target === 'send' || item.target === 'gift' || item.target === 'direct' || item.target === 'launch' || item.target === 'book' || item.target === 'give' ? item.target : null;
    const purpose = item.purpose === 'send' || item.purpose === 'gift_fund' || item.purpose === 'gift_claim' || item.purpose === 'gift_reclaim' || item.purpose === 'launch_bid' || item.purpose === 'book_order' || item.purpose === 'give_donation' ? item.purpose : null;
    if (!id || !a || !amount || createdAt === null || executeAfter === null || !target || !purpose) return [];
    return [{ id, target, purpose, createdAt, executeAfter, asset: a, amount: BigInt(amount), recipient: recipientFromJson(item.recipient) }];
  });
}

export function jobToJson(job: StoredJob): JsonValue {
  return { id: job.id, target: job.target, purpose: job.purpose, createdAt: job.createdAt, executeAfter: job.executeAfter, asset: job.asset, amount: job.amount.toString(), recipient: recipientToJson(job.recipient) };
}

export function readActivity(secrets: AccountSecrets): ActivityItem[] {
  return list(secrets.meta.activity).flatMap((item): ActivityItem[] => {
    if (!isObject(item)) return [];
    const id = str(item.id);
    const kind = str(item.kind);
    const module = str(item.module);
    const amount = str(item.amount);
    const at = num(item.at);
    const status = item.status === 'pending' || item.status === 'done' || item.status === 'failed' ? item.status : null;
    if (!id || !kind || !module || !amount || at === null || !status) return [];
    const subject = str(item.subject);
    return [{ id, kind: kind as ActivityItem['kind'], module: module as ActivityItem['module'], asset: str(item.asset) ?? 'BNB', amount: BigInt(amount), at, status, ...(subject ? { subject } : {}) }];
  });
}

export function activityToJson(item: ActivityItem): JsonValue {
  return { id: item.id, kind: item.kind, module: item.module, asset: item.asset, amount: item.amount.toString(), at: item.at, status: item.status, ...(item.subject ? { subject: item.subject } : {}) };
}

export function readRequests(secrets: AccountSecrets): PaymentRequest[] {
  return list(secrets.meta.requests).flatMap((item): PaymentRequest[] => {
    if (!isObject(item)) return [];
    const a = asset(item.asset);
    const id = str(item.id);
    const unit = str(item.unit);
    const count = num(item.count);
    const createdAt = num(item.createdAt);
    if (!a || !id || !unit || count === null || createdAt === null) return [];
    return [{ id, hushId: str(item.hushId) ?? '', asset: a, unit: BigInt(unit), count, note: str(item.note) ?? '', path: str(item.path) ?? '', createdAt, status: item.status === 'paid' ? 'paid' : 'open' }];
  });
}

export function requestToJson(request: PaymentRequest): JsonValue {
  return { id: request.id, hushId: request.hushId, asset: request.asset, unit: request.unit.toString(), count: request.count, note: request.note, path: request.path, createdAt: request.createdAt, status: request.status };
}

export function readStrings(secrets: AccountSecrets, key: string): string[] {
  return list(secrets.meta[key]).flatMap((v) => (typeof v === 'string' ? [v] : []));
}

export function readNumber(secrets: AccountSecrets, key: string): number | null {
  return num(secrets.meta[key]);
}

export function readString(secrets: AccountSecrets, key: string): string | null {
  return str(secrets.meta[key]);
}

/**
 * A sealed bid this account placed. Holds the reveal preimage (price, max spend, recipient, refund
 * precommitments, salt), so it only ever lives inside the encrypted vault.
 */
export interface StoredBid {
  /** The commitment (also the bid id). */
  readonly id: `0x${string}`;
  readonly saleId: string;
  readonly sale: `0x${string}`;
  readonly asset: Asset;
  readonly price: bigint;
  readonly maxSpend: bigint;
  readonly recipient: `0x${string}`;
  /** Ephemeral public key of the one-time recipient address (re-derive its key with the view key). */
  readonly recipientEphemeral: `0x${string}`;
  readonly refundPrecommitments: readonly bigint[];
  readonly salt: `0x${string}`;
  readonly escrow: bigint;
  readonly funding: 'vault' | 'public';
  readonly delegatedReveal: boolean;
  readonly createdAt: number;
}

const hex = (value: JsonValue | undefined): `0x${string}` | null => (typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value) ? (value as `0x${string}`) : null);
const bigStr = (value: JsonValue | undefined): bigint | null => (typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : null);

export function readBids(secrets: AccountSecrets): StoredBid[] {
  return list(secrets.meta.launchBids).flatMap((item): StoredBid[] => {
    if (!isObject(item)) return [];
    const id = hex(item.id);
    const sale = hex(item.sale);
    const recipient = hex(item.recipient);
    const recipientEphemeral = hex(item.recipientEphemeral);
    const salt = hex(item.salt);
    const a = asset(item.asset);
    const saleId = str(item.saleId);
    const price = bigStr(item.price);
    const maxSpend = bigStr(item.maxSpend);
    const escrow = bigStr(item.escrow);
    const createdAt = num(item.createdAt);
    const funding = item.funding === 'vault' || item.funding === 'public' ? item.funding : null;
    const pcs = list(item.refundPrecommitments).map((v) => bigStr(v));
    if (!id || !sale || !recipient || !recipientEphemeral || !salt || !a || !saleId || price === null || maxSpend === null || escrow === null || createdAt === null || !funding || pcs.some((v) => v === null)) return [];
    return [{ id, saleId, sale, asset: a, price, maxSpend, recipient, recipientEphemeral, refundPrecommitments: pcs as bigint[], salt, escrow, funding, delegatedReveal: item.delegatedReveal === true, createdAt }];
  });
}

export function bidToJson(bid: StoredBid): JsonValue {
  return {
    id: bid.id,
    saleId: bid.saleId,
    sale: bid.sale,
    asset: bid.asset,
    price: bid.price.toString(),
    maxSpend: bid.maxSpend.toString(),
    recipient: bid.recipient,
    recipientEphemeral: bid.recipientEphemeral,
    refundPrecommitments: bid.refundPrecommitments.map((p) => p.toString()),
    salt: bid.salt,
    escrow: bid.escrow.toString(),
    funding: bid.funding,
    delegatedReveal: bid.delegatedReveal,
    createdAt: bid.createdAt,
  };
}

/** Vault meta key of the one-step jobs (Simple mode); see `simple/jobStore.ts`. */
export const JOBS_META_KEY = 'simpleJobs';

/** Notes held by unfinished one-step jobs: other actions must not spend them. */
export function reservedNoteIds(secrets: AccountSecrets): ReadonlySet<string> {
  return reservedNotes(jobsFromJson(secrets.meta[JOBS_META_KEY]));
}
