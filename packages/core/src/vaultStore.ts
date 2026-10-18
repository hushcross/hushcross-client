import { bufferOf, fromBase64Url, fromUtf8, randomBytes, toBase64Url, utf8 } from "./bytes.js";
import { CoreError } from "./errors.js";
import { hkdfSha256 } from "./kdf.js";
import { validateRecoveryPhrase } from "./keys.js";

/**
 * Local vault storage (SPEC 2): the account (24-word phrase, cached notes, gift secrets) is
 * encrypted with AES-256-GCM. The key comes from a WebAuthn PRF output (passkey) when the
 * browser supports it, otherwise from a password via PBKDF2-SHA256 with at least 600k rounds.
 * The same envelope is the encrypted backup file.
 */
export const PBKDF2_MIN_ITERATIONS = 600_000;
export const VAULT_FORMAT = "hushcross-vault";
const PRF_INFO = utf8("hushcross/v1/vault-prf");

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface StoredGift {
  readonly id: string;
  readonly mode: "single" | "group" | "personal";
  readonly asset: string;
  readonly chainId: number;
  /** Pool scope, decimal string. */
  readonly scope: string;
  /** Gift master secret, 0x-prefixed 32 bytes. */
  readonly secret: string;
  /** Packet net amounts, decimal strings, in packet order. */
  readonly packets: readonly string[];
  /** Unix seconds. */
  readonly expiry: number;
  readonly memo: string;
  readonly funding: "vault" | "public";
  readonly createdAt: number;
  /** Packet indexes already reclaimed by the sender. */
  readonly reclaimed: readonly number[];
  /** Share paths (`/gift#...`) as created; the memo IV is random so links are stored, not rebuilt. */
  readonly links?: readonly string[];
}

export interface AccountSecrets {
  readonly version: 1;
  readonly phrase: string;
  readonly createdAt: number;
  /** Cached note state; can always be rebuilt from the phrase by recovery. */
  readonly notes: readonly JsonValue[];
  /** Gift masters cannot be rebuilt from the phrase, so they must live here. */
  readonly gifts: readonly StoredGift[];
  readonly meta: { readonly [key: string]: JsonValue };
}

export type VaultKdf =
  | { readonly type: "pbkdf2-sha256"; readonly iterations: number; readonly salt: string }
  | { readonly type: "webauthn-prf"; readonly credentialId: string; readonly prfSalt: string; readonly salt: string };

export interface VaultEnvelope {
  readonly format: typeof VAULT_FORMAT;
  readonly version: 1;
  readonly kdf: VaultKdf;
  readonly iv: string;
  readonly ciphertext: string;
  readonly createdAt: number;
}

export interface BackupFileContents {
  readonly fileName: string;
  readonly mimeType: string;
  readonly contents: string;
  readonly createdAt: number;
}

export async function sealWithPassword(
  account: AccountSecrets,
  password: string,
  options: { readonly iterations?: number; readonly now?: number } = {},
): Promise<VaultEnvelope> {
  assertAccount(account);
  const iterations = options.iterations ?? PBKDF2_MIN_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < PBKDF2_MIN_ITERATIONS) {
    throw new CoreError("vault_kdf", `PBKDF2 needs at least ${PBKDF2_MIN_ITERATIONS} iterations`);
  }
  if (password.length === 0) throw new CoreError("vault_password", "password must not be empty");
  const salt = randomBytes(16);
  const kdf: VaultKdf = { type: "pbkdf2-sha256", iterations, salt: toBase64Url(salt) };
  return seal(account, await passwordKey(password, salt, iterations, "encrypt"), kdf, options.now);
}

export async function openWithPassword(envelope: VaultEnvelope, password: string): Promise<AccountSecrets> {
  if (envelope.kdf.type !== "pbkdf2-sha256") throw new CoreError("vault_kdf", "vault is not protected by a password");
  if (envelope.kdf.iterations < PBKDF2_MIN_ITERATIONS) throw new CoreError("vault_kdf", "vault uses too few PBKDF2 iterations");
  const key = await passwordKey(password, fromBase64Url(envelope.kdf.salt), envelope.kdf.iterations, "decrypt");
  return open(envelope, key);
}

