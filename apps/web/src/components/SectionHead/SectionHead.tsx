import type { ReactNode } from 'react';
import styles from './SectionHead.module.css';

export interface SectionHeadProps {
  readonly id?: string;
  readonly title: ReactNode;
  /** Small tracked label above the title ("02 · Actions"). */
  readonly eyebrow?: ReactNode;
  readonly action?: ReactNode;
  readonly level?: 2 | 3;
}

/** Editorial section heading: serif title, a hairline running to the optional action. */
export function SectionHead({ id, title, eyebrow, action, level = 2 }: SectionHeadProps) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <div className={styles.head}>
      <div className={styles.text}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <Tag id={id} className={styles.title}>
          {title}
        </Tag>
      </div>
      <span className={styles.rule} aria-hidden="true" />
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
