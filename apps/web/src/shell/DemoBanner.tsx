import { useI18n } from '../i18n/I18nProvider';
import styles from './DemoBanner.module.css';

/** Shown on every page while the app runs on demo data, so nobody mistakes the numbers for real funds. */
export function DemoBanner() {
  const { t } = useI18n();
  return (
    <div className={styles.banner} role="note" data-demo-banner>
      <span className={styles.tag}>{t('shell.demoTag')}</span>
      <span>{t('shell.demoBody')}</span>
    </div>
  );
}