/** `prfOutput` is the WebAuthn PRF extension result for `prfSalt` on credential `credentialId`. */
export async function sealWithPrf(
  account: AccountSecrets,
  prfOutput: Uint8Array,
  credentialId: Uint8Array,
  prfSalt: Uint8Array,
  options: { readonly now?: number } = {},
): Promise<VaultEnvelope> {
  assertAccount(account);
  if (prfOutput.length < 32) throw new CoreError("vault_prf", "PRF output must be at least 32 bytes");
  const salt = randomBytes(16);
  const kdf: VaultKdf = { type: "webauthn-prf", credentialId: toBase64Url(credentialId), prfSalt: toBase64Url(prfSalt), salt: toBase64Url(salt) };
  return seal(account, await prfKey(prfOutput, salt, "encrypt"), kdf, options.now);
}

export async function openWithPrf(envelope: VaultEnvelope, prfOutput: Uint8Array): Promise<AccountSecrets> {
  if (envelope.kdf.type !== "webauthn-prf") throw new CoreError("vault_kdf", "vault is not protected by a passkey");
  return open(envelope, await prfKey(prfOutput, fromBase64Url(envelope.kdf.salt), "decrypt"));
}

export type VaultSecret = { readonly password: string } | { readonly prfOutput: Uint8Array };

export interface OpenVault {
  readonly account: AccountSecrets;
  /** Re-encrypt an updated account with the same key (no new KDF run). */
  seal(next: AccountSecrets, now?: number): Promise<VaultEnvelope>;
}

/** Unlock once and keep a non-extractable key in memory for later saves. */
export async function openVault(envelope: VaultEnvelope, secret: VaultSecret): Promise<OpenVault> {
  let key: CryptoKey;
  if (envelope.kdf.type === "pbkdf2-sha256") {
    if (!("password" in secret)) throw new CoreError("vault_kdf", "vault is protected by a password");
    if (envelope.kdf.iterations < PBKDF2_MIN_ITERATIONS) throw new CoreError("vault_kdf", "vault uses too few PBKDF2 iterations");
    key = await passwordKey(secret.password, fromBase64Url(envelope.kdf.salt), envelope.kdf.iterations, "both");
  } else {
    if (!("prfOutput" in secret)) throw new CoreError("vault_kdf", "vault is protected by a passkey");
    key = await prfKey(secret.prfOutput, fromBase64Url(envelope.kdf.salt), "both");
  }
  const account = await open(envelope, key);
  const kdf = envelope.kdf;
  return {
    account,
    seal: (next, now) => {
      assertAccount(next);
      return seal(next, key, kdf, now);
    },
  };
}

export function serializeEnvelope(envelope: VaultEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function parseEnvelope(text: string): VaultEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CoreError("vault_format", "not a HushCross backup file");
  }
  if (!isRecord(parsed) || parsed.format !== VAULT_FORMAT || parsed.version !== 1) throw new CoreError("vault_format", "not a HushCross backup file");
  const { kdf, iv, ciphertext, createdAt } = parsed;
  if (typeof iv !== "string" || typeof ciphertext !== "string" || typeof createdAt !== "number" || !isRecord(kdf)) {
    throw new CoreError("vault_format", "backup file is incomplete");
  }
  if (kdf.type === "pbkdf2-sha256" && typeof kdf.iterations === "number" && typeof kdf.salt === "string") {
    return { format: VAULT_FORMAT, version: 1, kdf: { type: "pbkdf2-sha256", iterations: kdf.iterations, salt: kdf.salt }, iv, ciphertext, createdAt };
  }
  if (kdf.type === "webauthn-prf" && typeof kdf.credentialId === "string" && typeof kdf.prfSalt === "string" && typeof kdf.salt === "string") {
    return { format: VAULT_FORMAT, version: 1, kdf: { type: "webauthn-prf", credentialId: kdf.credentialId, prfSalt: kdf.prfSalt, salt: kdf.salt }, iv, ciphertext, createdAt };
  }
  throw new CoreError("vault_format", "backup file has an unknown key derivation");
}

