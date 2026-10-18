import { smallestUnitAtLeast, splitAmount, type Job, type JobDraft, type JsonObject } from '@hushcross/core';
import type { Asset, Recipient } from '../../data/types';
import { UNIT_VALUES } from '../../data/units';

/**
 * Typed views of the JSON a one-step job carries (`Job.params` / `Job.outputs`). Everything is plain
 * JSON so it can be sealed into the vault as is; amounts are decimal strings.
 */
export interface SendParams {
  readonly recipient: Recipient;
  /** What the user typed or picked (name, short address), for display. */
  readonly label: string;
  readonly relayDelayMinutes: number;
  /** Attach the optional gas drop (to the largest piece only). */
  readonly gasDrop: boolean;
  readonly requested: bigint;
}

export interface GiftParams {
  readonly mode: 'single' | 'group';
  readonly unit: bigint;
  readonly units: number;
  readonly packets: number;
  readonly message: string;
  readonly expiryHours: number;
}

export interface SaleParams {
  readonly saleId: string;
  readonly symbol: string;
  readonly price: bigint;
  readonly maxSpend: bigint;
  readonly escrow: bigint;
}

export interface DonateParams {
  readonly campaignId: string;
  readonly title: string;
}

const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const n = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const b = (v: unknown): bigint => (typeof v === 'string' && /^\d+$/.test(v) ? BigInt(v) : 0n);

function recipientToJson(r: Recipient): JsonObject {
  return r.kind === 'hushId' ? { kind: 'hushId', hushId: r.hushId, metaAddress: r.metaAddress } : { kind: 'address', address: r.address };
}

function recipientFromJson(v: unknown): Recipient | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.kind === 'hushId' && typeof o.hushId === 'string' && typeof o.metaAddress === 'string') return { kind: 'hushId', hushId: o.hushId, metaAddress: o.metaAddress };
  if (o.kind === 'address' && typeof o.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(o.address)) return { kind: 'address', address: o.address as `0x${string}` };
  return null;
}

export function sendParams(job: Job): SendParams | null {
  const recipient = recipientFromJson(job.params.recipient);
  if (!recipient) return null;
  return { recipient, label: s(job.params.label), relayDelayMinutes: n(job.params.relayDelayMinutes), gasDrop: job.params.gasDrop === true, requested: b(job.params.requested) };
}

export function giftParams(job: Job): GiftParams {
  return { mode: job.params.mode === 'single' ? 'single' : 'group', unit: b(job.params.unit), units: n(job.params.units, 1), packets: n(job.params.packets, 1), message: s(job.params.message), expiryHours: n(job.params.expiryHours, 24) };
}

export function saleParams(job: Job): SaleParams {
  return { saleId: s(job.params.saleId), symbol: s(job.params.symbol), price: b(job.params.price), maxSpend: b(job.params.maxSpend), escrow: b(job.params.escrow) };
}

export function donateParams(job: Job): DonateParams {
  return { campaignId: s(job.params.campaignId), title: s(job.params.title) };
}

export function giftLinks(job: Job): string[] {
  const links = job.outputs.links;
  return Array.isArray(links) ? links.filter((l): l is string => typeof l === 'string') : [];
}

/** Total the job moves (sum of its pieces; for sales the escrow). */
export function jobAmount(job: Job): bigint {
  if (job.kind === 'sale') return saleParams(job).escrow || (job.pieces[0] ?? 0n);
  if (job.kind === 'gift') {
    const p = giftParams(job);
    return p.unit * BigInt(p.units);
  }
  return job.pieces.reduce((sum, p) => sum + p, 0n);
}

/* ------------------------------------------------------------- builders */

export function sendDraft(input: { readonly asset: Asset; readonly amount: bigint; readonly recipient: Recipient; readonly label: string; readonly relayDelayMinutes: number; readonly gasDrop: boolean }): JobDraft | null {
  const split = splitAmount(input.amount, UNIT_VALUES[input.asset]);
  if (split.pieces.length === 0) return null;
  return {
    kind: 'send',
    asset: input.asset,
    pieces: split.pieces,
    params: { recipient: recipientToJson(input.recipient), label: input.label, relayDelayMinutes: input.relayDelayMinutes, gasDrop: input.gasDrop, requested: input.amount.toString() },
  };
}

export function donateDraft(input: { readonly asset: Asset; readonly amount: bigint; readonly campaignId: string; readonly title: string }): JobDraft | null {
  const split = splitAmount(input.amount, UNIT_VALUES[input.asset]);
  if (split.pieces.length === 0) return null;
  return { kind: 'donate', asset: input.asset, pieces: split.pieces, params: { campaignId: input.campaignId, title: input.title }, workKeys: split.pieces.map((_, i) => `piece:${i}`) };
}

/**
 * Red packet: the largest unit that still gives every person at least one unit (at most 100 units in
 * total); what does not divide stays in the vault. The vault side has to cover the packets plus the
 * screening fee on re-deposit and the relay fee, so the reserved pieces carry a 2% margin.
 */
export function planGift(asset: Asset, amount: bigint, people: number): { readonly unit: bigint; readonly units: number; readonly total: bigint; readonly remainder: bigint } | null {
  if (people < 1 || people > 50) return null;
  const units = [...UNIT_VALUES[asset]].sort((a, x) => (a > x ? -1 : a < x ? 1 : 0));
  for (const unit of units) {
    const count = Number(amount / unit);
    if (count >= people && count <= 100) return { unit, units: count, total: unit * BigInt(count), remainder: amount - unit * BigInt(count) };
  }
  const smallest = units.at(-1) as bigint;
  const count = Number(amount / smallest);
  if (count >= people && count > 100) return { unit: smallest, units: 100, total: smallest * 100n, remainder: amount - smallest * 100n };
  return null;
}

export function giftDraft(input: { readonly asset: Asset; readonly amount: bigint; readonly people: number; readonly message: string; readonly expiryHours: number }): JobDraft | null {
  const plan = planGift(input.asset, input.amount, input.people);
  if (!plan) return null;
  const withMargin = plan.total + (plan.total * 200n) / 10_000n;
  const units = UNIT_VALUES[input.asset];
  const smallest = units[0] as bigint;
  const rounded = ((withMargin + smallest - 1n) / smallest) * smallest;
  const split = splitAmount(rounded, units, 16);
  if (split.pieces.length === 0 || split.capped) return null;
  return {
    kind: 'gift',
    asset: input.asset,
    pieces: split.pieces,
    params: { mode: input.people > 1 ? 'group' : 'single', unit: plan.unit.toString(), units: plan.units, packets: input.people, message: input.message, expiryHours: input.expiryHours },
  };
}

/** One vault note must cover `withdrawn`; when the vault has none, the smallest unit that covers it is deposited. */
export function saleDraft(input: { readonly asset: Asset; readonly saleId: string; readonly symbol: string; readonly price: bigint; readonly maxSpend: bigint; readonly escrow: bigint; readonly withdrawn: bigint }): JobDraft | null {
  const fundUnit = smallestUnitAtLeast(input.withdrawn, UNIT_VALUES[input.asset]);
  if (fundUnit === null) return null;
  return {
    kind: 'sale',
    asset: input.asset,
    pieces: [input.withdrawn],
    fundPieces: [fundUnit],
    params: { saleId: input.saleId, symbol: input.symbol, price: input.price.toString(), maxSpend: input.maxSpend.toString(), escrow: input.escrow.toString() },
  };
}
