import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, getAddress, isAddress, keccak256, zeroAddress, type Address, type Hex } from "viem";
import { ERC20_ABI } from "../abi.js";
import { randomBytes } from "../bytes.js";
import { CoreError } from "../errors.js";
import { SNARK_SCALAR_FIELD } from "../field.js";
import type { TxRequest } from "../hushId.js";
import { MAX_REFUND_NOTES } from "../launch/commitment.js";
import { refundNoteBound } from "../launch/funding.js";
import type { Withdrawal } from "../withdrawData.js";
import { GIVE_ESCROW_ABI } from "./abi.js";

/** contracts/src/give/GiveTypes.sol. */
export const GIVE_BOUNDS = {
  maxTitleBytes: 240,
  maxUriBytes: 256,
  minDurationSec: 3600,
  maxDurationSec: 90 * 86_400,
  maxAmount: (1n << 128n) - 1n,
} as const;

export type GiveKind = "tip" | "goal";
export const GIVE_KIND_CODE: Readonly<Record<GiveKind, number>> = { tip: 0, goal: 1 };

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/* ---------------------------------------------------------------- story */

/** The story is not stored by the contracts; it travels inline in `metadataURI` (at most 256 bytes). */
export const STORY_PREFIX = "hcx:story,";

export function encodeCampaignStory(story: string): string {
  const text = story.trim();
  if (text === "") return "";
  if (/^https:\/\/\S+$/u.test(text)) return text;
  return `${STORY_PREFIX}${text}`;
}

export function decodeCampaignStory(uri: string): { readonly story: string; readonly link: string | null } {
  if (uri.startsWith(STORY_PREFIX)) return { story: uri.slice(STORY_PREFIX.length), link: null };
  if (/^https:\/\/\S+$/u.test(uri)) return { story: "", link: uri };
  return { story: "", link: null };
}

/** Bytes left for the story inside the 256-byte metadata URI (negative = too long). */
export function storyBytesLeft(story: string): number {
  return GIVE_BOUNDS.maxUriBytes - utf8Length(encodeCampaignStory(story));
}

/* --------------------------------------------------------------- create */

export interface CampaignDraft {
  readonly kind: GiveKind;
  /** `null` for BNB, otherwise the USDT token. */
  readonly asset: Address | null;
  readonly beneficiary: Address;
  readonly goal: bigint;
  /** Absolute unix seconds (0 for tips). */
  readonly deadline: bigint;
  readonly title: string;
  readonly metadataURI: string;
}

export type CampaignIssue = "title" | "uri" | "beneficiary" | "goal" | "deadline";

/** GiveRegistry.create checks, against `nowSec` (the chain's clock). */
export function campaignIssues(draft: CampaignDraft, nowSec: bigint): CampaignIssue[] {
  const issues: CampaignIssue[] = [];
  const titleBytes = utf8Length(draft.title);
  if (titleBytes === 0 || titleBytes > GIVE_BOUNDS.maxTitleBytes) issues.push("title");
  if (utf8Length(draft.metadataURI) > GIVE_BOUNDS.maxUriBytes) issues.push("uri");
  if (!isAddress(draft.beneficiary, { strict: false }) || getAddress(draft.beneficiary) === zeroAddress) issues.push("beneficiary");
  if (draft.kind === "goal") {
    if (draft.goal <= 0n || draft.goal > GIVE_BOUNDS.maxAmount) issues.push("goal");
    const duration = draft.deadline - nowSec;
    if (duration < BigInt(GIVE_BOUNDS.minDurationSec) || duration > BigInt(GIVE_BOUNDS.maxDurationSec)) issues.push("deadline");
  } else {
    if (draft.goal !== 0n) issues.push("goal");
    if (draft.deadline !== 0n) issues.push("deadline");
  }
  return issues;
}

export function buildCreateCampaignTx(escrow: Address, draft: CampaignDraft): TxRequest {
  return {
    to: getAddress(escrow),
    data: encodeFunctionData({
      abi: GIVE_ESCROW_ABI,
      functionName: "createCampaign",
      args: [GIVE_KIND_CODE[draft.kind] as number, draft.asset ?? zeroAddress, getAddress(draft.beneficiary), draft.goal, draft.deadline, draft.title, draft.metadataURI],
    }),
    value: 0n,
  };
}

/* -------------------------------------------------------------- receipts */

/** A donation receipt: 32 random bytes shown once as `hcr_<64 hex>`; only keccak256(bytes) goes on chain. */
export function newReceiptSecret(): string {
  return `hcr_${bytesToHex(randomBytes(32))}`;
}

export function receiptBytes(secret: string): Hex {
  const text = secret.trim();
  const body = text.startsWith("hcr_") ? text.slice(4) : text.startsWith("0x") ? text.slice(2) : text;
  if (!/^[0-9a-fA-F]{64}$/u.test(body)) throw new CoreError("give_receipt", "receipt secret is malformed");
  return `0x${body.toLowerCase()}`;
}

export function receiptHashOf(secret: string): Hex {
  return keccak256(receiptBytes(secret));
}

/* -------------------------------------------------------------- donate */

/** `GiveAdapter.GiveData`; `relayFee` is absolute in the pool asset. */
export interface GiveData {
  readonly campaignId: bigint;
  readonly receiptHash: Hex;
  readonly precommitments: readonly bigint[];
  readonly dustRecipient: Address;
  readonly feeRecipient: Address;
  readonly relayFee: bigint;
}

