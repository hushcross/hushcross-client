import { useMemo } from 'react';
import { formatAmount } from '../data/units';
import { useI18n } from '../i18n/I18nProvider';

export interface Formatters {
  /** "0.5 BNB" — truncating, up to `maxFraction` decimals. */
  readonly amount: (value: bigint, symbol: string, maxFraction?: number) => string;
  readonly number: (value: number) => string;
  readonly date: (ms: number) => string;
  readonly dateTime: (ms: number) => string;
  readonly relative: (ms: number, now?: number) => string;
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
];

export function useFormat(): Formatters {
  const { intlLocale } = useI18n();
  return useMemo(() => {
    const dateFmt = new Intl.DateTimeFormat(intlLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    const dateTimeFmt = new Intl.DateTimeFormat(intlLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const rel = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
    const num = new Intl.NumberFormat(intlLocale);
    return {
      amount: (value, symbol, maxFraction = 4) => `${formatAmount(value, { maxFraction })} ${symbol}`,
      number: (value) => num.format(value),
      date: (ms) => dateFmt.format(ms),
      dateTime: (ms) => dateTimeFmt.format(ms),
      relative: (ms, now = Date.now()) => {
        const diff = ms - now;
        for (const [unit, size] of UNITS) {
          if (Math.abs(diff) >= size || unit === 'second') return rel.format(Math.round(diff / size), unit);
        }
        return rel.format(0, 'second');
      },
    };
  }, [intlLocale]);
}
