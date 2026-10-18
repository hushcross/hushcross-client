import { entropyToMnemonic, generateMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { CoreError } from "./errors.js";
import { fieldFromBytes, requireField, secpScalarFromBytes } from "./field.js";
import { hkdfSha256 } from "./kdf.js";
import { poseidon2, poseidon3 } from "./poseidon.js";

const SALT = new TextEncoder().encode("hushcross");
const INFO = {
  nullifier: "hushcross/v1/nullifier",
  secret: "hushcross/v1/secret",
  stealthSpend: "hushcross/v1/stealth-spend",
  stealthView: "hushcross/v1/stealth-view",
  identity: "hushcross/v1/identity",
} as const;

export interface MasterKeys {
  readonly nullifier: bigint;
  readonly secret: bigint;
  readonly stealthSpend: Uint8Array;
  readonly stealthView: Uint8Array;
}

export interface NoteSecrets {
  readonly nullifier: bigint;
  readonly secret: bigint;
  readonly precommitment: bigint;
}

export function generateRecoveryPhrase(entropy?: Uint8Array): string {
  if (entropy === undefined) return generateMnemonic(wordlist, 256);
  if (entropy.length !== 32) throw new CoreError("invalid_entropy", "entropy must be 32 bytes");
  return entropyToMnemonic(entropy, wordlist);
}

export function validateRecoveryPhrase(phrase: string): boolean {
  const normalized = normalizePhrase(phrase);
  if (normalized.split(" ").length !== 24) return false;
  return validateMnemonic(normalized, wordlist);
}

/**
 * HKDF-SHA256 over the 32-byte BIP-39 entropy (the 256-bit seed), not the 64-byte BIP-39 seed.
 * Salt is the UTF-8 string `hushcross`. Each info string is one master-key domain.
 */
export function deriveMasterKeys(phrase: string): MasterKeys {
  if (!validateRecoveryPhrase(phrase)) {
    throw new CoreError("invalid_phrase", "recovery phrase must be 24 BIP-39 words");
  }
  const entropy = mnemonicToEntropy(normalizePhrase(phrase), wordlist);
  return {
    nullifier: fieldFromBytes(expand(entropy, INFO.nullifier)),
    secret: fieldFromBytes(expand(entropy, INFO.secret)),
    stealthSpend: secpScalarFromBytes(expand(entropy, INFO.stealthSpend)),
    stealthView: secpScalarFromBytes(expand(entropy, INFO.stealthView)),
  };
}

/**
 * Hush ID identity key: a secp256k1 key whose address registers the stealth meta-address on ERC-6538
 * (via `registerKeysOnBehalf`, submitted by the relay) so the public wallet is never linked to the Hush ID.
 * HKDF-SHA256(entropy, salt `hushcross`, info `hushcross/v1/identity`), reduced into [1, n).
 */
export function deriveIdentityKey(phrase: string): Uint8Array {
  if (!validateRecoveryPhrase(phrase)) {
    throw new CoreError("invalid_phrase", "recovery phrase must be 24 BIP-39 words");
  }
  return secpScalarFromBytes(expand(mnemonicToEntropy(normalizePhrase(phrase), wordlist), INFO.identity));
}

/** Per-deposit nullifier and secret: Poseidon(master, scope, index). Index starts at 0. */
export function deriveDepositSecrets(keys: MasterKeys, scope: bigint, index: bigint): NoteSecrets {
  return derivePair(keys, requireField("scope", scope), requireField("index", index));
}

/**
 * Change note after a withdrawal: Poseidon(master, label, count).
 * The first change uses count 0, then 1, 2, ...
 */
export function deriveChangeSecrets(keys: MasterKeys, label: bigint, count: bigint): NoteSecrets {
  return derivePair(keys, requireField("label", label), requireField("count", count));
}

function derivePair(keys: MasterKeys, domain: bigint, index: bigint): NoteSecrets {
  const nullifier = nonZero(poseidon3(keys.nullifier, domain, index), "nullifier");
  const secret = nonZero(poseidon3(keys.secret, domain, index), "secret");
  return {
    nullifier,
    secret,
    precommitment: poseidon2(nullifier, secret),
  };
}

function expand(entropy: Uint8Array, info: string): Uint8Array {
  return hkdfSha256(entropy, SALT, new TextEncoder().encode(info), 32);
}

function nonZero(value: bigint, name: string): bigint {
  if (value === 0n) throw new CoreError("zero_scalar", `derived ${name} is zero`);
  return value;
}

function normalizePhrase(phrase: string): string {
  return phrase.trim().split(/\s+/u).join(" ").toLowerCase();
}
