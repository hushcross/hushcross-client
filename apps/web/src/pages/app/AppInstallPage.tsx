import { useId } from 'react';
import { Button, ButtonLink, buttonClass } from '../../components/Button/Button';
import { Badge } from '../../components/Badge/Badge';
import { Icon } from '../../components/Icon/Icon';
import { LogoMark } from '../../components/Logo/Logo';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { appConfig } from '../../config';
import { useI18n } from '../../i18n/I18nProvider';
import { InstallEntry } from '../../pwa/InstallEntry';
import bundledRelease from '../../releases/android.json';
import { readAndroidRelease } from './androidRelease';
import styles from './AppInstall.module.css';
export type { AndroidReleaseMetadata } from './androidRelease';

/** Installation options share the app shell; release metadata is not publication proof. */
export function AppInstallPage({ release: rawRelease = bundledRelease }: { readonly release?: unknown } = {}) {
  const release = readAndroidRelease(rawRelease);
  const { t, intlLocale } = useI18n();
  const androidTitle = useId();
  const releaseStatus = useId();
  const platformsTitle = useId();
  const safetyTitle = useId();
  const published = release?.published === true;
  const number = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 });

  return <div className={styles.page}>
    <div className={styles.heading}>
      <PageHeader kicker={t('pwa.pageKicker')} title={t('pwa.pageTitle')} subtitle={t('pwa.pageBody')} />
    </div>
    {appConfig.dataSource === 'mock' ? <p className={styles.demo}><Icon name="info" size={18} />{t('pwa.demoNotice')}</p> : null}

    <section className={styles.featured} aria-labelledby={androidTitle}>
      <div className={styles.featuredMain}>
        <div className={styles.appMark} aria-hidden="true"><LogoMark size={96} /></div>
        <div className={styles.featuredCopy}>
          <div className={styles.platformLine}>
            <span className={styles.platformLabel}>{t('pwa.androidPlatform')}</span>
            <Badge tone={published ? 'accent' : 'neutral'} dot={false}>{t(published ? 'pwa.androidAvailable' : release ? 'pwa.androidPrepared' : 'pwa.androidPending')}</Badge>
          </div>
          <h2 id={androidTitle} className={styles.productTitle}>{t('pwa.androidTitle')}</h2>
          <p className={styles.body}>{t(release ? 'pwa.androidReadyBody' : 'pwa.androidBody')}</p>
          {release ? <p className={styles.version}>
            <span>{t('pwa.androidVersion')} {release.versionName}</span><span aria-hidden="true">·</span>
            <span>{t('pwa.androidCompactSize', { size: number.format(release.sizeBytes / 1_000_000) })}</span>
          </p> : null}
        </div>
        <div className={styles.primaryAction}>
          {published && release ? <a className={[buttonClass({ size: 'lg' }), styles.download].join(' ')} href={release.downloadUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-describedby={releaseStatus}>
            <Icon name="download" size={18} />{t('pwa.androidDownload')}
          </a> : <Button size="lg" icon="download" disabled className={styles.download} aria-describedby={releaseStatus}>{t('pwa.androidDownloadPending')}</Button>}
          <p id={releaseStatus} className={styles.actionNote}>{t(published ? 'pwa.androidOfficialRelease' : release ? 'pwa.androidUnpublished' : 'pwa.androidReleaseHint')}</p>
          {published && release?.fallbackUrl ? <a className={buttonClass({ variant: 'ghost', size: 'sm' })} href={release.fallbackUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            {t('pwa.androidFallbackDownload')}<Icon name="external" size={14} />
          </a> : null}
        </div>
      </div>
      {release ? <details className={styles.verification} data-release-verification>
        <summary><span><Icon name="docs" size={16} />{t('pwa.verifyDetails')}</span><Icon name="chevronRight" size={16} className={styles.chevron} /></summary>
        <div className={styles.verificationBody}>
          <p className={styles.note}>{t('pwa.verifyHint')}</p>
          <dl className={styles.releaseMeta}>
            <div><dt>{t('pwa.androidSize')}</dt><dd>{release.sizeBytes.toLocaleString(intlLocale)} {t('pwa.androidBytes')}</dd></div>
            <div><dt>SHA-256</dt><dd><code>{release.sha256}</code></dd></div>
            <div><dt>{t('pwa.androidCertificate')}</dt><dd><code>{release.certificateSha256}</code></dd></div>
          </dl>
        </div>
      </details> : null}
    </section>

    <section className={styles.platformSection} aria-labelledby={platformsTitle}>
      <div className={styles.sectionHeading}><h2 id={platformsTitle}>{t('pwa.morePlatforms')}</h2><p>{t('pwa.platformsHint')}</p></div>
      <div className={styles.platformGrid}>
        <article className={styles.platformCard}>
          <div className={styles.cardTop}><span className={styles.platformIcon}><Icon name="wallet" size={24} /></span><Badge tone="neutral" dot={false}>{t('pwa.extensionPending')}</Badge></div>
          <h3>{t('pwa.extensionTitle')}</h3>
          <p className={styles.body}>{t('pwa.extensionBody')}</p>
          <p className={styles.compatibility}>{t('pwa.extensionCompatibility')}</p>
          <Button variant="secondary" disabled icon="external">{t('pwa.extensionPendingAction')}</Button>
        </article>
        <article className={styles.platformCard}>
          <div className={styles.cardTop}><span className={styles.platformIcon}><Icon name="globe" size={24} /></span><Badge tone="neutral" dot={false}>{t('pwa.webAvailable')}</Badge></div>
          <h3>{t('pwa.webTitle')}</h3>
          <p className={styles.body}>{t('pwa.webBody')}</p>
          <div className={styles.webActions}>
            <a className={buttonClass({ variant: 'secondary' })} href="https://hushcross.fun/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('pwa.openWebsite')}<Icon name="external" size={16} /></a>
            <InstallEntry variant="compact" />
          </div>
          <details className={styles.iosGuide}>
            <summary>{t('pwa.iosGuideTitle')}<Icon name="chevronRight" size={16} className={styles.chevron} /></summary>
            <p className={styles.note}>{t('pwa.iosAvailability')}</p>
            <ol className={styles.iosSteps}>{(['first', 'second', 'third'] as const).map(part => <li key={part}>{t(`pwa.iosSteps.${part}.body`)}</li>)}</ol>
          </details>
        </article>
      </div>
    </section>

    <section className={styles.help} aria-labelledby={safetyTitle}>
      <div className={styles.sectionHeading}><h2 id={safetyTitle}>{t('pwa.safetyTitle')}</h2></div>
      <div className={styles.backupNote}><Icon name="info" size={20} /><p>{t('pwa.backupReminder')}</p></div>
      <div className={styles.faq}>
        <details><summary>{t('pwa.installSafetyQuestion')}<Icon name="chevronRight" size={16} className={styles.chevron} /></summary><p>{t('pwa.packageSafety')}</p></details>
        <details><summary>{t('pwa.storageQuestion')}<Icon name="chevronRight" size={16} className={styles.chevron} /></summary><p>{t('pwa.storageBoundary')}</p></details>
      </div>
      <nav className={styles.helpLinks} aria-label={t('pwa.helpLinks')}>
        <ButtonLink to="/about" variant="ghost" size="sm" icon="docs">{t('about.link')}</ButtonLink>
        <ButtonLink to="/privacy" variant="ghost" size="sm">{t('privacyNotice.link')}</ButtonLink>
        <a className={buttonClass({ variant: 'ghost', size: 'sm' })} href="https://github.com/hushcross/hushcross-client" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('pwa.clientSource')}<Icon name="external" size={15} /></a>
      </nav>
    </section>
  </div>;
}
