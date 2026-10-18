import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { publicKeyToAddress } from "viem/accounts";
import { getAddress, isAddress, isHex, keccak256, type Address, type Hex } from "viem";
import { CoreError } from "./errors.js";
import { SECP256K1_ORDER, bigintFromBytes, bigintToBytes } from "./field.js";
import type { MasterKeys } from "./keys.js";

export interface MetaAddress {
  readonly chain: string;
  readonly spendPublicKey: Hex;
  readonly viewPublicKey: Hex;
}

export interface StealthAnnouncement {
  readonly schemeId: number;
  readonly stealthAddress: Address;
  readonly ephemeralPublicKey: Hex;
  readonly viewTag: number;
}

export interface StealthPayment extends StealthAnnouncement {
  readonly schemeId: 1;
}

export interface StealthDiscovery {
  readonly stealthAddress: Address;
  readonly stealthPrivateKey: Uint8Array;
  readonly ephemeralPublicKey: Hex;
  readonly viewTag: number;
}

const META_PATTERN = /^(?:st:([a-z0-9]+):)?(0x[0-9a-fA-F]{132})$/u;

export function stealthMetaFromMaster(keys: MasterKeys, chain = "bnb"): MetaAddress {
  return {
    chain,
    spendPublicKey: compressedHex(secp256k1.getPublicKey(keys.stealthSpend, true)),
    viewPublicKey: compressedHex(secp256k1.getPublicKey(keys.stealthView, true)),
  };
}

export function formatMetaAddress(meta: MetaAddress): string {
  return `st:${meta.chain}:${meta.spendPublicKey}${meta.viewPublicKey.slice(2)}`;
}

export function parseMetaAddress(text: string): MetaAddress {
  const match = META_PATTERN.exec(text.trim());
  if (!match) throw new CoreError("meta_address", "meta-address must be st:<chain>:0x plus two compressed keys");
  const chain = match[1] ?? "bnb";
  const body = match[2];
  if (!body) throw new CoreError("meta_address", "meta-address is missing its keys");
  const spendPublicKey = `0x${body.slice(2, 68)}` as Hex;
  const viewPublicKey = `0x${body.slice(68)}` as Hex;
  assertCompressed(spendPublicKey);
  assertCompressed(viewPublicKey);
  return { chain, spendPublicKey, viewPublicKey };
}

/** ERC-5564 scheme 1: secp256k1 ECDH, view tag = first byte of keccak256(compressed shared secret). */
export function generateStealthPayment(meta: MetaAddress, ephemeralPrivateKey: Hex): StealthPayment {
  const ephemeral = secretKey(ephemeralPrivateKey);
  const spendPoint = secp256k1.Point.fromBytes(bytesFromHex(meta.spendPublicKey));
  const shared = secp256k1.getSharedSecret(ephemeral, bytesFromHex(meta.viewPublicKey), true);
  const { viewTag, tweak } = hashSharedSecret(shared);
  const stealthPoint = spendPoint.add(secp256k1.Point.fromBytes(secp256k1.getPublicKey(tweak, false)));
  return {
    schemeId: 1,
    stealthAddress: addressOf(stealthPoint.toBytes(false)),
    ephemeralPublicKey: compressedHex(secp256k1.getPublicKey(ephemeral, true)),
    viewTag,
  };
}

export function scanAnnouncement(
  spendPrivateKey: Uint8Array,
  viewPrivateKey: Uint8Array,
  announcement: StealthAnnouncement,
): StealthDiscovery | null {
  if (!secp256k1.utils.isValidSecretKey(spendPrivateKey) || !secp256k1.utils.isValidSecretKey(viewPrivateKey)) {
    throw new CoreError("secret_key", "stealth scanning key is not a secp256k1 scalar");
  }
  if (announcement.schemeId !== 1) return null;
  if (!Number.isInteger(announcement.viewTag) || announcement.viewTag < 0 || announcement.viewTag > 255) return null;
  if (!isAddress(announcement.stealthAddress) || !isHex(announcement.ephemeralPublicKey)) return null;
  let ephemeral: Uint8Array;
  try {
    ephemeral = bytesFromHex(announcement.ephemeralPublicKey);
    if (!secp256k1.utils.isValidPublicKey(ephemeral)) return null;
  } catch {
    return null;
  }
  const shared = secp256k1.getSharedSecret(viewPrivateKey, ephemeral, true);
  const hashed = hashSharedSecret(shared);
  if (hashed.viewTag !== announcement.viewTag) return null;
  const stealthPrivate = (bigintFromBytes(spendPrivateKey) + bigintFromBytes(hashed.tweak)) % SECP256K1_ORDER;
  if (stealthPrivate === 0n) return null;
  const stealthPrivateKey = bigintToBytes(stealthPrivate, 32);
  const stealthAddress = addressOf(secp256k1.getPublicKey(stealthPrivateKey, false));
  if (stealthAddress !== getAddress(announcement.stealthAddress)) return null;
  return {
    stealthAddress,
    stealthPrivateKey,
    ephemeralPublicKey: compressedHex(ephemeral),
    viewTag: hashed.viewTag,
  };
}

