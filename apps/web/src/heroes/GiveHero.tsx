import { useI18n } from '../i18n/I18nProvider';
import { clamp01, easeOut, lerp, seg, springSeg } from '../motion/easing';
import { HeroFrame } from './HeroFrame';
import { arcAt, CheckMark, HERO, INK, INK2, INK3, OK, PAPER, Pill, SOFT, Txt, type Point } from './svg';
import { viewBox, type SceneProps } from './types';

interface Geometry {
  readonly vaults: readonly Point[];
  readonly ring: Point;
  readonly r: number;
  readonly recipient: Point;
  readonly ledger: Point;
  readonly verdict: Point;
}

const GEO: Record<SceneProps['layout'], Geometry> = {
  wide: {
    vaults: [
      { x: 74, y: 104 },
      { x: 74, y: 184 },
      { x: 74, y: 264 },
    ],
    ring: { x: 318, y: 184 },
    r: 78,
    recipient: { x: 560, y: 184 },
    ledger: { x: 318, y: 36 },
    verdict: { x: 318, y: 316 },
  },
  tall: {
    vaults: [
      { x: 70, y: 96 },
      { x: 180, y: 96 },
      { x: 290, y: 96 },
    ],
    ring: { x: 180, y: 254 },
    r: 70,
    recipient: { x: 180, y: 418 },
    ledger: { x: 180, y: 34 },
    verdict: { x: 180, y: 360 },
  },
};

const GOAL = 12_000;
/** Act 1: five donations close the goal. Act 2: three donations, then the deadline passes. */
const ACT1 = [0, 1, 2, 0, 1];
const ACT2 = [2, 0, 1];
const STEP1 = 1 / ACT1.length;
const STEP2 = 0.2;

