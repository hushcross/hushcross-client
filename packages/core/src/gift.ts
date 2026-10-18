import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes, concatBytes, utf8 } from "./bytes.js";
import { CoreError } from "./errors.js";
import { fieldFromBytes, requireField } from "./field.js";
import { hkdfSha256 } from "./kdf.js";
import type { NoteSecrets } from "./keys.js";
import { poseidon2, poseidon3 } from "./poseidon.js";

/** Packets per gift (one link can carry at most this many). */
export const GIFT_MAX_PACKETS = 50;
/** GiftAdapter accepts at most 16 packets per call (INTERFACES 2.2); larger gifts use several calls. */
export const GIFT_PACKETS_PER_CALL = 16;
export const GIFT_SECRET_BYTES = 32;
/** Upper bound on units in one gift, keeps the split cheap and the UI sane. */
export const GIFT_MAX_UNITS = 10_000;

const SALT = utf8("hushcross");
const INFO = {
  nullifier: "hushcross/v1/gift-nullifier",
  secret: "hushcross/v1/gift-secret",
  memo: "hushcross/v1/gift-memo",
  personal: "hushcross/v1/gift-packet/",
} as const;

export type GiftMode = "single" | "group" | "personal";

export interface GiftKeys {
  readonly nullifier: bigint;
  readonly secret: bigint;
  /** AES-256-GCM key for the link memo. */
  readonly memoKey: Uint8Array;
}

/** Uniform integer in [0, maxExclusive). */
export type RandomSource = (maxExclusive: number) => number;

export function generateGiftSecret(random: (length: number) => Uint8Array = randomBytes): Uint8Array {
  const secret = random(GIFT_SECRET_BYTES);
  assertSecret(secret);
  return secret;
}

export function deriveGiftKeys(giftSecret: Uint8Array): GiftKeys {
  assertSecret(giftSecret);
  return {
    nullifier: fieldFromBytes(expand(giftSecret, INFO.nullifier)),
    secret: fieldFromBytes(expand(giftSecret, INFO.secret)),
    memoKey: expand(giftSecret, INFO.memo),
  };
}

/** Packet deposit secrets: Poseidon(giftMaster, scope, index), mirroring the account derivation. */
export function deriveGiftPacket(giftSecret: Uint8Array, scope: bigint, index: bigint): NoteSecrets {
  const keys = deriveGiftKeys(giftSecret);
  return pair(keys, requireField("scope", scope), requireField("index", index));
}

/** Zero-value change note left behind when a packet is claimed in full: Poseidon(giftMaster, label, 0). */
export function deriveGiftChange(giftSecret: Uint8Array, label: bigint, count = 0n): NoteSecrets {
  const keys = deriveGiftKeys(giftSecret);
  return pair(keys, requireField("label", label), requireField("count", count));
}

/** Personal links: each packet gets its own link secret, derived from the sender's master. */
export function personalPacketSecret(master: Uint8Array, index: number): Uint8Array {
  assertSecret(master);
  if (!Number.isInteger(index) || index < 0 || index >= GIFT_MAX_PACKETS) {
    throw new CoreError("gift_index", "packet index is out of range");
  }
  return expand(master, `${INFO.personal}${index}`);
}

export function cryptoRandom(): RandomSource {
  return (maxExclusive) => uniform(maxExclusive, () => randomBytes(6));
}

/** Deterministic stream: sha256(seed || counter). For tests and reproducible previews only. */
export function seededRandom(seed: Uint8Array): RandomSource {
  let counter = 0;
  return (maxExclusive) =>
    uniform(maxExclusive, () => {
      const block = new Uint8Array(4);
      new DataView(block.buffer).setUint32(0, counter);
      counter += 1;
      return sha256(concatBytes(seed, block)).slice(0, 6);
    });
}

/**
 * Lucky red packet: split `totalUnits` whole units into `packets` parts, each at least one unit.
 * Picks a uniformly random composition (k-1 distinct cut points), so every split is equally likely.
 */
