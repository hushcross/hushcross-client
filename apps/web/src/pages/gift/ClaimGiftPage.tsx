import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Button, ButtonLink } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { PrivacyCheck, PrivacyConfirm } from '../../components/PrivacyCheck/PrivacyCheck';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Switch } from '../../components/Switch/Switch';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Address, GiftClaimResult, GiftDestination } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { usePrivacyCheck } from '../../hooks/usePrivacyCheck';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../lib/preferences';
import { Loaded } from '../shared/Loaded';
import styles from '../page.module.css';
import { ClaimCelebration } from './ClaimCelebration';
import { GiftFace } from './GiftCard';
import local from './Gift.module.css';

type Target = 'vault' | 'address';
const isAddress = (v: string): v is Address => /^0x[0-9a-fA-F]{40}$/.test(v);

export function ClaimGiftPage() {
  const { t } = useI18n();
  const ds = useDataSource();
  const { hash } = useLocation();
  const { preferences } = usePreferences();
  const fragment = hash.replace(/^#/, '');
  const [target, setTarget] = useState<Target>('vault');
  const [address, setAddress] = useState('');
  const [gasDropChoice, setGasDropChoice] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<GiftClaimResult | null>(null);
  const view = useResource((source) => source.openGift(fragment), ['gifts'], [fragment]);
  const claimer = useAction(ds.claimGift.bind(ds));
  const addressOk = isAddress(address.trim());
  // Decided rules: default from the gift's own amount; only offered where it applies.
  const gasDrop = view.data?.gasDropOffered ? (gasDropChoice ?? view.data.gasDropDefaultOn) : false;
  const ready = view.data?.status === 'ready' && result === null;
  const privacy = usePrivacyCheck(
    ready && view.data && (target === 'vault' || addressOk)
      ? { action: 'gift_claim', asset: view.data.asset, units: [], recipientAddress: target === 'address' ? (address.trim() as Address) : null, relayDelayMinutes: target === 'address' ? preferences.relayDelayMinutes : 0, giftSecret: fragment }
      : null,
  );
  const assessment = privacy.status === 'ready' ? privacy.assessment : null;

  useEffect(() => {
    setResult(null);
  }, [fragment]);

  const claim = async (): Promise<void> => {
    if (assessment?.requiresConfirm && !confirming) {
      setConfirming(true);
      return;
    }
    const destination: GiftDestination = target === 'vault' ? { kind: 'vault' } : { kind: 'address', address: address.trim() as Address, gasDrop };
    const outcome = await claimer.run(fragment, destination);
    setConfirming(false);
    if (outcome) setResult(outcome);
  };

  if (!fragment) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t('gift.claim.title')} />
        <EmptyState icon="gift" illo="attention" title={t('gift.claim.noLinkTitle')} body={t('gift.claim.noLinkBody')} />
      </div>
    );
  }

  return (
    <div className={[styles.stack, local.claimWrap].join(' ')}>
      <PageHeader title={t('gift.claim.title')} subtitle={t('gift.claim.subtitle')} />
      <Loaded resource={view} skeleton={<Skeleton height={240} label={t('common.loading')} />}>
        {(gift) => (
          <div className={styles.stack}>
            {result ? null : <GiftFace mode={gift.mode} asset={gift.asset} amount={gift.amount} message={gift.message} packets={gift.packetsTotal} expiresAt={gift.expiresAt} caption={t(gift.mode === 'single' ? 'gift.claim.forYou' : 'gift.claim.packetForYou')} />}
            {gift.mode === 'group' && !result ? (
              <p className={styles.note}>
                <Icon name="alert" size={14} />
                {t('gift.claim.groupNote', { left: gift.packetsLeft, total: gift.packetsTotal })}
              </p>
            ) : null}
            {result ? (
              <ClaimCelebration
                amount={formatAmount(result.amount)}
                asset={result.asset}
                message={`${t(result.destination === 'vault' ? 'gift.claim.doneVault' : 'gift.claim.doneAddress', { amount: formatAmount(result.amount), asset: result.asset })}${result.gasDrop > 0n ? ` ${t('gift.claim.gasDropApplied', { amount: formatAmount(result.gasDrop) })}` : ''}`}
                action={result.destination === 'vault' ? <ButtonLink to="/vault?tab=notes" variant="secondary">{t('gift.claim.openVault')}</ButtonLink> : undefined}
              />
            ) : gift.status !== 'ready' ? (
              <Card>
                <p className={styles.callout} role="status">
                  <Icon name={gift.status === 'in_review' ? 'clock' : 'info'} />
                  <span>{t(`gift.claim.status.${gift.status}`)}</span>
                </p>
              </Card>
            ) : (
              <Card title={t('gift.claim.whereTitle')}>
                <div className={styles.form}>
                  <Segmented<Target> legend={t('gift.claim.where')} hideLegend value={target} onChange={setTarget} options={[{ value: 'vault', label: t('gift.claim.toVault') }, { value: 'address', label: t('gift.claim.toAddress') }]} caption={t(target === 'vault' ? 'gift.claim.toVaultHint' : 'gift.claim.toAddressHint')} />
                  {target === 'address' ? (
                    <>
                      <Input label={t('gift.claim.address')} mono value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" error={address && !addressOk ? t('send.form.badFormat') : undefined} autoCapitalize="none" spellCheck={false} />
                      {gift.gasDropOffered ? <Switch checked={gasDrop} onChange={setGasDropChoice} label={t('send.form.gasDrop')} description={t('gift.claim.gasHint')} /> : null}
                      {gift.gasDropNote ? <p className={styles.note}>{t(`send.gasDrop.note.${gift.gasDropNote}`)}</p> : null}
                    </>
                  ) : null}
                  <PrivacyCheck state={privacy} />
                  <Button size="lg" block icon="gift" onClick={claim} loading={claimer.busy} disabled={target === 'address' && !addressOk}>
                    {t('gift.claim.cta', { amount: formatAmount(gift.amount), asset: gift.asset })}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </Loaded>
      <PrivacyConfirm open={confirming} assessment={assessment} busy={claimer.busy} onClose={() => setConfirming(false)} onConfirm={claim} />
    </div>
  );
}
