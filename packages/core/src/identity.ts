import { bytesToHex } from "@noble/hashes/utils.js";
import { getAddress, isAddress, isHex, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CoreError } from "./errors.js";
import { deriveIdentityKey } from "./keys.js";
import { STEALTH_SCHEME_ID, metaAddressBytes } from "./hushId.js";
import type { MetaAddress } from "./stealth.js";

/**
 * Hush ID without the public wallet: the account derives a dedicated identity key
 * (`hushcross/v1/identity`), signs the ERC-6538 EIP-712 entry with it, and the relay submits
 * `registerKeysOnBehalf(identity, 1, signature, meta)` and pays the gas. The identity address never
 * holds funds and never sends a transaction, so nothing on chain ties it to a wallet.
 */
export interface Identity {
  readonly privateKey: Hex;
  readonly address: Address;
}

export function deriveIdentity(phrase: string): Identity {
  const privateKey = `0x${bytesToHex(deriveIdentityKey(phrase))}` as Hex;
  return { privateKey, address: privateKeyToAccount(privateKey).address };
}

/** ERC-6538 reference registry EIP-712 domain (`name` "ERC6538Registry", `version` "1.0"). */
export function registryDomain(registry: Address, chainId: number) {
  return { name: "ERC6538Registry", version: "1.0", chainId: BigInt(chainId), verifyingContract: getAddress(registry) } as const;
}

export const REGISTRY_ENTRY_TYPES = {
  Erc6538RegistryEntry: [
    { name: "schemeId", type: "uint256" },
    { name: "stealthMetaAddress", type: "bytes" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export interface RegisterKeysRequest {
  readonly registrant: Address;
  readonly schemeId: string;
  readonly stealthMetaAddress: Hex;
  readonly signature: Hex;
}

/** Body of relay `POST /v1/register-keys`, signed by the identity key at the registry's current nonce. */
export async function signRegisterKeys(input: {
  readonly identity: Identity;
  readonly meta: MetaAddress;
  readonly registry: Address;
  readonly chainId: number;
  /** `ERC6538Registry.nonceOf(identity)`. */
  readonly nonce: bigint;
}): Promise<RegisterKeysRequest> {
  if (input.nonce < 0n) throw new CoreError("registry_nonce", "nonce must be non-negative");
  const stealthMetaAddress = metaAddressBytes(input.meta);
  const signature = await privateKeyToAccount(input.identity.privateKey).signTypedData({
    domain: registryDomain(input.registry, input.chainId),
    types: REGISTRY_ENTRY_TYPES,
    primaryType: "Erc6538RegistryEntry",
    message: { schemeId: STEALTH_SCHEME_ID, stealthMetaAddress, nonce: input.nonce },
  });
  return { registrant: input.identity.address, schemeId: STEALTH_SCHEME_ID.toString(), stealthMetaAddress, signature };
}

/* ------------------------------------------------------------- short names (off-chain) */

/** Short names: 3-20 of a-z, 0-9, underscore. Stored off-chain; the signature proves who claimed it. */
export const SHORT_NAME_PATTERN = /^[a-z0-9_]{3,20}$/u;

export function normalizeShortName(input: string): string | null {
  const name = input.trim().replace(/^@/u, "").toLowerCase();
  return SHORT_NAME_PATTERN.test(name) ? name : null;
}

/** EIP-712 domain of the off-chain name directory (no verifying contract: nothing on chain checks it). */
export function nameDomain(chainId: number) {
  return { name: "HushCross Names", version: "1", chainId: BigInt(chainId) } as const;
}

export const NAME_RECORD_TYPES = {
  HushName: [
    { name: "name", type: "string" },
    { name: "identity", type: "address" },
    { name: "stealthMetaAddress", type: "bytes" },
    { name: "issuedAt", type: "uint64" },
  ],
} as const;

/** A signed name -> meta-address claim. `issuedAt` is unix seconds; a newer record by the same identity replaces an older one. */
export interface NameRecord {
  readonly name: string;
  readonly identity: Address;
  readonly stealthMetaAddress: Hex;
  readonly issuedAt: number;
  readonly signature: Hex;
}

export async function signNameRecord(input: {
  readonly name: string;
  readonly identity: Identity;
  readonly meta: MetaAddress;
  readonly chainId: number;
  readonly issuedAt: number;
}): Promise<NameRecord> {
  const name = normalizeShortName(input.name);
  if (name === null) throw new CoreError("short_name", "name must be 3-20 characters of a-z, 0-9 or _");
  if (!Number.isSafeInteger(input.issuedAt) || input.issuedAt <= 0) throw new CoreError("short_name", "issuedAt must be unix seconds");
  const stealthMetaAddress = metaAddressBytes(input.meta);
  const signature = await privateKeyToAccount(input.identity.privateKey).signTypedData({
    domain: nameDomain(input.chainId),
    types: NAME_RECORD_TYPES,
    primaryType: "HushName",
    message: { name, identity: input.identity.address, stealthMetaAddress, issuedAt: BigInt(input.issuedAt) },
  });
  return { name, identity: input.identity.address, stealthMetaAddress, issuedAt: input.issuedAt, signature };
}

/** Parse a name record from untrusted JSON (relay `GET /v1/names/:name`). */
export function parseNameRecord(raw: unknown): NameRecord {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new CoreError("short_name", "name record is not an object");
  const r = raw as Record<string, unknown>;
  const { name, identity, stealthMetaAddress, issuedAt, signature } = r;
  if (typeof name !== "string" || normalizeShortName(name) !== name) throw new CoreError("short_name", "name record has an invalid name");
  if (typeof identity !== "string" || !isAddress(identity, { strict: false })) throw new CoreError("short_name", "name record has an invalid identity");
  if (typeof stealthMetaAddress !== "string" || !isHex(stealthMetaAddress) || stealthMetaAddress.length !== 2 + 132) throw new CoreError("short_name", "name record has an invalid meta-address");
  if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new CoreError("short_name", "name record has an invalid issuedAt");
  if (typeof signature !== "string" || !isHex(signature)) throw new CoreError("short_name", "name record has an invalid signature");
  return { name, identity: getAddress(identity), stealthMetaAddress, issuedAt, signature };
}

/**
 * True when the record is signed by its identity. The caller must also check that
 * `ERC6538Registry.stealthMetaAddressOf(identity, 1)` equals `stealthMetaAddress` on chain,
 * so the directory host can withhold a name but cannot point it at someone else's keys.
 */
export async function verifyNameRecord(record: NameRecord, chainId: number): Promise<boolean> {
  try {
    const signer = await recoverTypedDataAddress({
      domain: nameDomain(chainId),
      types: NAME_RECORD_TYPES,
      primaryType: "HushName",
      message: { name: record.name, identity: record.identity, stealthMetaAddress: record.stealthMetaAddress, issuedAt: BigInt(record.issuedAt) },
      signature: record.signature,
    });
    return signer === getAddress(record.identity);
  } catch {
    return false;
  }
}
