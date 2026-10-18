import { Link } from 'react-router';
import { Icon } from '../../components/Icon/Icon';
import { PrivacyMeter } from '../../components/PrivacyMeter/PrivacyMeter';
import { RollingNumber } from '../../components/RollingNumber/RollingNumber';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useResource } from '../../data/DataProvider';
import { ASSETS } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import styles from './HomePage.module.css';

/** Home dashboard: how well the user's spendable notes blend in, per pool. */
export function PrivacyPanel() {
  const { t } = useI18n();
  const data = useResource(
    async (ds) => {
      const [notes, ...pools] = await Promise.all([ds.listNotes(), ...ASSETS.map((asset) => ds.getPoolStats(asset))]);
      return { notes, pools };
    },
    ['notes', 'balances'],
  );
  const notes = data.data?.notes ?? [];
  const spendable = notes.filter((n) => n.status === 'approved');
  const inReview = notes.filter((n) => n.status === 'in_review').length;
  const weakest = spendable.length > 0 ? Math.min(...spendable.map((n) => n.mixedWith)) : null;
  return (
    <section className={styles.privacy} aria-labelledby="home-privacy">
      <div className={styles.privacyHead}>
        <h2 id="home-privacy" className={styles.privacyTitle}>
          <Icon name="shield" size={16} />
          {t('home.privacy.title')}
        </h2>
        <Link to="/vault?tab=notes" className={styles.more}>
          {t('home.privacy.notes')}
        </Link>
      </div>
      {data.data === undefined ? (
        <Skeleton lines={3} label={t('common.loading')} />
      ) : (
        <>
          <div className={styles.privacyLead}>
            {weakest === null ? (
              <p className={styles.privacyEmpty}>{t('home.privacy.empty')}</p>
            ) : (
              <>
                <span className={styles.privacyFigure}>
                  <RollingNumber value={weakest.toLocaleString('en-US')} rollIn />
                </span>
                <span className={styles.privacyCaption}>{t('home.privacy.lead')}</span>
              </>
            )}
          </div>
          <ul className={styles.pools}>
            {data.data.pools.map((pool) => (
              <li key={pool.asset}>
                <span className={styles.poolName}>{t('home.privacy.pool', { asset: pool.asset })}</span>
                <PrivacyMeter mixedWith={pool.approvedDeposits} scale={5000} />
              </li>
            ))}
          </ul>
          <p className={styles.privacyFoot}>{t('home.privacy.counts', { n: spendable.length, m: inReview })}</p>
        </>
      )}
    </section>
  );
}
