import { AnimatePresence, motion } from 'framer-motion';
import { MorphText, morphShape } from '../components/RollingNumber/MorphText';
import { useEffect, useRef, useState } from 'react';
import { EASE_OUT } from '../motion/easing';
import { useInView, useStageLayout } from '../motion/useInView';
import { useReducedMotion } from '../motion/useReducedMotion';
import { BookScene } from './BookHero';
import { GiftScene } from './GiftHero';
import { GiveScene } from './GiveHero';
import type { HeroModule } from './HeroFrame';
import { SealedLaunchScene } from './LaunchHero';
import { SendScene } from './SendHero';
import type { SceneLive, SceneProps } from './types';
import { VaultScene } from './VaultHero';
import frame from './HeroFrame.module.css';
import styles from './JobStage.module.css';

export type StageKind = 'send' | 'gift' | 'sale' | 'donate' | 'order';
export type StageStep = 'fund' | 'screen' | 'mix' | 'submit' | 'confirm' | 'reveal' | 'finalize' | 'claim' | 'done';
type SceneId = 'vault' | 'send' | 'gift' | 'sealed' | 'give' | 'book';

interface Segment {
  readonly scene: SceneId;
  readonly from: number;
  readonly to: number;
  /** Real time one pass through the segment takes. */
  readonly ms: number;
}

const SCENES: Readonly<Record<SceneId, { readonly Scene: (p: SceneProps) => JSX.Element; readonly module: HeroModule }>> = {
  vault: { Scene: VaultScene, module: 'vault' },
  send: { Scene: SendScene, module: 'send' },
  gift: { Scene: GiftScene, module: 'give' },
  sealed: { Scene: (p) => <SealedLaunchScene {...p} count={p.live?.bids ?? 24} stage={p.live?.saleStage ?? 0} />, module: 'launch' },
  give: { Scene: GiveScene, module: 'give' },
  book: { Scene: BookScene, module: 'book' },
};

/** The vault part every job shares: coins arrive, get checked, then circle with the crowd. */
const VAULT: Partial<Record<StageStep, Segment>> = {
  fund: { scene: 'vault', from: 0.02, to: 0.29, ms: 2800 },
  screen: { scene: 'vault', from: 0.26, to: 0.4, ms: 2000 },
  mix: { scene: 'vault', from: 0.4, to: 0.53, ms: 3600 },
};

/**
 * Each job step plays the part of its module's storyboard that explains it, looping while the step
 * lasts; "done" holds the closing frame. The animation is a status display, not decoration.
 */
export const STAGE: Readonly<Record<StageKind, Partial<Record<StageStep, Segment>>>> = {
  send: { ...VAULT, submit: { scene: 'send', from: 0.02, to: 0.5, ms: 4600 }, confirm: { scene: 'send', from: 0.5, to: 0.9, ms: 3800 }, done: { scene: 'send', from: 0.93, to: 0.93, ms: 1 } },
  // Gift: hold before the demo's "claimed" moment; nobody has opened the link yet when the job ends.
  gift: { ...VAULT, submit: { scene: 'gift', from: 0.02, to: 0.36, ms: 4200 }, confirm: { scene: 'gift', from: 0.34, to: 0.47, ms: 2200 }, done: { scene: 'gift', from: 0.47, to: 0.47, ms: 1 } },
  donate: { ...VAULT, submit: { scene: 'give', from: 0.02, to: 0.3, ms: 3600 }, confirm: { scene: 'give', from: 0.3, to: 0.46, ms: 2400 }, done: { scene: 'give', from: 0.46, to: 0.46, ms: 1 } },
  sale: {
    ...VAULT,
    submit: { scene: 'sealed', from: 0.0, to: 0.44, ms: 3000 },
    confirm: { scene: 'sealed', from: 0.3, to: 0.44, ms: 1800 },
    reveal: { scene: 'sealed', from: 0.45, to: 0.9, ms: 3200 },
    // After bidding closes the stage keeps to this sale's own facts (bid count, phase track); the demo
    // ladder would show someone else's prices. The result itself is spelled out under the stage.
    finalize: { scene: 'sealed', from: 0.6, to: 0.93, ms: 3600 },
    claim: { scene: 'sealed', from: 0.8, to: 0.93, ms: 2400 },
    done: { scene: 'sealed', from: 0.9, to: 0.9, ms: 1 },
  },
  // Book order: sealed cards, then the batch reveal and the single clearing price.
  order: {
    ...VAULT,
    submit: { scene: 'book', from: 0.0, to: 0.17, ms: 2600 },
    confirm: { scene: 'book', from: 0.1, to: 0.17, ms: 1600 },
    reveal: { scene: 'book', from: 0.17, to: 0.3, ms: 2600 },
    finalize: { scene: 'book', from: 0.3, to: 0.78, ms: 4200 },
    claim: { scene: 'book', from: 0.78, to: 0.86, ms: 2000 },
    done: { scene: 'book', from: 0.86, to: 0.86, ms: 1 },
  },
};

