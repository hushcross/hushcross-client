import { useState } from 'react';
import { AddressDisplay, middleEllipsis } from '../../components/AddressDisplay/AddressDisplay';
import { Button } from '../../components/Button/Button';
import { Coin } from '../../components/Coin/Coin';
import { Dialog } from '../../components/Dialog/Dialog';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Input } from '../../components/Input/Input';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Address, OneTimeFunds as Funds } from '../../data/types';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { Summary } from '../../simple/parts/Summary';
import styles from './OneTimeFunds.module.css';
import { SaleAvatar } from '../launch/SaleAvatar';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MODULE = { trade: 'book', sale: 'launch', refund: 'give' } as const satisfies Readonly<Record<Funds['source'], string>>;

function sourceLabel(item: Funds, t: ReturnType<typeof useI18n>['t']): string {
  if (item.source === 'refund') return t('oneTime.refund');
  if (item.source === 'sale') return item.market ? t('oneTime.sale', { token: item.market }) : t('oneTime.saleNoToken');
  return item.market ? t('oneTime.trade', { market: item.market }) : t('oneTime.tradeNoMarket');
}

/**
 * "From trades, sales and refunds": one-time addresses that Book trades, Launch bids and Give refunds paid, with their balances,
 * "Move to vault" where the vault takes it, and "Send to an address" behind a public-action confirmation.
 * Used on the Simple Receive page and the Pro Receive tab.
 */
export function OneTimeFunds() {
  const { t } = useI18n();
  const fmt = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const funds = useResource((source) => source.listOneTimeFunds(), ['send', 'balances']);
  const account = useResource((source) => source.getAccount(), ['account']);
  const move = useAction(ds.moveOneTimeToVault.bind(ds));
  const [sending, setSending] = useState<Funds | null>(null);

  const moveToVault = async (item: Funds, symbol: 'USDT' | 'BNB', amount: bigint): Promise<void> => {
    if (await move.run(item.id, symbol)) show({ tone: 'ok', title: t('oneTime.moved', { amount: fmt.amount(amount, symbol) }) });
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>{t('oneTime.intro')}</p>
      {funds.status === 'loading' ? (
        <Skeleton lines={2} height={48} label={t('common.loading')} />
      ) : (funds.data ?? []).length === 0 ? (
        <EmptyState illo="received" title={t('oneTime.emptyTitle')} body={t('oneTime.emptyBody')} />
      ) : (
        <ul className={styles.list} aria-label={t('oneTime.title')}>
          {(funds.data ?? []).map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.head}>
                {item.source === 'sale' && item.sale ? <SaleAvatar sale={item.sale} symbol={item.market ?? '?'} size="sm" /> : <Coin icon={MODULE[item.source]} tone={MODULE[item.source]} size="sm" />}
                <span className={styles.headText}>
                  <span className={styles.title}>{sourceLabel(item, t)}</span>
                  <span className={styles.sub}>{fmt.relative(item.at)}</span>
                </span>
              </div>
              <AddressDisplay value={item.address} label={t('oneTime.address')} />
              <ul className={styles.holdings}>
                {item.holdings.map((h) => (
                  <li key={h.symbol} className={styles.holding}>
                    {fmt.amount(h.amount, h.symbol, 6)}
                  </li>
                ))}
              </ul>
              {!item.canMove ? <p className={styles.note}>{t('oneTime.noKey')}</p> : item.gas === 0n ? <p className={styles.note}>{t('oneTime.noGas')}</p> : <p className={styles.note}>{t('oneTime.gas', { amount: fmt.amount(item.gas, 'BNB', 6) })}</p>}
              {item.canMove ? (
                <div className={styles.actions}>
                  {item.holdings.flatMap((h) =>
                    h.toVault === null
                      ? []
                      : [
                          <Button key={h.symbol} size="sm" icon="vault" loading={move.busy} onClick={() => void moveToVault(item, h.toVault as 'USDT' | 'BNB', h.amount)}>
                            {t('oneTime.toVault', { symbol: h.symbol })}
                          </Button>,
                        ],
                  )}
                  <Button size="sm" variant="secondary" icon="send" disabled={item.gas === 0n} onClick={() => setSending(item)}>
                    {t('oneTime.send')}
                  </Button>
                </div>
              ) : null}
              {item.holdings.some((h) => h.toVault !== null) ? <p className={styles.note}>{t('oneTime.vaultHint')}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {sending ? <SendDialog item={sending} ownWallet={account.data?.publicAddress ?? null} onClose={() => setSending(null)} /> : null}
    </div>
  );
}

function SendDialog({ item, ownWallet, onClose }: { readonly item: Funds; readonly ownWallet: Address | null; readonly onClose: () => void }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const send = useAction(ds.sendFromOneTime.bind(ds));
  const [symbol, setSymbol] = useState<string>(item.holdings.find((h) => h.symbol !== 'BNB')?.symbol ?? item.holdings[0]?.symbol ?? 'BNB');
  const [to, setTo] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const holding = item.holdings.find((h) => h.symbol === symbol);
  const trimmed = to.trim();
  const valid = ADDRESS.test(trimmed) && !/^0x0{40}$/i.test(trimmed);
  const self = valid && trimmed.toLowerCase() === item.address.toLowerCase();
  const own = valid && ownWallet !== null && trimmed.toLowerCase() === ownWallet.toLowerCase();
  const error = touched && trimmed !== '' ? (!valid ? t('oneTime.toInvalid') : self ? t('oneTime.toSelf') : undefined) : undefined;
  const amount = holding ? fmt.amount(holding.amount, holding.symbol, 6) : '';

  const submit = async (): Promise<void> => {
    const result = await send.run({ id: item.id, symbol, to: trimmed as Address });
    if (!result) return;
    show({ tone: 'ok', title: t('oneTime.sent', { amount: fmt.amount(result.amount, result.symbol, 6) }) });
    setConfirming(false);
    onClose();
  };

  return (
    <>
      <Dialog
        open={!confirming}
        title={t('oneTime.sendTitle')}
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!valid || self || !holding} onClick={() => setConfirming(true)}>
              {t('oneTime.review')}
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          {item.holdings.length > 1 ? <Segmented<string> legend={t('oneTime.asset')} size="sm" value={symbol} onChange={setSymbol} options={item.holdings.map((h) => ({ value: h.symbol, label: h.symbol }))} /> : null}
          <Input label={t('oneTime.to')} hint={t('oneTime.toHint')} value={to} onChange={(e) => setTo(e.target.value)} onBlur={() => setTouched(true)} error={error} mono autoCapitalize="none" spellCheck={false} placeholder="0x…" />
          <p className={styles.warning} role="note">
            {own ? `${t('oneTime.ownWallet')} ` : ''}
            {t('oneTime.warning')}
          </p>
          <Summary
            rows={[
              { label: t('oneTime.willSend'), value: amount, strong: true },
              { label: t('oneTime.gasLabel'), value: t('oneTime.gasValue') },
            ]}
          />
        </div>
      </Dialog>
      <PublicActionDialog
        open={confirming}
        title={t('oneTime.confirmTitle')}
        description={t('oneTime.confirmBody', { amount, from: middleEllipsis(item.address, 4), to: valid ? middleEllipsis(trimmed, 4) : '' })}
        reveals={[t('oneTime.reveal1'), ...(own ? [t('oneTime.ownWallet')] : []), t('oneTime.reveal2')]}
        confirmLabel={t('oneTime.confirm')}
        busy={send.busy}
        onClose={() => setConfirming(false)}
        onConfirm={() => void submit()}
      />
    </>
  );
}
