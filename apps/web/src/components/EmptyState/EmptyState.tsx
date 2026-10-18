import type { ReactNode } from 'react';
import { Illo, type IlloName } from '../../illustrations/Illo';
import { Spot, type SpotName } from '../../illustrations/Spot';
import { Coin } from '../Coin/Coin';
import type { IconName } from '../Icon/Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  readonly icon?: IconName;
  /** A spot illustration instead of the icon coin. */
  readonly art?: SpotName;
  /** A line illustration (takes precedence over art and icon). */
  readonly illo?: IlloName;
  readonly title: ReactNode;
  readonly body?: ReactNode;
  readonly action?: ReactNode;
}

export function EmptyState({ icon = 'info', art, illo, title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {illo ? <Illo name={illo} className={styles.illo} /> : art ? <Spot name={art} className={styles.art} /> : <Coin icon={icon} size="lg" className={styles.icon} />}
      <p className={styles.title}>{title}</p>
      {body ? <p className={styles.body}>{body}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