export function segmentFor(kind: StageKind, step: StageStep): Segment {
  return STAGE[kind][step] ?? (STAGE[kind].done as Segment);
}

/** Position inside the segment after `elapsed` ms (loops; a zero-length segment holds). */
export function stageAt(segment: Segment, elapsed: number): number {
  if (segment.to <= segment.from) return segment.from;
  const u = (elapsed % segment.ms) / segment.ms;
  return segment.from + (segment.to - segment.from) * u;
}

export interface JobStageProps {
  readonly kind: StageKind;
  readonly step: StageStep;
  /** Frozen (needs attention / cancelled): hold the frame, dimmed. */
  readonly paused?: boolean;
  /** Live status chip over the stage, e.g. "Mixing · 3 / 5". */
  readonly label?: string;
  /** 0..1 progress for the chip ring (mixing count, steps done). */
  readonly progress?: number;
  /** The job's own recipient / amount / pool size, drawn into the scene. */
  readonly live?: SceneLive;
}

/** The module hero, driven by a job's state instead of a demo loop. */
export function JobStage({ kind, step, paused = false, label, progress, live }: JobStageProps) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useStageLayout(rootRef);
  const inView = useInView(rootRef, 0.05);
  const segment = segmentFor(kind, step);
  const [elapsed, setElapsed] = useState(0);
  const still = reduced || paused || segment.to <= segment.from;

  useEffect(() => {
    setElapsed(0);
  }, [kind, step]);

  useEffect(() => {
    if (still || !inView) return undefined;
    let raf = 0;
    let last: number | null = null;
    let hidden = document.visibilityState === 'hidden';
    const onVisibility = (): void => {
      hidden = document.visibilityState === 'hidden';
      last = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    const loop = (now: number): void => {
      if (!hidden) {
        const dt = last === null ? 0 : Math.min(64, now - last);
        last = now;
        setElapsed((e) => e + dt);
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [still, inView, segment.ms]);

  const t = still ? (segment.to <= segment.from ? segment.from : (segment.from + segment.to) / 2) : stageAt(segment, elapsed);
  const cycle = Math.floor(elapsed / Math.max(1, segment.ms));
  const saleStage = step === 'finalize' ? 1 : step === 'claim' ? 2 : step === 'done' ? 3 : 0;
  const sceneLive = kind === 'sale' ? { ...live, saleStage } : live;
  const { Scene, module } = SCENES[segment.scene];
  return (
    <div
      ref={rootRef}
      className={[frame.palette, styles.stage, paused ? styles.paused : ''].join(' ')}
      style={{ ['--hero-base' as string]: `var(--mod-${module})` }}
      data-stage={segment.scene}
      data-step={step}
      data-t={t.toFixed(3)}
      aria-hidden="true"
    >
      {label ? (
        <div className={styles.chip}>
          {progress !== undefined ? (
            <svg viewBox="0 0 20 20" className={styles.ring}>
              <circle cx="10" cy="10" r="8" className={styles.ringTrack} />
              <circle cx="10" cy="10" r="8" className={styles.ringFill} pathLength={1} strokeDasharray="1" strokeDashoffset={(1 - Math.min(1, Math.max(0, progress))).toFixed(3)} />
            </svg>
          ) : (
            <span className={styles.dot} />
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={morphShape(label)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              <MorphText text={label} />
            </motion.span>
          </AnimatePresence>
        </div>
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={segment.scene} className={styles.scene} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.32, ease: EASE_OUT }}>
          <Scene t={t} cycle={cycle} layout={layout} {...(sceneLive ? { live: sceneLive } : {})} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
