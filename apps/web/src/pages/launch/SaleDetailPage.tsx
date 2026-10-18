import { useState } from 'react';
import { useParams } from 'react-router';
import { AddressDisplay } from '../../components/AddressDisplay/AddressDisplay';
import { Badge } from '../../components/Badge/Badge';
import { Card } from '../../components/Card/Card';
import { Countdown } from '../../components/Countdown/Countdown';
import { Icon } from '../../components/Icon/Icon';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { PhaseBar } from '../../components/PhaseBar/PhaseBar';
import { RollingNumber } from '../../components/RollingNumber/RollingNumber';
import { LazyLaunchHero as LaunchHero } from '../../heroes/lazy';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Button } from '../../components/Button/Button';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import { useAction } from '../../hooks/useAction';
import { SALE_BOUNDS } from '../../data/launchRules';
import type { Sale, SaleProfile } from '../../data/types';
import { bpsToPercent, formatAmount } from '../../data/units';
import { useI18n } from '../../i18n/I18nProvider';
import { Loaded } from '../shared/Loaded';
import { phaseTone } from '../shared/status';
import styles from '../page.module.css';
import { BidForm } from './BidForm';
import local from './Launch.module.css';
import { MyBids } from './MyBids';
import { SaleAvatar } from './SaleAvatar';
import { SaleProfileForm } from './SaleProfileForm';
import { SaleProfileView } from './SaleProfileView';
import { useSaleProfile } from './useSaleProfile';
import { barPhase, salePhases } from './saleHelpers';
import { formatFull, formatPrice } from '../../lib/numberFormat';

function ActionCard({ sale }: { readonly sale: Sale }) {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const finalize = useAction(ds.finalizeSale.bind(ds));
  const fees = useAction(ds.collectSaleFees.bind(ds));
  if (sale.phase === 'upcoming') {
    return (
      <Card title={t('launch.detail.upcomingTitle')}>
        <Countdown target={sale.commitStart} label={t('launch.card.opensIn')} size="lg" />
      </Card>
    );
  }
  if (sale.phase === 'commit') {
    return (
      <Card title={t('launch.bid.title')}>
        <BidForm sale={sale} />
      </Card>
    );
  }
  if (sale.phase === 'reveal' || sale.phase === 'settle') {
    return (
      <Card title={t(sale.phase === 'reveal' ? 'launch.detail.revealTitle' : 'launch.detail.settleTitle')}>
        <p className={styles.note}>
          <Icon name="clock" size={14} />
          {t(sale.phase === 'reveal' ? 'launch.detail.revealBody' : 'launch.detail.settleBody')}
        </p>
        {sale.phase === 'settle' ? (
          <div className={styles.stackSm}>
            <p className={styles.note}>{t('launch.finalize.hint')}</p>
            <Button icon="check" loading={finalize.busy} onClick={async () => (await finalize.run(sale.id)) && show({ tone: 'ok', title: t('launch.finalize.done') })}>
              {t('launch.finalize.action')}
            </Button>
          </div>
        ) : null}
      </Card>
    );
  }
  const c = sale.clearing;
  return (
    <Card title={t('launch.detail.resultTitle')}>
      {c && c.succeeded ? (
        <div className={styles.stack}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t('launch.detail.clearingPrice')}</span>
            <span className={styles.serifFigure}><RollingNumber value={formatPrice(c.price)} /></span>
            <span className={styles.rowSub}>{t('launch.detail.perToken', { asset: sale.quoteAsset, symbol: sale.tokenSymbol })}</span>
          </div>
          <div className={local.outcome}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('launch.detail.sold')}</span>
              <span className={styles.mono}>{formatAmount(c.tokensSold, { maxFraction: 0 })}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('launch.detail.raised')}</span>
              <span className={styles.mono}>{formatAmount(c.raised, { maxFraction: 2 })} {sale.quoteAsset}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('launch.detail.winners')}</span>
              <span className={styles.mono}>{c.winningBids}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{t('launch.detail.pool')}</span>
              {c.poolAddress ? <AddressDisplay value={c.poolAddress} /> : <span>-</span>}
            </div>
          </div>
          <p className={styles.note}>{t('launch.detail.uniform')}</p>
          {sale.phase === 'claim' && c.poolAddress ? (
            <div className={styles.stackSm}>
              <p className={styles.note}>{t('launch.fees.hint')}</p>
              <Button variant="secondary" loading={fees.busy} onClick={async () => (await fees.run(sale.id)) && show({ tone: 'ok', title: t('launch.fees.done') })}>
                {t('launch.fees.action')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={[styles.callout, styles.calloutDanger].join(' ')}>
          <Icon name="alert" />
          <span>{t('launch.detail.failedBody')}</span>
        </div>
      )}
    </Card>
  );
}

