import { useState } from 'react';
import { AccountAction, useIsVisitor } from '../../account/AccountAction';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Icon } from '../../components/Icon/Icon';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { PhaseBar } from '../../components/PhaseBar/PhaseBar';
import { RollingNumber } from '../../components/RollingNumber/RollingNumber';
import { useToast } from '../../components/Toast/Toast';
import { LazyBookHero as BookHero } from '../../heroes/lazy';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { EpochInfo, Order, Pair } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { formatFixed, formatFull, formatPrice } from '../../lib/numberFormat';
import { useFormat } from '../../lib/useFormat';
import { Loaded } from '../shared/Loaded';
import { orderTone } from '../shared/status';
import styles from '../page.module.css';
import local from './Book.module.css';
import { ClearingChart } from './ClearingChart';
import { OrderForm } from './OrderForm';

const priceDigits = (pair: Pair): number => (pair.referencePrice > 0n && pair.referencePrice < 10n ** 16n ? 8 : 2);
const toNumber = (wei: bigint): number => Number(wei) / 1e18;

/** The latest revealed batch drawn into the hero (public after reveal); the demo story when there is none. */
function LiveHero({ pair }: { readonly pair: Pair }) {
  const book = useResource((ds) => ds.getRevealedBook(pair.id), ['orders'], [pair.id]);
  const data = book.data;
  if (!data || data.buys.length === 0 || data.sells.length === 0) return <BookHero />;
  const rows = (list: readonly { readonly price: bigint; readonly amount: bigint }[]) => list.map((o) => ({ price: toNumber(o.price), amount: toNumber(o.amount) }));
  return <BookHero buys={rows(data.buys)} sells={rows(data.sells)} reference={toNumber(data.referencePrice > 0n ? data.referencePrice : pair.referencePrice)} />;
}

/** The pending epoch is public; its wallet action is only mounted for an unlocked account. */
function Settling({ pair, settling }: { readonly pair: Pair; readonly settling: NonNullable<EpochInfo['settling']> }) {
  const { t } = useI18n();
  const visitor = useIsVisitor();
  const voiding = settling.action === 'void';
  return (
    <div className={styles.stackSm} role="status">
      <p className={styles.callout}>
        <Icon name="clock" />
        <span>
          <strong>{t(voiding ? 'bookLive.settling.voidTitle' : 'bookLive.settling.title', { n: settling.epoch })}</strong> {t(voiding ? 'bookLive.settling.voidBody' : 'bookLive.settling.body')}
        </span>
      </p>
      {!visitor ? <AccountAction><SettleAction pair={pair} settling={settling} /></AccountAction> : null}
    </div>
  );
}

function SettleAction({ pair, settling }: { readonly pair: Pair; readonly settling: NonNullable<EpochInfo['settling']> }) {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const [confirm, setConfirm] = useState(false);
  const settler = useAction(ds.settleEpoch.bind(ds));
  const voiding = settling.action === 'void';
  const submit = async (): Promise<void> => {
    const result = await settler.run(pair.id, settling.epoch);
    setConfirm(false);
    if (result) show({ tone: 'ok', title: t('bookLive.settling.done') });
  };
  return (
    <>
      <div>
        <Button variant="secondary" size="sm" icon={voiding ? 'refresh' : 'check'} onClick={() => setConfirm(true)} loading={settler.busy && !confirm}>
          {t(voiding ? 'bookLive.settling.voidCta' : 'bookLive.settling.cta')}
        </Button>
      </div>
      <PublicActionDialog
        open={confirm}
        title={t('bookLive.settling.publicTitle')}
        description={t('bookLive.settling.publicBody')}
        reveals={[t('bookLive.settling.publicReveal1')]}
        confirmLabel={t(voiding ? 'bookLive.settling.voidCta' : 'bookLive.settling.publicConfirm')}
        busy={settler.busy}
        onClose={() => setConfirm(false)}
        onConfirm={() => void submit()}
      />
    </>
  );
}

