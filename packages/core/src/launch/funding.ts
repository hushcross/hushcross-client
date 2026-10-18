import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, getAddress, zeroAddress, type Address, type Hex } from "viem";
import { ERC20_ABI } from "../abi.js";
import { CoreError } from "../errors.js";
import type { TxRequest } from "../hushId.js";
import { deriveDepositSecrets, type MasterKeys, type NoteSecrets } from "../keys.js";
import { BPS_DENOMINATOR, grossForNet } from "../units.js";
import type { Withdrawal } from "../withdrawData.js";
import { FUND_DATA_ABI, SEALED_SALE_ABI } from "./abi.js";
import { MAX_REFUND_NOTES } from "./commitment.js";

export interface EscrowUnits {
  readonly units: readonly bigint[];
  readonly total: bigint;
}

/**
 * LAUNCH.md 3: escrow = amount rounded up to the smallest unit (at least one), written with the fewest
 * units. Each unit divides the next for both unit tables.
 */
export function escrowUnitsFor(amount: bigint, units: readonly bigint[]): EscrowUnits {
  if (amount < 0n) throw new CoreError("launch_escrow", "amount must be non-negative");
  const ascending = [...units].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const smallest = ascending[0];
  if (smallest === undefined || smallest <= 0n) throw new CoreError("launch_escrow", "units must be positive");
  const target = amount === 0n ? smallest : amount;
  const total = ((target + smallest - 1n) / smallest) * smallest;
  const picked: bigint[] = [];
  let remaining = total;
  for (const unit of [...ascending].reverse()) {
    while (remaining >= unit) {
      picked.push(unit);
      remaining -= unit;
    }
  }
  return { units: picked, total };
}

/**
 * Upper bound on the vault notes the greedy refund split (LAUNCH.md 8) can create for any refund up to
 * `escrow`: below the largest unit that fits, unit i appears at most floor((gross(u_{i+1}) - 1) / gross(u_i))
 * times. One extra note covers a later rise of the vault fee. Capped at 16.
 * Sending only this many precommitments keeps unused reserved indexes (recovery gaps) small.
 */
export function refundNoteBound(escrow: bigint, units: readonly bigint[], vaultFeeBps: bigint): number {
  const ascending = [...units].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const gross = ascending.map((u) => grossForNet(u, vaultFeeBps));
  let bound = 0n;
  for (let i = 0; i < ascending.length; i += 1) {
    const g = gross[i] as bigint;
    if (escrow < g) break;
    const next = gross[i + 1];
    const byAmount = escrow / g;
    const byGreedy = next === undefined ? byAmount : (next - 1n) / g;
    bound += byAmount < byGreedy ? byAmount : byGreedy;
  }
  const withMargin = bound + 1n;
  return Number(withMargin > BigInt(MAX_REFUND_NOTES) ? BigInt(MAX_REFUND_NOTES) : withMargin);
}

export interface RefundNote {
  readonly index: bigint;
  readonly secrets: NoteSecrets;
}

/** Refund precommitments come from the account's own deposit index line, so recovery finds the notes. */
export function refundNotesAt(keys: MasterKeys, scope: bigint, indexes: readonly bigint[]): RefundNote[] {
  return indexes.map((index) => ({ index, secrets: deriveDepositSecrets(keys, scope, index) }));
}

export interface FundData {
  readonly sale: Address;
  readonly commitment: Hex;
  readonly feeRecipient: Address;
  /** Absolute relay fee in quote base units. */
  readonly relayFee: bigint;
}

export function encodeFundData(data: FundData): Hex {
  if (data.relayFee < 0n) throw new CoreError("launch_fund", "relay fee must be non-negative");
  return encodeAbiParameters(FUND_DATA_ABI, [{ sale: getAddress(data.sale), commitment: data.commitment, feeRecipient: getAddress(data.feeRecipient), relayFee: data.relayFee }]);
}

export function decodeFundData(encoded: Hex): FundData {
  const [value] = decodeAbiParameters(FUND_DATA_ABI, encoded);
  return { sale: value.sale, commitment: value.commitment, feeRecipient: value.feeRecipient, relayFee: value.relayFee };
}

/** Absolute launch relay fee for a withdrawal of `withdrawn` at `feeBps`, kept inside the relay's [min, max] band. */
export function launchRelayFee(withdrawn: bigint, feeBps: bigint, maxBps: bigint): bigint {
  const up = (withdrawn * feeBps + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
  const cap = (withdrawn * maxBps) / BPS_DENOMINATOR;
  return up <= cap ? up : cap;
}

export interface PrivateBidPlan {
  /** Amount withdrawn from one vault note (a whole number of units; the chain sees escrow + relay fee). */
  readonly withdrawn: bigint;
  readonly relayFee: bigint;
  /** What the sale credits: withdrawn - relayFee >= maxSpend. */
  readonly escrow: bigint;
}

/**
 * Vault-funded bid: one note, one LaunchAdapter call. The withdrawal is a unit multiple and must leave at
 * least `maxSpend` after the relay fee, so it is rounded up over `maxSpend + fee` (fee depends on the amount).
 */
export async function planPrivateBid(input: {
  readonly maxSpend: bigint;
  readonly units: readonly bigint[];
  /** Absolute relay fee the relay will accept for a withdrawal of this size (e.g. quote + `launchRelayFee`). */
  readonly feeFor: (withdrawn: bigint) => bigint | Promise<bigint>;
}): Promise<PrivateBidPlan> {
  if (input.maxSpend <= 0n) throw new CoreError("launch_bid", "max spend must be positive");
  let withdrawn = escrowUnitsFor(input.maxSpend, input.units).total;
  for (let round = 0; round < 6; round += 1) {
    const relayFee = await input.feeFor(withdrawn);
    if (withdrawn - relayFee >= input.maxSpend) return { withdrawn, relayFee, escrow: withdrawn - relayFee };
    withdrawn = escrowUnitsFor(input.maxSpend + relayFee, input.units).total;
  }
  throw new CoreError("launch_bid", "could not fit the relay fee into the escrow");
}

/** LaunchAdapter withdrawal for a vault-funded bid (relay target `launch`). */
export function buildFundBidWithdrawal(input: { readonly adapter: Address } & FundData): Withdrawal {
  return { processooor: getAddress(input.adapter), data: encodeFundData(input) };
}

/** Public-wallet bid: escrow = max spend rounded up to units; USDT needs an exact approval first. */
export function buildPublicCommitTxs(input: {
  readonly sale: Address;
  readonly commitment: Hex;
  readonly escrow: bigint;
  /** null for BNB sales. */
  readonly quoteToken: Address | null;
  readonly allowance?: bigint;
}): TxRequest[] {
  const sale = getAddress(input.sale);
  const commit = encodeFunctionData({ abi: SEALED_SALE_ABI, functionName: "commit", args: [input.commitment, input.escrow] });
  if (input.quoteToken === null || getAddress(input.quoteToken) === zeroAddress) return [{ to: sale, data: commit, value: input.escrow }];
  const txs: TxRequest[] = [];
  if ((input.allowance ?? 0n) < input.escrow) {
    txs.push({ to: getAddress(input.quoteToken), data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [sale, input.escrow] }), value: 0n });
  }
  txs.push({ to: sale, data: commit, value: 0n });
  return txs;
}
