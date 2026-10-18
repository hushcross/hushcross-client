import { x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { decodeAbiParameters, decodeFunctionData, encodeAbiParameters, getAddress, isHex, keccak256, stringToHex, type Address, type Hex } from "viem";
import { bufferOf, concatBytes, randomBytes, utf8 } from "../bytes.js";
import { CoreError } from "../errors.js";
import { hkdfSha256 } from "../kdf.js";
import { SEALED_REVEAL_INFO, SEALED_REVEAL_SCHEME } from "../launch/sealedReveal.js";
import { SEALED_BOOK_ABI } from "./abi.js";
import { bookOrderCommitment, sideOf, SIDE_CODE, type BookOrderPreimage } from "./commitment.js";

/**
 * Delegated Book reveal: the order preimage sealed to the relay's X25519 key (same scheme and key as Launch,
 * `x25519-hkdf-sha256-aes256gcm-v1`); the relay submits `SealedBook.reveal` inside the reveal window only.
 *   aad = abi.encode(bytes32 BOOK_SEALED_REVEAL_TAG, uint256 chainId, address book, bytes32 commitment)
 *   pt  = abi.encode(uint256 marketId, uint256 epochId, uint8 side, uint256 limitPrice, uint256 quantity,
 *                    address recipient, uint256[] refundPrecommitments, uint8 flags, bytes32 salt)
 */
export const BOOK_SEALED_REVEAL_TAG: Hex = keccak256(stringToHex("HushCross.Book.SealedReveal.v1"));

/**
 * JSON body of relay `POST /v1/reveals` for a Book order: the Launch shape, with `sale` holding the SealedBook
 * address (the relay tells the two apart by contract).
 */
export interface SealedBookReveal {
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
  { type: "uint8" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint256[]" },
  { type: "uint8" },
  { type: "bytes32" },
] as const;

export function bookSealedRevealAad(chainId: bigint, book: Address, commitment: Hex): Uint8Array {
  return hexToBytes(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }], [BOOK_SEALED_REVEAL_TAG, chainId, getAddress(book), commitment]).slice(2));
}

function keyFor(shared: Uint8Array, ephemeralPublic: Uint8Array, relayPublic: Uint8Array): Uint8Array {
  if (shared.every((b) => b === 0)) throw new CoreError("sealed_reveal", "X25519 shared secret is zero");
  return hkdfSha256(shared, concatBytes(ephemeralPublic, relayPublic), utf8(SEALED_REVEAL_INFO), 32);
}

function bytes32(value: string, name: string): Uint8Array {
  if (!isHex(value) || value.length !== 66) throw new CoreError("sealed_reveal", `${name} must be 32 bytes`);
  return hexToBytes(value.slice(2));
}

export async function sealBookReveal(input: { readonly order: BookOrderPreimage; readonly relayPublicKey: Hex; readonly ephemeralSecret?: Uint8Array; readonly nonce?: Uint8Array }): Promise<SealedBookReveal> {
  const { order } = input;
  const commitment = bookOrderCommitment(order);
  const relayPublic = bytes32(input.relayPublicKey, "relay public key");
  const ephemeralSecret = input.ephemeralSecret ?? x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
  const key = keyFor(x25519.getSharedSecret(ephemeralSecret, relayPublic), ephemeralPublic, relayPublic);
  const nonce = input.nonce ?? randomBytes(12);
  if (nonce.length !== 12) throw new CoreError("sealed_reveal", "nonce must be 12 bytes");
  const plaintext = hexToBytes(
    encodeAbiParameters(PLAINTEXT_ABI, [order.marketId, order.epochId, SIDE_CODE[order.side] as number, order.limitPrice, order.quantity, getAddress(order.recipient), [...order.refundPrecommitments], order.flags, order.salt]).slice(2),
  );
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", bufferOf(key), "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: bufferOf(nonce), additionalData: bufferOf(bookSealedRevealAad(order.chainId, order.book, commitment)), tagLength: 128 }, cryptoKey, bufferOf(plaintext)),
  );
  return {
    chainId: order.chainId.toString(),
    sale: getAddress(order.book),
    commitment,
    ephemeralPublicKey: `0x${bytesToHex(ephemeralPublic)}`,
    nonce: `0x${bytesToHex(nonce)}`,
    ciphertext: `0x${bytesToHex(sealed)}`,
  };
}

/** Relay-side counterpart (and tests): decrypt and check the preimage against the commitment. */
export async function openBookReveal(sealed: SealedBookReveal, relaySecret: Uint8Array): Promise<BookOrderPreimage> {
  const relayPublic = x25519.getPublicKey(relaySecret);
  const ephemeralPublic = bytes32(sealed.ephemeralPublicKey, "ephemeral public key");
  const key = keyFor(x25519.getSharedSecret(relaySecret, ephemeralPublic), ephemeralPublic, relayPublic);
  const chainId = BigInt(sealed.chainId);
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", bufferOf(key), "AES-GCM", false, ["decrypt"]);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bufferOf(hexToBytes(sealed.nonce.slice(2))), additionalData: bufferOf(bookSealedRevealAad(chainId, sealed.sale, sealed.commitment)), tagLength: 128 },
        cryptoKey,
        bufferOf(hexToBytes(sealed.ciphertext.slice(2))),
      ),
    );
  } catch {
    throw new CoreError("sealed_reveal", "sealed reveal does not decrypt");
  }
  const [marketId, epochId, side, limitPrice, quantity, recipient, pcs, flags, salt] = decodeAbiParameters(PLAINTEXT_ABI, `0x${bytesToHex(plain)}`);
  const order: BookOrderPreimage = { chainId, book: getAddress(sealed.sale), marketId, epochId, side: sideOf(side), limitPrice, quantity, recipient, refundPrecommitments: [...pcs], flags, salt };
  if (bookOrderCommitment(order) !== sealed.commitment.toLowerCase()) throw new CoreError("sealed_reveal", "sealed reveal does not match its commitment");
  return order;
}

export { SEALED_REVEAL_SCHEME as BOOK_SEALED_REVEAL_SCHEME };

/** A revealed order read back from a `reveal` transaction's calldata (the contract keeps the leaves internal). */
export interface RevealedOrderInput {
  readonly marketId: bigint;
  readonly epochId: bigint;
  readonly side: "buy" | "sell";
  readonly limitPrice: bigint;
  readonly quantity: bigint;
}

/** Decode `SealedBook.reveal(...)` calldata; `null` when the input is another call. */
export function decodeBookRevealInput(input: Hex): RevealedOrderInput | null {
  try {
    const call = decodeFunctionData({ abi: SEALED_BOOK_ABI, data: input });
    if (call.functionName !== "reveal") return null;
    const [marketId, epochId, side, limitPrice, quantity] = call.args;
    return { marketId, epochId: BigInt(epochId), side: sideOf(side), limitPrice, quantity };
  } catch {
    return null;
  }
}
