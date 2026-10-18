import { useId, type ReactNode } from 'react';
import styles from './Segmented.module.css';

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  readonly legend: ReactNode;
  readonly options: readonly ChoiceOption<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly hideLegend?: boolean;
  readonly name?: string;
  readonly size?: 'md' | 'sm';
  readonly caption?: ReactNode;
}

/** Radio group rendered as capsule chips; arrow keys move between options. */
export function Segmented<T extends string>({ legend, options, value, onChange, hideLegend = false, name, size = 'md', caption }: SegmentedProps<T>) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <fieldset className={styles.fieldset}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      <div className={[styles.group, size === 'sm' ? styles.small : ''].join(' ')}>
        {options.map((option) => (
          <label key={option.value} className={[styles.chip, option.value === value ? styles.selected : '', option.disabled ? styles.disabled : ''].join(' ')}>
            <input
              type="radio"
              className={styles.radio}
              name={groupName}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {caption ? <div className={styles.caption}>{caption}</div> : null}
    </fieldset>
  );
}
