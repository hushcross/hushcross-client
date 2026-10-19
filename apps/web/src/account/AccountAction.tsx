import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { ButtonLink } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { useI18n } from '../i18n/I18nProvider';
import styles from '../pages/page.module.css';
import { useAccount } from './AccountProvider';
import { setupPath } from './routeAccess';

/** Null context is the separate mock/test app, not a real locked session. */
export function useIsVisitor(): boolean {
  const account = useAccount();
  return account !== null && account.status !== 'unlocked';
}

/** Do not mount private hooks or action forms until the local vault is unlocked. */
export function AccountAction({ children }: { readonly children: ReactNode }) {
  const account = useAccount();
  const { pathname } = useLocation();
  const { t } = useI18n();
  if (!account || account.status === 'unlocked') return <>{children}</>;
  return <Card title={t('account.guestActionTitle')}>
    <div className={styles.stackSm}>
      <p className={styles.note}>{t(account.status === 'locked' ? 'account.guestLockedBody' : 'account.guestActionBody')}</p>
      <div><ButtonLink to={setupPath(pathname)} icon="key">{t(account.status === 'locked' ? 'account.guestUnlock' : 'account.guestSetup')}</ButtonLink></div>
    </div>
  </Card>;
}

/** Persistent context on public market pages, without touching account-owned data. */
export function VisitorNotice() {
  const account = useAccount();
  const { pathname } = useLocation();
  const { t } = useI18n();
  // Gift fragments/payment parameters stay at their original URL during inline setup.
  if (!account || account.status === 'unlocked' || pathname === '/' || /^\/(?:gift\/?|pay\/)/i.test(pathname)) return null;
  return <aside className={styles.callout} aria-label={t('account.guestBadge')}>
    <div className={styles.stackSm}>
      <p><strong>{t('account.guestBadge')}</strong> · {t('account.guestBody')}</p>
      <div><ButtonLink size="sm" variant="secondary" to={setupPath(pathname)} icon="key">{t(account.status === 'locked' ? 'account.guestUnlock' : 'account.guestSetup')}</ButtonLink></div>
    </div>
  </aside>;
}
