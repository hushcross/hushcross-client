import type { Asset, UnitOption } from './types';

export const WAD = 10n ** 18n;
const BPS = 10_000n;

const centi = WAD / 100n;

/** Pool units (net amounts) from SPEC §2. */
export const UNIT_VALUES: Readonly<Record<Asset, readonly bigint[]>> = {
  BNB: [2n * centi, 10n * centi, 50n * centi, 2n * WAD, 10n * WAD],
  USDT: [20n * WAD, 100n * WAD, 500n * WAD, 2000n * WAD, 10_000n * WAD],
};

function feeOf(gross: bigint, feeBps: number): bigint {
  return (gross * BigInt(feeBps)) / BPS;
}

/** Smallest gross deposit whose net (after the floor-rounded vetting fee) reaches `net`. */
export function grossForNet(net: bigint, feeBps: number): bigint {
  if (feeBps <= 0) return net;
  const denominator = BPS - BigInt(feeBps);
  let gross = (net * BPS + denominator - 1n) / denominator;
  while (gross - feeOf(gross, feeBps) < net) gross += 1n;
  while (gross - 1n - feeOf(gross - 1n, feeBps) >= net) gross -= 1n;
  return gross;
}

export function unitOptions(asset: Asset, feeBps: number): readonly UnitOption[] {
  return UNIT_VALUES[asset].map((net) => {
    const gross = grossForNet(net, feeBps);
    return { asset, net, gross, fee: gross - net };
  });
}

export interface FormatOptions {
  readonly decimals?: number;
  readonly maxFraction?: number;
}

/** Truncating fixed-point formatter with en-US grouping (locale-neutral digits). */
export function formatAmount(value: bigint, options: FormatOptions = {}): string {
  const decimals = options.decimals ?? 18;
  const maxFraction = options.maxFraction ?? 4;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const integer = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  const grouped = integer.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

export function parseAmount(text: string, decimals = 18): bigint | null {
  const cleaned = text.trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

/** amount (1e18) × price (1e18 quote per token) → quote amount (1e18). */
export function quoteValue(amount: bigint, price: bigint): bigint {
  return (amount * price) / WAD;
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Round a spend up to a whole number of the smallest unit for the asset. */
export function depositForSpend(asset: Asset, spend: bigint): bigint {
  const smallest = UNIT_VALUES[asset][0] ?? WAD;
  return ((spend + smallest - 1n) / smallest) * smallest;
}

/** Greedy split of an amount into unit values (largest first). */
export function splitIntoUnits(asset: Asset, amount: bigint): readonly bigint[] {
  const values = [...UNIT_VALUES[asset]].reverse();
  const result: bigint[] = [];
  let remaining = amount;
  for (const value of values) {
    while (remaining >= value) {
      result.push(value);
      remaining -= value;
    }
  }
  return result;
}