export function splitRedPacket(totalUnits: number, packets: number, random: RandomSource = cryptoRandom()): number[] {
  if (!Number.isInteger(totalUnits) || !Number.isInteger(packets)) throw new CoreError("gift_split", "units and packets must be integers");
  if (packets < 1 || packets > GIFT_MAX_PACKETS) throw new CoreError("gift_split", `packets must be 1-${GIFT_MAX_PACKETS}`);
  if (totalUnits < packets) throw new CoreError("gift_split", "need at least one unit per packet");
  if (totalUnits > GIFT_MAX_UNITS) throw new CoreError("gift_split", `at most ${GIFT_MAX_UNITS} units`);
  const n = totalUnits - 1;
  const m = packets - 1;
  const cuts = new Set<number>();
  for (let j = n - m + 1; j <= n; j += 1) {
    const t = random(j) + 1;
    cuts.add(cuts.has(t) ? j : t);
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const parts: number[] = [];
  let previous = 0;
  for (const cut of [...sorted, totalUnits]) {
    parts.push(cut - previous);
    previous = cut;
  }
  return parts;
}

export interface GiftPacketRef {
  /** Packet position within the gift (0-based). */
  readonly index: number;
  /** Secret carried by the link that claims this packet. */
  readonly linkSecret: Uint8Array;
  /** Deposit index under `linkSecret`. */
  readonly packetIndex: bigint;
  readonly secrets: NoteSecrets;
}

/** Every packet of a gift, derived from the sender's master secret (used for status and reclaim). */
export function giftPacketRefs(master: Uint8Array, scope: bigint, mode: GiftMode, count: number): GiftPacketRef[] {
  if (!Number.isInteger(count) || count < 1 || count > GIFT_MAX_PACKETS) throw new CoreError("gift_count", "invalid packet count");
  if (mode === "single" && count !== 1) throw new CoreError("gift_count", "a single gift has one packet");
  return Array.from({ length: count }, (_, index) => {
    if (mode === "personal") {
      const linkSecret = personalPacketSecret(master, index);
      return { index, linkSecret, packetIndex: 0n, secrets: deriveGiftPacket(linkSecret, scope, 0n) };
    }
    const packetIndex = BigInt(index);
    return { index, linkSecret: master, packetIndex, secrets: deriveGiftPacket(master, scope, packetIndex) };
  });
}

export interface GiftPacketState {
  readonly ref: GiftPacketRef;
  readonly funded: boolean;
  readonly spent: boolean;
}

/** Packets the sender can take back: funded, not yet claimed, and only after expiry. */
export function planReclaim<T extends GiftPacketState>(states: readonly T[], expiresAtMs: number, nowMs: number): T[] {
  if (nowMs < expiresAtMs) throw new CoreError("not_expired", "gift has not expired yet");
  return states.filter((state) => state.funded && !state.spent);
}

function pair(keys: GiftKeys, domain: bigint, index: bigint): NoteSecrets {
  const nullifier = poseidon3(keys.nullifier, domain, index);
  const secret = poseidon3(keys.secret, domain, index);
  if (nullifier === 0n || secret === 0n) throw new CoreError("zero_scalar", "derived gift scalar is zero");
  return { nullifier, secret, precommitment: poseidon2(nullifier, secret) };
}

function expand(secret: Uint8Array, info: string): Uint8Array {
  return hkdfSha256(secret, SALT, utf8(info), 32);
}

function assertSecret(secret: Uint8Array): void {
  if (!(secret instanceof Uint8Array) || secret.length !== GIFT_SECRET_BYTES) {
    throw new CoreError("gift_secret", "gift secret must be 32 bytes");
  }
}

function uniform(maxExclusive: number, draw: () => Uint8Array): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 2 ** 48) {
    throw new CoreError("random_range", "random range must be 1..2^48");
  }
  const space = 2 ** 48;
  const limit = space - (space % maxExclusive);
  for (;;) {
    const bytes = draw();
    let value = 0;
    for (const byte of bytes) value = value * 256 + byte;
    if (value < limit) return value % maxExclusive;
  }
}
