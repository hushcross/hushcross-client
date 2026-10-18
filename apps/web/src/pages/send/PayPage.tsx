import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { PrivacyCheck } from '../../components/PrivacyCheck/PrivacyCheck';
import { usePrivacyCheck } from '../../hooks/usePrivacyCheck';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Asset } from '../../data/types';
import { formatAmount, parseAmount, UNIT_VALUES } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../lib/preferences';
import { Loaded } from '../shared/Loaded';
import styles from '../page.module.css';
import local from './Send.module.css';
import { SuccessCheck } from '../../components/SuccessCheck/SuccessCheck';
import { Switch } from '../../components/Switch/Switch';

export function PayPage() {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const { preferences } = usePreferences();
  const { hushId = '' } = useParams();
  const [params] = useSearchParams();
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [paid, setPaid] = useState(false);
  const asset: Asset = params.get('asset') === 'BNB' ? 'BNB' : 'USDT';
  const unit = parseAmount(params.get('units') ?? '');
  const count = Math.min(20, Math.max(1, Number(params.get('count') ?? '1') || 1));
  const validUnit = unit !== null && UNIT_VALUES[asset].includes(unit) ? unit : null;
  const resolution = useResource((source) => source.resolveRecipient(hushId), [], [hushId]);
  const balances = useResource((source) => source.getBalances(), ['balances']);
  const sender = useAction(ds.send.bind(ds));
  const publicPay = useAction(ds.payFromWallet.bind(ds));
  const recipientOk = resolution.data?.ok === true ? resolution.data.recipient : null;
  const quote = useResource(
    (source) => (validUnit !== null && recipientOk ? source.quoteSend({ recipient: recipientOk, asset, units: Array.from({ length: count }, () => validUnit), relayDelayMinutes: preferences.relayDelayMinutes, gasDrop: false }) : Promise.resolve(null)),
    [],
    [validUnit?.toString(), recipientOk ? JSON.stringify(recipientOk) : '', asset, count],
  );
  const [gasDropChoice, setGasDropChoice] = useState<boolean | null>(null);
  const gasDrop = quote.data?.gasDropOffered ? (gasDropChoice ?? quote.data.gasDropDefaultOn) : false;
  const privacy = usePrivacyCheck(
    validUnit !== null && recipientOk && !paid
      ? { action: 'send', asset, units: Array.from({ length: count }, () => validUnit), recipientAddress: recipientOk.kind === 'address' ? recipientOk.address : null, relayDelayMinutes: preferences.relayDelayMinutes }
      : null,
  );

  return (
    <div className={styles.stack}>
      <PageHeader title={t('pay.title', { id: hushId })} subtitle={t('pay.subtitle')} back={{ to: '/send', label: t('nav.send') }} />
      <Loaded resource={resolution}>
        {(r) => {
          if (!r.ok) return <EmptyState icon="alert" illo="attention" title={t('pay.unknown')} />;
          const recipient = r.recipient;
          const amount = validUnit === null ? null : validUnit * BigInt(count);
          const payVault = async (): Promise<void> => {
            if (validUnit === null) return;
            const job = await sender.run({ recipient, asset, units: Array.from({ length: count }, () => validUnit), relayDelayMinutes: preferences.relayDelayMinutes, gasDrop });
            if (job) {
              setPaid(true);
              show({ tone: 'ok', title: t('pay.queued') });
            }
          };
          const payPublic = async (): Promise<void> => {
            if (amount === null) return;
            const result = await publicPay.run({ recipient, asset, amount });
            setConfirmPublic(false);
            if (result) {
              setPaid(true);
              show({ tone: 'warn', title: t('pay.publicDone') });
            }
          };
          return (
            <Card padding="lg">
              <div className={styles.stack}>
                {amount === null ? <p className={styles.note}>{t('pay.noAmount')}</p> : <span className={local.payAmount}>{formatAmount(amount)} {asset}</span>}
                {paid ? (
                  <p className={styles.callout} role="status">
                    <SuccessCheck size={22} />
                    <span>{t('pay.thanks')}</span>
                  </p>
                ) : (
                  <>
                    <PrivacyCheck state={privacy} />
                    {quote.data?.gasDropOffered ? <Switch checked={gasDrop} onChange={setGasDropChoice} label={t('send.form.gasDrop')} description={t('settings.gasDropHint')} /> : null}
                    {quote.data?.gasDropNote ? <p className={styles.note}>{t(`send.gasDrop.note.${quote.data.gasDropNote}`)}</p> : null}
                    <Loaded resource={balances}>{(b) => <p className={styles.note}>{t('send.form.vaultAvailable', { amount: formatAmount(b.vault[asset]), asset })}</p>}</Loaded>
                    <div className={styles.actions}>
                      <Button size="lg" icon="lock" onClick={payVault} loading={sender.busy} disabled={amount === null}>
                        {t('pay.fromVault')}
                      </Button>
                      <Button size="lg" variant="danger" onClick={() => setConfirmPublic(true)} disabled={amount === null}>
                        {t('pay.fromWallet')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
              <PublicActionDialog
                open={confirmPublic}
                title={t('pay.publicTitle')}
                description={t('pay.publicBody')}
                reveals={[t('pay.publicReveal1'), t('pay.publicReveal2')]}
                confirmLabel={t('pay.publicConfirm')}
                busy={publicPay.busy}
                onClose={() => setConfirmPublic(false)}
                onConfirm={payPublic}
              />
            </Card>
          );
        }}
      </Loaded>
    </div>
  );
}
