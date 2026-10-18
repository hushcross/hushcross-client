import { getAddress, isAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import { CoreError } from "../errors.js";
import { cleanSaleProfileFields, type SaleProfileFields } from "./text.js";

/** Same constants and message as services/meta (src/message.ts); the test vector is shared. */
export const SALE_PROFILE_SCHEME = "hushcross-sale-profile-v1";
export const SALE_LOGO_MAX_BYTES = 512 * 1024;
export const SALE_LOGO_MIN_SIDE = 128;
export const SALE_LOGO_MAX_SIDE = 2048;
/** Uploads are refused when the signed message is older than this. */
export const SALE_PROFILE_MAX_AGE_MS = 10 * 60_000;

/** No logo, new image bytes (PNG/JPEG/WebP), or the logo of an earlier upload of the same sale. */
export type SaleLogoChange = { readonly kind: "none" } | { readonly kind: "replace"; readonly bytes: Uint8Array } | { readonly kind: "reuse"; readonly from: Hex };

/** Where a sale's current profile lives: `uri` serves a document whose keccak256 is `contentHash`. */
export interface SaleProfilePointer {
  readonly contentHash: Hex;
  readonly uri: string;
}

/** The served document (fields already sanitised by the service, re-checked by readers). */
export interface SaleProfileDocument {
  readonly schema: typeof SALE_PROFILE_SCHEME;
  readonly chainId: number;
  readonly sale: Address;
  readonly description: string;
  readonly website: string | null;
  readonly x: string | null;
  readonly telegram: string | null;
  /** keccak256 of the 256 px and 64 px WebP files. */
  readonly logo: { readonly large: Hex; readonly small: Hex } | null;
  readonly issuedAt: number;
}

function logoToken(logo: SaleLogoChange): string {
  if (logo.kind === "none") return "none";
  if (logo.kind === "reuse") return `reuse:${logo.from.toLowerCase()}`;
  return keccak256(logo.bytes);
}

/** keccak256 over the submitted fields (as sent) and the logo choice: the `Content` line of the upload message. */
export function saleProfileUploadHash(fields: SaleProfileFields, logo: SaleLogoChange): Hex {
  return keccak256(toBytes(JSON.stringify([SALE_PROFILE_SCHEME, fields.description, fields.website ?? "", fields.x ?? "", fields.telegram ?? "", logoToken(logo)])));
}

/** EIP-191 text the creator signs (`personal_sign`). */
export function saleProfileMessage(input: { readonly chainId: number; readonly sale: Address; readonly contentHash: Hex; readonly issuedAt: number }): string {
  return [
    "HushCross sale profile",
    "Sign to publish this sale's logo and links. This does not send a transaction or move funds.",
    `Chain ID: ${input.chainId}`,
    `Sale: ${getAddress(input.sale)}`,
    `Content: ${input.contentHash.toLowerCase()}`,
    `Issued at: ${new Date(input.issuedAt).toISOString()}`,
  ].join("\n");
}

const HASH = /^0x[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const mismatch = (what: string): CoreError => new CoreError("profile_mismatch", what);

/**
 * Check fetched document bytes against the pointer and the sale before anything is shown:
 * keccak256 must equal `contentHash`, the document must name this sale and chain, and every
 * text field must still pass the profile rules (the bytes are untrusted).
 */
export function verifySaleProfileDocument(bytes: Uint8Array, expected: { readonly contentHash: Hex; readonly sale: Address; readonly chainId: number }): SaleProfileDocument {
  if (keccak256(bytes).toLowerCase() !== expected.contentHash.toLowerCase()) throw mismatch("document hash does not match the pointer");
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw mismatch("document is not JSON");
  }
  if (!isRecord(raw) || raw.schema !== SALE_PROFILE_SCHEME) throw mismatch("unknown document schema");
  if (raw.chainId !== expected.chainId) throw mismatch("document is for another chain");
  if (typeof raw.sale !== "string" || !isAddress(raw.sale, { strict: false }) || getAddress(raw.sale) !== getAddress(expected.sale)) throw mismatch("document is for another sale");
  const { description, website, x, telegram } = raw;
  const textOrNull = (value: unknown): value is string | null => value === null || typeof value === "string";
  if (typeof description !== "string" || !textOrNull(website) || !textOrNull(x) || !textOrNull(telegram)) throw mismatch("document fields are malformed");
  const fields: SaleProfileFields = { description, website, x, telegram };
  const cleaned = cleanSaleProfileFields(fields);
  if (!cleaned.ok) throw mismatch("document fields fail the profile rules");
  const logoRaw = raw.logo;
  let logo: SaleProfileDocument["logo"] = null;
  if (logoRaw !== null) {
    if (!isRecord(logoRaw) || typeof logoRaw.large !== "string" || typeof logoRaw.small !== "string" || !HASH.test(logoRaw.large) || !HASH.test(logoRaw.small)) throw mismatch("document logo is malformed");
    logo = { large: logoRaw.large as Hex, small: logoRaw.small as Hex };
  }
  if (typeof raw.issuedAt !== "number" || !Number.isSafeInteger(raw.issuedAt)) throw mismatch("document time is malformed");
  return { schema: SALE_PROFILE_SCHEME, chainId: expected.chainId, sale: getAddress(raw.sale), ...cleaned.value, logo, issuedAt: raw.issuedAt };
}

/** Magic-byte check of an upload (the service decodes and re-encodes; this only catches obvious mistakes early). */
export function sniffSaleLogo(bytes: Uint8Array): "png" | "jpeg" | "webp" | null {
  const at = (i: number): number => bytes[i] ?? -1;
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) return "png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  const ascii = (from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

/** Standard base64 (the upload format), browser and Node. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
