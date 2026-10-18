import { useI18n } from '../i18n/I18nProvider';
import { clamp01, easeOut, lerp, seg, springSeg } from '../motion/easing';
import { HeroFrame } from './HeroFrame';
import { arcAt, arcPath, CheckMark, DrawPath, EnvelopeGlyph, HERO, INK, INK2, INK3, LockGlyph, PAPER, Pill, Reveal, SOFT, Txt, TypeText, type Point } from './svg';
import { viewBox, type SceneProps } from './types';

const ONE_TIME = ['0x7c1e…a94f', '0x2b90…13d6', '0xe45a…7c02', '0x91d3…5be8'];
const TAGS = ['3f', 'a1', '7c', 'd2', '0e'];

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Geometry {
  readonly id: Box;
  readonly meta: Box;
  readonly oneTime: Box;
  readonly log: Box;
  readonly rowGap: number;
  readonly rows: number;
  readonly idSize: number;
  readonly coinFrom: Point;
  readonly coinTo: Point;
  readonly coinLift: number;
  readonly keyLift: number;
  readonly stack: Point;
}

const GEO: Record<SceneProps['layout'], Geometry> = {
  wide: {
    id: { x: 32, y: 36, w: 220, h: 76 },
    meta: { x: 32, y: 128, w: 220, h: 104 },
    oneTime: { x: 388, y: 36, w: 220, h: 76 },
    log: { x: 388, y: 150, w: 220, h: 182 },
    rowGap: 34,
    rows: 4,
    idSize: 32,
    coinFrom: { x: 254, y: 196 },
    coinTo: { x: 386, y: 74 },
    coinLift: 46,
    keyLift: -40,
    stack: { x: 8, y: 8 },
  },
  tall: {
    id: { x: 24, y: 16, w: 312, h: 64 },
    meta: { x: 24, y: 92, w: 312, h: 96 },
    oneTime: { x: 24, y: 210, w: 312, h: 70 },
    log: { x: 24, y: 304, w: 312, h: 160 },
    rowGap: 34,
    rows: 3,
    idSize: 28,
    coinFrom: { x: 300, y: 188 },
    coinTo: { x: 300, y: 210 },
    coinLift: -60,
    keyLift: -70,
    stack: { x: 0, y: 7 },
  },
};

