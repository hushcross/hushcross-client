import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useToast } from '../components/Toast/Toast';
import { useI18n } from '../i18n/I18nProvider';
import { VAULT_STORAGE_KEY, type AccountManager, type AccountStatus } from './AccountManager';

interface AccountContextValue {
  readonly manager: AccountManager;
  readonly status: AccountStatus;
}

const AccountContext = createContext<AccountContextValue | null>(null);
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Exposes the account lifecycle and locks the vault after `idleMinutes` without input. */
export function AccountProvider({ manager, idleMinutes, children }: { readonly manager: AccountManager; readonly idleMinutes: number; readonly children: ReactNode }) {
  const status = useSyncExternalStore(
    (listener) => manager.subscribe(listener),
    () => manager.status(),
    () => manager.status(),
  );
  const { show } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    const checkIdle = (): boolean => {
      const locked = manager.lockIfIdle(idleMinutes * 60_000);
      if (locked) show({ tone: 'info', title: t('account.lockedIdle') });
      return locked;
    };
    const touch = (): void => {
      // Timers can be throttled while backgrounded: never renew an expired session.
      if (!checkIdle() && manager.status() === 'unlocked') manager.touch();
    };
    const onVisibility = (): void => { if (!document.hidden) checkIdle(); };
    const externalVaultChange = (event: StorageEvent): void => {
      if (event.storageArea === window.localStorage && (event.key === VAULT_STORAGE_KEY || event.key === null)) manager.lock();
    };
    window.addEventListener('storage', externalVaultChange);
    // Check before application handlers can act on the first returning input.
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, { passive: true, capture: true });
    window.addEventListener('focus', checkIdle);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(checkIdle, 15_000);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch, true);
      window.removeEventListener('focus', checkIdle);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
      window.removeEventListener('storage', externalVaultChange);
    };
  }, [manager, idleMinutes, show, t]);

  const value = useMemo(() => ({ manager, status }), [manager, status]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue | null {
  return useContext(AccountContext);
}
