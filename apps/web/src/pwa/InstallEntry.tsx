import { IS_EXTENSION } from '../platform/runtime';
import { useState } from 'react';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Dialog } from '../components/Dialog/Dialog';
import { Icon, type IconName } from '../components/Icon/Icon';
import { useI18n } from '../i18n/I18nProvider';
import { useInstall } from './InstallProvider';
import styles from './Install.module.css';

export function InstallEntry({ variant = 'card' }: { readonly variant?: 'card' | 'compact' }) {
  return IS_EXTENSION ? null : <InstallEntryContent variant={variant} />;
}

function InstallEntryContent({ variant }: { readonly variant: 'card' | 'compact' }) {
  const { t } = useI18n();
  const install = useInstall();
  const [guide, setGuide] = useState(false);
  const ios = install.mode === 'ios';
  const installed = install.mode === 'installed';
  const action = async (): Promise<void> => {
    if (install.mode === 'prompt') await install.promptInstall();
    else setGuide(true);
  };
  const content = <>
    {variant === 'card' ? <p className={styles.body}>{t(installed ? 'pwa.installedBody' : 'pwa.installBody')}</p> : null}
    {installed ? <p className={styles.installed}><Icon name="check" />{t('pwa.installed')}</p> : <Button variant={variant === 'compact' ? 'ghost' : 'secondary'} size={variant === 'compact' ? 'sm' : 'md'} icon="download" loading={install.busy} onClick={() => void action()}>
      {t(install.mode === 'prompt' ? 'pwa.installAction' : 'pwa.installGuideAction')}
    </Button>}
    {!installed && install.result ? <p className={styles.feedback} role="status">{t(install.result === 'accepted' ? 'pwa.promptAccepted' : install.result === 'dismissed' ? 'pwa.promptDismissed' : 'pwa.promptFailed')}</p> : null}
    <Dialog open={guide} onClose={() => setGuide(false)} title={t(ios ? 'pwa.iosTitle' : 'pwa.manualTitle')} footer={<Button variant="secondary" onClick={() => setGuide(false)}>{t('common.close')}</Button>}>
      <p className={styles.body}>{t(ios ? 'pwa.iosBody' : 'pwa.manualBody')}</p>
      <ol className={styles.steps}>
        {(['first', 'second', 'third'] as const).map((part, index) => <li key={part}>
          <span className={styles.stepIcon} aria-hidden="true"><Icon name={(['globe', 'arrowUp', 'plus'] as IconName[])[index] ?? 'info'} /></span>
          <div><strong>{t(ios ? `pwa.iosSteps.${part}.title` : `pwa.manualSteps.${part}.title`)}</strong><p>{t(ios ? `pwa.iosSteps.${part}.body` : `pwa.manualSteps.${part}.body`)}</p></div>
        </li>)}
      </ol>
      <p className={styles.safety}>{t('pwa.backupReminder')}</p>
    </Dialog>
  </>;
  return variant === 'compact' ? <div className={styles.compact}>{content}</div>
    : <Card title={t('pwa.installTitle')} className={styles.installCard}>{content}</Card>;
}
