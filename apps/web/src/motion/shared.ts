import { useLayoutEffect, type RefObject } from 'react';
import { prefersReducedMotion } from './useReducedMotion';

/**
 * Shared-element hand-off across routes (tile coin → wizard coin → progress coin).
 * The leaving element records its on-screen box; the arriving element with the same key
 * plays a FLIP from that box to its own (transform only, WAAPI, compositor thread).
 */
interface Snapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly at: number;
}

const snapshots = new Map<string, Snapshot>();
/** A hand-off older than this is stale (the user wandered off); the element just appears. */
export const SHARED_TTL_MS = 1600;
export const SHARED_DURATION_MS = 560;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function rememberShared(key: string, element: Element | null): void {
  if (!element) return;
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;
  snapshots.set(key, { left: box.left, top: box.top, width: box.width, height: box.height, at: now() });
}

/** Remember the element marked `data-share="<key>"` inside `root` (or the document). */
export function rememberSharedByKey(key: string, root: ParentNode = document): void {
  rememberShared(key, root.querySelector(`[data-share="${CSS.escape(key)}"]`));
}

export function takeShared(key: string): Snapshot | null {
  const snap = snapshots.get(key) ?? null;
  snapshots.delete(key);
  if (!snap || now() - snap.at > SHARED_TTL_MS) return null;
  return snap;
}

/** The FLIP keyframes from a remembered box to the element's current box (centre to centre). */
export function flipFrames(from: Pick<Snapshot, 'left' | 'top' | 'width' | 'height'>, to: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Keyframe[] | null {
  if (to.width === 0 || to.height === 0) return null;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = from.width / to.width;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return null;
  return [{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(3)})` }, { transform: 'none' }];
}

export function useSharedArrival(key: string | null | undefined, ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (!key) return undefined;
    const element = ref.current;
    const snap = takeShared(key);
    if (!element || !snap || prefersReducedMotion() || typeof element.animate !== 'function') return undefined;
    const frames = flipFrames(snap, element.getBoundingClientRect());
    if (!frames) return undefined;
    const animation = element.animate(frames, { duration: SHARED_DURATION_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
    return () => animation.cancel();
  }, [key, ref]);
}
