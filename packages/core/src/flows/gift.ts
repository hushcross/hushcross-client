import type { Address } from "viem";
import { CoreError } from "../errors.js";
import { GIFT_PACKETS_PER_CALL } from "../gift.js";
import { BPS_DENOMINATOR, grossForNet } from "../units.js";
import { encodeGiftData, encodeSendData, type Withdrawal } from "../withdrawData.js";

export interface FundingNote {
  readonly id: string;
  readonly value: bigint;
}

export interface GiftFundingCall {
  readonly noteId: string;
  /** Amount withdrawn from the note (proof `withdrawnValue`). */
  readonly withdrawn: bigint;
  readonly fee: bigint;
  readonly dust: bigint;
  /** Packet positions funded by this call, ascending. */
  readonly packetIndexes: readonly number[];
  /** GiftAdapter `values[i]`: gross deposit per packet, same order as `packetIndexes`. */
  readonly values: readonly bigint[];
}

export interface GiftFundingPlan {
  /** exact: each packet nets its face value in the pool. inclusive: fees come out of the packets. */
  readonly mode: "exact" | "inclusive";
  readonly calls: readonly GiftFundingCall[];
}

export interface GiftFundingInput {
  /** Packet face values (units x unit), in packet order. */
  readonly packets: readonly bigint[];
  readonly notes: readonly FundingNote[];
  readonly relayFeeBps: bigint;
  readonly vettingFeeBps: bigint;
  readonly minDeposit: bigint;
}

/**
 * Plan GiftAdapter calls that fund packets from vault notes. Each packet is one deposit and must
 * come from one note; one call spends one note (change stays in the vault) and funds up to 16
 * packets. Prefers exact packets (the sender pays the fees on top); if the notes only cover the
 * face value, falls back to fee-inclusive packets as long as each stays above the pool minimum.
 */
export function planGiftVaultFunding(input: GiftFundingInput): GiftFundingPlan {
  if (input.packets.length === 0) throw new CoreError("gift_funding", "gift has no packets");
  if (input.packets.some((p) => p <= 0n)) throw new CoreError("gift_funding", "packet values must be positive");
  const exact = pack(input, "exact");
  if (exact) return { mode: "exact", calls: exact };
  const inclusive = pack(input, "inclusive");
  if (inclusive) return { mode: "inclusive", calls: inclusive };
  throw new CoreError("insufficient_vault", "insufficient vault notes to fund every packet from a single note");
}

function pack(input: GiftFundingInput, mode: "exact" | "inclusive"): GiftFundingCall[] | null {
  const deposits = input.packets.map((p) => (mode === "exact" ? grossForNet(p, input.vettingFeeBps) : p));
  const order = deposits.map((value, index) => ({ value, index })).sort((a, b) => (a.value > b.value ? -1 : a.value < b.value ? 1 : a.index - b.index));
  const notes = [...input.notes].sort((a, b) => (a.value > b.value ? -1 : a.value < b.value ? 1 : 0));
  const bins = notes.map((note) => ({ note, items: [] as { value: bigint; index: number }[], sum: 0n }));
  for (const item of order) {
    const bin = bins.find((candidate) => {
      if (candidate.items.length >= GIFT_PACKETS_PER_CALL) return false;
      const sum = candidate.sum + item.value;
      return (mode === "exact" ? withdrawnFor(sum, input.relayFeeBps) : sum) <= candidate.note.value;
    });
    if (!bin) return null;
    bin.items.push(item);
    bin.sum += item.value;
  }
  const calls: GiftFundingCall[] = [];
  for (const bin of bins) {
    if (bin.items.length === 0) continue;
    const items = [...bin.items].sort((a, b) => a.index - b.index);
    if (mode === "exact") {
      const withdrawn = withdrawnFor(bin.sum, input.relayFeeBps);
      const fee = (withdrawn * input.relayFeeBps) / BPS_DENOMINATOR;
      calls.push({ noteId: bin.note.id, withdrawn, fee, dust: withdrawn - fee - bin.sum, packetIndexes: items.map((i) => i.index), values: items.map((i) => i.value) });
      continue;
    }
    const withdrawn = bin.sum;
    const fee = (withdrawn * input.relayFeeBps) / BPS_DENOMINATOR;
    const net = withdrawn - fee;
    const values = items.map((i) => (i.value * net) / withdrawn);
    if (values.some((v) => v < input.minDeposit)) return null;
    calls.push({ noteId: bin.note.id, withdrawn, fee, dust: net - values.reduce((s, v) => s + v, 0n), packetIndexes: items.map((i) => i.index), values });
  }
  return calls;
}

