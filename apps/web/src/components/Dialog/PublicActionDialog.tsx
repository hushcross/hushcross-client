import { useEffect, useId, useState, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Button } from '../Button/Button';
import { Dialog } from './Dialog';
import styles from './PublicActionDialog.module.css';

export interface PublicActionDialogProps {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** Plain statements of what becomes visible on-chain. */
  readonly reveals: readonly ReactNode[];
  readonly confirmLabel: ReactNode;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly busy?: boolean;
}

/** Danger-outlined second confirmation for anything that links an identity on-chain. */
export function PublicActionDialog({ open, title, description, reveals, confirmLabel, onConfirm, onClose, busy = false }: PublicActionDialogProps) {
  const { t } = useI18n();
  const [acknowledged, setAcknowledged] = useState(false);
  const descriptionId = useId();
  const checkId = useId();

  useEffect(() => {
    if (!open) setAcknowledged(false);
  }, [open]);

  return (
    <Dialog
      open={open}
      tone="danger"
      title={title}
      onClose={onClose}
      describedBy={descriptionId}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!acknowledged} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p id={descriptionId}>{description}</p>
      <div className={styles.reveals}>
        <p className={styles.revealsTitle}>{t('publicAction.reveals')}</p>
        <ul>
          {reveals.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
      <label className={styles.ack} htmlFor={checkId}>
        <input id={checkId} type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        <span>{t('publicAction.acknowledge')}</span>
      </label>
    </Dialog>
  );
}
