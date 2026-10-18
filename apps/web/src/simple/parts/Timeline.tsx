import type { Job } from '@hushcross/core';
import { motion } from 'framer-motion';
import { Icon } from '../../components/Icon/Icon';
import { useNow } from '../../components/Countdown/Countdown';
import { useI18n } from '../../i18n/I18nProvider';
import { EASE_OUT } from '../../motion/easing';
import { useFormat } from '../../lib/useFormat';
import { timeline } from '../jobs/describe';
import s from '../simple.module.css';

/** Plain-language timeline: what happened, what is happening now, what comes next. */
export function Timeline({ job }: { readonly job: Job }) {
  const { t } = useI18n();
  const fmt = useFormat();
  const now = useNow(15_000);
  const rows = timeline(job, t, fmt, now);
  return (
    <ol className={s.timeline} aria-label={t('simple.timeline.title')}>
      {rows.map((row, i) => (
        <motion.li
          key={row.step}
          className={s.tlItem}
          data-state={row.state}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: i * 0.04 }}
          aria-current={row.state === 'current' || row.state === 'waiting' ? 'step' : undefined}
        >
          <span className={s.tlMark} aria-hidden="true">
            {row.state === 'done' ? <Icon name="check" size={14} /> : row.state === 'attention' ? <Icon name="alert" size={14} /> : row.state === 'todo' ? null : <span className={s.tlPulse} />}
          </span>
          <span className={s.tlBody}>
            <span className={s.tlLabel}>{row.label}</span>
            {row.at !== null ? <span className={s.tlTime}>{row.state === 'done' ? fmt.dateTime(row.at) : t('simple.timeline.since', { time: fmt.relative(row.at, now) })}</span> : null}
            {row.detail ? <span className={s.tlDetail}>{row.detail}</span> : null}
          </span>
        </motion.li>
      ))}
    </ol>
  );
}
