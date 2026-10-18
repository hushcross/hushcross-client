import { useState, useSyncExternalStore } from 'react';
import { Button } from '../components/Button/Button';
import { Dialog } from '../components/Dialog/Dialog';
import { Icon } from '../components/Icon/Icon';
import { useI18n } from '../i18n/I18nProvider';
import { applyPwaUpdate, getPwaUpdateSnapshot, subscribePwaUpdate } from './serviceWorkerClient';
import styles from './Install.module.css';

/** Never applies an update merely because a worker becomes ready. */
export function UpdateNotice() {
  const { t } = useI18n();
  const state = useSyncExternalStore(subscribePwaUpdate, getPwaUpdateSnapshot, () => 'idle' as const);
  const [open, setOpen] = useState(false);
  const [later, setLater] = useState(false);
  if (state === 'idle' || (later && state === 'ready')) return null;
  return <>
    <aside className={styles.update} aria-label={t('pwa.updateTitle')}>
      <Icon name="refresh" />
      <p role="status">{t(state === 'error' ? 'pwa.updateFailed' : state === 'applying' ? 'pwa.updateApplying' : 'pwa.updateReady')}</p>
      {state === 'ready' ? <div className={styles.updateActions}>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{t('pwa.updateReview')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setLater(true)}>{t('pwa.updateLater')}</Button>
      </div> : null}
    </aside>
    <Dialog open={open && state === 'ready'} onClose={() => setOpen(false)} title={t('pwa.updateTitle')} footer={<>
      <Button variant="ghost" onClick={() => setOpen(false)}>{t('pwa.updateLater')}</Button>
      <Button icon="refresh" onClick={() => { setOpen(false); applyPwaUpdate(); }}>{t('pwa.updateConfirm')}</Button>
    </>}>
      <p className={styles.body}>{t('pwa.updateWarning')}</p>
      <p className={styles.safety}>{t('pwa.backupReminder')}</p>
    </Dialog>
  </>;
}
