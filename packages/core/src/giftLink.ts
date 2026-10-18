import { bufferOf, concatBytes, fromBase64Url, fromUtf8, randomBytes, toBase64Url, utf8 } from "./bytes.js";
import { CoreError } from "./errors.js";
import { SNARK_SCALAR_FIELD, bigintFromBytes, bigintToBytes } from "./field.js";
import { GIFT_MAX_PACKETS, GIFT_SECRET_BYTES, deriveGiftKeys } from "./gift.js";

/**
 * Gift link fragment: `/gift#<base64url(payload)>`. The fragment never reaches a server.
 *
 * Layout (big-endian):
 *   version u8 | chainId u32 | scope 32 | giftSecret 32 | packetCount u8 | expiry u64 (unix s) | memo?
 * memo = iv(12) | AES-256-GCM(ciphertext + tag) with the header as associated data. Empty memo = no bytes.
 */
export const GIFT_LINK_VERSION = 1;
export const GIFT_MEMO_MAX_CHARS = 140;
const HEADER_BYTES = 1 + 4 + 32 + GIFT_SECRET_BYTES + 1 + 8;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface GiftLinkPayload {
  readonly version: 1;
  readonly chainId: number;
  readonly scope: bigint;
  readonly giftSecret: Uint8Array;
  readonly packetCount: number;
  /** Unix seconds. */
  readonly expiry: number;
  readonly memo: string;
}

export async function encodeGiftLink(
  payload: GiftLinkPayload,
  random: (length: number) => Uint8Array = randomBytes,
): Promise<string> {
  const header = encodeHeader(payload);
  if ([...payload.memo].length > GIFT_MEMO_MAX_CHARS) throw new CoreError("gift_memo", `memo must be at most ${GIFT_MEMO_MAX_CHARS} characters`);
  if (payload.memo === "") return toBase64Url(header);
  const iv = random(IV_BYTES);
  const key = await memoKey(payload.giftSecret, "encrypt");
  const sealed = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: bufferOf(iv), additionalData: bufferOf(header) }, key, bufferOf(utf8(payload.memo))),
  );
  return toBase64Url(concatBytes(header, iv, sealed));
}

export async function decodeGiftLink(fragment: string): Promise<GiftLinkPayload> {
  const bytes = fromBase64Url(fragment.replace(/^#/u, ""));
  if (bytes.length < HEADER_BYTES) throw new CoreError("gift_link", "gift link is too short");
  const header = bytes.slice(0, HEADER_BYTES);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const version = view.getUint8(0);
  if (version !== GIFT_LINK_VERSION) throw new CoreError("gift_link", `unsupported gift link version ${version}`);
  const chainId = view.getUint32(1);
  const scope = bigintFromBytes(header.slice(5, 37));
  const giftSecret = header.slice(37, 69);
  const packetCount = view.getUint8(69);
  const expiry = Number(view.getBigUint64(70));
  const base = { version: GIFT_LINK_VERSION, chainId, scope, giftSecret, packetCount, expiry, memo: "" } as const;
  validate(base);
  const rest = bytes.slice(HEADER_BYTES);
  if (rest.length === 0) return base;
  if (rest.length < IV_BYTES + TAG_BYTES) throw new CoreError("gift_memo", "gift memo is truncated");
  const key = await memoKey(giftSecret, "decrypt");
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bufferOf(rest.slice(0, IV_BYTES)), additionalData: bufferOf(header) },
        key,
        bufferOf(rest.slice(IV_BYTES)),
      ),
    );
  } catch {
    throw new CoreError("gift_memo", "gift memo failed authentication");
  }
  const memo = fromUtf8(plain);
  if ([...memo].length > GIFT_MEMO_MAX_CHARS) throw new CoreError("gift_memo", "gift memo is too long");
  return { ...base, memo };
}

export function giftLinkPath(fragment: string): string {
  return `/gift#${fragment.replace(/^#/u, "")}`;
}

function encodeHeader(payload: GiftLinkPayload): Uint8Array {
  validate(payload);
  const header = new Uint8Array(HEADER_BYTES);
  const view = new DataView(header.buffer);
  view.setUint8(0, payload.version);
  view.setUint32(1, payload.chainId);
  header.set(bigintToBytes(payload.scope, 32), 5);
  header.set(payload.giftSecret, 37);
  view.setUint8(69, payload.packetCount);
  view.setBigUint64(70, BigInt(payload.expiry));
  return header;
}

function validate(payload: Omit<GiftLinkPayload, "memo">): void {
  if (payload.version !== GIFT_LINK_VERSION) throw new CoreError("gift_link", "unsupported gift link version");
  if (!Number.isInteger(payload.chainId) || payload.chainId <= 0 || payload.chainId > 0xffffffff) throw new CoreError("gift_link", "invalid chain id");
  if (payload.scope <= 0n || payload.scope >= SNARK_SCALAR_FIELD) throw new CoreError("gift_link", "invalid scope");
  if (payload.giftSecret.length !== GIFT_SECRET_BYTES) throw new CoreError("gift_link", "gift secret must be 32 bytes");
  if (!Number.isInteger(payload.packetCount) || payload.packetCount < 1 || payload.packetCount > GIFT_MAX_PACKETS) {
    throw new CoreError("gift_link", `packet count must be 1-${GIFT_MAX_PACKETS}`);
  }
  if (!Number.isSafeInteger(payload.expiry) || payload.expiry <= 0) throw new CoreError("gift_link", "invalid expiry");
}

async function memoKey(giftSecret: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  const raw = deriveGiftKeys(giftSecret).memoKey;
  return globalThis.crypto.subtle.importKey("raw", bufferOf(raw), { name: "AES-GCM" }, false, [usage]);
}
