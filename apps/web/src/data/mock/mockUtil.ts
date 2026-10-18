import type { Address, Hex } from '../types';

/** Deterministic PRNG (mulberry32) so mock data is stable between reloads. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function hashString(text: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function randomHex(rng: () => number, bytes: number): string {
  let out = '';
  for (let i = 0; i < bytes; i += 1) {
    out += Math.floor(rng() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

export const randomAddress = (rng: () => number): Address => `0x${randomHex(rng, 20)}`;
export const randomTxHash = (rng: () => number): Hex => `0x${randomHex(rng, 32)}`;

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick() on empty list');
  return item;
}

/** price × (1 + delta) with delta given in parts per million. */
export function scalePpm(value: bigint, ppm: number): bigint {
  return (value * BigInt(1_000_000 + Math.round(ppm))) / 1_000_000n;
}
