import { storyBytesLeft } from '@hushcross/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { Input, TextArea } from '../../components/Input/Input';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Segmented } from '../../components/Segmented/Segmented';
import { StepFlow } from '../../components/StepFlow/StepFlow';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource } from '../../data/DataProvider';
import type { Asset, CampaignKind } from '../../data/types';
import { formatAmount, parseAmount } from '../../data/units';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n/I18nProvider';
import styles from '../page.module.css';
import local from './Give.module.css';
import launch from '../launch/Launch.module.css';

export const isRecipient = (value: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(value) || /^@[a-z0-9_]{3,20}$/.test(value);

export function CreateCampaignPage() {
  const { t } = useI18n();
  const ds = useDataSource();
  const navigate = useNavigate();
  const { show } = useToast();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<CampaignKind>('goal');
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [asset, setAsset] = useState<Asset>('USDT');
  const [goalText, setGoalText] = useState('');
  const [days, setDays] = useState('30');
  const [recipient, setRecipient] = useState('');
  const [touched, setTouched] = useState(false);
  const creator = useAction(ds.createCampaign.bind(ds));

  const goal = parseAmount(goalText);
  const deadlineDays = Number(days);
  const errors = {
    title: title.trim().length < 4 ? t('give.create.errors.title') : undefined,
    story: storyBytesLeft(story) < 0 ? t('giveLive.create.storyTooLong') : undefined,
    goal: kind === 'goal' && (goal === null || goal === 0n) ? t('give.create.errors.goal') : undefined,
    days: kind === 'goal' && !(deadlineDays >= 1 && deadlineDays <= 90) ? t('give.create.errors.days') : undefined,
    recipient: !isRecipient(recipient.trim()) ? t('give.create.errors.recipient') : undefined,
  };
  const stepErrors = [[], [errors.title, errors.story, errors.goal, errors.days], [errors.recipient], []][step] ?? [];
  const show_ = (e: string | undefined): string | undefined => (touched ? e : undefined);

  const next = (): void => {
    setTouched(true);
    if (stepErrors.some(Boolean)) return;
    setTouched(false);
    setStep((s) => Math.min(3, s + 1));
  };

  const submit = async (): Promise<void> => {
    const campaign = await creator.run({ kind, title, story, recipient: recipient.trim(), asset, goal: kind === 'goal' ? goal : null, deadlineDays: kind === 'goal' ? deadlineDays : null });
    if (!campaign) return;
    show({ tone: 'ok', title: t('give.create.done') });
    navigate(`/give/${campaign.id}`);
  };

  const steps = [t('give.create.steps.type'), t('give.create.steps.details'), t('give.create.steps.recipient'), t('give.create.steps.review')];

  return (
    <div className={styles.stack}>
      <PageHeader back={{ to: '/give', label: t('nav.give') }} title={t('give.create.title')} subtitle={t('give.create.subtitle')} />
      <Card padding="lg">
        <div className={styles.form}>
          <StepFlow steps={steps} current={step} label={t('give.create.stepsLabel')} />
          {step === 0 ? (
            <fieldset className={local.kindCards}>
              <legend className="visually-hidden">{t('give.create.steps.type')}</legend>
              {(['tip', 'goal'] as const).map((k) => (
                <label key={k} className={local.kindCard}>
                  <input type="radio" name="campaign-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                  <span className={local.kindTitle}>{t(`give.kind.${k}`)}</span>
                  <span className={local.kindBody}>{t(`give.create.${k}Body`)}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {step === 1 ? (
            <>
              <Input label={t('give.create.titleLabel')} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} error={show_(errors.title)} />
              <TextArea
                label={t('give.create.story')}
                hint={`${t('give.create.storyHint')} ${t('giveLive.create.storyBytes', { n: Math.max(0, storyBytesLeft(story)) })}`}
                value={story}
                maxLength={600}
                onChange={(e) => setStory(e.target.value)}
                error={storyBytesLeft(story) < 0 ? errors.story : undefined}
              />
              <Segmented legend={t('common.asset')} value={asset} onChange={setAsset} options={[{ value: 'USDT', label: 'USDT' }, { value: 'BNB', label: 'BNB' }]} />
              {kind === 'goal' ? (
                <div className={styles.formRow}>
                  <Input label={t('give.create.goal', { asset })} inputMode="decimal" mono value={goalText} onChange={(e) => setGoalText(e.target.value)} error={show_(errors.goal)} suffix={asset} />
                  <Input label={t('give.create.days')} type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} hint={t('give.create.daysHint')} error={show_(errors.days)} />
                </div>
              ) : null}
            </>
          ) : null}
          {step === 2 ? (
            <Input label={t('give.create.recipient')} mono value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="@name / 0x…" hint={recipient.trim().startsWith('@') ? `${t('give.create.recipientHint')} ${t('giveLive.create.hushIdNote')}` : t('give.create.recipientHint')} error={show_(errors.recipient)} autoCapitalize="none" />
          ) : null}
          {step === 3 ? (
            <dl className={styles.kv}>
              <dt>{t('give.create.steps.type')}</dt>
              <dd>{t(`give.kind.${kind}`)}</dd>
              <dt>{t('give.create.titleLabel')}</dt>
              <dd>{title}</dd>
              {kind === 'goal' && goal !== null ? (
                <>
                  <dt>{t('give.create.goal', { asset })}</dt>
                  <dd className={styles.mono}>{formatAmount(goal)} {asset}</dd>
                  <dt>{t('give.create.days')}</dt>
                  <dd>{t('give.create.daysValue', { n: deadlineDays })}</dd>
                </>
              ) : null}
              <dt>{t('give.create.recipient')}</dt>
              <dd className={styles.mono}>{recipient}</dd>
              <dt>{t('give.create.fee')}</dt>
              <dd>{t('give.create.feeValue')}</dd>
            </dl>
          ) : null}
          <div className={launch.wizardNav}>
            <Button variant="ghost" icon="chevronLeft" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              {t('common.back')}
            </Button>
            {step < 3 ? (
              <Button iconEnd="chevronRight" onClick={next}>
                {t('common.next')}
              </Button>
            ) : (
              <Button icon="give" onClick={submit} loading={creator.busy}>
                {t('give.create.cta')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
