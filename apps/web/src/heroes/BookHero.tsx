import { useI18n } from '../i18n/I18nProvider';
import { clamp01, easeOut, lerp, seg, springSeg } from '../motion/easing';
import { HeroFrame } from './HeroFrame';
import { bookCross, bookCurves, DEMO_BUYS, DEMO_REFERENCE, DEMO_SELLS, type HeroOrder } from './heroData';
import { CheckMark, DANGER, Draw, HERO, INK, INK2, INK3, OK, PAPER, Pill, Reveal, SOFT, Txt, type Point } from './svg';
import { viewBox, type SceneProps } from './types';

export interface BookHeroProps {
  /** Revealed orders for one epoch. Omit for the illustrative demo. */
  readonly buys?: readonly HeroOrder[];
  readonly sells?: readonly HeroOrder[];
  readonly reference?: number;
  readonly bandBps?: number;
}

const MAX_CARDS = 5;
const BUY = 'var(--ok)';
const SELL = 'var(--danger)';

export const formatBookPrice = (n: number): string => (n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n >= 100 ? n.toFixed(1) : n.toPrecision(3));
const formatQty = (n: number): string => String(Math.round(n * 100) / 100);

interface Geometry {
  readonly chart: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  readonly buyX: number;
  readonly sellX: number;
  readonly cardW: number;
  readonly cardY: (i: number) => number;
}

const GEO: Record<SceneProps['layout'], Geometry> = {
  wide: { chart: { left: 146, right: 494, top: 70, bottom: 292 }, buyX: 66, sellX: 574, cardW: 100, cardY: (i) => 92 + i * 42 },
  tall: { chart: { left: 34, right: 326, top: 58, bottom: 232 }, buyX: 96, sellX: 264, cardW: 140, cardY: (i) => 330 + i * 34 },
};

function OrderCard({
  x,
  y,
  w,
  label,
  side,
  reveal,
  matched,
  opacity,
  inside = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly label: string;
  readonly side: 'buy' | 'sell';
  readonly reveal: number;
  readonly matched: number;
  readonly opacity: number;
  readonly inside?: boolean;
}) {
  if (opacity <= 0) return null;
  const color = side === 'buy' ? BUY : SELL;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} style={{ opacity }}>
      <rect x={-w / 2} y={-14} width={w} height={28} rx={9} strokeWidth={1.3} style={{ fill: PAPER, stroke: color }} />
      <rect x={-w / 2 + 12} y={-3} width={w - 24} height={6} rx={3} style={{ fill: INK3, opacity: 1 - reveal }} />
      <Reveal x={-w / 2} y={-14} w={w} h={28} k={reveal}>
        <Txt x={0} y={4.5} size={12} anchor="middle" font="mono" color={INK}>
          {label}
        </Txt>
      </Reveal>
      {matched > 0 ? <CheckMark x={inside ? w / 2 - 16 : side === 'buy' ? w / 2 + 14 : -w / 2 - 14} y={0} r={7} k={matched} color={OK} /> : null}
    </g>
  );
}

interface BookSceneProps extends SceneProps, BookHeroProps {}

