import { motion } from 'framer-motion';
import { Badge } from '../../components/Badge/Badge';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Coin } from '../../components/Coin/Coin';
import type { IconName } from '../../components/Icon/Icon';
import type { ActivityItem, ActivityKind } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import { useFormat } from '../../lib/useFormat';
import { EASE_OUT } from '../../motion/easing';
import { useReducedMotion } from '../../motion/useReducedMotion';
import styles from '../page.module.css';
import timelineStyles from './ActivityList.module.css';
import { activityTone } from './status';

const ICONS: Readonly<Record<ActivityKind, IconName>> = {
  deposit: 'arrowDown',
  send: 'send',
  receive: 'receive',
  bid: 'sale',
  order: 'book',
  donation: 'give',
  refund: 'refresh',
  claim: 'check',
  exit: 'arrowUp',
  gift: 'redPacket',
  gift_claim: 'redPacket',
  gift_reclaim: 'refresh',
};

/** Activity rows; `timeline` threads them on a vertical line and staggers them in. */
export function ActivityList({ items, timeline = false }: { readonly items: readonly ActivityItem[]; readonly timeline?: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const reduced = useReducedMotion();
  if (items.length === 0) return <EmptyState icon="clock" illo="idle" title={t('activity.emptyTitle')} body={t('activity.emptyBody')} />;
  return (
    <ul className={[styles.list, timeline ? timelineStyles.timeline : ''].join(' ')}>
      {items.map((item, index) => (
        <motion.li
          key={item.id}
          className={[styles.row, timeline ? timelineStyles.item : ''].join(' ')}
          initial={timeline && !reduced ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT, delay: timeline ? index * 0.05 : 0 }}
        >
          <span className={timeline ? timelineStyles.node : timelineStyles.plain} data-status={item.status}>
            <Coin icon={ICONS[item.kind]} tone={item.module} />
          </span>
          <div className={styles.rowMain}>
            <span className={styles.rowTitle}>{t(`activity.kind.${item.kind}`)}</span>
            <span className={styles.rowSub}>
              {item.subject ? `${item.subject} · ` : ''}
              {f.relative(item.at)}
            </span>
          </div>
          <div className={styles.rowEnd}>
            <span className={styles.amount}>{f.amount(item.amount, item.asset)}</span>
            <Badge tone={activityTone[item.status]}>{t(`activity.status.${item.status}`)}</Badge>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
