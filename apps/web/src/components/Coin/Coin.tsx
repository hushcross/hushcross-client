import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { useSharedArrival } from '../../motion/shared';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './Coin.module.css';

export type CoinTone = 'vault' | 'send' | 'launch' | 'book' | 'give' | 'accent' | 'neutral' | 'ok' | 'warn' | 'danger';
export type CoinSize = 'sm' | 'md' | 'lg' | 'xl';

const TONE: Readonly<Record<CoinTone, string>> = {
  vault: 'var(--mod-vault)',
  send: 'var(--mod-send)',
  launch: 'var(--mod-launch)',
  book: 'var(--mod-book)',
  give: 'var(--mod-give)',
  accent: 'var(--accent)',
  neutral: 'var(--muted-2)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
};

const ICON_SIZE: Readonly<Record<CoinSize, number>> = { sm: 16, md: 20, lg: 24, xl: 30 };

export interface CoinProps {
  readonly icon: IconName;
  readonly tone?: CoinTone;
  readonly size?: CoinSize;
  /** Shared-element key: the coin flies in from the last element that left with this key. */
  readonly share?: string;
  /** Sits on the dark vault plate. */
  readonly onPlate?: boolean;
  readonly className?: string;
  readonly label?: string;
}

/**
 * The single icon container of the product (DESIGN_SYSTEM §9.4): a round "coin" with a
 * module-tinted face, a hairline rim and a top highlight. Decorative unless labelled.
 */
export const Coin = forwardRef<HTMLSpanElement, CoinProps>(function Coin({ icon, tone = 'neutral', size = 'md', share, onPlate = false, className, label }, forwarded) {
  const ref = useRef<HTMLSpanElement>(null);
  useImperativeHandle(forwarded, () => ref.current as HTMLSpanElement);
  useSharedArrival(share, ref);
  return (
    <span
      ref={ref}
      className={[styles.coin, styles[size], onPlate ? styles.onPlate : '', className].filter(Boolean).join(' ')}
      style={{ ['--coin' as string]: TONE[tone] } as CSSProperties}
      data-share={share}
      data-tone={tone}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon name={icon} size={ICON_SIZE[size]} />
    </span>
  );
});
