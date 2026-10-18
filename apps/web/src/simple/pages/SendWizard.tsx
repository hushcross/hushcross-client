import { splitAmount } from '@hushcross/core';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button/Button';
import { Coin } from '../../components/Coin/Coin';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { useDataSource, useResource } from '../../data/DataProvider';
import { isDataSourceError } from '../../data/DataSource';
import type { Asset, Recipient } from '../../data/types';
import { formatAmount, parseAmount, UNIT_VALUES } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../lib/preferences';
import { useFormat } from '../../lib/useFormat';
import { useRecipient } from '../../pages/send/useRecipient';
import { useToast } from '../../components/Toast/Toast';
import { sendDraft } from '../jobs/drafts';
import { useJobs } from '../jobs/JobsProvider';
import { AmountInput } from '../parts/AmountInput';
import { FundingNote, walletTopUp } from '../parts/FundingNote';
import { previewValue, usePreview } from '../parts/usePreview';
import { QrScanner, qrScanSupported } from '../parts/QrScanner';
import { parseRecipientInput } from '../parts/recipientInput';
import { AmountSummary, ReceiptHead, Summary } from '../parts/Summary';
import { handoffToJob } from '../parts/actions';
import { Wizard } from '../parts/Wizard';
import s from '../simple.module.css';

const PLACEHOLDER: Recipient = { kind: 'address', address: '0x0000000000000000000000000000000000000001' };

