import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import styles from './Input.module.css';

interface FieldChrome {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly suffix?: ReactNode;
}

function Field({ id, label, hint, error, children }: FieldChrome & { readonly id: string; readonly children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={styles.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends FieldChrome, Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  readonly mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, suffix, mono, id, className, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <Field id={inputId} label={label} hint={hint} error={error}>
      <div className={[styles.control, error ? styles.invalid : '', className].filter(Boolean).join(' ')}>
        <input ref={ref} id={inputId} className={[styles.input, mono ? styles.mono : ''].join(' ')} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      </div>
    </Field>
  );
});

export interface TextAreaProps extends FieldChrome, TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function TextArea({ label, hint, error, id, className, ...rest }: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} hint={hint} error={error}>
      <div className={[styles.control, error ? styles.invalid : ''].join(' ')}>
        <textarea id={inputId} className={[styles.textarea, className].filter(Boolean).join(' ')} aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined} {...rest} />
      </div>
    </Field>
  );
}

export interface SelectProps extends FieldChrome, SelectHTMLAttributes<HTMLSelectElement> {
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export function Select({ label, hint, error, id, options, ...rest }: SelectProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} hint={hint} error={error}>
      <div className={[styles.control, styles.selectWrap].join(' ')}>
        <select id={inputId} className={styles.select} aria-describedby={hint ? `${inputId}-hint` : undefined} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}
