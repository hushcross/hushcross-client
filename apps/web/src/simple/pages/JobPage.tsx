import { JobRunner, type Job } from '@hushcross/core';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, ButtonLink } from '../../components/Button/Button';
import { CopyButton } from '../../components/CopyButton/CopyButton';
import { Dialog } from '../../components/Dialog/Dialog';
import { Icon } from '../../components/Icon/Icon';
import { useNow } from '../../components/Countdown/Countdown';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { QrCode } from '../../components/QrCode/QrCode';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { SuccessCheck } from '../../components/SuccessCheck/SuccessCheck';
import { useToast } from '../../components/Toast/Toast';
import { useDataSource, useResource } from '../../data/DataProvider';
import { LazyJobStage } from '../../heroes/lazy';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { absoluteLink } from '../../pages/send/RequestPanel';
import { chipLabel, headline, jobTitle, mixProgress } from '../jobs/describe';
import { giftLinks, jobAmount, saleParams, sendParams } from '../jobs/drafts';
import type { Asset } from '../../data/types';
import { useJob, useJobs } from '../jobs/JobsProvider';
import { jobShareKey } from '../parts/actions';
import { KIND_COLOR, KIND_ICON, KIND_TONE } from '../parts/JobRow';
import { Coin } from '../../components/Coin/Coin';
import { Figure } from '../../components/Figure/Figure';
import { formatAmount } from '../../data/units';
import { Timeline } from '../parts/Timeline';
import s from '../simple.module.css';
import page from '../../pages/page.module.css';

/** Progress of one job: the module hero as a live status display, a plain headline, the timeline. */
export function JobPage() {
  const { id } = useParams();
  const job = useJob(id);
  const { ready } = useJobs();
  const { t } = useI18n();
  if (!job) {
    return (
      <div className={page.stack}>
        <PageHeader title={t('simple.jobs.title')} back={{ to: '/jobs', label: t('simple.jobs.title') }} />
        {ready ? <p className={s.empty}>{t('simple.progress.notFound')}</p> : <Skeleton lines={3} height={48} label={t('common.loading')} />}
      </div>
    );
  }
  return <JobView job={job} />;
}

function JobView({ job }: { readonly job: Job }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const now = useNow(5000);
  const paused = job.status === 'attention' || job.status === 'cancelled';
  const progress = job.step === 'mix' ? (mixProgress(job) ?? undefined) : undefined;
  const pool = useResource((source) => source.getPoolStats(job.asset as Asset), ['notes'], [job.asset]);
  const params = job.kind === 'send' ? sendParams(job) : null;
  const sale = useResource((source) => (job.kind === 'sale' ? source.getSale(saleParams(job).saleId) : Promise.resolve(null)), ['sales'], [job.id]);
  const live = { amount: fmt.amount(jobAmount(job), job.asset), ...(params ? { name: params.label } : {}), ...(pool.data ? { poolCount: pool.data.totalDeposits } : {}), ...(sale.data ? { bids: sale.data.bidCount } : {}) };
  return (
    <div className={page.stack}>
      <PageHeader
        leading={<Coin icon={KIND_ICON[job.kind]} tone={KIND_TONE[job.kind]} size="sm" share={jobShareKey(job.id)} />}
        kicker={t(`simple.kind.${job.kind}`)}
        title={jobTitle(job, t, fmt)}
        back={{ to: '/jobs', label: t('simple.jobs.title') }}
      />
      <div className={s.progress}>
        <div className={s.progressMain}>
          <LazyJobStage kind={job.kind} step={job.step} paused={paused} label={chipLabel(job, t)} live={live} {...(progress === undefined ? {} : { progress })} />
          <p className={s.headline} role="status" aria-live="polite">
            {headline(job, t, fmt, now)}
          </p>
          <JobActions job={job} />
          {job.status === 'done' ? <JobResult job={job} /> : null}
        </div>
        <section className={s.panel} aria-labelledby={`tl-${job.id}`} style={{ ['--tile' as string]: KIND_COLOR[job.kind] }}>
          <h2 id={`tl-${job.id}`} className={s.sectionTitle}>
            {t('simple.timeline.title')}
          </h2>
          <Timeline job={job} />
          <p className={s.hint}>
            <Icon name="info" size={16} />
            {t('simple.progress.background')}
          </p>
        </section>
      </div>
    </div>
  );
}

