import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../components/Badge/Badge';
import { ButtonLink } from '../../components/Button/Button';
import { Countdown } from '../../components/Countdown/Countdown';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { LazyLaunchHero as LaunchHero } from '../../heroes/lazy';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useResource } from '../../data/DataProvider';
import type { Sale } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { Loaded } from '../shared/Loaded';
import { phaseTone } from '../shared/status';
import styles from '../page.module.css';
import local from './Launch.module.css';
import { nextDeadline } from './saleHelpers';
import { SaleAvatar } from './SaleAvatar';
import { formatFull, formatPrice } from '../../lib/numberFormat';

type Filter = 'open' | 'reveal' | 'done' | 'all';

const inFilter = (sale: Sale, filter: Filter): boolean => {
  if (filter === 'open') return sale.phase === 'commit' || sale.phase === 'upcoming';
  if (filter === 'reveal') return sale.phase === 'reveal' || sale.phase === 'settle';
  if (filter === 'done') return sale.phase === 'claim' || sale.phase === 'failed';
  return true;
};

export function SaleCard({ sale }: { readonly sale: Sale }) {
  const { t } = useI18n();
  const deadline = nextDeadline(sale);
  return (
    <Link to={`/launch/${sale.id}`} className={styles.cardLink}>
      <div className={local.cardHead}>
        <SaleAvatar sale={sale.address} symbol={sale.tokenSymbol} />
        <div className={styles.rowMain}>
          <span className={local.cardName}>{sale.tokenName}</span>
          <span className={styles.rowSub}>
            ${sale.tokenSymbol} · {t('launch.card.quote', { asset: sale.quoteAsset })}
          </span>
        </div>
        <Badge tone={phaseTone[sale.phase]}>{t(`launch.phaseBadge.${sale.phase}`)}</Badge>
      </div>
      <dl className={styles.kv}>
        <dt>{t('launch.card.bids')}</dt>
        <dd className={styles.mono}>{sale.bidCount.toLocaleString('en-US')}</dd>
        <dt>{t('launch.card.deposits')}</dt>
        <dd className={styles.mono}>
          {formatAmount(sale.totalDeposits, { maxFraction: 2 })} {sale.quoteAsset}
        </dd>
        <dt>{t('launch.card.floor')}</dt>
        <dd className={styles.mono}>
          <span title={formatFull(sale.floorPrice)}>{formatPrice(sale.floorPrice)}</span> {sale.quoteAsset}
        </dd>
      </dl>
      <div className={local.cardFoot}>
        {deadline !== null ? (
          <Countdown target={deadline} label={t(sale.phase === 'upcoming' ? 'launch.card.opensIn' : sale.phase === 'commit' ? 'launch.card.commitEnds' : 'launch.card.revealEnds')} />
        ) : sale.clearing ? (
          <span className={styles.stat}>
            <span className={styles.statLabel}>{t('launch.card.clearing')}</span>
            <span className={styles.mono}>
              {sale.clearing.succeeded ? `${formatPrice(sale.clearing.price)} ${sale.quoteAsset}` : t('launch.card.failed')}
            </span>
          </span>
        ) : (
          <span className={styles.rowSub}>{t('launch.card.settling')}</span>
        )}
      </div>
    </Link>
  );
}

export function LaunchPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('open');
  const sales = useResource((source) => source.listSales(), ['sales']);
  return (
    <div className={styles.stack}>
      <PageHeader
        title={t('launch.title')}
        subtitle={t('launch.subtitle')}
        actions={
          <ButtonLink to="/launch/new" icon="plus">
            {t('launch.createCta')}
          </ButtonLink>
        }
      />
      <LaunchHero />
      <Segmented
        legend={t('launch.filterLabel')}
        hideLegend
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: t('launch.filters.open') },
          { value: 'reveal', label: t('launch.filters.reveal') },
          { value: 'done', label: t('launch.filters.done') },
          { value: 'all', label: t('launch.filters.all') },
        ]}
      />
      <Loaded resource={sales} skeleton={<div className={styles.grid3}>{[0, 1, 2].map((i) => <Skeleton key={i} height={220} />)}</div>}>
        {(items) => {
          const visible = items.filter((s) => inFilter(s, filter));
          if (visible.length === 0) return <EmptyState icon="launch" illo="sale" title={t('launch.emptyTitle')} body={t('launch.emptyBody')} />;
          return (
            <div className={styles.grid3}>
              {visible.map((sale) => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          );
        }}
      </Loaded>
      <p className={styles.note}>{t('launch.footnote')}</p>
    </div>
  );
}
