import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Input, TextArea } from '../../components/Input/Input';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Segmented } from '../../components/Segmented/Segmented';
import { StepFlow } from '../../components/StepFlow/StepFlow';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource } from '../../data/DataProvider';
import { SALE_BOUNDS, validateSaleInput, type SaleField } from '../../data/launchRules';
import type { Asset, CreateSaleInput, Sale } from '../../data/types';
import { bpsToPercent, formatAmount, parseAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import styles from '../page.module.css';
import local from './Launch.module.css';
import { formatFull, formatPrice } from '../../lib/numberFormat';
import { SaleProfileForm } from './SaleProfileForm';

interface Draft {
  tokenName: string;
  tokenSymbol: string;
  description: string;
  totalSupply: string;
  saleAmount: string;
  floorPrice: string;
  minRaise: string;
  quoteAsset: Asset;
  commitHours: string;
  revealHours: string;
  liquidityPct: string;
  tokenLiquidityPct: string;
  creatorSharePct: string;
  creatorVestDays: string;
}

const INITIAL: Draft = {
  tokenName: '',
  tokenSymbol: '',
  description: '',
  totalSupply: '1000000000',
  saleAmount: '350000000',
  floorPrice: '0.00000025',
  minRaise: '50',
  quoteAsset: 'BNB',
  commitHours: '24',
  revealHours: '2',
  liquidityPct: '60',
  tokenLiquidityPct: '15',
  creatorSharePct: '5',
  creatorVestDays: '180',
};

const STEP_FIELDS: readonly (readonly SaleField[])[] = [
  ['tokenName', 'tokenSymbol', 'description', 'totalSupply'],
  ['saleAmount', 'floorPrice', 'minRaise', 'quoteAsset'],
  ['commitHours', 'revealHours'],
  ['liquidityBps', 'tokenLiquidityBps', 'creatorShareBps', 'creatorVestDays'],
  [],
];

const pctToBps = (text: string): number => Math.round(Number(text) * 100);

export function toSaleInput(d: Draft): CreateSaleInput {
  return {
    tokenName: d.tokenName,
    tokenSymbol: d.tokenSymbol.trim().toUpperCase(),
    description: d.description,
    totalSupply: parseAmount(d.totalSupply) ?? 0n,
    saleAmount: parseAmount(d.saleAmount) ?? 0n,
    floorPrice: parseAmount(d.floorPrice) ?? 0n,
    minRaise: parseAmount(d.minRaise) ?? -1n,
    quoteAsset: d.quoteAsset,
    commitHours: Number(d.commitHours),
    revealHours: Number(d.revealHours),
    liquidityBps: pctToBps(d.liquidityPct),
    tokenLiquidityBps: pctToBps(d.tokenLiquidityPct),
    creatorShareBps: pctToBps(d.creatorSharePct),
    creatorVestDays: Number(d.creatorVestDays),
  };
}

export function CreateSalePage() {
  const { t } = useI18n();
  const ds = useDataSource();
  const navigate = useNavigate();
  const { show } = useToast();
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<Sale | null>(null);
  const creator = useAction(ds.createSale.bind(ds));
  const input = useMemo(() => toSaleInput(draft), [draft]);
  const issues = useMemo(() => validateSaleInput(input), [input]);
  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const errorFor = (field: SaleField): string | undefined => {
    if (!touched) return undefined;
    const issue = issues.find((i) => i.field === field);
    return issue ? t(`launch.create.errors.${issue.code}`) : undefined;
  };

  const stepValid = (index: number): boolean => !issues.some((i) => (STEP_FIELDS[index] ?? []).includes(i.field));

  const next = (): void => {
    setTouched(true);
    if (!stepValid(step)) return;
    setTouched(false);
    setStep((s) => Math.min(4, s + 1));
  };

  const submit = async (): Promise<void> => {
    if (issues.length > 0) return;
    const sale = await creator.run(input);
    if (!sale) return;
    show({ tone: 'ok', title: t('launch.create.done') });
    setCreated(sale);
  };

  const b = SALE_BOUNDS;
  const steps = [t('launch.create.steps.token'), t('launch.create.steps.sale'), t('launch.create.steps.timing'), t('launch.create.steps.liquidity'), t('launch.create.steps.review')];

  if (created) {
    const open = (): void => {
      navigate(`/launch/${created.id}`);
    };
    return (
      <div className={styles.stack}>
        <PageHeader back={{ to: '/launch', label: t('nav.launch') }} title={t('saleProfile.created.title')} subtitle={t('saleProfile.created.body')} />
        <Card padding="lg" title={t('saleProfile.title')}>
          <SaleProfileForm
            sale={created}
            current={null}
            initialDescription={draft.description}
            onDone={() => {
              show({ tone: 'ok', title: t('saleProfile.status.done') });
              open();
            }}
            onCancel={open}
            cancelLabel={t('saleProfile.skip')}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <PageHeader back={{ to: '/launch', label: t('nav.launch') }} title={t('launch.create.title')} subtitle={t('launch.create.subtitle')} />
      <Card padding="lg">
        <div className={styles.form}>
          <StepFlow steps={steps} current={step} label={t('launch.create.stepsLabel')} />
          {step === 0 ? (
            <>
              <div className={styles.formRow}>
                <Input label={t('launch.create.name')} value={draft.tokenName} onChange={(e) => set('tokenName')(e.target.value)} error={errorFor('tokenName')} />
                <Input label={t('launch.create.symbol')} value={draft.tokenSymbol} onChange={(e) => set('tokenSymbol')(e.target.value.toUpperCase())} hint={t('launch.create.symbolHint')} error={errorFor('tokenSymbol')} mono />
              </div>
              <TextArea label={t('launch.create.description')} value={draft.description} onChange={(e) => set('description')(e.target.value)} maxLength={280} />
              <Input label={t('launch.create.supply')} inputMode="numeric" value={draft.totalSupply} onChange={(e) => set('totalSupply')(e.target.value)} hint={t('launch.create.supplyHint')} error={errorFor('totalSupply')} mono />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Segmented legend={t('launch.create.quote')} value={draft.quoteAsset} onChange={(v) => setDraft((d) => ({ ...d, quoteAsset: v }))} options={[{ value: 'BNB', label: 'BNB' }, { value: 'USDT', label: 'USDT' }]} />
              <Input label={t('launch.create.saleAmount')} inputMode="numeric" value={draft.saleAmount} onChange={(e) => set('saleAmount')(e.target.value)} error={errorFor('saleAmount')} mono />
              <div className={styles.formRow}>
                <Input label={t('launch.create.floor', { asset: draft.quoteAsset })} inputMode="decimal" value={draft.floorPrice} onChange={(e) => set('floorPrice')(e.target.value)} error={errorFor('floorPrice')} mono />
                <Input label={t('launch.create.minRaise', { asset: draft.quoteAsset })} inputMode="decimal" value={draft.minRaise} onChange={(e) => set('minRaise')(e.target.value)} hint={t('launch.create.minRaiseHint')} error={errorFor('minRaise')} mono />
              </div>
            </>
          ) : null}
          {step === 2 ? (
            <div className={styles.formRow}>
              <Input label={t('launch.create.commitHours')} type="number" min={b.commitHoursMin} max={b.commitHoursMax} value={draft.commitHours} onChange={(e) => set('commitHours')(e.target.value)} hint={t('launch.create.rangeHours', { min: b.commitHoursMin, max: b.commitHoursMax })} error={errorFor('commitHours')} />
              <Input label={t('launch.create.revealHours')} type="number" min={b.revealHoursMin} max={b.revealHoursMax} value={draft.revealHours} onChange={(e) => set('revealHours')(e.target.value)} hint={t('launch.create.rangeHours', { min: b.revealHoursMin, max: b.revealHoursMax })} error={errorFor('revealHours')} />
            </div>
          ) : null}
          {step === 3 ? (
            <>
              <div className={styles.formRow}>
                <Input label={t('launch.create.liquidity')} type="number" min={30} max={80} value={draft.liquidityPct} onChange={(e) => set('liquidityPct')(e.target.value)} suffix="%" hint={t('launch.create.rangePct', { min: 30, max: 80 })} error={errorFor('liquidityBps')} />
                <Input label={t('launch.create.tokenLiquidity')} type="number" min={10} max={100} value={draft.tokenLiquidityPct} onChange={(e) => set('tokenLiquidityPct')(e.target.value)} suffix="%" hint={t('launch.create.minPct', { min: 10 })} error={errorFor('tokenLiquidityBps')} />
              </div>
              <div className={styles.formRow}>
                <Input label={t('launch.create.creatorShare')} type="number" min={0} max={10} value={draft.creatorSharePct} onChange={(e) => set('creatorSharePct')(e.target.value)} suffix="%" hint={t('launch.create.maxPct', { max: 10 })} error={errorFor('creatorShareBps')} />
                <Input label={t('launch.create.vest')} type="number" min={b.creatorVestDaysMin} max={b.creatorVestDaysMax} value={draft.creatorVestDays} onChange={(e) => set('creatorVestDays')(e.target.value)} hint={t('launch.create.minDays', { min: b.creatorVestDaysMin })} error={errorFor('creatorVestDays')} />
              </div>
              <p className={styles.note}>{t('launch.create.lpLocked')}</p>
            </>
          ) : null}
          {step === 4 ? (
            <div>
              <div className={local.reviewGroup}>
                <p className={local.reviewTitle}>{steps[0]}</p>
                <dl className={styles.kv}>
                  <dt>{t('launch.create.name')}</dt>
                  <dd>{input.tokenName} (${input.tokenSymbol})</dd>
                  <dt>{t('launch.create.supply')}</dt>
                  <dd className={styles.mono}>{formatAmount(input.totalSupply, { maxFraction: 0 })}</dd>
                </dl>
              </div>
              <div className={local.reviewGroup}>
                <p className={local.reviewTitle}>{steps[1]}</p>
                <dl className={styles.kv}>
                  <dt>{t('launch.create.saleAmount')}</dt>
                  <dd className={styles.mono}>{formatAmount(input.saleAmount, { maxFraction: 0 })}</dd>
                  <dt>{t('launch.create.floor', { asset: input.quoteAsset })}</dt>
                  <dd className={styles.mono} title={formatFull(input.floorPrice)}>{formatPrice(input.floorPrice)}</dd>
                  <dt>{t('launch.create.minRaise', { asset: input.quoteAsset })}</dt>
                  <dd className={styles.mono}>{formatAmount(input.minRaise < 0n ? 0n : input.minRaise)}</dd>
                </dl>
              </div>
              <div className={local.reviewGroup}>
                <p className={local.reviewTitle}>{steps[2]} · {steps[3]}</p>
                <dl className={styles.kv}>
                  <dt>{t('launch.create.commitHours')}</dt>
                  <dd>{t('launch.create.hoursValue', { n: input.commitHours })}</dd>
                  <dt>{t('launch.create.revealHours')}</dt>
                  <dd>{t('launch.create.hoursValue', { n: input.revealHours })}</dd>
                  <dt>{t('launch.detail.liquidity')}</dt>
                  <dd>{t('launch.detail.liquidityValue', { raise: bpsToPercent(input.liquidityBps), tokens: bpsToPercent(input.tokenLiquidityBps) })}</dd>
                  <dt>{t('launch.detail.creator')}</dt>
                  <dd>{t('launch.detail.creatorValue', { share: bpsToPercent(input.creatorShareBps), days: input.creatorVestDays })}</dd>
                  <dt>{t('launch.detail.fee')}</dt>
                  <dd>{bpsToPercent(b.raiseFeeBps)}</dd>
                </dl>
              </div>
            </div>
          ) : null}
          <div className={local.wizardNav}>
            <Button variant="ghost" icon="chevronLeft" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              {t('common.back')}
            </Button>
            {step < 4 ? (
              <Button iconEnd="chevronRight" onClick={next}>
                {t('common.next')}
              </Button>
            ) : (
              <Button icon="launch" onClick={submit} loading={creator.busy} disabled={issues.length > 0}>
                {t('launch.create.cta')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
