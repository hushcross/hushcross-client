import { useI18n } from '../i18n/I18nProvider';
import { clamp01, easeOut, lerp, seg, springSeg } from '../motion/easing';
import { HeroFrame } from './HeroFrame';
import { arcAt, CrossMark, DrawPath, HERO, INK, INK2, INK3, PAPER, Pill, SOFT, Txt, WalletChip, type Point } from './svg';
import { viewBox, type SceneProps } from './types';

const WALLETS = ['0x3f…a1c2', '0x9c…07be', '0x51…e4d9'];
const EXIT_ADDRESS = '0x7d…2b40';
/** Units already in the pool before this story starts (the crowd). */
const CROWD = 5;
const ORBIT_SPEED = 0.32;

interface Geometry {
  readonly wallets: readonly Point[];
  readonly vault: Point;
  readonly r: number;
  readonly orbit: number;
  readonly exit: Point;
  readonly exitLabel: Point;
  readonly proof: Point;
  readonly verdict: Point;
  readonly walletW: number;
  readonly entryLift: number;
}

const GEO: Record<SceneProps['layout'], Geometry> = {
  wide: {
    wallets: [
      { x: 84, y: 96 },
      { x: 84, y: 180 },
      { x: 84, y: 264 },
    ],
    vault: { x: 330, y: 180 },
    r: 92,
    orbit: 60,
    exit: { x: 552, y: 180 },
    exitLabel: { x: 552, y: 146 },
    proof: { x: 452, y: 218 },
    verdict: { x: 330, y: 330 },
    walletW: 128,
    entryLift: 30,
  },
  tall: {
    wallets: [
      { x: 68, y: 48 },
      { x: 180, y: 48 },
      { x: 292, y: 48 },
    ],
    vault: { x: 180, y: 220 },
    r: 86,
    orbit: 56,
    exit: { x: 180, y: 404 },
    exitLabel: { x: 290, y: 408 },
    proof: { x: 196, y: 338 },
    verdict: { x: 180, y: 452 },
    walletW: 104,
    entryLift: -18,
  },
};

/** Distinct "fingerprints" for coins from different wallets. */
function CoinMark({ kind, opacity }: { readonly kind: number; readonly opacity: number }) {
  if (opacity <= 0) return null;
  if (kind === 0) return <circle r={2.4} style={{ fill: INK2, opacity }} />;
  if (kind === 1) return <path d="M-5 0 H5" strokeWidth={1.5} strokeLinecap="round" style={{ stroke: INK2, opacity }} />;
  return <circle r={4.5} fill="none" strokeWidth={1.3} style={{ stroke: INK2, opacity }} />;
}

/**
 * A unit token that morphs from a coin (circle) into an identical vault unit
 * (rounded square) with `m` 0 → 1.
 */
