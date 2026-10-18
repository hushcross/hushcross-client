import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '../Icon/Icon';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  readonly back?: { readonly to: string; readonly label: string };
  /** Eyebrow line above the title (a name, a kind, a module). */
  readonly kicker?: ReactNode;
  /** Status chips on the eyebrow line, after the kicker — one place for every page's badges. */
  readonly badges?: ReactNode;
  /** A coin (or other mark) set before the eyebrow line. */
  readonly leading?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, back, kicker, badges, leading }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {back ? (
        <Link to={back.to} className={styles.back}>
          <Icon name="chevronLeft" size={16} />
          {back.label}
        </Link>
      ) : null}
      <div className={styles.row}>
        <div className={styles.text}>
          {kicker || badges || leading ? (
            <div className={styles.kicker}>
              {leading}
              {kicker ? <span className={styles.kickerText}>{kicker}</span> : null}
              {badges ? <span className={styles.badges}>{badges}</span> : null}
            </div>
          ) : null}
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </header>
  );
}
