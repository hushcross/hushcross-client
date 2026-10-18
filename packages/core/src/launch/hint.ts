import { CoreError } from "../errors.js";

/**
 * Browser-safe clearing price for `SealedSale.finalize(p*)` from the contract's revealed entries
 * (`entryAt(i)` = valid bids as (price, q)), per LAUNCH.md section 5:
 *   T < S  -> p* = floor;   otherwise p* = the highest bid price with A(p*) = sum q (price >= p*) >= S.
 * Cross-checked against packages/clearing (`finalizeHint`) in the core tests; `previewFinalize` on chain
 * remains the authority.
 */
export function clearingPriceFromEntries(entries: readonly { readonly price: bigint; readonly quantity: bigint }[], supply: bigint, floorPrice: bigint): bigint {
  if (supply <= 0n || floorPrice <= 0n) throw new CoreError("launch_finalize", "supply and floor must be positive");
  const total = entries.reduce((sum, e) => sum + e.quantity, 0n);
  if (total < supply) return floorPrice;
  const levels = new Map<bigint, bigint>();
  for (const e of entries) levels.set(e.price, (levels.get(e.price) ?? 0n) + e.quantity);
  const prices = [...levels.keys()].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  let atOrAbove = 0n;
  for (const price of prices) {
    atOrAbove += levels.get(price) ?? 0n;
    if (atOrAbove >= supply) return price;
  }
  throw new CoreError("launch_finalize", "demand reached supply but no level did");
}
