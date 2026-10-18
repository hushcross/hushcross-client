import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useState } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/types';
import { EASE_OUT } from '../../motion/easing';
import { useReducedMotion } from '../../motion/useReducedMotion';
import s from '../simple.module.css';
import type { ActionId } from './actions';

const seenKey = (kind: ActionId): string => `hushcross.guide.${kind}`;

function readSeen(kind: ActionId): boolean {
  try {
    return window.localStorage.getItem(seenKey(kind)) === '1';
  } catch {
    return false;
  }
}

function markSeen(kind: ActionId): void {
  try {
    window.localStorage.setItem(seenKey(kind), '1');
  } catch {
    // Private windows can refuse storage; the card then simply opens again next time.
  }
}

/**
 * "How this works" for one Simple-mode action: three steps, time, fees and what stays private.
 * Open the first time an action is used, folded afterwards; one tap brings it back.
 */
export function Guide({ kind }: { readonly kind: ActionId }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const id = useId();
  const [open, setOpen] = useState(() => !readSeen(kind));
  useEffect(() => markSeen(kind), [kind]);
  const key = (leaf: string): MessageKey => `simpleGuide.${kind}.${leaf}` as MessageKey;
  return (
    <section className={s.guide} aria-labelledby={`${id}-title`} data-guide={kind}>
      <button type="button" className={s.guideToggle} aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((v) => !v)}>
        <Icon name="info" size={16} />
        <span id={`${id}-title`} className={s.guideTitle}>
          {t('simpleGuide.title')}
        </span>
        <span className={s.guideAction}>{open ? t('simpleGuide.hide') : t('simpleGuide.show')}</span>
        <Icon name="chevronRight" size={16} className={open ? s.guideChevronOpen : s.guideChevron} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={`${id}-body`}
            className={s.guideBody}
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', transition: { duration: reduced ? 0 : 0.28, ease: EASE_OUT } }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.18 } }}
          >
            <ol className={s.guideSteps}>
              {(['s1', 's2', 's3'] as const).map((leaf, i) => (
                <li key={leaf} className={s.guideStep}>
                  <span className={s.guideNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{t(key(leaf))}</span>
                </li>
              ))}
            </ol>
            <dl className={s.guideFacts}>
              {(['time', 'fees', 'privacy'] as const).map((leaf) => (
                <div key={leaf} className={s.guideFact}>
                  <dt>{t(`simpleGuide.${leaf}`)}</dt>
                  <dd>{t(key(leaf))}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
