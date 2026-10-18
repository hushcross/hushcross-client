import { SectionHead } from '../../components/SectionHead/SectionHead';
import { Spot } from '../../illustrations/Spot';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useI18n } from '../../i18n/I18nProvider';
import { useJobs } from '../jobs/JobsProvider';
import { JobRow } from '../parts/JobRow';
import s from '../simple.module.css';
import page from '../../pages/page.module.css';

/** Every one-step action on this device: running first, then finished. */
export function JobsPage() {
  const { t } = useI18n();
  const { jobs, ready, leader } = useJobs();
  const active = jobs.filter((j) => j.status !== 'done' && j.status !== 'cancelled');
  const finished = jobs.filter((j) => j.status === 'done' || j.status === 'cancelled');
  return (
    <div className={page.stack}>
      <PageHeader title={t('simple.jobs.title')} subtitle={t('simple.jobs.subtitle')} />
      {!ready ? <Skeleton lines={3} height={64} label={t('common.loading')} /> : null}
      {ready && !leader ? <p className={s.hintCalm}>{t('simple.jobs.otherTab')}</p> : null}
      <section className={s.section} aria-labelledby="jobs-active">
        <SectionHead id="jobs-active" title={t('simple.jobs.active')} />
        {active.length === 0 ? (
          <div className={s.quiet}>
            <Spot name="quiet" />
            <p className={s.quietBody}>{t('simple.jobs.emptyActive')}</p>
          </div>
        ) : (
          <ul className={s.jobList}>
            {active.map((job, index) => (
              <JobRow key={job.id} job={job} index={index} />
            ))}
          </ul>
        )}
      </section>
      {finished.length > 0 ? (
        <section className={s.section} aria-labelledby="jobs-finished">
          <SectionHead id="jobs-finished" title={t('simple.jobs.finished')} />
          <ul className={s.jobList}>
            {finished.map((job, index) => (
              <JobRow key={job.id} job={job} index={index + active.length} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