function Token({ p, m, scale = 1, kind, opacity = 1 }: { readonly p: Point; readonly m: number; readonly scale?: number; readonly kind: number; readonly opacity?: number }) {
  const size = lerp(26, 20, m);
  const rx = lerp(size / 2, 5, m);
  return (
    <g transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${scale.toFixed(3)})`} style={{ opacity }}>
      <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={rx} strokeWidth={1.5} style={{ fill: m > 0.5 ? SOFT : PAPER, stroke: m > 0.5 ? HERO : INK2 }} />
      <CoinMark kind={kind} opacity={1 - clamp01(m * 2)} />
      {m > 0.5 ? <rect x={-3} y={-3} width={6} height={6} rx={1.5} style={{ fill: HERO, opacity: clamp01((m - 0.5) * 2) }} /> : null}
    </g>
  );
}

export function VaultScene({ t, layout, mini = false, live }: SceneProps) {
  const { t: tr } = useI18n();
  const g = GEO[layout];
  const fade = 1 - seg(t, 0.95, 1);
  const enter = springSeg(t, 0, 0.12, 0.7);
  const spin = t * Math.PI * 2 * ORBIT_SPEED;
  const exitK = seg(t, 0.56, 0.72);
  const exitIndex = CROWD + 1;
  const unify = seg(t, 0.32, 0.44);
  const traceK = (i: number): number => seg(t, 0.78 + i * 0.025, 0.86 + i * 0.025);
  const crossK = seg(t, 0.86, 0.93);
  const total = (live?.poolCount ?? 1840) + WALLETS.reduce((n, _, i) => n + (seg(t, 0.18 + i * 0.06, 0.2 + i * 0.06) >= 1 ? 1 : 0), 0) - (exitK >= 1 ? 1 : 0);
  const orbitAt = (slot: number, count: number): Point => {
    const a = spin + (slot / count) * Math.PI * 2 - Math.PI / 2;
    return { x: g.vault.x + Math.cos(a) * g.orbit, y: g.vault.y + Math.sin(a) * g.orbit };
  };
  const slots = CROWD + WALLETS.length;

  return (
    <svg viewBox={viewBox(layout)} role="presentation">
      <g style={{ opacity: fade }}>
        {/* Vault body: ring with a slowly turning inner track. */}
        <g transform={`translate(${g.vault.x} ${g.vault.y}) scale(${lerp(0.94, 1, enter).toFixed(3)})`} style={{ opacity: clamp01(enter * 1.4) }}>
          <circle r={g.r} strokeWidth={1.5} style={{ fill: PAPER, stroke: INK }} />
          <g transform={`rotate(${((t * 360 * ORBIT_SPEED) % 360).toFixed(2)})`}>
            <circle r={g.orbit + 18} fill="none" strokeWidth={1} strokeDasharray="2 7" strokeLinecap="round" style={{ stroke: INK3 }} />
          </g>
          {mini ? null : (
            <>
              <Txt x={0} y={4} size={layout === 'tall' ? 24 : 26} anchor="middle" font="serif" color={INK}>
                {total.toLocaleString('en-US')}
              </Txt>
              <Txt x={0} y={22} size={11} anchor="middle">
                {tr('hero.vault.deposits')}
              </Txt>
            </>
          )}
        </g>

        {/* The crowd already in the pool. */}
        {Array.from({ length: CROWD }, (_, i) => (
          <Token key={`crowd-${i}`} p={orbitAt(i, slots)} m={1} kind={0} scale={0.82} opacity={0.55 * clamp01(enter * 1.4)} />
        ))}

        {/* Wallets and their coins. */}
        {WALLETS.map((label, i) => {
          const w = g.wallets[i] ?? g.wallets[0] ?? { x: 0, y: 0 };
          const appear = springSeg(t, 0.02 + i * 0.04, 0.16 + i * 0.04);
          const dim = 1 - 0.45 * seg(t, 0.3, 0.4);
          return (
            <g key={label}>
              <WalletChip x={w.x} y={w.y} label={mini ? '' : label} w={g.walletW} opacity={clamp01(appear * 1.3) * dim} scale={lerp(0.92, 1, appear)} />
            </g>
          );
        })}
        {WALLETS.map((label, i) => {
          const w = g.wallets[i] ?? { x: 0, y: 0 };
          const from = layout === 'wide' ? { x: w.x + g.walletW / 2 + 14, y: w.y } : { x: w.x, y: w.y + 30 };
          const slot = CROWD + i;
          const fly = seg(t, 0.08 + i * 0.06, 0.22 + i * 0.06, easeOut);
          const land = springSeg(t, 0.2 + i * 0.06, 0.34 + i * 0.06, 0.5);
          const target = orbitAt(slot, slots);
          let p = arcAt(from, target, g.entryLift * (i - 1), fly);
          let m = Math.max(unify, 0);
          let opacity = seg(t, 0.06 + i * 0.06, 0.1 + i * 0.06);
          let scale = fly < 1 ? lerp(0.9, 1, fly) : lerp(1.18, 1, land);
          if (slot === exitIndex && exitK > 0) {
            const proofPoint = g.proof;
            const out = exitK < 0.5 ? arcAt(target, proofPoint, 10, exitK * 2) : arcAt(proofPoint, { x: g.exit.x, y: g.exit.y }, 10, (exitK - 0.5) * 2);
            p = out;
            m = 1 - seg(t, 0.66, 0.72);
            scale = 1;
            opacity = 1 - seg(t, 0.71, 0.74);
          }
          return <Token key={`coin-${label}`} p={p} m={m} kind={i} opacity={opacity} scale={scale} />;
        })}

        {/* Proof stamp on the way out. */}
        {mini ? null : (
          <Pill
            x={g.proof.x + (layout === 'wide' ? 0 : 76)}
            y={g.proof.y + (layout === 'wide' ? 26 : 0)}
            text={tr('hero.vault.proof')}
            k={seg(t, 0.6, 0.64) * (1 - seg(t, 0.9, 0.95))}
            icon="check"
            size={11}
            scale={lerp(0.92, 1, springSeg(t, 0.6, 0.7))}
          />
        )}

        {/* Fresh address receives the withdrawal. */}
        {(() => {
          const k = springSeg(t, 0.68, 0.8, 0.55);
          return (
            <g style={{ opacity: clamp01(k * 1.5) }}>
              <WalletChip x={g.exit.x} y={g.exit.y} label={mini ? '' : EXIT_ADDRESS} w={g.walletW} scale={lerp(0.9, 1, k)} color={HERO} />
              {mini ? null : (
                <Txt x={g.exitLabel.x} y={g.exitLabel.y} size={11} anchor="middle" color={INK2}>
                  {tr('hero.vault.out')}
                </Txt>
              )}
            </g>
          );
        })()}

        {/* Try to trace the withdrawal back: the trail reaches the pool, then every path dead-ends. */}
        {(() => {
          const toward = (p: Point, extra = 0): Point => {
            const a = Math.atan2(p.y - g.vault.y, p.x - g.vault.x);
            return { x: g.vault.x + Math.cos(a) * (g.r + 6 + extra), y: g.vault.y + Math.sin(a) * (g.r + 6 + extra) };
          };
          const exitEdge = layout === 'wide' ? { x: g.exit.x - g.walletW / 2 - 6, y: g.exit.y } : { x: g.exit.x, y: g.exit.y - 24 };
          const back = seg(t, 0.74, 0.79);
          return (
            <g style={{ opacity: 1 - seg(t, 0.92, 0.95) * 0.4 }}>
              <DrawPath d={`M${exitEdge.x} ${exitEdge.y} L${toward(exitEdge).x.toFixed(1)} ${toward(exitEdge).y.toFixed(1)}`} k={back} color={INK2} width={1.25} dash="3 5" />
              {WALLETS.map((label, i) => {
                const w = g.wallets[i] ?? { x: 0, y: 0 };
                const to = layout === 'wide' ? { x: w.x + g.walletW / 2 + 8, y: w.y } : { x: w.x, y: w.y + 24 };
                const from = toward(to);
                const k = traceK(i);
                const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                return (
                  <g key={`trace-${label}`}>
                    <DrawPath d={`M${from.x.toFixed(1)} ${from.y.toFixed(1)} L${to.x.toFixed(1)} ${to.y.toFixed(1)}`} k={k} color={INK3} width={1.25} dash="3 5" />
                    <g style={{ opacity: k }}>
                      <circle cx={mid.x} cy={mid.y} r={10} strokeWidth={1.25} style={{ fill: PAPER, stroke: INK3 }} />
                    </g>
                    <CrossMark x={mid.x} y={mid.y} k={seg(crossK, i * 0.2, 0.6 + i * 0.2)} size={3.5} color={INK2} />
                  </g>
                );
              })}
            </g>
          );
        })()}
        {mini ? null : (
          <Pill x={g.verdict.x} y={g.verdict.y} text={tr('hero.vault.noLink')} k={seg(t, 0.88, 0.92)} icon="cross" iconColor={INK2} size={12} scale={lerp(0.94, 1, springSeg(t, 0.88, 0.96))} />
        )}
        {mini || layout === 'tall' ? null : (
          <Txt x={84} y={318} size={11} anchor="middle" opacity={1 - seg(t, 0.86, 0.9)}>
            {tr('hero.vault.in')}
          </Txt>
        )}
      </g>
    </svg>
  );
}

/** Coins from different wallets become identical units; the exit can't be traced back. */
export function VaultHero() {
  const { t } = useI18n();
  return (
    <HeroFrame
      id="vault"
      module="vault"
      title={t('hero.vault.title')}
      durationMs={10000}
      staticAt={0.9}
      steps={[
        { at: 0, text: t('hero.vault.s1') },
        { at: 0.3, text: t('hero.vault.s2') },
        { at: 0.54, text: t('hero.vault.s3') },
        { at: 0.75, text: t('hero.vault.s4') },
      ]}
    >
      {(scene) => <VaultScene {...scene} />}
    </HeroFrame>
  );
}
