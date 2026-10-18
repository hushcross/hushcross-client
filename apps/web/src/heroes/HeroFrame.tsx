import { AnimatePresence, motion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { Icon } from '../components/Icon/Icon';
import { useI18n } from '../i18n/I18nProvider';
import { EASE_OUT } from '../motion/easing';
import { useHeroClock } from '../motion/useHeroClock';
import { useInView, useStageLayout } from '../motion/useInView';
import { useReducedMotion } from '../motion/useReducedMotion';
import type { SceneProps } from './types';
import styles from './HeroFrame.module.css';

export interface HeroStep {
  /** Loop progress at which this caption becomes active. */
  readonly at: number;
  readonly text: string;
}

export type HeroModule = 'vault' | 'send' | 'give' | 'launch' | 'book';

export interface HeroFrameProps {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly HeroStep[];
  readonly durationMs: number;
  /** Loop position used as the static illustration under reduced motion. */
  readonly staticAt: number;
  /** Module colour token name, e.g. "vault". */
  readonly module: HeroModule;
  readonly children: (scene: SceneProps) => ReactNode;
  readonly note?: string;
}

export function activeStepIndex(t: number, steps: readonly HeroStep[]): number {
  let index = 0;
  steps.forEach((step, i) => {
    if (t >= step.at) index = i;
  });
  return index;
}

function stepFill(t: number, steps: readonly HeroStep[], index: number): number {
  const start = steps[index]?.at ?? 0;
  const end = steps[index + 1]?.at ?? 1;
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}

/**
 * Shared chrome for module mechanism animations: title, a caption track synced
 * to the timeline (click a step to jump), pause / replay, reduced-motion
 * fallback, and pausing while off screen or in a hidden tab.
 */
export function HeroFrame({ id, title, steps, durationMs, staticAt, module, children, note }: HeroFrameProps) {
  const { t: tr } = useI18n();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, 0.05);
  const layout = useStageLayout(stageRef);
  const clock = useHeroClock(durationMs, reduced, staticAt, { active: inView });
  const activeIndex = activeStepIndex(clock.t, steps);
  const active = steps[activeIndex];
  return (
    <motion.section
      ref={rootRef}
      className={styles.hero}
      data-hero={id}
      data-progress={clock.t.toFixed(3)}
      data-state={reduced ? 'static' : clock.playing ? 'playing' : 'paused'}
      data-layout={layout}
      style={{ ['--hero-base' as string]: `var(--mod-${module})` }}
      aria-label={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.2 : 0.5, ease: EASE_OUT }}
    >
      <div className={styles.head}>
        <span className={styles.kicker}>
          <span className={styles.kickerDot} aria-hidden="true" />
          {note ?? tr('hero.illustration')}
        </span>
        <h2 className={styles.title}>{title}</h2>
      </div>

      {reduced ? null : (
        <div className={styles.controls}>
          <button type="button" className={styles.control} onClick={clock.toggle} aria-pressed={!clock.playing} aria-label={clock.playing ? tr('hero.pause') : tr('hero.play')}>
            <Icon name={clock.playing ? 'pause' : 'play'} size={16} />
          </button>
          <button type="button" className={styles.control} onClick={clock.replay} aria-label={tr('hero.replay')}>
            <Icon name="refresh" size={16} />
          </button>
          <span className={styles.counter} aria-hidden="true">
            {String(activeIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
          </span>
        </div>
      )}

      <div className={styles.stage} ref={stageRef} aria-hidden="true">
        {children({ t: clock.t, cycle: clock.cycle, layout })}
      </div>

      <div className={styles.caption} aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={active?.text ?? ''}
            className={styles.captionText}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            {active?.text}
          </motion.p>
        </AnimatePresence>
      </div>

      <ol className={styles.steps} aria-label={tr('hero.steps')}>
        {steps.map((step, index) => {
          const state = index === activeIndex ? 'active' : index < activeIndex ? 'done' : 'todo';
          const fill = state === 'done' ? 1 : state === 'active' ? stepFill(clock.t, steps, index) : 0;
          return (
            <li key={step.text} className={styles.stepItem} data-state={state}>
              <button type="button" className={styles.step} onClick={() => clock.seek(step.at + 0.001)} aria-current={state === 'active' ? 'step' : undefined}>
                <span className={styles.stepNum} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.stepText}>{step.text}</span>
                <span className={styles.stepBar} aria-hidden="true">
                  <span className={styles.stepFill} style={{ transform: `scaleX(${fill.toFixed(3)})` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </motion.section>
  );
}