/** "About this sale": the verified profile, and the editor for the sale's creator wallet. */
function ProfileCard({ sale }: { readonly sale: Sale }) {
  const { t } = useI18n();
  const { show } = useToast();
  const profile = useSaleProfile(sale.address);
  const account = useResource((source) => source.getAccount(), ['account']);
  const [editing, setEditing] = useState(false);
  const isCreator = account.data?.publicAddress != null && account.data.publicAddress.toLowerCase() === sale.creator.toLowerCase();
  const current: SaleProfile | null = profile.data ?? null;
  if (!current && !isCreator) return null;
  return (
    <Card
      title={t('saleProfile.about')}
      action={
        isCreator && !editing ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {current ? t('saleProfile.edit') : t('saleProfile.add')}
          </Button>
        ) : null
      }
    >
      {editing ? (
        <SaleProfileForm
          sale={sale}
          current={current}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            show({ tone: 'ok', title: t('saleProfile.status.done') });
          }}
        />
      ) : current ? (
        <SaleProfileView profile={current} />
      ) : (
        <p className={styles.note}>{t('saleProfile.none')}</p>
      )}
    </Card>
  );
}

export function SaleDetailPage() {
  const { t } = useI18n();
  const { saleId = '' } = useParams();
  const data = useResource(async (ds) => {
    const [sale, bids] = await Promise.all([ds.getSale(saleId), ds.listMyBids(saleId)]);
    return { sale, bids };
  }, ['sales', 'bids'], [saleId]);

  return (
    <Loaded resource={data} skeleton={<Skeleton lines={6} height={24} label={t('common.loading')} />}>
      {({ sale, bids }) => (
        <div className={styles.stack}>
          <PageHeader
            back={{ to: '/launch', label: t('nav.launch') }}
            leading={<SaleAvatar sale={sale.address} symbol={sale.tokenSymbol} size="lg" label={t('saleProfile.logoAlt', { symbol: sale.tokenSymbol })} />}
            kicker={t('nav.launch')}
            badges={<Badge tone={phaseTone[sale.phase]}>{t(`launch.phaseBadge.${sale.phase}`)}</Badge>}
            title={sale.tokenName}
            subtitle={sale.description ? `$${sale.tokenSymbol} · ${sale.description}` : `$${sale.tokenSymbol}`}
          />
          {sale.phase === 'upcoming' || sale.phase === 'commit' || sale.phase === 'reveal' ? <LaunchHero sealedCount={sale.bidCount} quote={sale.quoteAsset} /> : null}
          <Card>
            <PhaseBar label={t('launch.phase.label')} phases={salePhases(sale, t)} current={barPhase(sale.phase)} endsInLabel={t('launch.phase.endsIn')} tone={sale.phase === 'failed' ? 'danger' : 'default'} onElapsed={data.reload} />
          </Card>
          <ProfileCard sale={sale} />
          <div className={styles.split}>
            <div className={styles.stack}>
              <Card title={t('launch.detail.publicTitle')}>
                <div className={local.outcome}>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>{t('launch.card.bids')}</span>
                    <span className={styles.statValue}>{sale.bidCount.toLocaleString('en-US')}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>{t('launch.card.deposits')}</span>
                    <span className={styles.statValue}>{formatAmount(sale.totalDeposits, { maxFraction: 2 })} {sale.quoteAsset}</span>
                  </div>
                </div>
                <p className={[styles.note, styles.spaced].join(' ')}>
                  <Icon name="lock" size={14} />
                  {t('launch.detail.sealedNote')}
                </p>
              </Card>
              <Card title={t('launch.detail.paramsTitle')}>
                <dl className={styles.kv}>
                  <dt>{t('launch.detail.supply')}</dt>
                  <dd className={styles.mono}>{formatAmount(sale.totalSupply, { maxFraction: 0 })}</dd>
                  <dt>{t('launch.detail.forSale')}</dt>
                  <dd className={styles.mono}>{formatAmount(sale.saleAmount, { maxFraction: 0 })}</dd>
                  <dt>{t('launch.card.floor')}</dt>
                  <dd className={styles.mono} title={formatFull(sale.floorPrice)}>{formatPrice(sale.floorPrice)} {sale.quoteAsset}</dd>
                  <dt>{t('launch.detail.minRaise')}</dt>
                  <dd className={styles.mono}>{formatAmount(sale.minRaise)} {sale.quoteAsset}</dd>
                  <dt>{t('launch.detail.liquidity')}</dt>
                  <dd>{t('launch.detail.liquidityValue', { raise: bpsToPercent(sale.liquidityBps), tokens: bpsToPercent(sale.tokenLiquidityBps) })}</dd>
                  <dt>{t('launch.detail.creator')}</dt>
                  <dd>{t('launch.detail.creatorValue', { share: bpsToPercent(sale.creatorShareBps), days: sale.creatorVestDays })}</dd>
                  <dt>{t('launch.detail.maxBids')}</dt>
                  <dd className={styles.mono}>{SALE_BOUNDS.maxBidsPerSale.toLocaleString('en-US')}</dd>
                  <dt>{t('launch.detail.fee')}</dt>
                  <dd>{bpsToPercent(SALE_BOUNDS.raiseFeeBps)}</dd>
                  <dt>{t('launch.detail.token')}</dt>
                  <dd><AddressDisplay value={sale.tokenAddress} kind="token" /></dd>
                  <dt>{t('launch.detail.creatorAddress')}</dt>
                  <dd><AddressDisplay value={sale.creator} /></dd>
                </dl>
              </Card>
            </div>
            <div className={styles.stack}>
              <ActionCard sale={sale} />
              <Card title={t('launch.myBids.title')}>
                <MyBids sale={sale} bids={bids} />
              </Card>
            </div>
          </div>
        </div>
      )}
    </Loaded>
  );
}
