import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import styles from './Countdown.module.css';

export function splitDuration(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(total / 86_400), hours: Math.floor((total % 86_400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

const pad = (n: number): string => n.toString().padStart(2, '0');

export function formatCountdown(ms: number, dayLabel: string): string {
  const { days, hours, minutes, seconds } = splitDuration(ms);
  if (days > 0) return `${days}${dayLabel} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export interface CountdownProps {
  readonly target: number;
  readonly label?: string;
  readonly size?: 'md' | 'lg';
  readonly onElapsed?: () => void;
}

export function Countdown({ target, label, size = 'md', onElapsed }: CountdownProps) {
  const { t } = useI18n();
  const now = useNow();
  const remaining = target - now;
  const elapsed = remaining <= 0;
  useEffect(() => {
    if (elapsed) onElapsed?.();
  }, [elapsed, onElapsed]);
  return (
    <span className={[styles.countdown, size === 'lg' ? styles.lg : ''].join(' ')}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <time className={styles.value} dateTime={new Date(target).toISOString()} aria-label={label ? `${label} ${formatCountdown(remaining, t('time.dayShort'))}` : undefined}>
        {formatCountdown(remaining, t('time.dayShort'))}
      </time>
    </span>
  );
}
