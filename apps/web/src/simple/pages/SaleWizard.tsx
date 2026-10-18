import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button/Button';
import { Countdown } from '../../components/Countdown/Countdown';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import { isDataSourceError } from '../../data/DataSource';
import type { Sale } from '../../data/types';
import { formatAmount, parseAmount, WAD } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { formatPrice } from '../../lib/numberFormat';
import { useFormat } from '../../lib/useFormat';
import { saleDraft } from '../jobs/drafts';
import { useJobs } from '../jobs/JobsProvider';
import { AmountInput } from '../parts/AmountInput';
import { FundingNote, walletTopUp } from '../parts/FundingNote';
import { Summary } from '../parts/Summary';
import { previewValue, usePreview } from '../parts/usePreview';
import { handoffToJob } from '../parts/actions';
import { Wizard } from '../parts/Wizard';
import { SaleAvatar } from '../../pages/launch/SaleAvatar';
import s from '../simple.module.css';

/**
 * Join a sale in three screens. The bid is funded from the vault, sealed, opened by the relay when
 * bidding closes, and claimed by the relay after the result: no public wallet appears.
 */
export function SaleWizard() {
  const { t } = useI18n();
  const fmt = useFormat();
  const ds = useDataSource();
  const jobs = useJobs();
  const navigate = useNavigate();
  const { show } = useToast();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [saleId, setSaleId] = useState<string | null>(params.get('sale'));
  const [priceText, setPriceText] = useState('');
  const [spendText, setSpendText] = useState('');
  const [busy, setBusy] = useState(false);
  const sales = useResource((source) => source.listSales(), ['sales']);
  const config = useResource((source) => source.getVaultConfig(), []);
  const open = (sales.data ?? []).filter((x) => x.phase === 'commit');
  const sale: Sale | null = open.find((x) => x.id === saleId) ?? null;
  const price = parseAmount(priceText);
  const spend = parseAmount(spendText);
  const priceError = sale && priceText !== '' && (price === null || price < sale.floorPrice) ? t('simple.sale.priceLow', { floor: formatPrice(sale.floorPrice) }) : null;
  const valid = sale !== null && price !== null && price >= sale.floorPrice && spend !== null && spend > 0n;
  const preview = usePreview(valid && sale ? `${sale.id}:${spend?.toString()}:${price?.toString()}` : null, async () => {
    if (!sale || spend === null || price === null) throw new Error('incomplete');
    const quote = await ds.quoteBid(sale.id, spend);
    const draft = saleDraft({ asset: sale.quoteAsset, saleId: sale.id, symbol: sale.tokenSymbol, price, maxSpend: spend, escrow: quote.escrow, withdrawn: quote.withdrawn });
    const plan = draft ? await jobs.plan(draft) : null;
    return { quote, draft, plan };
  });
  const value = previewValue(preview);
  const feeBps = config.data?.vettingFeeBps ?? 30;
  const tooBig = value !== null && value.draft === null;

  const start = async (): Promise<void> => {
    if (!value?.draft) return;
    setBusy(true);
    try {
      const job = await jobs.start(value.draft);
      handoffToJob('sale', job.id);
      navigate(`/jobs/${encodeURIComponent(job.id)}`);
    } catch (error: unknown) {
      show({ tone: 'danger', title: t(`errors.${isDataSourceError(error) ? error.code : 'network'}`) });
    } finally {
      setBusy(false);
    }
  };

  const title = step === 1 ? t('simple.sale.s1') : step === 2 ? t('simple.sale.s2') : t('simple.sale.s3');
  const footer =
    step === 1 ? (
      <Button size="lg" block disabled={!sale} onClick={() => setStep(2)} iconEnd="chevronRight">
        {t('simple.wizard.next')}
      </Button>
    ) : step === 2 ? (
      <Button size="lg" block disabled={!valid || !value?.draft} onClick={() => setStep(3)} iconEnd="chevronRight">
        {t('simple.wizard.next')}
      </Button>
    ) : (
      <Button size="lg" block loading={busy} onClick={() => void start()} icon="seal">
        {t('simple.sale.start')}
      </Button>
    );

  return (
    <Wizard kind="sale" action={t('simple.sale.title')} title={title} step={step} steps={3} onBack={step > 1 ? () => setStep(step - 1) : null} footer={footer}>
      {step === 1 ? (
        sales.status === 'loading' ? (
          <Skeleton lines={3} height={56} label={t('common.loading')} />
        ) : open.length === 0 ? (
          <p className={s.empty}>{t('simple.sale.none')}</p>
        ) : (
          <ul className={s.pickList}>
            {open.map((x) => (
              <li key={x.id}>
                <button type="button" className={s.pick} aria-pressed={x.id === saleId} onClick={() => setSaleId(x.id)}>
                  <SaleAvatar sale={x.address} symbol={x.tokenSymbol} size="sm" />
                  <span className={s.pickMain}>
                    <span className={s.pickTitle}>
                      {x.tokenName} · {x.tokenSymbol}
                    </span>
                    <span className={s.pickSub}>
                      {t('simple.sale.floor', { price: `${formatPrice(x.floorPrice)} ${x.quoteAsset}` })} · {t('simple.sale.bids', { n: x.bidCount })}
                    </span>
                  </span>
                  <Countdown target={x.commitEnd} onElapsed={sales.reload} />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {step === 2 && sale ? (
        <>
          <Input
            label={t('simple.sale.price', { asset: sale.quoteAsset })}
            inputMode="decimal"
            mono
            value={priceText}
            onChange={(e) => setPriceText(e.target.value.replace(',', '.'))}
            placeholder={formatAmount(sale.floorPrice, { maxFraction: 12 })}
            hint={t('simple.sale.priceHint', { floor: `${formatPrice(sale.floorPrice)} ${sale.quoteAsset}` })}
            error={priceError ?? undefined}
            suffix={sale.quoteAsset}
          />
          <AmountInput label={t('simple.sale.spend')} asset={sale.quoteAsset} value={spendText} onChange={setSpendText} error={tooBig ? t('simple.sale.tooBig') : null} />
          {valid && value ? (
            <Summary
              rows={[
                { label: t('simple.sale.upTo'), value: price ? t('simple.sale.tokens', { n: formatAmount(((spend ?? 0n) * WAD) / price, { maxFraction: 2 }), symbol: sale.tokenSymbol }) : '…', strong: true },
                { label: t('simple.sale.deposit'), value: fmt.amount(value.quote.escrow, sale.quoteAsset) },
                { label: t('simple.amount.fees'), value: fmt.amount(value.quote.relayFee, sale.quoteAsset) },
              ]}
            />
          ) : null}
          {valid && value?.plan ? <FundingNote asset={sale.quoteAsset} deposits={value.plan.deposits} feeBps={feeBps} /> : null}
        </>
      ) : null}
      {step === 3 && sale && value?.draft && price !== null && spend !== null ? (
        <>
          <Summary
            rows={[
              { label: t('simple.sale.sale'), value: `${sale.tokenName} · ${sale.tokenSymbol}` },
              { label: t('simple.sale.yourPrice'), value: `${formatPrice(price)} ${sale.quoteAsset}` },
              { label: t('simple.sale.spend'), value: fmt.amount(spend, sale.quoteAsset), strong: true },
              { label: t('simple.sale.deposit'), value: fmt.amount(value.quote.escrow, sale.quoteAsset) },
              { label: t('simple.amount.fees'), value: fmt.amount(value.quote.relayFee, sale.quoteAsset) },
              ...(walletTopUp(value.plan?.deposits ?? null, feeBps) > 0n ? [{ label: t('simple.confirm.wallet'), value: fmt.amount(walletTopUp(value.plan?.deposits ?? null, feeBps), sale.quoteAsset) }] : []),
            ]}
          />
          <p className={s.hintCalm}>
            <Icon name="seal" size={16} />
            {t('simple.sale.auto')}
          </p>
          <p className={s.hint}>
            <Icon name="info" size={16} />
            {t('simple.sale.samePrice')}
          </p>
        </>
      ) : null}
    </Wizard>
  );
}