function EpochCard({ pair }: { readonly pair: Pair }) {
  const { t } = useI18n();
  const epoch = useResource((ds) => ds.getEpoch(pair.id), ['orders'], [pair.id]);
  return (
    <Card title={t('book.epoch.title')}>
      <Loaded resource={epoch}>
        {(e) => (
          <div className={styles.stack}>
            <div className={local.epochHead}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t('book.epoch.number')}</span>
                <span className={styles.mono}>#{e.epoch}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t('book.epoch.sealed')}</span>
                <span className={styles.mono}>{e.sealedOrders}</span>
              </div>
            </div>
            <PhaseBar
              label={t('book.epoch.phases')}
              phases={[
                { id: 'commit', label: t('book.epoch.commit'), endsAt: e.commitEndsAt },
                { id: 'reveal', label: t('book.epoch.reveal'), endsAt: e.revealEndsAt },
              ]}
              current={e.phase}
              endsInLabel={t('book.epoch.endsIn')}
              onElapsed={epoch.reload}
            />
            {e.settling ? <Settling pair={pair} settling={e.settling} /> : null}
            <p className={styles.note}>{t('book.epoch.explain')}</p>
          </div>
        )}
      </Loaded>
    </Card>
  );
}

function OrderActions({ order }: { readonly order: Order }) {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const claimer = useAction(ds.claimOrder.bind(ds));
  const roller = useAction(ds.rolloverOrder.bind(ds));
  const rest = order.amount - order.filled;
  if (order.claimable) {
    return (
      <Button
        size="sm"
        variant="secondary"
        icon="download"
        loading={claimer.busy}
        title={t('bookLive.orders.collectHint')}
        onClick={async () => {
          if (await claimer.run(order.id)) show({ tone: 'ok', title: t('bookLive.orders.collected') });
        }}
      >
        {t('bookLive.orders.collect')}
      </Button>
    );
  }
  if (order.claimed && order.rollover && !order.rolledInto && rest > 0n) {
    return (
      <Button
        size="sm"
        variant="ghost"
        icon="refresh"
        loading={roller.busy}
        onClick={async () => {
          if (await roller.run(order.id)) show({ tone: 'ok', title: t('bookLive.orders.rolled') });
        }}
      >
        {t('bookLive.orders.rollover')}
      </Button>
    );
  }
  return null;
}

