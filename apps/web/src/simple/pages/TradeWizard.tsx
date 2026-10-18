import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button/Button';
import { Coin } from '../../components/Coin/Coin';
import { Countdown } from '../../components/Countdown/Countdown';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Switch } from '../../components/Switch/Switch';
import { useToast } from '../../components/Toast/Toast';
import { orderDraft } from '../../data/bookJobs';
import { useDataSource, useResource } from '../../data/DataProvider';
import { isDataSourceError } from '../../data/DataSource';
import type { OrderSide, Pair } from '../../data/types';
import { formatAmount, parseAmount, quoteValue } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { formatPrice } from '../../lib/numberFormat';
import { useFormat } from '../../lib/useFormat';
import { useJobs } from '../jobs/JobsProvider';
import { FundingNote, walletTopUp } from '../parts/FundingNote';
import { Summary } from '../parts/Summary';
import { previewValue, usePreview } from '../parts/usePreview';
import { handoffToJob } from '../parts/actions';
import { Wizard } from '../parts/Wizard';
import { bandOf, cannotFill, presetPrices, snapDown, type PricePreset } from './tradeMath';
import s from '../simple.module.css';

const FEE_BPS = 5n;

/**
 * Trade in the dark pool in three screens. The order is funded from the vault, sealed for this
 * batch, opened by the relay when the batch closes, and settled for you: no public wallet appears.
 */
