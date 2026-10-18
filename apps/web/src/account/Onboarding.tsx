import { InstallEntry } from '../pwa/InstallEntry';
import { Link } from 'react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Input, TextArea } from '../components/Input/Input';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { Logo } from '../components/Logo/Logo';
import { Segmented } from '../components/Segmented/Segmented';
import { useI18n } from '../i18n/I18nProvider';
import { Illo } from '../illustrations/Illo';
import styles from '../pages/page.module.css';
import { AccountError, MIN_PASSWORD_LENGTH, type AccountManager, type Protection } from './AccountManager';
import local from './Onboarding.module.css';

type Step = 'welcome' | 'phrase' | 'verify' | 'import' | 'restore' | 'protect';
type Method = 'passkey' | 'password';

/** Pick `count` distinct word positions (1-based) with crypto randomness. */
export function pickVerifyPositions(count = 3, words = 24, random: (max: number) => number = cryptoInt): number[] {
  const chosen = new Set<number>();
  while (chosen.size < count) chosen.add(random(words) + 1);
  return [...chosen].sort((a, b) => a - b);
}

function cryptoInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    crypto.getRandomValues(buf);
    const value = buf[0] ?? 0;
    if (value < limit) return value % max;
  }
}

function errorKey(error: unknown): 'account.badPhrase' | 'account.wrongSecret' | 'account.passkeyUnavailable' | 'account.badBackup' | 'account.tooShort' {
  if (error instanceof AccountError) {
    if (error.code === 'bad_phrase') return 'account.badPhrase';
    if (error.code === 'passkey_unavailable') return 'account.passkeyUnavailable';
    if (error.code === 'bad_backup') return 'account.badBackup';
    if (error.code === 'bad_password') return 'account.tooShort';
  }
  return 'account.wrongSecret';
}

function ProtectStep({ manager, onDone, onBack }: { readonly manager: AccountManager; readonly onDone: (protection: Protection) => Promise<void>; readonly onBack: () => void }) {
  const { t } = useI18n();
  const [passkeyOk, setPasskeyOk] = useState(false);
  const [method, setMethod] = useState<Method>('password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void manager.passkeySupported().then((ok) => {
      if (!live) return;
      setPasskeyOk(ok);
      if (ok) setMethod('passkey');
    });
    return () => {
      live = false;
    };
  }, [manager]);

  const short = method === 'password' && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = method === 'password' && confirm.length > 0 && confirm !== password;
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (method === 'password' && (short || confirm !== password)) return;
    setBusy(true);
    setError(null);
    try {
      await onDone(method === 'passkey' ? { kind: 'passkey' } : { kind: 'password', password });
    } catch (failure: unknown) {
      setError(t(errorKey(failure), { n: MIN_PASSWORD_LENGTH }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('account.protectTitle')}>
      <form className={styles.form} onSubmit={submit}>
        <p className={styles.note}>{t('account.protectBody')}</p>
        <Segmented<Method>
          legend={t('account.protectTitle')}
          hideLegend
          value={method}
          onChange={setMethod}
          options={[
            { value: 'passkey', label: t('account.usePasskey'), disabled: !passkeyOk },
            { value: 'password', label: t('account.usePassword') },
          ]}
          caption={method === 'passkey' ? t('account.usePasskeyHint') : t('account.passwordHint', { n: MIN_PASSWORD_LENGTH })}
        />
        {method === 'password' ? (
          <>
            <Input label={t('account.password')} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={password.length > 0 && short ? t('account.tooShort', { n: MIN_PASSWORD_LENGTH }) : undefined} />
            <Input label={t('account.passwordConfirm')} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? t('account.mismatch') : undefined} />
          </>
        ) : null}
        {error ? <p className={styles.calloutDanger} role="alert">{error}</p> : null}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onBack}>{t('account.back')}</Button>
          <Button type="submit" loading={busy} disabled={method === 'password' && (short || confirm !== password)}>{t('account.finish')}</Button>
        </div>
      </form>
    </Card>
  );
}

