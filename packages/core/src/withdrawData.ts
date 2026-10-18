import { decodeAbiParameters, encodeAbiParameters, getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { CoreError } from "./errors.js";
import { GIFT_PACKETS_PER_CALL } from "./gift.js";

/** Withdrawal targets understood by the relay (INTERFACES 4). */
export type WithdrawTarget = "send" | "gift" | "launch" | "book" | "give" | "direct";

export interface Withdrawal {
  readonly processooor: Address;
  readonly data: Hex;
}

export interface SendData {
  readonly recipient: Address;
  readonly feeRecipient: Address;
  readonly relayFeeBPS: bigint;
  readonly ephemeralPubKey: Hex;
  readonly metadata: Hex;
}

export interface GiftData {
  readonly precommitments: readonly bigint[];
  readonly values: readonly bigint[];
  readonly feeRecipient: Address;
  readonly relayFeeBPS: bigint;
  readonly dustRecipient: Address;
}

export interface RelayData {
  readonly recipient: Address;
  readonly feeRecipient: Address;
  readonly relayFeeBPS: bigint;
}

export const SEND_DATA_ABI = [
  {
    type: "tuple",
    components: [
      { name: "recipient", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "relayFeeBPS", type: "uint256" },
      { name: "ephemeralPubKey", type: "bytes" },
      { name: "metadata", type: "bytes" },
    ],
  },
] as const;

export const GIFT_DATA_ABI = [
  {
    type: "tuple",
    components: [
      { name: "precommitments", type: "uint256[]" },
      { name: "values", type: "uint256[]" },
      { name: "feeRecipient", type: "address" },
      { name: "relayFeeBPS", type: "uint256" },
      { name: "dustRecipient", type: "address" },
    ],
  },
] as const;

export const RELAY_DATA_ABI = [
  {
    type: "tuple",
    components: [
      { name: "recipient", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "relayFeeBPS", type: "uint256" },
    ],
  },
] as const;

/** abi.encode(SendData): one dynamic tuple, so the encoding starts with a 0x20 offset word. */
export function encodeSendData(data: SendData): Hex {
  assertBps(data.relayFeeBPS);
  if (!isHex(data.ephemeralPubKey) || !isHex(data.metadata)) throw new CoreError("bytes", "send data bytes must be hex");
  if ((data.ephemeralPubKey === "0x") !== (data.metadata === "0x")) {
    throw new CoreError("announcement", "ephemeralPubKey and metadata must both be set or both be empty");
  }
  return encodeAbiParameters(SEND_DATA_ABI, [
    { recipient: address("recipient", data.recipient), feeRecipient: address("feeRecipient", data.feeRecipient), relayFeeBPS: data.relayFeeBPS, ephemeralPubKey: data.ephemeralPubKey, metadata: data.metadata },
  ]);
}

export function decodeSendData(encoded: Hex): SendData {
  const [value] = decodeAbiParameters(SEND_DATA_ABI, encoded);
  return { recipient: value.recipient, feeRecipient: value.feeRecipient, relayFeeBPS: value.relayFeeBPS, ephemeralPubKey: value.ephemeralPubKey, metadata: value.metadata };
}

export function encodeGiftData(data: GiftData): Hex {
  assertBps(data.relayFeeBPS);
  if (data.precommitments.length !== data.values.length) throw new CoreError("gift_data", "precommitments and values length differ");
  if (data.precommitments.length === 0 || data.precommitments.length > GIFT_PACKETS_PER_CALL) {
    throw new CoreError("gift_data", `gift data needs 1-${GIFT_PACKETS_PER_CALL} packets`);
  }
  if (new Set(data.precommitments.map(String)).size !== data.precommitments.length) throw new CoreError("gift_data", "duplicate precommitment");
  if (data.values.some((value) => value <= 0n)) throw new CoreError("gift_data", "packet values must be positive");
  return encodeAbiParameters(GIFT_DATA_ABI, [
    {
      precommitments: [...data.precommitments],
      values: [...data.values],
      feeRecipient: address("feeRecipient", data.feeRecipient),
      relayFeeBPS: data.relayFeeBPS,
      dustRecipient: address("dustRecipient", data.dustRecipient),
    },
  ]);
}

export function decodeGiftData(encoded: Hex): GiftData {
  const [value] = decodeAbiParameters(GIFT_DATA_ABI, encoded);
  return { precommitments: [...value.precommitments], values: [...value.values], feeRecipient: value.feeRecipient, relayFeeBPS: value.relayFeeBPS, dustRecipient: value.dustRecipient };
}

/** Upstream Entrypoint.relay data: abi.encode(RelayData), static, exactly 96 bytes. */
export function encodeRelayData(data: RelayData): Hex {
  assertBps(data.relayFeeBPS);
  return encodeAbiParameters(RELAY_DATA_ABI, [
    { recipient: address("recipient", data.recipient), feeRecipient: address("feeRecipient", data.feeRecipient), relayFeeBPS: data.relayFeeBPS },
  ]);
}

export function decodeRelayData(encoded: Hex): RelayData {
  const [value] = decodeAbiParameters(RELAY_DATA_ABI, encoded);
  return { recipient: value.recipient, feeRecipient: value.feeRecipient, relayFeeBPS: value.relayFeeBPS };
}

function address(name: string, value: string): Address {
  if (!isAddress(value, { strict: false })) throw new CoreError("address", `${name} is not an address`);
  return getAddress(value);
}

function assertBps(bps: bigint): void {
  if (bps < 0n || bps >= 10_000n) throw new CoreError("fee_bps", "relay fee bps must be in [0, 10000)");
}
