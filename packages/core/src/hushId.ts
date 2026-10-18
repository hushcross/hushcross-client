import { bytesToHex } from "@noble/hashes/utils.js";
import { encodeFunctionData, getAddress, isHex, type Address, type Hex } from "viem";
import { ENTRYPOINT_ABI, ERC20_ABI, ERC6538_REGISTRY_ABI } from "./abi.js";
import { randomBytes } from "./bytes.js";
import { CoreError } from "./errors.js";
import type { MasterKeys } from "./keys.js";
import { generateStealthPayment, parseMetaAddress, scanAnnouncement, type MetaAddress } from "./stealth.js";
import { SECP256K1_ORDER, bigintFromBytes } from "./field.js";

/** ERC-5564 / ERC-6538 scheme 1: secp256k1 with view tags. */
export const STEALTH_SCHEME_ID = 1n;

/** Registry payload: 33-byte compressed spend key followed by the 33-byte view key. */
export function metaAddressBytes(meta: MetaAddress): Hex {
  return `${meta.spendPublicKey}${meta.viewPublicKey.slice(2)}` as Hex;
}

export function metaFromRegistryBytes(bytes: Hex, chain = "bnb"): MetaAddress {
  if (!isHex(bytes) || bytes.length !== 2 + 66 * 2) throw new CoreError("meta_address", "registry entry must be 66 bytes");
  return parseMetaAddress(`st:${chain}:${bytes}`);
}

/** Calldata for ERC-6538 `registerKeys(1, spend || view)`, sent from the user's public wallet. */
export function encodeRegisterKeys(meta: MetaAddress): Hex {
  return encodeFunctionData({ abi: ERC6538_REGISTRY_ABI, functionName: "registerKeys", args: [STEALTH_SCHEME_ID, metaAddressBytes(meta)] });
}

export interface StealthSendFields {
  readonly recipient: Address;
  readonly ephemeralPubKey: Hex;
  /** `metadata[0]` is the view tag (INTERFACES 2.1). */
  readonly metadata: Hex;
  readonly viewTag: number;
}

/** One-time address plus the announcement fields that go into SendData. */
export function buildStealthSendFields(meta: MetaAddress, ephemeralPrivateKey: Hex = randomScalarHex()): StealthSendFields {
  const payment = generateStealthPayment(meta, ephemeralPrivateKey);
  return {
    recipient: payment.stealthAddress,
    ephemeralPubKey: payment.ephemeralPublicKey,
    metadata: `0x${payment.viewTag.toString(16).padStart(2, "0")}`,
    viewTag: payment.viewTag,
  };
}

/** Indexer `/v1/announcements` item (INTERFACES 5). */
export interface IndexerAnnouncement {
  readonly block: number;
  readonly logIndex: number;
  readonly tx: Hex;
  readonly stealthAddress: Address;
  readonly ephemeralPubKey: Hex;
  readonly metadata: Hex;
}

export interface OwnedAnnouncement extends IndexerAnnouncement {
  /** One-time private key that controls `stealthAddress`. Keep it in memory only. */
  readonly stealthPrivateKey: Hex;
  readonly viewTag: number;
}

export function scanIndexerAnnouncements(keys: MasterKeys, announcements: readonly IndexerAnnouncement[]): OwnedAnnouncement[] {
  const owned: OwnedAnnouncement[] = [];
  for (const item of announcements) {
    if (!isHex(item.metadata) || item.metadata.length < 4) continue;
    const viewTag = Number.parseInt(item.metadata.slice(2, 4), 16);
    const found = scanAnnouncement(keys.stealthSpend, keys.stealthView, {
      schemeId: 1,
      stealthAddress: item.stealthAddress,
      ephemeralPublicKey: item.ephemeralPubKey,
      viewTag,
    });
    if (found) owned.push({ ...item, stealthAddress: found.stealthAddress, stealthPrivateKey: `0x${bytesToHex(found.stealthPrivateKey)}`, viewTag });
  }
  return owned;
}

export interface TxRequest {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
  readonly gas?: bigint;
}

export const SWEEP_NATIVE_GAS = 400_000n;
export const SWEEP_APPROVE_GAS = 60_000n;
export const SWEEP_TOKEN_DEPOSIT_GAS = 420_000n;

export type SweepInput =
  | {
      readonly kind: "native";
      readonly entrypoint: Address;
      readonly precommitment: bigint;
      readonly nativeBalance: bigint;
      readonly gasPriceWei: bigint;
      readonly minDeposit: bigint;
    }
  | {
      readonly kind: "erc20";
      readonly entrypoint: Address;
      readonly token: Address;
      readonly precommitment: bigint;
      readonly tokenBalance: bigint;
      readonly nativeBalance: bigint;
      readonly gasPriceWei: bigint;
      readonly minDeposit: bigint;
    };

export interface SweepPlan {
  readonly txs: readonly TxRequest[];
  readonly depositValue: bigint;
  readonly gasLimit: bigint;
}

/**
 * Move funds received at a one-time address back into the vault: a public deposit sent
 * from the one-time address itself. Native: balance minus gas. Token: approve exactly, then
 * deposit, paying gas with the BNB the sender dropped on the address.
 */
export function planSweep(input: SweepInput): SweepPlan {
  if (input.gasPriceWei <= 0n) throw new CoreError("gas_price", "gas price must be positive");
  if (input.kind === "native") {
    const gasLimit = SWEEP_NATIVE_GAS;
    const depositValue = input.nativeBalance - gasLimit * input.gasPriceWei;
    if (depositValue < input.minDeposit) throw new CoreError("sweep_minimum", "balance after gas is below the pool minimum deposit");
    return {
      gasLimit,
      depositValue,
      txs: [{ to: getAddress(input.entrypoint), data: encodeFunctionData({ abi: ENTRYPOINT_ABI, functionName: "deposit", args: [input.precommitment] }), value: depositValue, gas: gasLimit }],
    };
  }
  const gasLimit = SWEEP_APPROVE_GAS + SWEEP_TOKEN_DEPOSIT_GAS;
  if (input.nativeBalance < gasLimit * input.gasPriceWei) throw new CoreError("sweep_gas", "not enough BNB on the one-time address for gas");
  if (input.tokenBalance < input.minDeposit) throw new CoreError("sweep_minimum", "token balance is below the pool minimum deposit");
  const entrypoint = getAddress(input.entrypoint);
  return {
    gasLimit,
    depositValue: input.tokenBalance,
    txs: [
      { to: getAddress(input.token), data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [entrypoint, input.tokenBalance] }), value: 0n, gas: SWEEP_APPROVE_GAS },
      {
        to: entrypoint,
        data: encodeFunctionData({ abi: ENTRYPOINT_ABI, functionName: "deposit", args: [getAddress(input.token), input.tokenBalance, input.precommitment] }),
        value: 0n,
        gas: SWEEP_TOKEN_DEPOSIT_GAS,
      },
    ],
  };
}

function randomScalarHex(): Hex {
  for (;;) {
    const bytes = randomBytes(32);
    const value = bigintFromBytes(bytes);
    if (value > 0n && value < SECP256K1_ORDER) return `0x${bytesToHex(bytes)}`;
  }
}
