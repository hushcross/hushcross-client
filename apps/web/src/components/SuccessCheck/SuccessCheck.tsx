import { motion } from 'framer-motion';
import { EASE_OUT } from '../../motion/easing';
import { useReducedMotion } from '../../motion/useReducedMotion';
import styles from './SuccessCheck.module.css';

export interface SuccessCheckProps {
  readonly size?: number;
  readonly tone?: 'ok' | 'accent' | 'give';
  /** Seconds before the ring starts drawing. */
  readonly delay?: number;
  readonly label?: string;
}

/**
 * Completion mark: the ring draws, the tick follows, and one thin ripple
 * settles outward. Static under reduced motion.
 */
export function SuccessCheck({ size = 56, tone = 'ok', delay = 0, label }: SuccessCheckProps) {
  const reduced = useReducedMotion();
  const draw = (start: number, duration: number) => (reduced ? { duration: 0 } : { duration, ease: EASE_OUT, delay: delay + start });
  return (
    <span className={[styles.check, styles[tone]].join(' ')} style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-success-check="">
      <svg viewBox="0 0 56 56" width={size} height={size} fill="none">
        {reduced ? null : (
          <motion.circle cx={28} cy={28} r={26} className={styles.ripple} initial={{ scale: 0.7, opacity: 0.5 }} animate={{ scale: 1.25, opacity: 0 }} transition={{ duration: 0.9, ease: EASE_OUT, delay: delay + 0.45 }} style={{ transformOrigin: '28px 28px' }} />
        )}
        <motion.circle cx={28} cy={28} r={22} className={styles.ring} initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw(0, 0.5)} style={{ rotate: -90, transformOrigin: '28px 28px' }} />
        <motion.path d="M19 28.5 25.5 35 37.5 22" className={styles.tick} initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw(0.32, 0.38)} />
      </svg>
    </span>
  );
}
