import { useI18n } from '../i18n/I18nProvider';
import { clamp01, easeOut, lerp, seg, springSeg } from '../motion/easing';
import { HeroFrame } from './HeroFrame';
import { arcAt, CheckMark, HERO, INK, INK2, INK3, OK, PAPER, Pill, SOFT, Txt, type Point } from './svg';
import { viewBox, type SceneProps } from './types';

const SHARES = [60, 20, 80, 40] as const;
const LINKS = ['k3Xa', 'Pq7m', 'z2Rt', 'Lw9c'];
const CLAIMED = new Set([0, 2]);

interface Geometry {
  readonly packet: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly mouth: Point;
  readonly chip: { readonly x: number; readonly w: number; readonly h: number; readonly ys: readonly number[] };
  readonly dockX: number;
  readonly vault: Point;
  readonly expiry: Point;
  readonly lift: number;
}

const GEO: Record<SceneProps['layout'], Geometry> = {
  wide: {
    packet: { x: 56, y: 62, w: 156, h: 214 },
    mouth: { x: 134, y: 92 },
    chip: { x: 384, w: 224, h: 48, ys: [64, 138, 212, 286] },
    dockX: 330,
    vault: { x: 134, y: 170 },
    expiry: { x: 134, y: 298 },
    lift: 40,
  },
  tall: {
    packet: { x: 106, y: 14, w: 148, h: 176 },
    mouth: { x: 180, y: 40 },
    chip: { x: 104, w: 232, h: 44, ys: [246, 304, 362, 420] },
    dockX: 56,
    vault: { x: 180, y: 102 },
    expiry: { x: 180, y: 192 },
    lift: 70,
  },
};

