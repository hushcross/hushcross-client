import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from '../Icon/Icon';
import styles from './AddressDisplay.module.css';

export type ExplorerKind = 'address' | 'tx' | 'token' | 'none';

export interface AddressDisplayProps {
  readonly value: string;
  readonly kind?: ExplorerKind;
  /** Characters kept on each side of the ellipsis (after any 0x / st:bsc: prefix). */
  readonly keep?: number;
  readonly label?: string;
}

const EXPLORER = 'https://bscscan.com';

export function middleEllipsis(value: string, keep = 4): string {
  const prefix = /^(st:bsc:0x|0x)/.exec(value)?.[0] ?? '';
  const body = value.slice(prefix.length);
  if (body.length <= keep * 2 + 1) return value;
  return `${prefix}${body.slice(0, keep)}…${body.slice(-keep)}`;
}

export function explorerUrl(value: string, kind: ExplorerKind): string | null {
  if (kind === 'none' || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
  return `${EXPLORER}/${kind}/${value}`;
}

export function AddressDisplay({ value, kind = 'address', keep = 4, label }: AddressDisplayProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = explorerUrl(value, kind);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className={styles.wrap}>
      <button type="button" className={styles.value} onClick={copy} title={value} aria-label={`${label ?? t('address.copyLabel')}: ${value}`}>
        <span className="mono">{middleEllipsis(value, keep)}</span>
        <Icon name={copied ? 'check' : 'copy'} size={14} className={copied ? styles.ok : styles.icon} />
      </button>
      <span className="visually-hidden" aria-live="polite">
        {copied ? t('address.copied') : ''}
      </span>
      {url ? (
        <a className={styles.link} href={url} target="_blank" rel="noreferrer noopener" aria-label={t('address.explorer')}>
          <Icon name="external" size={14} />
        </a>
      ) : null}
    </span>
  );
}
