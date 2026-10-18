import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { Segmented } from '../../components/Segmented/Segmented';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { BackupFile, BackupProtection } from '../../data/types';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { Loaded } from '../shared/Loaded';
import styles from '../page.module.css';

function saveFile(file: BackupFile): void {
  const url = URL.createObjectURL(new Blob([file.contents], { type: file.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function BackupPanel() {
  const { t } = useI18n();
  const f = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const status = useResource((source) => source.getBackupStatus(), ['account']);
  const [protection, setProtection] = useState<BackupProtection>('passkey');
  const [passphrase, setPassphrase] = useState('');
  const exporter = useAction(ds.exportBackup.bind(ds));
  const tooShort = protection === 'passphrase' && passphrase.length < 12;

  const submit = async (): Promise<void> => {
    const file = await exporter.run(protection, protection === 'passphrase' ? passphrase : null);
    if (!file) return;
    saveFile(file);
    setPassphrase('');
    show({ tone: 'ok', title: t('backup.done'), body: file.fileName });
  };

  return (
    <div className={styles.split}>
      <Card title={t('backup.title')}>
        <Loaded resource={status}>
          {(s) => (
            <div className={styles.form}>
              <dl className={styles.kv}>
                <dt>{t('backup.local')}</dt>
                <dd>{t(`backup.protection.${s.protection}`)}</dd>
                <dt>{t('backup.last')}</dt>
                <dd>{s.lastExportAt === null ? t('backup.never') : f.date(s.lastExportAt)}</dd>
              </dl>
              <Segmented
                legend={t('backup.method')}
                value={protection}
                onChange={setProtection}
                options={[
                  { value: 'passkey', label: t('backup.protection.passkey'), disabled: !s.passkeySupported },
                  { value: 'passphrase', label: t('backup.protection.passphrase') },
                ]}
                caption={protection === 'passkey' ? t('backup.passkeyHint') : t('backup.passphraseHint')}
              />
              {protection === 'passphrase' ? (
                <Input
                  label={t('backup.passphrase')}
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  error={passphrase.length > 0 && tooShort ? t('backup.tooShort') : undefined}
                />
              ) : null}
              <Button icon="download" onClick={submit} loading={exporter.busy} disabled={tooShort}>
                {t('backup.cta')}
              </Button>
            </div>
          )}
        </Loaded>
      </Card>
      <Card tone="subtle" title={t('backup.whyTitle')}>
        <div className={styles.stackSm}>
          <p className={styles.note}>
            <Icon name="key" size={14} />
            {t('backup.why1')}
          </p>
          <p className={styles.note}>
            <Icon name="lock" size={14} />
            {t('backup.why2')}
          </p>
        </div>
      </Card>
    </div>
  );
}
