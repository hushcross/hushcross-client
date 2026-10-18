import { useEffect, useState, type CSSProperties } from 'react';
import styles from './SaleLogo.module.css';

export type SaleLogoSize = 'sm' | 'md' | 'lg' | 'xl';

/** Hue pairs for monograms; picked from the symbol so a token always gets the same tile. */
const TONES: readonly (readonly [number, number])[] = [
  [204, 38],
  [152, 32],
  [24, 46],
  [266, 30],
  [338, 34],
  [46, 52],
  [186, 36],
  [118, 28],
];

function fnv(text: string): number {
  let hash = 2_166_136_261;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Deterministic monogram: up to two letters or digits of the symbol, and a tone index. */
export function monogramOf(symbol: string): { readonly letters: string; readonly tone: number } {
  const letters = [...symbol.normalize('NFKC').toUpperCase()].filter((c) => /[\p{L}\p{N}]/u.test(c)).slice(0, 2).join('') || '?';
  return { letters, tone: fnv(symbol.toUpperCase()) % TONES.length };
}

export interface SaleLogoProps {
  readonly symbol: string;
  /** Verified logo URL (blob:/data:); null or a failed load shows the monogram. */
  readonly src?: string | null;
  readonly size?: SaleLogoSize;
  /** Accessible name; without it the logo is decorative (the sale name is next to it). */
  readonly label?: string;
  readonly className?: string;
}

/** A sale's logo, or a generated monogram tile when there is none (or it fails to load). */
export function SaleLogo({ symbol, src = null, size = 'md', label, className }: SaleLogoProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const classes = [styles.tile, styles[size], className].filter(Boolean).join(' ');
  if (src && !failed) {
    return <img className={classes} src={src} alt={label ?? ''} aria-hidden={label ? undefined : true} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} data-testid="sale-logo-image" />;
  }
  const { letters, tone } = monogramOf(symbol);
  const [hue, chroma] = TONES[tone] ?? [204, 38];
  return (
    <span className={[classes, styles.monogram].join(' ')} style={{ ['--hue' as string]: String(hue), ['--chroma' as string]: `${chroma}%` } as CSSProperties} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-testid="sale-logo-monogram" data-tone={tone}>
      {letters}
    </span>
  );
}
