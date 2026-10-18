/**
 * Guilloché curves (DESIGN_SYSTEM §9.1): the engraved line-work of banknotes and bank
 * cheques, drawn as epitrochoids. Two woven arcs per lobe echo the two crossing arcs of
 * the HushCross mark. Generated once per parameter set; output is a plain SVG path.
 */
export interface TrochoidParams {
  /** Fixed circle radius. */
  readonly R: number;
  /** Rolling circle radius (R / r non-integer → woven lobes). */
  readonly r: number;
  /** Pen distance from the rolling centre. */
  readonly d: number;
  /** Turns of the rolling circle needed to close the curve. */
  readonly turns: number;
  /** Output radius in user units (the curve is fitted into ±radius). */
  readonly radius: number;
  readonly steps?: number;
  readonly rotate?: number;
}

const cache = new Map<string, string>();

export function epitrochoidPath({ R, r, d, turns, radius, steps = 1400, rotate = 0 }: TrochoidParams): string {
  const key = [R, r, d, turns, radius, steps, rotate].join(':');
  const hit = cache.get(key);
  if (hit) return hit;
  const k = (R + r) / r;
  const extent = R + r + Math.abs(d);
  const scale = radius / extent;
  const total = Math.PI * 2 * turns;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * total + rotate;
    const x = ((R + r) * Math.cos(t) - d * Math.cos(k * t)) * scale;
    const y = ((R + r) * Math.sin(t) - d * Math.sin(k * t)) * scale;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  const path = `${parts.join('')}Z`;
  cache.set(key, path);
  return path;
}

/** Rosette layers used on the vault plate, outermost first. */
export const PLATE_ROSETTE: readonly TrochoidParams[] = [
  { R: 11, r: 4, d: 5.2, turns: 4, radius: 100 },
  { R: 11, r: 4, d: 3.6, turns: 4, radius: 78, rotate: 0.14 },
  { R: 7, r: 3, d: 2.4, turns: 3, radius: 52, rotate: 0.3 },
];

/** A horizontal guilloché band: a bundle of phase-shifted sine waves, like a cheque border. */
export function wavePath({ width, height, waves, phase, amplitude }: { readonly width: number; readonly height: number; readonly waves: number; readonly phase: number; readonly amplitude: number }): string {
  const steps = Math.max(40, Math.round(waves * 24));
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * width;
    const y = height / 2 + Math.sin((i / steps) * Math.PI * 2 * waves + phase) * amplitude;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(2)}`);
  }
  return parts.join('');
}