export function TradeWizard() {
  const { t } = useI18n();
  const fmt = useFormat();
  const ds = useDataSource();
  const jobs = useJobs();
  const navigate = useNavigate();
  const { show } = useToast();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [pairId, setPairId] = useState<string | null>(params.get('pair'));
  const [side, setSide] = useState<OrderSide>(params.get('side') === 'sell' ? 'sell' : 'buy');
  const [preset, setPreset] = useState<PricePreset>('near');
  const [priceText, setPriceText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [rollover, setRollover] = useState(true);
  const [busy, setBusy] = useState(false);
  const pairs = useResource((source) => source.listPairs(), ['orders']);
  const config = useResource((source) => source.getVaultConfig(), []);
  const epoch = useResource((source) => (pairId ? source.getEpoch(pairId) : Promise.resolve(null)), ['orders'], [pairId ?? '']);
  const list = (pairs.data ?? []).filter((p) => p.referencePrice > 0n);
  const pair: Pair | null = list.find((p) => p.id === pairId) ?? null;
  const canSell = pair?.vaultSell === true;
  const effectiveSide: OrderSide = canSell ? side : 'buy';

  const presets = pair ? presetPrices(pair, effectiveSide) : null;
  const customPrice = parseAmount(priceText);
  const price = preset === 'custom' ? (customPrice !== null && pair ? snapDown(customPrice, pair.tick) : null) : presets?.[preset] ?? null;
  const rawAmount = parseAmount(amountText);
  const amount = rawAmount !== null && pair ? snapDown(rawAmount, pair.lot) : null;
  const band = pair ? bandOf(pair) : null;
  const outside = pair !== null && price !== null && cannotFill(pair, effectiveSide, price);
  const tooSmall = rawAmount !== null && rawAmount > 0n && amount === 0n;
  const valid = pair !== null && price !== null && price > 0n && !outside && amount !== null && amount > 0n;
  const notional = valid && amount !== null && price !== null ? quoteValue(amount, price) : null;

  const preview = usePreview(valid && pair ? `${pair.id}:${effectiveSide}:${price?.toString()}:${amount?.toString()}:${rollover}` : null, async () => {
    if (!pair || price === null || amount === null) throw new Error('incomplete');
    const request = { pairId: pair.id, side: effectiveSide, limitPrice: price, amount, rollover, funding: 'vault' as const };
    const quote = await ds.quoteOrder(request);
    const asset = quote.fundingAsset;
    const draft = asset ? orderDraft({ asset, pairId: pair.id, symbol: pair.base, side: effectiveSide, limitPrice: price, amount, withdrawn: quote.withdrawn, rollover }) : null;
    const plan = draft ? await jobs.plan(draft) : null;
    return { quote, draft, plan, asset };
  });
  const value = previewValue(preview);
  const feeBps = config.data?.vettingFeeBps ?? 30;
  const tooBig = value !== null && value.draft === null;
  const payAsset = value?.asset ?? (effectiveSide === 'buy' ? 'USDT' : 'BNB');

  const start = async (): Promise<void> => {
    if (!value?.draft) return;
    setBusy(true);
    try {
      const job = await jobs.start(value.draft);
      handoffToJob('trade', job.id);
      navigate(`/jobs/${encodeURIComponent(job.id)}`);
    } catch (error: unknown) {
      show({ tone: 'danger', title: t(`errors.${isDataSourceError(error) ? error.code : 'network'}`) });
    } finally {
      setBusy(false);
    }
  };

  const title = step === 1 ? t('simpleTrade.s1') : step === 2 ? t('simpleTrade.s2') : t('simpleTrade.s3');
  const footer =
    step === 1 ? (
      <Button size="lg" block disabled={!pair} onClick={() => setStep(2)} iconEnd="chevronRight">
        {t('simple.wizard.next')}
      </Button>
    ) : step === 2 ? (
      <Button size="lg" block disabled={!valid || !value?.draft} onClick={() => setStep(3)} iconEnd="chevronRight">
        {t('simple.wizard.next')}
      </Button>
    ) : (
      <Button size="lg" block loading={busy} onClick={() => void start()} icon="seal">
        {t('simpleTrade.start')}
      </Button>
    );

  const sideLabel = effectiveSide === 'buy' ? t('simpleTrade.buy', { base: pair?.base ?? '' }) : t('simpleTrade.sell', { base: pair?.base ?? '' });

  return (
    <Wizard kind="trade" action={t('simpleTrade.title')} title={title} step={step} steps={3} onBack={step > 1 ? () => setStep(step - 1) : null} footer={footer}>
      {step === 1 ? (
        <>
          {pairs.status === 'loading' ? (
            <Skeleton lines={3} height={56} label={t('common.loading')} />
          ) : list.length === 0 ? (
            <p className={s.empty}>{t('simpleTrade.none')}</p>
          ) : (
            <ul className={s.pickList}>
              {list.map((p) => (
                <li key={p.id}>
                  <button type="button" className={s.pick} aria-pressed={p.id === pairId} onClick={() => setPairId(p.id)} data-pair={p.id}>
                    <Coin icon="book" tone="book" size="sm" />
                    <span className={s.pickMain}>
                      <span className={s.pickTitle}>
                        {p.base} / {p.quote}
                      </span>
                      <span className={s.pickSub}>
                        {t('simpleTrade.reference', { price: `${formatPrice(p.referencePrice)} ${p.quote}` })}
                        {p.lastClearingPrice !== null ? ` · ${t('simpleTrade.last', { price: formatPrice(p.lastClearingPrice) })}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pair ? (
            <Segmented
              legend={t('simpleTrade.side')}
              value={effectiveSide}
              onChange={setSide}
              options={[
                { value: 'buy', label: t('simpleTrade.buy', { base: pair.base }) },
                { value: 'sell', label: t('simpleTrade.sell', { base: pair.base }), disabled: !canSell },
              ]}
              caption={canSell ? undefined : t('simpleTrade.sellPro', { base: pair.base })}
            />
          ) : null}
          {pair && epoch.data ? (
            <p className={s.hintCalm}>
              <Icon name="clock" size={16} />
              <span>
                {epoch.data.phase === 'commit' ? t('simpleTrade.batchOpen') : t('simpleTrade.batchReveal')} <Countdown target={epoch.data.phase === 'commit' ? epoch.data.commitEndsAt : epoch.data.revealEndsAt} onElapsed={epoch.reload} />
              </span>
            </p>
          ) : null}
        </>
      ) : null}
      {step === 2 && pair && presets && band ? (
        <>
          <Input
            label={t('simpleTrade.amount', { base: pair.base })}
            inputMode="decimal"
            mono
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(',', '.'))}
            suffix={pair.base}
            hint={t('simpleTrade.lot', { lot: formatAmount(pair.lot, { maxFraction: 12 }), base: pair.base })}
            error={tooSmall ? t('simpleTrade.tooSmall', { lot: formatAmount(pair.lot, { maxFraction: 12 }), base: pair.base }) : tooBig ? t('simpleTrade.tooBig') : undefined}
          />
          <Segmented
            legend={effectiveSide === 'buy' ? t('simpleTrade.priceBuy') : t('simpleTrade.priceSell')}
            value={preset}
            onChange={setPreset}
            options={[
              { value: 'near', label: t('simpleTrade.near', { price: formatPrice(presets.near) }) },
              { value: 'edge', label: t('simpleTrade.edge', { price: formatPrice(presets.edge) }) },
              { value: 'custom', label: t('simpleTrade.custom') },
            ]}
            caption={t(effectiveSide === 'buy' ? 'simpleTrade.priceHintBuy' : 'simpleTrade.priceHintSell')}
          />
          {preset === 'custom' ? (
            <Input
              label={t('simpleTrade.limit')}
              inputMode="decimal"
              mono
              value={priceText}
              onChange={(e) => setPriceText(e.target.value.replace(',', '.'))}
              suffix={pair.quote}
              placeholder={formatAmount(presets.near, { maxFraction: 6 })}
              hint={t('simpleTrade.bandHint', { low: formatPrice(band.low), high: formatPrice(band.high) })}
              error={outside ? t('simpleTrade.outside', { low: formatPrice(band.low), high: formatPrice(band.high) }) : undefined}
            />
          ) : null}
          <Switch checked={rollover} onChange={setRollover} label={t('simpleTrade.rollover')} description={t('simpleTrade.rolloverHint')} />
          {valid && value && notional !== null ? (
            <Summary
              rows={[
                { label: effectiveSide === 'buy' ? t('simpleTrade.payUpTo') : t('simpleTrade.getAtLeast'), value: `${formatAmount(notional, { maxFraction: 2 })} ${pair.quote}`, strong: true },
                { label: t('simpleTrade.fee'), value: `${formatAmount((notional * FEE_BPS) / 10_000n, { maxFraction: 4 })} ${pair.quote}` },
                { label: t('simple.amount.fees'), value: fmt.amount(value.quote.relayFee, payAsset) },
              ]}
            />
          ) : null}
          {valid && value?.plan ? <FundingNote asset={payAsset} deposits={value.plan.deposits} feeBps={feeBps} /> : null}
        </>
      ) : null}
      {step === 3 && pair && value?.draft && price !== null && amount !== null && notional !== null ? (
        <>
          <Summary
            rows={[
              { label: t('simpleTrade.market'), value: `${pair.base} / ${pair.quote}` },
              { label: t('simpleTrade.order'), value: `${sideLabel} · ${formatAmount(amount, { maxFraction: 8 })} ${pair.base}`, strong: true },
              { label: t('simpleTrade.limit'), value: `${formatPrice(price)} ${pair.quote}` },
              { label: t('simpleTrade.held'), value: fmt.amount(value.quote.escrow, payAsset) },
              { label: t('simple.amount.fees'), value: fmt.amount(value.quote.relayFee, payAsset) },
              ...(walletTopUp(value.plan?.deposits ?? null, feeBps) > 0n ? [{ label: t('simple.confirm.wallet'), value: fmt.amount(walletTopUp(value.plan?.deposits ?? null, feeBps), payAsset) }] : []),
            ]}
          />
          <p className={s.hintCalm}>
            <Icon name="seal" size={16} />
            {t('simpleTrade.auto')}
          </p>
          <p className={s.hint}>
            <Icon name="info" size={16} />
            {t('simpleTrade.samePrice')}
          </p>
        </>
      ) : null}
    </Wizard>
  );
}
