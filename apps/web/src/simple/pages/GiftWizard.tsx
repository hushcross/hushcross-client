import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button/Button';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { Segmented } from '../../components/Segmented/Segmented';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import { isDataSourceError } from '../../data/DataSource';
import type { Asset } from '../../data/types';
import { parseAmount, UNIT_VALUES, formatAmount } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { giftDraft, planGift } from '../jobs/drafts';
import { useJobs } from '../jobs/JobsProvider';
import { AmountInput } from '../parts/AmountInput';
import { FundingNote, walletTopUp } from '../parts/FundingNote';
import { ReceiptHead, Summary } from '../parts/Summary';
import { previewValue, usePreview } from '../parts/usePreview';
import { handoffToJob } from '../parts/actions';
import { Wizard } from '../parts/Wizard';
import s from '../simple.module.css';

type Expiry = '24' | '72' | '168';

/** Red packet in two screens: amount, people and a note; then check and start. */
export function GiftWizard() {
  const { t } = useI18n();
  const fmt = useFormat();
  const ds = useDataSource();
  const jobs = useJobs();
  const navigate = useNavigate();
  const { show } = useToast();
  const [step, setStep] = useState(1);
  const [asset, setAsset] = useState<Asset>('USDT');
  const [amountText, setAmountText] = useState('');
  const [peopleText, setPeopleText] = useState('5');
  const [message, setMessage] = useState('');
  const [expiry, setExpiry] = useState<Expiry>('24');
  const [busy, setBusy] = useState(false);
  const config = useResource((source) => source.getVaultConfig(), []);
  const amount = parseAmount(amountText);
  const people = Number.parseInt(peopleText, 10);
  const peopleOk = Number.isInteger(people) && people >= 1 && people <= 50;
  const plan = amount !== null && peopleOk ? planGift(asset, amount, people) : null;
  const draft = amount !== null && peopleOk ? giftDraft({ asset, amount, people, message: message.trim().slice(0, 140), expiryHours: Number(expiry) }) : null;
  const feeBps = config.data?.vettingFeeBps ?? 30;
  const preview = usePreview(draft ? `${asset}:${draft.pieces.join(',')}` : null, async () => {
    if (!draft || !plan) throw new Error('no draft');
    const [quote, funding] = await Promise.all([
      ds.quoteSend({ recipient: { kind: 'address', address: '0x0000000000000000000000000000000000000001' }, asset, units: [UNIT_VALUES[asset][0] as bigint], relayDelayMinutes: 0, gasDrop: false }),
      jobs.plan(draft),
    ]);
    // Re-depositing the packets pays the screening fee again; the relay fee scales with the amount.
    const fee = (plan.total * BigInt(feeBps)) / 10_000n + (plan.total * BigInt(quote.relayFeeBps)) / 10_000n;
    return { fee, deposits: funding.deposits };
  });
  const value = previewValue(preview);
  const min = (UNIT_VALUES[asset][0] as bigint) * BigInt(peopleOk ? people : 1);
  const amountError = amount !== null && amount > 0n && !plan ? t('simple.gift.needMore', { n: peopleOk ? people : 1, min: fmt.amount(min, asset) }) : null;

  const start = async (): Promise<void> => {
    if (!draft) return;
    setBusy(true);
    try {
      const job = await jobs.start(draft);
      handoffToJob('gift', job.id);
      navigate(`/jobs/${encodeURIComponent(job.id)}`);
    } catch (error: unknown) {
      show({ tone: 'danger', title: t(`errors.${isDataSourceError(error) ? error.code : 'network'}`) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Wizard
      kind="gift"
      action={t('simple.gift.title')}
      title={step === 1 ? t('simple.gift.s1') : t('simple.gift.s2')}
      step={step}
      steps={2}
      onBack={step > 1 ? () => setStep(1) : null}
      footer={
        step === 1 ? (
          <Button size="lg" block disabled={!plan || !draft} onClick={() => setStep(2)} iconEnd="chevronRight">
            {t('simple.wizard.next')}
          </Button>
        ) : (
          <Button size="lg" block loading={busy} onClick={() => void start()} icon="gift">
            {t('simple.confirm.start')}
          </Button>
        )
      }
    >
      {step === 1 ? (
        <>
          <AmountInput label={t('simple.gift.total')} asset={asset} onAsset={setAsset} value={amountText} onChange={setAmountText} error={amountError} />
          <Input label={t('simple.gift.people')} inputMode="numeric" value={peopleText} onChange={(e) => setPeopleText(e.target.value.replace(/\D/g, '').slice(0, 2))} error={peopleText !== '' && !peopleOk ? t('simple.gift.peopleRange') : undefined} />
          {plan ? (
            <Summary
              rows={[
                { label: t('simple.gift.inPacket'), value: fmt.amount(plan.total, asset), strong: true },
                { label: t('simple.gift.each'), value: t('simple.gift.eachValue', { amount: fmt.amount(plan.total / BigInt(people), asset) }) },
                { label: t('simple.amount.fees'), value: value ? fmt.amount(value.fee, asset) : '…' },
                ...(plan.remainder > 0n ? [{ label: t('simple.amount.stays'), value: fmt.amount(plan.remainder, asset) }] : []),
              ]}
            />
          ) : null}
          <Input label={t('simple.gift.message')} hint={t('simple.gift.messageHint')} value={message} maxLength={140} onChange={(e) => setMessage(e.target.value)} />
          <Segmented<Expiry>
            legend={t('simple.gift.expiry')}
            value={expiry}
            onChange={setExpiry}
            size="sm"
            options={[
              { value: '24', label: t('simple.gift.expiry24') },
              { value: '72', label: t('simple.gift.expiry72') },
              { value: '168', label: t('simple.gift.expiry168') },
            ]}
          />
          {plan ? <FundingNote asset={asset} deposits={value?.deposits ?? null} feeBps={feeBps} /> : null}
        </>
      ) : null}
      {step === 2 && plan ? (
        <>
          <ReceiptHead amount={formatAmount(plan.total, { maxFraction: 6 })} unit={asset} caption={t('simple.gift.eachValue', { amount: fmt.amount(plan.total / BigInt(people), asset) })} />
          <Summary
            rows={[
              { label: t('simple.gift.people'), value: String(people) },
              { label: t('simple.amount.fees'), value: value ? fmt.amount(value.fee, asset) : '…' },
              ...(walletTopUp(value?.deposits ?? null, feeBps) > 0n ? [{ label: t('simple.confirm.wallet'), value: fmt.amount(walletTopUp(value?.deposits ?? null, feeBps), asset) }] : []),
              ...(message.trim() ? [{ label: t('simple.gift.message'), value: message.trim() }] : []),
            ]}
          />
          <p className={s.hintCalm}>
            <Icon name="link" size={16} />
            {t('simple.gift.howLinks')}
          </p>
          <p className={s.hint}>
            <Icon name="clock" size={16} />
            {t('simple.gift.returns', { time: t(`simple.gift.expiry${expiry}`) })}
          </p>
        </>
      ) : null}
    </Wizard>
  );
}
