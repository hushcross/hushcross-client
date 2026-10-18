import { Link } from 'react-router';
import { Coin, type CoinTone } from '../../components/Coin/Coin';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { SocialLinks } from '../../components/SocialLinks/SocialLinks';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/types';
import styles from '../page.module.css';

const LINKS: readonly { to: string; icon: IconName; title: MessageKey; body: MessageKey; tone: CoinTone }[] = [
  { to: '/book', icon: 'book', title: 'home.modules.book.title', body: 'home.modules.book.body', tone: 'book' },
  { to: '/give', icon: 'give', title: 'home.modules.give.title', body: 'home.modules.give.body', tone: 'give' },
  { to: '/settings', icon: 'settings', title: 'nav.settings', body: 'more.settingsBody', tone: 'neutral' },
  { to: '/docs', icon: 'docs', title: 'nav.docs', body: 'docs.linkBody', tone: 'neutral' },
  { to: '/about', icon: 'info', title: 'about.link', body: 'about.linkBody', tone: 'neutral' },
];

export function MorePage() {
  const { t } = useI18n();
  return (
    <div className={styles.stack}>
      <PageHeader title={t('more.title')} />
      <ul className={[styles.list, styles.stackSm].join(' ')}>
        {LINKS.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className={[styles.cardLink, styles.moreLink].join(' ')}>
              <Coin icon={link.icon} tone={link.tone} />
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{t(link.title)}</span>
                <span className={styles.rowSub}>{t(link.body)}</span>
              </span>
              <Icon name="chevronRight" size={16} />
            </Link>
          </li>
        ))}
      </ul>
      <SocialLinks />
    </div>
  );
}
