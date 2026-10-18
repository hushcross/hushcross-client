import { useCallback, useEffect, useRef, useState } from 'react';

export interface HeroClock {
  /** Loop progress in [0, 1). */
  readonly t: number;
  /** Completed loops since the last replay. */
  readonly cycle: number;
  /** User intent: true unless paused with the control. */
  readonly playing: boolean;
  /** True while frames are actually advancing (playing, on screen, tab visible). */
  readonly running: boolean;
  readonly toggle: () => void;
  readonly replay: () => void;
  /** Jump to a loop position (0..1) and keep the current play state. */
  readonly seek: (t: number) => void;
}

const frame = (cb: (now: number) => void): number =>
  typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(cb) : window.setTimeout(() => cb(performance.now()), 16);
const cancel = (id: number): void => (typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame(id) : window.clearTimeout(id));

/** Review aid: `?heroAt=0.5` freezes every hero at that point of its loop. */
export function frozenProgress(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('heroAt');
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(0.999, Math.max(0, value)) : null;
}

export interface HeroClockOptions {
  /** False while the hero is off screen (or a preview is idle): frames stop, position is kept. */
  readonly active?: boolean;
  /** Ignore `?heroAt` (used by small previews that should always idle on their still). */
  readonly ignoreFrozen?: boolean;
}

/**
 * Drives a looping hero timeline with requestAnimationFrame. Stops while the
 * tab is hidden or the hero is off screen, and holds `staticAt` when motion is reduced.
 */
export function useHeroClock(durationMs: number, reduced: boolean, staticAt: number, options: HeroClockOptions = {}): HeroClock {
  const { active = true, ignoreFrozen = false } = options;
  const frozen = ignoreFrozen ? null : frozenProgress();
  const [t, setT] = useState(frozen ?? (reduced ? staticAt : 0));
  const [playing, setPlaying] = useState(frozen === null && !reduced);
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const elapsed = useRef(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const onVisibility = (): void => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (reduced) {
      setPlaying(false);
      setT(frozen ?? staticAt);
    }
  }, [reduced, staticAt, frozen]);

  // Review aid: with ?heroAt, a recorder can step frames by dispatching `hushcross:hero-at`.
  useEffect(() => {
    if (frozen === null) return undefined;
    const onSeek = (event: Event): void => {
      const value = (event as CustomEvent<number>).detail;
      if (Number.isFinite(value)) setT(Math.min(0.999, Math.max(0, value)));
    };
    window.addEventListener('hushcross:hero-at', onSeek);
    return () => window.removeEventListener('hushcross:hero-at', onSeek);
  }, [frozen]);

  const running = playing && !hidden && !reduced && active;

  useEffect(() => {
    if (!running) return undefined;
    let last: number | null = null;
    let id = 0;
    const tick = (now: number): void => {
      // Clamp long gaps (debugger, throttled tab) so the story never skips a beat.
      if (last !== null) elapsed.current += Math.min(64, now - last);
      last = now;
      setT((elapsed.current % durationMs) / durationMs);
      setCycle(Math.floor(elapsed.current / durationMs));
      id = frame(tick);
    };
    id = frame(tick);
    return () => cancel(id);
  }, [running, durationMs]);

  const toggle = useCallback(() => setPlaying((p) => !p), []);
  const replay = useCallback(() => {
    elapsed.current = 0;
    setT(0);
    setCycle(0);
    if (!reduced) setPlaying(true);
  }, [reduced]);
  const seek = useCallback(
    (to: number) => {
      const clamped = Math.min(0.999, Math.max(0, to));
      const loops = Math.floor(elapsed.current / durationMs);
      elapsed.current = loops * durationMs + clamped * durationMs;
      setT(clamped);
    },
    [durationMs],
  );

  return { t, cycle, playing, running, toggle, replay, seek };
}
