import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { decodeAbiParameters, encodeAbiParameters, getAddress, isHex, keccak256, stringToHex, type Address, type Hex } from "viem";
import { bufferOf, concatBytes, randomBytes, utf8 } from "../bytes.js";
import { CoreError } from "../errors.js";
import { hkdfSha256 } from "../kdf.js";
import { launchBidCommitment, type LaunchBidPreimage } from "./commitment.js";

/**
 * Delegated reveal (LAUNCH.md 4 / SPEC 4): the bid preimage is encrypted to the relay's X25519 key and
 * stored by the relay, which submits `reveal(...)` only inside the reveal window.
 *
 * Scheme `x25519-hkdf-sha256-aes256gcm-v1`:
 *   shared = X25519(ephemeralSecret, relayPublic)                      (all-zero output rejected)
 *   key    = HKDF-SHA256(shared, salt = ephemeralPublic || relayPublic, info = "hushcross/v1/sealed-reveal", 32)
 *   aad    = abi.encode(bytes32 SEALED_REVEAL_TAG, uint256 chainId, address sale, bytes32 commitment)
 *   pt     = abi.encode(uint256 price, uint256 maxSpend, address recipient, uint256[] refundPrecommitments, bytes32 salt)
 *   ct     = AES-256-GCM(key, nonce[12], pt, aad)                          (16-byte tag appended)
 */
export const SEALED_REVEAL_SCHEME = "x25519-hkdf-sha256-aes256gcm-v1";
export const SEALED_REVEAL_INFO = "hushcross/v1/sealed-reveal";
export const SEALED_REVEAL_TAG: Hex = keccak256(stringToHex("HushCross.Launch.SealedReveal.v1"));

/** JSON body of relay `POST /v1/reveals` (all hex). */
export interface SealedReveal {
  readonly chainId: string;
  readonly sale: Address;
  readonly commitment: Hex;
  readonly ephemeralPublicKey: Hex;
  readonly nonce: Hex;
  readonly ciphertext: Hex;
}

const PLAINTEXT_ABI = [
  { type: "uint256" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256[]" },
  { type: "bytes32" },
] as const;

export function sealedRevealAad(chainId: bigint, sale: Address, commitment: Hex): Uint8Array {
  return hexToBytes(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }], [SEALED_REVEAL_TAG, chainId, getAddress(sale), commitment]).slice(2),
  );
}

function deriveKey(shared: Uint8Array, ephemeralPublic: Uint8Array, relayPublic: Uint8Array): Uint8Array {
  if (shared.every((b) => b === 0)) throw new CoreError("sealed_reveal", "X25519 shared secret is zero");
  return hkdfSha256(shared, concatBytes(ephemeralPublic, relayPublic), utf8(SEALED_REVEAL_INFO), 32);
}

function bytes32(value: string, name: string): Uint8Array {
  if (!isHex(value) || value.length !== 66) throw new CoreError("sealed_reveal", `${name} must be 32 bytes`);
  return hexToBytes(value.slice(2));
}

export async function sealReveal(input: {
  readonly preimage: LaunchBidPreimage;
  /** Relay `/v1/info` `sealedReveal.publicKey` (32-byte X25519 public key). */
  readonly relayPublicKey: Hex;
  /** Test hooks only. */
  readonly ephemeralSecret?: Uint8Array;
  readonly nonce?: Uint8Array;
}): Promise<SealedReveal> {
  const { preimage } = input;
  const commitment = launchBidCommitment(preimage);
  const relayPublic = bytes32(input.relayPublicKey, "relay public key");
  const ephemeralSecret = input.ephemeralSecret ?? x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
  const key = deriveKey(x25519.getSharedSecret(ephemeralSecret, relayPublic), ephemeralPublic, relayPublic);
  const nonce = input.nonce ?? randomBytes(12);
  if (nonce.length !== 12) throw new CoreError("sealed_reveal", "nonce must be 12 bytes");
  const plaintext = hexToBytes(
    encodeAbiParameters(PLAINTEXT_ABI, [preimage.price, preimage.maxSpend, getAddress(preimage.recipient), [...preimage.refundPrecommitments], preimage.salt]).slice(2),
  );
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", bufferOf(key), "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: bufferOf(nonce), additionalData: bufferOf(sealedRevealAad(preimage.chainId, preimage.sale, commitment)), tagLength: 128 }, cryptoKey, bufferOf(plaintext)),
  );
  return {
    chainId: preimage.chainId.toString(),
    sale: getAddress(preimage.sale),
    commitment,
    ephemeralPublicKey: `0x${bytesToHex(ephemeralPublic)}`,
    nonce: `0x${bytesToHex(nonce)}`,
    ciphertext: `0x${bytesToHex(sealed)}`,
  };
}

/** Relay-side counterpart (also used by tests). Verifies the decrypted preimage against the commitment. */
export async function openReveal(sealed: SealedReveal, relaySecret: Uint8Array, saleId: bigint): Promise<LaunchBidPreimage> {
  const relayPublic = x25519.getPublicKey(relaySecret);
  const ephemeralPublic = bytes32(sealed.ephemeralPublicKey, "ephemeral public key");
  const key = deriveKey(x25519.getSharedSecret(relaySecret, ephemeralPublic), ephemeralPublic, relayPublic);
  if (!isHex(sealed.nonce) || sealed.nonce.length !== 26) throw new CoreError("sealed_reveal", "nonce must be 12 bytes");
  const chainId = BigInt(sealed.chainId);
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", bufferOf(key), "AES-GCM", false, ["decrypt"]);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bufferOf(hexToBytes(sealed.nonce.slice(2))), additionalData: bufferOf(sealedRevealAad(chainId, sealed.sale, sealed.commitment)), tagLength: 128 },
        cryptoKey,
        bufferOf(hexToBytes(sealed.ciphertext.slice(2))),
      ),
    );
  } catch {
    throw new CoreError("sealed_reveal", "sealed reveal does not decrypt");
  }
  const [price, maxSpend, recipient, refundPrecommitments, salt] = decodeAbiParameters(PLAINTEXT_ABI, `0x${bytesToHex(plain)}`);
  const preimage: LaunchBidPreimage = { chainId, sale: getAddress(sealed.sale), saleId, price, maxSpend, recipient, refundPrecommitments: [...refundPrecommitments], salt };
  if (launchBidCommitment(preimage) !== sealed.commitment.toLowerCase()) throw new CoreError("sealed_reveal", "sealed reveal does not match its commitment");
  return preimage;
}
