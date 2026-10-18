import styles from './Progress.module.css';

export interface ProgressProps {
  readonly value: bigint;
  readonly max: bigint;
  readonly label: string;
  readonly tone?: 'accent' | 'ok' | 'danger';
}

export function Progress({ value, max, label, tone = 'accent' }: ProgressProps) {
  const ratio = max > 0n ? Number((value * 10_000n) / max) / 10_000 : 0;
  const shown = Math.min(1, ratio);
  return (
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
      <div className={[styles.fill, styles[tone]].join(' ')} style={{ width: `${(shown * 100).toFixed(1)}%` }} />
    </div>
  );
}
