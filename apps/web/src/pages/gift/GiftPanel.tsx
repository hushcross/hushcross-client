import { useState } from 'react';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { PublicActionDialog } from '../../components/Dialog/PublicActionDialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { PrivacyCheck } from '../../components/PrivacyCheck/PrivacyCheck';
import { Segmented } from '../../components/Segmented/Segmented';
import { useToast } from '../../components/Toast/Toast';
import { UnitPicker } from '../../components/UnitPicker/UnitPicker';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Asset, Funding, Gift, GiftMode } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { usePrivacyCheck } from '../../hooks/usePrivacyCheck';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../lib/preferences';
import { useFormat } from '../../lib/useFormat';
import { Loaded } from '../shared/Loaded';
import styles from '../page.module.css';
import { GiftFace, GiftShare } from './GiftCard';
import local from './Gift.module.css';

type Kind = 'single' | 'packet';
type PacketMode = Exclude<GiftMode, 'single'>;
const EXPIRY = ['1', '24', '72', '168'] as const;

function MyGifts() {
  const { t } = useI18n();
  const f = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const gifts = useResource((source) => source.listMyGifts(), ['gifts']);
  const reclaimer = useAction(ds.reclaimGift.bind(ds));
  return (
    <Card title={t('gift.mine.title')}>
      <Loaded resource={gifts}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState icon="gift" illo="gift" title={t('gift.mine.emptyTitle')} body={t('gift.mine.emptyBody')} />
          ) : (
            <ul className={styles.list}>
              {items.map((gift) => {
                const claimed = gift.packets.filter((p) => p.status === 'claimed').length;
                const reclaimed = gift.packets.some((p) => p.status === 'reclaimed');
                const unclaimed = gift.packets.filter((p) => p.status === 'unclaimed').length;
                const expired = Date.now() >= gift.expiresAt;
                const tone = unclaimed === 0 ? (reclaimed ? 'neutral' : 'ok') : expired ? 'warn' : 'accent';
                const label = unclaimed === 0 ? (reclaimed ? t('gift.mine.status.reclaimed') : t('gift.mine.status.claimed')) : expired ? t('gift.mine.status.expired') : t('gift.mine.status.open');
                return (
                  <li key={gift.id} className={[styles.row, local.giftRow].join(' ')}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>
                        {formatAmount(gift.total)} {gift.asset} · {t(`gift.mode.${gift.mode}`)}
                      </span>
                      <span className={styles.rowSub}>
                        {t('gift.mine.claimedOf', { claimed, total: gift.packets.length })} · {expired ? t('gift.mine.expiredAt', { date: f.dateTime(gift.expiresAt) }) : t('gift.mine.expiresAt', { date: f.dateTime(gift.expiresAt) })}
                      </span>
                      <span className={local.packetDots} aria-hidden="true">
                        {gift.packets.map((p) => (
                          <span key={p.index} className={[local.packetDot, p.status === 'claimed' ? local.packetClaimed : p.status === 'reclaimed' ? local.packetReclaimed : ''].join(' ')} />
                        ))}
                      </span>
                    </div>
                    <div className={styles.rowEnd}>
                      <Badge tone={tone}>{label}</Badge>
                      <div className={styles.actions}>
                        {!expired && unclaimed > 0 ? (
                          <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === gift.id ? null : gift.id)} aria-expanded={openId === gift.id}>
                            {openId === gift.id ? t('gift.mine.hideLinks') : t('gift.mine.showLinks')}
                          </Button>
                        ) : null}
                        {expired && unclaimed > 0 ? (
                          <Button size="sm" variant="secondary" icon="refresh" loading={reclaimer.busy} onClick={async () => (await reclaimer.run(gift.id)) && show({ tone: 'ok', title: t('gift.mine.reclaimed') })}>
                            {t('gift.mine.reclaim')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {openId === gift.id ? (
                      <div className={[styles.spaced, styles.fullRow].join(' ')}>
                        <GiftShare links={gift.links} />
                      </div>
                    ) : null}
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

export function GiftPanel() {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const { preferences } = usePreferences();
  const [kind, setKind] = useState<Kind>('packet');
  const [packetMode, setPacketMode] = useState<PacketMode>('group');
  const [asset, setAsset] = useState<Asset>('USDT');
  const [unit, setUnit] = useState<bigint | null>(null);
  const [unitsText, setUnitsText] = useState('10');
  const [packetsText, setPacketsText] = useState('5');
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]>('24');
  const [message, setMessage] = useState('');
  const [funding, setFunding] = useState<Funding>(preferences.defaultFunding);
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [created, setCreated] = useState<Gift | null>(null);
  const config = useResource((source) => source.getVaultConfig(), []);
  const creator = useAction(ds.createGift.bind(ds));

  const units = kind === 'single' ? Number(unitsText) || 0 : Number(unitsText) || 0;
  const packets = kind === 'single' ? 1 : Number(packetsText) || 0;
  const unitsError = units < 1 || units > 100 || !Number.isInteger(units) ? t('gift.create.unitsError') : undefined;
  const packetsError = kind === 'packet' && (packets < 2 || packets > 50 || packets > units) ? t('gift.create.packetsError') : undefined;
  const valid = unit !== null && !unitsError && !packetsError;
  const total = unit !== null ? unit * BigInt(Math.max(0, units)) : 0n;
  const mode: GiftMode = kind === 'single' ? 'single' : packetMode;
  const privacy = usePrivacyCheck(valid && funding === 'vault' && unit !== null ? { action: 'gift_create', asset, units: Array.from({ length: units }, () => unit), recipientAddress: null, relayDelayMinutes: preferences.relayDelayMinutes } : null);

  const submit = async (): Promise<void> => {
    if (!valid || unit === null) return;
    const gift = await creator.run({ mode, asset, unit, units, packets, expiryHours: Number(expiry), message, funding });
    setConfirmPublic(false);
    if (!gift) return;
    setCreated(gift);
    setMessage('');
    show({ tone: 'ok', title: t('gift.create.done') });
  };

  return (
    <div className={styles.stack}>
      <div className={styles.split}>
        <Card title={t('gift.create.title')}>
          <Loaded resource={config}>
            {(cfg) => (
              <div className={styles.form}>
                <Segmented<Kind> legend={t('gift.create.kind')} value={kind} onChange={(k) => { setKind(k); setUnitsText(k === 'single' ? '1' : '10'); }} options={[{ value: 'single', label: t('gift.mode.single') }, { value: 'packet', label: t('gift.create.packet') }]} />
                {kind === 'packet' ? (
                  <Segmented<PacketMode>
                    legend={t('gift.create.packetMode')}
                    value={packetMode}
                    onChange={setPacketMode}
                    options={[{ value: 'group', label: t('gift.mode.group') }, { value: 'personal', label: t('gift.mode.personal') }]}
                    caption={t(packetMode === 'group' ? 'gift.create.groupHint' : 'gift.create.personalHint')}
                  />
                ) : null}
                {kind === 'packet' && packetMode === 'group' ? (
                  <p className={[styles.callout, styles.calloutDanger].join(' ')}>
                    <Icon name="alert" />
                    <span>{t('gift.groupCaveat')}</span>
                  </p>
                ) : null}
                <Segmented legend={t('common.asset')} options={[{ value: 'USDT', label: 'USDT' }, { value: 'BNB', label: 'BNB' }]} value={asset} onChange={(next) => { setAsset(next); setUnit(null); }} />
                <UnitPicker asset={asset} options={cfg.units[asset]} value={unit} onChange={setUnit} feeBps={cfg.vettingFeeBps} showGross={false} label={t('gift.create.unit', { asset })} count={units} />
                <div className={styles.formRow}>
                  <Input label={t('gift.create.units')} type="number" min={1} max={100} value={unitsText} onChange={(e) => setUnitsText(e.target.value)} error={unitsError} />
                  {kind === 'packet' ? <Input label={t('gift.create.packets')} type="number" min={2} max={50} value={packetsText} onChange={(e) => setPacketsText(e.target.value)} hint={t('gift.create.packetsHint')} error={packetsError} /> : null}
                </div>
                <Segmented legend={t('gift.create.expiry')} size="sm" value={expiry} onChange={setExpiry} options={EXPIRY.map((h) => ({ value: h, label: t(`gift.expiry.h${h}`) }))} caption={t('gift.create.expiryHint')} />
                <Input label={t('gift.create.message')} value={message} maxLength={140} onChange={(e) => setMessage(e.target.value)} hint={t('gift.create.messageHint')} />
                <Segmented<Funding> legend={t('gift.create.funding')} value={funding} onChange={setFunding} options={[{ value: 'vault', label: t('common.funding.vault') }, { value: 'public', label: t('common.funding.public') }]} caption={t(funding === 'vault' ? 'gift.create.fundingVault' : 'gift.create.fundingPublic')} />
                <PrivacyCheck state={privacy} />
                {unit !== null ? (
                  <dl className={styles.kv}>
                    <dt className={styles.kvTotal}>{t('gift.create.total')}</dt>
                    <dd className={[styles.kvTotal, styles.mono].join(' ')}>{formatAmount(total)} {asset}</dd>
                  </dl>
                ) : null}
                <Button size="lg" block icon="gift" disabled={!valid} loading={creator.busy && !confirmPublic} onClick={() => (funding === 'public' ? setConfirmPublic(true) : void submit())}>
                  {t(kind === 'single' ? 'gift.create.ctaSingle' : 'gift.create.ctaPacket')}
                </Button>
              </div>
            )}
          </Loaded>
        </Card>
        <div className={styles.stack}>
          {created ? (
            <Card title={t('gift.create.readyTitle')}>
              <div className={styles.stack}>
                <GiftFace mode={created.mode} asset={created.asset} amount={created.total} message={created.message} packets={created.packets.length} expiresAt={created.expiresAt} />
                <GiftShare links={created.links} />
                {created.mode === 'group' ? <p className={styles.note}><Icon name="alert" size={14} />{t('gift.groupCaveat')}</p> : null}
              </div>
            </Card>
          ) : (
            <GiftFace mode={mode} asset={asset} amount={total} message={message} packets={packets} expiresAt={Date.now() + Number(expiry) * 3_600_000} caption={t('gift.create.preview')} />
          )}
          {created ? null : (
            <Card tone="subtle" title={t('gift.how.title')}>
              <ul className={styles.bullets}>
                <li>{t('gift.how.one')}</li>
                <li>{t('gift.how.two')}</li>
                <li>{t('gift.how.three')}</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
      <MyGifts />
      <PublicActionDialog open={confirmPublic} title={t('gift.create.publicTitle')} description={t('gift.create.publicBody')} reveals={[t('gift.create.publicReveal1'), t('gift.create.publicReveal2')]} confirmLabel={t('gift.create.publicConfirm')} busy={creator.busy} onClose={() => setConfirmPublic(false)} onConfirm={submit} />
    </div>
  );
}
