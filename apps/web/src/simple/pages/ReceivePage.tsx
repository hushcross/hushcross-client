import { useState } from 'react';
import { AddressDisplay } from '../../components/AddressDisplay/AddressDisplay';
import { Button } from '../../components/Button/Button';
import { CopyButton } from '../../components/CopyButton/CopyButton';
import { Icon } from '../../components/Icon/Icon';
import { Input } from '../../components/Input/Input';
import { QrCode } from '../../components/QrCode/QrCode';
import { Segmented } from '../../components/Segmented/Segmented';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Asset } from '../../data/types';
import { parseAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { absoluteLink } from '../../pages/send/RequestPanel';
import { OneTimeFunds } from '../../pages/send/OneTimeFunds';
import { Coin } from '../../components/Coin/Coin';
import { actionShareKey } from '../parts/actions';
import { Guide } from '../parts/Guide';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import s from '../simple.module.css';
import page from '../../pages/page.module.css';

/** Share a Hush ID (QR / link, optional amount); move what arrived into the vault. */
export function ReceivePage() {
  const { t } = useI18n();
  const fmt = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const account = useResource((source) => source.getAccount(), ['account']);
  const incoming = useResource((source) => source.listIncoming(), ['send']);
  const claim = useAction(ds.claimShortName.bind(ds));
  const move = useAction(ds.redepositIncoming.bind(ds));
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [asset, setAsset] = useState<Asset>('USDT');
  const [amountText, setAmountText] = useState('');
  const amount = parseAmount(amountText);

  const id = account.data ? (account.data.hushId ?? account.data.metaAddress) : null;
  const query = amount !== null && amount > 0n ? `?asset=${asset}&units=${amountText.trim()}` : '';
  const link = id ? absoluteLink(`/pay/${encodeURIComponent(id)}${query}`) : null;

  const submitName = async (): Promise<void> => {
    const result = await claim.run(name.replace(/^@/, ''));
    if (!result) return;
    if (result.ok) {
      setNameError(undefined);
      show({ tone: 'ok', title: t('simple.receive.claimed', { name: name.replace(/^@/, '') }) });
    } else setNameError(t(result.reason === 'taken' ? 'simple.receive.taken' : 'simple.receive.invalid'));
  };

  const waiting = (incoming.data ?? []).filter((i) => i.status === 'unclaimed');

  return (
    <div className={page.stack}>
      <PageHeader leading={<Coin icon="receive" tone="vault" size="sm" share={actionShareKey('receive')} />} kicker={t('simple.tiles.receive.title')} title={t('simple.receive.title')} subtitle={t('simple.receive.subtitle')} back={{ to: '/', label: t('nav.home') }} />
      <div className={page.split}>
        <section className={s.panel} aria-label={t('simple.receive.yourId')}>
          {account.data && link ? (
            <>
              <div className={s.result} style={{ alignItems: 'center', textAlign: 'center' }}>
                <QrCode value={link} label={t('simple.receive.qr')} size={188} />
                <span className={s.tileTitle}>{account.data.hushId ? `@${account.data.hushId}` : t('simple.receive.noName')}</span>
                {account.data.hushId === null ? <AddressDisplay value={account.data.metaAddress} kind="none" keep={8} label={t('simple.receive.yourId')} /> : null}
              </div>
              <div className={s.linkBox}>
                <span className={s.linkText}>{link}</span>
                <CopyButton value={link} label={t('simple.receive.copy')} />
              </div>
              <div className={s.askField}>
                <Segmented<Asset> legend={t('simple.receive.ask')} size="sm" value={asset} onChange={setAsset} options={[{ value: 'USDT', label: 'USDT' }, { value: 'BNB', label: 'BNB' }]} />
                <Input label={t('simple.receive.askAmount')} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(',', '.'))} suffix={asset} hint={t('simple.receive.askHint')} />
              </div>
              <p className={s.hint}>
                <Icon name="shield" size={16} />
                {t('simple.receive.how')}
              </p>
            </>
          ) : (
            <Skeleton lines={4} height={40} label={t('common.loading')} />
          )}
        </section>
        <div className={page.stack}>
          {account.data && account.data.hushId === null ? (
            <section className={s.panel}>
              <h2 className={s.sectionTitle}>{t('simple.receive.claim')}</h2>
              <Input label={t('simple.receive.name')} hint={t('simple.receive.claimHint')} value={name} onChange={(e) => setName(e.target.value)} error={nameError} autoCapitalize="none" spellCheck={false} />
              <Button onClick={() => void submitName()} loading={claim.busy} disabled={name.replace(/^@/, '').length < 3}>
                {t('simple.receive.claimCta')}
              </Button>
            </section>
          ) : null}
          <section className={s.panel}>
            <h2 className={s.sectionTitle}>{t('simple.receive.incoming')}</h2>
            {incoming.status === 'loading' ? (
              <Skeleton lines={2} height={40} label={t('common.loading')} />
            ) : waiting.length === 0 ? (
              <p className={s.hint}>{t('simple.receive.none')}</p>
            ) : (
              <ul className={s.pickList}>
                {waiting.map((item) => (
                  <li key={item.id} className={[s.who, s.whoAction].join(' ')}>
                    <Coin icon="receive" tone="vault" size="sm" />
                    <span className={s.whoMain}>
                      <span className={s.whoName}>{fmt.amount(item.amount, item.asset)}</span>
                      <span className={s.whoNote}>{fmt.relative(item.at)}</span>
                    </span>
                    <Button size="sm" variant="secondary" icon="vault" loading={move.busy} onClick={() => void move.run(item.id)}>
                      {t('simple.receive.toVault')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className={s.hint}>{t('simple.receive.toVaultHint')}</p>
          </section>
          <section className={s.panel} aria-labelledby="receive-onetime-title">
            <h2 id="receive-onetime-title" className={s.sectionTitle}>
              {t('oneTime.title')}
            </h2>
            <OneTimeFunds />
          </section>
        </div>
      </div>
      <Guide kind="receive" />
    </div>
  );
}
