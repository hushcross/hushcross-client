import { useState } from 'react';
import { AddressDisplay } from '../../components/AddressDisplay/AddressDisplay';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { CopyButton } from '../../components/CopyButton/CopyButton';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { QrCode } from '../../components/QrCode/QrCode';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { Loaded } from '../shared/Loaded';
import { incomingTone } from '../shared/status';
import styles from '../page.module.css';
import { OneTimeFunds } from './OneTimeFunds';
import { absoluteLink } from './RequestPanel';
import local from './Send.module.css';

export function ReceivePanel() {
  const { t } = useI18n();
  const f = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const account = useResource((source) => source.getAccount(), ['account']);
  const incoming = useResource((source) => source.listIncoming(), ['send']);
  const redeposit = useAction(ds.redepositIncoming.bind(ds));
  const claim = useAction(ds.claimShortName.bind(ds));

  const submitName = async (): Promise<void> => {
    const result = await claim.run(name);
    if (!result) return;
    if (result.ok) {
      show({ tone: 'ok', title: t('receive.claimed', { id: name.replace(/^@/, '') }) });
      setNameError(undefined);
    } else setNameError(t(result.reason === 'taken' ? 'receive.taken' : 'receive.invalid'));
  };

  return (
    <div className={styles.split}>
      <Card title={t('receive.idTitle')}>
        <Loaded resource={account}>
          {(a) => {
            const link = a.hushId ? absoluteLink(`/pay/${a.hushId}`) : null;
            return (
              <div className={styles.stack}>
                <div className={local.idCard}>
                  {link ? <QrCode value={link} label={t('receive.qrLabel', { id: a.hushId ?? '' })} size={152} /> : null}
                  <div className={local.idText}>
                    <span className={local.idName}>{a.hushId ? `@${a.hushId}` : t('receive.noName')}</span>
                    <span className={styles.statLabel}>{t('receive.meta')}</span>
                    <AddressDisplay value={a.metaAddress} kind="none" keep={6} label={t('receive.meta')} />
                    {link ? <CopyButton value={link} label={t('receive.copyLink')} /> : null}
                  </div>
                </div>
                <p className={styles.note}>{t('receive.explain')}</p>
                {a.identityAddress ? (
                  <div className={styles.stackSm}>
                    <span className={styles.statLabel}>{t('send.hushId.identityAddress')}</span>
                    <AddressDisplay value={a.identityAddress} label={t('send.hushId.identityAddress')} />
                  </div>
                ) : null}
                {a.hushId === null ? (
                  <div className={styles.form}>
                    <Input label={t('receive.claimLabel')} hint={t('receive.claimHint')} value={name} onChange={(e) => setName(e.target.value)} error={nameError} autoCapitalize="none" suffix={t('send.hushId.directoryLabel')} />
                    <p className={styles.note}>
                      <Icon name="shield" size={14} />
                      {t('send.hushId.viaRelay')}
                    </p>
                    <p className={styles.note}>
                      <Icon name="info" size={14} />
                      {t('send.hushId.directoryHint')}
                    </p>
                    <Button onClick={submitName} loading={claim.busy} disabled={name.length < 3}>
                      {t('receive.claimCta')}
                    </Button>
                  </div>
                ) : (
                  <p className={styles.note}>
                    <Icon name="info" size={14} />
                    {t('send.hushId.directoryHint')}
                  </p>
                )}
              </div>
            );
          }}
        </Loaded>
      </Card>
      <Card title={t('receive.incomingTitle')}>
        <Loaded resource={incoming}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="arrowDown" illo="receive" title={t('receive.emptyTitle')} body={t('receive.emptyBody')} />
            ) : (
              <ul className={styles.list}>
                {items.map((item) => (
                  <li key={item.id} className={[styles.row, local.incomingRow].join(' ')}>
                    <div className={styles.rowMain}>
                      <span className={styles.amount}>{f.amount(item.amount, item.asset)}</span>
                      <span className={styles.rowSub}>{f.relative(item.at)}</span>
                      <AddressDisplay value={item.stealthAddress} label={t('receive.oneTime')} />
                    </div>
                    <div className={styles.rowEnd}>
                      <Badge tone={incomingTone[item.status]}>{t(`receive.status.${item.status}`)}</Badge>
                      {item.status === 'unclaimed' ? (
                        <Button size="sm" variant="secondary" icon="vault" onClick={() => void redeposit.run(item.id)} loading={redeposit.busy}>
                          {t('receive.redeposit')}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Loaded>
      </Card>
      <Card title={t('oneTime.title')}>
        <OneTimeFunds />
      </Card>
    </div>
  );
}
