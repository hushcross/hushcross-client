import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { Input } from '../../components/Input/Input';
import { Segmented } from '../../components/Segmented/Segmented';
import { Switch } from '../../components/Switch/Switch';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource } from '../../data/DataProvider';
import type { Funding, Sale } from '../../data/types';
import { depositForSpend, formatAmount, parseAmount, WAD } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../lib/preferences';
import styles from '../page.module.css';

export function BidForm({ sale }: { readonly sale: Sale }) {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const { preferences } = usePreferences();
  const [priceText, setPriceText] = useState('');
  const [spendText, setSpendText] = useState('');
  const [funding, setFunding] = useState<Funding>(preferences.defaultFunding);
  const [delegate, setDelegate] = useState(true);
  const [confirmPublic, setConfirmPublic] = useState(false);
  const bidder = useAction(ds.placeBid.bind(ds));

  const price = parseAmount(priceText);
  const spend = parseAmount(spendText);
  const priceError = priceText && (price === null || price < sale.floorPrice) ? t('launch.bid.priceError', { floor: formatAmount(sale.floorPrice, { maxFraction: 12 }) }) : undefined;
  const spendError = spendText && (spend === null || spend === 0n) ? t('launch.bid.spendError') : undefined;
  const valid = price !== null && price >= sale.floorPrice && spend !== null && spend > 0n;
  const deposit = spend ? depositForSpend(sale.quoteAsset, spend) : null;
  const maxTokens = valid && price ? (spend * WAD) / price : null;

  const place = async (): Promise<void> => {
    if (!valid) return;
    const bid = await bidder.run({ saleId: sale.id, price, maxSpend: spend, funding, delegateReveal: delegate });
    setConfirmPublic(false);
    if (!bid) return;
    setPriceText('');
    setSpendText('');
    show({ tone: 'ok', title: t('launch.bid.placed'), body: delegate ? t('launch.bid.placedDelegated') : t('launch.bid.placedSelf') });
  };

  return (
    <div className={styles.form}>
      <Input label={t('launch.bid.price', { asset: sale.quoteAsset })} inputMode="decimal" mono value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder={formatAmount(sale.floorPrice, { maxFraction: 12 })} hint={t('launch.bid.priceHint')} error={priceError} suffix={sale.quoteAsset} />
      <Input label={t('launch.bid.spend')} inputMode="decimal" mono value={spendText} onChange={(e) => setSpendText(e.target.value)} hint={t('launch.bid.spendHint')} error={spendError} suffix={sale.quoteAsset} />
      <Segmented
        legend={t('launch.bid.funding')}
        value={funding}
        onChange={setFunding}
        options={[
          { value: 'vault', label: t('common.funding.vault') },
          { value: 'public', label: t('common.funding.public') },
        ]}
        caption={funding === 'vault' ? t('launch.bid.fundingVault') : t('launch.bid.fundingPublic')}
      />
      {funding === 'vault' ? <p className={styles.note}>{t('launch.bid.vaultEscrowHint')}</p> : null}
      <Switch checked={delegate} onChange={setDelegate} label={t('launch.bid.delegate')} description={t('launch.bid.delegateHint')} />
      {deposit !== null && spend ? (
        <dl className={styles.kv}>
          <dt>{t('launch.bid.deposit')}</dt>
          <dd className={styles.mono}>
            {formatAmount(deposit)} {sale.quoteAsset}
          </dd>
          {maxTokens !== null ? (
            <>
              <dt>{t('launch.bid.maxTokens')}</dt>
              <dd className={styles.mono}>
                {formatAmount(maxTokens, { maxFraction: 0 })} {sale.tokenSymbol}
              </dd>
            </>
          ) : null}
          <dt>{t('launch.bid.public')}</dt>
          <dd>{t('launch.bid.publicValue', { amount: formatAmount(deposit), asset: sale.quoteAsset })}</dd>
        </dl>
      ) : null}
      <Button size="lg" block icon="seal" disabled={!valid} loading={bidder.busy && !confirmPublic} onClick={() => (funding === 'public' ? setConfirmPublic(true) : void place())}>
        {t('launch.bid.cta')}
      </Button>
      <PublicActionDialog
        open={confirmPublic}
        title={t('launch.bid.publicTitle')}
        description={t('launch.bid.publicBody')}
        reveals={[t('launch.bid.publicReveal1'), t('launch.bid.publicReveal2')]}
        confirmLabel={t('launch.bid.publicConfirm')}
        busy={bidder.busy}
        onClose={() => setConfirmPublic(false)}
        onConfirm={place}
      />
    </div>
  );
}
