import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import type { Recipient } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import styles from '../page.module.css';
import type { RecipientState } from './useRecipient';

export function recipientOf(state: RecipientState): Recipient | null {
  return state.status === 'done' && state.resolution.ok ? state.resolution.recipient : null;
}

export function RecipientField({ value, onChange, state }: { readonly value: string; readonly onChange: (v: string) => void; readonly state: RecipientState }) {
  const { t } = useI18n();
  const error = state.status === 'done' && !state.resolution.ok ? t(state.resolution.reason === 'not_found' ? 'send.form.notFound' : 'send.form.badFormat') : undefined;
  const recipient = recipientOf(state);
  const hint = state.status === 'checking' ? t('send.form.checking') : recipient ? undefined : t('send.form.recipientHint');
  return (
    <div className={styles.stackSm}>
      <Input label={t('send.form.recipient')} placeholder={t('send.form.recipientPlaceholder')} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} mono hint={hint} error={error} />
      {recipient ? (
        <p className={styles.note} role="status">
          <Icon name={recipient.kind === 'hushId' ? 'shield' : 'info'} size={14} />
          {recipient.kind === 'hushId' ? t('send.form.stealthNote', { id: recipient.hushId }) : t('send.form.addressNote')}
        </p>
      ) : null}
    </div>
  );
}
