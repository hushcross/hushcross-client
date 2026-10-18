import { bytesToHex } from "@noble/hashes/utils.js";
import { encodeFunctionData, getAddress, isAddress, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ERC20_ABI } from "./abi.js";
import type { Deployments } from "./deployments.js";
import { CoreError } from "./errors.js";
import { SWEEP_APPROVE_GAS, SWEEP_NATIVE_GAS, SWEEP_TOKEN_DEPOSIT_GAS, planSweep, type SweepPlan, type TxRequest } from "./hushId.js";
import type { MasterKeys } from "./keys.js";
import { deriveStealthKey } from "./stealth.js";
import { BNB_UNITS, USDT_UNITS } from "./units.js";

/**
 * One-time addresses this account created for itself: Book order recipients (bought tokens and USDT dust),
 * Launch bid recipients (the sale token and refund dust) and Give payout / refund addresses. They are not
 * announced (ERC-5564), so they are found from the local order / bid / donation records, and each key is
 * re-derived from the phrase with the recorded ephemeral key.
 */
export type OneTimeSource = "book" | "launch" | "give";

export interface OneTimeRecord {
  readonly source: OneTimeSource;
  /** Order / bid commitment or donation id. */
  readonly ref: string;
  readonly address: Address;
  /** Ephemeral public key the address was derived with; null when the record predates storing it. */
  readonly ephemeralPublicKey: Hex | null;
  /** Unix ms of the order / bid / donation. */
  readonly createdAt: number;
}

export interface OneTimeAddress {
  readonly address: Address;
  readonly source: OneTimeSource;
  /** Every record paying this address (normally one). */
  readonly refs: readonly string[];
  readonly createdAt: number;
  /** The one-time key; null when it cannot be re-derived (no ephemeral key, or it does not match). Memory only. */
  readonly privateKey: Hex | null;
}

/** Book orders as stored by the clients (`recipient` + `recipientEphemeral`). */
export function bookOneTimeRecords(orders: readonly { readonly id: string; readonly recipient: Address; readonly recipientEphemeral: Hex | null; readonly createdAt: number }[]): OneTimeRecord[] {
  return orders.map((o) => ({ source: "book", ref: o.id, address: o.recipient, ephemeralPublicKey: o.recipientEphemeral, createdAt: o.createdAt }));
}

/** Launch bids as stored by the clients (`recipient` + `recipientEphemeral`; older records may lack the key). */
export function launchOneTimeRecords(bids: readonly { readonly id: string; readonly recipient: Address; readonly recipientEphemeral?: Hex | null; readonly createdAt: number }[]): OneTimeRecord[] {
  return bids.map((b) => ({ source: "launch", ref: b.id, address: b.recipient, ephemeralPublicKey: b.recipientEphemeral ?? null, createdAt: b.createdAt }));
}

/** Give donations as stored by the clients (`payout` + `payoutEphemeral`). */
export function giveOneTimeRecords(donations: readonly { readonly id: string; readonly payout: Address; readonly payoutEphemeral?: Hex | null; readonly at: number }[]): OneTimeRecord[] {
  return donations.map((d) => ({ source: "give", ref: d.id, address: d.payout, ephemeralPublicKey: d.payoutEphemeral ?? null, createdAt: d.at }));
}

/** Re-derive the key of `expected` from its ephemeral key; null when it does not belong to this account. */
export function recoverOneTimeKey(keys: MasterKeys, ephemeralPublicKey: Hex, expected: Address): Hex | null {
  const found = deriveStealthKey(keys.stealthSpend, keys.stealthView, ephemeralPublicKey);
  if (found === null || found.stealthAddress !== getAddress(expected)) return null;
  return `0x${bytesToHex(found.stealthPrivateKey)}`;
}

