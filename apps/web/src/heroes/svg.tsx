import { useId, type CSSProperties, type ReactNode } from 'react';
import { clamp01, lerp } from '../motion/easing';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Sample a quadratic Bézier between parameters `from` and `to`. */
export function quadPoints(p0: Point, c: Point, p1: Point, from = 0, to = 1, n = 24): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => quadAt(p0, c, p1, from + ((to - from) * i) / n));
}

export function quadAt(p0: Point, c: Point, p1: Point, u: number): Point {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const d = u * u;
  return { x: a * p0.x + b * c.x + d * p1.x, y: a * p0.y + b * c.y + d * p1.y };
}

/** Control point for an arc from a to b, lifted `lift` units perpendicular to the chord (negative = other side). */
export function arcControl(a: Point, b: Point, lift: number): Point {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mx + (dy / len) * lift, y: my - (dx / len) * lift };
}

export const arcAt = (a: Point, b: Point, lift: number, u: number): Point => quadAt(a, arcControl(a, b, lift), b, u);
export const arcPath = (a: Point, b: Point, lift: number): string => {
  const c = arcControl(a, b, lift);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
};

export const pointsAttr = (points: readonly Point[]): string => points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export const lerpPoint = (a: Point, b: Point, k: number): Point => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

/** A polyline that draws itself from start to end as `k` goes 0 → 1. */
export function Draw({ points, k, style, width = 1.5 }: { readonly points: readonly Point[]; readonly k: number; readonly style?: CSSProperties; readonly width?: number }) {
  if (k <= 0) return null;
  return (
    <polyline
      points={pointsAttr(points)}
      fill="none"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={1 - clamp01(k)}
      style={{ stroke: 'currentColor', ...style }}
    />
  );
}

/** A path drawn on by `k` (stroke-dashoffset on a unit path length). Dashed paths fade in instead. */
export function DrawPath({
  d,
  k,
  color = 'currentColor',
  width = 1.5,
  opacity = 1,
  dash,
}: {
  readonly d: string;
  readonly k: number;
  readonly color?: string;
  readonly width?: number;
  readonly opacity?: number;
  readonly dash?: string;
}) {
  if (k <= 0) return null;
  if (dash) {
    return <path d={d} fill="none" strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} style={{ stroke: color, opacity: opacity * clamp01(k) }} />;
  }
  return (
    <path
      d={d}
      fill="none"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={1 - clamp01(k)}
      style={{ stroke: color, opacity }}
    />
  );
}

export const tf = (x: number, y: number, scale = 1): string => `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})`;

/* Colour roles (HeroFrame defines the derived variables per theme). */
export const HERO = 'var(--hero)';
export const SOFT = 'var(--hero-soft)';
export const WASH = 'var(--hero-wash)';
export const INK = 'var(--text)';
export const INK2 = 'var(--ink-2)';
export const INK3 = 'var(--ink-3)';
export const PAPER = 'var(--surface)';
export const MUTED = 'var(--muted)';
export const LINE = 'var(--ink-3)';
export const OK = 'var(--ok)';
export const DANGER = 'var(--danger)';

export interface TxtProps {
  readonly x: number;
  readonly y: number;
  readonly children: ReactNode;
  readonly size?: number;
  readonly anchor?: 'start' | 'middle' | 'end';
  readonly color?: string;
  readonly opacity?: number;
  readonly font?: 'sans' | 'mono' | 'serif';
  readonly weight?: number;
}

/** SVG text with the product's type roles. */
export function Txt({ x, y, children, size = 12, anchor = 'start', color = MUTED, opacity = 1, font = 'sans', weight = 400 }: TxtProps) {
  if (opacity <= 0.001) return null;
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} style={{ fill: color, opacity, fontFamily: `var(--font-${font})`, fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </text>
  );
}

/** Characters fade in one by one: `k` 0 → 1 across the string. */
export function TypeText({ text, k, ...rest }: Omit<TxtProps, 'children'> & { readonly text: string; readonly k: number }) {
  const shown = k * text.length;
  return (
    <Txt {...rest}>
      {text.split('').map((char, i) => (
        <tspan key={`${i}-${char}`} style={{ opacity: clamp01(shown - i) }}>
          {char}
        </tspan>
      ))}
    </Txt>
  );
}