export const GIVE_DATA_ABI = [
  {
    type: "tuple",
    components: [
      { name: "campaignId", type: "uint256" },
      { name: "receiptHash", type: "bytes32" },
      { name: "precommitments", type: "uint256[]" },
      { name: "dustRecipient", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "relayFee", type: "uint256" },
    ],
  },
] as const;

export const NO_RECEIPT: Hex = `0x${"00".repeat(32)}`;

export function encodeGiveData(data: GiveData): Hex {
  if (data.precommitments.length > MAX_REFUND_NOTES) throw new CoreError("give_data", `at most ${MAX_REFUND_NOTES} precommitments`);
  for (const pc of data.precommitments) if (pc <= 0n || pc >= SNARK_SCALAR_FIELD) throw new CoreError("give_data", "precommitment must be a non-zero field element");
  if (data.relayFee < 0n) throw new CoreError("give_data", "relay fee must be non-negative");
  return encodeAbiParameters(GIVE_DATA_ABI, [{ campaignId: data.campaignId, receiptHash: data.receiptHash, precommitments: [...data.precommitments], dustRecipient: getAddress(data.dustRecipient), feeRecipient: getAddress(data.feeRecipient), relayFee: data.relayFee }]);
}

export function decodeGiveData(encoded: Hex): GiveData {
  const [v] = decodeAbiParameters(GIVE_DATA_ABI, encoded);
  return { campaignId: v.campaignId, receiptHash: v.receiptHash, precommitments: [...v.precommitments], dustRecipient: v.dustRecipient, feeRecipient: v.feeRecipient, relayFee: v.relayFee };
}

/** GiveAdapter withdrawal (relay target `give`). */
export function buildGiveWithdrawal(input: { readonly adapter: Address } & GiveData): Withdrawal {
  return { processooor: getAddress(input.adapter), data: encodeGiveData(input) };
}

/** Public donation from the wallet: approve USDT first when needed; BNB rides as `msg.value`. */
export function buildPublicDonateTxs(input: {
  readonly escrow: Address;
  readonly campaignId: bigint;
  readonly amount: bigint;
  readonly receiptHash: Hex;
  /** Where a failed goal refunds this donation (a plain address; public donations never re-enter the vault). */
  readonly refundTo: Address;
  /** `null` for BNB campaigns. */
  readonly token: Address | null;
  readonly allowance?: bigint;
}): TxRequest[] {
  const escrow = getAddress(input.escrow);
  const donate = encodeFunctionData({ abi: GIVE_ESCROW_ABI, functionName: "donate", args: [input.campaignId, input.amount, input.receiptHash, getAddress(input.refundTo)] });
  if (input.token === null) return [{ to: escrow, data: donate, value: input.amount }];
  const txs: TxRequest[] = [];
  if ((input.allowance ?? 0n) < input.amount) txs.push({ to: getAddress(input.token), data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [escrow, input.amount] }), value: 0n });
  txs.push({ to: escrow, data: donate, value: 0n });
  return txs;
}

/* -------------------------------------------------------- end of a goal */

export const buildGiveSettleTx = (escrow: Address, campaignId: bigint): TxRequest => ({ to: getAddress(escrow), data: encodeFunctionData({ abi: GIVE_ESCROW_ABI, functionName: "settle", args: [campaignId] }), value: 0n });
export const buildGiveReleaseTx = (escrow: Address, campaignId: bigint): TxRequest => ({ to: getAddress(escrow), data: encodeFunctionData({ abi: GIVE_ESCROW_ABI, functionName: "release", args: [campaignId] }), value: 0n });
export const buildGiveRefundTx = (escrow: Address, campaignId: bigint, index: bigint): TxRequest => ({ to: getAddress(escrow), data: encodeFunctionData({ abi: GIVE_ESCROW_ABI, functionName: "refund", args: [campaignId, index] }), value: 0n });

export type CampaignPhase = "open" | "ended" | "reached" | "missed" | "released";

/** Goal status from the escrow `funds(id)` and the chain clock (tips are always open). */
export function campaignPhase(input: { readonly kind: GiveKind; readonly deadline: bigint; readonly goal: bigint; readonly total: bigint; readonly settled: boolean; readonly reached: boolean; readonly released: boolean }, nowSec: bigint): CampaignPhase {
  if (input.kind === "tip") return "open";
  if (input.released) return "released";
  if (input.settled) return input.reached ? "reached" : "missed";
  return nowSec < input.deadline ? "open" : "ended";
}

/** Parse a stored hex secret string safely (used by UIs to validate pasted receipts). */
export function isReceiptSecret(secret: string): boolean {
  try {
    hexToBytes(receiptBytes(secret).slice(2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Refund precommitments for a vault donation to a goal: enough notes for the greedy unit split of the donation
 * (GiveMath.allocate), at least one; tips take none (the contract rejects them).
 */
export function giveRefundNoteCount(kind: GiveKind, donation: bigint, units: readonly bigint[], vaultFeeBps: bigint): number {
  if (kind === "tip") return 0;
  const n = refundNoteBound(donation, units, vaultFeeBps);
  return Math.min(MAX_REFUND_NOTES, Math.max(1, n));
}
