import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button/Button';
import { Dialog } from '../components/Dialog/Dialog';
import { Input } from '../components/Input/Input';
import { useI18n } from '../i18n/I18nProvider';
import { IS_EXTENSION, MAX_APP_LINK_LENGTH, parseOfficialAppLink } from './runtime';
import styles from './ExtensionTools.module.css';

export function ExtensionTools() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);
  const close = (): void => { setInput(''); setInvalid(false); setOpen(false); };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const path = parseOfficialAppLink(input);
    if (!path) { setInvalid(true); return; }
    close();
    navigate(path, { replace: true });
  };
  if (!IS_EXTENSION) return null;
  return <>
    <aside className={styles.tools} aria-label={t('platform.toolsLabel')}>
      <Button variant="secondary" size="sm" icon="link" onClick={() => setOpen(true)}>{t('platform.openLink')}</Button>
    </aside>
    <Dialog open={open} onClose={close} title={t('platform.linkTitle')}>
      <form className={styles.form} onSubmit={submit} autoComplete="off">
        <p className={styles.body}>{t('platform.linkBody')}</p>
        <Input label={t('platform.linkLabel')} value={input} onChange={event => { setInput(event.target.value); setInvalid(false); }}
          autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={MAX_APP_LINK_LENGTH}
          placeholder={t('platform.linkPlaceholder')} error={invalid ? t('platform.linkInvalid') : undefined} />
        <p className={styles.hint}>{t('platform.secretHint')}</p>
        <div className={styles.actions}><Button variant="ghost" onClick={close}>{t('common.cancel')}</Button><Button type="submit" icon="link" disabled={!input.trim()}>{t('platform.openLocally')}</Button></div>
      </form>
    </Dialog>
  </>;
}