export function GiftScene({ t, layout, mini = false }: SceneProps) {
  const { t: tr } = useI18n();
  const g = GEO[layout];
  const { packet } = g;
  const cx = packet.x + packet.w / 2;
  const fade = 1 - seg(t, 0.95, 1);
  const enter = springSeg(t, 0, 0.12, 0.55);
  const open = seg(t, 0.1, 0.2, easeOut);
  const leave = (i: number): number => seg(t, 0.22 + i * 0.05, 0.42 + i * 0.05, easeOut);
  const departed = SHARES.reduce((sum, amount, i) => sum + (leave(i) > 0.05 ? amount : 0), 0);
  const packetOut = seg(t, 0.6, 0.68);
  const vaultIn = springSeg(t, 0.64, 0.76, 0.6);
  const expired = seg(t, 0.66, 0.7);
  const back = (i: number, order: number): number => (CLAIMED.has(i) ? 0 : seg(t, 0.7 + order * 0.05, 0.86 + order * 0.04, easeOut));
  const returned = SHARES.reduce((sum, amount, i) => sum + (!CLAIMED.has(i) && back(i, i === 1 ? 0 : 1) >= 0.98 ? amount : 0), 0);
  const flapTip = lerp(packet.y + 66, packet.y - 34, open);
  const chipY = (i: number): number => g.chip.ys[i] ?? 0;

  return (
    <svg viewBox={viewBox(layout)} role="presentation">
      <g style={{ opacity: fade }}>
        {/* The red packet: springs in, the flap lifts, the total counts down as shares leave. */}
        <g
          transform={`translate(${cx} ${packet.y + packet.h / 2}) scale(${(lerp(0.92, 1, enter) * lerp(1, 0.86, packetOut)).toFixed(3)}) translate(${-cx} ${-(packet.y + packet.h / 2)})`}
          style={{ opacity: clamp01(enter * 1.5) * (1 - packetOut) }}
        >
          <rect x={packet.x} y={packet.y} width={packet.w} height={packet.h} rx={18} strokeWidth={1.5} style={{ fill: SOFT, stroke: HERO }} />
          <path d={`M${packet.x + 1} ${packet.y + 18} Q${cx} ${flapTip.toFixed(1)} ${packet.x + packet.w - 1} ${packet.y + 18}`} fill="none" strokeWidth={1.5} style={{ stroke: HERO }} />
          <g transform={`translate(${cx} ${packet.y + 58}) scale(${lerp(1, 0.6, open).toFixed(3)})`} style={{ opacity: 1 - open }}>
            <circle r={15} strokeWidth={1.5} style={{ fill: PAPER, stroke: HERO }} />
            <path d="M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5" strokeWidth={1.5} strokeLinecap="round" style={{ stroke: HERO }} />
          </g>
          <Txt x={cx} y={packet.y + packet.h - 52} size={layout === 'wide' ? 38 : 34} anchor="middle" font="serif" color={INK}>
            {String(200 - departed)}
          </Txt>
          <Txt x={cx} y={packet.y + packet.h - 28} size={12} anchor="middle" color={INK2}>
            USDT
          </Txt>
        </g>

        {/* After expiry the packet's place is taken by the sender's vault. */}
        <g transform={`translate(${g.vault.x} ${g.vault.y}) scale(${lerp(0.8, 1, vaultIn).toFixed(3)})`} style={{ opacity: clamp01(vaultIn * 1.4) }}>
          <circle r={46} strokeWidth={1.5} style={{ fill: PAPER, stroke: INK }} />
          <circle r={34} fill="none" strokeWidth={1} strokeDasharray="2 6" style={{ stroke: INK3 }} />
          <Txt x={0} y={6} size={20} anchor="middle" font="serif" color={INK} opacity={seg(t, 0.82, 0.9)}>
            {`+${returned}`}
          </Txt>
          {mini ? null : (
            <Txt x={0} y={66} size={12} anchor="middle" color={INK2}>
              {tr('hero.gift.back')}
            </Txt>
          )}
        </g>

        {/* Link chips. */}
        {LINKS.map((link, i) => {
          const y = chipY(i);
          const appear = springSeg(t, 0.16 + i * 0.03, 0.3 + i * 0.03, 0.6);
          const claimed = CLAIMED.has(i) ? seg(t, 0.56 + (i === 2 ? 0.04 : 0), 0.64 + (i === 2 ? 0.04 : 0)) : 0;
          const dim = CLAIMED.has(i) ? 1 : 1 - 0.5 * expired;
          const left = g.chip.x;
          return (
            <g key={link} transform={`translate(${lerp(14, 0, appear).toFixed(1)} 0)`} style={{ opacity: clamp01(appear * 1.4) * dim }}>
              <rect x={left} y={y - g.chip.h / 2} width={g.chip.w} height={g.chip.h} rx={12} strokeWidth={1.25} style={{ fill: claimed > 0 ? SOFT : PAPER, stroke: claimed > 0 ? HERO : INK3 }} />
              <g transform={`translate(${left + 22} ${y})`}>
                <path
                  d="M-2 2.5 a3.6 3.6 0 0 0 5.1 0 l2.6-2.6 a3.6 3.6 0 0 0-5.1-5.1 l-.9.9 M2 -2.5 a3.6 3.6 0 0 0-5.1 0 l-2.6 2.6 a3.6 3.6 0 0 0 5.1 5.1 l.9-.9"
                  fill="none"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  style={{ stroke: INK2 }}
                />
              </g>
              <Txt x={left + 40} y={y + 4.5} size={12.5} font="mono" color={INK} opacity={1 - claimed * 0.6}>
                {`…/gift#${link}`}
              </Txt>
              {CLAIMED.has(i) ? (
                <>
                  <CheckMark x={left + g.chip.w - 22} y={y} r={9} k={claimed} color={OK} />
                  {mini ? null : (
                    <Txt x={left + g.chip.w - 38} y={y + 4} size={11} anchor="end" color={INK} opacity={claimed}>
                      {tr('hero.gift.claimed')}
                    </Txt>
                  )}
                </>
              ) : mini ? null : (
                <Txt x={left + g.chip.w - 16} y={y + 4} size={11} anchor="end" color={INK2} opacity={expired}>
                  {tr('hero.gift.expired')}
                </Txt>
              )}
            </g>
          );
        })}

        {/* Shares: rise out of the packet, dock at a link, then get claimed or come home. */}
        {SHARES.map((amount, i) => {
          const fly = leave(i);
          if (fly <= 0) return null;
          const dock: Point = { x: g.dockX, y: chipY(i) };
          const lift = layout === 'wide' ? g.lift * (1 - i * 0.5) : -g.lift;
          let p = arcAt(g.mouth, dock, lift, fly);
          let scale = fly < 1 ? lerp(0.8, 1.06, Math.sin(fly * Math.PI)) : 1;
          let opacity = clamp01(fly * 4);
          if (CLAIMED.has(i)) {
            const into = seg(t, 0.52 + (i === 2 ? 0.04 : 0), 0.6 + (i === 2 ? 0.04 : 0), easeOut);
            p = { x: lerp(dock.x, g.chip.x + g.chip.w - 22, into), y: dock.y };
            scale = lerp(1, 0.5, into);
            opacity *= 1 - into;
          } else {
            const order = i === 1 ? 0 : 1;
            const k = back(i, order);
            if (k > 0) {
              p = arcAt(dock, g.vault, layout === 'wide' ? 60 + order * 30 : 80 + order * 40, k);
              scale = lerp(1, 0.55, k);
              opacity *= 1 - seg(k, 0.85, 1);
            }
          }
          if (opacity <= 0) return null;
          return (
            <g key={`share-${amount}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${scale.toFixed(3)})`} style={{ opacity }}>
              <rect x={-32} y={-17} width={64} height={34} rx={10} strokeWidth={1.4} style={{ fill: PAPER, stroke: HERO }} />
              <Txt x={0} y={5} size={14} anchor="middle" font="mono" color={INK}>
                {String(amount)}
              </Txt>
            </g>
          );
        })}

        {mini ? null : <Pill x={g.expiry.x} y={g.expiry.y} text={tr('hero.gift.after')} k={expired * (1 - seg(t, 0.9, 0.94))} size={11} icon="clock" iconColor={INK2} />}
      </g>
    </svg>
  );
}

/** A red packet splits into unit cards sent to links; unclaimed shares return after expiry. */
export function GiftHero() {
  const { t } = useI18n();
  return (
    <HeroFrame
      id="gift"
      module="give"
      title={t('hero.gift.title')}
      durationMs={10000}
      staticAt={0.9}
      steps={[
        { at: 0, text: t('hero.gift.s1') },
        { at: 0.2, text: t('hero.gift.s2') },
        { at: 0.5, text: t('hero.gift.s3') },
        { at: 0.66, text: t('hero.gift.s4') },
      ]}
    >
      {(scene) => <GiftScene {...scene} />}
    </HeroFrame>
  );
}