export function BookScene({ t, layout, mini = false, buys, sells, reference, bandBps = 200 }: BookSceneProps) {
  const { t: tr } = useI18n();
  const g = GEO[layout];
  const { chart } = g;
  const b = buys ?? DEMO_BUYS;
  const s = sells ?? DEMO_SELLS;
  const ref = reference ?? DEMO_REFERENCE;
  if (b.length + s.length === 0) {
    return (
      <svg viewBox={viewBox(layout)} role="presentation">
        <Txt x={layout === 'wide' ? 320 : 180} y={layout === 'wide' ? 184 : 244} size={14} anchor="middle">
          {tr('hero.book.empty')}
        </Txt>
      </svg>
    );
  }
  const cross = bookCross(b, s, ref, bandBps);
  const curves = bookCurves(b, s);
  const prices = [...b, ...s].map((o) => o.price);
  const pad = ref * (bandBps / 10_000) * 1.6;
  const minP = Math.min(ref - pad, ...prices);
  const maxP = Math.max(ref + pad, ...prices);
  const maxQ = Math.max(1, ...curves.buy.map((p) => p[1]), ...curves.sell.map((p) => p[1])) * 1.12;
  const px = (p: number): number => chart.left + ((p - minP) / (maxP - minP || 1)) * (chart.right - chart.left);
  const qy = (q: number): number => chart.bottom - (q / maxQ) * (chart.bottom - chart.top);
  /** Step line: hold each cumulative quantity until the next price level. */
  const steps = (pts: readonly [number, number][]): Point[] =>
    pts.flatMap(([p, q], i) => {
      const next = pts[i + 1];
      const here = { x: px(p), y: qy(q) };
      return next ? [here, { x: px(next[0]), y: qy(q) }] : [here];
    });

  const fade = 1 - seg(t, 0.95, 1);
  const reveal = (i: number): number => seg(t, 0.18 + i * 0.016, 0.26 + i * 0.016, easeOut);
  const toAxis = (i: number): number => seg(t, 0.3 + i * 0.012, 0.42 + i * 0.012, easeOut);
  const axes = seg(t, 0.28, 0.36);
  const band = seg(t, 0.34, 0.46, easeOut);
  const curveK = seg(t, 0.42, 0.58);
  const mark = springSeg(t, 0.6, 0.7, 0.5);
  const exec = cross.inBand ? seg(t, 0.68, 0.78, easeOut) : 0;
  const matched = cross.inBand ? seg(t, 0.74, 0.82) : 0;
  const back = cross.inBand ? 0 : seg(t, 0.7, 0.84, easeOut);
  const crossPoint = cross.price !== null ? { x: px(cross.price), y: qy(cross.volume) } : null;
  const isMatched = (side: 'buy' | 'sell', price: number): boolean => cross.price !== null && cross.inBand && (side === 'buy' ? price >= cross.price : price <= cross.price);

  const cards = (side: 'buy' | 'sell', list: readonly HeroOrder[]) =>
    list.slice(0, MAX_CARDS).map((o, i) => {
      const enter = springSeg(t, 0.02 + i * 0.03 + (side === 'sell' ? 0.015 : 0), 0.16 + i * 0.03 + (side === 'sell' ? 0.015 : 0), 0.6);
      const baseX = side === 'buy' ? g.buyX : g.sellX;
      const outward = side === 'buy' ? -1 : 1;
      const x = baseX + outward * (1 - enter) * 40 + outward * back * 60;
      const y = g.cardY(i);
      const dim = 1 - 0.45 * seg(t, 0.3, 0.38) + 0.45 * matched * (isMatched(side, o.price) ? 1 : 0);
      const k = toAxis(i + (side === 'sell' ? MAX_CARDS : 0));
      const dot = k > 0 && k < 1 ? { x: lerp(x + (side === 'buy' ? g.cardW / 2 : -g.cardW / 2), px(o.price), k), y: lerp(y, chart.bottom + 4, k) - Math.sin(k * Math.PI) * 30 } : null;
      return (
        <g key={`${side}-${i}`}>
          <OrderCard
            x={x}
            y={y}
            w={g.cardW}
            label={`${formatBookPrice(o.price)} · ${formatQty(o.amount)}`}
            side={side}
            reveal={reveal(i)}
            matched={isMatched(side, o.price) ? matched : 0}
            inside={layout === 'tall'}
            opacity={clamp01(enter * 1.5) * dim * (1 - seg(back, 0.7, 1))}
          />
          {dot ? <circle cx={dot.x} cy={dot.y} r={4} style={{ fill: side === 'buy' ? BUY : SELL }} /> : null}
          {k >= 1 ? <circle cx={px(o.price)} cy={chart.bottom + 4} r={3} style={{ fill: side === 'buy' ? BUY : SELL, opacity: 0.8 * (1 - seg(t, 0.9, 0.95)) }} /> : null}
        </g>
      );
    });

  return (
    <svg viewBox={viewBox(layout)} role="presentation">
      <g style={{ opacity: fade }}>
        {/* Reference band. */}
        <Reveal x={px(cross.band[0])} y={chart.top - 4} w={px(cross.band[1]) - px(cross.band[0])} h={chart.bottom - chart.top + 8} k={band} dir="center">
          <rect x={px(cross.band[0])} y={chart.top - 4} width={px(cross.band[1]) - px(cross.band[0])} height={chart.bottom - chart.top + 8} rx={8} style={{ fill: SOFT }} />
        </Reveal>
        {mini ? null : (
          <Txt x={(px(cross.band[0]) + px(cross.band[1])) / 2} y={chart.top + 12} size={11} anchor="middle" color={HERO} opacity={band}>
            {tr('hero.book.band')}
          </Txt>
        )}

        {/* Axes and price ticks. */}
        <g style={{ opacity: axes }}>
          <line x1={chart.left} x2={chart.right} y1={chart.bottom + 4} y2={chart.bottom + 4} strokeWidth={1} style={{ stroke: INK3 }} />
          {mini
            ? null
            : [minP, ref, maxP].map((p, i) => (
                <Txt key={`tick-${i}`} x={px(p)} y={chart.bottom + 22} size={11} anchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} font="mono" color={i === 1 ? INK : INK2}>
                  {formatBookPrice(p)}
                </Txt>
              ))}
          {mini ? null : (
            <>
              <Txt x={chart.left} y={chart.top - 12} size={11} color={BUY} opacity={curveK}>
                {tr('hero.book.demand')}
              </Txt>
              <Txt x={chart.right} y={chart.top - 12} size={11} anchor="end" color={SELL} opacity={curveK}>
                {tr('hero.book.supply')}
              </Txt>
            </>
          )}
        </g>

        {/* Cumulative curves: demand falls with price, supply rises. */}
        <g style={{ color: BUY }}>
          <Draw points={steps(curves.buy)} k={curveK} width={2} />
        </g>
        <g style={{ color: SELL }}>
          <Draw points={steps(curves.sell)} k={curveK} width={2} />
        </g>

        {/* One uniform price where they cross. */}
        {crossPoint ? (
          <>
            {exec > 0 ? <line x1={crossPoint.x} x2={crossPoint.x} y1={crossPoint.y} y2={lerp(crossPoint.y, chart.bottom + 4, exec)} strokeWidth={2} style={{ stroke: HERO }} /> : null}
            <g transform={`translate(${crossPoint.x.toFixed(1)} ${crossPoint.y.toFixed(1)}) scale(${mark.toFixed(3)})`} style={{ opacity: clamp01(mark * 2) }}>
              <circle r={7} strokeWidth={2} style={{ fill: PAPER, stroke: cross.inBand ? INK : DANGER }} />
            </g>
            {mini ? null : (
              <Pill
                x={Math.min(chart.right - 70, Math.max(chart.left + 70, crossPoint.x))}
                y={chart.top - 36}
                text={`${formatBookPrice(cross.price ?? 0)} · ${formatQty(cross.volume)}`}
                k={clamp01(mark * 1.5)}
                scale={lerp(0.9, 1, mark)}
                font="mono"
                size={12}
                stroke={cross.inBand ? HERO : DANGER}
              />
            )}
          </>
        ) : null}

        {cards('buy', b)}
        {cards('sell', s)}

        {mini ? null : (
          <Pill
            x={layout === 'wide' ? 320 : 180}
            y={layout === 'wide' ? 336 : 290}
            text={cross.inBand ? tr('hero.book.cleared', { n: formatQty(cross.volume) }) : tr('hero.book.returned')}
            k={seg(t, 0.78, 0.84)}
            icon={cross.inBand ? 'check' : 'cross'}
            iconColor={cross.inBand ? OK : DANGER}
            size={12}
          />
        )}
      </g>
    </svg>
  );
}

/** Sealed buys and sells → reveal → cumulative curves cross → one price inside (or outside) the band. */
export function BookHero({ buys, sells, reference, bandBps = 200 }: BookHeroProps) {
  const { t } = useI18n();
  const cross = bookCross(buys ?? DEMO_BUYS, sells ?? DEMO_SELLS, reference ?? DEMO_REFERENCE, bandBps);
  return (
    <HeroFrame
      id="book"
      module="book"
      title={t('hero.book.title')}
      durationMs={11000}
      staticAt={0.86}
      note={buys ? t('hero.liveBatch') : undefined}
      steps={[
        { at: 0, text: t('hero.book.s1') },
        { at: 0.17, text: t('hero.book.s2') },
        { at: 0.3, text: t('hero.book.s3') },
        { at: 0.6, text: cross.inBand ? t('hero.book.s4in') : t('hero.book.s4out') },
      ]}
    >
      {(scene) => <BookScene {...scene} buys={buys} sells={sells} reference={reference} bandBps={bandBps} />}
    </HeroFrame>
  );
}
