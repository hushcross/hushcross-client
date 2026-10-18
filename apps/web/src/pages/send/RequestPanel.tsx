import { publicAppUrl } from '../../platform/runtime';
import { useState } from 'react';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { CopyButton } from '../../components/CopyButton/CopyButton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Input } from '../../components/Input/Input';
import { QrCode } from '../../components/QrCode/QrCode';
import { Segmented } from '../../components/Segmented/Segmented';
import { UnitPicker } from '../../components/UnitPicker/UnitPicker';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Asset, PaymentRequest } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { Loaded } from '../shared/Loaded';
import styles from '../page.module.css';
import local from './Send.module.css';

export const absoluteLink = publicAppUrl;

export function RequestPanel() {
  const { t } = useI18n();
  const f = useFormat();
  const ds = useDataSource();
  const [asset, setAsset] = useState<Asset>('USDT');
  const [unit, setUnit] = useState<bigint | null>(null);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<PaymentRequest | null>(null);
  const data = useResource(async (source) => {
    const [config, account, requests] = await Promise.all([source.getVaultConfig(), source.getAccount(), source.listPaymentRequests()]);
    return { config, account, requests };
  }, ['send', 'account']);
  const creator = useAction(ds.createPaymentRequest.bind(ds));

  const submit = async (): Promise<void> => {
    if (unit === null) return;
    const request = await creator.run({ asset, unit, count: 1, note });
    if (request) {
      setCreated(request);
      setNote('');
    }
  };

  return (
    <Loaded resource={data}>
      {({ config, account, requests }) => (
        <div className={styles.split}>
          <Card title={t('request.title')}>
            {account.hushId === null ? (
              <EmptyState icon="user" title={t('request.needIdTitle')} body={t('request.needIdBody')} />
            ) : (
              <div className={styles.form}>
                <Segmented legend={t('common.asset')} options={[{ value: 'USDT', label: 'USDT' }, { value: 'BNB', label: 'BNB' }]} value={asset} onChange={(next) => { setAsset(next); setUnit(null); }} />
                <UnitPicker asset={asset} options={config.units[asset]} value={unit} onChange={setUnit} feeBps={config.vettingFeeBps} showGross={false} label={t('request.amount')} />
                <Input label={t('request.note')} hint={t('request.noteHint')} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
                <Button icon="link" onClick={submit} loading={creator.busy} disabled={unit === null}>
                  {t('request.cta')}
                </Button>
                {created ? (
                  <div className={styles.stackSm} role="status">
                    <div className={local.linkBox}>
                      <span className={local.linkText}>{absoluteLink(created.path)}</span>
                      <CopyButton value={absoluteLink(created.path)} />
                    </div>
                    <QrCode value={absoluteLink(created.path)} label={t('request.qrLabel')} size={168} />
                  </div>
                ) : null}
              </div>
            )}
          </Card>
          <Card title={t('request.listTitle')}>
            {requests.length === 0 ? (
              <EmptyState icon="link" title={t('request.emptyTitle')} />
            ) : (
              <ul className={styles.list}>
                {requests.map((r) => (
                  <li key={r.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{r.note || r.path}</span>
                      <span className={styles.rowSub}>{f.date(r.createdAt)}</span>
                    </div>
                    <div className={styles.rowEnd}>
                      <span className={styles.amount}>
                        {formatAmount(r.unit * BigInt(r.count))} {r.asset}
                      </span>
                      <Badge tone={r.status === 'paid' ? 'ok' : 'accent'}>{t(`request.status.${r.status}`)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </Loaded>
  );
}
