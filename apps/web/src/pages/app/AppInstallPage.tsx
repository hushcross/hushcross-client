import { ButtonLink, buttonClass } from '../../components/Button/Button';
import { Badge } from '../../components/Badge/Badge';
import { Card } from '../../components/Card/Card';
import { Icon } from '../../components/Icon/Icon';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { appConfig } from '../../config';
import { useI18n } from '../../i18n/I18nProvider';
import { InstallEntry } from '../../pwa/InstallEntry';
import styles from './AppInstall.module.css';

import bundledRelease from '../../releases/android.json';
import { readAndroidRelease } from './androidRelease';
export type { AndroidReleaseMetadata } from './androidRelease';

export function AppInstallPage({ release: rawRelease = bundledRelease }: { readonly release?: unknown } = {}) {
  const release = readAndroidRelease(rawRelease);
  const { t } = useI18n();
  return <div className={styles.page}>
    <PageHeader kicker={t('pwa.pageKicker')} title={t('pwa.pageTitle')} subtitle={t('pwa.pageBody')} />
    {appConfig.dataSource === 'mock' ? <p className={styles.demo}><Icon name="info" />{t('pwa.demoNotice')}</p> : null}
    <div className={styles.grid}>
      <InstallEntry />
      <Card title={t('pwa.androidTitle')} action={<Badge tone="neutral" dot={false}>{t(release ? 'pwa.androidAvailable' : 'pwa.androidPending')}</Badge>}>
        {release ? <>
          <p className={styles.body}>{t('pwa.androidReadyBody')}</p>
          <a className={buttonClass({})} href={release.downloadUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><Icon name="download" size={18} />{t('pwa.androidDownload')}</a>
          <dl className={styles.releaseMeta}>
            <div><dt>{t('pwa.androidVersion')}</dt><dd>{release.versionName}</dd></div>
            <div><dt>{t('pwa.androidSize')}</dt><dd>{release.sizeBytes.toLocaleString()} {t('pwa.androidBytes')}</dd></div>
            <div><dt>SHA-256</dt><dd><code>{release.sha256}</code></dd></div>
            <div><dt>{t('pwa.androidCertificate')}</dt><dd><code>{release.certificateSha256}</code></dd></div>
          </dl>
        </> : <>
          <p className={styles.body}>{t('pwa.androidBody')}</p>
          <p className={styles.note}>{t('pwa.androidReleaseHint')}</p>
        </>}
      </Card>
      <Card title={t('pwa.iosTitle')}>
        <p className={styles.body}>{t('pwa.iosAvailability')}</p>
        <ol className={styles.iosSteps}>
          <li>{t('pwa.iosSteps.first.body')}</li>
          <li>{t('pwa.iosSteps.second.body')}</li>
          <li>{t('pwa.iosSteps.third.body')}</li>
        </ol>
      </Card>
      <Card title={t('pwa.safetyTitle')}>
        <p className={styles.body}>{t('pwa.backupReminder')}</p>
        <p className={styles.note}>{t('pwa.packageSafety')}</p>
        <p className={styles.note}>{t('pwa.storageBoundary')}</p>
        <ButtonLink to="/about" variant="ghost" size="sm" iconEnd="chevronRight">{t('about.link')}</ButtonLink>
        <ButtonLink to="https://github.com/hushcross/hushcross-client" target="_blank" rel="noopener noreferrer" variant="ghost" size="sm" iconEnd="chevronRight">{t('pwa.clientSource')}</ButtonLink>
      </Card>
    </div>
  </div>;
}
