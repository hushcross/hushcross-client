import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { Icon } from '../../components/Icon/Icon';
import { PrivacyCheck } from '../../components/PrivacyCheck/PrivacyCheck';
import { usePrivacyCheck } from '../../hooks/usePrivacyCheck';
import { Input } from '../../components/Input/Input';
import { Segmented } from '../../components/Segmented/Segmented';
import { Switch } from '../../components/Switch/Switch';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Funding, OrderSide, Pair } from '../../data/types';
import { formatAmount, parseAmount, quoteValue, splitIntoUnits } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../lib/preferences';
import styles from '../page.module.css';

const FEE_BPS = 5n;
const BAND_BPS = 200n;

export function OrderForm({ pair }: { readonly pair: Pair }) {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const { preferences } = usePreferences();
  const [side, setSide] = useState<OrderSide>('buy');
  const [priceText, setPriceText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [rollover, setRollover] = useState(false);
  const [funding, setFunding] = useState<Funding>(preferences.defaultFunding);
  const [confirmPublic, setConfirmPublic] = useState(false);
  const placer = useAction(ds.placeOrder.bind(ds));
  const vaultAllowed = side === 'buy' || pair.vaultSell;
  const effectiveFunding: Funding = vaultAllowed ? funding : 'public';

  const price = parseAmount(priceText);
  const amount = parseAmount(amountText);
  const offTick = price !== null && price > 0n && pair.tick > 0n && price % pair.tick !== 0n;
  const offLot = amount !== null && amount > 0n && pair.lot > 0n && amount % pair.lot !== 0n;
  const valid = price !== null && price > 0n && amount !== null && amount > 0n && !offTick && !offLot;
  const notional = valid ? quoteValue(amount, price) : null;
  const band = (pair.referencePrice * BAND_BPS) / 10_000n;
  const request = valid ? { pairId: pair.id, side, limitPrice: price, amount, rollover, funding: effectiveFunding } : null;
  const requestKey = request ? `${pair.id}:${side}:${price}:${amount}:${effectiveFunding}` : '';
  const quote = useResource((source) => (request && effectiveFunding === 'vault' ? source.quoteOrder(request) : Promise.resolve(null)), [], [requestKey]);
  const vaultQuote = effectiveFunding === 'vault' ? quote.data ?? null : null;
  const fundingAsset = vaultQuote?.fundingAsset ?? (side === 'buy' ? 'USDT' : 'BNB');
  const privacy = usePrivacyCheck(
    vaultQuote && vaultQuote.withdrawn > 0n ? { action: 'order', asset: fundingAsset, units: splitIntoUnits(fundingAsset, vaultQuote.withdrawn), recipientAddress: null, relayDelayMinutes: 0 } : null,
  );
  const outside = pair.referencePrice > 0n && price !== null && price > 0n && (side === 'buy' ? price < pair.referencePrice - band : price > pair.referencePrice + band);
  const stepTick = formatAmount(pair.tick, { maxFraction: 12 });
  const stepLot = formatAmount(pair.lot, { maxFraction: 12 });

  const place = async (): Promise<void> => {
    if (!request) return;
    const order = await placer.run(request);
    setConfirmPublic(false);
    if (!order) return;
    setPriceText('');
    setAmountText('');
    show({ tone: 'ok', title: t('book.form.placed'), body: t('book.form.placedBody', { n: order.epoch }) });
  };

  return (
    <div className={styles.form}>
      <Segmented legend={t('book.form.side')} value={side} onChange={setSide} options={[{ value: 'buy', label: t('book.side.buy') }, { value: 'sell', label: t('book.side.sell') }]} />
      <Input
        label={t('book.form.limit')}
        inputMode="decimal"
        mono
        value={priceText}
        onChange={(e) => setPriceText(e.target.value)}
        suffix="USDT"
        hint={t('book.form.limitHint')}
        error={offTick ? t('bookLive.form.offTick', { tick: stepTick }) : undefined}
      />
      <Input
        label={t('book.form.amount', { base: pair.base })}
        inputMode="decimal"
        mono
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        suffix={pair.base}
        error={offLot ? t('bookLive.form.offLot', { lot: stepLot, base: pair.base }) : undefined}
      />
      <p className={styles.note}>{t('bookLive.form.steps', { tick: stepTick, lot: stepLot, base: pair.base })}</p>
      <Segmented
        legend={t('book.form.funding')}
        value={effectiveFunding}
        onChange={setFunding}
        options={[
          { value: 'vault', label: t('common.funding.vault'), disabled: !vaultAllowed },
          { value: 'public', label: t('common.funding.public') },
        ]}
        caption={vaultAllowed ? undefined : t('book.form.vaultUnavailable', { base: pair.base })}
      />
      <Switch checked={rollover} onChange={setRollover} label={t('book.form.rollover')} description={t('book.form.rolloverHint')} />
      <PrivacyCheck state={privacy} />
      {notional !== null ? (
        <dl className={styles.kv}>
          <dt>{t('book.form.notional')}</dt>
          <dd className={styles.mono}>{formatAmount(notional, { maxFraction: 2 })} USDT</dd>
          <dt>{t('book.form.fee')}</dt>
          <dd className={styles.mono}>{formatAmount((notional * FEE_BPS) / 10_000n, { maxFraction: 4 })} USDT</dd>
          {vaultQuote && vaultQuote.withdrawn > 0n ? (
            <>
              <dt>{t('bookLive.form.vaultCost')}</dt>
              <dd className={styles.mono}>
                {formatAmount(vaultQuote.withdrawn, { maxFraction: 4 })} {fundingAsset}
              </dd>
              <dt>{t('bookLive.form.relayFee')}</dt>
              <dd className={styles.mono}>
                {formatAmount(vaultQuote.relayFee, { maxFraction: 4 })} {fundingAsset}
              </dd>
              <dt>{t('bookLive.form.escrow')}</dt>
              <dd className={styles.mono}>
                {formatAmount(vaultQuote.escrow, { maxFraction: 4 })} {fundingAsset === 'BNB' ? pair.base : 'USDT'}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {effectiveFunding === 'vault' && valid && quote.status === 'error' ? (
        <p className={styles.note} role="status">
          {t('bookLive.form.quoteFailed')}
        </p>
      ) : null}
      {outside ? (
        <p className={styles.callout} role="status">
          <Icon name="info" />
          <span>{t('book.form.outsideBand')}</span>
        </p>
      ) : null}
      <Button size="lg" block icon="seal" disabled={!valid} loading={placer.busy && !confirmPublic} onClick={() => (effectiveFunding === 'public' ? setConfirmPublic(true) : void place())}>
        {t('book.form.cta')}
      </Button>
      <p className={styles.note}>{t('book.form.sealedNote')}</p>
      <p className={styles.note}>{t('book.form.destinationNote')}</p>
      <p className={styles.note}>{t('book.form.minimumNote', { base: pair.base })}</p>
      <PublicActionDialog
        open={confirmPublic}
        title={t('book.form.publicTitle')}
        description={t('book.form.publicBody')}
        reveals={[t('book.form.publicReveal1'), t('book.form.publicReveal2')]}
        confirmLabel={t('book.form.publicConfirm')}
        busy={placer.busy}
        onClose={() => setConfirmPublic(false)}
        onConfirm={place}
      />
    </div>
  );
}
