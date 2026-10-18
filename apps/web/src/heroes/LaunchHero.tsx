import { useI18n } from '../i18n/I18nProvider';
import { clamp01, easeOut, lerp, seg, springSeg } from '../motion/easing';
import { HeroFrame } from './HeroFrame';
import { DEMO_BIDS, DEMO_SUPPLY, launchLadder, type HeroBid } from './heroData';
import { arcAt, Draw, EnvelopeGlyph, HERO, INK, INK2, INK3, LockGlyph, PAPER, Pill, Reveal, SOFT, Txt, type Point } from './svg';
import { viewBox, type SceneProps } from './types';

export interface LaunchHeroProps {
  /** Revealed bids (price per token, tokens demanded). Omit for the illustrative demo. */
  readonly bids?: readonly HeroBid[];
  readonly supply?: number;
  /** Before reveal only the envelope count is public; pass it to show sealed bids only. */
  readonly sealedCount?: number;
  readonly quote?: string;
}

const MAX_ROWS = 8;

/** Short, readable price labels: 0.000000285 → 0.0₆285. */
export function formatHeroPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  const zeros = Math.floor(-Math.log10(n));
  if (zeros < 5) return String(Number(n.toPrecision(3)));
  const digits = String(Math.round(n * 10 ** (zeros + 4))).replace(/0+$/, '') || '0';
  const sub = String(zeros)
    .split('')
    .map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)] ?? d)
    .join('');
  return `0.0${sub}${digits}`;
}

interface Geometry {
  readonly chart: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  readonly envY: number;
  readonly envSpan: readonly [number, number];
  readonly pool: Point;
  readonly lockPill: Point;
  readonly tagW: number;
}

const GEO: Record<SceneProps['layout'], Geometry> = {
  wide: { chart: { left: 116, right: 456, top: 74, bottom: 300 }, envY: 168, envSpan: [150, 490], pool: { x: 558, y: 176 }, lockPill: { x: 558, y: 240 }, tagW: 64 },
  tall: { chart: { left: 92, right: 334, top: 92, bottom: 330 }, envY: 214, envSpan: [44, 316], pool: { x: 128, y: 414 }, lockPill: { x: 252, y: 414 }, tagW: 64 },
};

/** Deterministic "arrival" order so sorting by price is visible. */
function arrivalOrder(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = (i * 7 + 3) % (i + 1);
    const a = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = a;
  }
  return order;
}

interface LaunchSceneProps extends SceneProps {
  readonly bids?: readonly HeroBid[];
  readonly supply?: number;
  readonly quote?: string;
}

