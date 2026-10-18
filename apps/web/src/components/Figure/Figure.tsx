import { RollingNumber } from '../RollingNumber/RollingNumber';
import styles from './Figure.module.css';

/** "2,800.5" → ["2,800", ".5"]; the decimal separator is the last "." (values are en-formatted). */
export function splitFigure(value: string): readonly [string, string] {
  const dot = value.lastIndexOf('.');
  if (dot < 0 || !/\d/.test(value.slice(dot + 1))) return [value, ''];
  return [value.slice(0, dot), value.slice(dot)];
}

export interface FigureProps {
  readonly value: string;
  /** Asset code set after the number in tracked small caps. */
  readonly unit?: string;
  readonly roll?: boolean;
  readonly className?: string;
}

/**
 * Display numeral (DESIGN_SYSTEM §9.5): serif integer, the fraction a step smaller and
 * quieter, the asset code in small caps. Read out as one value.
 */
export function Figure({ value, unit, roll = false, className }: FigureProps) {
  const [whole, fraction] = splitFigure(value);
  const label = unit ? `${value} ${unit}` : value;
  return (
    <span className={[styles.figure, className].filter(Boolean).join(' ')} role="text" aria-label={label}>
      <span className={styles.digits} aria-hidden="true">
        <span className={styles.whole}>{roll ? <RollingNumber value={whole} rollIn /> : whole}</span>
        {fraction ? <span className={styles.fraction}>{roll ? <RollingNumber value={fraction} rollIn /> : fraction}</span> : null}
      </span>
      {unit ? (
        <span className={styles.unit} aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </span>
  );
}