function Card({
  box,
  stroke = INK3,
  fill = PAPER,
  opacity = 1,
  scale = 1,
}: {
  readonly box: Box;
  readonly stroke?: string;
  readonly fill?: string;
  readonly opacity?: number;
  readonly scale?: number;
}) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale.toFixed(3)}) translate(${-cx} ${-cy})`} style={{ opacity }}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={14} strokeWidth={1.4} style={{ stroke, fill }} />
    </g>
  );
}

export function SendScene({ t, cycle, layout, mini = false, live }: SceneProps) {
  const { t: tr } = useI18n();
  const g = GEO[layout];
  const address = ONE_TIME[cycle % ONE_TIME.length] ?? '';
  const fade = 1 - seg(t, 0.95, 1);
  const idIn = springSeg(t, 0, 0.12, 0.6);
  const unfold = seg(t, 0.08, 0.24, easeOut);
  const coin = seg(t, 0.28, 0.44);
  const ephemeral = seg(t, 0.3, 0.35) * (1 - seg(t, 0.46, 0.5));
  const typed = seg(t, 0.42, 0.54, (x) => x);
  const land = springSeg(t, 0.42, 0.56, 0.45);
  const drop = springSeg(t, 0.56, 0.7, 0.55);
  const key = seg(t, 0.72, 0.84);
  const open = seg(t, 0.83, 0.9, easeOut);
  const found = seg(t, 0.86, 0.94);
  const rowY = (i: number): number => g.log.y + 52 + i * g.rowGap;
  const envX = g.log.x + 30;
  const viewRow: Point = { x: g.meta.x + g.meta.w - 22, y: g.meta.y + (layout === 'wide' ? 84 : 76) };
  const pad = 18;

  return (
    <svg viewBox={viewBox(layout)} role="presentation">
      <g style={{ opacity: fade }}>
        {/* Hush ID card. */}
        <Card box={g.id} stroke={INK} opacity={clamp01(idIn * 1.4)} scale={lerp(0.94, 1, idIn)} />
        <g style={{ opacity: clamp01(idIn * 1.4) }}>
          <Txt x={g.id.x + pad} y={g.id.y + g.id.h / 2 + g.idSize * 0.34} size={g.idSize} font="serif" color={INK}>
            {live?.name ?? '@ada'}
          </Txt>
          {mini ? null : (
            <Txt x={g.id.x + g.id.w - pad} y={g.id.y + 24} size={11} anchor="end">
              {tr('hero.send.hushId')}
            </Txt>
          )}
        </g>

        {/* It unfolds into the stealth meta-address. */}
        <DrawPath d={`M${g.id.x + 28} ${g.id.y + g.id.h} V${g.meta.y}`} k={unfold} color={INK3} width={1.25} />
        <Reveal x={g.meta.x - 2} y={g.meta.y - 2} w={g.meta.w + 4} h={g.meta.h + 4} k={unfold} dir="down">
          <rect x={g.meta.x} y={g.meta.y} width={g.meta.w} height={g.meta.h} rx={14} strokeWidth={1.25} style={{ stroke: INK3, fill: PAPER }} />
          {mini ? null : (
            <>
              <Txt x={g.meta.x + pad} y={g.meta.y + 24} size={11}>
                {tr('hero.send.meta')}
              </Txt>
              {[
                [tr('hero.send.spendKey'), '0x02a9…f31c'],
                [tr('hero.send.viewKey'), '0x03c1…8e07'],
              ].map(([label, value], i) => {
                const y = g.meta.y + (layout === 'wide' ? 54 : 50) + i * (layout === 'wide' ? 30 : 28);
                const highlight = i === 1 ? seg(t, 0.7, 0.74) * (1 - seg(t, 0.9, 0.95)) : 0;
                return (
                  <g key={label}>
                    {highlight > 0 ? <rect x={g.meta.x + 8} y={y - 15} width={g.meta.w - 16} height={22} rx={8} style={{ fill: SOFT, opacity: highlight }} /> : null}
                    <Txt x={g.meta.x + pad} y={y} size={11} color={INK2}>
                      {label}
                    </Txt>
                    <Txt x={g.meta.x + g.meta.w - pad} y={y} size={12} font="mono" color={INK} anchor="end">
                      {value}
                    </Txt>
                  </g>
                );
              })}
            </>
          )}
        </Reveal>

        {/* Payment travels to a brand-new one-time address. */}
        <DrawPath d={arcPath(g.coinFrom, g.coinTo, g.coinLift)} k={coin} color={HERO} width={1.25} opacity={0.5 * (1 - seg(t, 0.6, 0.7))} />
        {coin > 0 && coin < 1
          ? (() => {
              const p = arcAt(g.coinFrom, g.coinTo, g.coinLift, coin);
              return <circle cx={p.x} cy={p.y} r={6} strokeWidth={1.5} style={{ fill: SOFT, stroke: HERO }} />;
            })()
          : null}
        {mini
          ? null
          : (() => {
              const mid = arcAt(g.coinFrom, g.coinTo, g.coinLift, 0.5);
              return <Pill x={mid.x + (layout === 'wide' ? 34 : -110)} y={mid.y + (layout === 'wide' ? 10 : 0)} text={tr('hero.send.ephemeral')} k={ephemeral} size={11} fill={PAPER} />;
            })()}

        {/* Earlier one-time addresses sit behind: each used once. */}
        {[2, 1].map((n) => (
          <rect
            key={`stack-${n}`}
            x={g.oneTime.x + g.stack.x * n}
            y={g.oneTime.y + g.stack.y * n}
            width={g.oneTime.w}
            height={g.oneTime.h}
            rx={14}
            strokeWidth={1.25}
            style={{ stroke: INK3, fill: PAPER, opacity: (n === 1 ? 0.9 : 0.6) * seg(t, 0.36, 0.42) }}
          />
        ))}
        <Card box={g.oneTime} stroke={land > 0 ? HERO : INK3} opacity={seg(t, 0.36, 0.42)} scale={lerp(1.04, 1, land)} />
        <g style={{ opacity: seg(t, 0.38, 0.42) }}>
          <Txt x={g.oneTime.x + pad} y={g.oneTime.y + 26} size={11}>
            {tr('hero.send.oneTime')}
          </Txt>
          {mini ? null : (
            <Txt x={g.oneTime.x + g.oneTime.w - pad} y={g.oneTime.y + 26} size={11} anchor="end" color={HERO} opacity={seg(t, 0.5, 0.54)}>
              {tr('hero.send.fresh')}
            </Txt>
          )}
          <TypeText text={address} k={typed} x={g.oneTime.x + pad} y={g.oneTime.y + g.oneTime.h - 20} size={layout === 'wide' ? 16 : 15} font="mono" color={INK} />
        </g>

        {/* Announcement log: a new sealed envelope drops in; only one key opens it. */}
        <g style={{ opacity: seg(t, 0.48, 0.54) }}>
          <rect x={g.log.x} y={g.log.y} width={g.log.w} height={g.log.h} rx={14} strokeWidth={1.25} style={{ stroke: INK3, fill: PAPER }} />
          <Txt x={g.log.x + pad} y={g.log.y + 26} size={11}>
            {tr('hero.send.announce')}
          </Txt>
          <Reveal x={g.log.x} y={g.log.y + 32} w={g.log.w} h={g.log.h - 36} k={1}>
            {Array.from({ length: g.rows }, (_, i) => {
              const y = rowY(i) + drop * g.rowGap;
              return (
                <g key={`row-${i}`} style={{ opacity: i === g.rows - 1 ? 1 - drop : 1 }}>
                  <EnvelopeGlyph x={envX} y={y} w={26} h={17} color={INK3} />
                  <Txt x={envX + 24} y={y + 4} size={11} font="mono" color={INK2}>
                    {`tag ${TAGS[(i + cycle) % TAGS.length] ?? '00'}`}
                  </Txt>
                  <LockGlyph x={g.log.x + g.log.w - 24} y={y} size={0.85} color={INK3} />
                </g>
              );
            })}
            {(() => {
              const y = lerp(rowY(0) - 44, rowY(0), drop);
              const row = (
                <g style={{ opacity: clamp01(drop * 2) }}>
                  {found > 0 ? <rect x={g.log.x + 8} y={y - 14} width={g.log.w - 16} height={28} rx={9} style={{ fill: SOFT, opacity: found }} /> : null}
                  <EnvelopeGlyph x={envX} y={y} w={26} h={17} color={HERO} open={open} />
                  {found > 0.01 ? (
                    <Txt x={envX + 24} y={y + 4} size={12} font="mono" color={INK} opacity={found}>
                      {live?.amount ?? '0.5 BNB'} · {live?.name ?? '@ada'}
                    </Txt>
                  ) : (
                    <Txt x={envX + 24} y={y + 4} size={11} font="mono" color={INK2}>
                      {`tag ${TAGS[(cycle + 4) % TAGS.length] ?? '00'}`}
                    </Txt>
                  )}
                  {found > 0 ? <CheckMark x={g.log.x + g.log.w - 24} y={y} r={8} k={found} color={HERO} /> : <LockGlyph x={g.log.x + g.log.w - 24} y={y} size={0.85} color={HERO} />}
                </g>
              );
              return row;
            })()}
          </Reveal>
        </g>

        {/* The recipient's view key travels to the envelope. */}
        {key > 0 && key < 1
          ? (() => {
              const to = { x: envX + 2, y: rowY(0) };
              const p = arcAt(viewRow, to, g.keyLift, key);
              return (
                <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${lerp(-20, 0, key).toFixed(1)})`}>
                  <circle cx={-7} r={5.5} strokeWidth={1.6} style={{ fill: PAPER, stroke: HERO }} />
                  <path d="M-1.5 0 H10 M6.5 0 V4" fill="none" strokeWidth={1.6} strokeLinecap="round" style={{ stroke: HERO }} />
                </g>
              );
            })()
          : null}
        {mini ? null : <DrawPath d={arcPath(viewRow, { x: envX + 2, y: rowY(0) }, g.keyLift)} k={key} color={HERO} width={1} opacity={0.35 * (1 - seg(t, 0.9, 0.95))} dash="2 5" />}
      </g>
    </svg>
  );
}

/** A Hush ID resolves to a meta-address; each payment lands on a new one-time address. */
export function SendHero() {
  const { t } = useI18n();
  return (
    <HeroFrame
      id="send"
      module="send"
      title={t('hero.send.title')}
      durationMs={9500}
      staticAt={0.93}
      steps={[
        { at: 0, text: t('hero.send.s1') },
        { at: 0.27, text: t('hero.send.s2') },
        { at: 0.54, text: t('hero.send.s3') },
        { at: 0.72, text: t('hero.send.s4') },
      ]}
    >
      {(scene) => <SendScene {...scene} />}
    </HeroFrame>
  );
}
