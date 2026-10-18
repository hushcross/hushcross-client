import styles from './Skeleton.module.css';

export interface SkeletonProps {
  readonly lines?: number;
  readonly height?: number;
  readonly width?: string;
  readonly label?: string;
}

export function Skeleton({ lines = 1, height = 14, width = '100%', label }: SkeletonProps) {
  return (
    <div className={styles.stack} role={label ? 'status' : undefined} aria-label={label} aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={styles.bar} style={{ height, width: i === lines - 1 && lines > 1 ? '62%' : width }} />
      ))}
    </div>
  );
}
