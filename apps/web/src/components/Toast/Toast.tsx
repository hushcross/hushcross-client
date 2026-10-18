import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger';

export interface ToastInput {
  readonly title: string;
  readonly body?: string;
  readonly tone?: ToastTone;
}

interface ToastItem extends ToastInput {
  readonly id: number;
}

interface ToastContextValue {
  readonly show: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const ICONS: Readonly<Record<ToastTone, IconName>> = { info: 'info', ok: 'check', warn: 'clock', danger: 'alert' };
const LIFETIME_MS = 5000;

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current;
      nextId.current += 1;
      setItems((current) => [...current.slice(-2), { ...toast, id }]);
      timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({ items, onDismiss }: { readonly items: readonly ToastItem[]; readonly onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {items.map((item) => {
        const tone = item.tone ?? 'info';
        return (
          <div key={item.id} className={[styles.toast, styles[tone]].join(' ')}>
            <Icon name={ICONS[tone]} size={18} className={styles.icon} />
            <div className={styles.text}>
              <p className={styles.title}>{item.title}</p>
              {item.body ? <p className={styles.body}>{item.body}</p> : null}
            </div>
            <button type="button" className={styles.close} onClick={() => onDismiss(item.id)} aria-label={t('common.dismiss')}>
              <Icon name="x" size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
