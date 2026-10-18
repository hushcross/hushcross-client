import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

export function Badge({ tone = 'neutral', children, dot = true }: { readonly tone?: BadgeTone; readonly children: ReactNode; readonly dot?: boolean }) {
  return (
    <span className={[styles.badge, styles[tone]].join(' ')}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export type ModuleTag = 'vault' | 'send' | 'launch' | 'book' | 'give';

/** Small module identity chip; module colours stay under 5% of the screen. */
export function ModuleChip({ module, children }: { readonly module: ModuleTag; readonly children: ReactNode }) {
  return (
    <span className={styles.module}>
      <span className={styles.swatch} style={{ background: `var(--mod-${module})` }} aria-hidden="true" />
      {children}
    </span>
  );
}
