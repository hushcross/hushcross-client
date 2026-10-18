import { appConfig } from '../../config';
import { useI18n } from '../../i18n/I18nProvider';
import { BrandIcon } from '../Brand/BrandIcon';
import styles from './SocialLinks.module.css';

export interface SocialLinksProps {
  /** `icon`: compact round buttons (rail footer). `labelled`: pills with names (pages). */
  readonly variant?: 'icon' | 'labelled';
  readonly githubUrl?: string;
  /** Empty: the X mark shows as a disabled "coming soon" control instead of a link. */
  readonly xUrl?: string;
  readonly className?: string;
}

/** GitHub and X. External links open in a new tab without an opener or referrer. */
export function SocialLinks({ variant = 'labelled', githubUrl = appConfig.githubUrl, xUrl = appConfig.xUrl, className }: SocialLinksProps) {
  const { t } = useI18n();
  const compact = variant === 'icon';
  const item = [styles.item, compact ? styles.icon : styles.pill].join(' ');
  const size = compact ? 18 : 16;
  return (
    <ul className={[styles.row, className].filter(Boolean).join(' ')} aria-label={t('social.label')}>
      <li>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={item} aria-label={compact ? t('social.github') : undefined} title={compact ? t('social.github') : undefined}>
          <BrandIcon name="github" size={size} />
          {compact ? null : <span>{t('social.github')}</span>}
        </a>
      </li>
      <li>
        {xUrl ? (
          <a href={xUrl} target="_blank" rel="noopener noreferrer" className={item} aria-label={compact ? t('social.x') : undefined} title={compact ? t('social.x') : undefined}>
            <BrandIcon name="x" size={compact ? 16 : 14} />
            {compact ? null : <span>{t('social.x')}</span>}
          </a>
        ) : (
          <button type="button" className={[item, styles.soon].join(' ')} aria-disabled="true" aria-label={t('social.xSoon')} data-tip={t('social.comingSoon')} onClick={(e) => e.preventDefault()}>
            <BrandIcon name="x" size={compact ? 16 : 14} />
            {compact ? null : (
              <>
                <span>{t('social.x')}</span>
                <span className={styles.soonText}>{t('social.comingSoon')}</span>
              </>
            )}
          </button>
        )}
      </li>
    </ul>
  );
}
