import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/Badge/Badge';
import { PrivacyCheck, PrivacyConfirm } from '../../components/PrivacyCheck/PrivacyCheck';
import { usePrivacyCheck } from '../../hooks/usePrivacyCheck';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Segmented } from '../../components/Segmented/Segmented';
import { Switch } from '../../components/Switch/Switch';
import { useToast } from '../../components/Toast/Toast';
import { UnitPicker } from '../../components/UnitPicker/UnitPicker';
import { useDataSource, useResource } from '../../data/DataProvider';
import type { Asset, PrivacyContextRequest, SendQuote, SendRequest } from '../../data/types';
import { formatAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import { usePreferences } from '../../lib/preferences';
import { useFormat } from '../../lib/useFormat';
import { Loaded } from '../shared/Loaded';
import { jobTone } from '../shared/status';
import styles from '../page.module.css';
import local from './Send.module.css';
import { RecipientField, recipientOf } from './RecipientField';
import { useRecipient } from './useRecipient';

const COUNTS = ['1', '2', '3'] as const;

export function SendForm() {
  const { t } = useI18n();
  const f = useFormat();
  const ds = useDataSource();
  const { show } = useToast();
  const { preferences } = usePreferences();
  const [input, setInput] = useState('');
  const [asset, setAsset] = useState<Asset>('USDT');
  const [unit, setUnit] = useState<bigint | null>(null);
  const [count, setCount] = useState<(typeof COUNTS)[number]>('1');
  const [delay, setDelay] = useState(preferences.relayDelayMinutes);
  const [gasDrop, setGasDrop] = useState(false);
  // The switch follows the decided rules (quote.gasDropDefaultOn) until the user flips it.
  const [gasDropTouched, setGasDropTouched] = useState(false);
  const [quote, setQuote] = useState<SendQuote | null>(null);
  const recipientState = useRecipient(input);
  const recipient = recipientOf(recipientState);
  const data = useResource(async (source) => {
    const [config, balances] = await Promise.all([source.getVaultConfig(), source.getBalances()]);
    return { config, balances };
  }, ['balances']);
  const jobs = useResource((source) => source.listRelayJobs(), ['send']);
  const sender = useAction(ds.send.bind(ds));
  const [confirming, setConfirming] = useState(false);

  const request: SendRequest | null = useMemo(
    () => (recipient && unit !== null ? { recipient, asset, units: Array.from({ length: Number(count) }, () => unit), relayDelayMinutes: delay, gasDrop } : null),
    [recipient, unit, asset, count, delay, gasDrop],
  );

  const privacyRequest: PrivacyContextRequest | null = useMemo(
    () => (request ? { action: 'send', asset: request.asset, units: request.units, recipientAddress: request.recipient.kind === 'address' ? request.recipient.address : null, relayDelayMinutes: request.relayDelayMinutes } : null),
    [request],
  );
  const privacy = usePrivacyCheck(privacyRequest);
  const assessment = privacy.status === 'ready' ? privacy.assessment : null;

  useEffect(() => {
    let cancelled = false;
    if (!request) {
      setQuote(null);
      return undefined;
    }
    ds.quoteSend(request)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ds, request]);

  const defaultOn = quote?.gasDropDefaultOn ?? null;
  useEffect(() => {
    if (defaultOn !== null && !gasDropTouched) setGasDrop(defaultOn);
  }, [defaultOn, gasDropTouched]);

  const submit = async (): Promise<void> => {
    if (!request) return;
    if (assessment?.requiresConfirm && !confirming) {
      setConfirming(true);
      return;
    }
    const job = await sender.run(request);
    setConfirming(false);
    if (!job) return;
    show({ tone: 'ok', title: t('send.form.queued'), body: delay > 0 ? t('send.form.queuedDelay', { n: delay }) : t('send.form.queuedNow') });
    setInput('');
    setUnit(null);
  };

  return (
    <div className={styles.split}>
      <Card title={t('send.form.title')}>
        <Loaded resource={data}>
          {({ config, balances }) => {
            const vault = balances.vault[asset];
            const needed = unit === null ? 0n : unit * BigInt(count);
            const insufficient = unit !== null && vault < needed;
            return (
              <div className={styles.form}>
                <RecipientField value={input} onChange={setInput} state={recipientState} />
                <Segmented legend={t('common.asset')} options={[{ value: 'USDT', label: 'USDT' }, { value: 'BNB', label: 'BNB' }]} value={asset} onChange={(next) => { setAsset(next); setUnit(null); }} />
                <UnitPicker asset={asset} options={config.units[asset]} value={unit} onChange={setUnit} feeBps={config.vettingFeeBps} showGross={false} count={Number(count)} label={t('send.form.amount', { asset })} />
                <Segmented legend={t('send.form.count')} size="sm" options={COUNTS.map((c) => ({ value: c, label: `×${c}` }))} value={count} onChange={setCount} />
                <div className={styles.stackSm}>
                  <label htmlFor="relay-delay" className={local.rangeLabel}>
                    <span>{t('send.form.delay')}</span>
                    <span className={styles.mono}>{delay === 0 ? t('send.form.delayNone') : t('send.form.delayValue', { n: delay })}</span>
                  </label>
                  <input id="relay-delay" type="range" min={0} max={config.maxRelayDelayMinutes} step={1} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className={local.range} aria-describedby="relay-delay-hint" />
                  <p id="relay-delay-hint" className={styles.note}>{t('send.form.delayHint')}</p>
                </div>
                {quote && !quote.gasDropOffered ? null : (
                  <Switch
                    checked={gasDrop}
                    onChange={(v) => {
                      setGasDropTouched(true);
                      setGasDrop(v);
                    }}
                    label={t('send.form.gasDrop')}
                    description={t('send.form.gasDropHint', { amount: formatAmount(config.defaultGasDrop) })}
                  />
                )}
                {quote?.gasDropNote ? <p className={styles.note}>{t(`send.gasDrop.note.${quote.gasDropNote}`)}</p> : null}
                <PrivacyCheck state={privacy} />
                {quote ? (
                  <dl className={styles.kv}>
                    <dt>{t('send.form.quoteAmount')}</dt>
                    <dd className={styles.mono}>{f.amount(quote.amount, asset, 6)}</dd>
                    <dt>{t('send.form.quoteFee', { bps: (quote.relayFeeBps / 100).toFixed(2) })}</dt>
                    <dd className={styles.mono}>{f.amount(quote.relayFee, asset, 6)}</dd>
                    {quote.gasDrop > 0n ? (
                      <>
                        <dt>{t('send.form.quoteGas')}</dt>
                        <dd className={styles.mono}>{f.amount(quote.gasDrop, 'BNB', 6)}</dd>
                      </>
                    ) : null}
                    <dt className={styles.kvTotal}>{t('send.form.quoteGets')}</dt>
                    <dd className={[styles.kvTotal, styles.mono].join(' ')}>{f.amount(quote.recipientGets, asset, 6)}</dd>
                  </dl>
                ) : null}
                <p className={styles.note}>{t('send.form.vaultAvailable', { amount: formatAmount(vault), asset })}</p>
                <Button size="lg" block icon="send" onClick={submit} loading={sender.busy} disabled={!request || insufficient}>
                  {insufficient ? t('send.form.insufficient') : t('send.form.cta')}
                </Button>
              </div>
            );
          }}
        </Loaded>
      </Card>
      <PrivacyConfirm open={confirming} assessment={assessment} busy={sender.busy} onClose={() => setConfirming(false)} onConfirm={submit} />
      <Card title={t('send.jobs.title')}>
        <Loaded resource={jobs}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState icon="send" illo="idle" title={t('send.jobs.emptyTitle')} body={t('send.jobs.emptyBody')} />
            ) : (
              <ul className={styles.list}>
                {items.map((job) => (
                  <li key={job.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{job.recipient.kind === 'hushId' ? `@${job.recipient.hushId}` : `${job.recipient.address.slice(0, 8)}…${job.recipient.address.slice(-4)}`}</span>
                      <span className={styles.rowSub}>{job.status === 'delayed' ? t('send.jobs.runsAt', { time: f.dateTime(job.executeAfter) }) : f.relative(job.createdAt)}</span>
                    </div>
                    <div className={styles.rowEnd}>
                      <span className={styles.amount}>{f.amount(job.amount, job.asset)}</span>
                      <Badge tone={jobTone[job.status]}>{t(`send.jobs.status.${job.status}`)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Loaded>
      </Card>
    </div>
  );
}