function JobActions({ job }: { readonly job: Job }) {
  const { t } = useI18n();
  const jobs = useJobs();
  const ds = useDataSource();
  const { show } = useToast();
  const [confirming, setConfirming] = useState<'anyway' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
    } catch {
      show({ tone: 'danger', title: t('errors.network') });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };
  const code = job.attention?.code ?? null;
  const canRetry = job.status === 'attention' && code !== 'declined' && code !== 'not_revealed' && code !== 'phase_closed';
  const weak = job.status === 'waiting' && job.waiting?.reason === 'privacy';
  const cancellable = JobRunner.cancellable(job);
  if (!weak && !canRetry && !cancellable && job.status !== 'attention') return null;
  return (
    <>
      {job.status === 'attention' ? (
        <p className={s.hintWarn}>
          <Icon name="alert" size={16} />
          {t(`simple.attention.${code ?? 'error'}.body`)}
        </p>
      ) : null}
      <div className={s.actions}>
        {weak ? (
          <Button variant="secondary" onClick={() => setConfirming('anyway')}>
            {t('simple.actions.sendAnyway')}
          </Button>
        ) : null}
        {canRetry ? (
          <Button
            loading={busy}
            icon={code === 'wallet_needed' ? 'wallet' : 'refresh'}
            onClick={() =>
              void act(async () => {
                if (code === 'wallet_needed') await ds.connectWallet();
                await jobs.retry(job.id);
              })
            }
          >
            {code === 'wallet_needed' ? t('simple.actions.connect') : t('simple.actions.retry')}
          </Button>
        ) : null}
        {code === 'not_revealed' ? (
          <ButtonLink to={`/launch/${encodeURIComponent(saleParams(job).saleId)}`} variant="secondary" icon="launch">
            {t('simple.actions.openPro')}
          </ButtonLink>
        ) : null}
        {cancellable ? (
          <Button variant="ghost" onClick={() => setConfirming('cancel')}>
            {t('simple.actions.cancel')}
          </Button>
        ) : null}
      </div>
      <Dialog
        open={confirming === 'anyway'}
        title={t('simple.actions.anywayTitle')}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              {t('simple.actions.keepWaiting')}
            </Button>
            <Button loading={busy} onClick={() => void act(() => jobs.sendAnyway(job.id))}>
              {t('simple.actions.sendAnyway')}
            </Button>
          </>
        }
      >
        <p>{t('simple.actions.anywayBody')}</p>
      </Dialog>
      <Dialog
        open={confirming === 'cancel'}
        title={t('simple.actions.cancelTitle')}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              {t('simple.actions.keepGoing')}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void act(() => jobs.cancel(job.id))}>
              {t('simple.actions.cancel')}
            </Button>
          </>
        }
      >
        <p>{t('simple.actions.cancelBody')}</p>
      </Dialog>
    </>
  );
}

function JobResult({ job }: { readonly job: Job }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const bids = useResource((source) => (job.kind === 'sale' ? source.listMyBids(saleParams(job).saleId) : Promise.resolve([])), ['bids'], [job.id]);
  if (job.kind === 'gift') {
    const links = giftLinks(job);
    return (
      <section className={s.panel}>
        <h2 className={s.sectionTitle}>{t('simple.progress.giftReady')}</h2>
        {links.slice(0, 1).map((path) => (
          <div key={path} className={s.result}>
            <QrCode value={absoluteLink(path)} label={t('simple.progress.giftQr')} size={168} />
            <div className={s.linkBox}>
              <span className={s.linkText}>{absoluteLink(path)}</span>
              <CopyButton value={absoluteLink(path)} label={t('simple.progress.copyLink')} />
            </div>
          </div>
        ))}
        <p className={s.hint}>{t('simple.progress.giftHint')}</p>
        <Link to="/send?tab=gift" className={s.link}>
          {t('simple.progress.giftManage')}
        </Link>
      </section>
    );
  }
  const bid = job.kind === 'sale' ? bids.data?.find((b) => b.id === job.work[0]?.ref) : undefined;
  return (
    <section className={s.doneCard}>
      <SuccessCheck size={52} label={t(`simple.headline.done.${job.kind}`)} />
      <Figure value={formatAmount(jobAmount(job), { maxFraction: 6 })} unit={job.asset} roll className={s.doneFigure} />
      {bid ? (
        <p className={s.hint}>
          {t('simple.progress.saleResult', { tokens: fmt.amount(bid.tokensAllocated, saleParams(job).symbol, 2), refund: fmt.amount(bid.refund, job.asset) })}
        </p>
      ) : null}
      <ButtonLink to="/" variant="secondary" icon="home">
        {t('simple.actions.home')}
      </ButtonLink>
    </section>
  );
}