/** Password-protected backup file (works on any device, unlike a device-bound passkey). */
export async function createBackupFile(account: AccountSecrets, passphrase: string, now: number = Date.now()): Promise<BackupFileContents> {
  const envelope = await sealWithPassword(account, passphrase, { now });
  return {
    fileName: `hushcross-backup-${new Date(now).toISOString().slice(0, 10)}.json`,
    mimeType: "application/json",
    contents: serializeEnvelope(envelope),
    createdAt: now,
  };
}

export async function openBackupFile(contents: string, passphrase: string): Promise<AccountSecrets> {
  return openWithPassword(parseEnvelope(contents), passphrase);
}

async function seal(account: AccountSecrets, key: CryptoKey, kdf: VaultKdf, now: number = Date.now()): Promise<VaultEnvelope> {
  const iv = randomBytes(12);
  const header = { format: VAULT_FORMAT, version: 1, kdf, createdAt: now } as const;
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bufferOf(iv), additionalData: bufferOf(aad(header.kdf, now)) },
    key,
    bufferOf(utf8(JSON.stringify(account))),
  );
  return { ...header, iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) };
}

async function open(envelope: VaultEnvelope, key: CryptoKey): Promise<AccountSecrets> {
  let plain: ArrayBuffer;
  try {
    plain = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bufferOf(fromBase64Url(envelope.iv)), additionalData: bufferOf(aad(envelope.kdf, envelope.createdAt)) },
      key,
      bufferOf(fromBase64Url(envelope.ciphertext)),
    );
  } catch {
    throw new CoreError("vault_decrypt", "could not decrypt the vault: wrong password or passkey, or a damaged file");
  }
  const parsed: unknown = JSON.parse(fromUtf8(new Uint8Array(plain)));
  if (!isAccount(parsed)) throw new CoreError("vault_format", "decrypted vault has an unknown shape");
  return parsed;
}

function aad(kdf: VaultKdf, createdAt: number): Uint8Array {
  return utf8(JSON.stringify({ format: VAULT_FORMAT, version: 1, kdf, createdAt }));
}

type KeyUsageMode = "encrypt" | "decrypt" | "both";

function usages(mode: KeyUsageMode): ("encrypt" | "decrypt")[] {
  return mode === "both" ? ["encrypt", "decrypt"] : [mode];
}

async function passwordKey(password: string, salt: Uint8Array, iterations: number, usage: KeyUsageMode): Promise<CryptoKey> {
  const base = await globalThis.crypto.subtle.importKey("raw", bufferOf(utf8(password.normalize("NFKC"))), "PBKDF2", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: bufferOf(salt), iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    usages(usage),
  );
}

async function prfKey(prfOutput: Uint8Array, salt: Uint8Array, usage: KeyUsageMode): Promise<CryptoKey> {
  const raw = hkdfSha256(prfOutput, salt, PRF_INFO, 32);
  return globalThis.crypto.subtle.importKey("raw", bufferOf(raw), { name: "AES-GCM" }, false, usages(usage));
}

function assertAccount(account: AccountSecrets): void {
  if (!validateRecoveryPhrase(account.phrase)) throw new CoreError("invalid_phrase", "vault phrase must be 24 BIP-39 words");
}

function isAccount(value: unknown): value is AccountSecrets {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.phrase === "string" &&
    typeof value.createdAt === "number" &&
    Array.isArray(value.notes) &&
    Array.isArray(value.gifts) &&
    isRecord(value.meta)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
