import { splitAmount } from '@hushcross/core';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button/Button';
import { Coin } from '../../components/Coin/Coin';
import { Icon } from '../../components/Icon/Icon';
import { Progress } from '../../components/Progress/Progress';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import { isDataSourceError } from '../../data/DataSource';
import { parseAmount, UNIT_VALUES } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { donateDraft } from '../jobs/drafts';
import { useJobs } from '../jobs/JobsProvider';
import { AmountInput } from '../parts/AmountInput';
import { FundingNote, walletTopUp } from '../parts/FundingNote';
import { AmountSummary, Summary } from '../parts/Summary';
import { previewValue, usePreview } from '../parts/usePreview';
import { handoffToJob } from '../parts/actions';
import { Wizard } from '../parts/Wizard';
import s from '../simple.module.css';

/** Donate in two screens: cause and amount, then check and start. */
export function DonateWizard() {
  const { t } = useI18n();
  const fmt = useFormat();
  const ds = useDataSource();
  const jobs = useJobs();
  const navigate = useNavigate();
  const { show } = useToast();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [campaignId, setCampaignId] = useState<string | null>(params.get('campaign'));
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const campaigns = useResource((source) => source.listCampaigns(), ['campaigns']);
  const config = useResource((source) => source.getVaultConfig(), []);
  const active = (campaigns.data ?? []).filter((c) => c.status === 'active');
  const campaign = active.find((c) => c.id === campaignId) ?? null;
  const asset = campaign?.asset ?? 'USDT';
  const amount = parseAmount(amountText);
  const split = useMemo(() => (amount === null ? null : splitAmount(amount, UNIT_VALUES[asset])), [amount, asset]);
  const pieces = split?.pieces ?? [];
  const draft = campaign && amount !== null ? donateDraft({ asset, amount, campaignId: campaign.id, title: campaign.title }) : null;
  const preview = usePreview(draft ? `${asset}:${pieces.join(',')}` : null, async () => {
    if (!draft) throw new Error('no draft');
    const [quote, plan] = await Promise.all([ds.quoteSend({ recipient: { kind: 'address', address: campaign?.escrowAddress ?? '0x0000000000000000000000000000000000000001' }, asset, units: pieces, relayDelayMinutes: 0, gasDrop: false }), jobs.plan(draft)]);
    return { fee: quote.relayFee, deposits: plan.deposits };
  });
  const value = previewValue(preview);
  const feeBps = config.data?.vettingFeeBps ?? 30;
  const amountError = amount !== null && amount > 0n && pieces.length === 0 ? t('simple.amount.tooSmall', { min: fmt.amount(UNIT_VALUES[asset][0] as bigint, asset) }) : null;

  const start = async (): Promise<void> => {
    if (!draft) return;
    setBusy(true);
    try {
      const job = await jobs.start(draft);
      handoffToJob('donate', job.id);
      navigate(`/jobs/${encodeURIComponent(job.id)}`);
    } catch (error: unknown) {
      show({ tone: 'danger', title: t(`errors.${isDataSourceError(error) ? error.code : 'network'}`) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Wizard
      kind="donate"
      action={t('simple.donate.title')}
      title={step === 1 ? t('simple.donate.s1') : t('simple.donate.s2')}
      step={step}
      steps={2}
      onBack={step > 1 ? () => setStep(1) : null}
      footer={
        step === 1 ? (
          <Button size="lg" block disabled={!draft || !!amountError} onClick={() => setStep(2)} iconEnd="chevronRight">
            {t('simple.wizard.next')}
          </Button>
        ) : (
          <Button size="lg" block loading={busy} onClick={() => void start()} icon="give">
            {t('simple.confirm.start')}
          </Button>
        )
      }
    >
      {step === 1 ? (
        <>
          {campaigns.status === 'loading' ? (
            <Skeleton lines={3} height={56} label={t('common.loading')} />
          ) : active.length === 0 ? (
            <p className={s.empty}>{t('simple.donate.none')}</p>
          ) : (
            <ul className={s.pickList} aria-label={t('simple.donate.pick')}>
              {active.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button type="button" className={s.pick} aria-pressed={c.id === campaignId} onClick={() => setCampaignId(c.id)}>
                    <Coin icon="give" tone="give" size="sm" />
                    <span className={s.pickMain}>
                      <span className={s.pickTitle}>{c.title}</span>
                      <span className={s.pickSub}>{t('simple.donate.raised', { amount: fmt.amount(c.raised, c.asset, 0), n: c.donationCount })}</span>
                      {c.goal !== null ? <Progress value={c.raised} max={c.goal > 0n ? c.goal : 1n} label={t('simple.donate.goal')} tone="ok" /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {campaign ? (
            <>
              <AmountInput label={t('simple.amount.label')} asset={asset} value={amountText} onChange={setAmountText} error={amountError} />
              {split && pieces.length > 0 ? <AmountSummary asset={asset} split={split} fee={value?.fee ?? null} /> : null}
              {pieces.length > 0 ? <FundingNote asset={asset} deposits={value?.deposits ?? null} feeBps={feeBps} /> : null}
            </>
          ) : null}
        </>
      ) : null}
      {step === 2 && campaign && split ? (
        <>
          <Summary
            rows={[
              { label: t('simple.donate.to'), value: campaign.title },
              { label: t('simple.confirm.amount'), value: fmt.amount(split.sent, asset), strong: true },
              { label: t('simple.amount.fees'), value: value ? fmt.amount(value.fee, asset) : '…' },
              ...(split.remainder > 0n ? [{ label: t('simple.confirm.stays'), value: fmt.amount(split.remainder, asset) }] : []),
              ...(walletTopUp(value?.deposits ?? null, feeBps) > 0n ? [{ label: t('simple.confirm.wallet'), value: fmt.amount(walletTopUp(value?.deposits ?? null, feeBps), asset) }] : []),
            ]}
          />
          <p className={s.hintCalm}>
            <Icon name="shield" size={16} />
            {t('simple.donate.private')}
          </p>
        </>
      ) : null}
    </Wizard>
  );
}
