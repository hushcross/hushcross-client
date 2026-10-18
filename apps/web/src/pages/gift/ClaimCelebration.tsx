import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { RollingNumber } from '../../components/RollingNumber/RollingNumber';
import { SuccessCheck } from '../../components/SuccessCheck/SuccessCheck';
import { EASE_OUT } from '../../motion/easing';
import { useReducedMotion } from '../../motion/useReducedMotion';
import styles from './ClaimCelebration.module.css';

export interface ClaimCelebrationProps {
  readonly amount: string;
  readonly asset: string;
  readonly message: ReactNode;
  readonly action?: ReactNode;
}

const FLAP_CLOSED = 'M24 70 L160 140 L296 70';
const FLAP_OPEN = 'M24 70 L160 6 L296 70';

/**
 * The red-packet "open" moment: the flap lifts, the note rises out with a
 * spring, the amount rolls in and a check draws. No confetti, no glow.
 */
export function ClaimCelebration({ amount, asset, message, action }: ClaimCelebrationProps) {
  const reduced = useReducedMotion();
  const tr = (delay: number, duration = 0.5) => (reduced ? { duration: 0 } : { duration, ease: EASE_OUT, delay });
  return (
    <section className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.stage} aria-hidden="true">
        <svg viewBox="0 0 320 236" className={styles.svg}>
          {/* Back of the packet. */}
          <rect x={24} y={70} width={272} height={150} rx={18} className={styles.back} />
          {/* The flap is hinged on the back, so the rising note passes in front of it. */}
          <motion.path d={FLAP_CLOSED} className={styles.flap} initial={reduced ? false : { d: FLAP_CLOSED }} animate={{ d: FLAP_OPEN }} transition={tr(0.1, 0.55)} />
          {/* The note rises out of the packet. */}
          <motion.g initial={reduced ? false : { y: 70, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 16, delay: 0.42 }}>
            <rect x={56} y={22} width={208} height={128} rx={14} className={styles.note} />
            <line x1={80} x2={240} y1={118} y2={118} className={styles.noteRule} />
          </motion.g>
          {/* Front pocket covers the lower part of the note. */}
          <path d="M24 108 L160 168 L296 108 V202 A18 18 0 0 1 278 220 H42 A18 18 0 0 1 24 202 Z" className={styles.front} />
          <motion.g initial={reduced ? false : { opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 0.6 }} transition={tr(0.05, 0.3)} style={{ transformOrigin: '160px 112px' }}>
            <circle cx={160} cy={112} r={15} className={styles.seal} />
            <path d="M154.5 106.5 L165.5 117.5 M165.5 106.5 L154.5 117.5" className={styles.sealMark} />
          </motion.g>
        </svg>
        <motion.div
          className={styles.amount}
          initial={reduced ? false : { y: 70, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={reduced ? { duration: 0 } : { y: { type: 'spring', stiffness: 170, damping: 16, delay: 0.42 }, opacity: { duration: 0.25, delay: 0.66 } }}
        >
          <span className={styles.figure}>
            <RollingNumber value={amount} rollIn />
          </span>
          <span className={styles.asset}>{asset}</span>
        </motion.div>
      </div>
      <motion.div className={styles.result} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={tr(0.9, 0.4)}>
        <SuccessCheck size={44} delay={reduced ? 0 : 0.95} tone="ok" />
        <p className={styles.message}>{message}</p>
      </motion.div>
      {action ? (
        <motion.div className={styles.action} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={tr(1.3, 0.3)}>
          {action}
        </motion.div>
      ) : null}
    </section>
  );
}
