import { useState } from 'react';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { CopyButton } from '../../components/CopyButton/CopyButton';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { Icon } from '../../components/Icon/Icon';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Campaign, MyDonation } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import styles from '../page.module.css';

/** After a goal's deadline: settle it (and release when reached). Anyone may; it is a public wallet action. */
export function CampaignEndCard({ campaign }: { readonly campaign: Campaign }) {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const [confirm, setConfirm] = useState(false);
  const finisher = useAction(ds.finishCampaign.bind(ds));
  const ended = campaign.kind === 'goal' && campaign.deadline !== null && campaign.status !== 'active';
  const pending = ended && (campaign.status === 'succeeded' ? campaign.released !== true : campaign.settled !== true);
  if (!pending) return null;
  const submit = async (): Promise<void> => {
    const result = await finisher.run(campaign.id);
    setConfirm(false);
    if (result) show({ tone: 'ok', title: t('giveLive.finish.done') });
  };
  return (
    <Card title={t('giveLive.finish.title')}>
      <div className={styles.stackSm}>
        <p className={styles.note}>{t(campaign.status === 'succeeded' ? 'giveLive.finish.reachedBody' : 'giveLive.finish.missedBody')}</p>
        <div>
          <Button variant="secondary" icon="check" onClick={() => setConfirm(true)} loading={finisher.busy && !confirm}>
            {t('giveLive.finish.cta')}
          </Button>
        </div>
      </div>
      <PublicActionDialog
        open={confirm}
        title={t('giveLive.finish.publicTitle')}
        description={t('giveLive.finish.publicBody')}
        reveals={[t('giveLive.finish.publicReveal1')]}
        confirmLabel={t('giveLive.finish.cta')}
        busy={finisher.busy}
        onClose={() => setConfirm(false)}
        onConfirm={() => void submit()}
      />
    </Card>
  );
}

function RefundButton({ donation, campaign }: { readonly donation: MyDonation; readonly campaign: Campaign }) {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const refunder = useAction(ds.claimRefund.bind(ds));
  if (donation.refund === 'refunded') return <Badge tone="ok">{t('giveLive.mine.refunded')}</Badge>;
  if (donation.refund === 'pending') return <Badge tone="neutral">{t('giveLive.mine.pending')}</Badge>;
  if (donation.refund !== 'available') return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      icon="refresh"
      disabled={campaign.settled !== true}
      loading={refunder.busy}
      onClick={async () => {
        if (await refunder.run(donation.id)) show({ tone: 'ok', title: t('giveLive.mine.done') });
      }}
    >
      {t('giveLive.mine.refund')}
    </Button>
  );
}

/** This vault's donations to the campaign: receipts and (missed goals) private refunds through the relay. */
export function MyDonationsCard({ campaign }: { readonly campaign: Campaign }) {
  const { t } = useI18n();
  const f = useFormat();
  const mine = useResource((ds) => ds.listMyDonations(campaign.id), ['campaigns'], [campaign.id]);
  const items = mine.data ?? [];
  if (items.length === 0) return null;
  const refundable = items.some((d) => d.refund === 'available');
  return (
    <Card title={t('giveLive.mine.title')}>
      <div className={styles.stackSm}>
        <ul className={styles.list}>
          {items.map((d) => (
            <li key={d.id} className={styles.row}>
              <span className={styles.rowIcon} style={{ color: 'var(--mod-give)' }}>
                <Icon name={d.funding === 'vault' ? 'shield' : 'wallet'} />
              </span>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {formatAmount(d.amount, { maxFraction: 4 })} {campaign.asset}
                </span>
                <span className={styles.rowSub}>
                  {t(d.funding === 'vault' ? 'giveLive.mine.fromVault' : 'giveLive.mine.fromWallet')} · {f.relative(d.at)}
                  {d.refund === 'available' ? ` · ${t(d.funding === 'vault' ? 'giveLive.mine.refundVault' : 'giveLive.mine.refundPublic')}` : ''}
                </span>
                {d.receiptSecret ? (
                  <span className={styles.rowSub}>
                    {t('giveLive.mine.receipt')} <CopyButton value={d.receiptSecret} />
                  </span>
                ) : null}
              </div>
              <RefundButton donation={d} campaign={campaign} />
            </li>
          ))}
        </ul>
        {refundable && campaign.settled !== true ? <p className={styles.note}>{t('giveLive.finish.closeFirst')}</p> : null}
      </div>
    </Card>
  );
}
