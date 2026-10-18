import { motion } from 'framer-motion';
import plateMacro from '../assets/art/plate-macro.jpg';
import { Coin } from '../components/Coin/Coin';
import { Rosette } from '../illustrations/Guilloche';
import { useI18n } from '../i18n/I18nProvider';
import { EASE_OUT } from '../motion/easing';
import { useReducedMotion } from '../motion/useReducedMotion';
import styles from './Welcome.module.css';

const ARC_A = 'M11 11C22 15 33 26 37 37';
const ARC_B = 'M37 11C26 15 15 26 11 37';

/**
 * The welcome moment: the two arcs of the mark draw, the plate rises with its guilloché
 * settling into place, and three coins drop into the vault's slots. About 2.2 s, then still.
 * Transform and opacity only (the arcs use pathLength on a 48px mark).
 */
export function WelcomeArt({ password = false }: { readonly password?: boolean }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const at = (delay: number, duration = 0.6) => (reduced ? { duration: 0 } : { duration, delay, ease: EASE_OUT });
  const spring = (delay: number) => (reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 18, delay });
  return (
    <div className={styles.art} aria-hidden="true">
      <motion.div className={styles.plate} initial={reduced ? false : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={at(0.15, 0.8)}>
        <span className={styles.sheen} style={{ backgroundImage: `url(${plateMacro})` }} />
        <motion.div className={styles.rosetteWrap} initial={reduced ? false : { opacity: 0, rotate: -24, scale: 0.86 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} transition={at(0.3, 1.6)}>
          <Rosette className={styles.rosette} />
        </motion.div>
        <div className={styles.plateTop}>
          <svg width={34} height={34} viewBox="0 0 48 48" fill="none" className={styles.mark}>
            <motion.path d={ARC_A} stroke="currentColor" strokeWidth={3} strokeLinecap="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={at(0.35, 0.7)} />
            <motion.path d={ARC_B} stroke="currentColor" strokeWidth={3} strokeLinecap="round" initial={reduced ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={at(0.75, 0.7)} />
          </svg>
          <span className={styles.plateLabel}>{t('simple.onboarding.plateLabel')}</span>
        </div>
        <div className={styles.slots}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={styles.slot}>
              <motion.span className={styles.slotCoin} initial={reduced ? false : { opacity: 0, y: -46 }} animate={{ opacity: 1, y: 0 }} transition={spring(1.05 + i * 0.16)}>
                <Coin icon={i === 0 ? 'lock' : i === 1 ? 'mix' : 'shield'} size="md" onPlate />
              </motion.span>
            </span>
          ))}
        </div>
        <motion.div className={styles.plateFoot} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={at(1.7, 0.5)}>
          <span className={styles.plateDot} />
          {t(password ? 'simple.onboarding.plateStatePassword' : 'simple.onboarding.plateState')}
        </motion.div>
      </motion.div>
      <motion.div className={styles.receipt} initial={reduced ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={at(0.9, 0.6)} />
    </div>
  );
}
