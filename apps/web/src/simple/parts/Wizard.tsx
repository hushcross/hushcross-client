import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Coin } from '../../components/Coin/Coin';
import { Icon } from '../../components/Icon/Icon';
import { useI18n } from '../../i18n/I18nProvider';
import { EASE_EXIT, EASE_OUT } from '../../motion/easing';
import { rememberSharedByKey } from '../../motion/shared';
import { useReducedMotion } from '../../motion/useReducedMotion';
import s from '../simple.module.css';
import { ACTION_COIN, actionShareKey, type ActionId } from './actions';
import { Guide } from './Guide';

export interface WizardProps {
  /** Which action this is: picks the coin that flew in from the Home tile. */
  readonly kind?: ActionId;
  /** Kicker above the title: the action ("Send privately"). */
  readonly action: string;
  /** Title of the current screen ("How much?"). */
  readonly title: string;
  readonly step: number;
  readonly steps: number;
  /** Back goes one screen back; on the first screen it leaves to Home. */
  readonly onBack: (() => void) | null;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}

/** Direction of travel between two steps: forward slides left, back slides right. */
export function stepDirection(previous: number, next: number): 1 | -1 {
  return next >= previous ? 1 : -1;
}

/** At most three screens: a progress track, one question per screen, the primary action at the bottom. */
export function Wizard({ kind, action, title, step, steps, onBack, children, footer }: WizardProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  // Remember the last step to know which way to slide (render-phase update, StrictMode-safe).
  const [last, setLast] = useState(step);
  const [direction, setDirection] = useState<1 | -1>(1);
  if (step !== last) {
    setLast(step);
    setDirection(stepDirection(last, step));
  }
  const offset = reduced ? 0 : 28;
  const coin = kind ? ACTION_COIN[kind] : null;
  const share = kind ? actionShareKey(kind) : undefined;
  const variants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * offset }),
    center: { opacity: 1, x: 0, transition: { duration: 0.34, ease: EASE_OUT } },
    exit: (dir: number) => ({ opacity: 0, x: dir * -offset * 0.6, transition: { duration: 0.16, ease: EASE_EXIT } }),
  };
  return (
    <div className={s.wizard}>
      <div className={s.wizardHead}>
        <div className={s.wizardTop}>
          {onBack ? (
            <button type="button" className={s.backButton} onClick={onBack} aria-label={t('simple.wizard.back')}>
              <Icon name="chevronLeft" size={18} />
            </button>
          ) : (
            <Link to="/" className={s.backButton} aria-label={t('simple.wizard.home')} onClick={() => share && rememberSharedByKey(share)}>
              <Icon name="chevronLeft" size={18} />
            </Link>
          )}
          {coin ? <Coin icon={coin.icon} tone={coin.tone} size="sm" share={share} /> : null}
          <span className={s.wizardKicker}>
            {action}
            <span className="visually-hidden"> · {t('simple.wizard.stepOf', { n: step, total: steps })}</span>
          </span>
          <span className={s.wizardCount} aria-hidden="true">
            <span className={s.wizardCountNow}>{String(step).padStart(2, '0')}</span>
            <span className={s.wizardCountSep}>/</span>
            {String(steps).padStart(2, '0')}
          </span>
        </div>
        <ol className={s.dots} aria-hidden="true">
          {Array.from({ length: steps }, (_, i) => (
            <li key={i} className={s.dot}>
              <motion.span className={s.dotFill} initial={false} animate={{ scaleX: i < step ? 1 : 0 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: i < step ? 0.06 : 0 }} />
            </li>
          ))}
        </ol>
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.h1 key={title} className={s.wizardTitle} custom={direction} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
            {title}
          </motion.h1>
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div key={step} className={s.panel} custom={direction} variants={variants} initial="enter" animate="center" exit="exit">
          {children}
        </motion.div>
      </AnimatePresence>
      {kind && step === 1 ? <Guide kind={kind} /> : null}
      <div className={s.wizardFoot}>{footer}</div>
    </div>
  );
}
