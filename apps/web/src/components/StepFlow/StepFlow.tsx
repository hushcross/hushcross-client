import styles from './StepFlow.module.css';

export interface StepFlowProps {
  readonly steps: readonly string[];
  /** Index of the active step; steps before it render as complete. */
  readonly current: number;
  readonly label: string;
}

export function StepFlow({ steps, current, label }: StepFlowProps) {
  return (
    <ol className={styles.flow} aria-label={label}>
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li key={step} className={[styles.step, styles[state]].join(' ')} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.connector} aria-hidden="true">
              <span className={styles.connectorFill} />
            </span>
            <span className={styles.dot} aria-hidden="true">
              {state === 'done' ? (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className={styles.check}>
                  <path d="M5 12.5 10 17.5 19 7" pathLength={1} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className={styles.label}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