/** Smallest W with W - floor(W * bps / 10000) >= total. */
export function withdrawnFor(total: bigint, relayFeeBps: bigint): bigint {
  if (relayFeeBps < 0n || relayFeeBps >= BPS_DENOMINATOR) throw new CoreError("fee_bps", "bps must be in [0, 10000)");
  let withdrawn = (total * BPS_DENOMINATOR + (BPS_DENOMINATOR - relayFeeBps) - 1n) / (BPS_DENOMINATOR - relayFeeBps);
  while (withdrawn > 0n && withdrawn - 1n - ((withdrawn - 1n) * relayFeeBps) / BPS_DENOMINATOR >= total) withdrawn -= 1n;
  while (withdrawn - (withdrawn * relayFeeBps) / BPS_DENOMINATOR < total) withdrawn += 1n;
  return withdrawn;
}

/** GiftAdapter withdrawal for one funding call. Dust goes to the relay so nothing links back. */
export function buildGiftFundingWithdrawal(input: {
  readonly adapter: Address;
  readonly call: GiftFundingCall;
  readonly precommitments: readonly bigint[];
  readonly feeRecipient: Address;
  readonly relayFeeBps: bigint;
}): Withdrawal {
  if (input.precommitments.length !== input.call.values.length) throw new CoreError("gift_funding", "one precommitment per packet");
  return {
    processooor: input.adapter,
    data: encodeGiftData({ precommitments: input.precommitments, values: input.call.values, feeRecipient: input.feeRecipient, relayFeeBPS: input.relayFeeBps, dustRecipient: input.feeRecipient }),
  };
}

export interface GiftClaimToVault {
  readonly withdrawal: Withdrawal;
  readonly withdrawnValue: bigint;
  readonly depositValue: bigint;
  readonly fee: bigint;
}

/** Claim (or reclaim) a whole packet into the claimer's own vault via GiftAdapter. */
export function buildGiftClaimToVault(input: {
  readonly adapter: Address;
  readonly packetValue: bigint;
  readonly relayFeeBps: bigint;
  readonly feeRecipient: Address;
  readonly recipientPrecommitment: bigint;
  readonly minDeposit: bigint;
}): GiftClaimToVault {
  const fee = (input.packetValue * input.relayFeeBps) / BPS_DENOMINATOR;
  const depositValue = input.packetValue - fee;
  if (depositValue < input.minDeposit) throw new CoreError("below_minimum", "packet after fees is below the pool minimum deposit; claim to an address instead");
  return {
    withdrawnValue: input.packetValue,
    depositValue,
    fee,
    withdrawal: {
      processooor: input.adapter,
      data: encodeGiftData({ precommitments: [input.recipientPrecommitment], values: [depositValue], feeRecipient: input.feeRecipient, relayFeeBPS: input.relayFeeBps, dustRecipient: input.feeRecipient }),
    },
  };
}

/** Claim a whole packet to a plain address via HushSend (no announcement). */
export function buildGiftClaimToAddress(input: {
  readonly adapter: Address;
  readonly packetValue: bigint;
  readonly relayFeeBps: bigint;
  readonly feeRecipient: Address;
  readonly recipient: Address;
}): { readonly withdrawal: Withdrawal; readonly withdrawnValue: bigint; readonly recipientGets: bigint } {
  const fee = (input.packetValue * input.relayFeeBps) / BPS_DENOMINATOR;
  return {
    withdrawnValue: input.packetValue,
    recipientGets: input.packetValue - fee,
    withdrawal: {
      processooor: input.adapter,
      data: encodeSendData({ recipient: input.recipient, feeRecipient: input.feeRecipient, relayFeeBPS: input.relayFeeBps, ephemeralPubKey: "0x", metadata: "0x" }),
    },
  };
}
