import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Button, type ButtonSize, type ButtonVariant } from '../Button/Button';
import styles from './CopyButton.module.css';

/** Copies `value`; confirms with a tick that draws itself and a short label swap. */
export function CopyButton({ value, label, variant = 'secondary', size = 'sm' }: { readonly value: string; readonly label?: string; readonly variant?: ButtonVariant; readonly size?: ButtonSize }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button variant={variant} size={size} icon={copied ? undefined : 'copy'} onClick={copy} aria-live="polite" className={copied ? styles.copied : undefined} data-copied={copied || undefined}>
      {copied ? (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.tick}>
          <path d="M5 12.5 10 17.5 19 7" pathLength={1} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      <span key={copied ? 'copied' : 'idle'} className={styles.label}>
        {copied ? t('address.copied') : (label ?? t('common.copy'))}
      </span>
    </Button>
  );
}
