import { publicAppUrl } from '../../platform/runtime';
import { useState } from 'react';
import { AccountAction, useIsVisitor } from '../../account/AccountAction';
import { useParams } from 'react-router';
import { AddressDisplay } from '../../components/AddressDisplay/AddressDisplay';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { CopyButton } from '../../components/CopyButton/CopyButton';
import { Countdown } from '../../components/Countdown/Countdown';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { QrCode } from '../../components/QrCode/QrCode';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Switch } from '../../components/Switch/Switch';
import { useToast } from '../../components/Toast/Toast';
import { UnitPicker } from '../../components/UnitPicker/UnitPicker';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Campaign, Funding, ReceiptVerification, VaultConfig } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { Loaded } from '../shared/Loaded';
import { campaignTone } from '../shared/status';
import styles from '../page.module.css';
import { CampaignProgress } from './CampaignCard';
import local from './Give.module.css';
import { SuccessCheck } from '../../components/SuccessCheck/SuccessCheck';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { LazyGiveHero as GiveHero } from '../../heroes/lazy';
import { CampaignEndCard, MyDonationsCard } from './CampaignActions';

const COUNTS = ['1', '2', '3'] as const;

function DonateCard({ campaign, config }: { readonly campaign: Campaign; readonly config: VaultConfig }) {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const [unit, setUnit] = useState<bigint | null>(null);
  const [count, setCount] = useState<(typeof COUNTS)[number]>('1');
  const [receipt, setReceipt] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const [funding, setFunding] = useState<Funding>('vault');
  const [confirmPublic, setConfirmPublic] = useState(false);
  const donor = useAction(ds.donate.bind(ds));

  const submit = async (): Promise<void> => {
    if (unit === null) return;
    const result = await donor.run({ campaignId: campaign.id, unit, count: Number(count), withReceipt: receipt, funding });
    setConfirmPublic(false);
    if (!result) return;
    setSecret(result.receiptSecret);
    setUnit(null);
    show({ tone: 'ok', title: t('give.donate.done') });
  };

  if (campaign.status !== 'active') {
    return (
      <Card title={t('give.donate.title')}>
        <p className={styles.note}>
          <Icon name="info" size={14} />
          {t(campaign.status === 'failed' ? 'give.donate.failedNote' : 'give.donate.endedNote')}
        </p>
      </Card>
    );
  }

  return (
    <Card title={t('give.donate.title')}>
      <div className={styles.form}>
        <UnitPicker asset={campaign.asset} options={config.units[campaign.asset]} value={unit} onChange={setUnit} feeBps={config.vettingFeeBps} showGross={false} count={Number(count)} label={t('give.donate.amount', { asset: campaign.asset })} />
        <Segmented legend={t('send.form.count')} size="sm" options={COUNTS.map((c) => ({ value: c, label: `×${c}` }))} value={count} onChange={setCount} />
        <Segmented
          legend={t('giveLive.donate.funding')}
          size="sm"
          value={funding}
          onChange={setFunding}
          options={[
            { value: 'vault', label: t('common.funding.vault') },
            { value: 'public', label: t('common.funding.public') },
          ]}
        />
        <Switch checked={receipt} onChange={setReceipt} label={t('give.donate.receipt')} description={t('give.donate.receiptHint')} />
        <Button size="lg" block icon="give" onClick={() => (funding === 'public' ? setConfirmPublic(true) : void submit())} loading={donor.busy && !confirmPublic} disabled={unit === null}>
          {t('give.donate.cta')}
        </Button>
        <PublicActionDialog
          open={confirmPublic}
          title={t('giveLive.donate.publicTitle')}
          description={t('giveLive.donate.publicBody')}
          reveals={[t('giveLive.donate.publicReveal1'), ...(campaign.kind === 'goal' ? [t('giveLive.donate.publicReveal2')] : [])]}
          confirmLabel={t('giveLive.donate.publicConfirm')}
          busy={donor.busy}
          onClose={() => setConfirmPublic(false)}
          onConfirm={() => void submit()}
        />
        <p className={styles.note}>{t(campaign.kind === 'goal' ? 'give.donate.goalNote' : 'give.donate.tipNote')}</p>
        {secret ? (
          <div className={styles.stackSm} role="status">
            <p className={[styles.rowTitle, styles.titleWithMark].join(' ')}>
              <SuccessCheck size={22} tone="give" />
              {t('give.donate.secretTitle')}
            </p>
            <p className={styles.secret}>{secret}</p>
            <p className={styles.note}>{t('give.donate.secretHint')}</p>
            <CopyButton value={secret} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function VerifyCard({ campaign }: { readonly campaign: Campaign }) {
  const { t } = useI18n();
  const f = useFormat();
  const ds = useDataSource();
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState<ReceiptVerification | null>(null);
  const verifier = useAction(ds.verifyReceipt.bind(ds));
  const submit = async (): Promise<void> => {
    const outcome = await verifier.run(campaign.id, secret);
    if (outcome) setResult(outcome);
  };
  return (
    <Card title={t('give.verify.title')}>
      <div className={styles.form}>
        <Input label={t('give.verify.label')} mono value={secret} onChange={(e) => { setSecret(e.target.value); setResult(null); }} placeholder="hcr_…" autoComplete="off" />
        <Button variant="secondary" icon="receipt" onClick={submit} loading={verifier.busy} disabled={secret.trim().length < 6}>
          {t('give.verify.cta')}
        </Button>
        {result ? (
          <p className={[styles.callout, result.valid ? '' : styles.calloutDanger].join(' ')} role="status">
            <Icon name={result.valid ? 'check' : 'alert'} />
            <span>{result.valid ? t('give.verify.valid', { amount: f.amount(result.donation.amount, campaign.asset), date: f.dateTime(result.donation.at) }) : t('give.verify.invalid')}</span>
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** Form-only configuration must not block the public campaign if a fee service is unavailable. */
function AccountDonateCard({ campaign }: { readonly campaign: Campaign }) {
  const config = useResource((ds) => ds.getVaultConfig(), ['campaigns']);
  return <Loaded resource={config}>{(value) => <DonateCard campaign={campaign} config={value} />}</Loaded>;
}

export function CampaignDetailPage() {
  const { t } = useI18n();
  const visitor = useIsVisitor();
  const f = useFormat();
  const { campaignId = '' } = useParams();
  const data = useResource(async (ds) => {
    const [campaign, donations] = await Promise.all([ds.getCampaign(campaignId), ds.listDonations(campaignId, 10)]);
    return { campaign, donations };
  }, ['campaigns'], [campaignId]);

  return (
    <Loaded resource={data} skeleton={<Skeleton lines={6} height={24} label={t('common.loading')} />}>
      {({ campaign, donations }) => {
        const share = publicAppUrl(`/give/${campaign.id}`);
        return (
          <div className={styles.stack}>
            <PageHeader
              back={{ to: '/give', label: t('nav.give') }}
              kicker={
                <span className={local.cardTags}>
                  <Badge tone="neutral" dot={false}>{t(`give.kind.${campaign.kind}`)}</Badge>
                  {campaign.kind === 'goal' ? <Badge tone={campaignTone[campaign.status]}>{t(`give.status.${campaign.status}`)}</Badge> : null}
                </span>
              }
              title={campaign.title}
            />
            <GiveHero
              campaign={{
                title: campaign.title,
                asset: campaign.asset,
                raised: Number(campaign.raised) / 1e18,
                goal: campaign.goal === null ? null : Number(campaign.goal) / 1e18,
                donations: campaign.donationCount,
                outcome: campaign.status === 'failed' ? 'missed' : campaign.status === 'succeeded' ? 'reached' : 'open',
              }}
            />
            <div className={styles.split}>
              <div className={styles.stack}>
                <Card>
                  <div className={styles.stack}>
                    <CampaignProgress campaign={campaign} />
                    <div className={styles.grid3}>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>{t('give.detail.donations')}</span>
                        <span className={styles.statValue}>{campaign.donationCount}</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>{t('give.detail.started')}</span>
                        <span className={styles.statValue}>{f.date(campaign.createdAt)}</span>
                      </div>
                      {campaign.deadline !== null ? (
                        campaign.status === 'active' ? (
                          <Countdown target={campaign.deadline} label={t('give.card.endsIn')} />
                        ) : (
                          <div className={styles.stat}>
                            <span className={styles.statLabel}>{t('give.detail.ended')}</span>
                            <span className={styles.statValue}>{f.date(campaign.deadline)}</span>
                          </div>
                        )
                      ) : null}
                    </div>
                    {campaign.story ? <p className={local.story}>{campaign.story}</p> : null}
                    {campaign.link ? (
                      <a className={styles.mono} href={campaign.link} target="_blank" rel="noreferrer noopener">
                        {t('giveLive.detail.link')}
                      </a>
                    ) : null}
                    <dl className={styles.kv}>
                      <dt>{t('give.detail.recipient')}</dt>
                      <dd>{campaign.recipient.startsWith('0x') ? <AddressDisplay value={campaign.recipient} /> : <span className={styles.mono}>{campaign.recipient}</span>}</dd>
                      <dt>{t(campaign.kind === 'goal' ? 'give.detail.escrow' : 'give.detail.contract')}</dt>
                      <dd><AddressDisplay value={campaign.escrowAddress} /></dd>
                    </dl>
                  </div>
                </Card>
                <Card title={t('give.detail.publicTitle')}>
                  <div className={local.publicGrid}>
                    <div>
                      <h3>{t('give.detail.isPublic')}</h3>
                      <ul className={styles.bullets}>
                        <li>{t('give.detail.public1')}</li>
                        <li>{t('give.detail.public2')}</li>
                      </ul>
                    </div>
                    <div>
                      <h3>{t('give.detail.notPublic')}</h3>
                      <ul className={styles.bullets}>
                        <li>{t('give.detail.private1')}</li>
                        <li>{t('give.detail.private2')}</li>
                      </ul>
                    </div>
                  </div>
                </Card>
                <Card title={t('give.detail.recent')}>
                  {donations.length === 0 ? (
                    <EmptyState icon="give" illo="give" title={t('give.detail.noDonations')} />
                  ) : (
                    <ul className={styles.list}>
                      {donations.map((d) => (
                        <li key={d.id} className={styles.row}>
                          <span className={styles.rowIcon} style={{ color: 'var(--mod-give)' }}>
                            <Icon name="give" />
                          </span>
                          <div className={styles.rowMain}>
                            <span className={styles.rowTitle}>{t('give.detail.donor')}</span>
                            <span className={styles.rowSub}>{f.relative(d.at)}{d.hasReceipt ? ` · ${t('give.detail.hasReceipt')}` : ''}</span>
                          </div>
                          <span className={styles.amount}>{formatAmount(d.amount)} {campaign.asset}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <div className={styles.stack}>
                <AccountAction>
                  <CampaignEndCard campaign={campaign} />
                  <AccountDonateCard campaign={campaign} />
                  <MyDonationsCard campaign={campaign} />
                </AccountAction>
                <Card title={t('give.detail.share')}>
                  <div className={styles.stackSm}>
                    <QrCode value={share} label={t('give.detail.qrLabel')} size={144} />
                    <CopyButton value={share} label={t('give.detail.copyLink')} />
                  </div>
                </Card>
                {!visitor ? <AccountAction><VerifyCard campaign={campaign} /></AccountAction> : null}
              </div>
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}
