import { useId } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../components/Badge/Badge';
import { ButtonLink } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { LogoMark } from '../../components/Logo/Logo';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { SectionHead } from '../../components/SectionHead/SectionHead';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/types';
import styles from './GuestHome.module.css';

const FEATURES = [
  { id: 'vault', icon: 'vault', body: 'account.guestVaultBody' },
  { id: 'send', icon: 'send', body: 'account.guestSendBody' },
  { id: 'gift', icon: 'redPacket', body: 'account.guestGiftBody' },
  { id: 'launch', icon: 'launch', body: 'account.guestLaunchBody' },
  { id: 'book', icon: 'book', body: 'account.guestBookBody' },
  { id: 'give', icon: 'give', body: 'account.guestGiveBody' },
] as const satisfies readonly { readonly id: string; readonly icon: IconName; readonly body: MessageKey }[];

/** A public entry point. Account data and chain lists are loaded only by their own pages. */
export function GuestHome({ locked = false }: { readonly locked?: boolean }) {
  const { t } = useI18n();
  const modulesTitle = useId();
  return <div className={styles.page}>
    <PageHeader kicker="HushCross" leading={<LogoMark size={22} />} title={t('account.guestTitle')} subtitle={t('account.guestBody')}
      badges={<Badge tone="neutral" dot={false}>{t('account.guestBadge')}</Badge>}
      actions={<ButtonLink to="/account?returnTo=%2F" icon={locked ? 'lock' : 'key'}>{t(locked ? 'account.guestUnlock' : 'account.guestSetup')}</ButtonLink>} />

    <div className={styles.overview}>
      <Card title={t('account.guestPublicTitle')} className={styles.publicCard}>
        <p className={styles.body}>{t('account.guestPublicBody')}</p>
        <nav className={styles.publicLinks} aria-label={t('account.guestPublicTitle')}>
          <ButtonLink to="/launch" variant="secondary" icon="launch">{t('account.guestBrowseSales')}</ButtonLink>
          <ButtonLink to="/book" variant="secondary" icon="book">{t('account.guestBrowseBook')}</ButtonLink>
          <ButtonLink to="/give" variant="secondary" icon="give">{t('account.guestBrowseGive')}</ButtonLink>
        </nav>
      </Card>
      <Card title={t('account.guestBalanceTitle')} tone="subtle" className={styles.balanceCard}>
        <div className={styles.balancePlaceholder}>
          <Icon name="lock" size={22} />
          <p>{t(locked ? 'account.guestLockedBalance' : 'account.guestPrivateBalance')}</p>
        </div>
        <p className={styles.note}>{t('account.guestBalanceBody')}</p>
      </Card>
    </div>

    <section className={styles.modules} aria-labelledby={modulesTitle}>
      <SectionHead id={modulesTitle} title={t('account.guestModulesTitle')} />
      <div className={styles.featureGrid}>
        {FEATURES.map(feature => <Link key={feature.id} to={`/docs#docs-${feature.id}`} className={styles.feature}>
          <span className={styles.featureIcon}><Icon name={feature.icon} size={22} /></span>
          <h3 className={styles.featureTitle}>{t(`docs.sections.${feature.id}.title`)}</h3>
          <p className={styles.body}>{t(feature.body)}</p>
          <span className={styles.guideLink}>{t('account.guestLearnMore')}<Icon name="chevronRight" size={16} /></span>
        </Link>)}
      </div>
    </section>
    <Link to="/privacy" className={styles.privacyLink}>{t('privacyNotice.link')}</Link>
  </div>;
}