export function SendWizard() {
  const { t } = useI18n();
  const fmt = useFormat();
  const ds = useDataSource();
  const jobs = useJobs();
  const navigate = useNavigate();
  const { show } = useToast();
  const { preferences } = usePreferences();
  const [params] = useSearchParams();
  const prefill = parseRecipientInput(params.get('to') ?? '');
  const [step, setStep] = useState(1);
  const [asset, setAsset] = useState<Asset>(prefill.asset ?? 'USDT');
  const [amountText, setAmountText] = useState(prefill.amount !== null ? formatAmount(prefill.amount, { maxFraction: 18 }).replace(/,/g, '') : '');
  const [to, setTo] = useState(prefill.target);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const config = useResource((source) => source.getVaultConfig(), []);
  const balances = useResource((source) => source.getBalances(), ['balances']);
  const resolution = useRecipient(parseRecipientInput(to).target);
  const recipient = resolution.status === 'done' && resolution.resolution.ok ? resolution.resolution.recipient : null;

  const amount = parseAmount(amountText);
  const split = useMemo(() => (amount === null ? null : splitAmount(amount, UNIT_VALUES[asset])), [amount, asset]);
  const pieces = split?.pieces ?? [];
  const key = pieces.length > 0 ? `${asset}:${pieces.join(',')}` : null;
  const preview = usePreview(key, async () => {
    const [quote, plan] = await Promise.all([
      ds.quoteSend({ recipient: recipient ?? PLACEHOLDER, asset, units: pieces, relayDelayMinutes: preferences.relayDelayMinutes, gasDrop: false }),
      jobs.plan({ kind: 'send', asset, pieces, params: {} }),
    ]);
    return { quote, plan };
  });
  const value = previewValue(preview);
  const feeBps = config.data?.vettingFeeBps ?? 30;
  const smallest = UNIT_VALUES[asset][0] as bigint;
  const amountError = amount !== null && amount > 0n && pieces.length === 0 ? t('simple.amount.tooSmall', { min: fmt.amount(smallest, asset) }) : null;
  const canNext1 = pieces.length > 0 && !amountError;

  const start = async (): Promise<void> => {
    if (!recipient || amount === null) return;
    const label = recipient.kind === 'hushId' ? (recipient.hushId.startsWith('st:') || recipient.hushId.includes('…') ? recipient.hushId : `@${recipient.hushId}`) : `${recipient.address.slice(0, 6)}…${recipient.address.slice(-4)}`;
    const draft = sendDraft({ asset, amount, recipient, label, relayDelayMinutes: preferences.relayDelayMinutes, gasDrop: value?.quote.gasDropDefaultOn ?? false });
    if (!draft) return;
    setBusy(true);
    try {
      const job = await jobs.start(draft);
      handoffToJob('send', job.id);
      navigate(`/jobs/${encodeURIComponent(job.id)}`);
    } catch (error: unknown) {
      show({ tone: 'danger', title: t(`errors.${isDataSourceError(error) ? error.code : 'network'}`) });
    } finally {
      setBusy(false);
    }
  };

  const title = step === 1 ? t('simple.send.s1') : step === 2 ? t('simple.send.s2') : t('simple.send.s3');
  const footer =
    step === 1 ? (
      <Button size="lg" block disabled={!canNext1} onClick={() => setStep(2)} iconEnd="chevronRight">
        {t('simple.wizard.next')}
      </Button>
    ) : step === 2 ? (
      <Button size="lg" block disabled={!recipient} onClick={() => setStep(3)} iconEnd="chevronRight">
        {t('simple.wizard.next')}
      </Button>
    ) : (
      <Button size="lg" block loading={busy} onClick={() => void start()} icon="send">
        {t('simple.confirm.start')}
      </Button>
    );

  return (
    <Wizard kind="send" action={t('simple.send.title')} title={title} step={step} steps={3} onBack={step > 1 ? () => setStep(step - 1) : null} footer={footer}>
      {step === 1 ? (
        <>
          <AmountInput label={t('simple.amount.label')} asset={asset} onAsset={setAsset} value={amountText} onChange={setAmountText} error={amountError}>
            {balances.data ? (
              <p className={s.balances}>
                <span>
                  {t('simple.amount.inVault')} <strong>{fmt.amount(balances.data.vault[asset], asset)}</strong>
                </span>
                <span>
                  {t('simple.amount.inWallet')} <strong>{balances.data.publicWallet ? fmt.amount(balances.data.publicWallet[asset], asset) : t('simple.amount.noWallet')}</strong>
                </span>
              </p>
            ) : null}
          </AmountInput>
          {split && pieces.length > 0 ? <AmountSummary asset={asset} split={split} fee={value?.quote.relayFee ?? null} /> : null}
          {pieces.length > 0 ? <FundingNote asset={asset} deposits={value?.plan.deposits ?? null} feeBps={feeBps} /> : null}
        </>
      ) : null}
      {step === 2 ? (
        <>
          <Input
            label={t('simple.recipient.label')}
            placeholder={t('simple.recipient.placeholder')}
            hint={resolution.status === 'checking' ? t('simple.recipient.checking') : t('simple.recipient.hint')}
            error={resolution.status === 'done' && !resolution.resolution.ok ? t(resolution.resolution.reason === 'not_found' ? 'simple.recipient.notFound' : 'simple.recipient.badFormat') : undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            mono
          />
          <div className={s.inlineButtons}>
            {qrScanSupported() ? (
              <Button variant="secondary" size="sm" icon="qr" onClick={() => setScanning(true)}>
                {t('simple.recipient.scan')}
              </Button>
            ) : null}
            {typeof navigator !== 'undefined' && navigator.clipboard?.readText ? (
              <Button variant="secondary" size="sm" icon="link" onClick={() => void navigator.clipboard.readText().then((text) => applyInput(text)).catch(() => undefined)}>
                {t('simple.recipient.paste')}
              </Button>
            ) : null}
          </div>
          {recipient ? <WhoCard recipient={recipient} /> : null}
          <QrScanner
            open={scanning}
            onClose={() => setScanning(false)}
            onResult={(text) => {
              setScanning(false);
              applyInput(text);
            }}
          />
        </>
      ) : null}
      {step === 3 && recipient && split ? (
        <>
          <ReceiptHead
            amount={formatAmount(split.sent, { maxFraction: 6 })}
            unit={asset}
            caption={
              <>
                <span className={s.receiptTo}>{t('simple.confirm.to')}</span> <WhoInline recipient={recipient} />
              </>
            }
          />
          <Summary
            rows={[
              { label: t('simple.confirm.fees'), value: value ? fmt.amount(value.quote.relayFee, asset) : '…' },
              ...(split.remainder > 0n ? [{ label: t('simple.confirm.stays'), value: fmt.amount(split.remainder, asset) }] : []),
              ...(walletTopUp(value?.plan.deposits ?? null, feeBps) > 0n ? [{ label: t('simple.confirm.wallet'), value: fmt.amount(walletTopUp(value?.plan.deposits ?? null, feeBps), asset) }] : []),
              { label: t('simple.confirm.delay'), value: preferences.relayDelayMinutes > 0 ? t('simple.confirm.delayValue', { n: preferences.relayDelayMinutes }) : t('simple.confirm.noDelay') },
            ]}
          />
          <p className={s.hintCalm}>
            <Icon name="shield" size={16} />
            {t('simple.confirm.privacy')}
          </p>
        </>
      ) : null}
    </Wizard>
  );

  function applyInput(text: string): void {
    const parsed = parseRecipientInput(text);
    setTo(parsed.target);
    if (parsed.asset) setAsset(parsed.asset);
    if (parsed.amount !== null) setAmountText(formatAmount(parsed.amount, { maxFraction: 18 }).replace(/,/g, ''));
  }
}

function WhoCard({ recipient }: { readonly recipient: Recipient }) {
  const { t } = useI18n();
  return (
    <div className={s.who} role="status">
      <Coin icon={recipient.kind === 'hushId' ? 'shield' : 'user'} tone={recipient.kind === 'hushId' ? 'send' : 'neutral'} />
      <span className={s.whoMain}>
        <span className={s.whoName}>{recipient.kind === 'hushId' ? (recipient.hushId.includes('…') ? recipient.hushId : `@${recipient.hushId}`) : recipient.address}</span>
        <span className={s.whoNote}>{recipient.kind === 'hushId' ? t('simple.recipient.private') : t('simple.recipient.plain')}</span>
      </span>
    </div>
  );
}

function WhoInline({ recipient }: { readonly recipient: Recipient }) {
  return <span>{recipient.kind === 'hushId' ? (recipient.hushId.includes('…') ? recipient.hushId : `@${recipient.hushId}`) : `${recipient.address.slice(0, 8)}…${recipient.address.slice(-6)}`}</span>;
}
