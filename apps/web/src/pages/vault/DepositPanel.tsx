import { useState } from 'react';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Icon } from '../../components/Icon/Icon';
import { PrivacyMeter } from '../../components/PrivacyMeter/PrivacyMeter';
import { Segmented } from '../../components/Segmented/Segmented';
import { StepFlow } from '../../components/StepFlow/StepFlow';
import { useToast } from '../../components/Toast/Toast';
import { UnitPicker } from '../../components/UnitPicker/UnitPicker';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Asset } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { Loaded } from '../shared/Loaded';
import { noteTone } from '../shared/status';
import styles from '../page.module.css';

const COUNTS = ['1', '2', '3', '5'] as const;

export function DepositPanel() {
  const { t } = useI18n();
  const ds = useDataSource();
  const { show } = useToast();
  const [asset, setAsset] = useState<Asset>('BNB');
  const [unit, setUnit] = useState<bigint | null>(null);
  const [count, setCount] = useState<(typeof COUNTS)[number]>('1');
  const [lastNoteIds, setLastNoteIds] = useState<readonly string[]>([]);
  const data = useResource(async (source) => {
    const [config, balances, notes] = await Promise.all([source.getVaultConfig(), source.getBalances(), source.listNotes()]);
    return { config, balances, notes };
  }, ['balances', 'notes']);
  const deposit = useAction(ds.deposit.bind(ds));

  const submit = async (): Promise<void> => {
    if (unit === null) return;
    const result = await deposit.run({ asset, unit, count: Number(count) });
    if (!result) return;
    setLastNoteIds(result.notes.map((n) => n.id));
    show({ tone: 'ok', title: t('vault.deposit.sent'), body: t('vault.deposit.sentBody') });
  };

  return (
    <Loaded resource={data}>
      {({ config, balances, notes }) => {
        const option = config.units[asset].find((u) => u.net === unit) ?? null;
        const n = BigInt(count);
        const tracked = notes.filter((note) => lastNoteIds.includes(note.id));
        const allApproved = tracked.length > 0 && tracked.every((note) => note.status === 'approved');
        const step = tracked.length === 0 ? (unit === null ? 0 : 1) : allApproved ? 4 : 2;
        const wallet = balances.publicWallet?.[asset] ?? null;
        const insufficient = option !== null && wallet !== null && wallet < option.gross * n;
        return (
          <div className={styles.split}>
            <Card title={t('vault.deposit.title')}>
              <div className={styles.form}>
                <StepFlow
                  label={t('vault.deposit.stepsLabel')}
                  current={step}
                  steps={[t('vault.deposit.steps.choose'), t('vault.deposit.steps.confirm'), t('vault.deposit.steps.review'), t('vault.deposit.steps.mixed')]}
                />
                <Segmented
                  legend={t('common.asset')}
                  options={[
                    { value: 'BNB', label: 'BNB' },
                    { value: 'USDT', label: 'USDT' },
                  ]}
                  value={asset}
                  onChange={(next) => {
                    setAsset(next);
                    setUnit(null);
                  }}
                />
                <UnitPicker asset={asset} options={config.units[asset]} value={unit} onChange={setUnit} feeBps={config.vettingFeeBps} count={Number(count)} />
                <Segmented legend={t('vault.deposit.count')} size="sm" options={COUNTS.map((c) => ({ value: c, label: `×${c}` }))} value={count} onChange={setCount} />
                {option ? (
                  <dl className={styles.kv}>
                    <dt>{t('vault.deposit.youSend')}</dt>
                    <dd className={styles.mono}>{formatAmount(option.gross * n, { maxFraction: 6 })} {asset}</dd>
                    <dt>{t('vault.deposit.fee', { fee: (config.vettingFeeBps / 100).toFixed(2) })}</dt>
                    <dd className={styles.mono}>{formatAmount(option.fee * n, { maxFraction: 6 })} {asset}</dd>
                    <dt className={styles.kvTotal}>{t('vault.deposit.lands')}</dt>
                    <dd className={[styles.kvTotal, styles.mono].join(' ')}>{formatAmount(option.net * n, { maxFraction: 6 })} {asset}</dd>
                  </dl>
                ) : null}
                <p className={styles.note}>
                  <Icon name="wallet" size={14} />
                  {wallet === null ? t('vault.deposit.noWallet') : t('vault.deposit.walletBalance', { amount: formatAmount(wallet), asset })}
                </p>
                <Button size="lg" block onClick={submit} loading={deposit.busy} disabled={unit === null || insufficient || wallet === null}>
                  {insufficient ? t('vault.deposit.insufficient') : t('vault.deposit.cta')}
                </Button>
              </div>
            </Card>
            <div className={styles.stack}>
              <Card tone="subtle" title={t('vault.deposit.howTitle')}>
                <ul className={styles.bullets}>
                  <li>{t('vault.deposit.how1')}</li>
                  <li>{t('vault.deposit.how2')}</li>
                  <li>{t('vault.deposit.how3')}</li>
                </ul>
              </Card>
              {tracked.length > 0 ? (
                <Card title={t('vault.deposit.trackTitle')} aria-live="polite">
                  <ul className={styles.list}>
                    {tracked.map((note) => (
                      <li key={note.id} className={styles.row}>
                        <div className={styles.rowMain}>
                          <span className={styles.rowTitle}>
                            {formatAmount(note.amount)} {note.asset}
                          </span>
                          <PrivacyMeter mixedWith={note.mixedWith} pending={note.status === 'in_review'} />
                        </div>
                        <Badge tone={noteTone[note.status]}>{t(`notes.status.${note.status}`)}</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}
