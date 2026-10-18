import type { Job } from '@hushcross/core';
import { Link } from 'react-router';
import { Coin, type CoinTone } from '../../components/Coin/Coin';
import type { IconName } from '../../components/Icon/Icon';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { rememberSharedByKey } from '../../motion/shared';
import { jobShareKey } from './actions';
import { chipLabel, jobTitle, overallProgress } from '../jobs/describe';
import s from '../simple.module.css';

export const KIND_ICON: Readonly<Record<Job['kind'], IconName>> = { send: 'send', gift: 'redPacket', sale: 'sale', donate: 'give', order: 'book' };
export const KIND_TONE: Readonly<Record<Job['kind'], CoinTone>> = { send: 'send', gift: 'give', sale: 'launch', donate: 'give', order: 'book' };
export const KIND_COLOR: Readonly<Record<Job['kind'], string>> = { send: 'var(--mod-send)', gift: 'var(--mod-give)', sale: 'var(--mod-launch)', donate: 'var(--mod-give)', order: 'var(--mod-book)' };


export function statusClass(job: Job): string {
  if (job.status === 'done') return s.statusDone ?? '';
  if (job.status === 'attention') return s.statusAttention ?? '';
  if (job.status === 'waiting') return s.statusWaiting ?? '';
  if (job.status === 'running') return s.statusRunning ?? '';
  return '';
}

/** A thin ring around the coin that fills with the job's overall progress. */
export function ProgressRing({ progress, tone }: { readonly progress: number; readonly tone: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <svg className={s.ring} viewBox="0 0 52 52" aria-hidden="true" style={{ ['--tile' as string]: tone }}>
      <circle cx={26} cy={26} r={24.5} className={s.ringTrack} pathLength={100} />
      <circle cx={26} cy={26} r={24.5} className={s.ringFill} pathLength={100} strokeDasharray={`${pct} 100`} />
    </svg>
  );
}

/** One job in a list: what it is, where it stands, a thin progress bar. */
export function JobRow({ job, index = 0 }: { readonly job: Job; readonly index?: number }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const progress = overallProgress(job);
  const finished = job.status === 'done' || job.status === 'cancelled';
  const share = jobShareKey(job.id);
  return (
    <li className={s.jobItem} style={{ ['--i' as string]: index }}>
      <Link to={`/jobs/${encodeURIComponent(job.id)}`} className={s.jobRow} style={{ ['--tile' as string]: KIND_COLOR[job.kind] }} onClick={(event) => rememberSharedByKey(share, event.currentTarget)}>
        <span className={s.jobCoin}>
          {finished ? null : <ProgressRing progress={progress} tone={KIND_COLOR[job.kind]} />}
          <Coin icon={KIND_ICON[job.kind]} tone={KIND_TONE[job.kind]} share={share} />
        </span>
        <span className={s.jobMain}>
          <span className={s.jobTitle}>{jobTitle(job, t, fmt)}</span>
          {finished ? (
            <span className={s.jobSub}>{fmt.dateTime(job.updatedAt)}</span>
          ) : (
            <span className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t('simple.jobs.progress')}>
              <span className={s.barFill} style={{ transform: `scaleX(${progress.toFixed(3)})` }} />
            </span>
          )}
        </span>
        <span className={[s.status, statusClass(job)].join(' ')}>{chipLabel(job, t)}</span>
      </Link>
    </li>
  );
}