const cleanId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '');

/** Masked reveal: children show through a rectangle that grows with `k` in `dir`. */
export function Reveal({
  x,
  y,
  w,
  h,
  k,
  dir = 'right',
  children,
}: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly k: number;
  readonly dir?: 'right' | 'down' | 'up' | 'center';
  readonly children: ReactNode;
}) {
  const id = `rv${cleanId(useId())}`;
  const c = clamp01(k);
  if (c <= 0) return null;
  if (c >= 1) return <g>{children}</g>;
  const rect =
    dir === 'right'
      ? { x, y, width: w * c, height: h }
      : dir === 'down'
        ? { x, y, width: w, height: h * c }
        : dir === 'up'
          ? { x, y: y + h * (1 - c), width: w, height: h * c }
          : { x: x + (w * (1 - c)) / 2, y, width: w * c, height: h };
  return (
    <g>
      <clipPath id={id}>
        <rect {...rect} />
      </clipPath>
      <g clipPath={`url(#${id})`}>{children}</g>
    </g>
  );
}

/** A circled check whose ring and tick draw on with `k`. */
export function CheckMark({
  x,
  y,
  r = 9,
  k,
  color = OK,
  fill = 'none',
}: {
  readonly x: number;
  readonly y: number;
  readonly r?: number;
  readonly k: number;
  readonly color?: string;
  readonly fill?: string;
}) {
  if (k <= 0) return null;
  const ring = clamp01(k / 0.6);
  const tick = clamp01((k - 0.35) / 0.65);
  const s = r / 9;
  return (
    <g transform={tf(x, y)}>
      <circle r={r} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ring} strokeWidth={1.5} transform="rotate(-90)" style={{ stroke: color, fill }} />
      <path
        d={`M${-4 * s} ${0.5 * s} L${-1 * s} ${3.5 * s} L${4.5 * s} ${-3 * s}`}
        fill="none"
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={1 - tick}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: color }}
      />
    </g>
  );
}

/** Small cross used for "no link" beats; the two strokes draw one after the other. */
export function CrossMark({ x, y, k, size = 6, color = INK2 }: { readonly x: number; readonly y: number; readonly k: number; readonly size?: number; readonly color?: string }) {
  if (k <= 0) return null;
  const a = clamp01(k / 0.5);
  const b = clamp01((k - 0.5) / 0.5);
  return (
    <g transform={tf(x, y)}>
      <path d={`M${-size} ${-size} L${size} ${size}`} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - a} strokeWidth={1.75} strokeLinecap="round" style={{ stroke: color }} />
      <path d={`M${size} ${-size} L${-size} ${size}`} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - b} strokeWidth={1.75} strokeLinecap="round" style={{ stroke: color }} />
    </g>
  );
}

/** CJK ideographs and full-width forms take a full em. */
const isWide = (code: number): boolean => (code >= 0x3000 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef);

/** Rough advance-width estimate, good enough to size pills around short labels. */
export function textWidth(text: string, size: number, font: 'sans' | 'mono' | 'serif' = 'sans'): number {
  const per = font === 'mono' ? 0.6 : font === 'serif' ? 0.46 : 0.56;
  let width = 0;
  for (const char of text) width += isWide(char.codePointAt(0) ?? 0) ? size : char === ' ' ? size * 0.3 : size * per;
  return width;
}

export interface PillProps {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly k?: number;
  readonly color?: string;
  readonly fill?: string;
  readonly stroke?: string;
  readonly size?: number;
  readonly font?: 'sans' | 'mono' | 'serif';
  readonly scale?: number;
  readonly icon?: 'check' | 'cross' | 'lock' | 'clock';
  readonly iconColor?: string;
}