function MyOrders({ pair }: { readonly pair: Pair }) {
  const { t } = useI18n();
  const f = useFormat();
  const orders = useResource((ds) => ds.listMyOrders(pair.id), ['orders'], [pair.id]);
  const digits = priceDigits(pair);
  const payout = (o: Order): string | null => {
    if (!o.payout || !o.claimable) return null;
    const p = o.payout;
    return o.side === 'buy'
      ? t('bookLive.orders.payoutBuy', { base: `${formatAmount(p.baseOut, { maxFraction: 6 })} ${pair.base}`, quote: formatAmount(p.quoteRefund, { maxFraction: 4 }) })
      : t('bookLive.orders.payoutSell', { quote: formatAmount(p.quoteOut, { maxFraction: 4 }), base: `${formatAmount(p.baseRefund, { maxFraction: 6 })} ${pair.base}` });
  };
  return (
    <Card title={t('book.orders.title')}>
      <Loaded resource={orders}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="book" illo="idle" title={t('book.orders.emptyTitle')} body={t('book.orders.emptyBody')} />
          ) : (
            <ul className={styles.list}>
              {items.map((o) => {
                const extra = payout(o);
                return (
                  <li key={o.id} className={[styles.row, local.orderRow].join(' ')}>
                    <span className={[local.side, o.side === 'buy' ? local.buy : local.sell].join(' ')}>{t(`book.side.${o.side}`)}</span>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>
                        {formatAmount(o.amount)} {pair.base} @ {formatAmount(o.limitPrice, { maxFraction: digits })}
                      </span>
                      <span className={styles.rowSub}>
                        {t('book.orders.epoch', { n: o.epoch })} · {f.relative(o.createdAt)}
                        {o.clearingPrice !== null && o.status !== 'sealed' ? ` · ${t('book.orders.cleared', { price: formatAmount(o.clearingPrice, { maxFraction: digits }) })}` : ''}
                        {o.status === 'sealed' && o.delegatedReveal ? ` · ${t('bookLive.orders.byRelay')}` : ''}
                      </span>
                      {extra ? <span className={styles.rowSub}>{extra}</span> : null}
                    </div>
                    <div className={local.orderEnd}>
                      <Badge tone={orderTone[o.status]}>{t(`book.orderStatus.${o.status}`)}</Badge>
                      <OrderActions order={o} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Loaded>
    </Card>
  );
}

function Clearings({ pair }: { readonly pair: Pair }) {
  const { t } = useI18n();
  const f = useFormat();
  const clearings = useResource((ds) => ds.listClearings(pair.id, 24), ['orders'], [pair.id]);
  const digits = priceDigits(pair);
  const price = (value: bigint): string => (digits > 2 ? formatPrice(value) : formatFixed(value, 2));
  return (
    <Card title={t('book.clearings.title')}>
      <Loaded resource={clearings} skeleton={<Skeleton height={220} label={t('common.loading')} />}>
        {(all) => {
          const items = all.slice(0, 8);
          return (
            <>
              <ClearingChart pair={pair} clearings={all} />
              <div className={local.tableWrap}>
                <table className={local.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t('book.clearings.epoch')}</th>
                      <th scope="col" className={local.num}>
                        {t('book.clearings.price')}
                      </th>
                      <th scope="col" className={[local.num, local.optional].join(' ')}>
                        {t('bookLive.clearings.reference')}
                      </th>
                      <th scope="col" className={local.num}>
                        {t('book.clearings.volume', { base: pair.base })}
                      </th>
                      <th scope="col" className={[local.num, local.optional].join(' ')}>
                        {t('book.clearings.orders')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.epoch}>
                        <td>
                          <span className={styles.mono}>#{c.epoch}</span>
                          <span className={local.time}>{f.relative(c.at)}</span>
                        </td>
                        <td className={local.num}>
                          {c.outcome === 'cleared' && c.price !== null ? (
                            <span title={formatFull(c.price)}>{price(c.price)}</span>
                          ) : (
                            <Badge tone={c.outcome === 'outside_band' ? 'warn' : 'neutral'}>{t(`book.outcome.${c.outcome}`)}</Badge>
                          )}
                        </td>
                        <td className={[local.num, local.optional].join(' ')}>{c.referencePrice ? <span title={formatFull(c.referencePrice)}>{price(c.referencePrice)}</span> : '–'}</td>
                        <td className={local.num}>{c.volume > 0n ? formatFixed(c.volume, 3) : '–'}</td>
                        <td className={[local.num, local.optional].join(' ')}>{c.orderCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </Loaded>
    </Card>
  );
}

export function BookPage() {
  const { t } = useI18n();
  const visitor = useIsVisitor();
  const pairs = useResource((ds) => ds.listPairs(), ['orders']);
  const [pairId, setPairId] = useState<string | null>(null);
  return (
    <div className={styles.stack}>
      <PageHeader title={t('book.title')} subtitle={t('book.subtitle')} />
      <Loaded resource={pairs} skeleton={<Skeleton height={320} label={t('common.loading')} />}>
        {(items) => {
          const pair = items.find((p) => p.id === pairId) ?? items[0];
          if (!pair) {
            return (
              <div className={styles.stack}>
                <BookHero />
                <EmptyState illo="attention" title={t('book.noPairs')} />
              </div>
            );
          }
          return (
            <div className={styles.stack}>
              <LiveHero pair={pair} />
              <div className={local.pairBar}>
                <Segmented legend={t('book.pair')} hideLegend size="sm" value={pair.id} onChange={setPairId} options={items.map((p) => ({ value: p.id, label: `${p.base}/${p.quote}` }))} />
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t(pair.referenceSource === 'chainlink' ? 'book.refChainlink' : 'book.refTwap')}</span>
                  <span className={local.refPrice}>
                    <RollingNumber value={pair.referencePrice > 0n ? formatAmount(pair.referencePrice, { maxFraction: priceDigits(pair) }) : '–'} /> USDT
                  </span>
                </div>
              </div>
              <div className={styles.split}>
                <div className={styles.stack}>
                  <EpochCard pair={pair} />
                  {!visitor ? <AccountAction><MyOrders pair={pair} /></AccountAction> : null}
                  <Clearings pair={pair} />
                </div>
                <AccountAction>
                  <Card title={t('book.form.title')}>
                    <OrderForm pair={pair} />
                  </Card>
                </AccountAction>
              </div>
            </div>
          );
        }}
      </Loaded>
    </div>
  );
}
