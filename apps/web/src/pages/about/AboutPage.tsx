import { Card } from '../../components/Card/Card';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/types';
import styles from '../page.module.css';

const SECTIONS: readonly { readonly id: string; readonly paragraphs: readonly string[]; readonly list?: boolean }[] = [
  { id: 'what', paragraphs: ['p1', 'p2'] },
  { id: 'privacy', paragraphs: ['p1', 'p2', 'p3', 'p4'] },
  { id: 'fees', paragraphs: ['vault', 'relay', 'launch', 'book', 'give'], list: true },
  { id: 'risks', paragraphs: ['p1', 'p2', 'p3', 'p4', 'p5'] },
  { id: 'you', paragraphs: ['p1', 'p2', 'p3'] },
];

/** How it works and the risks, in plain words. Readable without an account. */
export function AboutPage() {
  const { t } = useI18n();
  const key = (section: string, leaf: string): MessageKey => `about.sections.${section}.${leaf}` as MessageKey;
  return (
    <div className={styles.stack}>
      <PageHeader title={t('about.title')} subtitle={t('about.subtitle')} />
      {SECTIONS.map((section) => (
        <Card key={section.id} title={t(key(section.id, 'title'))}>
          {section.list ? (
            <ul className={styles.stackSm}>
              {section.paragraphs.map((leaf) => (
                <li key={leaf}>{t(key(section.id, leaf))}</li>
              ))}
            </ul>
          ) : (
            <div className={styles.stackSm}>
              {section.paragraphs.map((leaf) => (
                <p key={leaf}>{t(key(section.id, leaf))}</p>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
