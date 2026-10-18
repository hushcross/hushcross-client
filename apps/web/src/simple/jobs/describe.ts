import { JOB_STEPS, type Job, type JobStep } from '@hushcross/core';
import type { Formatters } from '../../lib/useFormat';
import type { MessageKey, Vars } from '../../i18n/types';
import { orderParams } from '../../data/bookJobs';
import { formatAmount } from '../../data/units';
import { donateParams, giftParams, jobAmount, saleParams, sendParams } from './drafts';

type Translate = (key: MessageKey, vars?: Vars) => string;

export type TimelineState = 'done' | 'current' | 'waiting' | 'attention' | 'todo';

export interface TimelineRow {
  readonly step: JobStep;
  readonly label: string;
  readonly state: TimelineState;
  /** When the step finished (done) or started (current). */
  readonly at: number | null;
  /** One plain sentence about the current step. */
  readonly detail: string | null;
}

/** Steps shown to the user: "fund" only when the wallet had to top up the vault. */
export function visibleSteps(job: Job): JobStep[] {
  return JOB_STEPS[job.kind].filter((s) => s !== 'fund' || job.fund.state !== 'none' || job.step === 'fund');
}

export function jobTitle(job: Job, t: Translate, fmt: Formatters): string {
  const amount = fmt.amount(jobAmount(job), job.asset);
  if (job.kind === 'send') return t('simple.title.send', { amount, to: sendParams(job)?.label ?? '' });
  if (job.kind === 'gift') return t('simple.title.gift', { amount, n: giftParams(job).packets });
  if (job.kind === 'sale') return t('simple.title.sale', { symbol: saleParams(job).symbol || '—' });
  if (job.kind === 'order') {
    const p = orderParams(job);
    const vars = { amount: formatAmount(p.amount, { maxFraction: 8 }), symbol: p.symbol || '—' };
    return t(p.side === 'sell' ? 'simpleTrade.jobSell' : 'simpleTrade.jobBuy', vars);
  }
  return t('simple.title.donate', { amount, to: donateParams(job).title });
}

export function stepLabel(job: Job, step: JobStep, t: Translate): string {
  if (step === 'submit') return t(`simple.step.submit.${job.kind}`);
  if (step === 'done') return t(`simple.step.done.${job.kind}`);
  return t(`simple.step.${step}`);
}

/** Mixing progress for the chip and the bar: 0..1, or null when the age rule is the blocker. */
export function mixProgress(job: Job): number | null {
  if (!job.privacy || job.privacy.needed <= 0) return null;
  return Math.min(1, job.privacy.mixed / job.privacy.needed);
}

/** The single sentence at the top of the progress screen. */
export function headline(job: Job, t: Translate, fmt: Formatters, now: number): string {
  if (job.status === 'done') return t(`simple.headline.done.${job.kind}`);
  if (job.status === 'cancelled') return t('simple.headline.cancelled');
  if (job.status === 'attention') return t(`simple.attention.${job.attention?.code ?? 'error'}.title`);
  if (job.status === 'waiting' && job.waiting) {
    const reason = job.waiting.reason;
    if (reason === 'privacy' && job.privacy) {
      if (job.privacy.mixed < job.privacy.needed) return t('simple.headline.mixing', { n: Math.min(job.privacy.mixed, job.privacy.needed), total: job.privacy.needed });
      if (job.privacy.readyAt !== null && job.privacy.readyAt > now) return t('simple.headline.aging', { time: fmt.relative(job.privacy.readyAt, now) });
      return t('simple.headline.mixingMore');
    }
    return t(`simple.headline.wait.${reason}`);
  }
  return t(`simple.headline.run.${job.step}`);
}

/** Short status for list rows and the stage chip. */
export function chipLabel(job: Job, t: Translate): string {
  if (job.status === 'done') return t('simple.chip.done');
  if (job.status === 'attention') return t('simple.chip.attention');
  if (job.status === 'cancelled') return t('simple.chip.cancelled');
  if (job.step === 'mix' && job.privacy && job.privacy.mixed < job.privacy.needed) return t('simple.chip.mixing', { n: job.privacy.mixed, total: job.privacy.needed });
  return t(`simple.chip.${job.step}`);
}

export function timeline(job: Job, t: Translate, fmt: Formatters, now: number): TimelineRow[] {
  const steps = visibleSteps(job);
  const currentIndex = steps.indexOf(job.step);
  const enteredAt = (step: JobStep): number | null => [...job.timeline].reverse().find((e) => e.step === step && e.code === undefined)?.at ?? null;
  return steps.map((step, i) => {
    const next = steps[i + 1];
    let state: TimelineState;
    if (job.status === 'done') state = 'done';
    else if (i < currentIndex) state = 'done';
    else if (i > currentIndex) state = 'todo';
    else state = job.status === 'attention' ? 'attention' : job.status === 'waiting' ? 'waiting' : job.status === 'cancelled' ? 'todo' : 'current';
    const at = state === 'done' ? (next ? enteredAt(next) : job.updatedAt) : state === 'todo' ? null : enteredAt(step);
    let detail: string | null = null;
    if (state === 'waiting' || state === 'current' || state === 'attention') detail = state === 'attention' ? t(`simple.attention.${job.attention?.code ?? 'error'}.body`) : headline(job, t, fmt, now);
    if (step === 'fund' && state === 'done' && job.fund.deposits.length > 0) {
      const total = job.fund.deposits.reduce((s, d) => s + d.unit * BigInt(d.count), 0n);
      detail = t('simple.timeline.funded', { amount: fmt.amount(total, job.asset) });
    }
    return { step, label: stepLabel(job, step, t), state, at, detail };
  });
}

/** Share of visible steps finished, for compact progress bars. */
export function overallProgress(job: Job): number {
  if (job.status === 'done') return 1;
  const steps = visibleSteps(job);
  const i = Math.max(0, steps.indexOf(job.step));
  const within = job.step === 'mix' ? (mixProgress(job) ?? 0.5) * 0.9 : job.status === 'waiting' ? 0.5 : 0.25;
  return Math.min(0.97, (i + within) / Math.max(1, steps.length - 1));
}
