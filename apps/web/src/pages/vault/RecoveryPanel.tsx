import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { TextArea } from '../../components/Input/Input';
import { useDataSource } from '../../data/DataProvider';
import type { RecoveryResult } from '../../data/types';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import styles from '../page.module.css';
import local from './Vault.module.css';
import { SuccessCheck } from '../../components/SuccessCheck/SuccessCheck';

export function splitPhrase(text: string): string[] {
  return text.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function RecoveryPanel() {
  const { t } = useI18n();
  const ds = useDataSource();
  const [phrase, setPhrase] = useState('');
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const recover = useAction(ds.recoverFromPhrase.bind(ds));
  const words = splitPhrase(phrase);
  const ready = words.length === 24;

  const submit = async (): Promise<void> => {
    const outcome = await recover.run(words);
    if (outcome) setResult(outcome);
  };

  return (
    <div className={styles.split}>
      <Card title={t('recovery.title')}>
        <div className={styles.form}>
          <TextArea
            label={t('recovery.label')}
            hint={t('recovery.hint')}
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            rows={4}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={local.phrase}
          />
          <p className={local.wordCount} aria-live="polite">
            {t('recovery.count', { n: words.length })}
          </p>
          <Button onClick={submit} disabled={!ready} loading={recover.busy} icon="refresh">
            {t('recovery.cta')}
          </Button>
          {result ? (
            <div className={styles.callout} role="status">
              <SuccessCheck size={22} />
              <span>{t('recovery.result', { found: result.notesFound, scanned: result.scannedIndices })}</span>
            </div>
          ) : null}
        </div>
      </Card>
      <Card tone="subtle" title={t('recovery.howTitle')}>
        <ul className={styles.bullets}>
          <li>{t('recovery.how1')}</li>
          <li>{t('recovery.how2')}</li>
          <li>{t('recovery.how3')}</li>
        </ul>
      </Card>
    </div>
  );
}