/**
 * One-time key for a payment this account created to its own meta-address (no announcement, so no view tag
 * to check): spend + keccak256(ECDH(view, ephemeral)). Returns null when the ephemeral key is not a point.
 */
export function deriveStealthKey(
  spendPrivateKey: Uint8Array,
  viewPrivateKey: Uint8Array,
  ephemeralPublicKey: Hex,
): { readonly stealthAddress: Address; readonly stealthPrivateKey: Uint8Array } | null {
  if (!secp256k1.utils.isValidSecretKey(spendPrivateKey) || !secp256k1.utils.isValidSecretKey(viewPrivateKey)) {
    throw new CoreError("secret_key", "stealth key is not a secp256k1 scalar");
  }
  let ephemeral: Uint8Array;
  try {
    if (!isHex(ephemeralPublicKey)) return null;
    ephemeral = bytesFromHex(ephemeralPublicKey);
    if (!secp256k1.utils.isValidPublicKey(ephemeral)) return null;
  } catch {
    return null;
  }
  const { tweak } = hashSharedSecret(secp256k1.getSharedSecret(viewPrivateKey, ephemeral, true));
  const scalar = (bigintFromBytes(spendPrivateKey) + bigintFromBytes(tweak)) % SECP256K1_ORDER;
  if (scalar === 0n) return null;
  const stealthPrivateKey = bigintToBytes(scalar, 32);
  return { stealthAddress: addressOf(secp256k1.getPublicKey(stealthPrivateKey, false)), stealthPrivateKey };
}

export function scanAnnouncements(
  spendPrivateKey: Uint8Array,
  viewPrivateKey: Uint8Array,
  announcements: readonly StealthAnnouncement[],
): readonly StealthDiscovery[] {
  const found: StealthDiscovery[] = [];
  for (const announcement of announcements) {
    const discovery = scanAnnouncement(spendPrivateKey, viewPrivateKey, announcement);
    if (discovery) found.push(discovery);
  }
  return found;
}

function hashSharedSecret(shared: Uint8Array): { readonly viewTag: number; readonly tweak: Uint8Array } {
  const hash = keccak256(shared);
  const tweak = bytesFromHex(hash.slice(2));
  if (!secp256k1.utils.isValidSecretKey(tweak)) {
    throw new CoreError("stealth_hash", "shared-secret hash is not a secp256k1 scalar");
  }
  return { viewTag: Number.parseInt(hash.slice(2, 4), 16), tweak };
}

function secretKey(value: Hex): Uint8Array {
  if (!isHex(value)) throw new CoreError("secret_key", "ephemeral key is not hex");
  const bytes = bytesFromHex(value);
  if (!secp256k1.utils.isValidSecretKey(bytes)) {
    throw new CoreError("secret_key", "ephemeral key is not a secp256k1 scalar");
  }
  return bytes;
}

function bytesFromHex(value: string): Uint8Array {
  const bare = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  return hexToBytes(bare);
}

function assertCompressed(value: Hex): void {
  const bytes = bytesFromHex(value);
  if (!secp256k1.utils.isValidPublicKey(bytes, true)) {
    throw new CoreError("meta_address", "meta-address key is not a compressed secp256k1 point");
  }
}

function compressedHex(bytes: Uint8Array): Hex {
  return `0x${bytesToHex(bytes)}`;
}

function addressOf(uncompressed: Uint8Array): Address {
  return publicKeyToAddress(`0x${bytesToHex(uncompressed)}`);
}
