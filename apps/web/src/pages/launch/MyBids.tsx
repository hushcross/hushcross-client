import { useState } from 'react';
import { Badge } from '../../components/Badge/Badge';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource } from '../../data/DataProvider';
import type { Bid, Sale } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { bidTone } from '../shared/status';
import styles from '../page.module.css';
import local from './Launch.module.css';
import { formatPrice } from '../../lib/numberFormat';

export function MyBids({ sale, bids }: { readonly sale: Sale; readonly bids: readonly Bid[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const reveal = useAction(ds.revealBid.bind(ds));
  const claim = useAction(ds.claimBid.bind(ds));
  // Self-reveal and claim go out from the public wallet: confirm, and point vault bids to the relay.
  const [pending, setPending] = useState<{ readonly kind: 'reveal' | 'claim'; readonly bid: Bid } | null>(null);
  const confirm = async (): Promise<void> => {
    if (!pending) return;
    if (pending.kind === 'reveal') {
      if (await reveal.run(pending.bid.id)) show({ tone: 'ok', title: t('launch.myBids.revealed') });
    } else if (await claim.run(pending.bid.id)) show({ tone: 'ok', title: t('launch.myBids.claimed') });
    setPending(null);
  };
  if (bids.length === 0) return <EmptyState icon="seal" illo="sale" title={t('launch.myBids.emptyTitle')} body={t('launch.myBids.emptyBody')} />;
  const canClaim = (bid: Bid): boolean => (sale.phase === 'claim' || sale.phase === 'failed') && (bid.status === 'won' || bid.status === 'partial' || bid.status === 'lost' || bid.status === 'unrevealed');
  return (
    <ul className={styles.list}>
      {bids.map((bid) => (
        <li key={bid.id} className={[styles.row, local.bidRow].join(' ')}>
          <div className={styles.rowMain}>
            <span className={styles.rowTitle}>
              {t('launch.myBids.at', { price: formatPrice(bid.price), asset: sale.quoteAsset })}
            </span>
            <span className={styles.rowSub}>
              {t('launch.myBids.max', { amount: formatAmount(bid.maxSpend), asset: sale.quoteAsset })} · {t(`common.funding.${bid.funding}`)} · {f.relative(bid.createdAt)}
            </span>
            {bid.tokensAllocated > 0n || bid.refund > 0n ? (
              <span className={styles.rowSub}>
                {t('launch.myBids.outcome', { tokens: formatAmount(bid.tokensAllocated, { maxFraction: 0 }), symbol: sale.tokenSymbol, refund: formatAmount(bid.refund), asset: sale.quoteAsset })}
              </span>
            ) : null}
          </div>
          <div className={styles.rowEnd}>
            <Badge tone={bidTone[bid.status]}>{t(`launch.bidStatus.${bid.status}`)}</Badge>
            {sale.phase === 'reveal' && bid.status === 'sealed' ? (
              <Button size="sm" onClick={() => setPending({ kind: 'reveal', bid })} loading={reveal.busy}>
                {t('launch.myBids.reveal')}
              </Button>
            ) : null}
            {canClaim(bid) ? (
              <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'claim', bid })} loading={claim.busy}>
                {bid.status === 'unrevealed' ? t('launch.bid.reclaim') : bid.tokensAllocated > 0n ? t('launch.myBids.claim') : t('launch.myBids.refund')}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
      <PublicActionDialog
        open={pending !== null}
        title={t('launch.bid.publicActionTitle')}
        description={pending?.bid.funding === 'vault' ? t('launch.bid.delegateSuggest') : ''}
        reveals={[t(pending?.kind === 'reveal' ? 'launch.bid.publicActionReveal' : 'launch.bid.publicActionClaim')]}
        confirmLabel={t('launch.bid.publicActionConfirm')}
        busy={reveal.busy || claim.busy}
        onClose={() => setPending(null)}
        onConfirm={() => void confirm()}
      />
    </ul>
  );
}
