import { useEffect } from 'react';
import { Card } from '../../components/Card/Card';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Segmented } from '../../components/Segmented/Segmented';
import { I18nProvider, useI18n } from '../../i18n/I18nProvider';
import type { Locale, MessageKey } from '../../i18n/types';
import { ThemeProvider } from '../../theme/ThemeProvider';
import styles from '../page.module.css';
import local from './Privacy.module.css';

const SECTIONS = [
  { id: 'scope', paragraphs: ['p1', 'p2'] },
  { id: 'local', paragraphs: ['p1', 'p2', 'p3'] },
  { id: 'proofs', paragraphs: ['p1', 'p2'] },
  { id: 'network', paragraphs: ['p1', 'p2', 'p3'] },
  { id: 'links', paragraphs: ['p1', 'p2'] },
  { id: 'walletConnect', paragraphs: ['p1', 'p2', 'p3'] },
  { id: 'control', paragraphs: ['p1', 'p2', 'p3'] },
  { id: 'limits', paragraphs: ['p1', 'p2'] },
] as const;

export const PRIVACY_CONTACTS = {
  issues: 'https://github.com/hushcross/hushcross-protocol/issues',
  x: 'https://x.com/hushcross',
  website: 'https://hushcross.fun',
  email: 'mailto:support@hushcross.fun',
} as const;

/** Pure public content: no account, wallet, data-source or service initialization. */
export function PrivacyPage() {
  const { t, locale, setLocale } = useI18n();
  const title = t('privacyNotice.title');
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · HushCross`;
    return () => { document.title = previous; };
  }, [title]);
  const key = (section: typeof SECTIONS[number]['id'], leaf: string): MessageKey => `privacyNotice.sections.${section}.${leaf}` as MessageKey;
  return <div className={[styles.stack, local.page].join(' ')}>
    <PageHeader kicker="HushCross" title={title} subtitle={t('privacyNotice.subtitle')} actions={
      <Segmented<Locale> legend={t('settings.language')} value={locale} onChange={setLocale} size="sm" options={[
        { value: 'en', label: t('settings.languages.en') }, { value: 'zh', label: t('settings.languages.zh') },
      ]} />
    } />
    {SECTIONS.map(section => <Card key={section.id} title={t(key(section.id, 'title'))}>
      <div className={styles.stackSm}>{section.paragraphs.map(leaf => <p key={leaf}>{t(key(section.id, leaf))}</p>)}</div>
    </Card>)}
    <Card title={t('privacyNotice.sections.contact.title')}>
      <div className={styles.stackSm}>
        <p>{t('privacyNotice.sections.contact.p1')}</p>
        <div className={styles.actions}>
          {Object.entries(PRIVACY_CONTACTS).map(([name, href]) => <a key={name} href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t(`privacyNotice.sections.contact.${name}` as MessageKey)}</a>)}
        </div>
      </div>
    </Card>
  </div>;
}

function PublicPrivacyContent() {
  const { t } = useI18n();
  return <main className={local.publicPage}>
    <a href="/" className={local.back}>{t('privacyNotice.backToApp')}</a>
    <PrivacyPage />
  </main>;
}

/** Direct website access stays readable even when chain configuration or services fail. */
export function PublicPrivacyPage() {
  return <ThemeProvider><I18nProvider><PublicPrivacyContent /></I18nProvider></ThemeProvider>;
}