function VaultGlyph({ p, highlight = 0, k = 1 }: { readonly p: Point; readonly highlight?: number; readonly k?: number }) {
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${lerp(0.9, 1, k).toFixed(3)})`} style={{ opacity: clamp01(k * 1.4) }}>
      <circle r={21} strokeWidth={1.4} style={{ fill: highlight > 0 ? SOFT : PAPER, stroke: INK }} />
      <rect x={-6} y={-6} width={12} height={12} rx={3} strokeWidth={1.4} style={{ fill: 'none', stroke: INK }} />
    </g>
  );
}

/** One real campaign drawn into the scene (plain numbers in whole units). Omit for the two-act demo. */
export interface GiveLive {
  readonly title: string;
  readonly asset: string;
  readonly raised: number;
  /** null for tips (every donation goes straight to the recipient). */
  readonly goal: number | null;
  readonly donations: number;
  readonly outcome: 'open' | 'reached' | 'missed';
}

const fmtUnits = (n: number): string => (n >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 100) / 100));

export function GiveScene({ t, layout, mini = false, campaign }: SceneProps & { readonly campaign?: GiveLive }) {
  const { t: tr } = useI18n();
  const g = GEO[layout];
  const live = campaign ?? null;
  const act1 = live ? live.outcome !== 'missed' : t < 0.5;
  const local = live ? t : act1 ? t / 0.5 : (t - 0.5) / 0.5;
  const fade = seg(local, 0, 0.04) * (1 - seg(local, 0.94, 1));
  const circ = 2 * Math.PI * g.r;
  const plan = act1 ? ACT1 : ACT2;
  const target = live ? (live.goal === null || live.goal <= 0 ? 1 : Math.min(1, live.raised / live.goal)) : null;
  const step = target !== null ? target / plan.length : act1 ? STEP1 : STEP2;
  const pays = act1 && (!live || live.outcome === 'reached' || live.goal === null);
  const start = (j: number): number => 0.06 + j * 0.1;
  const arrive = (j: number): number => start(j) + 0.12;
  const filled = plan.reduce((sum, _, j) => sum + step * springSeg(local, arrive(j), arrive(j) + 0.12, 0.55), 0);
  const drain = act1 ? 0 : seg(local, 0.6, 0.88, easeOut);
  const fill = clamp01(filled) * (1 - drain);
  const reached = pays ? seg(local, 0.68, 0.76) : 0;
  const payout = pays ? seg(local, 0.74, 0.92, easeOut) : 0;
  const missed = act1 ? 0 : seg(local, 0.5, 0.56);
  const count = plan.reduce((n, _, j) => n + (local >= arrive(j) ? 1 : 0), 0);
  const raised = Math.round(fill * GOAL);
  const ledger = live
    ? `${fmtUnits(live.raised)}${live.goal === null ? '' : ` / ${fmtUnits(live.goal)}`} ${live.asset} · ${live.donations} ${tr('hero.give.donations')}`
    : `${raised.toLocaleString('en-US')} / ${GOAL.toLocaleString('en-US')} USDT · ${count} ${tr('hero.give.donations')}`;
  const entry = (vault: Point): Point => {
    const a = Math.atan2(vault.y - g.ring.y, vault.x - g.ring.x);
    return { x: g.ring.x + Math.cos(a) * (g.r + 2), y: g.ring.y + Math.sin(a) * (g.r + 2) };
  };

  return (
    <svg viewBox={viewBox(layout)} role="presentation">
      {/* Furniture (vaults, ring track, recipient) stays put between acts; only the story fades. */}
      <g>
        {/* Public ledger: totals and counts are visible, donors are not. */}
        {mini ? null : (
          <g style={{ opacity: fade }}>
            <Txt x={g.ledger.x} y={g.ledger.y} size={12.5} anchor="middle" font="mono" color={INK}>
              {ledger}
            </Txt>
            <Txt x={g.ledger.x} y={g.ledger.y + 18} size={11} anchor="middle">
              {live ? (live.title.length > 48 ? `${live.title.slice(0, 47)}…` : live.title) : act1 ? tr('hero.give.campaignA') : tr('hero.give.campaignB')}
            </Txt>
          </g>
        )}

        {g.vaults.map((p, i) => {
          const refunded = act1 ? 0 : seg(local, 0.7 + i * 0.05, 0.8 + i * 0.05);
          return (
            <g key={`vault-${i}`}>
              <VaultGlyph p={p} highlight={refunded} k={act1 ? springSeg(local, i * 0.02, 0.1 + i * 0.02, 0.6) : 1} />
              {refunded > 0 ? <g style={{ opacity: fade }}><CheckMark x={p.x + (layout === 'wide' ? 34 : 28)} y={p.y + (layout === 'wide' ? 0 : -20)} r={7} k={refunded} color={OK} /></g> : null}
            </g>
          );
        })}
        {mini || layout === 'tall' ? null : (
          <Txt x={74} y={316} size={11} anchor="middle">
            {tr('hero.give.vaults')}
          </Txt>
        )}

        {/* Progress ring. */}
        <circle cx={g.ring.x} cy={g.ring.y} r={g.r} fill="none" strokeWidth={8} style={{ stroke: INK3 }} />
        {fill > 0.004 ? (
          <circle
            opacity={fade}
            cx={g.ring.x}
            cy={g.ring.y}
            r={g.r}
            fill="none"
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - Math.min(fill, 0.9999))}
            transform={`rotate(-90 ${g.ring.x} ${g.ring.y})`}
            style={{ stroke: missed > 0 ? `color-mix(in srgb, var(--hero) ${Math.round(100 - missed * 45)}%, var(--muted))` : HERO }}
          />
        ) : null}
        <g style={{ opacity: (1 - reached) * Math.max(fade, act1 ? 0 : 1) }}>
          <Txt x={g.ring.x} y={g.ring.y + 8} size={layout === 'wide' ? 32 : 28} anchor="middle" font="serif" color={INK}>
            {`${Math.round(fill * 100)}%`}
          </Txt>
          {mini ? null : (
            <Txt x={g.ring.x} y={g.ring.y + 28} size={11} anchor="middle">
              {tr('hero.give.ofGoal')}
            </Txt>
          )}
        </g>
        <g style={{ opacity: fade }}>
          <CheckMark x={g.ring.x} y={g.ring.y} r={22} k={reached} color={HERO} />
        </g>

        {/* Donations travel in from vaults; on a miss each one goes back along its own arc. */}
        {plan.map((vaultIndex, j) => {
          const vault = g.vaults[vaultIndex] ?? g.vaults[0] ?? { x: 0, y: 0 };
          const from = { x: vault.x + (layout === 'wide' ? 24 : 0), y: vault.y + (layout === 'wide' ? 0 : 24) };
          const to = entry(vault);
          const k = seg(local, start(j), arrive(j), easeOut);
          const lift = (j % 2 === 0 ? 1 : -1) * 26;
          if (!act1) {
            const r = seg(local, 0.6 + j * 0.05, 0.76 + j * 0.05, easeOut);
            if (r > 0) {
              if (r >= 1) return null;
              const p = arcAt(to, from, -lift * 2.2, r);
              return <rect key={`d-${j}`} x={p.x - 6} y={p.y - 6} width={12} height={12} rx={3.5} strokeWidth={1.5} style={{ fill: SOFT, stroke: HERO }} />;
            }
          }
          if (k <= 0 || k >= 1) return null;
          const p = arcAt(from, to, lift, k);
          return <rect key={`d-${j}`} x={p.x - 6} y={p.y - 6} width={12} height={12} rx={3.5} strokeWidth={1.5} style={{ fill: SOFT, stroke: HERO, opacity: Math.min(1, k * 5) }} />;
        })}

        {/* Recipient: paid on success. */}
        <g transform={`translate(${g.recipient.x} ${g.recipient.y})`}>
          <circle r={26} strokeWidth={1.4} style={{ fill: payout >= 1 ? SOFT : PAPER, stroke: INK }} />
          <circle cy={-6} r={6} fill="none" strokeWidth={1.4} style={{ stroke: INK }} />
          <path d="M-10.5 12 Q0 1 10.5 12" fill="none" strokeWidth={1.4} style={{ stroke: INK }} />
          {mini ? null : (
            <Txt x={layout === 'wide' ? 0 : 40} y={layout === 'wide' ? 46 : 4} size={11} anchor={layout === 'wide' ? 'middle' : 'start'} color={INK2}>
              {tr('hero.give.recipient')}
            </Txt>
          )}
        </g>
        {[0, 1, 2].map((i) => {
          const k = seg(payout, i * 0.15, 0.6 + i * 0.15);
          if (k <= 0 || k >= 1) return null;
          const from = layout === 'wide' ? { x: g.ring.x + g.r + 6, y: g.ring.y } : { x: g.ring.x, y: g.ring.y + g.r + 6 };
          const to = layout === 'wide' ? { x: g.recipient.x - 30, y: g.recipient.y } : { x: g.recipient.x, y: g.recipient.y - 30 };
          const p = arcAt(from, to, (i - 1) * 18, k);
          return <circle key={`pay-${i}`} cx={p.x} cy={p.y} r={5} style={{ fill: HERO, opacity: Math.sin(k * Math.PI) * 1.2 }} />;
        })}

        {mini ? null : (
          <Pill
            x={g.verdict.x}
            y={g.verdict.y}
            text={act1 ? tr('hero.give.reached') : tr('hero.give.missed')}
            k={(act1 ? reached : missed) * fade * (live && live.goal === null ? 0 : 1)}
            icon={act1 ? 'check' : 'cross'}
            iconColor={act1 ? OK : INK2}
            size={12}
            scale={lerp(0.92, 1, act1 ? reached : missed)}
          />
        )}
      </g>
    </svg>
  );
}

/** Goal ring fills; met → funds go to the recipient; missed → each donor is refunded privately. */
export function GiveHero({ campaign }: { readonly campaign?: GiveLive } = {}) {
  const { t } = useI18n();
  return (
    <HeroFrame
      id="give"
      module="give"
      title={t('hero.give.title')}
      durationMs={12000}
      staticAt={campaign ? 0.86 : 0.4}
      note={campaign ? t('giveLive.heroNote') : undefined}
      steps={
        campaign
          ? [
              { at: 0, text: t('hero.give.s1') },
              { at: 0.6, text: t(campaign.goal === null ? 'giveLive.hero.tip' : campaign.outcome === 'reached' ? 'giveLive.hero.reached' : campaign.outcome === 'missed' ? 'giveLive.hero.missed' : 'giveLive.hero.open') },
            ]
          : [
              { at: 0, text: t('hero.give.s1') },
              { at: 0.33, text: t('hero.give.s2') },
              { at: 0.5, text: t('hero.give.s3') },
              { at: 0.79, text: t('hero.give.s4') },
            ]
      }
    >
      {(scene) => <GiveScene {...scene} campaign={campaign} />}
    </HeroFrame>
  );
}
