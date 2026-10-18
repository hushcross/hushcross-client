/**
 * Gas estimates used for relay fee quotes (the relay re-checks with eth_estimateGas and
 * rejects underpaying requests). Calibrate on the fork E2E; see docs/reports/C1.md.
 */
export const RELAY_GAS = {
  direct: 650_000n,
  send: 700_000n,
  giftBase: 700_000n,
  giftPerPacket: 280_000n,
  /** LaunchAdapter.fundBid (withdraw + SealedSale.commit); calibrated by the W3 E2E. */
  launch: 900_000n,
  /** BookAdapter.fundOrder (withdraw + SealedBook.commit). Calibrated by the W4 E2E. */
  book: 900_000n,
  /** GiveAdapter.fund: withdraw + donateFromAdapter (tip ~0.72M), plus ~70k per reserved refund note (goal, 5 notes ~1.07M; W4 E2E). */
  giveBase: 780_000n,
  givePerNote: 75_000n,
} as const;

export function relayGas(target: 'send' | 'gift' | 'direct' | 'launch' | 'book' | 'give', packets = 1): bigint {
  if (target === 'gift') return RELAY_GAS.giftBase + RELAY_GAS.giftPerPacket * BigInt(Math.max(1, packets));
  if (target === 'give') return RELAY_GAS.giveBase + RELAY_GAS.givePerNote * BigInt(Math.max(0, packets));
  return RELAY_GAS[target];
}
