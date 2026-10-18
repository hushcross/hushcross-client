import { Icon } from '../../components/Icon/Icon';
import type { SaleProfile } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import local from './SaleProfile.module.css';
import { profileLinks } from './profileLinks';

const LABEL = { website: 'saleProfile.linkWebsite', x: 'saleProfile.linkX', telegram: 'saleProfile.linkTelegram' } as const;

/** Creator-written description and links. Plain text only; links open in a new tab without referrer. */
export function SaleProfileView({ profile }: { readonly profile: SaleProfile }) {
  const { t } = useI18n();
  const links = profileLinks(profile);
  return (
    <div className={local.view}>
      {profile.description ? <p className={local.description}>{profile.description}</p> : null}
      {links.length > 0 ? (
        <ul className={local.links}>
          {links.map((link) => (
            <li key={link.kind}>
              <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className={local.link}>
                <Icon name={link.kind === 'website' ? 'globe' : 'external'} size={14} />
                <span className={local.linkLabel}>{t(LABEL[link.kind])}</span>
                <span className={local.linkText}>{link.text}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className={local.untrusted}>
        <Icon name="info" size={14} />
        {t('saleProfile.untrusted')}
      </p>
    </div>
  );
}