/** Rounded label pill centred on (x, y), with an optional leading glyph. */
export function Pill({ x, y, text, k = 1, color = INK, fill = PAPER, stroke = INK3, size = 12, font = 'sans', scale = 1, icon, iconColor = OK }: PillProps) {
  if (k <= 0) return null;
  const iconW = icon ? size + 6 : 0;
  const w = textWidth(text, size, font) + 24 + iconW;
  const h = size + 14;
  const left = -w / 2 + 12;
  return (
    <g transform={tf(x, y, scale)} style={{ opacity: clamp01(k) }}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} strokeWidth={1.25} style={{ fill, stroke }} />
      {icon === 'check' ? <path d={`M${left} 0.5 l3.2 3.2 l6 -6.4`} fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: iconColor }} /> : null}
      {icon === 'cross' ? <path d={`M${left + 1} -3.5 l7 7 M${left + 8} -3.5 l-7 7`} fill="none" strokeWidth={1.6} strokeLinecap="round" style={{ stroke: iconColor }} /> : null}
      {icon === 'clock' ? (
        <g transform={`translate(${left + 5} 0)`}>
          <circle r={5.5} fill="none" strokeWidth={1.4} style={{ stroke: iconColor }} />
          <path d="M0 -3 V0 L2.2 1.6" fill="none" strokeWidth={1.4} strokeLinecap="round" style={{ stroke: iconColor }} />
        </g>
      ) : null}
      {icon === 'lock' ? <LockGlyph x={left + 4.5} y={0} size={0.75} color={iconColor} closed={1} /> : null}
      <Txt x={left + iconW} y={size * 0.36} size={size} color={color} font={font} weight={font === 'sans' ? 500 : 400}>
        {text}
      </Txt>
    </g>
  );
}

/** Padlock; `closed` 0 → 1 drops the shackle into place. */
export function LockGlyph({
  x,
  y,
  size = 1,
  color = HERO,
  closed = 1,
  fill = PAPER,
}: {
  readonly x: number;
  readonly y: number;
  readonly size?: number;
  readonly color?: string;
  readonly closed?: number;
  readonly fill?: string;
}) {
  const lift = (1 - clamp01(closed)) * 5;
  return (
    <g transform={tf(x, y, size)}>
      <path d={`M-4.5 ${-3 - lift} V${-6.5 - lift} A4.5 4.5 0 0 1 4.5 ${-6.5 - lift} V${-3 - lift}`} fill="none" strokeWidth={1.6} strokeLinecap="round" style={{ stroke: color }} />
      <rect x={-7} y={-3} width={14} height={11} rx={2.5} strokeWidth={1.6} style={{ stroke: color, fill }} />
    </g>
  );
}

/** Envelope; `open` 0 → 1 morphs the flap from closed (pointing down) to open (pointing up). */
export function EnvelopeGlyph({
  x,
  y,
  w = 30,
  h = 20,
  open = 0,
  color = INK2,
  fill = PAPER,
  flapColor,
}: {
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly open?: number;
  readonly color?: string;
  readonly fill?: string;
  readonly flapColor?: string;
}) {
  const hw = w / 2;
  const hh = h / 2;
  const tipY = lerp(-hh + h * 0.55, -hh - h * 0.55, clamp01(open));
  return (
    <g transform={tf(x, y)}>
      <rect x={-hw} y={-hh} width={w} height={h} rx={3} strokeWidth={1.3} style={{ stroke: color, fill }} />
      <path d={`M${-hw + 1} ${-hh + 1} L0 ${tipY.toFixed(2)} L${hw - 1} ${-hh + 1}`} fill="none" strokeWidth={1.3} strokeLinejoin="round" style={{ stroke: flapColor ?? color }} />
    </g>
  );
}

/** Wallet chip: a small wallet glyph and a mono address. */
export function WalletChip({
  x,
  y,
  label,
  w = 112,
  opacity = 1,
  scale = 1,
  color = INK2,
  size = 12,
}: {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly w?: number;
  readonly opacity?: number;
  readonly scale?: number;
  readonly color?: string;
  readonly size?: number;
}) {
  if (opacity <= 0) return null;
  const h = 36;
  return (
    <g transform={tf(x, y, scale)} style={{ opacity }}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={10} strokeWidth={1.25} style={{ stroke: color, fill: PAPER }} />
      <g transform={`translate(${-w / 2 + 18} 0)`}>
        <rect x={-7} y={-5.5} width={14} height={11} rx={2.5} fill="none" strokeWidth={1.3} style={{ stroke: color }} />
        <path d="M2.5 0 h4.5" strokeWidth={1.3} strokeLinecap="round" style={{ stroke: color }} />
      </g>
      <Txt x={-w / 2 + 32} y={4.5} size={size} font="mono" color={INK}>
        {label}
      </Txt>
    </g>
  );
}
