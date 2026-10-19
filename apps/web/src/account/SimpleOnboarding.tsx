import { InstallEntry } from '../pwa/InstallEntry';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button/Button';
import { Input } from '../components/Input/Input';
import { motion } from 'framer-motion';
import { Icon } from '../components/Icon/Icon';
import { Logo } from '../components/Logo/Logo';
import { EASE_OUT } from '../motion/easing';
import { useReducedMotion } from '../motion/useReducedMotion';
import { WelcomeArt } from './WelcomeArt';
import w from './Welcome.module.css';
import { useI18n } from '../i18n/I18nProvider';
import s from '../simple/simple.module.css';
import { AccountError, MIN_PASSWORD_LENGTH, type AccountManager } from './AccountManager';
import { Onboarding } from './Onboarding';

type View = 'start' | 'password' | 'existing';

const rise = { hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } } };

/**
 * Simple-mode onboarding: one tap with a passkey (WebAuthn PRF), a password when the browser can't do
 * that, and no 24 words up front. The recovery phrase still exists and is offered later as a backup.
 */
export function SimpleOnboarding({ manager }: { readonly manager: AccountManager }) {
  const { t } = useI18n();
  const [view, setView] = useState<View>('start');
  const [passkeyOk, setPasskeyOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const reduced = useReducedMotion();

  useEffect(() => {
    let live = true;
    void manager.passkeySupported().then((ok) => {
      if (live) setPasskeyOk(ok);
    });
    return () => {
      live = false;
    };
  }, [manager]);

  if (view === 'existing') return <Onboarding manager={manager} />;

  const withPasskey = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await manager.create(manager.generatePhrase(), { kind: 'passkey' });
    } catch (failure: unknown) {
      // No PRF on this authenticator, or the prompt was dismissed: offer the password route.
      setError(failure instanceof AccountError && failure.code === 'passkey_unavailable' ? t('simple.onboarding.passkeyFailed') : t('account.wrongSecret'));
      setView('password');
    } finally {
      setBusy(false);
    }
  };

  const withPassword = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH || password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await manager.create(manager.generatePhrase(), { kind: 'password', password });
    } catch {
      setError(t('account.tooShort', { n: MIN_PASSWORD_LENGTH }));
    } finally {
      setBusy(false);
    }
  };

  const showPassword = view === 'password' || passkeyOk === false;
  return (
    <div className={w.screen}>
      <span className={w.brand}>
        <Logo />
      </span>
      <div className={w.layout}>
        <WelcomeArt password={showPassword} />
        <motion.div className={w.copy} initial={reduced ? false : 'hidden'} animate="shown" variants={{ shown: { transition: { staggerChildren: 0.08, delayChildren: 0.5 } } }}>
          <motion.span className={w.eyebrow} variants={rise}>
            {t('simple.onboarding.eyebrow')}
          </motion.span>
          <motion.h1 className={w.title} variants={rise}>
            {t('simple.onboarding.title')}
          </motion.h1>
          <motion.p className={w.body} variants={rise}>
            {t('simple.onboarding.body')}
          </motion.p>
          <motion.ul className={w.facts} variants={rise}>
            {(['device', 'words', 'backup'] as const).map((fact) => (
              <li key={fact}>
                <span className={w.factMark} aria-hidden="true">
                  <Icon name="check" size={12} />
                </span>
                {t(`simple.onboarding.facts.${fact}`)}
              </li>
            ))}
          </motion.ul>
          <motion.div variants={rise} className={[w.actionsWrap, showPassword ? '' : w.actionsSticky].join(' ')}>
            {showPassword ? (
              <form className={w.actions} onSubmit={(e) => void withPassword(e)}>
                {passkeyOk === false ? <p className={s.hintCalm}>{t('simple.onboarding.noPasskey')}</p> : null}
                {error ? (
                  <p className={s.hintWarn} role="alert">
                    {error}
                  </p>
                ) : null}
                <Input label={t('account.password')} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint={t('account.passwordHint', { n: MIN_PASSWORD_LENGTH })} error={password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? t('account.tooShort', { n: MIN_PASSWORD_LENGTH }) : undefined} />
                <Input label={t('account.passwordConfirm')} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirm.length > 0 && confirm !== password ? t('account.mismatch') : undefined} />
                <Button type="submit" size="lg" block loading={busy} disabled={password.length < MIN_PASSWORD_LENGTH || confirm !== password}>
                  {t('simple.onboarding.create')}
                </Button>
              </form>
            ) : (
              <div className={w.actions}>
                <Button size="lg" block icon="passkey" loading={busy || passkeyOk === null} onClick={() => void withPasskey()}>
                  {t('simple.onboarding.passkey')}
                </Button>
              </div>
            )}
            {/* One stable element for "I already have an account" across both branches. */}
            <div className={w.secondary}>
              {showPassword ? (
                passkeyOk ? (
                  <Button variant="ghost" size="sm" icon="passkey" onClick={() => setView('start')}>
                    {t('simple.onboarding.backToPasskey')}
                  </Button>
                ) : null
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setView('password')}>
                  {t('simple.onboarding.usePassword')}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setView('existing')}>
                {t('simple.onboarding.existing')}
              </Button>
              <Link to="/" className={w.fineLink}>{t('account.guestContinue')}</Link>
            </div>
          </motion.div>
          {view === 'start' && !busy && !showPassword ? <InstallEntry variant="compact" /> : null}
          <motion.p className={w.fine} variants={rise}>
            {t('simple.onboarding.fine')}
            {' '}
            <Link to="/about" className={w.fineLink}>
              {t('about.link')}
            </Link>
            {' \u00b7 '}
            <Link to="/docs" className={w.fineLink}>
              {t('nav.docs')}
            </Link>
            {' \u00b7 '}
            <Link to="/privacy" className={w.fineLink}>
              {t('privacyNotice.link')}
            </Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