export function LaunchScene({ t, layout, mini = false, bids, supply, quote = 'USDT' }: LaunchSceneProps) {
  const { t: tr } = useI18n();
  const g = GEO[layout];
  const { chart } = g;
  const data = bids ?? DEMO_BIDS;
  const target = supply ?? DEMO_SUPPLY;
  const ladder = launchLadder(data, target);
  const rows = ladder.rows.slice(0, MAX_ROWS);
  if (rows.length === 0) {
    return (
      <svg viewBox={viewBox(layout)} role="presentation">
        <Txt x={layout === 'wide' ? 320 : 180} y={layout === 'wide' ? 184 : 244} size={14} anchor="middle">
          {tr('hero.launch.empty')}
        </Txt>
      </svg>
    );
  }
  const maxX = Math.max(target, rows[rows.length - 1]?.cumulative ?? 0) * 1.06 || 1;
  const x = (v: number): number => chart.left + (v / maxX) * (chart.right - chart.left);
  const rowH = (chart.bottom - chart.top) / Math.max(rows.length, 5);
  const rowY = (i: number): number => chart.top + i * rowH + rowH / 2;
  const clearIdx = rows.findIndex((r) => r.price === ladder.clearingPrice);
  const clearY = clearIdx >= 0 ? rowY(clearIdx) : chart.bottom;
  const order = arrivalOrder(rows.length);
  const span = g.envSpan[1] - g.envSpan[0];
  const slotX = (s: number): number => g.envSpan[0] + (rows.length > 1 ? (s * span) / (rows.length - 1) : span / 2);

  const fade = 1 - seg(t, 0.95, 1);
  const flip = seg(t, 0.19, 0.29);
  const sort = (s: number): number => seg(t, 0.29 + s * 0.012, 0.42 + s * 0.012, easeOut);
  const axes = seg(t, 0.38, 0.46);
  const curve = seg(t, 0.46, 0.6);
  const supplyK = seg(t, 0.44, 0.5);
  const pLine = seg(t, 0.6, 0.68, easeOut);
  const pPill = springSeg(t, 0.62, 0.74, 0.55);
  const flow = (i: number): number => seg(t, 0.78 + i * 0.03, 0.88 + i * 0.03, easeOut);
  const poolIn = springSeg(t, 0.74, 0.84, 0.6);
  const lock = springSeg(t, 0.88, 0.95, 0.5);
  const stair = rows.flatMap((r, i) => [
    { x: x(r.cumulative - r.amount), y: chart.top + i * rowH },
    { x: x(r.cumulative), y: chart.top + i * rowH },
    { x: x(r.cumulative), y: chart.top + (i + 1) * rowH },
  ]);
  const stopAt = clearIdx >= 0 ? (clearIdx + 1) * 3 : stair.length;
  const tagHome = (r: number): Point => ({ x: chart.left - g.tagW / 2 - 8, y: rowY(r) });

  return (
    <svg viewBox={viewBox(layout)} role="presentation">
      <g style={{ opacity: fade }}>
        {/* Axes. */}
        <g style={{ opacity: axes }}>
          <line x1={chart.left} x2={chart.left} y1={chart.top - 6} y2={chart.bottom + 4} strokeWidth={1} style={{ stroke: INK3 }} />
          <line x1={chart.left} x2={chart.right} y1={chart.bottom + 4} y2={chart.bottom + 4} strokeWidth={1} style={{ stroke: INK3 }} />
          {mini ? null : (
            <Txt x={chart.left + 2} y={chart.bottom + 22} size={11}>
              {tr('hero.launch.demand')}
            </Txt>
          )}
        </g>

        {/* Bars: tokens demanded at each price, stacked into cumulative demand. */}
        {rows.map((r, i) => {
          const grow = seg(t, 0.42 + i * 0.012, 0.54 + i * 0.012, easeOut);
          if (grow <= 0) return null;
          const x0 = x(r.cumulative - r.amount);
          const w = Math.max(2, x(r.cumulative) - x0);
          const win = r.wins ? seg(t, 0.66 + i * 0.01, 0.72 + i * 0.01) : 0;
          const lose = r.wins ? 0 : seg(t, 0.68, 0.74);
          return (
            <g key={`bar-${i}`}>
              <rect
                x={x0}
                y={rowY(i) - rowH / 2 + 3}
                width={w}
                height={rowH - 6}
                rx={4}
                strokeWidth={1.2}
                transform={`translate(${x0.toFixed(1)} 0) scale(${grow.toFixed(3)} 1) translate(${(-x0).toFixed(1)} 0)`}
                style={{ fill: lose > 0 ? PAPER : SOFT, stroke: lose > 0 ? INK3 : HERO, fillOpacity: 1, opacity: 1 - lose * 0.3 }}
              />
              {win > 0 ? <rect x={x0} y={rowY(i) - rowH / 2 + 3} width={w * win} height={rowH - 6} rx={4} style={{ fill: HERO, opacity: 0.85 }} /> : null}
              {mini || r.wins ? null : (
                <Txt x={x0 - 8} y={rowY(i) + 4} size={11} anchor="end" opacity={lose}>
                  {tr('hero.launch.refund')}
                </Txt>
              )}
            </g>
          );
        })}
        <g style={{ color: INK }}>
          <Draw points={stair.slice(0, stopAt)} k={curve} width={1.5} />
        </g>

        {/* Supply line. */}
        <g style={{ opacity: supplyK }}>
          <line x1={x(target)} x2={x(target)} y1={chart.top - 10} y2={chart.bottom + 4} strokeWidth={1.25} strokeDasharray="3 4" style={{ stroke: INK2 }} />
          {mini ? null : (
            <Txt x={x(target)} y={chart.bottom + 22} size={11} anchor="middle" color={INK2}>
              {tr('hero.launch.supply')}
            </Txt>
          )}
        </g>

        {/* Uniform clearing price. */}
        {clearIdx >= 0 ? (
          <>
            <Reveal x={chart.left} y={clearY - 2} w={x(target) - chart.left} h={4} k={pLine}>
              <line x1={chart.left} x2={x(target)} y1={clearY} y2={clearY} strokeWidth={2} style={{ stroke: HERO }} />
            </Reveal>
            {mini ? null : (
              <Pill
                x={x(target)}
                y={chart.top - 24}
                text={`p* = ${formatHeroPrice(ladder.clearingPrice ?? 0)} ${quote}`}
                k={clamp01(pPill * 1.5)}
                scale={lerp(0.9, 1, pPill)}
                size={12}
                font="mono"
                stroke={HERO}
              />
            )}
          </>
        ) : null}

        {/* Envelopes drop in arrival order, flip into price tags and sort into the ladder. */}
        {order.map((r, s) => {
          const row = rows[r];
          if (!row) return null;
          const drop = springSeg(t, 0.02 + s * 0.018, 0.14 + s * 0.018, 0.55);
          const start = { x: slotX(s), y: g.envY };
          const k = sort(s);
          const home = tagHome(r);
          const p = { x: lerp(start.x, home.x, k), y: lerp(start.y, home.y, k) - Math.sin(k * Math.PI) * 18 };
          // Cross-flip: the envelope folds away while its price tag unfolds over it.
          const envelope = 1 - flip;
          const tag = clamp01((flip - 0.25) / 0.75);
          const isClear = r === clearIdx;
          return (
            <g key={`env-${s}`}>
              {envelope > 0 ? (
                <g transform={`translate(${start.x.toFixed(1)} ${lerp(start.y - 60, start.y, drop).toFixed(1)}) scale(1 ${envelope.toFixed(3)})`} style={{ opacity: clamp01(drop * 2) }}>
                  <EnvelopeGlyph x={0} y={0} w={layout === 'wide' ? 36 : 28} h={layout === 'wide' ? 24 : 19} color={INK2} />
                </g>
              ) : null}
              {tag > 0 ? (
                <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${lerp(0.72, 1, k).toFixed(3)} ${(tag * lerp(0.72, 1, k)).toFixed(3)})`}>
                  <rect x={-g.tagW / 2} y={-11} width={g.tagW} height={22} rx={7} strokeWidth={1.2} style={{ fill: PAPER, stroke: isClear && pLine > 0 ? HERO : INK3 }} />
                  <Txt x={0} y={4} size={11} anchor="middle" font="mono" color={isClear && pLine > 0 ? INK : INK2}>
                    {formatHeroPrice(row.price)}
                  </Txt>
                </g>
              ) : null}
            </g>
          );
        })}
        {mini ? null : (
          <Txt x={(g.envSpan[0] + g.envSpan[1]) / 2} y={g.envY + 44} size={12} anchor="middle" opacity={seg(t, 0.08, 0.14) * (1 - flip)}>
            {tr('hero.launch.sealedRow')}
          </Txt>
        )}

        {/* Part of the raise seeds a pool; the LP is locked. */}
        {[0, 1, 2].map((i) => {
          const k = flow(i);
          if (k <= 0 || k >= 1) return null;
          const p = arcAt({ x: x(target), y: clearY }, { x: g.pool.x - 20, y: g.pool.y }, layout === 'wide' ? 40 : -40, k);
          return <circle key={`flow-${i}`} cx={p.x} cy={p.y} r={4.5} style={{ fill: HERO, opacity: Math.sin(k * Math.PI) }} />;
        })}
        <g transform={`translate(${g.pool.x} ${g.pool.y}) scale(${lerp(0.85, 1, poolIn).toFixed(3)})`} style={{ opacity: clamp01(poolIn * 1.5) }}>
          <circle cx={-12} r={24} strokeWidth={1.5} style={{ fill: PAPER, stroke: INK }} />
          <circle cx={12} r={24} strokeWidth={1.5} style={{ fill: 'none', stroke: HERO }} />
          {mini ? null : (
            <Txt x={layout === 'wide' ? 0 : -46} y={layout === 'wide' ? 44 : 4} size={11} anchor={layout === 'wide' ? 'middle' : 'end'} color={INK2}>
              {tr('hero.launch.pool')}
            </Txt>
          )}
          <g style={{ opacity: clamp01(lock * 2) }}>
            <LockGlyph x={30} y={-22} size={1.1} closed={lock} color={HERO} />
          </g>
        </g>
        {mini ? null : <Pill x={g.lockPill.x} y={g.lockPill.y + (layout === 'wide' ? 22 : 0)} text={tr('hero.launch.lpLocked')} k={seg(t, 0.9, 0.94)} icon="lock" iconColor={HERO} size={11} />}
      </g>
    </svg>
  );
}

/** Sealed envelopes → reveal → price ladder and demand curve → one clearing price → locked liquidity. */
export function LaunchHero({ bids, supply, sealedCount, quote = 'USDT' }: LaunchHeroProps) {
  const { t } = useI18n();
  if (sealedCount !== undefined) return <SealedLaunchHero count={sealedCount} />;
  return (
    <HeroFrame
      id="launch"
      module="launch"
      title={t('hero.launch.title')}
      durationMs={11000}
      staticAt={0.9}
      note={bids ? t('hero.liveData') : undefined}
      steps={[
        { at: 0, text: t('hero.launch.s1') },
        { at: 0.19, text: t('hero.launch.s2') },
        { at: 0.4, text: t('hero.launch.s3') },
        { at: 0.6, text: t('hero.launch.s4') },
        { at: 0.76, text: t('hero.launch.s5') },
      ]}
    >
      {(scene) => <LaunchScene {...scene} bids={bids} supply={supply} quote={quote} />}
    </HeroFrame>
  );
}

const SEALED_GRID = { wide: { cols: 8, rows: 3, x0: 138, dx: 52, y0: 92, dy: 54 }, tall: { cols: 6, rows: 4, x0: 50, dx: 52, y0: 70, dy: 52 } } as const;

/**
 * `stage` (live job status): 0 bidding, 1 bids opening, 2 waiting for the result, 3 settled. The demo
 * hero leaves it out and tells the bidding part only.
 */
export function SealedLaunchScene({ t, layout, count, stage = 0 }: SceneProps & { readonly count: number; readonly stage?: number }) {
  const { t: tr } = useI18n();
  const grid = SEALED_GRID[layout];
  const capacity = grid.cols * grid.rows;
  const shown = Math.min(count, capacity);
  const extra = count - shown;
  const fade = 1 - seg(t, 0.94, 1);
  const cx = layout === 'wide' ? 320 : 180;
  const trackY = layout === 'wide' ? 318 : 420;
  const trackL = layout === 'wide' ? 150 : 40;
  const trackR = layout === 'wide' ? 490 : 320;
  const third = (trackR - trackL) / 3;
  return (
    <svg viewBox={viewBox(layout)} role="presentation">
      <g style={{ opacity: fade }}>
        {shown === 0 ? (
          <Txt x={cx} y={layout === 'wide' ? 170 : 220} size={14} anchor="middle">
            {tr('hero.launch.empty')}
          </Txt>
        ) : null}
        {Array.from({ length: shown }, (_, i) => {
          const col = i % grid.cols;
          const row = Math.floor(i / grid.cols);
          const drop = springSeg(t, i * 0.012, 0.14 + i * 0.012, 0.55);
          const newest = i === shown - 1 ? seg(t, 0.5, 0.56) * (1 - seg(t, 0.8, 0.86)) : 0;
          return (
            <g key={`s-${i}`} transform={`translate(0 ${lerp(-24, 0, drop).toFixed(1)})`} style={{ opacity: clamp01(drop * 2) }}>
              <EnvelopeGlyph x={grid.x0 + col * grid.dx} y={grid.y0 + row * grid.dy} w={34} h={23} color={newest > 0 || stage >= 1 ? HERO : INK2} fill={newest > 0 ? SOFT : PAPER} open={stage >= 1 ? 1 : 0} />
            </g>
          );
        })}
        {extra > 0 ? (
          <Pill
            x={layout === 'wide' ? 560 : 180}
            y={layout === 'wide' ? grid.y0 + grid.dy : grid.y0 + grid.rows * grid.dy + 4}
            text={`+${extra.toLocaleString('en-US')}`}
            k={seg(t, 0.3, 0.38)}
            size={13}
            font="mono"
          />
        ) : null}
        <Txt x={cx} y={layout === 'wide' ? 268 : 330} size={13} anchor="middle" color={INK2} opacity={seg(t, 0.36, 0.46)}>
          {tr(stage === 0 ? 'hero.launch.sealedNote' : stage === 1 ? 'hero.launch.openingNote' : stage === 2 ? 'hero.launch.resultWaitNote' : 'hero.launch.settledNote', { n: count.toLocaleString('en-US') })}
        </Txt>
        {/* Where we are: commit now, reveal later. */}
        <g style={{ opacity: seg(t, 0.4, 0.5) }}>
          {[tr('hero.launch.phaseCommit'), tr('hero.launch.phaseReveal'), tr('hero.launch.phaseSettle')].map((label, i) => (
            <g key={label}>
              <line x1={trackL + i * third + 3} x2={trackL + (i + 1) * third - 3} y1={trackY} y2={trackY} strokeWidth={3} strokeLinecap="round" style={{ stroke: i <= Math.min(stage, 2) ? HERO : INK3 }} />
              <Txt x={trackL + i * third + 3} y={trackY + 20} size={11} color={i <= Math.min(stage, 2) ? INK : INK2}>
                {label}
              </Txt>
            </g>
          ))}
          <circle cx={stage >= 3 ? trackR : trackL + third * (Math.min(stage, 2) + lerp(0.2, 0.85, seg(t, 0.4, 0.9)))} cy={trackY} r={5} strokeWidth={2} style={{ fill: PAPER, stroke: HERO }} />
        </g>
      </g>
    </svg>
  );
}

function SealedLaunchHero({ count }: { readonly count: number }) {
  const { t } = useI18n();
  return (
    <HeroFrame
      id="launch-sealed"
      module="launch"
      title={t('hero.launch.sealedTitle')}
      durationMs={7000}
      staticAt={0.6}
      note={t('hero.liveData')}
      steps={[
        { at: 0, text: t('hero.launch.s1') },
        { at: 0.45, text: t('hero.launch.sealedWait') },
      ]}
    >
      {(scene) => <SealedLaunchScene {...scene} count={count} />}
    </HeroFrame>
  );
}
