/** Presentation-only number formatting for prices and tables (amounts stay bigint, 18 decimals). */

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Fixed number of fraction digits, padded with zeros so table columns line up: 593.2 → "593.20". */
export function formatFixed(value: bigint, fraction: number, decimals = 18): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  // Round half up at the requested precision.
  const scale = 10n ** BigInt(Math.max(0, decimals - fraction));
  const rounded = fraction >= decimals ? abs : ((abs + scale / 2n) / scale) * scale;
  const integer = rounded / base;
  const frac = (rounded % base).toString().padStart(decimals, '0').slice(0, fraction);
  return `${negative ? '-' : ''}${group(integer.toString())}${fraction > 0 ? `.${frac}` : ''}`;
}

/**
 * Short, readable price. Tiny prices use a subscript zero count, as on
 * trading screens: 0.000000285714 → "0.0₆2857". Prices of 1 and above keep two decimals.
 */
export function formatPrice(value: bigint, { decimals = 18, significant = 4 }: { readonly decimals?: number; readonly significant?: number } = {}): string {
  if (value === 0n) return '0';
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const sign = negative ? '-' : '';
  if (abs >= base) return sign + formatFixed(abs, 2, decimals);
  const fraction = abs.toString().padStart(decimals, '0');
  const zeros = fraction.length - fraction.replace(/^0+/, '').length;
  const digits = fraction.slice(zeros, zeros + significant).replace(/0+$/, '') || '0';
  if (zeros >= 5) {
    const sub = String(zeros)
      .split('')
      .map((d) => SUBSCRIPT[Number(d)] ?? d)
      .join('');
    return `${sign}0.0${sub}${digits}`;
  }
  return `${sign}0.${'0'.repeat(zeros)}${digits}`;
}

/** Full-precision text for tooltips and screen readers. */
export function formatFull(value: bigint, decimals = 18): string {
  const base = 10n ** BigInt(decimals);
  const integer = value / base;
  const frac = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${group(integer.toString())}${frac ? `.${frac}` : ''}`;
}