/** Create (24 words + verify 3), import, or restore a backup, then choose passkey or password. */
export function Onboarding({ manager }: { readonly manager: AccountManager }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('welcome');
  const [phrase, setPhrase] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [verifyError, setVerifyError] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(false);
  const [backup, setBackup] = useState<string | null>(null);
  const [backupPass, setBackupPass] = useState('');
  const [source, setSource] = useState<'create' | 'import' | 'restore'>('create');
  const words = useMemo(() => phrase.split(' ').filter(Boolean), [phrase]);
  const positions = useMemo(() => (step === 'verify' ? pickVerifyPositions() : []), [step]);

  const startCreate = (): void => {
    setPhrase(manager.generatePhrase());
    setSource('create');
    setAnswers({});
    setStep('phrase');
  };

  const checkWords = (event: FormEvent): void => {
    event.preventDefault();
    const ok = positions.every((p) => (answers[p] ?? '').trim().toLowerCase() === words[p - 1]);
    setVerifyError(!ok);
    if (ok) setStep('protect');
  };

  const checkImport = (event: FormEvent): void => {
    event.preventDefault();
    const clean = importText.trim().toLowerCase().split(/\s+/u);
    if (clean.length !== 24) {
      setImportError(true);
      return;
    }
    setImportError(false);
    setPhrase(clean.join(' '));
    setSource('import');
    setStep('protect');
  };

  const finish = async (protection: Protection): Promise<void> => {
    if (source === 'restore' && backup !== null) await manager.restoreBackup(backup, backupPass, protection);
    else await manager.create(phrase, protection);
  };

  return (
    <div className={[styles.stack, local.wrap].join(' ')}>
      <div className={local.brand}><Logo /></div>
      <PageHeader title={t('account.welcomeTitle')} subtitle={t('account.welcomeBody')} />
      {step === 'welcome' ? (
        <Card>
          <div className={styles.stack}>
            <Button size="lg" block icon="key" onClick={startCreate}>{t('account.create')}</Button>
            <Button size="lg" block variant="secondary" onClick={() => setStep('import')}>{t('account.import')}</Button>
            <Button size="lg" block variant="ghost" onClick={() => setStep('restore')}>{t('account.restore')}</Button>
          </div>
        </Card>
      ) : null}
      {step === 'welcome' ? <InstallEntry variant="compact" /> : null}
      {step === 'welcome' ? <Link className={local.publicLink} to="/privacy">{t('privacyNotice.link')}</Link> : null}
      {step === 'phrase' ? (
        <Card title={t('account.phraseTitle')}>
          <div className={styles.stack}>
            <p className={styles.calloutDanger}>{t('account.phraseBody')}</p>
            <ol className={local.words} aria-label={t('account.phraseTitle')}>
              {words.map((word, i) => (
                <li key={`${i}-${word}`} className={local.word}>
                  <span className={local.index}>{i + 1}</span>
                  <span className={styles.mono}>{word}</span>
                </li>
              ))}
            </ol>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setStep('welcome')}>{t('account.back')}</Button>
              <Button onClick={() => setStep('verify')}>{t('account.phraseContinue')}</Button>
            </div>
          </div>
        </Card>
      ) : null}
      {step === 'verify' ? (
        <Card title={t('account.verifyTitle')}>
          <form className={styles.form} onSubmit={checkWords}>
            <p className={styles.note}>{t('account.verifyBody')}</p>
            {positions.map((p) => (
              <Input key={p} label={t('account.verifyWord', { n: p })} autoCapitalize="none" autoComplete="off" spellCheck={false} value={answers[p] ?? ''} onChange={(e) => setAnswers((prev) => ({ ...prev, [p]: e.target.value }))} />
            ))}
            {verifyError ? <p className={styles.calloutDanger} role="alert">{t('account.verifyError')}</p> : null}
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setStep('phrase')}>{t('account.back')}</Button>
              <Button type="submit">{t('account.verifyCta')}</Button>
            </div>
          </form>
        </Card>
      ) : null}
      {step === 'import' ? (
        <Card title={t('account.importTitle')}>
          <form className={styles.form} onSubmit={checkImport}>
            <TextArea label={t('account.importPhrase')} hint={t('account.importBody')} rows={4} autoCapitalize="none" autoComplete="off" spellCheck={false} value={importText} onChange={(e) => setImportText(e.target.value)} error={importError ? t('account.badPhrase') : undefined} />
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setStep('welcome')}>{t('account.back')}</Button>
              <Button type="submit">{t('account.verifyCta')}</Button>
            </div>
          </form>
        </Card>
      ) : null}
      {step === 'restore' ? (
        <Card title={t('account.restoreTitle')}>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (backup !== null) {
                setSource('restore');
                setStep('protect');
              }
            }}
          >
            <Illo name="recovery" size="sm" className={local.illo} />
            <p className={styles.note}>{t('account.restoreBody')}</p>
            <Input
              label={t('account.restoreFile')}
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(setBackup);
              }}
            />
            <Input label={t('account.restorePassphrase')} type="password" autoComplete="current-password" value={backupPass} onChange={(e) => setBackupPass(e.target.value)} />
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setStep('welcome')}>{t('account.back')}</Button>
              <Button type="submit" disabled={backup === null || backupPass.length === 0}>{t('account.verifyCta')}</Button>
            </div>
          </form>
        </Card>
      ) : null}
      {step === 'protect' ? <ProtectStep manager={manager} onDone={finish} onBack={() => setStep(source === 'create' ? 'verify' : source)} /> : null}
    </div>
  );
}

/** Unlock with the passkey or password that protects this device's vault. */
export function UnlockScreen({ manager }: { readonly manager: AccountManager }) {
  const { t } = useI18n();
  const kind = manager.envelopeKind();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure: unknown) {
      setError(t(errorKey(failure), { n: MIN_PASSWORD_LENGTH }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={[styles.stack, local.wrap].join(' ')}>
      <div className={local.brand}><Logo /></div>
      <PageHeader title={t('account.unlockTitle')} subtitle={t('account.unlockBody')} />
      <Card>
        <Illo name={kind === 'passkey' ? 'passkey' : 'vault'} size="sm" className={local.illo} />
        {kind === 'passkey' ? (
          <div className={styles.stack}>
            <Button size="lg" block icon="key" loading={busy} onClick={() => void run(() => manager.unlockWithPasskey())}>{t('account.unlockPasskey')}</Button>
            {error ? <p className={styles.calloutDanger} role="alert">{error}</p> : null}
          </div>
        ) : (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => manager.unlockWithPassword(password));
            }}
          >
            <Input label={t('account.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error ? <p className={styles.calloutDanger} role="alert">{error}</p> : null}
            <Button type="submit" size="lg" block loading={busy} disabled={password.length === 0}>{t('account.unlockPassword')}</Button>
          </form>
        )}
      </Card>
      <Link className={local.publicLink} to="/privacy">{t('privacyNotice.link')}</Link>
    </div>
  );
}
