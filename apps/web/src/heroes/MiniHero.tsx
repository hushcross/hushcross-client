import { useEffect, useRef, useState } from 'react';
import { useHeroClock } from '../motion/useHeroClock';
import { useInView } from '../motion/useInView';
import { useReducedMotion } from '../motion/useReducedMotion';
import { BookScene } from './BookHero';
import { GiftScene } from './GiftHero';
import type { HeroModule } from './HeroFrame';
import { GiveScene } from './GiveHero';
import { LaunchScene } from './LaunchHero';
import { SendScene } from './SendHero';
import type { SceneProps } from './types';
import { VaultScene } from './VaultHero';
import frame from './HeroFrame.module.css';
import styles from './MiniHero.module.css';

export type MiniHeroId = 'vault' | 'send' | 'gift' | 'launch' | 'book' | 'give';

interface MiniSpec {
  readonly Scene: (props: SceneProps) => JSX.Element;
  readonly module: HeroModule;
  readonly durationMs: number;
  /** The frame shown while idle: a moment that sums up the mechanism. */
  readonly still: number;
}

const SPECS: Record<MiniHeroId, MiniSpec> = {
  vault: { Scene: VaultScene, module: 'vault', durationMs: 10000, still: 0.9 },
  send: { Scene: SendScene, module: 'send', durationMs: 9500, still: 0.92 },
  gift: { Scene: GiftScene, module: 'give', durationMs: 10000, still: 0.92 },
  launch: { Scene: LaunchScene, module: 'launch', durationMs: 11000, still: 0.9 },
  book: { Scene: BookScene, module: 'book', durationMs: 11000, still: 0.86 },
  give: { Scene: GiveScene, module: 'give', durationMs: 12000, still: 0.4 },
};

const hoverless = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;

/**
 * A small live preview of a module's mechanism animation. It idles on a still
 * and plays while `active` (hover / focus on desktop) or, on touch screens,
 * while it is mostly in view.
 */
export function MiniHero({ id, active }: { readonly id: MiniHeroId; readonly active: boolean }) {
  const spec = SPECS[id];
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, 0.6);
  const [touch] = useState(hoverless);
  const playing = !reduced && inView && (active || touch);
  const clock = useHeroClock(spec.durationMs, reduced, spec.still, { active: playing, ignoreFrozen: true });
  const { seek } = clock;
  // Start from the still the card was showing, so nothing blinks out on hover.
  useEffect(() => {
    if (playing) seek(spec.still);
  }, [playing, seek, spec.still]);
  const { Scene } = spec;
  return (
    <div
      ref={ref}
      className={[frame.palette, styles.mini].join(' ')}
      style={{ ['--hero-base' as string]: `var(--mod-${spec.module})` }}
      data-mini={id}
      data-playing={playing ? 'true' : 'false'}
      aria-hidden="true"
    >
      <Scene t={playing ? clock.t : spec.still} cycle={clock.cycle} layout="wide" mini />
    </div>
  );
}
