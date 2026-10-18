import { useState } from 'react';
import { useAccount } from '../../account/AccountProvider';
import { Button } from '../../components/Button/Button';
import { Dialog } from '../../components/Dialog/Dialog';
import { Coin } from '../../components/Coin/Coin';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import { isDataSourceError } from '../../data/DataSource';
import type { BackupFile } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import s from '../simple.module.css';

const LATER_KEY = 'hushcross.backupLater';
const PHRASE_FLAG = 'phraseSavedAt';
const MIN_PASSPHRASE = 12;

function saveFile(file: BackupFile): void {
  const url = URL.createObjectURL(new Blob([file.contents], { type: file.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function laterThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(LATER_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Gentle, persistent backup prompt for accounts made without writing words down: an encrypted backup
 * file (opens with the same passkey or a password) and, optionally, the recovery phrase. "Later" hides
 * it for this session only; it disappears for good once a backup exists.
 */
export function BackupNudge() {
  const { t } = useI18n();
  const ds = useDataSource();
  const account = useAccount();
  const { show } = useToast();
  const status = useResource((source) => source.getBackupStatus(), ['account']);
  const [later, setLater] = useState(laterThisSession);
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const manager = account?.manager ?? null;
  const phraseSaved = manager !== null && typeof manager.meta(PHRASE_FLAG) === 'number';
  const done = status.data ? status.data.lastExportAt !== null || phraseSaved : true;
  if (done || later) return null;
  const passkey = status.data?.protection === 'passkey';

  const download = async (): Promise<void> => {
    setBusy(true);
    try {
      const file = await ds.exportBackup(passkey ? 'passkey' : 'passphrase', passkey ? null : passphrase);
      saveFile(file);
      show({ tone: 'ok', title: t('simple.backup.saved'), body: file.fileName });
      setOpen(false);
    } catch (error: unknown) {
      show({ tone: 'danger', title: t(`errors.${isDataSourceError(error) ? error.code : 'network'}`) });
    } finally {
      setBusy(false);
    }
  };

  const confirmPhrase = async (): Promise<void> => {
    if (!manager) return;
    await manager.update((secrets) => ({ ...secrets, meta: { ...secrets.meta, [PHRASE_FLAG]: Date.now() } }));
    setPhrase(null);
    setOpen(false);
    show({ tone: 'ok', title: t('simple.backup.phraseSaved') });
  };

  return (
    <>
      <div className={s.nudge} role="region" aria-label={t('simple.backup.title')}>
        <Coin icon="key" tone="accent" />
        <span className={s.nudgeMain}>
          <span className={s.nudgeTitle}>{t('simple.backup.title')}</span>
          <span className={s.nudgeBody}>{t('simple.backup.body')}</span>
        </span>
        <span className={s.nudgeActions}>
          <Button size="sm" onClick={() => setOpen(true)}>
            {t('simple.backup.action')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              try {
                window.sessionStorage.setItem(LATER_KEY, '1');
              } catch {
                /* session storage blocked: hide for this render only */
              }
              setLater(true);
            }}
          >
            {t('simple.backup.later')}
          </Button>
        </span>
      </div>
      <Dialog open={open} title={t('simple.backup.dialogTitle')} onClose={() => setOpen(false)}>
        <div className={s.section}>
          <p className={s.hint}>
            <Icon name="download" size={16} />
            {passkey ? t('simple.backup.fileHintPasskey') : t('simple.backup.fileHintPassword')}
          </p>
          {passkey ? null : (
            <Input label={t('simple.backup.passphrase')} type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} hint={t('simple.backup.passphraseHint', { n: MIN_PASSPHRASE })} />
          )}
          <Button icon="download" loading={busy} disabled={!passkey && passphrase.length < MIN_PASSPHRASE} onClick={() => void download()}>
            {t('simple.backup.download')}
          </Button>
          {manager ? (
            phrase === null ? (
              <Button variant="ghost" icon="eye" onClick={() => setPhrase(manager.current()?.secrets.phrase ?? null)}>
                {t('simple.backup.showPhrase')}
              </Button>
            ) : (
              <>
                <p className={s.hintWarn}>{t('simple.backup.phraseWarning')}</p>
                <ol className={s.words} aria-label={t('simple.backup.phraseLabel')}>
                  {phrase.split(' ').map((word, i) => (
                    <li key={`${i}-${word}`}>{word}</li>
                  ))}
                </ol>
                <Button variant="secondary" onClick={() => void confirmPhrase()}>
                  {t('simple.backup.phraseDone')}
                </Button>
              </>
            )
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
