import { Countdown } from '../Countdown/Countdown';
import { Icon } from '../Icon/Icon';
import styles from './PhaseBar.module.css';

export interface Phase<T extends string> {
  readonly id: T;
  readonly label: string;
  /** When this phase ends (ms); drives the countdown on the active phase. */
  readonly endsAt?: number;
}

export interface PhaseBarProps<T extends string> {
  readonly phases: readonly Phase<T>[];
  readonly current: T | null;
  readonly label: string;
  readonly endsInLabel?: string;
  readonly tone?: 'default' | 'danger';
  readonly onElapsed?: () => void;
}

export function PhaseBar<T extends string>({ phases, current, label, endsInLabel, tone = 'default', onElapsed }: PhaseBarProps<T>) {
  const index = phases.findIndex((p) => p.id === current);
  const active = index >= 0 ? phases[index] : undefined;
  return (
    <div className={[styles.wrap, tone === 'danger' ? styles.danger : ''].join(' ')}>
      <ol className={styles.bar} aria-label={label}>
        {phases.map((phase, i) => {
          const state = index < 0 ? 'todo' : i < index ? 'done' : i === index ? 'current' : 'todo';
          return (
            <li key={phase.id} className={[styles.segment, styles[state]].join(' ')} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.track} aria-hidden="true" />
              <span className={styles.name}>
                {state === 'done' ? <Icon name="check" size={12} /> : null}
                {phase.label}
              </span>
            </li>
          );
        })}
      </ol>
      {active?.endsAt !== undefined && endsInLabel ? (
        <div className={styles.timer}>
          <Countdown target={active.endsAt} label={endsInLabel} onElapsed={onElapsed} />
        </div>
      ) : null}
    </div>
  );
}
