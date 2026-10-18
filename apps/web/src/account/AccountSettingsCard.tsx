import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { appConfig } from '../config';
import { useI18n } from '../i18n/I18nProvider';
import styles from '../pages/page.module.css';
import { useAccount } from './AccountProvider';

/** Chain mode only: lock / forget the local vault and show which network the app talks to. */
export function AccountSettingsCard() {
  const { t } = useI18n();
  const account = useAccount();
  if (!account) return null;
  return (
    <Card title={t('account.networkTitle')}>
      <div className={styles.form}>
        <dl className={styles.kv}>
          <dt>{t('account.network')}</dt>
          <dd className={styles.mono}>{t('account.chainId', { id: appConfig.chainId })}</dd>
        </dl>
        <div className={styles.actions}>
          <Button variant="secondary" icon="lock" onClick={() => account.manager.lock()} disabled={account.status !== 'unlocked'}>
            {t('account.lockNow')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm(t('account.forgetHint'))) account.manager.forget();
            }}
          >
            {t('account.forget')}
          </Button>
        </div>
        <p className={styles.note}>{t('account.forgetHint')}</p>
      </div>
    </Card>
  );
}