/** One entry per address (newest first), with its key when any of its records can re-derive it. */
export function listOneTimeAddresses(keys: MasterKeys, records: readonly OneTimeRecord[]): OneTimeAddress[] {
  const byAddress = new Map<string, OneTimeAddress>();
  for (const record of records) {
    if (!isAddress(record.address, { strict: false })) continue;
    const address = getAddress(record.address);
    const key = address.toLowerCase();
    const derived = record.ephemeralPublicKey === null ? null : recoverOneTimeKey(keys, record.ephemeralPublicKey, address);
    const prior = byAddress.get(key);
    byAddress.set(
      key,
      prior === undefined
        ? { address, source: record.source, refs: [record.ref], createdAt: record.createdAt, privateKey: derived }
        : { ...prior, refs: [...prior.refs, record.ref], createdAt: Math.max(prior.createdAt, record.createdAt), privateKey: prior.privateKey ?? derived },
    );
  }
  return [...byAddress.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** A token a one-time address may hold: BNB (`token` null), USDT, each Book pair's base token and sale tokens. */
export interface OneTimeToken {
  readonly symbol: string;
  readonly token: Address | null;
  readonly decimals: number;
  /** The vault pool it can be moved into, if any. */
  readonly vaultAsset: "BNB" | "USDT" | null;
}

/** The token of a Launch sale the client already read (`SealedSale.token()` and the token's ERC-20 metadata). */
export interface SaleTokenInfo {
  readonly token: Address;
  readonly symbol: string;
  /** Defaults to 18 (every LaunchFactory token). */
  readonly decimals?: number;
}

/**
 * BNB, USDT, each Book pair's base token, then the given sale tokens. A sale picks its own symbol, so a sale
 * token whose symbol is already taken (for example a token calling itself "USDT") is listed under its symbol
 * plus a short address, never as the listed token: holdings are told apart by symbol.
 */
export function oneTimeTokens(deployments: Deployments, saleTokens: readonly SaleTokenInfo[] = []): OneTimeToken[] {
  const usdt = getAddress(deployments.pools.USDT.asset);
  const out: OneTimeToken[] = [
    { symbol: "BNB", token: null, decimals: 18, vaultAsset: "BNB" },
    { symbol: "USDT", token: usdt, decimals: 18, vaultAsset: "USDT" },
  ];
  for (const pair of deployments.bookPairs) {
    const base = getAddress(pair.base);
    if (out.some((t) => t.token === base)) continue;
    out.push({ symbol: pair.symbol, token: base, decimals: pair.decimals, vaultAsset: null });
  }
  for (const sale of saleTokens) {
    if (!isAddress(sale.token, { strict: false })) continue;
    const token = getAddress(sale.token);
    if (out.some((t) => t.token === token)) continue;
    const name = sale.symbol.trim();
    const taken = name === "" || out.some((t) => t.symbol.toLowerCase() === name.toLowerCase());
    out.push({ symbol: taken ? `${name === "" ? "TOKEN" : name} (${token.slice(0, 6)}…${token.slice(-4)})` : name, token, decimals: sale.decimals ?? 18, vaultAsset: null });
  }
  return out;
}

export interface BalanceReader {
  getNativeBalance(address: Address): Promise<bigint>;
  getTokenBalance(token: Address, owner: Address): Promise<bigint>;
}

export interface OneTimeBalance extends OneTimeToken {
  readonly amount: bigint;
}

/** Every listed token's balance at `address` (zeros included, in `tokens` order). */
export async function readOneTimeBalances(reader: BalanceReader, address: Address, tokens: readonly OneTimeToken[]): Promise<OneTimeBalance[]> {
  const amounts = await Promise.all(tokens.map((t) => (t.token === null ? reader.getNativeBalance(address) : reader.getTokenBalance(t.token, address))));
  return tokens.map((t, i) => ({ ...t, amount: amounts[i] ?? 0n }));
}

export const ONE_TIME_NATIVE_TRANSFER_GAS = 21_000n;
/** Gas limit for an ERC-20 `transfer` to a fresh holder (about 52k used on BSC-USD / BTCB). */
export const ONE_TIME_TOKEN_TRANSFER_GAS = 70_000n;

export type OneTimeTransferInput =
  | {
      readonly kind: "native";
      readonly from: Address;
      readonly to: Address;
      readonly nativeBalance: bigint;
      readonly gasPriceWei: bigint;
      /** Defaults to 21,000 (a plain transfer to an account without code). */
      readonly gasLimit?: bigint;
    }
  | {
      readonly kind: "erc20";
      readonly from: Address;
      readonly to: Address;
      readonly token: Address;
      readonly tokenBalance: bigint;
      /** Defaults to the whole balance. */
      readonly amount?: bigint;
      readonly nativeBalance: bigint;
      readonly gasPriceWei: bigint;
      readonly gasLimit?: bigint;
    };

export interface OneTimeTransferPlan {
  readonly tx: TxRequest & { readonly gas: bigint };
  readonly gasPriceWei: bigint;
  /** Amount that arrives (BNB for native, token units for ERC-20). */
  readonly amount: bigint;
  /** Upper bound of the gas paid by the one-time address. */
  readonly maxGasCost: bigint;
}

/**
 * Move funds out of a one-time address to `to`. ERC-20: the whole (or the given) token balance, gas paid from
 * the BNB on the address. Native: the balance minus the gas of the transfer itself, so nothing is left behind.
 */
export function planOneTimeTransfer(input: OneTimeTransferInput): OneTimeTransferPlan {
  if (input.gasPriceWei <= 0n) throw new CoreError("gas_price", "gas price must be positive");
  if (!isAddress(input.to, { strict: false }) || /^0x0{40}$/iu.test(input.to)) throw new CoreError("address", "recipient is not an address");
  const to = getAddress(input.to);
  if (to === getAddress(input.from)) throw new CoreError("address", "recipient is the one-time address itself");
  if (input.kind === "native") {
    const gas = input.gasLimit ?? ONE_TIME_NATIVE_TRANSFER_GAS;
    const maxGasCost = gas * input.gasPriceWei;
    const amount = input.nativeBalance - maxGasCost;
    if (amount <= 0n) throw new CoreError("one_time_gas", "the BNB balance does not cover the gas of the transfer");
    return { tx: { to, data: "0x", value: amount, gas }, gasPriceWei: input.gasPriceWei, amount, maxGasCost };
  }
  const amount = input.amount ?? input.tokenBalance;
  if (amount <= 0n || amount > input.tokenBalance) throw new CoreError("amount", "nothing to send, or more than the token balance");
  const gas = input.gasLimit ?? ONE_TIME_TOKEN_TRANSFER_GAS;
  const maxGasCost = gas * input.gasPriceWei;
  if (input.nativeBalance < maxGasCost) throw new CoreError("one_time_gas", "not enough BNB on the one-time address for gas");
  return {
    tx: { to: getAddress(input.token), data: encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [to, amount] }), value: 0n, gas },
    gasPriceWei: input.gasPriceWei,
    amount,
    maxGasCost,
  };
}

