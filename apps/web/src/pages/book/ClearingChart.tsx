import { motion } from 'framer-motion';
import { useRef } from 'react';
import type { EpochClearing, Pair } from '../../data/types';
import { useI18n } from '../../i18n/I18nProvider';
import { formatPrice } from '../../lib/numberFormat';
import { useElementWidth } from '../../lib/useElementWidth';
import { EASE_OUT } from '../../motion/easing';
import { useReducedMotion } from '../../motion/useReducedMotion';
import styles from './Book.module.css';

const H = 220;
const PAD = { left: 8, right: 64, top: 16, bottom: 26 };
const VOL_H = 40;

const toNumber = (value: bigint): number => Number(value / 10n ** 10n) / 1e8;

export interface ClearingChartProps {
  readonly pair: Pair;
  /** Newest first, as returned by `listClearings`. */
  readonly clearings: readonly EpochClearing[];
  readonly bandBps?: number;
}

/**
 * Batch history: clearing prices against the reference band, matched volume
 * underneath. Batches that did not trade are marked on the axis.
 */
export function ClearingChart({ pair, clearings, bandBps = 200 }: ClearingChartProps) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const items = [...clearings].reverse();
  const ref0 = toNumber(pair.referencePrice);
  const band: [number, number] = [ref0 * (1 - bandBps / 10_000), ref0 * (1 + bandBps / 10_000)];
  const prices = items.flatMap((c) => (c.price !== null && c.outcome === 'cleared' ? [toNumber(c.price)] : []));
  const lo = Math.min(band[0], ...prices) * 0.998;
  const hi = Math.max(band[1], ...prices) * 1.002;
  const maxVol = Math.max(1e-9, ...items.map((c) => toNumber(c.volume)));
  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const priceBottom = H - PAD.bottom - VOL_H - 10;
  const x = (i: number): number => PAD.left + (items.length <= 1 ? plotW / 2 : (i * plotW) / (items.length - 1));
  const y = (p: number): number => PAD.top + (1 - (p - lo) / (hi - lo || 1)) * (priceBottom - PAD.top);
  const cleared = items.map((c, i) => ({ c, i })).filter(({ c }) => c.outcome === 'cleared' && c.price !== null);
  const path = cleared.map(({ c, i }, k) => `${k === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(toNumber(c.price ?? 0n)).toFixed(1)}`).join(' ');
  const barW = Math.max(3, Math.min(14, plotW / Math.max(1, items.length) - 6));
  const last = cleared[cleared.length - 1];
  const digits = pair.referencePrice < 10n ** 16n;
  const label = (p: number): string => (digits ? formatPrice(BigInt(Math.round(p * 1e8)) * 10n ** 10n) : p.toFixed(2));
  return (
    <figure className={styles.chart} aria-label={t('book.chart.label')}>
      <div ref={ref} className={styles.chartStage}>
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={t('book.chart.summary', { n: cleared.length, total: items.length })}>
          <rect x={PAD.left} y={y(band[1])} width={plotW} height={Math.max(1, y(band[0]) - y(band[1]))} rx={6} className={styles.chartBand} />
          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(ref0)} y2={y(ref0)} className={styles.chartRef} />
          <text x={PAD.left + plotW + 8} y={y(ref0) + 4} className={styles.chartRefLabel}>
            {label(ref0)}
          </text>
          <text x={PAD.left + plotW + 8} y={y(band[1]) + 4} className={styles.chartAxis}>
            +{bandBps / 100}%
          </text>
          <text x={PAD.left + plotW + 8} y={y(band[0]) + 4} className={styles.chartAxis}>
            −{bandBps / 100}%
          </text>
          {items.map((c, i) => {
            const v = toNumber(c.volume);
            const h = (v / maxVol) * VOL_H;
            return c.outcome === 'cleared' ? (
              <motion.rect
                key={`v-${c.epoch}`}
                x={x(i) - barW / 2}
                width={barW}
                rx={2}
                className={styles.chartVol}
                initial={reduced ? false : { y: H - PAD.bottom, height: 0 }}
                animate={{ y: H - PAD.bottom - h, height: h }}
                transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.2 + i * 0.03 }}
              >
                <title>{`#${c.epoch}`}</title>
              </motion.rect>
            ) : (
              <g key={`v-${c.epoch}`} className={styles.chartMiss} transform={`translate(${x(i).toFixed(1)} ${H - PAD.bottom - 5})`}>
                <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" />
                <title>{t(`book.outcome.${c.outcome}`)}</title>
              </g>
            );
          })}
          <line x1={PAD.left} x2={PAD.left + plotW} y1={H - PAD.bottom} y2={H - PAD.bottom} className={styles.chartBase} />
          {path ? <motion.path d={path} className={styles.chartLine} initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: EASE_OUT }} /> : null}
          {cleared.map(({ c, i }) => (
            <motion.circle
              key={`p-${c.epoch}`}
              cx={x(i)}
              cy={y(toNumber(c.price ?? 0n))}
              r={c === last?.c ? 4.5 : 3}
              className={c === last?.c ? styles.chartDotLast : styles.chartDot}
              initial={reduced ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.3 + i * 0.04 }}
            >
              <title>{`#${c.epoch} · ${label(toNumber(c.price ?? 0n))}`}</title>
            </motion.circle>
          ))}
          <text x={PAD.left} y={H - 6} className={styles.chartAxis}>
            {t('book.chart.older')}
          </text>
          <text x={PAD.left + plotW} y={H - 6} textAnchor="end" className={styles.chartAxis}>
            {t('book.chart.latest')}
          </text>
        </svg>
      </div>
      <figcaption className={styles.chartLegend}>
        <span>
          <i className={styles.legendLine} /> {t('book.chart.price')}
        </span>
        <span>
          <i className={styles.legendBand} /> {t('book.chart.band')}
        </span>
        <span>
          <i className={styles.legendVol} /> {t('book.chart.volume', { base: pair.base })}
        </span>
      </figcaption>
    </figure>
  );
}
