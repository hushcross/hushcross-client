import { encodeFunctionData, getAddress, toBytes, type Address, type Hex } from "viem";
import { CoreError } from "../errors.js";
import type { TxRequest } from "../hushId.js";
import { LAUNCH_FACTORY_ABI } from "../launch/abi.js";
import type { SaleProfilePointer } from "./protocol.js";

/** `LaunchFactory.MAX_PROFILE_URI` (bytes). */
export const SALE_PROFILE_URI_MAX = 200;
const ZERO_HASH = `0x${"0".repeat(64)}` as const;

/** `LaunchFactory.setProfile(sale, contentHash, uri)` from the sale's creator wallet; `null` clears the profile. */
export function buildSetProfileTx(factory: Address, sale: Address, pointer: SaleProfilePointer | null): TxRequest {
  const contentHash: Hex = pointer?.contentHash ?? ZERO_HASH;
  const uri = pointer?.uri ?? "";
  if (pointer !== null && (!/^0x[0-9a-fA-F]{64}$/u.test(contentHash) || contentHash === ZERO_HASH || uri === "" || toBytes(uri).length > SALE_PROFILE_URI_MAX)) {
    throw new CoreError("invalid_profile", "profile pointer needs a non-zero hash and a 1-200 byte uri");
  }
  return { to: getAddress(factory), data: encodeFunctionData({ abi: LAUNCH_FACTORY_ABI, functionName: "setProfile", args: [getAddress(sale), contentHash, uri] }), value: 0n };
}

/** `LaunchFactory.profileOf` result to a pointer (null when never set or cleared). */
export function profilePointerFrom(result: { readonly contentHash: Hex; readonly uri: string }): SaleProfilePointer | null {
  return /^0x0{64}$/u.test(result.contentHash) || result.uri === "" ? null : { contentHash: result.contentHash, uri: result.uri };
}