export interface SignedOneTimeTx {
  readonly raw: Hex;
  readonly hash: Hex;
  readonly from: Address;
}

/** Sign a planned transaction (legacy, exact gas price) with the one-time key; broadcast `raw` with any RPC. */
export async function signOneTimeTx(input: { readonly privateKey: Hex; readonly chainId: number; readonly nonce: number; readonly gasPriceWei: bigint; readonly tx: TxRequest & { readonly gas: bigint } }): Promise<SignedOneTimeTx> {
  const account = privateKeyToAccount(input.privateKey);
  const raw = await account.signTransaction({ type: "legacy", chainId: input.chainId, nonce: input.nonce, gasPrice: input.gasPriceWei, gas: input.tx.gas, to: input.tx.to, value: input.tx.value, data: input.tx.data });
  return { raw, hash: keccak256(raw), from: account.address };
}

/** Plan + sign in one step (the transfer the UI offers as "Send to an address"). */
export async function signOneTimeTransfer(input: OneTimeTransferInput & { readonly privateKey: Hex; readonly chainId: number; readonly nonce: number }): Promise<SignedOneTimeTx & { readonly plan: OneTimeTransferPlan }> {
  const plan = planOneTimeTransfer(input);
  const signed = await signOneTimeTx({ privateKey: input.privateKey, chainId: input.chainId, nonce: input.nonce, gasPriceWei: plan.gasPriceWei, tx: plan.tx });
  if (signed.from !== getAddress(input.from)) throw new CoreError("secret_key", "the key does not control the one-time address");
  return { ...signed, plan };
}

export interface VaultMoveFacts {
  readonly nativeBalance: bigint;
  readonly usdtBalance: bigint;
  /** Any other token still on the address (its transfer needs the BNB that is there). */
  readonly otherTokens: boolean;
  readonly gasPriceWei: bigint;
  /** Pool minimum deposits (`Entrypoint.assetConfig`). */
  readonly usdtMinDeposit: bigint;
  readonly bnbMinDeposit: bigint;
}

/**
 * Which assets can go back into the vault through the Hush ID sweep (a public deposit from the one-time
 * address): USDT at or above the smallest unit with gas for approve + deposit; BNB at or above the smallest
 * unit after gas, and only once no token is left (the BNB is their gas).
 */
export function oneTimeVaultOptions(facts: VaultMoveFacts): ("USDT" | "BNB")[] {
  const out: ("USDT" | "BNB")[] = [];
  const usdtMin = maxOf(facts.usdtMinDeposit, USDT_UNITS[0]);
  const bnbMin = maxOf(facts.bnbMinDeposit, BNB_UNITS[0]);
  if (facts.usdtBalance >= usdtMin && facts.nativeBalance >= (SWEEP_APPROVE_GAS + SWEEP_TOKEN_DEPOSIT_GAS) * facts.gasPriceWei) out.push("USDT");
  if (facts.usdtBalance === 0n && !facts.otherTokens && facts.nativeBalance - SWEEP_NATIVE_GAS * facts.gasPriceWei >= bnbMin) out.push("BNB");
  return out;
}

/** The sweep transactions for one asset (core `planSweep`), after the same checks as `oneTimeVaultOptions`. */
export function planOneTimeVaultMove(input: { readonly asset: "USDT" | "BNB"; readonly entrypoint: Address; readonly usdt: Address; readonly precommitment: bigint; readonly facts: VaultMoveFacts }): SweepPlan {
  const { facts } = input;
  if (!oneTimeVaultOptions(facts).includes(input.asset)) {
    throw new CoreError(input.asset === "BNB" && (facts.usdtBalance > 0n || facts.otherTokens) ? "sweep_order" : "sweep_minimum", `${input.asset} on this address cannot go back into the vault now`);
  }
  return input.asset === "USDT"
    ? planSweep({ kind: "erc20", entrypoint: input.entrypoint, token: input.usdt, precommitment: input.precommitment, tokenBalance: facts.usdtBalance, nativeBalance: facts.nativeBalance, gasPriceWei: facts.gasPriceWei, minDeposit: maxOf(facts.usdtMinDeposit, USDT_UNITS[0]) })
    : planSweep({ kind: "native", entrypoint: input.entrypoint, precommitment: input.precommitment, nativeBalance: facts.nativeBalance, gasPriceWei: facts.gasPriceWei, minDeposit: maxOf(facts.bnbMinDeposit, BNB_UNITS[0]) });
}

function maxOf(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
