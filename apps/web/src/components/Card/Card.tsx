import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly as?: 'section' | 'article' | 'div';
  readonly padding?: 'md' | 'lg' | 'none';
  readonly tone?: 'default' | 'subtle';
  readonly title?: ReactNode;
  readonly action?: ReactNode;
}

export function Card({ as: Tag = 'section', padding = 'md', tone = 'default', title, action, children, className, ...rest }: CardProps) {
  return (
    <Tag className={[styles.card, styles[padding], tone === 'subtle' ? styles.subtle : '', className].filter(Boolean).join(' ')} {...rest}>
      {title || action ? (
        <header className={styles.header}>
          {title ? <h2 className={styles.title}>{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}
