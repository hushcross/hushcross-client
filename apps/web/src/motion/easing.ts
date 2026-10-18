/** Shared motion constants (DESIGN_SYSTEM §8). */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];
export const ENTER_S = 0.32;
export const EXIT_S = 0.16;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Cubic-bezier-like ease-out-expo approximation for timeline maths. */
export const easeOut = (x: number): number => {
  const c = clamp01(x);
  return c === 1 ? 1 : 1 - 2 ** (-10 * c);
};

export const easeInOut = (x: number): number => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};

/** Eased progress of a timeline segment [start, end] (both in 0..1 of the loop). */
export function seg(t: number, start: number, end: number, ease: (x: number) => number = easeInOut): number {
  return ease((t - start) / (end - start));
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * Normalised damped-spring response for timeline maths: 0 → 1 with a small,
 * settling overshoot. `damping` 1 is critical (no overshoot); 0.5 overshoots ~16%.
 */
export function spring(x: number, damping = 0.62, stiffness = 11): number {
  const c = clamp01(x);
  if (c === 0 || c === 1) return c;
  const zeta = Math.min(0.999, Math.max(0.05, damping));
  const wd = stiffness * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * stiffness * c);
  return 1 - decay * (Math.cos(wd * c) + ((zeta * stiffness) / wd) * Math.sin(wd * c));
}

/** Spring-shaped segment of the loop. */
export const springSeg = (t: number, start: number, end: number, damping?: number): number => spring((t - start) / (end - start), damping);

/** Start offset for the i-th element of a staggered group. */
export const stagger = (base: number, index: number, step: number): number => base + index * step;

/** Rises over [a, b], holds, then falls over [c, d]: handy for in-and-out beats. */
export function window4(t: number, a: number, b: number, c: number, d: number): number {
  return seg(t, a, b, easeOut) * (1 - seg(t, c, d));
}
